'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { decideApplicability, writeImplementationStatement } from '@/app/actions/applicability';

type ControlRow = {
  id: string;
  controlId: string;
  description: string;
  minClassification: string;
  status: string;
  applicable: string | null;
  justification: string | null;
  implementationStatement: string | null;
};

export function ApplicabilityWorksheet({
  engagementId,
  controls,
  canDecide,
  canWriteStatement,
}: {
  engagementId: string;
  controls: ControlRow[];
  canDecide: boolean;
  canWriteStatement: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const filtered = controls.filter((c) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      c.controlId.toLowerCase().includes(f) ||
      c.description.toLowerCase().includes(f) ||
      c.status.includes(f)
    );
  });

  return (
    <div className="space-y-3">
      <input
        type="search"
        placeholder="Filter by control id, description, or status"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
      />
      <div className="overflow-hidden rounded-md border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2">Control</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Applicable</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <ControlRowView
                key={c.id}
                engagementId={engagementId}
                control={c}
                expanded={expandedId === c.id}
                onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                canDecide={canDecide}
                canWriteStatement={canWriteStatement}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ControlRowView({
  engagementId,
  control,
  expanded,
  onToggle,
  canDecide,
  canWriteStatement,
}: {
  engagementId: string;
  control: ControlRow;
  expanded: boolean;
  onToggle: () => void;
  canDecide: boolean;
  canWriteStatement: boolean;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
        onClick={onToggle}
      >
        <td className="px-3 py-2 font-mono text-xs">{control.controlId}</td>
        <td className="px-3 py-2">
          <StatusPill status={control.status} />
        </td>
        <td className="px-3 py-2 text-slate-600">{control.applicable ?? '—'}</td>
        <td className="px-3 py-2 text-right text-xs text-slate-500">
          {expanded ? 'Hide' : 'Edit'}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-200 bg-slate-50">
          <td colSpan={4} className="px-3 py-4">
            <div className="space-y-4">
              <p className="text-sm text-slate-700">{control.description}</p>
              {canDecide && (
                <DecideForm engagementId={engagementId} control={control} />
              )}
              {canWriteStatement && (
                <StatementForm engagementId={engagementId} control={control} />
              )}
              {control.justification && (
                <p className="text-xs text-slate-500">
                  <strong>Assessor justification:</strong> {control.justification}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'implemented'
      ? 'bg-emerald-100 text-emerald-900'
      : status === 'not_applicable'
        ? 'bg-slate-100 text-slate-700'
        : status === 'evidence_pending'
          ? 'bg-amber-100 text-amber-900'
          : 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function DecideForm({ engagementId, control }: { engagementId: string; control: ControlRow }) {
  const [applicable, setApplicable] = useState<'applicable' | 'not_applicable' | 'compensating'>(
    (control.applicable as never) ?? 'applicable',
  );
  const [justification, setJustification] = useState(control.justification ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      await decideApplicability({
        engagementId,
        engagementControlId: control.id,
        applicable,
        justification,
      });
      setMessage('Saved.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Assessor decision
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
        <select
          value={applicable}
          onChange={(e) => setApplicable(e.target.value as never)}
          className="flex h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          <option value="applicable">Applicable</option>
          <option value="not_applicable">Not applicable</option>
          <option value="compensating">Compensating</option>
        </select>
        <input
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Justification (required)"
          className="flex h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
        />
        <Button size="sm" variant="primary" disabled={busy || justification.length < 10} onClick={submit}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {message && <p className="mt-2 text-xs text-slate-600">{message}</p>}
    </div>
  );
}

function StatementForm({
  engagementId,
  control,
}: {
  engagementId: string;
  control: ControlRow;
}) {
  const [statement, setStatement] = useState(control.implementationStatement ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      await writeImplementationStatement({
        engagementId,
        engagementControlId: control.id,
        statement,
      });
      setMessage('Saved.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Implementation statement (client)
      </p>
      <textarea
        rows={3}
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        placeholder="How this control is implemented for the system in scope…"
        className="mt-2 w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" variant="primary" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save statement'}
        </Button>
        {message && <p className="text-xs text-slate-600">{message}</p>}
      </div>
    </div>
  );
}
