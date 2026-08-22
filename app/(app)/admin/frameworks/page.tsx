import { and, count, desc, eq, isNull, or } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { engagementControls, frameworkControls, frameworkImports, frameworkPacks, frameworks } from '@/db/schema/frameworks';
import { requirePageSession } from '@/lib/auth/session';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { listFrameworks } from '@/lib/frameworks/registry';
import { listIsmReleases } from '@/lib/frameworks/sources';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FrameworkImportPanel } from '@/components/admin/FrameworkImportPanel';
import { FrameworkUrlImport } from '@/components/admin/FrameworkUrlImport';
import { FrameworkCsvImport } from '@/components/admin/FrameworkCsvImport';
import { FrameworkProfileImport } from '@/components/admin/FrameworkProfileImport';
import { FrameworkPackLifecycle } from '@/components/admin/FrameworkPackLifecycle';
import { CustomFrameworkBuilder } from '@/components/admin/CustomFrameworkBuilder';

const CSV_TEMPLATE: Record<string, string> = {
  soc2: '/templates/soc2-controls-template.csv',
  'iso-27001': '/templates/iso27001-controls-template.csv',
  pspf: '/templates/pspf-controls-template.csv',
};

export const metadata = { title: 'Frameworks · OakAttest' };

const SCOPING_LABEL: Record<string, string> = {
  classification: 'Classification (cumulative by rank)',
  baseline_profile: 'Baseline profile',
  selection: 'Selection (SoA / TSC)',
};

