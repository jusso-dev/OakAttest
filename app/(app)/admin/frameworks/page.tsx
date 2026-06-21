import { count, desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { engagementControls, frameworkControls, frameworkImports } from '@/db/schema/frameworks';
import { requirePageSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { listFrameworks } from '@/lib/frameworks/registry';
import { listIsmReleases } from '@/lib/frameworks/sources';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FrameworkImportPanel } from '@/components/admin/FrameworkImportPanel';
import { FrameworkUrlImport } from '@/components/admin/FrameworkUrlImport';
import { FrameworkCsvImport } from '@/components/admin/FrameworkCsvImport';

const CSV_TEMPLATE: Record<string, string> = {
  soc2: '/templates/soc2-controls-template.csv',
  'iso-27001': '/templates/iso27001-controls-template.csv',
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
    await requirePermission(ACTIONS.tenantManageIsm, {
      userId: session.user.id,
      tenantId: tenant.tenantId,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) redirect('/dashboard');
    throw err;
  }

  const [registry, controlCounts, ismReleaseResult] = await Promise.all([
    listFrameworks(),
    db
      .select({ frameworkId: frameworkControls.frameworkId, value: count() })
      .from(frameworkControls)
      .groupBy(frameworkControls.frameworkId),
    listIsmReleases().then(
      (releases) => ({ releases, error: undefined as string | undefined }),
      (err) => ({ releases: [], error: (err as Error).message }),
    ),
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
        .where(eq(frameworkImports.frameworkId, ism.id))
        .orderBy(desc(frameworkImports.completedAt))
        .limit(50)
    : [];
  const ismRevCounts = ism
    ? await db
        .select({ revision: frameworkControls.revision, value: count() })
        .from(frameworkControls)
        .where(eq(frameworkControls.frameworkId, ism.id))
        .groupBy(frameworkControls.revision)
    : [];
  const ismRefCounts = await db
    .select({ revision: engagementControls.revision, value: count() })
    .from(engagementControls)
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

      {registry.map((fw) => {
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
              {fw.key === 'ism' && (
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

              {fw.key !== 'ism' && fw.sourceKind === 'oscal_url' && typeof sourceUrl === 'string' && (
                <FrameworkUrlImport frameworkKey={fw.key} defaultUrl={sourceUrl} />
              )}

              {fw.key !== 'ism' && fw.sourceKind === 'oscal_url' && typeof sourceUrl !== 'string' && (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  This framework is distributed as an OSCAL baseline profile over NIST 800-53. The
                  baseline-profile resolver is pending (Phase 3); import NIST 800-53 above in the
                  meantime.
                </p>
              )}

              {fw.sourceKind === 'csv_client_import' && (
                <FrameworkCsvImport
                  frameworkKey={fw.key}
                  frameworkLabel={fw.label}
                  templateUrl={CSV_TEMPLATE[fw.key]}
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
