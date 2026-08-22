import crypto from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { frameworkControls, frameworkImports } from '@/db/schema/frameworks';
import {
  parseOscalCatalogue,
  iterateControls,
  extractMinClassification,
  extractStatementAndGuidance,
  extractEssentialEight,
} from './oscal';
import { CLASSIFICATION_RANK } from '@/db/schema/enums';
import { resolveFrameworkId, DEFAULT_FRAMEWORK_KEY } from './registry';

export type FrameworkImportOptions = {
  source: 'url' | 'file';
  data: unknown;
  sourceUrl: string;
  triggeredBy?: string | null;
  // Which framework this catalogue belongs to. Defaults to ISM.
  frameworkKey?: string;
};

export async function importFrameworkCatalogue(opts: FrameworkImportOptions) {
  const frameworkId = await resolveFrameworkId(
    opts.frameworkKey ?? DEFAULT_FRAMEWORK_KEY,
  );
  const catalogue = parseOscalCatalogue(opts.data);
  const revision =
    catalogue.catalog.metadata['last-modified'] ??
    catalogue.catalog.metadata.version ??
    new Date().toISOString().slice(0, 10);

  const sourceBytes = Buffer.from(JSON.stringify(opts.data));
  const sourceSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex');

  // A revision is an immutable catalogue snapshot. Re-fetching the same bytes
  // is idempotent; changed bytes must use a new upstream revision so pinned
  // engagements never drift under their existing revision label.
  const [existing] = await db.select({
    sourceSha256: frameworkImports.sourceSha256,
    controlCount: frameworkImports.controlCount,
  }).from(frameworkImports).where(and(
    eq(frameworkImports.frameworkId, frameworkId),
    eq(frameworkImports.revision, revision),
    isNull(frameworkImports.tenantId),
  )).limit(1);
  if (existing) {
    if (existing.sourceSha256 !== sourceSha256) {
      throw new Error(`Framework revision ${revision} already exists with different content. Import it under a new revision.`);
    }
    return { revision, count: existing.controlCount, sourceSha256, frameworkId };
  }

  let count = 0;

  await db.transaction(async (tx) => {
    for (const { topic, subtopic, control } of iterateControls(catalogue)) {
      const { description, guidance } = extractStatementAndGuidance(control);
      const minClassification = extractMinClassification(control);
      const ee = extractEssentialEight(control);

      await tx
        .insert(frameworkControls)
        .values({
          frameworkId,
          controlId: control.id,
          revision,
          topic: topic ?? null,
          section: subtopic ?? control.class ?? control.title ?? null,
          description,
          guidance: guidance ?? null,
          minClassification,
          minClassificationRank: CLASSIFICATION_RANK[minClassification],
          essentialEightMapping: ee.length > 0 ? ee : null,
          oscalRaw: control as never,
        })
        .onConflictDoUpdate({
          // Matches the global partial unique index (tenant_id IS NULL).
          target: [
            frameworkControls.frameworkId,
            frameworkControls.controlId,
            frameworkControls.revision,
          ],
          targetWhere: isNull(frameworkControls.tenantId),
          set: {
            topic: topic ?? null,
            section: subtopic ?? control.class ?? control.title ?? null,
            description,
            guidance: guidance ?? null,
            minClassification,
            minClassificationRank: CLASSIFICATION_RANK[minClassification],
            essentialEightMapping: ee.length > 0 ? ee : null,
            oscalRaw: control as never,
          },
        });
      count += 1;
    }

    await tx
      .insert(frameworkImports)
      .values({
        frameworkId,
        revision,
        sourceUrl: opts.sourceUrl,
        sourceSha256,
        controlCount: count,
        triggeredBy: opts.triggeredBy ?? null,
        metadata: {
          catalogueTitle: catalogue.catalog.metadata.title,
          oscalVersion: catalogue.catalog.metadata['oscal-version'],
        } as never,
      })
      .onConflictDoNothing();
  });

  return { revision, count, sourceSha256, frameworkId };
}
