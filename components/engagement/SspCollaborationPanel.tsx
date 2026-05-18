'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  addSspSectionComment,
  saveSspSection,
  updateSspSectionCommentStatus,
} from '@/app/actions/ssp';
import {
  SSP_REVIEW_STATUSES,
  SSP_SECTION_KEYS,
  buildSspCommentThreads,
  hasGeneratedDivergence,
  sectionLabel,
  sspSectionReadiness,
} from '@/lib/ssp/collaboration';

type SectionRow = {
  id: string;
  sectionKey: string;
  content: string;
  autoSummary: string | null;
  reviewStatus: string;
  lastEditedAt: string;
};

type CommentRow = {
  id: string;
  sectionId: string;
  sectionKey: string;
  parentCommentId: string | null;
  body: string;
  status: string;
  authorName: string | null;
  authorEmail: string | null;
  createdAt: string;
};

export function SspCollaborationPanel({
  engagementId,
  sections,
  comments,
}: {
  engagementId: string;
  sections: SectionRow[];
  comments: CommentRow[];
}) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState(sections[0]?.sectionKey ?? 'overview');
  const selected = sections.find((section) => section.sectionKey === selectedKey);
  const [content, setContent] = useState(selected?.content ?? '');
  const [status, setStatus] = useState(selected?.reviewStatus ?? 'draft');
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const readiness = sspSectionReadiness(sections);
  const sectionComments = comments.filter((item) => item.sectionKey === selectedKey);
  const commentThreads = useMemo(
    () =>
      buildSspCommentThreads(
        sectionComments.map((item) => ({
          id: item.id,
          parentCommentId: item.parentCommentId,
          status: item.status,
        })),
      ),
    [sectionComments],
  );

  function selectSection(sectionKey: string) {
    const next = sections.find((section) => section.sectionKey === sectionKey);
    setSelectedKey(sectionKey);
    setContent(next?.content ?? '');
    setStatus(next?.reviewStatus ?? 'draft');
    setMessage(null);
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        await saveSspSection({
          engagementId,
          sectionKey: selectedKey as never,
          content,
          reviewStatus: status as never,
        });
        setMessage('Section saved.');
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Could not save section.');
      }
    });
  }

  function addComment(parentCommentId?: string) {
    if (comment.trim().length < 2) return;
    setMessage(null);
    startTransition(async () => {
      try {
        await addSspSectionComment({
          engagementId,
          sectionKey: selectedKey as never,
          body: comment,
          parentCommentId,
        });
        setComment('');
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Could not add comment.');
      }
    });
  }

  function updateComment(commentId: string, nextStatus: 'open' | 'resolved') {
    startTransition(async () => {
      await updateSspSectionCommentStatus({ engagementId, commentId, status: nextStatus });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!readiness.ready && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          SSP export readiness: {readiness.missing.length} missing section(s),{' '}
          {readiness.notApproved.length} section(s) not approved.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-1">
          {SSP_SECTION_KEYS.map((key) => {
            const section = sections.find((item) => item.sectionKey === key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectSection(key)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  selectedKey === key
                    ? 'border-[var(--oak-border)] bg-[var(--oak-mist)] text-slate-950'
                    : 'border-[var(--field-border)] bg-[var(--panel-surface)] text-slate-700'
                }`}
              >
                <span className="block font-medium">{sectionLabel(key)}</span>
                <span className="text-xs text-slate-600">{section?.reviewStatus ?? 'missing'}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-3">
          {selected && hasGeneratedDivergence(selected) && (
            <p className="rounded-md bg-[var(--oak-mist)] p-2 text-xs text-slate-700">
              This section differs from the latest generated summary.
            </p>
          )}
          <div className="grid gap-2 md:grid-cols-[1fr_190px_auto]">
            <input
              value={sectionLabel(selectedKey)}
              readOnly
              className="h-9 rounded-md border border-[var(--field-border)] bg-slate-50 px-3 text-sm text-slate-700"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
            >
              {SSP_REVIEW_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item.replace('_', ' ')}
                </option>
              ))}
            </select>
            <Button variant="primary" disabled={isPending} onClick={save}>
              {isPending ? 'Saving...' : 'Save section'}
            </Button>
          </div>
          <textarea
            rows={8}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3 text-sm"
          />
          <div className="rounded-md border border-[var(--field-border)] p-3">
            <p className="text-sm font-semibold text-slate-950">Comments</p>
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Add a review comment"
                className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
              />
              <Button variant="outline" disabled={isPending || comment.trim().length < 2} onClick={() => addComment()}>
                Add comment
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {commentThreads.length === 0 ? (
                <p className="text-sm text-slate-600">No comments on this section.</p>
              ) : (
                commentThreads.map((thread) => {
                  const root = sectionComments.find((item) => item.id === thread.id)!;
                  return (
                    <CommentItem
                      key={thread.id}
                      comment={root}
                      replies={thread.replies.map((reply) => sectionComments.find((item) => item.id === reply.id)!)}
                      onStatus={updateComment}
                    />
                  );
                })
              )}
            </div>
          </div>
          {message && <p className="text-sm text-slate-700">{message}</p>}
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  replies,
  onStatus,
}: {
  comment: CommentRow;
  replies: CommentRow[];
  onStatus: (commentId: string, nextStatus: 'open' | 'resolved') => void;
}) {
  return (
    <div className="rounded-md border border-[var(--field-border)] p-2 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-slate-900">{comment.body}</p>
          <p className="mt-1 text-xs text-slate-600">
            {comment.authorName ?? comment.authorEmail ?? 'Unknown'} · {new Date(comment.createdAt).toLocaleString('en-AU')}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onStatus(comment.id, comment.status === 'resolved' ? 'open' : 'resolved')}
        >
          {comment.status === 'resolved' ? 'Reopen' : 'Resolve'}
        </Button>
      </div>
      {replies.length > 0 && (
        <div className="mt-2 border-l border-[var(--field-border)] pl-3">
          {replies.map((reply) => (
            <p key={reply.id} className="text-xs text-slate-700">
              {reply.body}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
