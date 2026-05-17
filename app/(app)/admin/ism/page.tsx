import { count, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/client';
import { engagementControls, ismControls, ismImports } from '@/db/schema/ism';
import { getSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { requirePermission, PermissionDeniedError } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { listIsmReleases, latestIsmCatalogUrl } from '@/lib/ism/sources';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IsmImportPanel } from '@/components/admin/IsmImportPanel';

export const metadata = { title: 'ISM imports · OakAttest' };

export default async function IsmImportsPage() {
  const session = (await getSession())!;
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

  const [imports, controlCounts, referencedCounts, releaseResult] = await Promise.all([
    db
      .select({
        revision: ismImports.revision,
        sourceUrl: ismImports.sourceUrl,
        importedCount: ismImports.controlCount,
        importedAt: ismImports.completedAt,
      })
      .from(ismImports)
      .orderBy(desc(ismImports.completedAt))
      .limit(50),
    db
      .select({ revision: ismControls.revision, value: count() })
      .from(ismControls)
      .groupBy(ismControls.revision),
    db
      .select({ revision: engagementControls.revision, value: count() })
      .from(engagementControls)
      .groupBy(engagementControls.revision),
    listIsmReleases().then(
      (releases) => ({ releases, error: undefined as string | undefined }),
      (err) => ({ releases: [], error: (err as Error).message }),
    ),
  ]);

  const counts = new Map(controlCounts.map((row) => [row.revision, row.value]));
  const references = new Map(referencedCounts.map((row) => [row.revision, row.value]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs uppercase text-slate-600">Tenant admin</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">ISM imports</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>ACSC OSCAL controls</CardTitle>
          <CardDescription>
            Import the current ISM catalog, pin a specific ACSC release, seed the bundled
            sample, or remove unused revisions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-slate-700">
            Current release imports read from{' '}
            <code className="break-all rounded bg-[var(--oak-mist)] px-1 py-0.5">
              {latestIsmCatalogUrl()}
            </code>
            . ACSC publishes tagged OSCAL releases through the Australian Cyber Security Centre
            mirror.
          </p>
          <IsmImportPanel
            releases={releaseResult.releases}
            releaseError={releaseResult.error}
            imports={imports.map((row) => ({
              revision: row.revision,
              sourceUrl: row.sourceUrl,
              controlCount: counts.get(row.revision) ?? row.importedCount,
              importedAt: row.importedAt.toISOString(),
              referencedControls: references.get(row.revision) ?? 0,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
