'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  bulkDecideApplicabilityControls,
  bulkRemoveApplicabilityControls,
  decideApplicability,
  updateControlAssessmentRecord,
  writeImplementationStatement,
} from '@/app/actions/applicability';
import { useUnsavedChanges } from '@/components/engagement/UnsavedChangesGuard';

type ControlRow = {
  id: string;
  controlId: string;
  description: string;
  chapter: string | null;
  subChapter: string | null;
  minClassification: string;
  status: string;
  applicable: string | null;
  justification: string | null;
  implementationStatement: string | null;
  assessmentMethods: string | null;
  assessmentObjects: string | null;
  evidenceQuality: string | null;
  evidenceLimitations: string | null;
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
  const [rows, setRows] = useState(controls);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [subChapterFilter, setSubChapterFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'in_progress' | 'not_in_progress' | string
  >('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkApplicable, setBulkApplicable] = useState<
    'applicable' | 'not_applicable' | 'compensating'
  >('applicable');
  const [bulkJustification, setBulkJustification] = useState('');

  const chapters = Array.from(new Set(rows.map((c) => c.chapter).filter(Boolean))).sort();
  const statuses = Array.from(new Set(rows.map((c) => c.status))).sort();
  const subChapters = Array.from(
    new Set(
      rows
        .filter((c) => !chapterFilter || c.chapter === chapterFilter)
        .map((c) => c.subChapter)
        .filter(Boolean),
    ),
  ).sort();

  const filtered = rows.filter((c) => {
    if (chapterFilter && c.chapter !== chapterFilter) return false;
    if (subChapterFilter && c.subChapter !== subChapterFilter) return false;
    if (statusFilter === 'in_progress' && c.status !== 'in_progress') return false;
    if (statusFilter === 'not_in_progress' && c.status === 'in_progress') return false;
    if (
      statusFilter !== 'all' &&
      statusFilter !== 'in_progress' &&
      statusFilter !== 'not_in_progress' &&
      c.status !== statusFilter
    ) {
      return false;
    }
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      c.controlId.toLowerCase().includes(f) ||
      c.description.toLowerCase().includes(f) ||
      (c.chapter ?? '').toLowerCase().includes(f) ||
      (c.subChapter ?? '').toLowerCase().includes(f) ||
      c.status.includes(f)
    );
  });
  const filteredIds = filtered.map((c) => c.id);
  const selectedInFilter = selectedIds.filter((id) => filteredIds.includes(id));
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function toggleAllFiltered() {
    setSelectedIds((current) => {
      if (allFilteredSelected) {
        return current.filter((id) => !filteredIds.includes(id));
      }
      return Array.from(new Set([...current, ...filteredIds]));
    });
  }

  async function bulkRemove() {
    const ids = selectedInFilter;
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Remove ${ids.length} selected control${ids.length === 1 ? '' : 's'} from this applicability worksheet?`,
    );
    if (!ok) return;

    setBulkBusy(true);
    setBulkMessage(null);
    try {
      const result = await bulkRemoveApplicabilityControls({
        engagementId,
        engagementControlIds: ids,
      });
      setRows((current) => current.filter((row) => !ids.includes(row.id)));
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setExpandedId((current) => (current && ids.includes(current) ? null : current));
      setBulkMessage(`Removed ${result.removed} control${result.removed === 1 ? '' : 's'}.`);
    } catch (err) {
      setBulkMessage((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDecide() {
    const ids = selectedInFilter;
    if (ids.length === 0 || bulkJustification.trim().length < 10) return;

    setBulkBusy(true);
    setBulkMessage(null);
    try {
      const result = await bulkDecideApplicabilityControls({
        engagementId,
        engagementControlIds: ids,
        applicable: bulkApplicable,
        justification: bulkJustification,
      });
      setRows((current) =>
        current.map((row) =>
          ids.includes(row.id)
            ? {
                ...row,
                applicable: bulkApplicable,
                justification: bulkJustification,
                status: bulkApplicable === 'not_applicable' ? 'not_applicable' : 'in_progress',
              }
            : row,
        ),
      );
      setSelectedIds([]);
      setBulkModalOpen(false);
      setBulkJustification('');
      setBulkMessage(`Updated ${result.updated} control${result.updated === 1 ? '' : 's'}.`);
    } catch (err) {
      setBulkMessage((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 xl:grid-cols-[1fr_200px_200px_200px]">
        <input
          type="search"
          placeholder="Filter by control id, chapter, sub-chapter, description, or status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        />
        <select
          value={chapterFilter}
          onChange={(e) => {
            setChapterFilter(e.target.value);
            setSubChapterFilter('');
          }}
          className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        >
          <option value="">All chapters</option>
          {chapters.map((chapter) => (
            <option key={chapter} value={chapter ?? ''}>
              {chapter}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="in_progress">In progress only</option>
          <option value="not_in_progress">Not in progress</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <select
          value={subChapterFilter}
          onChange={(e) => setSubChapterFilter(e.target.value)}
          className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        >
          <option value="">All sub-chapters</option>
          {subChapters.map((subChapter) => (
            <option key={subChapter} value={subChapter ?? ''}>
              {subChapter}
            </option>
          ))}
        </select>
      </div>
      {canDecide && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] px-3 py-2">
          <p className="text-sm text-slate-800">
            {selectedInFilter.length} selected from {filtered.length} visible controls
          </p>
          <Button
            size="sm"
            variant="primary"
            disabled={bulkBusy || selectedInFilter.length === 0}
            onClick={() => setBulkModalOpen(true)}
          >
            Mark selected
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={bulkBusy || selectedInFilter.length === 0}
            onClick={bulkRemove}
          >
            {bulkBusy ? 'Removing…' : 'Remove selected'}
          </Button>
          {bulkMessage && <p className="text-xs text-slate-700">{bulkMessage}</p>}
        </div>
      )}
      <div className="overflow-hidden rounded-md border border-[var(--field-border)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--oak-mist)]">
            <tr className="text-left text-xs uppercase text-slate-600">
              {canDecide && (
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    aria-label="Select all visible controls"
                  />
                </th>
              )}
              <th className="px-3 py-2">Control</th>
              <th className="px-3 py-2">Chapter</th>
              <th className="px-3 py-2">Sub-chapter</th>
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
                selectable={canDecide}
                selected={selectedIds.includes(c.id)}
                onSelectedChange={() => toggleSelected(c.id)}
                canDecide={canDecide}
                canWriteStatement={canWriteStatement}
              />
            ))}
          </tbody>
        </table>
      </div>
      {bulkModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulkApplicabilityTitle"
        >
          <div className="w-full max-w-lg rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-5 shadow-xl">
            <h2 id="bulkApplicabilityTitle" className="text-base font-semibold text-slate-950">
              Mark selected controls
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Apply one assessor decision and justification to {selectedInFilter.length} selected
              control{selectedInFilter.length === 1 ? '' : 's'}.
            </p>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bulkApplicable">Decision</Label>
                <select
                  id="bulkApplicable"
                  value={bulkApplicable}
                  onChange={(e) => setBulkApplicable(e.target.value as never)}
                  className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
                >
                  <option value="applicable">Applicable</option>
                  <option value="not_applicable">Not applicable</option>
                  <option value="compensating">Compensating</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulkJustification">Shared justification</Label>
                <textarea
                  id="bulkJustification"
                  rows={4}
                  value={bulkJustification}
                  onChange={(e) => setBulkJustification(e.target.value)}
                  className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
                  placeholder="Explain why this decision applies to all selected controls."
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkModalOpen(false)}
                disabled={bulkBusy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={bulkDecide}
                disabled={bulkBusy || bulkJustification.trim().length < 10}
              >
                {bulkBusy ? 'Saving…' : 'Apply decision'}
              </Button>
            </div>
          </div>
        </div>
      )}
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
  selectable,
  selected,
  onSelectedChange,
}: {
  engagementId: string;
  control: ControlRow;
  expanded: boolean;
  onToggle: () => void;
  canDecide: boolean;
  canWriteStatement: boolean;
  selectable: boolean;
  selected: boolean;
  onSelectedChange: () => void;
}) {
  const colSpan = selectable ? 7 : 6;
  return (
    <>
      <tr
        className="cursor-pointer border-b border-[var(--field-border)] hover:bg-[var(--oak-mist)]"
        onClick={onToggle}
      >
        {selectable && (
          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              onChange={onSelectedChange}
              aria-label={`Select ${control.controlId}`}
            />
          </td>
        )}
        <td className="px-3 py-2 font-mono text-xs">{control.controlId}</td>
        <td className="px-3 py-2 text-slate-700">{control.chapter ?? '—'}</td>
        <td className="px-3 py-2 text-slate-700">{control.subChapter ?? '—'}</td>
        <td className="px-3 py-2">
          <StatusPill status={control.status} />
        </td>
        <td className="px-3 py-2 text-slate-600">{control.applicable ?? '—'}</td>
        <td className="px-3 py-2 text-right text-xs text-slate-600">
          {expanded ? 'Hide' : 'Edit'}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[var(--field-border)] bg-[var(--oak-mist)]">
          <td colSpan={colSpan} className="px-3 py-4">
            <div className="space-y-4">
              <div className="grid gap-2 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3 text-xs text-slate-700 sm:grid-cols-3">
                <p>
                  <span className="font-medium text-slate-900">Chapter:</span>{' '}
                  {control.chapter ?? 'Unmapped'}
                </p>
                <p>
                  <span className="font-medium text-slate-900">Sub-chapter:</span>{' '}
                  {control.subChapter ?? 'Unmapped'}
                </p>
                <p>
                  <span className="font-medium text-slate-900">Minimum classification:</span>{' '}
                  {control.minClassification.replace(/_/g, ' ')}
                </p>
              </div>
              <p className="text-sm text-slate-700">{control.description}</p>
              {canDecide && (
                <>
                  <DecideForm engagementId={engagementId} control={control} />
                  <AssessmentRecordForm engagementId={engagementId} control={control} />
                </>
              )}
              {canWriteStatement && (
                <StatementForm engagementId={engagementId} control={control} />
              )}
              {control.justification && (
                <p className="text-xs text-slate-600">
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

function AssessmentRecordForm({
  engagementId,
  control,
}: {
  engagementId: string;
  control: ControlRow;
}) {
  const [methods, setMethods] = useState(control.assessmentMethods ?? '');
  const [objects, setObjects] = useState(control.assessmentObjects ?? '');
  const [quality, setQuality] = useState(control.evidenceQuality ?? '');
  const [limitations, setLimitations] = useState(control.evidenceLimitations ?? '');
  const [saved, setSaved] = useState({ methods, objects, quality, limitations });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dirty =
    methods !== saved.methods ||
    objects !== saved.objects ||
    quality !== saved.quality ||
    limitations !== saved.limitations;
  useUnsavedChanges(dirty, `Assessment record ${control.controlId}`);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      await updateControlAssessmentRecord({
        engagementId,
        engagementControlId: control.id,
        assessmentMethods: methods || undefined,
        assessmentObjects: objects || undefined,
        evidenceQuality: quality ? (quality as never) : undefined,
        evidenceLimitations: limitations || undefined,
      });
      setSaved({ methods, objects, quality, limitations });
      setMessage('Saved.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
      <p className="text-xs font-medium uppercase text-slate-600">
        Assessment record
      </p>
      <p className="mt-1 text-xs text-slate-600">
        CAF expects methods, assessment objects, evidence gathered, limitations, and the
        impact of evidence quality to be clear in the control matrix.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr]">
        <select
          value={methods}
          onChange={(e) => setMethods(e.target.value)}
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        >
          <option value="">Assessment methods</option>
          <option value="examine">Examine</option>
          <option value="interview">Interview</option>
          <option value="test">Test</option>
          <option value="examine, interview">Examine, interview</option>
          <option value="examine, test">Examine, test</option>
          <option value="interview, test">Interview, test</option>
          <option value="examine, interview, test">Examine, interview, test</option>
        </select>
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        >
          <option value="">Evidence quality</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
          <option value="insufficient">Insufficient</option>
        </select>
        <textarea
          rows={2}
          value={objects}
          onChange={(e) => setObjects(e.target.value)}
          placeholder="Assessment objects: systems, services, configurations, logs, interviews, sample sizes"
          className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm sm:col-span-2"
        />
        <textarea
          rows={2}
          value={limitations}
          onChange={(e) => setLimitations(e.target.value)}
          placeholder="Evidence limitations and impact on the control outcome"
          className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm sm:col-span-2"
        />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" variant="primary" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save assessment record'}
        </Button>
        {message && <p className="text-xs text-slate-600">{message}</p>}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'implemented'
      ? 'bg-[var(--oak-mist-strong)] text-[var(--oak-shield)]'
      : status === 'not_applicable'
        ? 'bg-[var(--oak-mist-strong)] text-slate-700'
        : status === 'evidence_pending'
          ? 'bg-amber-100 text-amber-900'
          : 'bg-[var(--oak-mist-strong)] text-slate-700';
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none ${tone}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function DecideForm({ engagementId, control }: { engagementId: string; control: ControlRow }) {
  const [applicable, setApplicable] = useState<'applicable' | 'not_applicable' | 'compensating'>(
    (control.applicable as never) ?? 'applicable',
  );
  const [justification, setJustification] = useState(control.justification ?? '');
  const [saved, setSaved] = useState({ applicable, justification });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = applicable !== saved.applicable || justification !== saved.justification;
  useUnsavedChanges(dirty, `Applicability ${control.controlId}`);

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
      setSaved({ applicable, justification });
      setMessage('Saved.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
      <p className="text-xs font-medium uppercase text-slate-600">
        Assessor decision
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
        <select
          value={applicable}
          onChange={(e) => setApplicable(e.target.value as never)}
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
        >
          <option value="applicable">Applicable</option>
          <option value="not_applicable">Not applicable</option>
          <option value="compensating">Compensating</option>
        </select>
        <input
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Justification (required)"
          className="flex h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
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
  const [savedStatement, setSavedStatement] = useState(statement);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useUnsavedChanges(statement !== savedStatement, `Implementation ${control.controlId}`);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      await writeImplementationStatement({
        engagementId,
        engagementControlId: control.id,
        statement,
      });
      setSavedStatement(statement);
      setMessage('Saved.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
      <p className="text-xs font-medium uppercase text-slate-600">
        Implementation statement (client)
      </p>
      <textarea
        rows={3}
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        placeholder="How this control is implemented for the system in scope…"
        className="mt-2 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
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
