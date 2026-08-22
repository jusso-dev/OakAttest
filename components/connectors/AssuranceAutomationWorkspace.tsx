'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  createAwsSecurityHubConnector,
  disableAssuranceConnector,
  replaceConnectorControlMappings,
  runAssuranceConnectorNow,
  reviewAssuranceTestResult,
  testAssuranceConnector,
  updateAwsSecurityHubConnector,
} from '@/app/actions/connectors';
import {
  createCommonControlMapping,
  getReusedEvidenceDownloadUrl,
  proposeEvidenceReuse,
  reviewEvidenceReuse,
  revokeEvidenceReuse,
} from '@/app/actions/evidence-reuse';
import { UserDateTime } from '@/components/timezone/UserTimezone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { connectorTestsForProvider, type AwsSecurityHubConfig } from '@/lib/connectors/types';

type Control = { frameworkControlId: string; controlId: string; description: string };
type Connector = {
  id: string;
  name: string;
  provider: string;
  status: string;
  config: AwsSecurityHubConfig;
  scheduleMinutes: number;
  lastConnectionTestAt: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  mappings: Array<{ testKey: string; frameworkControlId: string }>;
};
type Run = {
  id: string;
  connectorId: string;
  trigger: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  summary: { passed: number; failed: number; errors: number; unknown: number } | null;
  error: string | null;
};
type Result = {
  id: string;
  connectorId: string;
  runId: string;
  testKey: string;
  title: string;
  outcome: string;
  observation: string;
  observedAt: string;
  evidence: Record<string, string | number | boolean | null | string[]>;
  evidenceSha256: string;
  reviewStatus: string;
  reviewNotes: string | null;
  controlIds: string[];
};
type Candidate = {
  id: string;
  engagementId: string;
  sourceEngagementName: string;
  filename: string;
  description: string | null;
  sha256: string;
  dataClassification: string;
  uploadedAt: string;
  sourceFrameworkControlIds: string[];
};
type CommonMapping = {
  id: string;
  sourceFrameworkControlId: string;
  targetFrameworkControlId: string;
  relation: string;
  rationale: string;
  sourceLabel: string;
  targetLabel: string;
};
type ReuseLink = {
  id: string;
  status: string;
  rationale: string;
  filename: string;
  sourceEngagementName: string;
  targetControlLabel: string;
  validUntil: string;
  createdAt: string;
  decidedAt: string | null;
  revokedAt: string | null;
  decisionNotes: string | null;
};

