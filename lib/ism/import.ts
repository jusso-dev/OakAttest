import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import { ismControls, ismImports } from '@/db/schema/ism';
import {
  parseOscalCatalogue,
  iterateControls,
  extractMinClassification,
  extractStatementAndGuidance,
  extractEssentialEight,
} from './oscal';
import { CLASSIFICATION_RANK } from '@/db/schema/enums';

export type IsmImportOptions = {
  source: 'url' | 'file';
  data: unknown;
  sourceUrl: string;
  triggeredBy?: string | null;
};

export async function importIsmCatalogue(opts: IsmImportOptions) {
  const catalogue = parseOscalCatalogue(opts.data);
  const revision =
    catalogue.catalog.metadata['last-modified'] ??
    catalogue.catalog.metadata.version ??
    new Date().toISOString().slice(0, 10);

  const sourceBytes = Buffer.from(JSON.stringify(opts.data));
  const sourceSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex');

  let count = 0;

  await db.transaction(async (tx) => {
    for (const { topic, subtopic, control } of iterateControls(catalogue)) {
      const { description, guidance } = extractStatementAndGuidance(control);
      const minClassification = extractMinClassification(control);
      const ee = extractEssentialEight(control);

      await tx
        .insert(ismControls)
        .values({
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
          target: [ismControls.controlId, ismControls.revision],
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
      .insert(ismImports)
      .values({
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

  return { revision, count, sourceSha256 };
}
