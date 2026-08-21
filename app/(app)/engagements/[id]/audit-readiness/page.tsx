import Link from 'next/link';
import { and, asc, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { CheckCircle2, CircleAlert, ExternalLink, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/db/client';
import {
  auditEvidencePackages,
  auditReadinessProfiles,
  auditReadinessRequirementEvidence,
  auditReadinessRequirements,
} from '@/db/schema/audit-readiness';
import { clientOrganisations, engagements, systems } from '@/db/schema/engagements';
import { evidenceItems } from '@/db/schema/evidence';
import { frameworks } from '@/db/schema/frameworks';
import { engagementMembers } from '@/db/schema/tenants';
import { users } from '@/db/schema/auth';
import { requirePageSession } from '@/lib/auth/session';
import { requirePermission, rolesForUser } from '@/lib/rbac/require';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import {
  AUDIT_TYPE_LABELS,
  auditTypesForFramework,
  buildAuditReadinessGates,
  readinessPercent,
  type AuditRequirementStatus,
  type AuditType,
} from '@/lib/audit-readiness';
import { getEngagementCoverage } from '@/lib/assessment/coverage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditReadinessProfileForm } from '@/components/engagement/AuditReadinessProfileForm';
import {
  AuditRequirementChecklist,
  type AuditRequirementValue,
} from '@/components/engagement/AuditRequirementChecklist';
import { AuditEvidencePackagePanel } from '@/components/engagement/AuditEvidencePackagePanel';
import { AuditorInviteForm } from '@/components/engagement/AuditorInviteForm';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { formatDateInput } from '@/lib/timezone';

export const metadata = { title: 'Audit readiness · OakAttest' };

export default async function AuditReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession();
  const timeZone = await userTimeZone(session.user.id);
  const [engagement] = await db
    .select({
      id: engagements.id,
      tenantId: engagements.tenantId,
      name: engagements.name,
      reference: engagements.reference,
      frameworkRevision: engagements.frameworkRevision,
      frameworkKey: frameworks.key,
      frameworkLabel: frameworks.label,
      boundaryLockedAt: engagements.boundaryLockedAt,
    })
    .from(engagements)
    .innerJoin(frameworks, eq(frameworks.id, engagements.frameworkId))
    .where(and(eq(engagements.id, id), isNull(engagements.deletedAt)))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found.');

  await requirePermission(ACTIONS.auditReadinessView, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: id,
  });

  const allowedTypes = auditTypesForFramework(engagement.frameworkKey);
  if (allowedTypes.length === 0) {
    return <UnsupportedFramework engagementId={id} frameworkLabel={engagement.frameworkLabel} />;
  }

  const roles = await rolesForUser({
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: id,
  });
  const canManage = roles.some((role) => isPermitted(ACTIONS.auditReadinessManage, role));
  const canInvite = roles.some((role) => isPermitted(ACTIONS.engagementInvite, role));

  const [profile] = await db
    .select()
    .from(auditReadinessProfiles)
    .where(
      and(
        eq(auditReadinessProfiles.engagementId, id),
        eq(auditReadinessProfiles.tenantId, engagement.tenantId),
      ),
    )
    .limit(1);

  const [members, observers, client, system, packages, evidenceOptions, requirementEvidenceLinks, [{ acceptedEvidenceCount }]] = await Promise.all([
    db
      .select({ userId: engagementMembers.userId, name: users.name, email: users.email })
      .from(engagementMembers)
      .innerJoin(users, eq(users.id, engagementMembers.userId))
      .where(
        and(
          eq(engagementMembers.engagementId, id),
          eq(engagementMembers.tenantId, engagement.tenantId),
          isNull(engagementMembers.deletedAt),
        ),
      )
      .orderBy(users.email),
    db
      .select({ name: users.name, email: users.email })
      .from(engagementMembers)
      .innerJoin(users, eq(users.id, engagementMembers.userId))
      .where(
        and(
          eq(engagementMembers.engagementId, id),
          eq(engagementMembers.tenantId, engagement.tenantId),
          eq(engagementMembers.role, 'read_only_observer'),
          isNull(engagementMembers.deletedAt),
        ),
      ),
    db
      .select({ name: clientOrganisations.name, primaryContactName: clientOrganisations.primaryContactName })
      .from(clientOrganisations)
      .where(and(eq(clientOrganisations.engagementId, id), eq(clientOrganisations.tenantId, engagement.tenantId)))
      .limit(1),
    db
      .select({ name: systems.name, description: systems.description, environment: systems.environment })
      .from(systems)
      .where(and(eq(systems.engagementId, id), eq(systems.tenantId, engagement.tenantId)))
      .limit(1),
    db
      .select({
        id: auditEvidencePackages.id,
        version: auditEvidencePackages.version,
        auditType: auditEvidencePackages.auditType,
        bundleSha256: auditEvidencePackages.bundleSha256,
        sizeBytes: auditEvidencePackages.sizeBytes,
        generatedAt: auditEvidencePackages.generatedAt,
      })
      .from(auditEvidencePackages)
      .where(and(eq(auditEvidencePackages.engagementId, id), eq(auditEvidencePackages.tenantId, engagement.tenantId)))
      .orderBy(desc(auditEvidencePackages.version)),
    db
      .select({
        id: evidenceItems.id,
        filename: evidenceItems.filename,
        sha256: evidenceItems.sha256,
        reviewStatus: evidenceItems.reviewStatus,
      })
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.engagementId, id),
          eq(evidenceItems.tenantId, engagement.tenantId),
          isNotNull(evidenceItems.storageVerifiedAt),
          isNull(evidenceItems.quarantinedAt),
        ),
      )
      .orderBy(desc(evidenceItems.uploadedAt)),
    db
      .select({
        requirementId: auditReadinessRequirementEvidence.requirementId,
        evidenceItemId: auditReadinessRequirementEvidence.evidenceItemId,
      })
      .from(auditReadinessRequirementEvidence)
      .where(
        and(
          eq(auditReadinessRequirementEvidence.engagementId, id),
          eq(auditReadinessRequirementEvidence.tenantId, engagement.tenantId),
        ),
      ),
    db
      .select({ acceptedEvidenceCount: count() })
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.engagementId, id),
          eq(evidenceItems.tenantId, engagement.tenantId),
          eq(evidenceItems.reviewStatus, 'accepted'),
          isNull(evidenceItems.quarantinedAt),
        ),
      ),
  ]);

  const requirements = profile
    ? await db
        .select({
          id: auditReadinessRequirements.id,
          category: auditReadinessRequirements.category,
          title: auditReadinessRequirements.title,
          guidance: auditReadinessRequirements.guidance,
          status: auditReadinessRequirements.status,
          notes: auditReadinessRequirements.notes,
          ownerUserId: auditReadinessRequirements.ownerUserId,
          dueAt: auditReadinessRequirements.dueAt,
          updatedAt: auditReadinessRequirements.updatedAt,
        })
        .from(auditReadinessRequirements)
        .where(
          and(
            eq(auditReadinessRequirements.profileId, profile.id),
            eq(auditReadinessRequirements.auditType, profile.auditType),
            eq(auditReadinessRequirements.tenantId, engagement.tenantId),
          ),
        )
        .orderBy(asc(auditReadinessRequirements.category), asc(auditReadinessRequirements.title))
    : [];

  const coverage = profile ? await getEngagementCoverage(id) : null;
  const gates = profile && coverage
    ? buildAuditReadinessGates({
        engagementId: id,
        auditType: profile.auditType as AuditType,
        scopeStatement: profile.scopeStatement,
        targetAuditAt: profile.targetAuditAt,
        periodStart: profile.periodStart,
        periodEnd: profile.periodEnd,
        requirementStatuses: requirements.map((item) => item.status as AuditRequirementStatus),
        controlCount: coverage.controlCount,
        acceptedEvidenceCount,
        coverageBlockerKeys: coverage.blockers.map((blocker) => blocker.key),
      })
    : [];
  const progress = readinessPercent(requirements.map((item) => item.status as AuditRequirementStatus));
  const ready = gates.length > 0 && gates.every((gate) => gate.ready);

  const profileValue = profile
    ? {
        auditType: profile.auditType as AuditType,
        status: profile.status as 'planning' | 'in_progress' | 'ready' | 'in_audit' | 'complete',
        auditFirm: profile.auditFirm,
        leadAuditor: profile.leadAuditor,
        scopeStatement: profile.scopeStatement,
        trustServiceCategories: profile.trustServiceCategories,
        periodStart: dateInput(profile.periodStart, timeZone),
        periodEnd: dateInput(profile.periodEnd, timeZone),
        targetAuditDate: dateInput(profile.targetAuditAt, timeZone) ?? '',
      }
    : null;
  const requirementValues: AuditRequirementValue[] = requirements.map((item) => ({
    ...item,
    status: item.status as AuditRequirementStatus,
    dueDate: dateInput(item.dueAt, timeZone),
    updatedAt: item.updatedAt.toISOString(),
    evidenceItemIds: requirementEvidenceLinks
      .filter((link) => link.requirementId === item.id)
      .map((link) => link.evidenceItemId),
  }));

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--oak-shield)]"><ShieldCheck className="h-4 w-4" />Auditor workspace</div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">Audit readiness and evidence room</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">Plan readiness, resolve live gaps, freeze timestamped evidence packages, or invite an assessor into this engagement.</p>
      </div>
      {profile ? <div className={`rounded-full px-3 py-1.5 text-sm font-medium ${ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{ready ? 'Ready for auditor review' : 'Readiness work open'}</div> : null}
    </header>

    <Card>
      <CardHeader><CardTitle>Audit plan</CardTitle><CardDescription>{engagement.frameworkLabel} {engagement.frameworkRevision}. Control text remains tenant-supplied and licensed to this engagement.</CardDescription></CardHeader>
      <CardContent><AuditReadinessProfileForm engagementId={id} allowedTypes={allowedTypes} profile={profileValue} canManage={canManage} /></CardContent>
    </Card>

    {profile ? <>
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Audit" value={AUDIT_TYPE_LABELS[profile.auditType as AuditType]} />
        <Metric label="Checklist" value={`${progress}%`} />
        <Metric label="Accepted evidence" value={String(acceptedEvidenceCount)} />
        <Metric label="Evidence packages" value={String(packages.length)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Live readiness gates</CardTitle><CardDescription>Computed from current scope, controls, evidence, and checklist state. Green gates support readiness; assessor judgement remains independent.</CardDescription></CardHeader>
        <CardContent><div className="divide-y divide-slate-100">{gates.map((gate) => {
          const content = <div className="flex items-start gap-3 py-3"><span className={gate.ready ? 'text-emerald-700' : 'text-amber-700'}>{gate.ready ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}</span><div><p className="text-sm font-medium text-slate-950">{gate.label}</p><p className="mt-1 text-xs text-slate-600">{gate.detail}</p></div></div>;
          return gate.href ? <Link key={gate.key} href={gate.href} className="block hover:bg-[var(--oak-mist)]">{content}</Link> : <div key={gate.key}>{content}</div>;
        })}</div></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Preparation checklist</CardTitle><CardDescription>Owner, due date, status, and notes are versioned through the append-only audit log.</CardDescription></CardHeader>
        <CardContent><AuditRequirementChecklist engagementId={id} requirements={requirementValues} members={members.map((member) => ({ userId: member.userId, label: member.name ? `${member.name} (${member.email})` : member.email }))} evidenceOptions={evidenceOptions.map((evidence) => ({ id: evidence.id, label: `${evidence.filename} · ${evidence.sha256.slice(0, 12)}…`, accepted: evidence.reviewStatus === 'accepted' }))} canManage={canManage} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Timestamped evidence packages</CardTitle><CardDescription>Comp-style export: one ZIP containing verified attachments plus human-readable and machine-readable indexes.</CardDescription></CardHeader>
        <CardContent><AuditEvidencePackagePanel engagementId={id} canManage={canManage} packages={packages.map((record) => ({ ...record, generatedAt: record.generatedAt.toISOString() }))} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Auditor access</CardTitle><CardDescription>{observers.length} read-only auditor or observer account(s) currently active.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4 text-sm md:grid-cols-3"><Info label="Client" value={client[0]?.name ?? '—'} /><Info label="System" value={system[0]?.name ?? '—'} /><Info label="Primary contact" value={client[0]?.primaryContactName ?? '—'} /></div>
          {observers.length > 0 ? <ul className="divide-y divide-slate-100 text-sm">{observers.map((observer) => <li key={observer.email} className="flex justify-between py-2"><span>{observer.name ?? observer.email}</span><span className="text-slate-600">{observer.email}</span></li>)}</ul> : null}
          {canInvite ? <AuditorInviteForm engagementId={id} /> : null}
        </CardContent>
      </Card>

      <p className="text-xs leading-5 text-slate-600">Reference material: <a href="https://www.iso.org/standard/27001" target="_blank" rel="noreferrer" className="underline">ISO/IEC 27001:2022 <ExternalLink className="inline h-3 w-3" /></a>{' '}and <a href="https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022" target="_blank" rel="noreferrer" className="underline">AICPA Trust Services Criteria <ExternalLink className="inline h-3 w-3" /></a>. OakAttest supports preparation and evidence delivery; only an independent qualified practitioner can issue an audit opinion or certification.</p>
    </> : null}
  </div>;
}

function UnsupportedFramework({ engagementId, frameworkLabel }: { engagementId: string; frameworkLabel: string }) {
  return <Card><CardHeader><CardTitle>Audit readiness needs an ISO 27001 or SOC 2 engagement</CardTitle><CardDescription>This engagement uses {frameworkLabel}. Create a separate engagement against the tenant-supplied ISO 27001 or SOC 2 framework revision.</CardDescription></CardHeader><CardContent><Link href="/engagements/new" className="text-sm font-medium text-[var(--oak-shield)] underline">Create audit engagement</Link><span className="mx-2 text-slate-400">·</span><Link href={`/engagements/${engagementId}/overview`} className="text-sm text-slate-700 underline">Return to overview</Link></CardContent></Card>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4"><p className="text-xs uppercase text-slate-600">{label}</p><p className="mt-2 text-lg font-semibold text-slate-950">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 font-medium text-slate-900">{value}</p></div>;
}

function dateInput(value: Date | null, timeZone: string) {
  return value ? formatDateInput(value, timeZone) : null;
}
