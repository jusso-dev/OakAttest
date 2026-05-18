'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  generateEssentialEightReport,
  getEssentialEightReportDownloadUrl,
  upsertEssentialEight,
  upsertEssentialEightProfile,
} from '@/app/actions/essential-eight';
import { formatMaturity } from '@/lib/essential-eight';
import type { EssentialEightMappedControl } from '@/lib/essential-eight-mapping';

type Strategy = {
  key: string;
  label: string;
  current: string;
  target: string;
  evidenceRefs: string[];
  remediationPlan: string;
  assessmentMethods?: string;
  assessmentObjects?: string;
  sampleSize?: string;
  evidenceQuality?: string;
  evidenceLimitations?: string;
  assessorConclusion?: string;
  exceptions?: Array<{
    scope?: string;
    justification?: string;
    owner?: string;
    compensatingControls?: string;
    conclusion?: string;
  }>;
  mappedControls?: EssentialEightMappedControl[];
};

type EvidenceOption = {
  id: string;
  filename: string;
  reviewStatus: string;
  sha256: string;
};

const LEVELS = ['ml0', 'ml1', 'ml2', 'ml3'];

export function EssentialEightGrid({
  engagementId,
  strategies,
  profile,
  overall,
  reports,
  evidenceOptions,
}: {
  engagementId: string;
  strategies: Strategy[];
  profile: { targetMaturity: string; scope: string; approach: string; limitations: string };
  overall: { achieved: string; blockers: Array<{ label: string; current: string; target: string }> };
  reports: Array<{ id: string; version: number; sha256: string; generatedAt: string }>;
  evidenceOptions: EvidenceOption[];
}) {
  const router = useRouter();
  const [targetMaturity, setTargetMaturity] = useState(profile.targetMaturity);
  const [scope, setScope] = useState(profile.scope);
  const [approach, setApproach] = useState(profile.approach);
  const [limitations, setLimitations] = useState(profile.limitations);
  const [busy, setBusy] = useState<string | null>(null);

  async function saveProfile() {
    setBusy('profile');
    try {
      await upsertEssentialEightProfile({
        engagementId,
        targetMaturity: targetMaturity as never,
        scope,
        approach,
        limitations,
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function exportReport() {
    setBusy('report');
    try {
      const report = await generateEssentialEightReport({ engagementId });
      const { url } = await getEssentialEightReportDownloadUrl({ engagementId, reportId: report.id });
      window.open(url, '_blank');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function downloadReport(reportId: string) {
    const { url } = await getEssentialEightReportDownloadUrl({ engagementId, reportId });
    window.open(url, '_blank');
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">Overall package maturity</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--oak-shield)]">
              {formatMaturity(overall.achieved)}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Calculated as the lowest achieved maturity across all eight strategies.
            </p>
          </div>
          <Button variant="primary" disabled={Boolean(busy)} onClick={exportReport}>
            {busy === 'report' ? 'Generating…' : 'Export E8 PDF'}
          </Button>
        </div>
        {overall.blockers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {overall.blockers.map((blocker) => (
              <span key={blocker.label} className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
                {blocker.label}: {formatMaturity(blocker.current)} / target {formatMaturity(blocker.target)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
        <div className="grid gap-3 md:grid-cols-[160px_1fr]">
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Target maturity</span>
            <select
              value={targetMaturity}
              onChange={(e) => setTargetMaturity(e.target.value)}
              className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>{l.toUpperCase()}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Scope</span>
            <input
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <textarea rows={3} placeholder="Assessment approach" value={approach} onChange={(e) => setApproach(e.target.value)} className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm" />
          <textarea rows={3} placeholder="Assessment limitations" value={limitations} onChange={(e) => setLimitations(e.target.value)} className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm" />
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="outline" disabled={busy === 'profile'} onClick={saveProfile}>
            {busy === 'profile' ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {strategies.map((s) => (
          <StrategyCard key={s.key} engagementId={engagementId} strategy={s} evidenceOptions={evidenceOptions} />
        ))}
      </div>

      {reports.length > 0 && (
        <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
          <p className="text-sm font-semibold text-slate-950">Generated PDF reports</p>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {reports.map((report) => (
              <li key={report.id} className="flex items-center justify-between py-2">
                <div>
                  <p>Version {report.version} · {new Date(report.generatedAt).toLocaleString('en-AU')}</p>
                  <p className="font-mono text-xs text-slate-600">{report.sha256.slice(0, 16)}…</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => downloadReport(report.id)}>
                  Download
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StrategyCard({
  engagementId,
  strategy,
  evidenceOptions,
}: {
  engagementId: string;
  strategy: Strategy;
  evidenceOptions: EvidenceOption[];
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(strategy.current);
  const [target, setTarget] = useState(strategy.target);
  const [plan, setPlan] = useState(strategy.remediationPlan);
  const [methods, setMethods] = useState(strategy.assessmentMethods ?? '');
  const [objects, setObjects] = useState(strategy.assessmentObjects ?? '');
  const [sampleSize, setSampleSize] = useState(strategy.sampleSize ?? '');
  const [quality, setQuality] = useState(strategy.evidenceQuality ?? '');
  const [limitations, setLimitations] = useState(strategy.evidenceLimitations ?? '');
  const [conclusion, setConclusion] = useState(strategy.assessorConclusion ?? '');
  const [evidenceRefs, setEvidenceRefs] = useState<string[]>(strategy.evidenceRefs ?? []);
  const firstException = strategy.exceptions?.[0];
  const [exceptionScope, setExceptionScope] = useState(firstException?.scope ?? '');
  const [exceptionJustification, setExceptionJustification] = useState(firstException?.justification ?? '');
  const [exceptionOwner, setExceptionOwner] = useState(firstException?.owner ?? '');
  const [compensatingControls, setCompensatingControls] = useState(firstException?.compensatingControls ?? '');
  const [exceptionConclusion, setExceptionConclusion] = useState(firstException?.conclusion ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await upsertEssentialEight({
        engagementId,
        strategy: strategy.key as never,
        currentMaturity: current as never,
        targetMaturity: target as never,
        remediationPlan: plan || undefined,
        assessmentMethods: methods || undefined,
        assessmentObjects: objects || undefined,
        sampleSize: sampleSize || undefined,
        evidenceQuality: quality as never || undefined,
        evidenceLimitations: limitations || undefined,
        assessorConclusion: conclusion || undefined,
        evidenceRefs,
        exceptions: buildException({
          scope: exceptionScope,
          justification: exceptionJustification,
          owner: exceptionOwner,
          compensatingControls,
          conclusion: exceptionConclusion,
        }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
      <p className="font-medium text-slate-900">{strategy.label}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <label className="space-y-1">
          <span className="text-xs text-slate-600">Current</span>
          <select
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-600">Target</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        rows={3}
        placeholder="Remediation plan"
        value={plan}
        onChange={(e) => setPlan(e.target.value)}
        className="mt-3 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
      />
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <input value={methods} onChange={(e) => setMethods(e.target.value)} placeholder="Assessment methods" className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3" />
        <input value={objects} onChange={(e) => setObjects(e.target.value)} placeholder="Assessment objects" className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3" />
        <input value={sampleSize} onChange={(e) => setSampleSize(e.target.value)} placeholder="Sample size" className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3" />
        <select value={quality} onChange={(e) => setQuality(e.target.value)} className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3">
          <option value="">Evidence quality</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
          <option value="insufficient">Insufficient</option>
        </select>
      </div>
      <textarea rows={2} placeholder="Evidence limitations" value={limitations} onChange={(e) => setLimitations(e.target.value)} className="mt-3 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm" />
      <textarea rows={2} placeholder="Assessor conclusion" value={conclusion} onChange={(e) => setConclusion(e.target.value)} className="mt-3 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm" />
      {evidenceOptions.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--field-border)] p-2">
          <p className="text-xs font-medium uppercase text-slate-600">Linked E8 evidence</p>
          <div className="mt-2 max-h-32 space-y-1 overflow-auto pr-1">
            {evidenceOptions.slice(0, 12).map((evidence) => (
              <label key={evidence.id} className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={evidenceRefs.includes(evidence.id)}
                  onChange={(event) => {
                    setEvidenceRefs((current) =>
                      event.target.checked
                        ? [...new Set([...current, evidence.id])]
                        : current.filter((id) => id !== evidence.id),
                    );
                  }}
                />
                <span className="truncate">
                  {evidence.filename} ({evidence.reviewStatus})
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 rounded-md border border-[var(--field-border)] p-2">
        <p className="text-xs font-medium uppercase text-slate-600">Exception or compensating control</p>
        <div className="mt-2 grid gap-2">
          <input value={exceptionScope} onChange={(e) => setExceptionScope(e.target.value)} placeholder="Exception scope" className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm" />
          <input value={exceptionOwner} onChange={(e) => setExceptionOwner(e.target.value)} placeholder="Exception owner" className="h-9 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm" />
          <textarea rows={2} value={exceptionJustification} onChange={(e) => setExceptionJustification(e.target.value)} placeholder="Justification" className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm" />
          <textarea rows={2} value={compensatingControls} onChange={(e) => setCompensatingControls(e.target.value)} placeholder="Compensating controls" className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm" />
          <textarea rows={2} value={exceptionConclusion} onChange={(e) => setExceptionConclusion(e.target.value)} placeholder="Assessor exception conclusion" className="w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm" />
        </div>
      </div>
      {strategy.mappedControls && strategy.mappedControls.length > 0 && (
        <div className="mt-3 rounded-md bg-[var(--oak-mist)] p-2">
          <p className="text-xs font-medium uppercase text-slate-600">Mapped ISM controls</p>
          <div className="mt-2 space-y-2">
            {strategy.mappedControls.slice(0, 6).map((control) => (
              <div key={`${strategy.key}-${control.controlId}`} className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-900">
                    {control.controlId}
                  </span>
                  {control.maturityLevel && (
                    <span className="rounded-full bg-[var(--oak-mist)] px-2 py-0.5 text-xs text-slate-700">
                      ML{control.maturityLevel}
                    </span>
                  )}
                  <span className="text-xs text-slate-600">
                    {control.applicable ?? 'undecided'} · {control.status ?? 'not_started'}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">{control.description}</p>
                {(control.evidence.length > 0 || control.findings.length > 0) && (
                  <div className="mt-2 grid gap-2 text-xs md:grid-cols-2">
                    <div>
                      <p className="font-medium text-slate-700">Candidate evidence</p>
                      {control.evidence.length === 0 ? (
                        <p className="text-slate-500">None linked to this ISM control.</p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-slate-600">
                          {control.evidence.slice(0, 3).map((item) => (
                            <li key={item.id} className="truncate">
                              {item.filename} ({item.reviewStatus})
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-700">Findings</p>
                      {control.findings.length === 0 ? (
                        <p className="text-slate-500">None linked to this ISM control.</p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-slate-600">
                          {control.findings.slice(0, 3).map((finding) => (
                            <li key={finding.code} className="truncate">
                              {finding.code}: {finding.severity} {finding.status}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="primary" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function buildException(input: {
  scope: string;
  justification: string;
  owner: string;
  compensatingControls: string;
  conclusion: string;
}) {
  if (!Object.values(input).some((value) => value.trim().length > 0)) return undefined;
  return [
    {
      scope: input.scope || undefined,
      justification: input.justification || undefined,
      owner: input.owner || undefined,
      compensatingControls: input.compensatingControls || undefined,
      conclusion: input.conclusion || undefined,
    },
  ];
}
