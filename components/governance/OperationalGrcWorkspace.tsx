'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptGovernancePolicy,
  assessVendorRisk,
  completeAccessReviewCampaign,
  createAccessReviewCampaign,
  createGovernancePolicy,
  createPersonnelAssuranceRecord,
  createVendorRiskRecord,
  decideAccessReviewItem,
  reviseGovernancePolicy,
  startAccessReviewCampaign,
  transitionGovernancePolicy,
  transitionVendorRisk,
  updatePersonnelAssuranceRecord,
} from '@/app/actions/operational-grc';
import { UserDateTime } from '@/components/timezone/UserTimezone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Permissions = {
  canWritePolicy: boolean;
  canApprovePolicy: boolean;
  canAcceptPolicy: boolean;
  canManagePersonnel: boolean;
  canManageAccessReviews: boolean;
  canManageVendors: boolean;
  canAcceptVendorRisk: boolean;
};
type Policy = {
  id: string;
  policyGroupId: string;
  title: string;
  category: string;
  version: number;
  content: string;
  status: string;
  ownerUserId: string | null;
  reviewDueAt: string;
  reviewDate: string;
  approvedAt: string | null;
  publishedAt: string | null;
  retiredAt: string | null;
};
type Attestation = {
  id: string;
  policyId: string;
  policyTitle: string;
  policyVersion: number;
  userId: string;
  userLabel: string;
  status: string;
  dueAt: string;
  acceptedAt: string | null;
};
type Personnel = {
  id: string;
  personName: string;
  personEmail: string;
  roleTitle: string | null;
  employmentStatus: string;
  screeningStatus: string;
  screeningExpiresDate: string;
  trainingDueDate: string;
  trainingCompletedAt: string | null;
  offboardingDueDate: string;
  offboardingCompletedAt: string | null;
  ownerUserId: string | null;
  notes: string | null;
};
type AccessItem = {
  id: string;
  subjectName: string;
  subjectEmail: string | null;
  systemName: string;
  accessLevel: string;
  decision: string;
  rationale: string | null;
  remediationStatus: string;
  decidedAt: string | null;
};
type Campaign = {
  id: string;
  title: string;
  scope: string;
  status: string;
  dueAt: string;
  startedAt: string | null;
  completedAt: string | null;
  items: AccessItem[];
};
type Vendor = {
  id: string;
  vendorName: string;
  serviceDescription: string;
  criticality: string;
  status: string;
  inherentRisk: string;
  residualRisk: string | null;
  dataHandled: string | null;
  dueDiligenceSummary: string | null;
  ownerUserId: string | null;
  contractExpiryDate: string;
  nextReviewDate: string;
  lastAssessedAt: string | null;
  riskAcceptanceStatement: string | null;
  riskAcceptedAt: string | null;
};

