'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  assignQuestionnaireQuestion,
  finaliseQuestionnaire,
  generateQuestionnaireAnswer,
  importQuestionnaire,
  reviewQuestionnaireAnswer,
  saveQuestionnaireAnswer,
  submitQuestionnaireAnswer,
} from '@/app/actions/questionnaires';
import { UserDateTime } from '@/components/timezone/UserTimezone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Classification } from '@/db/schema/enums';
import { CLASSIFICATION_LABELS } from '@/lib/classification/guard';

const CLASSIFICATIONS: Classification[] = [
  'OFFICIAL',
  'OFFICIAL_SENSITIVE',
  'PROTECTED',
  'SECRET',
  'TOP_SECRET',
];

type QuestionnaireSummary = {
  id: string;
  title: string;
  sourceFilename: string;
  sourceFormat: string;
  dataClassification: Classification;
  status: string;
  dueAt: string | null;
  finalisedAt: string | null;
  questionCount: number;
  approvedCount: number;
};
type EvidenceOption = { id: string; filename: string; sha256: string };
type Answer = {
  id: string;
  version: number;
  answerText: string;
  status: string;
  generationSource: string;
  generatorModelId: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerNotes: string | null;
  citations: Array<{
    evidenceItemId: string;
    filename: string;
    sha256: string;
    chunkIndex: number | null;
    excerpt: string | null;
  }>;
};
type Question = {
  id: string;
  externalRef: string | null;
  section: string | null;
  prompt: string;
  sortOrder: number;
  assignedToUserId: string | null;
  answer: Answer | null;
};

