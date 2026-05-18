import { eq } from 'drizzle-orm';
import { auditLog } from '@/db/schema/audit';
import { ismImports } from '@/db/schema/ism';
import { db } from '@/lib/db/client';
import { importIsmCatalogue } from '@/lib/ism/import';
import { fetchIsmCatalog, listIsmReleases } from '@/lib/ism/sources';

export type IsmReleaseSyncResult = {
  checked: number;
  updated: number;
  skipped: number;
  errorCount: number;
  errors: string[];
  imported: Array<{
    release: string;
    revision: string;
    controlCount: number;
    sourceSha256: string;
  }>;
};

export async function syncAvailableIsmReleases(limit = 20): Promise<IsmReleaseSyncResult> {
  const releases = await listIsmReleases(limit);
  const result: IsmReleaseSyncResult = {
    checked: releases.length,
    updated: 0,
    skipped: 0,
    errorCount: 0,
    errors: [],
    imported: [],
  };

  for (const release of releases) {
    try {
      const [existing] = await db
        .select({ id: ismImports.id })
        .from(ismImports)
        .where(eq(ismImports.sourceUrl, release.catalogUrl))
        .limit(1);
      if (existing) {
        result.skipped += 1;
        continue;
      }

      const catalog = await fetchIsmCatalog(release.catalogUrl);
      const imported = await importIsmCatalogue({
        source: 'url',
        data: catalog,
        sourceUrl: release.catalogUrl,
        triggeredBy: null,
      });

      result.updated += 1;
      result.imported.push({
        release: release.name,
        revision: imported.revision,
        controlCount: imported.count,
        sourceSha256: imported.sourceSha256,
      });
    } catch (err) {
      result.errorCount += 1;
      result.errors.push(`${release.name}: ${(err as Error).message}`);
    }
  }

  await db.insert(auditLog).values({
    actorType: 'system',
    action: 'ism.release_sync',
    resourceType: 'ism_release',
    afterJson: {
      checked: result.checked,
      updated: result.updated,
      skipped: result.skipped,
      errorCount: result.errorCount,
      imported: result.imported,
    } as never,
    message: result.errors.length > 0 ? result.errors.join('; ') : null,
  });

  return result;
}
