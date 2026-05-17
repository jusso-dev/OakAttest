'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { recordInterview } from '@/app/actions/interviews';

type Interview = {
  id: string;
  title: string;
  purpose: string | null;
  scheduledAt: Date | null;
  durationMinutes: number | null;
  location: string | null;
  attendees: Array<{ name: string; role?: string; email?: string }> | null;
  notes: string | null;
  observations: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
};

export function InterviewRow({
  engagementId,
  interview,
  canEdit,
}: {
  engagementId: string;
  interview: Interview;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(interview.notes ?? '');
  const [observations, setObservations] = useState(interview.observations ?? '');
  const [busy, setBusy] = useState(false);

  async function save(status: Interview['status'] = 'completed') {
    setBusy(true);
    try {
      await recordInterview({
        engagementId,
        interviewId: interview.id,
        notes,
        observations,
        status,
      });
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{interview.title}</p>
          <p className="text-xs text-slate-600">
            {interview.scheduledAt
              ? new Date(interview.scheduledAt).toLocaleString('en-AU')
              : 'Not scheduled'}
            {interview.durationMinutes ? ` · ${interview.durationMinutes} min` : ''}
            {interview.location ? ` · ${interview.location}` : ''}
          </p>
          {interview.purpose && (
            <p className="mt-2 text-sm text-slate-700">{interview.purpose}</p>
          )}
          {interview.attendees?.length ? (
            <p className="mt-2 text-xs text-slate-600">
              Attendees: {interview.attendees.map((a) => a.name).join(', ')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <span className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-0.5 text-slate-700">
            {interview.status}
          </span>
          <Link
            href={`/api/interviews/${interview.id}/ics`}
            className="text-[var(--oak-shield)] underline"
          >
            Add to calendar
          </Link>
        </div>
      </div>
      {canEdit && !editing && (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}>
          Record notes
        </Button>
      )}
      {canEdit && editing && (
        <div className="mt-3 space-y-2">
          <textarea
            rows={4}
            placeholder="Interview notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
          />
          <textarea
            rows={3}
            placeholder="Observations"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => save('completed')}>
              Save as completed
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => save('cancelled')}>
              Cancel interview
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