export function QuestionnaireWorkspace({
  engagementId,
  workspaceClassification,
  timeZone,
  permissions,
  questionnaires,
  selectedQuestionnaire,
  questions,
  members,
  evidence,
}: {
  engagementId: string;
  workspaceClassification: Classification;
  timeZone: string;
  permissions: { canManage: boolean; canRespond: boolean; canReview: boolean };
  questionnaires: QuestionnaireSummary[];
  selectedQuestionnaire: QuestionnaireSummary | null;
  questions: Question[];
  members: Array<{ id: string; label: string }>;
  evidence: EvidenceOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(task: () => Promise<unknown>, success: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await task();
        setMessage(success);
        router.refresh();
      } catch (cause) {
        setMessage((cause as Error).message);
      }
    });
  }

  function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    run(async () => {
      const result = await importQuestionnaire(formData);
      form.reset();
      router.push(`/engagements/${engagementId}/questionnaires?questionnaire=${result.questionnaireId}`);
    }, 'Questionnaire imported.');
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--oak-shield)]">Questionnaire automation</p>
        <h2 className="text-2xl font-semibold text-slate-950">Answer with evidence, then review</h2>
        <p className="max-w-4xl text-sm leading-6 text-slate-700">
          Import customer questionnaires, assign owners, draft answers from accepted searchable evidence, and require independent human approval before finalisation.
        </p>
        <p className="text-sm text-slate-600">Dates use your saved timezone: <strong>{timeZone}</strong>.</p>
        {message ? <p className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" role="status">{message}</p> : null}
      </header>

      {permissions.canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Import questionnaire</CardTitle>
            <CardDescription>CSV, XLSX, DOCX, or text-based PDF. Maximum 8 MB and 2,000 questions.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onImport} className="grid gap-4 md:grid-cols-2">
              <input type="hidden" name="engagementId" value={engagementId} />
              <label className="space-y-1 text-sm font-medium text-slate-800">
                Title
                <Input name="title" required minLength={3} maxLength={240} placeholder="Customer security questionnaire" />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-800">
                Due date ({timeZone})
                <Input name="dueDate" type="date" />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-800">
                Document classification
                <select name="dataClassification" required defaultValue="" className="h-10 w-full rounded-md border border-[var(--field-border)] bg-white px-3 text-sm">
                  <option value="" disabled>Declare classification</option>
                  {CLASSIFICATIONS.slice(0, CLASSIFICATIONS.indexOf(workspaceClassification) + 1).map((classification) => (
                    <option key={classification} value={classification}>{CLASSIFICATION_LABELS[classification]}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-800">
                Questionnaire file
                <Input name="file" type="file" required accept=".csv,.xlsx,.docx,.pdf,text/csv,application/pdf" />
              </label>
              <p className="md:col-span-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Workspace limit: {CLASSIFICATION_LABELS[workspaceClassification]}. Higher-classified files are blocked because storing them here would breach this workspace boundary.
              </p>
              <div className="md:col-span-2"><Button type="submit" disabled={pending}>{pending ? 'Importing…' : 'Import questions'}</Button></div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Questionnaires</CardTitle>
          <CardDescription>{questionnaires.length} imported questionnaire{questionnaires.length === 1 ? '' : 's'}.</CardDescription>
        </CardHeader>
        <CardContent>
          {questionnaires.length === 0 ? <p className="text-sm text-slate-600">No questionnaires imported.</p> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {questionnaires.map((questionnaire) => (
                <a
                  key={questionnaire.id}
                  href={`/engagements/${engagementId}/questionnaires?questionnaire=${questionnaire.id}`}
                  className={`rounded-lg border p-4 hover:bg-[var(--oak-mist)] ${selectedQuestionnaire?.id === questionnaire.id ? 'border-[var(--oak-shield)] bg-[var(--oak-mist)]' : 'border-[var(--field-border)] bg-white'}`}
                >
                  <p className="font-medium text-slate-950">{questionnaire.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{questionnaire.sourceFormat.toUpperCase()} · {questionnaire.sourceFilename}</p>
                  <p className="mt-2 text-sm text-slate-700">{questionnaire.approvedCount}/{questionnaire.questionCount} approved · {questionnaire.status.replace('_', ' ')}</p>
                  {questionnaire.dueAt ? <p className="mt-1 text-xs text-slate-600">Due <UserDateTime value={questionnaire.dueAt} /></p> : null}
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedQuestionnaire ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{selectedQuestionnaire.title}</CardTitle>
              <CardDescription>
                {selectedQuestionnaire.questionCount} questions · {CLASSIFICATION_LABELS[selectedQuestionnaire.dataClassification]} · {selectedQuestionnaire.status.replace('_', ' ')}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <a href={`/api/engagements/${engagementId}/questionnaires/${selectedQuestionnaire.id}/csv`} className="inline-flex h-9 items-center rounded-md border border-[var(--field-border)] bg-white px-4 text-sm font-medium hover:bg-[var(--oak-mist)]">Export CSV</a>
              {permissions.canManage && selectedQuestionnaire.status !== 'finalised' ? (
                <Button disabled={pending} onClick={() => run(
                  () => finaliseQuestionnaire({ engagementId, questionnaireId: selectedQuestionnaire.id }),
                  'Questionnaire finalised and locked.',
                )}>Finalise approved answers</Button>
              ) : null}
              {selectedQuestionnaire.finalisedAt ? <span className="self-center text-sm text-slate-600">Finalised <UserDateTime value={selectedQuestionnaire.finalisedAt} /></span> : null}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {questions.map((question) => (
              <QuestionCard
                key={`${question.id}:${question.answer?.id ?? 'none'}`}
                engagementId={engagementId}
                question={question}
                members={members}
                evidence={evidence}
                permissions={permissions}
                locked={selectedQuestionnaire.status === 'finalised'}
                pending={pending}
                run={run}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function QuestionCard({
  engagementId,
  question,
  members,
  evidence,
  permissions,
  locked,
  pending,
  run,
}: {
  engagementId: string;
  question: Question;
  members: Array<{ id: string; label: string }>;
  evidence: EvidenceOption[];
  permissions: { canManage: boolean; canRespond: boolean; canReview: boolean };
  locked: boolean;
  pending: boolean;
  run: (task: () => Promise<unknown>, success: string) => void;
}) {
  const [answerText, setAnswerText] = useState(question.answer?.answerText ?? '');
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>(
    question.answer?.citations.map((citation) => citation.evidenceItemId) ?? [],
  );
  const [reviewerNotes, setReviewerNotes] = useState(question.answer?.reviewerNotes ?? '');
  const answer = question.answer;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
              {question.externalRef ?? `Question ${question.sortOrder + 1}`}{question.section ? ` · ${question.section}` : ''}
            </p>
            <CardTitle className="mt-2 text-lg">{question.prompt}</CardTitle>
          </div>
          {permissions.canManage && !locked ? (
            <label className="min-w-56 text-xs font-medium text-slate-700">
              Assigned owner
              <select
                value={question.assignedToUserId ?? ''}
                disabled={pending}
                onChange={(event) => run(
                  () => assignQuestionnaireQuestion({
                    engagementId,
                    questionId: question.id,
                    assignedToUserId: event.target.value || null,
                  }),
                  'Assignment updated.',
                )}
                className="mt-1 h-9 w-full rounded-md border border-[var(--field-border)] bg-white px-2 text-sm"
              >
                <option value="">Unassigned</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {answer ? (
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <span>Version {answer.version}</span><span>·</span><span>{answer.status.replace('_', ' ')}</span><span>·</span><span>{answer.generationSource === 'burl' ? `Burl draft (${answer.generatorModelId})` : 'Human draft'}</span>
            {answer.submittedAt ? <><span>·</span><span>Submitted <UserDateTime value={answer.submittedAt} /></span></> : null}
            {answer.reviewedAt ? <><span>·</span><span>Reviewed <UserDateTime value={answer.reviewedAt} /></span></> : null}
          </div>
        ) : <p className="text-sm text-slate-600">No answer drafted.</p>}

        <Label htmlFor={`answer-${question.id}`}>Answer</Label>
        <textarea
          id={`answer-${question.id}`}
          value={answerText}
          onChange={(event) => setAnswerText(event.target.value)}
          disabled={locked || !permissions.canRespond || answer?.status === 'submitted'}
          rows={5}
          className="w-full rounded-md border border-[var(--field-border)] bg-white px-3 py-2 text-sm text-slate-950 disabled:bg-slate-50"
          placeholder="Draft a factual answer supported by evidence below."
        />

        <fieldset disabled={locked || !permissions.canRespond || answer?.status === 'submitted'}>
          <legend className="text-sm font-medium text-slate-800">Evidence citations</legend>
          {evidence.length === 0 ? <p className="mt-1 text-sm text-amber-800">No accepted, verified evidence available. Upload and approve evidence first.</p> : (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {evidence.map((item) => (
                <label key={item.id} className="flex items-start gap-2 rounded-md border border-[var(--field-border)] bg-white p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedEvidence.includes(item.id)}
                    onChange={(event) => setSelectedEvidence((current) => event.target.checked
                      ? Array.from(new Set([...current, item.id]))
                      : current.filter((id) => id !== item.id))}
                  />
                  <span>{item.filename}<span className="block font-mono text-[11px] text-slate-500">{item.sha256.slice(0, 16)}…</span></span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {answer?.citations.length ? (
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-600">Current answer citations</p>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {answer.citations.map((citation, index) => (
                <li key={`${citation.evidenceItemId}:${citation.chunkIndex ?? 'file'}`}>
                  [{index + 1}] {citation.filename}{citation.chunkIndex === null ? '' : ` · chunk ${citation.chunkIndex + 1}`}
                  {citation.excerpt ? <p className="mt-1 line-clamp-3 text-xs text-slate-600">{citation.excerpt}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!locked && permissions.canRespond ? (
          <div className="flex flex-wrap gap-2">
            {answer?.status !== 'submitted' ? (
              <Button variant="outline" disabled={pending || selectedEvidence.length === 0 || answerText.trim().length < 10} onClick={() => run(
                () => saveQuestionnaireAnswer({ engagementId, questionId: question.id, answerText, evidenceItemIds: selectedEvidence }),
                'New cited draft saved.',
              )}>Save cited draft</Button>
            ) : null}
            {answer?.status !== 'submitted' ? (
              <Button variant="outline" disabled={pending || evidence.length === 0} onClick={() => run(
                () => generateQuestionnaireAnswer({ engagementId, questionId: question.id }),
                'Burl created a cited draft. Review it before submission.',
              )}>Draft with Burl</Button>
            ) : null}
            {answer?.status === 'draft' ? (
              <Button disabled={pending} onClick={() => run(
                () => submitQuestionnaireAnswer({ engagementId, answerId: answer.id }),
                'Answer submitted for independent review.',
              )}>Submit for review</Button>
            ) : null}
          </div>
        ) : null}

        {answer?.reviewerNotes ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Reviewer:</strong> {answer.reviewerNotes}</p> : null}
        {!locked && permissions.canReview && answer?.status === 'submitted' ? (
          <div className="space-y-2 rounded-md border border-[var(--field-border)] p-3">
            <Label htmlFor={`review-${question.id}`}>Review notes</Label>
            <Input id={`review-${question.id}`} value={reviewerNotes} onChange={(event) => setReviewerNotes(event.target.value)} placeholder="Required when requesting changes" />
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending} onClick={() => run(
                () => reviewQuestionnaireAnswer({ engagementId, answerId: answer.id, decision: 'approved', reviewerNotes }),
                'Answer approved.',
              )}>Approve cited answer</Button>
              <Button variant="outline" disabled={pending || !reviewerNotes.trim()} onClick={() => run(
                () => reviewQuestionnaireAnswer({ engagementId, answerId: answer.id, decision: 'changes_requested', reviewerNotes }),
                'Changes requested.',
              )}>Request changes</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