export function AssuranceAutomationWorkspace({
  engagementId,
  timeZone,
  defaultValidity,
  integrationsEnabled,
  reuseEnabled,
  awsPrincipalArn,
  permissions,
  controls,
  connectors,
  runs,
  results,
  candidates,
  commonMappings,
  sourceControls,
  reuseLinks,
}: {
  engagementId: string;
  timeZone: string;
  defaultValidity: string;
  integrationsEnabled: boolean;
  reuseEnabled: boolean;
  awsPrincipalArn: string | null;
  permissions: {
    canManageConnectors: boolean;
    canRunConnectors: boolean;
    canReviewTests: boolean;
    canManageMappings: boolean;
    canProposeReuse: boolean;
    canReviewReuse: boolean;
  };
  controls: Control[];
  connectors: Connector[];
  runs: Run[];
  results: Result[];
  candidates: Candidate[];
  commonMappings: CommonMapping[];
  sourceControls: Array<{ id: string; controlId: string; description: string }>;
  reuseLinks: ReuseLink[];
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

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--oak-shield)]">Continuous assurance</p>
        <h2 className="text-2xl font-semibold text-slate-950">Connectors, automated tests, and evidence reuse</h2>
        <p className="max-w-4xl text-sm leading-6 text-slate-700">
          Collect bounded machine observations without turning them into assessor conclusions. Map each test to
          relevant controls, then review the timestamped result alongside human evidence.
        </p>
        <p className="text-sm text-slate-600">All operational dates use your saved timezone: <strong>{timeZone}</strong>.</p>
        {message ? <p className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" role="status">{message}</p> : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>AWS Security Hub connector</CardTitle>
          <CardDescription>
            OakAttest assumes a customer-owned read-only IAM role with an external ID. Static AWS credentials are neither requested nor stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!integrationsEnabled ? <PlanNotice>Integrations are not enabled for this plan.</PlanNotice> : null}
          {permissions.canManageConnectors && integrationsEnabled ? (
            <CreateConnectorForm engagementId={engagementId} pending={pending} run={run} />
          ) : null}
          {connectors.length ? connectors.map((connector) => (
            <ConnectorPanel
              key={connector.id}
              connector={connector}
              controls={controls}
              principalArn={awsPrincipalArn}
              pending={pending}
              canManage={permissions.canManageConnectors && integrationsEnabled}
              canRun={permissions.canRunConnectors && integrationsEnabled}
              engagementId={engagementId}
              run={run}
            />
          )) : <p className="text-sm text-slate-600">No assurance connector configured.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automated test ledger</CardTitle>
          <CardDescription>Immutable observations support assessment work; they never change a control verdict automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {runs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600"><tr><th className="py-2 pr-4">Run</th><th className="py-2 pr-4">Started</th><th className="py-2 pr-4">Trigger</th><th className="py-2 pr-4">Status</th><th className="py-2">Summary</th></tr></thead>
                <tbody>{runs.map((item) => (
                  <tr className="border-b border-slate-100" key={item.id}>
                    <td className="py-3 pr-4 font-mono text-xs">{item.id.slice(0, 8)}</td>
                    <td className="py-3 pr-4"><UserDateTime value={item.startedAt} /></td>
                    <td className="py-3 pr-4">{item.trigger}</td>
                    <td className="py-3 pr-4">{item.status}</td>
                    <td className="py-3">{item.summary ? `${item.summary.passed} pass · ${item.summary.failed} fail · ${item.summary.unknown} unknown · ${item.summary.errors} error` : item.error ?? 'Running'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="text-sm text-slate-600">No connector runs yet.</p>}
          {results.length ? (
            <div className="space-y-3">
              {results.slice(0, 30).map((result) => (
                <article className="rounded-md border border-slate-200 bg-white p-4 text-sm" key={result.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-semibold text-slate-950">{result.title}</p><p className="text-xs text-slate-600">Observed <UserDateTime value={result.observedAt} /> · SHA-256 {result.evidenceSha256.slice(0, 16)}…</p></div>
                    <OutcomeBadge outcome={result.outcome} />
                  </div>
                  <p className="mt-2 text-slate-700">{result.observation}</p>
                  <p className="mt-2 text-xs text-slate-600">Mapped controls: {result.controlIds.length ? result.controlIds.join(', ') : 'none — map this test before relying on it'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span>Assessor review: {result.reviewStatus}</span>
                    {permissions.canReviewTests && result.controlIds.length ? (
                      <>
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reviewAssuranceTestResult({ engagementId, resultId: result.id, status: 'accepted' }), 'Machine observation accepted as supporting evidence.')}>Accept evidence</Button>
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reviewAssuranceTestResult({ engagementId, resultId: result.id, status: 'rejected' }), 'Machine observation rejected.')}>Reject evidence</Button>
                      </>
                    ) : null}
                  </div>
                  <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-[var(--oak-shield)]">Machine observation</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{JSON.stringify(result.evidence, null, 2)}</pre></details>
                </article>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Common-control map</CardTitle>
          <CardDescription>Record why evidence for one framework control may support another. Equivalence is explicit, tenant-scoped, and never inferred as compliance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!reuseEnabled ? <PlanNotice>Evidence reuse is not enabled for this plan.</PlanNotice> : null}
          {permissions.canManageMappings && reuseEnabled ? (
            <CommonMappingForm engagementId={engagementId} sourceControls={sourceControls} controls={controls} pending={pending} run={run} />
          ) : null}
          {commonMappings.length ? (
            <ul className="space-y-2 text-sm">{commonMappings.map((mapping) => (
              <li className="rounded-md border border-slate-200 bg-white p-3" key={mapping.id}>
                <p className="font-medium text-slate-950">{mapping.sourceLabel} → {mapping.targetLabel}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-slate-600">{mapping.relation}</p>
                <p className="mt-1 text-slate-700">{mapping.rationale}</p>
              </li>
            ))}</ul>
          ) : <p className="text-sm text-slate-600">No common-control mappings recorded.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reusable evidence</CardTitle>
          <CardDescription>
            Reuse only accepted, checksum-verified evidence from another assessment of the same registered client. Classification and access boundaries are rechecked on every download.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {permissions.canProposeReuse && reuseEnabled ? (
            <ReuseProposalForm engagementId={engagementId} candidates={candidates} controls={controls} mappings={commonMappings} defaultValidity={defaultValidity} timeZone={timeZone} pending={pending} run={run} />
          ) : null}
          {reuseLinks.length ? reuseLinks.map((link) => (
            <article className="rounded-md border border-slate-200 bg-white p-4 text-sm" key={link.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold text-slate-950">{link.filename}</p><p className="text-xs text-slate-600">From {link.sourceEngagementName} · for {link.targetControlLabel}</p></div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-700">{link.status}</span>
              </div>
              <p className="mt-2 text-slate-700">{link.rationale}</p>
              <p className="mt-2 text-xs text-slate-600">Valid until <UserDateTime value={link.validUntil} /></p>
              <div className="mt-3 flex flex-wrap gap-2">
                {link.status === 'proposed' && permissions.canReviewReuse ? (
                  <>
                    <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => reviewEvidenceReuse({ targetEngagementId: engagementId, reuseLinkId: link.id, status: 'approved' }), 'Evidence reuse approved.')}>Approve</Button>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reviewEvidenceReuse({ targetEngagementId: engagementId, reuseLinkId: link.id, status: 'rejected' }), 'Evidence reuse rejected.')}>Reject</Button>
                  </>
                ) : null}
                {link.status === 'approved' ? <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
                  try { const { url } = await getReusedEvidenceDownloadUrl({ targetEngagementId: engagementId, reuseLinkId: link.id }); window.open(url, '_blank', 'noopener,noreferrer'); }
                  catch (cause) { setMessage((cause as Error).message); }
                })}>Download evidence</Button> : null}
                {link.status === 'approved' && permissions.canReviewReuse ? <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => revokeEvidenceReuse({ targetEngagementId: engagementId, reuseLinkId: link.id }), 'Evidence reuse revoked.')}>Revoke</Button> : null}
              </div>
            </article>
          )) : <p className="text-sm text-slate-600">No reusable evidence proposed.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateConnectorForm({ engagementId, pending, run }: { engagementId: string; pending: boolean; run: Runner }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => createAwsSecurityHubConnector({
      engagementId,
      name: String(form.get('name') ?? ''),
      roleArn: String(form.get('roleArn') ?? ''),
      region: String(form.get('region') ?? ''),
      scheduleMinutes: String(form.get('scheduleMinutes') ?? '1440'),
    }), 'Connector draft created. Add its external ID to the AWS role trust policy, then test the connection.');
  }
  return (
    <form className="grid gap-4 border-b border-slate-200 pb-5" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Connector name"><Input name="name" required defaultValue="AWS Security Hub" disabled={pending} /></Field>
        <Field label="Read-only role ARN"><Input name="roleArn" required placeholder="arn:aws:iam::123456789012:role/OakAttestReadOnly" disabled={pending} /></Field>
        <Field label="AWS region"><Input name="region" required defaultValue="ap-southeast-2" disabled={pending} /></Field>
        <Field label="Run interval (minutes)"><Input name="scheduleMinutes" type="number" min={15} max={43200} required defaultValue={1440} disabled={pending} /></Field>
      </div>
      <Button className="w-fit" variant="primary" type="submit" disabled={pending}>Create connector draft</Button>
    </form>
  );
}

