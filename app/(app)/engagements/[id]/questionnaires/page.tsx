import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { users } from '@/db/schema/auth';
import { engagements } from '@/db/schema/engagements';
import { evidenceItems } from '@/db/schema/evidence';
import {
  questionnaireAnswerCitations,
  questionnaireAnswers,
  questionnaireQuestions,
  questionnaires,
} from '@/db/schema/questionnaires';
import { engagementMembers, tenantMembers } from '@/db/schema/tenants';
import { QuestionnaireWorkspace } from '@/components/questionnaires/QuestionnaireWorkspace';
import { requirePageSession } from '@/lib/auth/session';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { classificationAllowed } from '@/lib/classification/guard';
import { db } from '@/lib/db/client';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import { requirePermission, rolesForUser } from '@/lib/rbac/require';

export default async function QuestionnairesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ questionnaire?: string }>;
}) {
  const { id: engagementId } = await params;
  const query = await searchParams;
  const session = await requirePageSession();
  const [engagement] = await db.select({
    tenantId: engagements.tenantId,
    classification: engagements.classification,
  }).from(engagements).where(eq(engagements.id, engagementId)).limit(1);
  if (!engagement) throw new Error('Engagement not found.');
  await requirePermission(ACTIONS.questionnaireView, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId,
  });

  const [roles, timeZone, questionnaireRows, tenantMemberRows, engagementMemberRows, evidenceRows] = await Promise.all([
    rolesForUser({ userId: session.user.id, tenantId: engagement.tenantId, engagementId }),
    userTimeZone(session.user.id),
    db.select().from(questionnaires).where(and(
      eq(questionnaires.tenantId, engagement.tenantId),
      eq(questionnaires.engagementId, engagementId),
    )).orderBy(desc(questionnaires.createdAt)),
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(tenantMembers)
      .innerJoin(users, eq(users.id, tenantMembers.userId))
      .where(and(eq(tenantMembers.tenantId, engagement.tenantId), isNull(tenantMembers.deletedAt))),
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(engagementMembers)
      .innerJoin(users, eq(users.id, engagementMembers.userId))
      .where(and(
        eq(engagementMembers.tenantId, engagement.tenantId),
        eq(engagementMembers.engagementId, engagementId),
        isNull(engagementMembers.deletedAt),
      )),
    db.select({
      id: evidenceItems.id,
      filename: evidenceItems.filename,
      sha256: evidenceItems.sha256,
      dataClassification: evidenceItems.dataClassification,
    }).from(evidenceItems).where(and(
      eq(evidenceItems.tenantId, engagement.tenantId),
      eq(evidenceItems.engagementId, engagementId),
      eq(evidenceItems.reviewStatus, 'accepted'),
      isNotNull(evidenceItems.storageVerifiedAt),
      isNull(evidenceItems.quarantinedAt),
    )).orderBy(desc(evidenceItems.uploadedAt)),
  ]);

  const allQuestions = questionnaireRows.length === 0 ? [] : await db.select({
    id: questionnaireQuestions.id,
    questionnaireId: questionnaireQuestions.questionnaireId,
  }).from(questionnaireQuestions).where(and(
    eq(questionnaireQuestions.tenantId, engagement.tenantId),
    eq(questionnaireQuestions.engagementId, engagementId),
    inArray(questionnaireQuestions.questionnaireId, questionnaireRows.map((questionnaire) => questionnaire.id)),
  ));
  const allAnswers = allQuestions.length === 0 ? [] : await db.select({
    questionId: questionnaireAnswers.questionId,
    status: questionnaireAnswers.status,
    version: questionnaireAnswers.version,
  }).from(questionnaireAnswers).where(and(
    eq(questionnaireAnswers.tenantId, engagement.tenantId),
    eq(questionnaireAnswers.engagementId, engagementId),
    inArray(questionnaireAnswers.questionId, allQuestions.map((question) => question.id)),
  )).orderBy(desc(questionnaireAnswers.version));
  const latestStatus = new Map<string, string>();
  allAnswers.forEach((answer) => { if (!latestStatus.has(answer.questionId)) latestStatus.set(answer.questionId, answer.status); });
  const summaries = questionnaireRows.map((questionnaire) => {
    const questionIds = allQuestions.filter((question) => question.questionnaireId === questionnaire.id).map((question) => question.id);
    return {
      id: questionnaire.id,
      title: questionnaire.title,
      sourceFilename: questionnaire.sourceFilename,
      sourceFormat: questionnaire.sourceFormat,
      dataClassification: questionnaire.dataClassification,
      status: questionnaire.status,
      dueAt: questionnaire.dueAt?.toISOString() ?? null,
      finalisedAt: questionnaire.finalisedAt?.toISOString() ?? null,
      questionCount: questionIds.length,
      approvedCount: questionIds.filter((id) => latestStatus.get(id) === 'approved').length,
    };
  });
  const selected = summaries.find((questionnaire) => questionnaire.id === query.questionnaire) ?? summaries[0] ?? null;

  const questionRows = selected ? await db.select().from(questionnaireQuestions).where(and(
    eq(questionnaireQuestions.questionnaireId, selected.id),
    eq(questionnaireQuestions.tenantId, engagement.tenantId),
    eq(questionnaireQuestions.engagementId, engagementId),
  )).orderBy(asc(questionnaireQuestions.sortOrder)) : [];
  const answerRows = questionRows.length === 0 ? [] : await db.select().from(questionnaireAnswers).where(and(
    eq(questionnaireAnswers.questionnaireId, selected!.id),
    eq(questionnaireAnswers.tenantId, engagement.tenantId),
    eq(questionnaireAnswers.engagementId, engagementId),
    inArray(questionnaireAnswers.questionId, questionRows.map((question) => question.id)),
  )).orderBy(desc(questionnaireAnswers.version));
  const latestAnswers = new Map<string, typeof answerRows[number]>();
  answerRows.forEach((answer) => { if (!latestAnswers.has(answer.questionId)) latestAnswers.set(answer.questionId, answer); });
  const currentAnswers = Array.from(latestAnswers.values());
  const citationRows = currentAnswers.length === 0 ? [] : await db.select().from(questionnaireAnswerCitations).where(and(
    eq(questionnaireAnswerCitations.tenantId, engagement.tenantId),
    eq(questionnaireAnswerCitations.engagementId, engagementId),
    inArray(questionnaireAnswerCitations.answerId, currentAnswers.map((answer) => answer.id)),
  )).orderBy(asc(questionnaireAnswerCitations.createdAt));

  const memberMap = new Map<string, { id: string; label: string }>();
  [...tenantMemberRows, ...engagementMemberRows].forEach((member) => memberMap.set(member.id, {
    id: member.id,
    label: member.name ? `${member.name} (${member.email})` : member.email,
  }));
  const permissions = {
    canManage: roles.some((role) => isPermitted(ACTIONS.questionnaireManage, role)),
    canRespond: roles.some((role) => isPermitted(ACTIONS.questionnaireRespond, role)),
    canReview: roles.some((role) => isPermitted(ACTIONS.questionnaireReview, role)),
  };

  return <QuestionnaireWorkspace
    engagementId={engagementId}
    workspaceClassification={engagement.classification}
    timeZone={timeZone}
    permissions={permissions}
    questionnaires={summaries}
    selectedQuestionnaire={selected}
    members={Array.from(memberMap.values()).sort((a, b) => a.label.localeCompare(b.label))}
    evidence={evidenceRows.filter((item) => classificationAllowed(engagement.classification, item.dataClassification)).map((item) => ({
      id: item.id,
      filename: item.filename,
      sha256: item.sha256,
    }))}
    questions={questionRows.map((question) => {
      const answer = latestAnswers.get(question.id);
      return {
        id: question.id,
        externalRef: question.externalRef,
        section: question.section,
        prompt: question.prompt,
        sortOrder: question.sortOrder,
        assignedToUserId: question.assignedToUserId,
        answer: answer ? {
          id: answer.id,
          version: answer.version,
          answerText: answer.answerText,
          status: answer.status,
          generationSource: answer.generationSource,
          generatorModelId: answer.generatorModelId,
          submittedAt: answer.submittedAt?.toISOString() ?? null,
          reviewedAt: answer.reviewedAt?.toISOString() ?? null,
          reviewerNotes: answer.reviewerNotes,
          citations: citationRows.filter((citation) => citation.answerId === answer.id).map((citation) => ({
            evidenceItemId: citation.evidenceItemId,
            filename: citation.filenameSnapshot,
            sha256: citation.sourceSha256,
            chunkIndex: citation.chunkIndex,
            excerpt: citation.excerpt,
          })),
        } : null,
      };
    })}
  />;
}
