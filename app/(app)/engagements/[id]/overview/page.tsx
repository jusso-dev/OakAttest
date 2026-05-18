import { eq, count, desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements, clientOrganisations, systems } from '@/db/schema/engagements';
import { engagementControls, ismImports } from '@/db/schema/ism';
import { engagementMembers } from '@/db/schema/tenants';
import { users } from '@/db/schema/auth';
import { sspExports } from '@/db/schema/ssp';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePageSession } from '@/lib/auth/session';
import { rolesForUser } from '@/lib/rbac/require';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import { InviteMemberForm } from '@/components/engagement/InviteMemberForm';
import { SspExportPanel } from '@/components/engagement/SspExportPanel';
import { RoleAccessGuide } from '@/components/admin/RoleAccessGuide';
import { CveSubmitForm } from '@/components/evidence/CveSubmitForm';
import { VulnScanUpload } from '@/components/fieldwork/VulnScanUpload';
import { IrapGuidancePanel } from '@/components/engagement/IrapGuidancePanel';
import { IsmMigrationPanel } from '@/components/engagement/IsmMigrationPanel';
import { compareIsmRevisions } from '@/lib/ism/compare';

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePageSession();

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, id))
    .limit(1);

  const [client] = await db
    .select()
    .from(clientOrganisations)
    .where(eq(clientOrganisations.engagementId, id))
    .limit(1);

  const [system] = await db
    .select()
    .from(systems)
    .where(eq(systems.engagementId, id))
    .limit(1);

  const [{ controlCount }] = await db
    .select({ controlCount: count() })
    .from(engagementControls)
    .where(eq(engagementControls.engagementId, id));

  const members = await db
    .select({
      userId: engagementMembers.userId,
      role: engagementMembers.role,
      name: users.name,
      email: users.email,
    })
    .from(engagementMembers)
    .innerJoin(users, eq(users.id, engagementMembers.userId))
    .where(eq(engagementMembers.engagementId, id));

  const sspList = await db
    .select()
    .from(sspExports)
    .where(eq(sspExports.engagementId, id))
    .orderBy(desc(sspExports.version))
    .limit(5);

  const [latestIsm] = await db
    .select({ revision: ismImports.revision, completedAt: ismImports.completedAt })
    .from(ismImports)
    .orderBy(desc(ismImports.completedAt))
    .limit(1);
  const ismDiff =
    latestIsm && latestIsm.revision !== engagement.ismRevision
      ? await compareIsmRevisions(engagement.ismRevision, latestIsm.revision)
      : null;

  const roles = await rolesForUser({
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: id,
  });
  const canInvite = roles.some((role) => isPermitted(ACTIONS.engagementInvite, role));
  const canSubmitSbom = roles.some((role) => isPermitted(ACTIONS.evidenceUpload, role));
  const canImportVulnScan = roles.some((role) => isPermitted(ACTIONS.findingCreate, role));

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {latestIsm && ismDiff ? (
        <div className="md:col-span-2">
          <IsmMigrationPanel
            engagementId={id}
            currentRevision={engagement.ismRevision}
            targetRevision={latestIsm.revision}
            diff={ismDiff}
          />
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Scope</CardTitle>
          <CardDescription>System under assessment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="System">{system?.name ?? '—'}</Row>
          <Row label="Environment">{system?.environment ?? '—'}</Row>
          <Row label="Classification">{engagement.classification.replace('_', ':')}</Row>
          <Row label="Assessment type">
            {engagement.assessmentType === 'cloud_irap' ? 'Cloud IRAP workload' : 'Standard IRAP'}
          </Row>
          <Row label="Cloud provider">{formatCloudProvider(engagement.cloudProvider)}</Row>
          <Row label="ISM revision">{engagement.ismRevision}</Row>
          <Row label="Applicable controls">{controlCount}</Row>
          <Row label="Boundary">{engagement.boundaryLockedAt ? 'Locked' : 'Draft'}</Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client organisation</CardTitle>
          <CardDescription>The organisation being assessed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Name">{client?.name ?? '—'}</Row>
          <Row label="ABN">{client?.abn ?? '—'}</Row>
          <Row label="Primary contact">{client?.primaryContactName ?? '—'}</Row>
          <Row label="Email">{client?.primaryContactEmail ?? '—'}</Row>
        </CardContent>
      </Card>

      <IrapGuidancePanel />

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Security input examples</CardTitle>
          <CardDescription>
            Upload dependency inventories and vulnerability scan exports early so the
            engagement can draft useful evidence and findings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">SBOM or dependency manifest</h3>
              <p className="mt-1 text-sm text-slate-700">
                Use CycloneDX, SPDX, package-lock.json, requirements.txt, go.sum, Cargo.lock,
                composer.lock, pom.xml, or a Dockerfile with pinned versions.
              </p>
            </div>
            <a
              href="/templates/example-sbom-cyclonedx.json"
              className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-xs font-medium text-slate-950 hover:bg-[var(--oak-mist-strong)]"
            >
              Download SBOM example
            </a>
            {canSubmitSbom ? (
              <CveSubmitForm engagementId={id} />
            ) : (
              <p className="text-xs text-slate-600">
                Client contributors and client administrators can upload SBOMs or manifests.
              </p>
            )}
          </div>
          <div className="space-y-3 rounded-md border border-[var(--field-border)] bg-[var(--oak-mist)] p-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Vulnerability scan CSV</h3>
              <p className="mt-1 text-sm text-slate-700">
                Generic CSV imports need host, title, severity, cvss, description, and solution
                columns. Nessus, Rapid7, and Qualys exports are also supported.
              </p>
            </div>
            <a
              href="/templates/example-vulnerability-scan.csv"
              className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-xs font-medium text-slate-950 hover:bg-[var(--oak-mist-strong)]"
            >
              Download CVE template
            </a>
            {canImportVulnScan ? (
              <VulnScanUpload engagementId={id} />
            ) : (
              <p className="text-xs text-slate-600">
                Lead assessors and assessors can import vulnerability scan results.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} members on this engagement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-slate-100 text-sm">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between py-2">
                <span>
                  <span className="font-medium text-slate-900">
                    {m.name ?? m.email}
                  </span>{' '}
                  <span className="text-slate-600">— {m.email}</span>
                </span>
                <span className="rounded-full bg-[var(--oak-mist-strong)] px-2 py-0.5 text-xs text-slate-700">
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
          {canInvite && <InviteMemberForm engagementId={id} />}
          <details className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-950">
              Role access guide
            </summary>
            <div className="mt-3">
              <RoleAccessGuide />
            </div>
          </details>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>System Security Plan</CardTitle>
          <CardDescription>
            Generate a versioned SSP from the boundary, applicability worksheet,
            implementation statements, and residual risks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SspExportPanel
            engagementId={id}
            exports={sspList.map((e) => ({
              id: e.id,
              version: e.version,
              sha256: e.sha256,
              format: e.format,
              generatedAt: e.generatedAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function formatCloudProvider(provider: string) {
  switch (provider) {
    case 'aws':
      return 'AWS';
    case 'azure':
      return 'Azure';
    case 'gcp':
      return 'Google Cloud';
    case 'other':
      return 'Other provider';
    default:
      return 'None';
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-900">{children}</span>
    </div>
  );
}
