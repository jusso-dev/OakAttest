'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  generateEssentialEightReport,
  getEssentialEightReportDownloadUrl,
  upsertEssentialEight,
  upsertEssentialEightProfile,
} from '@/app/actions/essential-eight';
import { Button } from '@/components/ui/button';
import { UserDateTime } from '@/components/timezone/UserTimezone';
import { formatMaturity } from '@/lib/essential-eight';
import type { EssentialEightMappedControl } from '@/lib/essential-eight-mapping';
import {
  E8_ASSESSMENT_OUTCOMES,
  assessmentOutcome,
  outcomeLabel,
  type EssentialEightCriterionResult,
  type EssentialEightEvidenceQuality,
} from '@/lib/essential-eight-criteria';

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
  criteriaResults?: EssentialEightCriterionResult[];
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
const FIELD =
  'w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 py-2 text-sm';

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
  profile: {
    targetMaturity: string;
    assessmentGuideVersion: string;
    criteriaModelVersion: string;
    scope: string;
    approach: string;
    limitations: string;
  };
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
      const { url } = await getEssentialEightReportDownloadUrl({
        engagementId,
        reportId: report.id,
      });
      window.open(url, '_blank', 'noopener,noreferrer');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function downloadReport(reportId: string) {
    const { url } = await getEssentialEightReportDownloadUrl({ engagementId, reportId });
    window.open(url, '_blank', 'noopener,noreferrer');
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
              Lowest achieved maturity across all eight strategies.
            </p>
          </div>
          <Button variant="primary" disabled={Boolean(busy)} onClick={exportReport}>
            {busy === 'report' ? 'Generating…' : 'Export E8 PDF'}
          </Button>
        </div>
        {overall.blockers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {overall.blockers.map((blocker) => (
              <span
                key={blocker.label}
                className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900"
              >
                {blocker.label}: {formatMaturity(blocker.current)} / target{' '}
                {formatMaturity(blocker.target)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-950">Assessment profile</p>
          <p className="text-xs text-slate-600">
            ASD guide {profile.assessmentGuideVersion} · criteria {profile.criteriaModelVersion}
          </p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[160px_1fr]">
          <FieldLabel label="Target maturity">
            <select
              value={targetMaturity}
              onChange={(event) => setTargetMaturity(event.target.value)}
              className={FIELD}
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level.toUpperCase()}
                </option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel label="Scope">
            <input value={scope} onChange={(event) => setScope(event.target.value)} className={FIELD} />
          </FieldLabel>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <textarea
            rows={3}
            aria-label="Assessment approach"
            placeholder="Assessment approach"
            value={approach}
            onChange={(event) => setApproach(event.target.value)}
            className={FIELD}
          />
          <textarea
            rows={3}
            aria-label="Assessment limitations"
            placeholder="Assessment limitations"
            value={limitations}
            onChange={(event) => setLimitations(event.target.value)}
            className={FIELD}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="outline" disabled={busy === 'profile'} onClick={saveProfile}>
            {busy === 'profile' ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {strategies.map((strategy) => (
          <StrategyCard
            key={strategy.key}
            engagementId={engagementId}
            strategy={strategy}
            evidenceOptions={evidenceOptions}
          />
        ))}
      </div>

      {reports.length > 0 && (
        <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
          <p className="text-sm font-semibold text-slate-950">Generated PDF reports</p>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {reports.map((report) => (
              <li key={report.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p>
                    Version {report.version} · <UserDateTime value={report.generatedAt} />
                  </p>
                  <p className="truncate font-mono text-xs text-slate-600">{report.sha256}</p>
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
  const [criteriaResults, setCriteriaResults] = useState<EssentialEightCriterionResult[]>(() =>
    (strategy.mappedControls ?? []).map(hydrateWorkpaper),
  );
  const [evidenceRefs, setEvidenceRefs] = useState<string[]>(strategy.evidenceRefs ?? []);
  const firstException = strategy.exceptions?.[0];
  const [exceptionScope, setExceptionScope] = useState(firstException?.scope ?? '');
  const [exceptionJustification, setExceptionJustification] = useState(
    firstException?.justification ?? '',
  );
  const [exceptionOwner, setExceptionOwner] = useState(firstException?.owner ?? '');
  const [compensatingControls, setCompensatingControls] = useState(
    firstException?.compensatingControls ?? '',
  );
  const [exceptionConclusion, setExceptionConclusion] = useState(
    firstException?.conclusion ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function updateWorkpaper(next: EssentialEightCriterionResult) {
    setCriteriaResults((currentResults) => [
      ...currentResults.filter((item) => item.criterionId !== next.criterionId),
      next,
    ]);
  }

  async function save() {
    setBusy(true);
    setError('');
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
        evidenceQuality: (quality || undefined) as never,
        evidenceLimitations: limitations || undefined,
        assessorConclusion: conclusion || undefined,
        criteriaResults,
        evidenceRefs,
        exceptions: buildStrategyException({
          scope: exceptionScope,
          justification: exceptionJustification,
          owner: exceptionOwner,
          compensatingControls,
          conclusion: exceptionConclusion,
        }),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Essential Eight assessment could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-slate-900">{strategy.label}</h3>
        <span className="text-xs text-slate-600">
          {(strategy.mappedControls ?? []).length} versioned ISM criteria
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <FieldLabel label="Current">
          <select value={current} onChange={(event) => setCurrent(event.target.value)} className={FIELD}>
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level.toUpperCase()}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Target">
          <select value={target} onChange={(event) => setTarget(event.target.value)} className={FIELD}>
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level.toUpperCase()}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>
      <textarea
        rows={3}
        aria-label="Remediation plan"
        placeholder="Remediation plan"
        value={plan}
        onChange={(event) => setPlan(event.target.value)}
        className={`${FIELD} mt-3`}
      />
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <input value={methods} onChange={(event) => setMethods(event.target.value)} placeholder="Strategy assessment methods" className={FIELD} />
        <input value={objects} onChange={(event) => setObjects(event.target.value)} placeholder="Strategy assessment objects" className={FIELD} />
        <input value={sampleSize} onChange={(event) => setSampleSize(event.target.value)} placeholder="Strategy sample summary" className={FIELD} />
        <select value={quality} onChange={(event) => setQuality(event.target.value)} className={FIELD}>
          <option value="">Strategy evidence quality</option>
          {['excellent', 'good', 'fair', 'poor', 'insufficient'].map((value) => (
            <option key={value} value={value}>
              {capitalize(value)}
            </option>
          ))}
        </select>
      </div>
      <textarea rows={2} aria-label="Evidence limitations" placeholder="Strategy evidence limitations" value={limitations} onChange={(event) => setLimitations(event.target.value)} className={`${FIELD} mt-3`} />
      <textarea rows={2} aria-label="Assessor conclusion" placeholder="Assessor conclusion" value={conclusion} onChange={(event) => setConclusion(event.target.value)} className={`${FIELD} mt-3`} />

      <div className="mt-4 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">ASD-aligned criterion workpapers</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Outcomes, direct test procedure, representative sample, credible evidence, limitations,
            alternate controls, and formal exception authority are recorded per mapped ISM control.
          </p>
        </div>
        {(strategy.mappedControls ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-amber-900">
            No Essential Eight mappings exist for this pinned ISM revision. Import a complete ISM
            catalogue before recording maturity above ML0.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {(strategy.mappedControls ?? []).map((control) => {
              const result =
                criteriaResults.find((item) => item.criterionId === control.criterion.criterionId) ??
                hydrateWorkpaper(control);
              return (
                <CriterionWorkpaper
                  key={control.criterion.criterionId}
                  control={control}
                  result={result}
                  evidenceOptions={evidenceOptions}
                  onChange={updateWorkpaper}
                />
              );
            })}
          </div>
        )}
      </div>

      {evidenceOptions.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--field-border)] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
            Strategy-level evidence
          </p>
          <div className="mt-2 max-h-36 space-y-1 overflow-auto pr-1">
            {evidenceOptions.map((evidence) => (
              <label key={evidence.id} className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={evidenceRefs.includes(evidence.id)}
                  onChange={(event) =>
                    setEvidenceRefs((currentRefs) =>
                      event.target.checked
                        ? [...new Set([...currentRefs, evidence.id])]
                        : currentRefs.filter((id) => id !== evidence.id),
                    )
                  }
                />
                <span className="truncate">
                  {evidence.filename} ({evidence.reviewStatus})
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <details className="mt-3 rounded-md border border-[var(--field-border)] p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">
          Legacy strategy exception summary
        </summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input value={exceptionScope} onChange={(event) => setExceptionScope(event.target.value)} placeholder="Exception scope" className={FIELD} />
          <input value={exceptionOwner} onChange={(event) => setExceptionOwner(event.target.value)} placeholder="Exception owner" className={FIELD} />
          <textarea rows={2} value={exceptionJustification} onChange={(event) => setExceptionJustification(event.target.value)} placeholder="Justification" className={FIELD} />
          <textarea rows={2} value={compensatingControls} onChange={(event) => setCompensatingControls(event.target.value)} placeholder="Compensating controls" className={FIELD} />
          <textarea rows={2} value={exceptionConclusion} onChange={(event) => setExceptionConclusion(event.target.value)} placeholder="Assessor exception conclusion" className={`${FIELD} md:col-span-2`} />
        </div>
      </details>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="primary" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save strategy and workpapers'}
        </Button>
      </div>
    </section>
  );
}

function CriterionWorkpaper({
  control,
  result,
  evidenceOptions,
  onChange,
}: {
  control: EssentialEightMappedControl;
  result: EssentialEightCriterionResult;
  evidenceOptions: EvidenceOption[];
  onChange: (result: EssentialEightCriterionResult) => void;
}) {
  const outcome = assessmentOutcome(result);
  const acceptedEvidence = evidenceOptions.filter((item) => item.reviewStatus === 'accepted');
  const patch = (next: Partial<EssentialEightCriterionResult>) => onChange({ ...result, ...next });

  return (
    <details className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-slate-900">{control.controlId}</span>
              <span className="rounded-full bg-[var(--oak-mist)] px-2 py-0.5 text-xs text-slate-700">
                {formatMaturity(control.criterion.maturity)}
              </span>
              <span className="text-xs text-slate-500">{control.criterion.sourceRevision}</span>
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-700">{control.description}</p>
          </div>
          <span className="rounded-full border border-[var(--field-border)] px-2 py-1 text-xs font-medium text-slate-700">
            {outcomeLabel(outcome)}
          </span>
        </div>
      </summary>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <FieldLabel label="ASD assessment outcome">
          <select
            value={outcome}
            onChange={(event) =>
              patch({ outcome: event.target.value as EssentialEightCriterionResult['outcome'] })
            }
            className={FIELD}
          >
            {E8_ASSESSMENT_OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {outcomeLabel(value)}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Test date">
          <input
            type="date"
            value={result.testedAt ?? ''}
            onChange={(event) => patch({ testedAt: event.target.value || undefined })}
            className={FIELD}
          />
        </FieldLabel>
        <FieldLabel label="Assessment methods">
          <input value={result.assessmentMethods ?? ''} onChange={(event) => patch({ assessmentMethods: event.target.value || undefined })} placeholder="Examine, interview, test" className={FIELD} />
        </FieldLabel>
        <FieldLabel label="Assessment objects">
          <input value={result.assessmentObjects ?? ''} onChange={(event) => patch({ assessmentObjects: event.target.value || undefined })} placeholder="Systems, services, configurations, logs" className={FIELD} />
        </FieldLabel>
        <FieldLabel label="Population size">
          <input type="number" min={0} value={result.populationSize ?? ''} onChange={(event) => patch({ populationSize: optionalNumber(event.target.value) })} className={FIELD} />
        </FieldLabel>
        <FieldLabel label="Sample size">
          <input type="number" min={0} value={result.sampleSize ?? ''} onChange={(event) => patch({ sampleSize: optionalNumber(event.target.value) })} className={FIELD} />
        </FieldLabel>
        <FieldLabel label="Evidence quality">
          <select
            value={result.evidenceQuality ?? ''}
            onChange={(event) =>
              patch({
                evidenceQuality:
                  (event.target.value as EssentialEightEvidenceQuality) || undefined,
              })
            }
            className={FIELD}
          >
            <option value="">Select quality</option>
            {['excellent', 'good', 'fair', 'poor', 'insufficient'].map((value) => (
              <option key={value} value={value}>
                {capitalize(value)}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Sample identifiers">
          <input
            value={(result.sampledItems ?? []).join(', ')}
            onChange={(event) => patch({ sampledItems: commaList(event.target.value) })}
            placeholder="device-01, device-02"
            className={FIELD}
          />
        </FieldLabel>
        <FieldLabel label="Test procedure" wide>
          <textarea rows={3} value={result.testProcedure ?? ''} onChange={(event) => patch({ testProcedure: event.target.value || undefined })} placeholder="What was inspected or executed, including scripts and parameters" className={FIELD} />
        </FieldLabel>
        <FieldLabel label="Observed result" wide>
          <textarea rows={3} value={result.testResult ?? ''} onChange={(event) => patch({ testResult: event.target.value || undefined })} placeholder="Observed behaviour and result across the sample" className={FIELD} />
        </FieldLabel>
        <FieldLabel label="Evidence limitations" wide>
          <textarea rows={2} value={result.evidenceLimitations ?? ''} onChange={(event) => patch({ evidenceLimitations: event.target.value || undefined })} placeholder="Access, coverage, timing, sampling, or tooling limitations" className={FIELD} />
        </FieldLabel>
      </div>

      <fieldset className="mt-3 rounded-md border border-[var(--field-border)] p-3">
        <legend className="px-1 text-xs font-medium text-slate-700">Accepted criterion evidence</legend>
        {acceptedEvidence.length === 0 ? (
          <p className="text-xs text-amber-800">No accepted evidence is available.</p>
        ) : (
          <div className="grid gap-1 md:grid-cols-2">
            {acceptedEvidence.map((evidence) => (
              <label key={evidence.id} className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={(result.evidenceRefs ?? []).includes(evidence.id)}
                  onChange={(event) =>
                    patch({
                      evidenceRefs: event.target.checked
                        ? [...new Set([...(result.evidenceRefs ?? []), evidence.id])]
                        : (result.evidenceRefs ?? []).filter((id) => id !== evidence.id),
                    })
                  }
                />
                <span className="truncate">{evidence.filename}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {outcome === 'alternate_control' && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <textarea rows={3} aria-label="Alternate control" value={result.alternateControl ?? ''} onChange={(event) => patch({ alternateControl: event.target.value || undefined })} placeholder="Alternate control implemented" className={FIELD} />
          <textarea rows={3} aria-label="Equivalent protection conclusion" value={result.equivalentProtectionConclusion ?? ''} onChange={(event) => patch({ equivalentProtectionConclusion: event.target.value || undefined })} placeholder="Why protection is equivalent to ASD guidance" className={FIELD} />
        </div>
      )}

      {outcome === 'not_applicable' && (
        <textarea
          rows={2}
          aria-label="Not applicable justification"
          value={result.notApplicableJustification ?? ''}
          onChange={(event) => patch({ notApplicableJustification: event.target.value || undefined })}
          placeholder="Document scope and reason this criterion does not apply"
          className={`${FIELD} mt-3`}
        />
      )}

      <details className="mt-3 rounded-md border border-[var(--field-border)] p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">
          Formal exception approval
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <textarea rows={2} value={result.exception?.justification ?? ''} onChange={(event) => patchException(result, patch, { justification: event.target.value })} placeholder="Exception justification" className={FIELD} />
          <input value={result.exception?.authorityName ?? ''} onChange={(event) => patchException(result, patch, { authorityName: event.target.value })} placeholder="Approving authority name" className={FIELD} />
          <input value={result.exception?.authorityRole ?? ''} onChange={(event) => patchException(result, patch, { authorityRole: event.target.value })} placeholder="Approving authority role" className={FIELD} />
          <input value={result.exception?.decisionReference ?? ''} onChange={(event) => patchException(result, patch, { decisionReference: event.target.value })} placeholder="Decision reference" className={FIELD} />
          <FieldLabel label="Approved date">
            <input type="date" value={result.exception?.approvedAt ?? ''} onChange={(event) => patchException(result, patch, { approvedAt: event.target.value })} className={FIELD} />
          </FieldLabel>
          <FieldLabel label="Expiry date">
            <input type="date" value={result.exception?.expiresAt ?? ''} onChange={(event) => patchException(result, patch, { expiresAt: event.target.value })} className={FIELD} />
          </FieldLabel>
          {result.exception && (
            <Button size="sm" variant="outline" onClick={() => patch({ exception: undefined })}>
              Clear exception
            </Button>
          )}
        </div>
      </details>

      {(control.evidence.length > 0 || control.findings.length > 0) && (
        <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
          <div>
            <p className="font-medium text-slate-700">Mapped evidence</p>
            <ul className="mt-1 space-y-1 text-slate-600">
              {control.evidence.map((item) => (
                <li key={item.id}>
                  {item.filename} ({item.reviewStatus})
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-700">Mapped findings</p>
            <ul className="mt-1 space-y-1 text-slate-600">
              {control.findings.map((finding) => (
                <li key={finding.code}>
                  {finding.code}: {finding.severity} {finding.status}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </details>
  );
}

function hydrateWorkpaper(control: EssentialEightMappedControl): EssentialEightCriterionResult {
  const existing = control.workpaper;
  return {
    ...control.criterion,
    ...(existing ?? {}),
    ...control.criterion,
    outcome: assessmentOutcome(existing),
  };
}

function patchException(
  result: EssentialEightCriterionResult,
  patch: (next: Partial<EssentialEightCriterionResult>) => void,
  next: Partial<NonNullable<EssentialEightCriterionResult['exception']>>,
) {
  const current = result.exception ?? {
    justification: '',
    authorityName: '',
    authorityRole: '',
    approvedAt: '',
  };
  patch({ exception: { ...current, ...next } });
}

function optionalNumber(value: string): number | undefined {
  if (value === '') return undefined;
  return Number(value);
}

function commaList(value: string): string[] | undefined {
  const values = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function FieldLabel({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`space-y-1 ${wide ? 'md:col-span-2' : ''}`}>
      <span className="text-xs text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function buildStrategyException(input: {
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
