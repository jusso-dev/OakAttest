import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { frameworks, type Framework } from '@/db/schema/frameworks';
import { engagements } from '@/db/schema/engagements';

export type FrameworkMeta = {
  key: string;
  label: string;
  scopingMode: string;
  overlays: string[];
};

// Default framework key. ISM is seeded by the multi-framework migration and is
// the only framework with a global OSCAL catalogue today.
export const DEFAULT_FRAMEWORK_KEY = 'ism';

export async function getFrameworkByKey(key: string): Promise<Framework | null> {
  const [row] = await db
    .select()
    .from(frameworks)
    .where(eq(frameworks.key, key))
    .limit(1);
  return row ?? null;
}

// Resolve a framework key to its id, throwing a clear error if the registry has
// not been seeded with it yet.
export async function resolveFrameworkId(
  key: string = DEFAULT_FRAMEWORK_KEY,
): Promise<string> {
  const framework = await getFrameworkByKey(key);
  if (!framework) {
    throw new Error(
      `Unknown framework '${key}'. Seed it in the frameworks registry first.`,
    );
  }
  return framework.id;
}

export async function listFrameworks(): Promise<Framework[]> {
  return db.select().from(frameworks).orderBy(frameworks.label);
}

// The framework metadata for an engagement. Drives framework-aware UI: which
// scope fields apply, whether the Essential Eight overlay shows, the label to
// display, etc. Falls back to ISM defaults if the join is somehow missing.
export async function getEngagementFramework(engagementId: string): Promise<FrameworkMeta> {
  const [row] = await db
    .select({
      key: frameworks.key,
      label: frameworks.label,
      scopingMode: frameworks.scopingMode,
      overlays: frameworks.overlays,
    })
    .from(engagements)
    .innerJoin(frameworks, eq(frameworks.id, engagements.frameworkId))
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) {
    return { key: 'ism', label: 'ISM', scopingMode: 'classification', overlays: ['essential-eight'] };
  }
  return { ...row, overlays: row.overlays ?? [] };
}

export function hasEssentialEight(meta: FrameworkMeta): boolean {
  return meta.overlays.includes('essential-eight');
}

export function usesClassification(meta: FrameworkMeta): boolean {
  return meta.scopingMode === 'classification';
}
