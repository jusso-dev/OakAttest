import { and, eq, lte } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagementControls, ismControls } from '@/db/schema/ism';
import { engagements } from '@/db/schema/engagements';

export type IsmRevisionDiff = {
  fromRevision: string;
  toRevision: string;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  items: {
    added: IsmRevisionDiffItem[];
    removed: IsmRevisionDiffItem[];
    changed: IsmRevisionChangedItem[];
    unchanged: IsmRevisionDiffItem[];
  };
};

export type IsmRevisionDiffItem = {
  controlId: string;
  description: string;
  minClassification: string | null;
  essentialEightMapping: unknown;
};

export type IsmRevisionChangedItem = IsmRevisionDiffItem & {
  previousDescription: string;
  changedFields: string[];
};

type ComparableControl = {
  controlId: string;
  description: string;
  guidance: string | null;
  minClassification: string | null;
  essentialEightMapping: unknown;
};

export async function compareIsmRevisions(fromRevision: string, toRevision: string): Promise<IsmRevisionDiff> {
  const [fromRows, toRows] = await Promise.all([
    db.select().from(ismControls).where(eq(ismControls.revision, fromRevision)),
    db.select().from(ismControls).where(eq(ismControls.revision, toRevision)),
  ]);
  return diffIsmControlRows({ fromRevision, toRevision, fromRows, toRows });
}

export function diffIsmControlRows(opts: {
  fromRevision: string;
  toRevision: string;
  fromRows: ComparableControl[];
  toRows: ComparableControl[];
}): IsmRevisionDiff {
  const { fromRevision, toRevision, fromRows, toRows } = opts;
  const from = new Map(fromRows.map((row) => [row.controlId, row]));
  const to = new Map(toRows.map((row) => [row.controlId, row]));
  const added: IsmRevisionDiffItem[] = [];
  const changed: IsmRevisionChangedItem[] = [];
  const unchanged: IsmRevisionDiffItem[] = [];
  for (const [controlId, row] of to) {
    const old = from.get(controlId);
    if (!old) {
      added.push(toDiffItem(row));
    } else {
      const changedFields = changedFieldNames(old, row);
      if (changedFields.length > 0) {
        changed.push({
          ...toDiffItem(row),
          previousDescription: old.description,
          changedFields,
        });
      } else {
        unchanged.push(toDiffItem(row));
      }
    }
  }
  const removed = [...from.values()]
    .filter((row) => !to.has(row.controlId))
    .map(toDiffItem);
  return {
    fromRevision,
    toRevision,
    added: added.length,
    removed: removed.length,
    changed: changed.length,
    unchanged: unchanged.length,
    items: { added, removed, changed, unchanged },
  };
}

export async function migrateEngagementIsmRevision(opts: {
  engagementId: string;
  toRevision: string;
  reason: string;
}) {
  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, opts.engagementId))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');
  const controls = await db
    .select()
    .from(ismControls)
    .where(
      and(
        eq(ismControls.revision, opts.toRevision),
        lte(ismControls.minClassificationRank, engagement.classificationRank),
      ),
    );
  const existing = await db
    .select({ controlId: engagementControls.controlId })
    .from(engagementControls)
    .where(eq(engagementControls.engagementId, opts.engagementId));
  const existingIds = new Set(existing.map((row) => row.controlId));
  return { engagement, inScope: controls, existingIds };
}

function changedFieldNames(previous: ComparableControl, next: ComparableControl): string[] {
  const fields: string[] = [];
  if (previous.description !== next.description) fields.push('description');
  if (previous.guidance !== next.guidance) fields.push('guidance');
  if (previous.minClassification !== next.minClassification) fields.push('classification');
  if (
    JSON.stringify(previous.essentialEightMapping ?? null) !==
    JSON.stringify(next.essentialEightMapping ?? null)
  ) {
    fields.push('essential_eight_mapping');
  }
  return fields;
}

function toDiffItem(row: ComparableControl): IsmRevisionDiffItem {
  return {
    controlId: row.controlId,
    description: row.description,
    minClassification: row.minClassification,
    essentialEightMapping: row.essentialEightMapping,
  };
}