export function OperationalGrcWorkspace({
  engagementId,
  currentUserId,
  timeZone,
  permissions,
  members,
  overdue,
  summary,
  policies,
  attestations,
  personnel,
  campaigns,
  vendors,
}: {
  engagementId: string;
  currentUserId: string;
  timeZone: string;
  permissions: Permissions;
  members: Array<{ id: string; label: string }>;
  overdue: Array<{ kind: string; id: string; label: string; dueAt: string }>;
  summary: {
    publishedPolicies: number;
    pendingAttestations: number;
    personnelExceptions: number;
    openAccessDecisions: number;
    vendorsNeedingAction: number;
  };
  policies: Policy[];
  attestations: Attestation[];
  personnel: Personnel[];
  campaigns: Campaign[];
  vendors: Vendor[];
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
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--oak-shield)]">Operational GRC</p>
        <h2 className="text-2xl font-semibold text-slate-950">Policies, people, access, and vendors</h2>
        <p className="max-w-4xl text-sm leading-6 text-slate-700">
          Run client-owned governance work with accountable approvals, clear evidence trails, and overdue work visible to assessors without granting assessor-side mutation rights.
        </p>
        <p className="text-sm text-slate-600">All due dates use your saved timezone: <strong>{timeZone}</strong>.</p>
        {message ? <p className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" role="status">{message}</p> : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Published policies" value={summary.publishedPolicies} />
        <Metric label="Pending acceptances" value={summary.pendingAttestations} />
        <Metric label="Personnel exceptions" value={summary.personnelExceptions} />
        <Metric label="Access actions" value={summary.openAccessDecisions} />
        <Metric label="Vendor actions" value={summary.vendorsNeedingAction} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overdue work</CardTitle>
          <CardDescription>{overdue.length} unresolved item{overdue.length === 1 ? '' : 's'} past due.</CardDescription>
        </CardHeader>
        <CardContent>
          {overdue.length === 0 ? <p className="text-sm text-slate-600">No overdue governance work.</p> : (
            <ul className="divide-y divide-slate-100">
              {overdue.map((item) => <li key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{item.label}</span><span className="text-red-700">Due <UserDateTime value={item.dueAt} /></span></li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      <section id="policies" className="space-y-4">
        <SectionHeading title="Policy lifecycle and acceptance" description="Versioned drafts, client approval, publication, attestations, periodic review, and retirement." />
        {permissions.canWritePolicy ? <CreatePolicyForm engagementId={engagementId} members={members} pending={pending} run={run} timeZone={timeZone} /> : null}
        <div className="space-y-3">
          {policies.length === 0 ? <Empty label="No policies recorded." /> : policies.map((policy) => (
            <PolicyCard key={policy.id} engagementId={engagementId} policy={policy} permissions={permissions} pending={pending} run={run} timeZone={timeZone} />
          ))}
        </div>
        <Card>
          <CardHeader><CardTitle>Policy attestations</CardTitle><CardDescription>Each person accepts only their own published-policy assignment.</CardDescription></CardHeader>
          <CardContent>
            {attestations.length === 0 ? <Empty label="No policy attestations issued." /> : (
              <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-600"><th className="py-2 pr-3">Policy</th><th className="py-2 pr-3">Person</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Due</th><th className="py-2">Action</th></tr></thead><tbody>
                {attestations.map((attestation) => <tr key={attestation.id} className="border-b border-slate-100"><td className="py-2 pr-3">{attestation.policyTitle} v{attestation.policyVersion}</td><td className="py-2 pr-3">{attestation.userLabel}</td><td className="py-2 pr-3">{attestation.status}</td><td className="py-2 pr-3"><UserDateTime value={attestation.dueAt} /></td><td className="py-2">{permissions.canAcceptPolicy && attestation.userId === currentUserId && attestation.status === 'pending' ? <Button size="sm" disabled={pending} onClick={() => run(() => acceptGovernancePolicy({ engagementId, attestationId: attestation.id }), 'Policy acceptance recorded.')}>Accept policy</Button> : attestation.acceptedAt ? <UserDateTime value={attestation.acceptedAt} /> : '—'}</td></tr>)}
              </tbody></table></div>
            )}
          </CardContent>
        </Card>
      </section>

      <section id="personnel" className="space-y-4">
        <SectionHeading title="Personnel assurance" description="Screening, training, lifecycle state, and termination offboarding evidence." />
        {permissions.canManagePersonnel ? <CreatePersonnelForm engagementId={engagementId} members={members} pending={pending} run={run} timeZone={timeZone} /> : null}
        <div className="space-y-3">{personnel.length === 0 ? <Empty label="No personnel assurance records." /> : personnel.map((record) => <PersonnelCard key={record.id} engagementId={engagementId} record={record} members={members} editable={permissions.canManagePersonnel} pending={pending} run={run} />)}</div>
      </section>

      <section id="access-reviews" className="space-y-4">
        <SectionHeading title="Access reviews" description="Campaign scope, accountable decisions, and closure only after revoke/modify remediation." />
        {permissions.canManageAccessReviews ? <CreateAccessReviewForm engagementId={engagementId} members={members} pending={pending} run={run} timeZone={timeZone} /> : null}
        <div className="space-y-3">{campaigns.length === 0 ? <Empty label="No access review campaigns." /> : campaigns.map((campaign) => <AccessReviewCard key={campaign.id} engagementId={engagementId} campaign={campaign} editable={permissions.canManageAccessReviews} pending={pending} run={run} />)}</div>
      </section>

      <section id="vendors" className="space-y-4">
        <SectionHeading title="Vendor risk register" description="Due diligence, inherent and residual risk, accountable acceptance, monitoring, and offboarding." />
        {permissions.canManageVendors ? <CreateVendorForm engagementId={engagementId} members={members} pending={pending} run={run} /> : null}
        <div className="space-y-3">{vendors.length === 0 ? <Empty label="No vendor risk records." /> : vendors.map((vendor) => <VendorCard key={vendor.id} engagementId={engagementId} vendor={vendor} members={members} permissions={permissions} pending={pending} run={run} timeZone={timeZone} />)}</div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-[var(--field-border)] bg-white p-4"><p className="text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-600">{label}</p></div>;
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return <header><h3 className="text-xl font-semibold text-slate-950">{title}</h3><p className="mt-1 text-sm text-slate-600">{description}</p></header>;
}

function Empty({ label }: { label: string }) {
  return <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">{label}</p>;
}

function OwnerSelect({ members, defaultValue }: { members: Array<{ id: string; label: string }>; defaultValue?: string | null }) {
  return <label className="space-y-1 text-sm font-medium text-slate-800">Owner<select name="ownerUserId" defaultValue={defaultValue ?? ''} required className="h-10 w-full rounded-md border border-[var(--field-border)] bg-white px-3 text-sm"><option value="" disabled>Select client owner</option>{members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></label>;
}

function CreatePolicyForm({ engagementId, members, pending, run, timeZone }: FormCommon & { timeZone: string }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    run(() => createGovernancePolicy({
      engagementId,
      title: String(values.get('title')),
      category: String(values.get('category')),
      content: String(values.get('content')),
      reviewDate: String(values.get('reviewDate')),
      ownerUserId: String(values.get('ownerUserId')),
    }).then(() => form.reset()), 'Policy draft created.');
  }
  return <Card><CardHeader><CardTitle>Create policy</CardTitle><CardDescription>Review date is interpreted in {timeZone}.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="grid gap-3 md:grid-cols-2"><Field name="title" label="Policy title" required minLength={3} /><Field name="category" label="Category" required minLength={2} /><OwnerSelect members={members} /><Field name="reviewDate" label={`Review due (${timeZone})`} type="date" required /><label className="space-y-1 text-sm font-medium text-slate-800 md:col-span-2">Policy content<textarea name="content" required minLength={50} rows={6} className="w-full rounded-md border border-[var(--field-border)] bg-white px-3 py-2 text-sm" /></label><div className="md:col-span-2"><Button disabled={pending}>Create draft</Button></div></form></CardContent></Card>;
}

function PolicyCard({ engagementId, policy, permissions, pending, run, timeZone }: { engagementId: string; policy: Policy; permissions: Permissions; pending: boolean; run: Runner; timeZone: string }) {
  const [attestationDueDate, setAttestationDueDate] = useState('');
  return <Card><CardHeader><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><CardTitle>{policy.title} · v{policy.version}</CardTitle><CardDescription>{policy.category} · {policy.status.replace('_', ' ')} · review due <UserDateTime value={policy.reviewDueAt} /></CardDescription></div><span className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-1 text-xs text-slate-700">{policy.status}</span></div></CardHeader><CardContent className="space-y-3"><p className="whitespace-pre-wrap text-sm text-slate-700">{policy.content}</p><div className="flex flex-wrap items-end gap-2">
    {permissions.canWritePolicy && policy.status === 'draft' ? <Button disabled={pending} onClick={() => run(() => transitionGovernancePolicy({ engagementId, policyId: policy.id, nextStatus: 'in_review' }), 'Policy submitted for client approval.')}>Submit for approval</Button> : null}
    {permissions.canWritePolicy && ['in_review', 'approved'].includes(policy.status) ? <Button variant="outline" disabled={pending} onClick={() => run(() => transitionGovernancePolicy({ engagementId, policyId: policy.id, nextStatus: 'draft' }), 'Policy returned to draft.')}>Return to draft</Button> : null}
    {permissions.canApprovePolicy && policy.status === 'in_review' ? <Button disabled={pending} onClick={() => run(() => transitionGovernancePolicy({ engagementId, policyId: policy.id, nextStatus: 'approved' }), 'Policy approved.')}>Approve</Button> : null}
    {permissions.canApprovePolicy && policy.status === 'approved' ? <><label className="text-xs font-medium text-slate-700">Acceptance due ({timeZone})<Input type="date" value={attestationDueDate} onChange={(event) => setAttestationDueDate(event.target.value)} /></label><Button disabled={pending || !attestationDueDate} onClick={() => run(() => transitionGovernancePolicy({ engagementId, policyId: policy.id, nextStatus: 'published', attestationDueDate }), 'Policy published and attestations issued.')}>Publish</Button></> : null}
    {permissions.canApprovePolicy && policy.status === 'published' ? <Button variant="outline" disabled={pending} onClick={() => run(() => transitionGovernancePolicy({ engagementId, policyId: policy.id, nextStatus: 'retired' }), 'Policy retired.')}>Retire</Button> : null}
    {permissions.canWritePolicy && ['approved', 'published', 'retired'].includes(policy.status) ? <Button variant="outline" disabled={pending} onClick={() => run(() => reviseGovernancePolicy({ engagementId, policyId: policy.id }), 'New policy revision created.')}>Create next revision</Button> : null}
  </div></CardContent></Card>;
}

function CreatePersonnelForm({ engagementId, members, pending, run, timeZone }: FormCommon & { timeZone: string }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    run(() => createPersonnelAssuranceRecord({ engagementId, personName: String(values.get('personName')), personEmail: String(values.get('personEmail')), roleTitle: String(values.get('roleTitle')) || null, trainingDueDate: String(values.get('trainingDueDate')) || null, ownerUserId: String(values.get('ownerUserId')) }).then(() => form.reset()), 'Personnel record created.');
  }
  return <Card><CardHeader><CardTitle>Add personnel record</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-3 md:grid-cols-2"><Field name="personName" label="Person name" required /><Field name="personEmail" label="Work email" type="email" required /><Field name="roleTitle" label="Role title" /><Field name="trainingDueDate" label={`Training due (${timeZone})`} type="date" /><OwnerSelect members={members} /><div className="md:col-span-2"><Button disabled={pending}>Add person</Button></div></form></CardContent></Card>;
}

function PersonnelCard({ engagementId, record, members, editable, pending, run }: { engagementId: string; record: Personnel; members: Array<{ id: string; label: string }>; editable: boolean; pending: boolean; run: Runner }) {
  const [employmentStatus, setEmploymentStatus] = useState(record.employmentStatus);
  const [screeningStatus, setScreeningStatus] = useState(record.screeningStatus);
  const [screeningExpiresDate, setScreeningExpiresDate] = useState(record.screeningExpiresDate);
  const [trainingDueDate, setTrainingDueDate] = useState(record.trainingDueDate);
  const [trainingCompleted, setTrainingCompleted] = useState(Boolean(record.trainingCompletedAt));
  const [offboardingDueDate, setOffboardingDueDate] = useState(record.offboardingDueDate);
  const [offboardingCompleted, setOffboardingCompleted] = useState(Boolean(record.offboardingCompletedAt));
  const [ownerUserId, setOwnerUserId] = useState(record.ownerUserId ?? '');
  const [notes, setNotes] = useState(record.notes ?? '');
  return <Card><CardHeader><CardTitle>{record.personName}</CardTitle><CardDescription>{record.personEmail}{record.roleTitle ? ` · ${record.roleTitle}` : ''} · {record.employmentStatus}</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <SelectField label="Employment" value={employmentStatus} onChange={setEmploymentStatus} disabled={!editable} options={['onboarding', 'active', 'suspended', 'terminated']} />
    <SelectField label="Screening" value={screeningStatus} onChange={setScreeningStatus} disabled={!editable} options={['not_required', 'pending', 'verified', 'expired']} />
    <DateState label="Screening expires" value={screeningExpiresDate} onChange={setScreeningExpiresDate} disabled={!editable} />
    <DateState label="Training due" value={trainingDueDate} onChange={setTrainingDueDate} disabled={!editable} />
    <DateState label="Offboarding due" value={offboardingDueDate} onChange={setOffboardingDueDate} disabled={!editable} />
    <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={trainingCompleted} onChange={(event) => setTrainingCompleted(event.target.checked)} disabled={!editable} />Training complete</label>
    <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={offboardingCompleted} onChange={(event) => setOffboardingCompleted(event.target.checked)} disabled={!editable} />Offboarding complete</label>
    <label className="space-y-1 text-sm font-medium">Owner<select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} disabled={!editable} className="h-10 w-full rounded-md border border-[var(--field-border)] bg-white px-2">{members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></label>
    <label className="space-y-1 text-sm font-medium md:col-span-2 xl:col-span-4">Notes<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!editable} className="w-full rounded-md border border-[var(--field-border)] bg-white px-3 py-2 text-sm" /></label>
    {editable ? <div className="md:col-span-2 xl:col-span-4"><Button disabled={pending || !ownerUserId} onClick={() => run(() => updatePersonnelAssuranceRecord({ engagementId, personnelId: record.id, employmentStatus: employmentStatus as 'onboarding' | 'active' | 'suspended' | 'terminated', screeningStatus: screeningStatus as 'not_required' | 'pending' | 'verified' | 'expired', screeningExpiresDate: screeningExpiresDate || null, trainingDueDate: trainingDueDate || null, trainingCompleted, offboardingDueDate: offboardingDueDate || null, offboardingCompleted, ownerUserId, notes }), 'Personnel assurance record updated.')}>Save personnel state</Button></div> : null}
  </CardContent></Card>;
}

function CreateAccessReviewForm({ engagementId, members, pending, run, timeZone }: FormCommon & { timeZone: string }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    run(() => createAccessReviewCampaign({ engagementId, title: String(values.get('title')), scope: String(values.get('scope')), dueDate: String(values.get('dueDate')), ownerUserId: String(values.get('ownerUserId')), items: String(values.get('items')) }).then(() => form.reset()), 'Access review campaign created.');
  }
  return <Card><CardHeader><CardTitle>Create access review</CardTitle><CardDescription>One record per line: Name | System | Access level | optional email.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="grid gap-3 md:grid-cols-2"><Field name="title" label="Campaign title" required /><Field name="dueDate" label={`Due date (${timeZone})`} type="date" required /><OwnerSelect members={members} /><label className="space-y-1 text-sm font-medium">Scope<Input name="scope" required minLength={10} /></label><label className="space-y-1 text-sm font-medium md:col-span-2">Access records<textarea name="items" required rows={5} placeholder="Alex Smith | AWS production | Administrator | alex@example.com" className="w-full rounded-md border border-[var(--field-border)] bg-white px-3 py-2 text-sm" /></label><div className="md:col-span-2"><Button disabled={pending}>Create campaign</Button></div></form></CardContent></Card>;
}

function AccessReviewCard({ engagementId, campaign, editable, pending, run }: { engagementId: string; campaign: Campaign; editable: boolean; pending: boolean; run: Runner }) {
  const decided = campaign.items.filter((item) => item.decision !== 'pending').length;
  return <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle>{campaign.title}</CardTitle><CardDescription>{campaign.scope} · {decided}/{campaign.items.length} decided · due <UserDateTime value={campaign.dueAt} /></CardDescription></div><span className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-1 text-xs">{campaign.status.replace('_', ' ')}</span></div></CardHeader><CardContent className="space-y-3">
    {editable && campaign.status === 'draft' ? <Button disabled={pending} onClick={() => run(() => startAccessReviewCampaign({ engagementId, campaignId: campaign.id }), 'Access review started.')}>Start review</Button> : null}
    <div className="space-y-2">{campaign.items.map((item) => <AccessItemEditor key={item.id} engagementId={engagementId} item={item} editable={editable && ['in_progress', 'in_review'].includes(campaign.status)} pending={pending} run={run} />)}</div>
    {editable && campaign.status === 'in_review' ? <Button disabled={pending} onClick={() => run(() => completeAccessReviewCampaign({ engagementId, campaignId: campaign.id }), 'Access review completed and locked.')}>Complete review</Button> : null}
  </CardContent></Card>;
}

function AccessItemEditor({ engagementId, item, editable, pending, run }: { engagementId: string; item: AccessItem; editable: boolean; pending: boolean; run: Runner }) {
  const [decision, setDecision] = useState(item.decision === 'pending' ? 'retain' : item.decision);
  const [rationale, setRationale] = useState(item.rationale ?? '');
  const [remediationStatus, setRemediationStatus] = useState(item.remediationStatus);
  return <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"><div><p className="font-medium text-slate-900">{item.subjectName}</p><p className="text-xs text-slate-600">{item.systemName} · {item.accessLevel}{item.subjectEmail ? ` · ${item.subjectEmail}` : ''}</p></div><SelectField label="Decision" value={decision} onChange={(value) => { setDecision(value); if (value === 'retain') setRemediationStatus('none'); else if (remediationStatus === 'none') setRemediationStatus('open'); }} disabled={!editable} options={['retain', 'modify', 'revoke']} /><label className="space-y-1 text-xs font-medium">Rationale<Input value={rationale} onChange={(event) => setRationale(event.target.value)} disabled={!editable} /></label><SelectField label="Remediation" value={remediationStatus} onChange={setRemediationStatus} disabled={!editable || decision === 'retain'} options={['none', 'open', 'complete']} />{editable ? <Button className="self-end" size="sm" disabled={pending} onClick={() => run(() => decideAccessReviewItem({ engagementId, itemId: item.id, decision: decision as 'retain' | 'modify' | 'revoke', rationale, remediationStatus: remediationStatus as 'none' | 'open' | 'complete' }), 'Access decision saved.')}>Save</Button> : null}</div>;
}

function CreateVendorForm({ engagementId, members, pending, run }: FormCommon) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    run(() => createVendorRiskRecord({ engagementId, vendorName: String(values.get('vendorName')), serviceDescription: String(values.get('serviceDescription')), criticality: String(values.get('criticality')) as 'low' | 'medium' | 'high' | 'critical', inherentRisk: String(values.get('inherentRisk')) as 'low' | 'medium' | 'high' | 'critical', ownerUserId: String(values.get('ownerUserId')) }).then(() => form.reset()), 'Vendor added to risk register.');
  }
  return <Card><CardHeader><CardTitle>Add vendor</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-3 md:grid-cols-2"><Field name="vendorName" label="Vendor name" required /><Field name="serviceDescription" label="Service description" required minLength={10} /><SelectInput name="criticality" label="Business criticality" options={['low', 'medium', 'high', 'critical']} /><SelectInput name="inherentRisk" label="Inherent risk" options={['low', 'medium', 'high', 'critical']} defaultValue="medium" /><OwnerSelect members={members} /><div className="md:col-span-2"><Button disabled={pending}>Add vendor</Button></div></form></CardContent></Card>;
}

