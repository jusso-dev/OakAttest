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
};

export async function compareIsmRevisions(fromRevision: string, toRevision: string): Promise<IsmRevisionDiff> {
  const [fromRows, toRows] = await Promise.all([
    db.select().from(ismControls).where(eq(ismControls.revision, fromRevision)),
    db.select().from(ismControls).where(eq(ismControls.revision, toRevision)),
  ]);
  const from = new Map(fromRows.map((row) => [row.controlId, row]));
  const to = new Map(toRows.map((row) => [row.controlId, row]));
  let added = 0;
  let changed = 0;
  let unchanged = 0;
  for (const [controlId, row] of to) {
    const old = from.get(controlId);
    if (!old) {
      added += 1;
    } else if (
      old.description !== row.description ||
      old.guidance !== row.guidance ||
      old.minClassification !== row.minClassification ||
      JSON.stringify(old.essentialEightMapping ?? null) !== JSON.stringify(row.essentialEightMapping ?? null)
    ) {
      changed += 1;
    } else {
      unchanged += 1;
    }
  }
  const removed = [...from.keys()].filter((controlId) => !to.has(controlId)).length;
  return { fromRevision, toRevision, added, removed, changed, unchanged };
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