function ConnectorPanel({ connector, controls, principalArn, pending, canManage, canRun, engagementId, run }: { connector: Connector; controls: Control[]; principalArn: string | null; pending: boolean; canManage: boolean; canRun: boolean; engagementId: string; run: Runner }) {
  const tests = connectorTestsForProvider('aws_security_hub');
  const trustPolicy = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { AWS: principalArn ?? 'SET_AWS_CONNECTOR_PRINCIPAL_ARN' }, Action: 'sts:AssumeRole', Condition: { StringEquals: { 'sts:ExternalId': connector.config.externalId } } }] }, null, 2);
  function mapControls(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => replaceConnectorControlMappings({
      engagementId,
      connectorId: connector.id,
      mappings: tests.map((test) => ({ testKey: test.key, frameworkControlIds: form.getAll(test.key).map(String) })),
    }), 'Connector-to-control mappings saved.');
  }
  function updateConnector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => updateAwsSecurityHubConnector({
      engagementId,
      connectorId: connector.id,
      name: String(form.get('name') ?? ''),
      roleArn: String(form.get('roleArn') ?? ''),
      region: String(form.get('region') ?? ''),
      scheduleMinutes: String(form.get('scheduleMinutes') ?? ''),
    }), 'Connector configuration updated. Test the connection to reactivate it.');
  }
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-semibold text-slate-950">{connector.name}</p><p className="text-xs text-slate-600">{connector.config.roleArn} · {connector.config.region} · every {connector.scheduleMinutes} minutes</p></div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-700">{connector.status}</span>
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
        <div><dt className="font-medium text-slate-800">Last connection test</dt><dd>{connector.lastConnectionTestAt ? <UserDateTime value={connector.lastConnectionTestAt} /> : 'Not tested'}</dd></div>
        <div><dt className="font-medium text-slate-800">Last evidence run</dt><dd>{connector.lastRunAt ? <UserDateTime value={connector.lastRunAt} /> : 'Not run'}</dd></div>
        <div><dt className="font-medium text-slate-800">Next scheduled run</dt><dd>{connector.nextRunAt ? <UserDateTime value={connector.nextRunAt} /> : 'Not scheduled'}</dd></div>
      </dl>
      {connector.lastError ? <p className="mt-3 rounded bg-red-50 p-2 text-xs text-red-800" role="alert">{connector.lastError}</p> : null}
      <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-[var(--oak-shield)]">AWS trust policy and external ID</summary><p className="mt-2 text-xs text-slate-600">The host identity needs <code>sts:AssumeRole</code> permission for this role. The customer role trust policy must also require this connector-specific external ID.</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-50">{trustPolicy}</pre></details>
      {canManage ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-[var(--oak-shield)]">Edit connector configuration</summary><form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={updateConnector}><Field label="Connector name"><Input name="name" required defaultValue={connector.name} disabled={pending} /></Field><Field label="Read-only role ARN"><Input name="roleArn" required defaultValue={connector.config.roleArn} disabled={pending} /></Field><Field label="AWS region"><Input name="region" required defaultValue={connector.config.region} disabled={pending} /></Field><Field label="Run interval (minutes)"><Input name="scheduleMinutes" type="number" min={15} max={43200} required defaultValue={connector.scheduleMinutes} disabled={pending} /></Field><Button className="w-fit" size="sm" variant="outline" type="submit" disabled={pending}>Save and require retest</Button></form></details> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {canManage ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => testAssuranceConnector({ engagementId, connectorId: connector.id }), 'AWS role connection verified; connector activated.')}>Test and activate</Button> : null}
        {canRun && connector.status === 'active' ? <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => runAssuranceConnectorNow({ engagementId, connectorId: connector.id }), 'Automated assurance run completed.')}>Run now</Button> : null}
        {canManage && connector.status !== 'disabled' ? <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => disableAssuranceConnector({ engagementId, connectorId: connector.id }), 'Connector disabled.')}>Disable</Button> : null}
      </div>
      {canManage ? (
        <form className="mt-5 grid gap-4 border-t border-slate-200 pt-4" onSubmit={mapControls}>
          <p className="text-sm font-semibold text-slate-950">Map machine tests to assessment controls</p>
          {tests.map((test) => (
            <Field label={test.title} key={test.key}>
              <select className={selectClass} name={test.key} multiple size={Math.min(5, Math.max(2, controls.length))} defaultValue={connector.mappings.filter((mapping) => mapping.testKey === test.key).map((mapping) => mapping.frameworkControlId)} disabled={pending}>
                {controls.map((control) => <option value={control.frameworkControlId} key={control.frameworkControlId}>{control.controlId} — {control.description}</option>)}
              </select>
            </Field>
          ))}
          <Button className="w-fit" size="sm" variant="outline" type="submit" disabled={pending}>Save test mappings</Button>
        </form>
      ) : null}
    </article>
  );
}