function VendorCard({ engagementId, vendor, members, permissions, pending, run, timeZone }: { engagementId: string; vendor: Vendor; members: Array<{ id: string; label: string }>; permissions: Permissions; pending: boolean; run: Runner; timeZone: string }) {
  const [inherentRisk, setInherentRisk] = useState(vendor.inherentRisk);
  const [residualRisk, setResidualRisk] = useState(vendor.residualRisk ?? 'medium');
  const [dataHandled, setDataHandled] = useState(vendor.dataHandled ?? '');
  const [dueDiligenceSummary, setDueDiligenceSummary] = useState(vendor.dueDiligenceSummary ?? '');
  const [contractExpiryDate, setContractExpiryDate] = useState(vendor.contractExpiryDate);
  const [nextReviewDate, setNextReviewDate] = useState(vendor.nextReviewDate);
  const [ownerUserId, setOwnerUserId] = useState(vendor.ownerUserId ?? '');
  const [riskAcceptanceStatement, setRiskAcceptanceStatement] = useState(vendor.riskAcceptanceStatement ?? '');
  const canAssess = permissions.canManageVendors && ['intake', 'assessing', 'monitoring'].includes(vendor.status);
  return <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle>{vendor.vendorName}</CardTitle><CardDescription>{vendor.serviceDescription} · {vendor.criticality} criticality · {vendor.status}</CardDescription></div><span className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-1 text-xs">Residual risk: {vendor.residualRisk ?? 'not assessed'}</span></div></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><SelectField label="Inherent risk" value={inherentRisk} onChange={setInherentRisk} disabled={!canAssess} options={['low', 'medium', 'high', 'critical']} /><SelectField label="Residual risk" value={residualRisk} onChange={setResidualRisk} disabled={!canAssess} options={['low', 'medium', 'high', 'critical']} /><DateState label={`Contract expiry (${timeZone})`} value={contractExpiryDate} onChange={setContractExpiryDate} disabled={!canAssess} /><DateState label={`Next review (${timeZone})`} value={nextReviewDate} onChange={setNextReviewDate} disabled={!canAssess} /><label className="space-y-1 text-sm font-medium xl:col-span-2">Data handled<Input value={dataHandled} onChange={(event) => setDataHandled(event.target.value)} disabled={!canAssess} /></label><label className="space-y-1 text-sm font-medium">Owner<select value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} disabled={!canAssess} className="h-10 w-full rounded-md border border-[var(--field-border)] bg-white px-2">{members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></label><label className="space-y-1 text-sm font-medium xl:col-span-4">Due diligence summary<textarea rows={3} value={dueDiligenceSummary} onChange={(event) => setDueDiligenceSummary(event.target.value)} disabled={!canAssess} className="w-full rounded-md border border-[var(--field-border)] bg-white px-3 py-2 text-sm" /></label></div>
    {canAssess ? <Button variant="outline" disabled={pending || dueDiligenceSummary.trim().length < 20 || !nextReviewDate || !ownerUserId} onClick={() => run(() => assessVendorRisk({ engagementId, vendorId: vendor.id, inherentRisk: inherentRisk as 'low' | 'medium' | 'high' | 'critical', residualRisk: residualRisk as 'low' | 'medium' | 'high' | 'critical', dataHandled, dueDiligenceSummary, contractExpiryDate: contractExpiryDate || null, nextReviewDate, ownerUserId }), 'Vendor assessment saved.')}>Save assessment</Button> : null}
    {permissions.canAcceptVendorRisk && vendor.status === 'assessing' ? <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3"><Label htmlFor={`vendor-risk-${vendor.id}`}>Risk acceptance statement {['high', 'critical'].includes(vendor.residualRisk ?? '') ? '(required)' : '(optional)'}</Label><Input id={`vendor-risk-${vendor.id}`} value={riskAcceptanceStatement} onChange={(event) => setRiskAcceptanceStatement(event.target.value)} /><Button disabled={pending || (['high', 'critical'].includes(vendor.residualRisk ?? '') && riskAcceptanceStatement.trim().length < 20)} onClick={() => run(() => transitionVendorRisk({ engagementId, vendorId: vendor.id, nextStatus: 'approved', riskAcceptanceStatement }), 'Vendor approved with accountable risk decision.')}>Approve vendor</Button></div> : null}
    <div className="flex flex-wrap gap-2">{permissions.canManageVendors && vendor.status === 'approved' ? <><Button disabled={pending} onClick={() => run(() => transitionVendorRisk({ engagementId, vendorId: vendor.id, nextStatus: 'monitoring' }), 'Vendor moved to monitoring.')}>Start monitoring</Button><Button variant="outline" disabled={pending} onClick={() => run(() => transitionVendorRisk({ engagementId, vendorId: vendor.id, nextStatus: 'offboarding' }), 'Vendor offboarding started.')}>Offboard</Button></> : null}{permissions.canManageVendors && vendor.status === 'monitoring' ? <><Button variant="outline" disabled={pending} onClick={() => run(() => transitionVendorRisk({ engagementId, vendorId: vendor.id, nextStatus: 'assessing' }), 'Vendor reassessment started.')}>Reassess</Button><Button variant="outline" disabled={pending} onClick={() => run(() => transitionVendorRisk({ engagementId, vendorId: vendor.id, nextStatus: 'offboarding' }), 'Vendor offboarding started.')}>Offboard</Button></> : null}{permissions.canManageVendors && vendor.status === 'offboarding' ? <Button disabled={pending} onClick={() => run(() => transitionVendorRisk({ engagementId, vendorId: vendor.id, nextStatus: 'closed' }), 'Vendor record closed.')}>Close vendor</Button> : null}</div>
  </CardContent></Card>;
}

type Runner = (task: () => Promise<unknown>, success: string) => void;
type FormCommon = { engagementId: string; members: Array<{ id: string; label: string }>; pending: boolean; run: Runner };

function Field({ name, label, type = 'text', required, minLength }: { name: string; label: string; type?: string; required?: boolean; minLength?: number }) {
  return <label className="space-y-1 text-sm font-medium text-slate-800">{label}<Input name={name} type={type} required={required} minLength={minLength} /></label>;
}

function SelectInput({ name, label, options, defaultValue }: { name: string; label: string; options: string[]; defaultValue?: string }) {
  return <label className="space-y-1 text-sm font-medium text-slate-800">{label}<select name={name} defaultValue={defaultValue ?? options[0]} className="h-10 w-full rounded-md border border-[var(--field-border)] bg-white px-3 text-sm">{options.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}</select></label>;
}

function SelectField({ label, value, onChange, disabled, options }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; options: string[] }) {
  return <label className="space-y-1 text-xs font-medium text-slate-700">{label}<select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="h-10 w-full rounded-md border border-[var(--field-border)] bg-white px-2 text-sm">{options.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}</select></label>;
}

function DateState({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <label className="space-y-1 text-xs font-medium text-slate-700">{label}<Input type="date" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} /></label>;
}
