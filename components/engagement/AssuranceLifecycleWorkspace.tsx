'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  createMonitoringEvent,
  createSystemRisk,
  recordRiskTreatmentDecision,
  recordSystemAuthorisation,
  resolveMonitoringEvent,
  upsertContinuousMonitoringPlan,
} from '@/app/actions/assurance-lifecycle';
import { UserDateTime } from '@/components/timezone/UserTimezone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AUTHORISATION_STATUSES,
  MONITORING_EVENT_TYPES,
  RISK_TREATMENT_DECISIONS,
  riskRating,
  riskScore,
  type AuthorisationStatus,
  type LifecycleStage,
  type MonitoringEventType,
  type RiskTreatmentDecision,
} from '@/lib/assurance-lifecycle';

type Treatment = {
  id: string;
  decision: string;
  rationale: string;
  treatmentPlan: string | null;
  ownerName: string | null;
  dueAt: string | null;
  acceptedByName: string | null;
  acceptedByRole: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type Risk = {
  id: string;
  code: string;
  title: string;
  description: string;
  asset: string;
  threat: string;
  vulnerability: string;
  inherentLikelihood: number;
  inherentImpact: number;
  existingControls: string | null;
  residualLikelihood: number;
  residualImpact: number;
  ownerName: string | null;
  status: string;
  createdAt: string;
  latestTreatment: Treatment | null;
};

type Authorisation = {
  id: string;
  version: number;
  status: string;
  systemOwnerName: string;
  authorisingOfficerName: string | null;
  authorisingOfficerRole: string | null;
  decisionStatement: string | null;
  conditions: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type MonitoringPlan = {
  status: string;
  objectives: string;
  cadenceDays: number;
  ownerName: string;
  ownerEmail: string | null;
  monitoredSignals: string[];
  changeTriggers: string[];
  nextReviewAt: string;
  nextReviewInput: string;
  lastReviewedAt: string | null;
  lastReviewedInput: string;
} | null;

type MonitoringEvent = {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  source: string | null;
  relatedRiskId: string | null;
  detectedAt: string;
  requiresReassessment: boolean;
  status: string;
  triageNotes: string | null;
  closedAt: string | null;
};

type Permissions = {
  canAssessRisk: boolean;
  canTreatRisk: boolean;
  canAcceptRisk: boolean;
  canAuthorise: boolean;
  canManageMonitoring: boolean;
  canRecordMonitoringEvent: boolean;
};

export function AssuranceLifecycleWorkspace({
  engagementId,
  frameworkLabel,
  stages,
  risks,
  authorisations,
  monitoringPlan,
  events,
  permissions,
  timeZone,
  currentLocalDateTime,
}: {
  engagementId: string;
  frameworkLabel: string;
  stages: LifecycleStage[];
  risks: Risk[];
  authorisations: Authorisation[];
  monitoringPlan: MonitoringPlan;
  events: MonitoringEvent[];
  permissions: Permissions;
  timeZone: string;
  currentLocalDateTime: string;
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--oak-shield)]">ISM assurance lifecycle</p>
        <h2 className="text-2xl font-semibold text-slate-950">Risk, authorisation, and continuous monitoring</h2>
        <p className="max-w-4xl text-sm leading-6 text-slate-700">
          Carry {frameworkLabel} assessment outcomes through accountable risk treatment, system authorisation,
          continuous monitoring, and change-triggered reassessment.
        </p>
        <p className="text-sm text-slate-600">All dates you enter and see here use your saved timezone: <strong>{timeZone}</strong>.</p>
      </header>

      <ol className="grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-3 xl:grid-cols-6">
        {stages.map((stage) => (
          <li key={stage.key} className="bg-[var(--panel-surface)] p-4">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${stageColour(stage.state)}`} aria-hidden="true" />
            <h3 className="mt-3 text-sm font-semibold text-slate-950">{stage.label}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">{stage.detail}</p>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>System risk register</CardTitle>
          <CardDescription>Record inherent exposure, controls already operating, and the resulting residual risk.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {risks.length ? (
            <div className="space-y-4">
              {risks.map((risk) => (
                <RiskPanel
                  key={risk.id}
                  engagementId={engagementId}
                  risk={risk}
                  canTreat={permissions.canTreatRisk}
                  canAccept={permissions.canAcceptRisk}
                  currentLocalDateTime={currentLocalDateTime}
                  timeZone={timeZone}
                />
              ))}
            </div>
          ) : <EmptyState>No system risks recorded.</EmptyState>}
          {permissions.canAssessRisk ? <CreateRiskForm engagementId={engagementId} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System authorisation record</CardTitle>
          <CardDescription>Immutable decision versions preserve who accepted operational accountability and on what basis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {authorisations.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
                  <tr><th className="py-2 pr-4">Version</th><th className="py-2 pr-4">Decision</th><th className="py-2 pr-4">Accountable officer</th><th className="py-2 pr-4">Issued</th><th className="py-2">Expiry</th></tr>
                </thead>
                <tbody>
                  {authorisations.map((record) => (
                    <tr key={record.id} className="border-b border-slate-100 align-top">
                      <td className="py-3 pr-4 font-mono">v{record.version}</td>
                      <td className="py-3 pr-4"><strong>{label(record.status)}</strong>{record.decisionStatement ? <p className="mt-1 max-w-md text-xs text-slate-600">{record.decisionStatement}</p> : null}</td>
                      <td className="py-3 pr-4">{record.authorisingOfficerName ?? 'Not decided'}{record.authorisingOfficerRole ? <span className="block text-xs text-slate-600">{record.authorisingOfficerRole}</span> : null}</td>
                      <td className="py-3 pr-4">{record.issuedAt ? <UserDateTime value={record.issuedAt} /> : '—'}</td>
                      <td className="py-3">{record.expiresAt ? <UserDateTime value={record.expiresAt} /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState>No authorisation decision recorded.</EmptyState>}
          {permissions.canAuthorise ? <AuthorisationForm engagementId={engagementId} currentLocalDateTime={currentLocalDateTime} /> : (
            <p className="text-sm text-slate-600">Only a client administrator can record the accountable system authorisation decision.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Continuous monitoring plan</CardTitle>
          <CardDescription>Define review cadence, watched signals, and change events that return the system to assessment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {monitoringPlan ? (
            <div className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
              <Metric label="Status" value={label(monitoringPlan.status)} />
              <Metric label="Owner" value={monitoringPlan.ownerName} />
              <Metric label="Next review" valueNode={<UserDateTime value={monitoringPlan.nextReviewAt} />} />
            </div>
          ) : <EmptyState>No continuous monitoring plan configured.</EmptyState>}
          {permissions.canManageMonitoring ? (
            <MonitoringPlanForm engagementId={engagementId} value={monitoringPlan} currentLocalDateTime={currentLocalDateTime} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monitoring events and reassessment triggers</CardTitle>
          <CardDescription>Control failures and material changes automatically flag a reassessment requirement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {events.length ? (
            <div className="space-y-3">
              {events.map((event) => (
                <MonitoringEventPanel
                  key={event.id}
                  engagementId={engagementId}
                  event={event}
                  canManage={permissions.canManageMonitoring}
                />
              ))}
            </div>
          ) : <EmptyState>No monitoring events recorded.</EmptyState>}
          {permissions.canRecordMonitoringEvent ? (
            <MonitoringEventForm engagementId={engagementId} risks={risks} currentLocalDateTime={currentLocalDateTime} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateRiskForm({ engagementId }: { engagementId: string }) {
  return (
    <ActionForm
      legend="Record a system risk"
      success="System risk added."
      submitLabel="Add risk"
      run={async (form) => createSystemRisk({
        engagementId,
        title: value(form, 'title'),
        description: value(form, 'description'),
        asset: value(form, 'asset'),
        threat: value(form, 'threat'),
        vulnerability: value(form, 'vulnerability'),
        inherentLikelihood: value(form, 'inherentLikelihood'),
        inherentImpact: value(form, 'inherentImpact'),
        existingControls: value(form, 'existingControls'),
        residualLikelihood: value(form, 'residualLikelihood'),
        residualImpact: value(form, 'residualImpact'),
        ownerName: value(form, 'ownerName'),
        ownerEmail: value(form, 'ownerEmail'),
      })}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Risk title" name="title"><Input name="title" required minLength={3} /></Field>
        <Field label="Asset or process" name="asset"><Input name="asset" required /></Field>
      </div>
      <Field label="Risk statement" name="description"><TextArea name="description" required minLength={10} placeholder="Describe the event, cause, and consequence." /></Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Threat" name="threat"><TextArea name="threat" required /></Field>
        <Field label="Vulnerability" name="vulnerability"><TextArea name="vulnerability" required /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreSelect name="inherentLikelihood" labelText="Inherent likelihood" />
        <ScoreSelect name="inherentImpact" labelText="Inherent impact" />
        <ScoreSelect name="residualLikelihood" labelText="Residual likelihood" />
        <ScoreSelect name="residualImpact" labelText="Residual impact" />
      </div>
      <Field label="Existing controls" name="existingControls"><TextArea name="existingControls" /></Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Risk owner" name="ownerName"><Input name="ownerName" /></Field>
        <Field label="Owner email" name="ownerEmail"><Input name="ownerEmail" type="email" /></Field>
      </div>
    </ActionForm>
  );
}

function RiskPanel({ engagementId, risk, canTreat, canAccept, currentLocalDateTime, timeZone }: {
  engagementId: string;
  risk: Risk;
  canTreat: boolean;
  canAccept: boolean;
  currentLocalDateTime: string;
  timeZone: string;
}) {
  const residual = riskRating(risk.residualLikelihood, risk.residualImpact);
  return (
    <details className="group rounded-md border border-slate-200 bg-[var(--panel-surface)]" open={residual === 'high' || residual === 'extreme'}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
        <span><span className="font-mono text-xs text-slate-500">{risk.code}</span><strong className="ml-3 text-sm text-slate-950">{risk.title}</strong></span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ratingColour(residual)}`}>Residual {residual} · {riskScore(risk.residualLikelihood, risk.residualImpact)}/25</span>
      </summary>
      <div className="space-y-4 border-t border-slate-200 p-4 text-sm">
        <p className="leading-6 text-slate-700">{risk.description}</p>
        <dl className="grid gap-3 md:grid-cols-3"><Detail term="Asset" value={risk.asset} /><Detail term="Threat" value={risk.threat} /><Detail term="Vulnerability" value={risk.vulnerability} /></dl>
        <p className="text-xs text-slate-600">Inherent score {riskScore(risk.inherentLikelihood, risk.inherentImpact)}/25 · owner {risk.ownerName ?? 'unassigned'} · recorded <UserDateTime value={risk.createdAt} /></p>
        {risk.latestTreatment ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="font-semibold text-emerald-950">Latest decision: {label(risk.latestTreatment.decision)}</p>
            <p className="mt-1 text-emerald-900">{risk.latestTreatment.rationale}</p>
            <p className="mt-2 text-xs text-emerald-800">
              Recorded <UserDateTime value={risk.latestTreatment.createdAt} />
              {risk.latestTreatment.expiresAt ? <> · expires <UserDateTime value={risk.latestTreatment.expiresAt} /></> : null}
            </p>
          </div>
        ) : <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">No treatment decision recorded.</p>}
        {canTreat ? <TreatmentForm engagementId={engagementId} riskId={risk.id} canAccept={canAccept} currentLocalDateTime={currentLocalDateTime} timeZone={timeZone} /> : null}
      </div>
    </details>
  );
}

function TreatmentForm({ engagementId, riskId, canAccept, currentLocalDateTime, timeZone }: {
  engagementId: string;
  riskId: string;
  canAccept: boolean;
  currentLocalDateTime: string;
  timeZone: string;
}) {
  const [decision, setDecision] = useState<RiskTreatmentDecision>('mitigate');
  return (
    <ActionForm
      legend="Record a new treatment decision"
      success="Treatment decision recorded."
      submitLabel="Record decision"
      run={async (form) => recordRiskTreatmentDecision({
        engagementId,
        riskId,
        decision,
        rationale: value(form, 'rationale'),
        treatmentPlan: value(form, 'treatmentPlan'),
        ownerName: value(form, 'ownerName'),
        ownerEmail: value(form, 'ownerEmail'),
        dueDate: value(form, 'dueDate'),
        acceptedByName: value(form, 'acceptedByName'),
        acceptedByRole: value(form, 'acceptedByRole'),
        acceptedAt: value(form, 'acceptedAt'),
        expiresOn: value(form, 'expiresOn'),
      })}
    >
      <Field label="Decision" name={`decision-${riskId}`}>
        <select id={`decision-${riskId}`} value={decision} onChange={(event) => setDecision(event.target.value as RiskTreatmentDecision)} className={selectClass}>
          {RISK_TREATMENT_DECISIONS.filter((item) => item !== 'accept' || canAccept).map((item) => <option key={item} value={item}>{label(item)}</option>)}
        </select>
      </Field>
      <Field label="Decision rationale" name="rationale"><TextArea name="rationale" required minLength={10} /></Field>
      {decision === 'accept' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Accepted by" name="acceptedByName"><Input name="acceptedByName" required /></Field>
          <Field label="Accountable role" name="acceptedByRole"><Input name="acceptedByRole" required /></Field>
          <Field label={`Accepted at (${timeZone})`} name="acceptedAt"><Input name="acceptedAt" type="datetime-local" required defaultValue={currentLocalDateTime} /></Field>
          <Field label="Acceptance expiry" name="expiresOn"><Input name="expiresOn" type="date" required /></Field>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Treatment plan" name="treatmentPlan"><TextArea name="treatmentPlan" required /></Field>
          <div className="grid gap-4">
            <Field label="Treatment owner" name="ownerName"><Input name="ownerName" required /></Field>
            <Field label="Owner email" name="ownerEmail"><Input name="ownerEmail" type="email" /></Field>
            <Field label="Due date" name="dueDate"><Input name="dueDate" type="date" required /></Field>
          </div>
        </div>
      )}
    </ActionForm>
  );
}

function AuthorisationForm({ engagementId, currentLocalDateTime }: { engagementId: string; currentLocalDateTime: string }) {
  const [status, setStatus] = useState<AuthorisationStatus>('draft');
  const decided = ['authorised', 'authorised_with_conditions', 'declined'].includes(status);
  return (
    <ActionForm
      legend="Record a new authorisation version"
      success="Authorisation version recorded."
      submitLabel="Record authorisation"
      run={async (form) => recordSystemAuthorisation({
        engagementId,
        status,
        systemOwnerName: value(form, 'systemOwnerName'),
        authorisingOfficerName: value(form, 'authorisingOfficerName'),
        authorisingOfficerRole: value(form, 'authorisingOfficerRole'),
        decisionStatement: value(form, 'decisionStatement'),
        conditions: value(form, 'conditions'),
        issuedAt: value(form, 'issuedAt'),
        expiresOn: value(form, 'expiresOn'),
      })}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Record status" name="authorisationStatus"><select id="authorisationStatus" value={status} onChange={(event) => setStatus(event.target.value as AuthorisationStatus)} className={selectClass}>{AUTHORISATION_STATUSES.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
        <Field label="System owner" name="systemOwnerName"><Input name="systemOwnerName" required /></Field>
      </div>
      {decided ? <>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Authorising officer" name="authorisingOfficerName"><Input name="authorisingOfficerName" required /></Field>
          <Field label="Officer role/delegation" name="authorisingOfficerRole"><Input name="authorisingOfficerRole" required /></Field>
        </div>
        <Field label="Decision statement" name="decisionStatement"><TextArea name="decisionStatement" required /></Field>
        {status === 'authorised_with_conditions' ? <Field label="Conditions" name="conditions"><TextArea name="conditions" required /></Field> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Decision date and time" name="issuedAt"><Input name="issuedAt" type="datetime-local" required defaultValue={currentLocalDateTime} /></Field>
          {status === 'authorised' || status === 'authorised_with_conditions' ? <Field label="Authorisation expiry" name="expiresOn"><Input name="expiresOn" type="date" required /></Field> : null}
        </div>
      </> : null}
    </ActionForm>
  );
}

function MonitoringPlanForm({ engagementId, value: plan, currentLocalDateTime }: { engagementId: string; value: MonitoringPlan; currentLocalDateTime: string }) {
  return (
    <ActionForm
      legend={plan ? 'Update monitoring plan' : 'Create monitoring plan'}
      success="Continuous monitoring plan saved."
      submitLabel="Save monitoring plan"
      run={async (form) => upsertContinuousMonitoringPlan({
        engagementId,
        status: value(form, 'status') as 'draft' | 'active' | 'paused' | 'retired',
        objectives: value(form, 'objectives'),
        cadenceDays: value(form, 'cadenceDays'),
        ownerName: value(form, 'ownerName'),
        ownerEmail: value(form, 'ownerEmail'),
        monitoredSignals: lines(value(form, 'monitoredSignals')),
        changeTriggers: lines(value(form, 'changeTriggers')),
        nextReviewAt: value(form, 'nextReviewAt'),
        lastReviewedAt: value(form, 'lastReviewedAt'),
      })}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Status" name="status"><select id="status" name="status" defaultValue={plan?.status ?? 'draft'} className={selectClass}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="retired">Retired</option></select></Field>
        <Field label="Review cadence (days)" name="cadenceDays"><Input name="cadenceDays" type="number" min={1} max={3650} required defaultValue={plan?.cadenceDays ?? 90} /></Field>
        <Field label="Plan owner" name="ownerName"><Input name="ownerName" required defaultValue={plan?.ownerName ?? ''} /></Field>
      </div>
      <Field label="Owner email" name="ownerEmail"><Input name="ownerEmail" type="email" defaultValue={plan?.ownerEmail ?? ''} /></Field>
      <Field label="Monitoring objectives" name="objectives"><TextArea name="objectives" required minLength={10} defaultValue={plan?.objectives ?? ''} /></Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Monitored signals (one per line)" name="monitoredSignals"><TextArea name="monitoredSignals" required defaultValue={plan?.monitoredSignals.join('\n') ?? ''} /></Field>
        <Field label="Change triggers (one per line)" name="changeTriggers"><TextArea name="changeTriggers" required defaultValue={plan?.changeTriggers.join('\n') ?? ''} /></Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Next review" name="nextReviewAt"><Input name="nextReviewAt" type="datetime-local" required defaultValue={plan?.nextReviewInput || currentLocalDateTime} /></Field>
        <Field label="Last reviewed" name="lastReviewedAt"><Input name="lastReviewedAt" type="datetime-local" defaultValue={plan?.lastReviewedInput ?? ''} /></Field>
      </div>
    </ActionForm>
  );
}

function MonitoringEventForm({ engagementId, risks, currentLocalDateTime }: { engagementId: string; risks: Risk[]; currentLocalDateTime: string }) {
  return (
    <ActionForm
      legend="Record a monitoring event"
      success="Monitoring event recorded."
      submitLabel="Add monitoring event"
      run={async (form) => createMonitoringEvent({
        engagementId,
        type: value(form, 'type') as MonitoringEventType,
        severity: value(form, 'severity') as 'low' | 'medium' | 'high' | 'critical',
        title: value(form, 'title'),
        description: value(form, 'description'),
        source: value(form, 'source'),
        relatedRiskId: value(form, 'relatedRiskId'),
        detectedAt: value(form, 'detectedAt'),
      })}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Event type" name="type"><select id="type" name="type" className={selectClass}>{MONITORING_EVENT_TYPES.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></Field>
        <Field label="Severity" name="severity"><select id="severity" name="severity" className={selectClass}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
        <Field label="Related risk" name="relatedRiskId"><select id="relatedRiskId" name="relatedRiskId" className={selectClass}><option value="">None</option>{risks.map((risk) => <option key={risk.id} value={risk.id}>{risk.code} · {risk.title}</option>)}</select></Field>
        <Field label="Detected at" name="detectedAt"><Input name="detectedAt" type="datetime-local" required defaultValue={currentLocalDateTime} /></Field>
      </div>
      <Field label="Title" name="title"><Input name="title" required /></Field>
      <Field label="Description" name="description"><TextArea name="description" required minLength={10} /></Field>
      <Field label="Source" name="source"><Input name="source" placeholder="SIEM, change record, incident, review…" /></Field>
    </ActionForm>
  );
}

function MonitoringEventPanel({ engagementId, event, canManage }: { engagementId: string; event: MonitoringEvent; canManage: boolean }) {
  return (
    <div className={`rounded-md border p-4 ${event.requiresReassessment && event.status !== 'closed' ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-semibold text-slate-950">{event.title}</p><p className="mt-1 text-xs text-slate-600">{label(event.type)} · {label(event.severity)} · <UserDateTime value={event.detectedAt} /></p></div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{label(event.status)}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">{event.description}</p>
      {event.requiresReassessment ? <p className="mt-2 text-sm font-semibold text-amber-950">Reassessment required</p> : null}
      {event.triageNotes ? <p className="mt-2 text-sm text-slate-700"><strong>Triage:</strong> {event.triageNotes}</p> : null}
      {canManage && event.status !== 'closed' ? (
        <ActionForm
          legend="Triage or close event"
          success="Monitoring event updated."
          submitLabel="Update event"
          run={async (form) => resolveMonitoringEvent({ engagementId, eventId: event.id, status: value(form, 'status') as 'triaged' | 'closed', triageNotes: value(form, 'triageNotes') })}
        >
          <div className="grid gap-4 md:grid-cols-[12rem_1fr]">
            <Field label="Status" name={`event-status-${event.id}`}><select id={`event-status-${event.id}`} name="status" defaultValue="triaged" className={selectClass}><option value="triaged">Triaged</option><option value="closed">Closed</option></select></Field>
            <Field label="Triage notes" name={`event-notes-${event.id}`}><TextArea id={`event-notes-${event.id}`} name="triageNotes" required minLength={10} /></Field>
          </div>
        </ActionForm>
      ) : null}
    </div>
  );
}

function ActionForm({ legend, success, submitLabel, run, children }: {
  legend: string;
  success: string;
  submitLabel: string;
  run: (form: FormData) => Promise<unknown>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await run(form);
        setMessage(success);
        router.refresh();
      } catch (cause) {
        setError((cause as Error).message);
      }
    });
  }
  return (
    <details className="rounded-md border border-slate-200 bg-slate-50">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-950">{legend}</summary>
      <form onSubmit={submit} className="space-y-4 border-t border-slate-200 p-4">
        {children}
        <Button variant="primary" disabled={pending}>{pending ? 'Saving…' : submitLabel}</Button>
        {message ? <p role="status" className="text-sm text-emerald-800">{message}</p> : null}
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      </form>
    </details>
  );
}

function Field({ label: text, name, children }: { label: string; name: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{text}</Label>{children}</div>;
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="min-h-24 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 py-2 text-sm text-slate-950 shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)] disabled:opacity-50" {...props} />;
}

function ScoreSelect({ name, labelText }: { name: string; labelText: string }) {
  return <Field label={labelText} name={name}><select id={name} name={name} defaultValue="3" className={selectClass}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}</select></Field>;
}

function Detail({ term, value }: { term: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{term}</dt><dd className="mt-1 text-slate-800">{value}</dd></div>;
}

function Metric({ label: text, value, valueNode }: { label: string; value?: string; valueNode?: ReactNode }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text}</p><p className="mt-1 text-sm font-semibold text-slate-950">{valueNode ?? value}</p></div>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600">{children}</p>;
}

function value(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

function lines(input: string): string[] {
  return input.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function label(input: string): string {
  return input.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function stageColour(state: LifecycleStage['state']) {
  if (state === 'complete') return 'bg-emerald-500';
  if (state === 'attention') return 'bg-amber-500';
  if (state === 'in_progress') return 'bg-blue-500';
  return 'bg-slate-300';
}

function ratingColour(rating: ReturnType<typeof riskRating>) {
  if (rating === 'extreme') return 'bg-red-100 text-red-900';
  if (rating === 'high') return 'bg-orange-100 text-orange-900';
  if (rating === 'medium') return 'bg-amber-100 text-amber-900';
  return 'bg-emerald-100 text-emerald-900';
}

const selectClass = 'flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oak-shield)]';