function CommonMappingForm({ engagementId, sourceControls, controls, pending, run }: { engagementId: string; sourceControls: Array<{ id: string; controlId: string; description: string }>; controls: Control[]; pending: boolean; run: Runner }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    run(() => createCommonControlMapping({ engagementId, sourceFrameworkControlId: String(form.get('source') ?? ''), targetFrameworkControlId: String(form.get('target') ?? ''), relation: String(form.get('relation')) as 'equivalent' | 'supporting' | 'partial', rationale: String(form.get('rationale') ?? '') }), 'Common-control mapping recorded.');
  }
  return sourceControls.length ? (
    <form className="grid gap-4 border-b border-slate-200 pb-4" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-3"><Field label="Source control"><select className={selectClass} name="source" required disabled={pending}>{sourceControls.map((control) => <option value={control.id} key={control.id}>{control.controlId} — {control.description}</option>)}</select></Field><Field label="Target control"><select className={selectClass} name="target" required disabled={pending}>{controls.map((control) => <option value={control.frameworkControlId} key={control.frameworkControlId}>{control.controlId} — {control.description}</option>)}</select></Field><Field label="Relationship"><select className={selectClass} name="relation" defaultValue="supporting" disabled={pending}><option value="equivalent">Equivalent</option><option value="supporting">Supporting</option><option value="partial">Partial</option></select></Field></div>
      <Field label="Mapping rationale"><textarea className={textareaClass} name="rationale" required minLength={10} disabled={pending} /></Field>
      <Button className="w-fit" size="sm" variant="outline" type="submit" disabled={pending}>Record mapping</Button>
    </form>
  ) : <p className="text-sm text-slate-600">Accepted source evidence must be linked to a control before a common-control mapping can be recorded.</p>;
}

