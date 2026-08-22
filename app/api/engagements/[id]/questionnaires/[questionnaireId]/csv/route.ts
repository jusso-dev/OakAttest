import { NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { auditLog } from '@/db/schema/audit';
import {
  questionnaireAnswerCitations,
  questionnaireAnswers,
  questionnaireQuestions,
  questionnaires,
} from '@/db/schema/questionnaires';
import { users } from '@/db/schema/auth';
import { requireSession } from '@/lib/auth/session';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { db } from '@/lib/db/client';
import { ACTIONS } from '@/lib/rbac/matrix';
import { requirePermission } from '@/lib/rbac/require';
import { formatDateTime } from '@/lib/timezone';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; questionnaireId: string }> },
) {
  const session = await requireSession();
  const { id: engagementId, questionnaireId } = await params;
  const [questionnaire] = await db.select().from(questionnaires).where(and(
    eq(questionnaires.id, questionnaireId),
    eq(questionnaires.engagementId, engagementId),
  )).limit(1);
  if (!questionnaire) return new NextResponse('Not found', { status: 404 });
  await requirePermission(ACTIONS.questionnaireView, {
    userId: session.user.id,
    tenantId: questionnaire.tenantId,
    engagementId,
  });

  const questions = await db.select({
    id: questionnaireQuestions.id,
    externalRef: questionnaireQuestions.externalRef,
    section: questionnaireQuestions.section,
    prompt: questionnaireQuestions.prompt,
    sortOrder: questionnaireQuestions.sortOrder,
    assignedToName: users.name,
    assignedToEmail: users.email,
  }).from(questionnaireQuestions)
    .leftJoin(users, eq(users.id, questionnaireQuestions.assignedToUserId))
    .where(and(
      eq(questionnaireQuestions.questionnaireId, questionnaireId),
      eq(questionnaireQuestions.tenantId, questionnaire.tenantId),
      eq(questionnaireQuestions.engagementId, engagementId),
    ))
    .orderBy(asc(questionnaireQuestions.sortOrder));
  const answers = questions.length === 0 ? [] : await db.select().from(questionnaireAnswers).where(and(
    eq(questionnaireAnswers.questionnaireId, questionnaireId),
    eq(questionnaireAnswers.tenantId, questionnaire.tenantId),
    eq(questionnaireAnswers.engagementId, engagementId),
    inArray(questionnaireAnswers.questionId, questions.map((question) => question.id)),
  )).orderBy(desc(questionnaireAnswers.version));
  const latest = new Map<string, typeof answers[number]>();
  answers.forEach((answer) => { if (!latest.has(answer.questionId)) latest.set(answer.questionId, answer); });
  const latestAnswers = Array.from(latest.values());
  const citations = latestAnswers.length === 0 ? [] : await db.select().from(questionnaireAnswerCitations).where(and(
    eq(questionnaireAnswerCitations.tenantId, questionnaire.tenantId),
    eq(questionnaireAnswerCitations.engagementId, engagementId),
    inArray(questionnaireAnswerCitations.answerId, latestAnswers.map((answer) => answer.id)),
  ));
  const timeZone = await userTimeZone(session.user.id);
  const headers = [
    'reference',
    'section',
    'question',
    'assignedTo',
    'answerStatus',
    'answerVersion',
    'answerSource',
    'answer',
    'evidenceCitations',
    `submittedAt (${timeZone})`,
    `reviewedAt (${timeZone})`,
    'reviewerNotes',
  ];
  const rows = questions.map((question) => {
    const answer = latest.get(question.id);
    const sources = answer
      ? citations.filter((citation) => citation.answerId === answer.id).map((citation) =>
          `${citation.filenameSnapshot} sha256:${citation.sourceSha256}${citation.chunkIndex === null ? '' : ` chunk:${citation.chunkIndex + 1}`}`,
        ).join('; ')
      : '';
    return [
      question.externalRef ?? '',
      question.section ?? '',
      question.prompt,
      question.assignedToName ?? question.assignedToEmail ?? '',
      answer?.status ?? 'unanswered',
      answer ? String(answer.version) : '',
      answer?.generationSource ?? '',
      answer?.answerText ?? '',
      sources,
      answer?.submittedAt ? formatDateTime(answer.submittedAt, timeZone) : '',
      answer?.reviewedAt ? formatDateTime(answer.reviewedAt, timeZone) : '',
      answer?.reviewerNotes ?? '',
    ];
  });
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');

  await db.insert(auditLog).values({
    tenantId: questionnaire.tenantId,
    engagementId,
    actorUserId: session.user.id,
    action: 'questionnaire.export.csv',
    resourceType: 'questionnaire',
    resourceId: questionnaireId,
    afterJson: { status: questionnaire.status, questionCount: questions.length, timeZone } as never,
  });
  const filename = `${questionnaire.title.replace(/[^a-z0-9]+/gi, '_') || 'questionnaire'}.csv`;
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

function csvCell(value: string) {
  const formulaSafe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(formulaSafe) ? `"${formulaSafe.replace(/"/g, '""')}"` : formulaSafe;
}
