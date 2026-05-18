'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  signOffFinding,
  updateFindingStatus,
  recordFindingRetest,
  acceptFindingRisk,
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
  proofEvidenceItemId: string | null;
  notes: string | null;
};

type Retest = {
  id: string;
  findingId: string;
  method: string;
  result: string;
  notes: string | null;
  evidenceItemIds: string[] | null;
  retestedAt: Date;
};

type RiskAcceptance = {
  id: string;
  findingId: string;
  acceptedByName: string;
  acceptedAt: Date;
  rationale: string;
  residualRiskId: string | null;
};

type LinkedControl = {
  controlId: string;
  chapter: string | null;
  subChapter: string | null;
  description: string;
};

type EvidenceOption = {
  id: string;
  label: string;
  reviewStatus: string;
  usable: boolean;
};

type ResidualRiskOption = {
  id: string;
  title: string;
  accepted: boolean;
};

export function FindingRow({
  engagementId,
  finding,
  remediations,
  retests,
  riskAcceptances,
  evidenceOptions,
  residualRiskOptions,
  canSignOff,
  canUpdate,
  canRemediate,
  controls,
}: {
  engagementId: string;
  finding: Finding;
  remediations: Remediation[];
  retests: Retest[];
  riskAcceptances: RiskAcceptance[];
  evidenceOptions: EvidenceOption[];
  residualRiskOptions: ResidualRiskOption[];
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
            residualRiskOptions={residualRiskOptions}
          />
        )}
        {canUpdate && (
          <RetestForm
            engagementId={engagementId}
            findingId={finding.id}
            evidenceOptions={evidenceOptions}
          />
        )}
        {(retests.length > 0 || riskAcceptances.length > 0) && (
          <FindingClosureHistory
            retests={retests}
            riskAcceptances={riskAcceptances}
            evidenceOptions={evidenceOptions}
            residualRiskOptions={residualRiskOptions}
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
              evidenceOptions={evidenceOptions}
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
  residualRiskOptions,
}: {
  engagementId: string;
  finding: Finding;
  canSignOff: boolean;
  residualRiskOptions: ResidualRiskOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function setStatus(status: Finding['status']) {
    setBusy(true);
    setMessage(null);
    try {
      await updateFindingStatus({ engagementId, findingId: finding.id, status });
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signOff() {
    setBusy(true);
    setMessage(null);
    try {
      await signOffFinding({ engagementId, findingId: finding.id });
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
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
      {finding.type === 'non_conformance' && (
        <RiskAcceptanceForm
          engagementId={engagementId}
          findingId={finding.id}
          residualRiskOptions={residualRiskOptions}
        />
      )}
      {message && <p className="text-xs text-red-700">{message}</p>}
    </div>
  );
}

function RetestForm({
  engagementId,
  findingId,
  evidenceOptions,
}: {
  engagementId: string;
  findingId: string;
  evidenceOptions: EvidenceOption[];
}) {
  const router = useRouter();
  const [method, setMethod] = useState('');
  const [result, setResult] = useState<'passed' | 'failed' | 'partially_remediated'>('passed');
  const [retestedAt, setRetestedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceItemIds, setEvidenceItemIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggleEvidence(id: string) {
    setEvidenceItemIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function submit() {
    if (method.trim().length < 2) return;
    setBusy(true);
    setMessage(null);
    try {
      await recordFindingRetest({
        engagementId,
        findingId,
        method,
        result,
        notes: notes || undefined,
        retestedAt: retestedAt ? new Date(`${retestedAt}T09:00:00.000Z`).toISOString() : undefined,
        evidenceItemIds,
      });
      setMethod('');
      setNotes('');
      setEvidenceItemIds([]);
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
      <p className="text-xs font-medium uppercase text-slate-600">Record retest</p>
      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_180px_160px]">
        <input
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          placeholder="Retest method"
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        />
        <select
          value={result}
          onChange={(event) => setResult(event.target.value as typeof result)}
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        >
          <option value="passed">Passed</option>
          <option value="partially_remediated">Partially remediated</option>
          <option value="failed">Failed</option>
        </select>
        <input
          type="date"
          value={retestedAt}
          onChange={(event) => setRetestedAt(event.target.value)}
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
          aria-label="Retest date"
        />
      </div>
      <textarea
        rows={2}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Retest notes"
        className="mt-2 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
      />
      <EvidenceChecklist
        evidenceOptions={evidenceOptions}
        selectedIds={evidenceItemIds}
        onToggle={toggleEvidence}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        {message && <p className="text-xs text-red-700">{message}</p>}
        <Button size="sm" variant="primary" disabled={busy || method.trim().length < 2} onClick={submit}>
          {busy ? 'Recording…' : 'Record retest'}
        </Button>
      </div>
    </div>
  );
}

function RemediationView({
  engagementId,
  remediation,
  evidenceOptions,
  canEdit,
}: {
  engagementId: string;
  remediation: Remediation;
  evidenceOptions: EvidenceOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [proofEvidenceItemId, setProofEvidenceItemId] = useState(remediation.proofEvidenceItemId ?? '');
  const [notes, setNotes] = useState(remediation.notes ?? '');
  const [message, setMessage] = useState<string | null>(null);
  async function setStatus(status: Remediation['status']) {
    setBusy(true);
    setMessage(null);
    try {
      await updateRemediationAction({
        engagementId,
        remediationActionId: remediation.id,
        status,
        proofEvidenceItemId: proofEvidenceItemId || undefined,
        notes: notes || undefined,
      });
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
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
        <div className="mt-2 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
            <select
              value={proofEvidenceItemId}
              onChange={(event) => setProofEvidenceItemId(event.target.value)}
              className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
              aria-label="Proof evidence"
            >
              <option value="">Proof evidence</option>
              {evidenceOptions.map((option) => (
                <option key={option.id} value={option.id} disabled={!option.usable}>
                  {option.label} · {option.reviewStatus}
                </option>
              ))}
            </select>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Remediation notes"
              className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1">
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
          {message && <p className="text-xs text-red-700">{message}</p>}
        </div>
      )}
    </div>
  );
}

function RiskAcceptanceForm({
  engagementId,
  findingId,
  residualRiskOptions,
}: {
  engagementId: string;
  findingId: string;
  residualRiskOptions: ResidualRiskOption[];
}) {
  const router = useRouter();
  const [acceptedByName, setAcceptedByName] = useState('');
  const [acceptedAt, setAcceptedAt] = useState('');
  const [rationale, setRationale] = useState('');
  const [residualRiskId, setResidualRiskId] = useState(residualRiskOptions[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (!residualRiskId || acceptedByName.trim().length < 2 || rationale.trim().length < 10) return;
    setBusy(true);
    setMessage(null);
    try {
      await acceptFindingRisk({
        engagementId,
        findingId,
        acceptedByName,
        acceptedAt: acceptedAt ? new Date(`${acceptedAt}T09:00:00.000Z`).toISOString() : new Date().toISOString(),
        rationale,
        residualRiskId,
      });
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
      <p className="text-xs font-medium uppercase text-slate-600">Accepted risk path</p>
      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_180px_1fr]">
        <input
          value={acceptedByName}
          onChange={(event) => setAcceptedByName(event.target.value)}
          placeholder="Acceptance owner"
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        />
        <input
          type="date"
          value={acceptedAt}
          onChange={(event) => setAcceptedAt(event.target.value)}
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
          aria-label="Accepted date"
        />
        <select
          value={residualRiskId}
          onChange={(event) => setResidualRiskId(event.target.value)}
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        >
          <option value="">Residual risk</option>
          {residualRiskOptions.map((risk) => (
            <option key={risk.id} value={risk.id}>
              {risk.title}
              {risk.accepted ? ' · accepted' : ''}
            </option>
          ))}
        </select>
      </div>
      <textarea
        rows={2}
        value={rationale}
        onChange={(event) => setRationale(event.target.value)}
        placeholder="Acceptance rationale"
        className="mt-2 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        {message && <p className="text-xs text-red-700">{message}</p>}
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !residualRiskId || acceptedByName.trim().length < 2 || rationale.trim().length < 10}
          onClick={submit}
        >
          {busy ? 'Recording…' : 'Accept risk'}
        </Button>
      </div>
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

function EvidenceChecklist({
  evidenceOptions,
  selectedIds,
  onToggle,
}: {
  evidenceOptions: EvidenceOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (evidenceOptions.length === 0) {
    return <p className="mt-2 text-xs text-slate-600">No evidence has been uploaded yet.</p>;
  }

  return (
    <div className="mt-2 grid gap-1 sm:grid-cols-2">
      {evidenceOptions.map((option) => (
        <label key={option.id} className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={selectedIds.includes(option.id)}
            disabled={!option.usable}
            onChange={() => onToggle(option.id)}
          />
          <span className={option.usable ? '' : 'text-slate-400'}>
            {option.label} · {option.reviewStatus}
          </span>
        </label>
      ))}
    </div>
  );
}

function FindingClosureHistory({
  retests,
  riskAcceptances,
  evidenceOptions,
  residualRiskOptions,
}: {
  retests: Retest[];
  riskAcceptances: RiskAcceptance[];
  evidenceOptions: EvidenceOption[];
  residualRiskOptions: ResidualRiskOption[];
}) {
  const evidenceLabels = new Map(evidenceOptions.map((option) => [option.id, option.label]));
  const riskLabels = new Map(residualRiskOptions.map((risk) => [risk.id, risk.title]));

  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3 text-sm">
      <p className="text-xs font-medium uppercase text-slate-600">Retest and closure history</p>
      {retests.map((retest) => (
        <div key={retest.id} className="mt-2 rounded border border-[var(--field-border)] p-2">
          <p className="font-medium text-slate-900">
            {retest.result.replace(/_/g, ' ')} · {new Date(retest.retestedAt).toLocaleDateString('en-AU')}
          </p>
          <p className="mt-1 text-slate-700">{retest.method}</p>
          {retest.notes && <p className="mt-1 text-xs text-slate-600">{retest.notes}</p>}
          {(retest.evidenceItemIds?.length ?? 0) > 0 && (
            <p className="mt-1 text-xs text-slate-600">
              Evidence: {retest.evidenceItemIds?.map((id) => evidenceLabels.get(id) ?? id).join(', ')}
            </p>
          )}
        </div>
      ))}
      {riskAcceptances.map((acceptance) => (
        <div key={acceptance.id} className="mt-2 rounded border border-[var(--field-border)] p-2">
          <p className="font-medium text-slate-900">
            Accepted by {acceptance.acceptedByName} · {new Date(acceptance.acceptedAt).toLocaleDateString('en-AU')}
          </p>
          <p className="mt-1 text-slate-700">{acceptance.rationale}</p>
          {acceptance.residualRiskId && (
            <p className="mt-1 text-xs text-slate-600">
              Residual risk: {riskLabels.get(acceptance.residualRiskId) ?? acceptance.residualRiskId}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