function ReuseProposalForm({ engagementId, candidates, controls, mappings, defaultValidity, timeZone, pending, run }: { engagementId: string; candidates: Candidate[]; controls: Control[]; mappings: CommonMapping[]; defaultValidity: string; timeZone: string; pending: boolean; run: Runner }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const mappingId = String(form.get('mapping') ?? '');
    run(() => proposeEvidenceReuse({ targetEngagementId: engagementId, sourceEvidenceItemId: String(form.get('sourceEvidence') ?? ''), targetFrameworkControlId: String(form.get('targetControl') ?? ''), commonControlMappingId: mappingId || undefined, rationale: String(form.get('rationale') ?? ''), validUntil: String(form.get('validUntil') ?? '') }), 'Evidence reuse proposed for assessor review.');
  }
  return candidates.length ? (
    <form className="grid gap-4 border-b border-slate-200 pb-4" onSubmit={submit}>
      <div className="grid gap-4 lg:grid-cols-2"><Field label="Accepted source evidence"><select className={selectClass} name="sourceEvidence" required disabled={pending}>{candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.sourceEngagementName} · {candidate.filename} · {candidate.dataClassification.replace('_', ': ')}</option>)}</select></Field><Field label="Target control"><select className={selectClass} name="targetControl" required disabled={pending}>{controls.map((control) => <option value={control.frameworkControlId} key={control.frameworkControlId}>{control.controlId} — {control.description}</option>)}</select></Field><Field label="Documented common-control mapping (optional)"><select className={selectClass} name="mapping" disabled={pending}><option value="">No mapping — direct supporting rationale</option>{mappings.map((mapping) => <option value={mapping.id} key={mapping.id}>{mapping.sourceLabel} → {mapping.targetLabel}</option>)}</select></Field><Field label={`Review or expiry date (${timeZone})`}><Input name="validUntil" type="date" required defaultValue={defaultValidity} disabled={pending} /></Field></div>
      <Field label="Why this evidence remains relevant to the target control"><textarea className={textareaClass} name="rationale" required minLength={20} disabled={pending} /></Field>
      <Button className="w-fit" variant="primary" type="submit" disabled={pending}>Propose evidence reuse</Button>
    </form>
  ) : <p className="text-sm text-slate-600">No accepted, verified evidence is available from another accessible assessment of this registered client.</p>;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const tone = outcome === 'pass' ? 'bg-emerald-100 text-emerald-900' : outcome === 'fail' ? 'bg-red-100 text-red-900' : outcome === 'error' ? 'bg-orange-100 text-orange-900' : 'bg-slate-100 text-slate-800';
  return <span className={`rounded-full px-2 py-1 text-xs font-medium uppercase tracking-wide ${tone}`}>{outcome}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <Label className="grid gap-1.5"><span>{label}</span>{children}</Label>; }
function PlanNotice({ children }: { children: ReactNode }) { return <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{children}</p>; }
type Runner = (task: () => Promise<unknown>, success: string) => void;
const selectClass = 'min-h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)] disabled:cursor-not-allowed disabled:opacity-50';
const textareaClass = 'min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)] disabled:cursor-not-allowed disabled:opacity-50';
