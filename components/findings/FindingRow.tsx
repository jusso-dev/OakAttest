'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  signOffFinding,
  updateFindingStatus,
  createRemediationAction,
  updateRemediationAction,
} from '@/app/actions/findings';

type Finding = {
  id: string;
  code: string;
  type: 'non_conformance' | 'observation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  recommendation: string | null;
  status: 'open' | 'in_progress' | 'awaiting_retest' | 'closed' | 'accepted_risk';
  signedOffAt: Date | null;
};

type Remediation = {
  id: string;
  findingId: string;
  description: string;
  ownerName: string | null;
  ownerEmail: string | null;
  dueDate: Date | null;
  status: 'open' | 'in_progress' | 'ready_for_retest' | 'closed';
  notes: string | null;
};

type LinkedControl = {
  controlId: string;
  chapter: string | null;
  subChapter: string | null;
  description: string;
};

export function FindingRow({
  engagementId,
  finding,
  remediations,
  canSignOff,
  canUpdate,
  canRemediate,
  controls,
}: {
  engagementId: string;
  finding: Finding;
  remediations: Remediation[];
  canSignOff: boolean;
  canUpdate: boolean;
  canRemediate: boolean;
  controls: LinkedControl[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>
              <span className="font-mono text-sm text-slate-600">{finding.code}</span>{' '}
              {finding.title}
            </CardTitle>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <Tag tone={finding.type === 'non_conformance' ? 'red' : 'amber'}>
                {finding.type.replace('_', ' ')}
              </Tag>
              <Tag tone="slate">{finding.severity}</Tag>
              <Tag tone="slate">{finding.status.replace(/_/g, ' ')}</Tag>
              {finding.signedOffAt && <Tag tone="teal">signed off</Tag>}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{finding.description}</p>
        {controls.length > 0 && (
          <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
            <p className="text-xs font-medium uppercase text-slate-600">Linked ISM controls</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {controls.map((control) => (
                <span
                  key={`${finding.id}-${control.controlId}`}
                  className="inline-flex max-w-full flex-col rounded-md bg-[var(--oak-mist-strong)] px-2 py-1 text-xs text-slate-800"
                  title={control.description}
                >
                  <span className="font-mono font-medium text-slate-950">{control.controlId}</span>
                  <span>{[control.chapter, control.subChapter].filter(Boolean).join(' / ')}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {canUpdate && (
          <FindingActions
            engagementId={engagementId}
            finding={finding}
            canSignOff={canSignOff}
          />
        )}
        <div className="rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-3">
          <p className="text-xs font-medium uppercase text-slate-600">
            Remediation actions ({remediations.length})
          </p>
          {remediations.map((r) => (
            <RemediationView
              key={r.id}
              engagementId={engagementId}
              remediation={r}
              canEdit={canRemediate}
            />
          ))}
          {canRemediate && (
            <NewRemediationForm engagementId={engagementId} findingId={finding.id} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Tag({ tone, children }: { tone: 'red' | 'amber' | 'slate' | 'teal'; children: React.ReactNode }) {
  const colour = {
    red: 'bg-red-100 text-red-900',
    amber: 'bg-amber-100 text-amber-900',
    slate: 'bg-[var(--oak-mist-strong)] text-slate-700',
    teal: 'bg-[var(--oak-mist-strong)] text-[var(--oak-shield)]',
  }[tone];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${colour}`}>{children}</span>
  );
}

function FindingActions({
  engagementId,
  finding,
  canSignOff,
}: {
  engagementId: string;
  finding: Finding;
  canSignOff: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function setStatus(status: Finding['status']) {
    setBusy(true);
    await updateFindingStatus({ engagementId, findingId: finding.id, status });
    setBusy(false);
    router.refresh();
  }
  async function signOff() {
    setBusy(true);
    await signOffFinding({ engagementId, findingId: finding.id });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus('in_progress')}>
        Mark in progress
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus('awaiting_retest')}>
        Awaiting retest
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus('closed')}>
        Close
      </Button>
      {canSignOff && !finding.signedOffAt && (
        <Button size="sm" variant="primary" disabled={busy} onClick={signOff}>
          Sign off
        </Button>
      )}
    </div>
  );
}

function RemediationView({
  engagementId,
  remediation,
  canEdit,
}: {
  engagementId: string;
  remediation: Remediation;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function setStatus(status: Remediation['status']) {
    setBusy(true);
    await updateRemediationAction({
      engagementId,
      remediationActionId: remediation.id,
      status,
    });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="mt-2 rounded border border-[var(--field-border)] bg-[var(--panel-surface)] p-3 text-sm">
      <p className="text-slate-900">{remediation.description}</p>
      <p className="mt-1 text-xs text-slate-600">
        {remediation.ownerName ?? 'Unassigned'}
        {remediation.dueDate
          ? ` · due ${new Date(remediation.dueDate).toLocaleDateString('en-AU')}`
          : ''}{' '}
        · status {remediation.status.replace(/_/g, ' ')}
      </p>
      {canEdit && (
        <div className="mt-2 flex gap-1">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus('in_progress')}>
            In progress
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus('ready_for_retest')}>
            Ready for retest
          </Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => setStatus('closed')}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

function NewRemediationForm({
  engagementId,
  findingId,
}: {
  engagementId: string;
  findingId: string;
}) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (description.trim().length < 2) return;
    setBusy(true);
    try {
      await createRemediationAction({
        engagementId,
        findingId,
        description,
        ownerName: owner || undefined,
        dueDate: due ? new Date(due).toISOString() : undefined,
      });
      setDescription('');
      setOwner('');
      setDue('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 space-y-2">
      <textarea
        rows={2}
        placeholder="Describe the remediation step…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
      />
      <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Owner name"
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        />
        <Button size="sm" variant="primary" disabled={busy} onClick={submit}>
          Add action
        </Button>
      </div>
    </div>
  );
}