export default async function FrameworksPage() {
  const session = await requirePageSession();
  const tenant = await resolveActiveTenant(session.user.id);
  if (!tenant) redirect('/onboarding');

  try {
    await requirePermission(ACTIONS.frameworkPackManage, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) redirect('/dashboard');
    throw err;
  }

  const [registry, controlCounts, ismReleaseResult, platformAdmin, visiblePacks, tenantControlRows] = await Promise.all([
    listFrameworks(tenant.tenantId),
    db
      .select({ frameworkId: frameworkControls.frameworkId, value: count() })
      .from(frameworkControls)
      .where(or(isNull(frameworkControls.tenantId), eq(frameworkControls.tenantId, tenant.tenantId)))
      .groupBy(frameworkControls.frameworkId),
    listIsmReleases().then(
      (releases) => ({ releases, error: undefined as string | undefined }),
      (err) => ({ releases: [], error: (err as Error).message }),
    ),
    isPlatformAdmin(session.user.id),
    db.select({
      id: frameworkPacks.id,
      frameworkId: frameworkPacks.frameworkId,
      tenantId: frameworkPacks.tenantId,
      revision: frameworkPacks.revision,
      label: frameworkPacks.label,
      description: frameworkPacks.description,
      status: frameworkPacks.status,
      sourceKind: frameworkPacks.sourceKind,
      sourceSha256: frameworkPacks.sourceSha256,
      controlCount: frameworkPacks.controlCount,
      effectiveAt: frameworkPacks.effectiveAt,
      expiresAt: frameworkPacks.expiresAt,
      frameworkKey: frameworks.key,
      frameworkLabel: frameworks.label,
      frameworkTenantId: frameworks.tenantId,
    }).from(frameworkPacks)
      .innerJoin(frameworks, eq(frameworks.id, frameworkPacks.frameworkId))
      .where(or(isNull(frameworkPacks.tenantId), eq(frameworkPacks.tenantId, tenant.tenantId)))
      .orderBy(desc(frameworkPacks.createdAt)),
    db.select({
      frameworkId: frameworkControls.frameworkId,
      revision: frameworkControls.revision,
      controlId: frameworkControls.controlId,
      title: frameworkControls.section,
      description: frameworkControls.description,
      topic: frameworkControls.topic,
    }).from(frameworkControls)
      .where(eq(frameworkControls.tenantId, tenant.tenantId))
      .orderBy(frameworkControls.controlId),
  ]);

  const controlCountByFramework = new Map(controlCounts.map((r) => [r.frameworkId, r.value]));

  // ISM import history (the ISM panel still drives ACSC release imports).
  const ism = registry.find((f) => f.key === 'ism');
  const ismImports = ism
    ? await db
        .select({
          revision: frameworkImports.revision,
          sourceUrl: frameworkImports.sourceUrl,
          importedCount: frameworkImports.controlCount,
          importedAt: frameworkImports.completedAt,
        })
        .from(frameworkImports)
        .where(and(eq(frameworkImports.frameworkId, ism.id), isNull(frameworkImports.tenantId)))
        .orderBy(desc(frameworkImports.completedAt))
        .limit(50)
    : [];
  const ismRevCounts = ism
    ? await db
        .select({ revision: frameworkControls.revision, value: count() })
        .from(frameworkControls)
        .where(and(eq(frameworkControls.frameworkId, ism.id), isNull(frameworkControls.tenantId)))
        .groupBy(frameworkControls.revision)
    : [];
  const ismRefCounts = await db
    .select({ revision: engagementControls.revision, value: count() })
    .from(engagementControls)
    .where(eq(engagementControls.tenantId, tenant.tenantId))
    .groupBy(engagementControls.revision);
  const ismCounts = new Map(ismRevCounts.map((r) => [r.revision, r.value]));
  const ismRefs = new Map(ismRefCounts.map((r) => [r.revision, r.value]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">Tenant admin</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Compliance frameworks</h1>
        <p className="mt-2 text-sm text-slate-600">
          Import a catalogue for any framework, then pick it when creating an engagement. Each
          engagement is assessed against one framework + revision.
        </p>
      </header>

      {registry.filter((fw) => fw.tenantId === null).map((fw) => {
        const loaded = controlCountByFramework.get(fw.id) ?? 0;
        const sourceUrl =
          fw.sourceConfig && typeof fw.sourceConfig === 'object'
            ? (fw.sourceConfig as Record<string, unknown>).url
            : undefined;
        return (
          <Card key={fw.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{fw.label}</span>
                <span className="text-xs font-normal uppercase text-slate-500">
                  {loaded} controls loaded
                </span>
              </CardTitle>
              <CardDescription>
                Scoping: {SCOPING_LABEL[fw.scopingMode] ?? fw.scopingMode}
                {fw.overlays.length > 0 && ` · overlays: ${fw.overlays.join(', ')}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fw.key === 'ism' && platformAdmin && (
                <FrameworkImportPanel
                  releases={ismReleaseResult.releases}
                  releaseError={ismReleaseResult.error}
                  imports={ismImports.map((row) => ({
                    revision: row.revision,
                    sourceUrl: row.sourceUrl,
                    controlCount: ismCounts.get(row.revision) ?? row.importedCount,
                    importedAt: row.importedAt.toISOString(),
                    referencedControls: ismRefs.get(row.revision) ?? 0,
                  }))}
                />
              )}

              {fw.key === 'ism' && !platformAdmin ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Shared official catalogue imports require platform administrator access.</p>
              ) : null}

              {fw.key !== 'ism' && fw.sourceKind === 'oscal_url' && typeof sourceUrl === 'string' && platformAdmin && (
                <FrameworkUrlImport frameworkKey={fw.key} defaultUrl={sourceUrl} />
              )}

              {fw.key !== 'ism' && fw.sourceKind === 'oscal_url' && typeof sourceUrl === 'string' && !platformAdmin ? <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Shared base-catalogue imports require platform administrator access. Tenant profile resolution remains available below.</p> : null}

              {fw.scopingMode === 'baseline_profile' ? <FrameworkProfileImport
                targetFrameworkKey={fw.key}
                targetFrameworkLabel={fw.label}
                baseFrameworkKey="nist-800-53"
                baseRevisions={visiblePacks.filter((pack) => pack.frameworkKey === 'nist-800-53' && pack.tenantId === null && pack.status === 'active').map((pack) => ({ revision: pack.revision, controlCount: pack.controlCount }))}
              /> : null}

              {fw.sourceKind === 'csv_client_import' && (
                <FrameworkCsvImport
                  frameworkKey={fw.key}
                  frameworkLabel={fw.label}
                  templateUrl={CSV_TEMPLATE[fw.key]}
                />
              )}

              {visiblePacks.filter((pack) => pack.frameworkId === fw.id && pack.tenantId === tenant.tenantId).length > 0 ? (
                <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Tenant packs</p>{visiblePacks.filter((pack) => pack.frameworkId === fw.id && pack.tenantId === tenant.tenantId).map((pack) => <FrameworkPackLifecycle key={pack.id} pack={{ ...pack, effectiveAt: pack.effectiveAt?.toISOString() ?? null, expiresAt: pack.expiresAt?.toISOString() ?? null }} />)}</div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader><CardTitle>Custom assessment builder</CardTitle><CardDescription>Create tenant-private controls and activate immutable, reusable assessment revisions.</CardDescription></CardHeader>
        <CardContent>
          <CustomFrameworkBuilder packs={visiblePacks.filter((pack) => pack.frameworkTenantId === tenant.tenantId && pack.sourceKind === 'custom_builder').map((pack) => ({
            ...pack,
            effectiveAt: pack.effectiveAt?.toISOString() ?? null,
            expiresAt: pack.expiresAt?.toISOString() ?? null,
            controls: tenantControlRows.filter((control) => control.frameworkId === pack.frameworkId && control.revision === pack.revision),
          }))} />
        </CardContent>
      </Card>
    </div>
  );
}
