import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { subscriptions } from '@/db/schema/subscriptions';
import { plans, features, planFeatures } from '@/db/schema/plans';
import { tenantUsage } from '@/db/schema/usage';
import { featureForFramework, type FeatureCode } from './catalog';
import { countActiveUsers, countActiveEntities, sumStorageBytes } from './usage';

export type Limits = {
  maxUsers: number | null;
  maxFrameworks: number | null;
  maxEntities: number | null;
  maxStorageGb: number | null;
};

export type Usage = {
  userCount: number;
  entityCount: number;
  frameworkCount: number;
  storageBytes: number;
};

export type Entitlements = {
  // null = no subscription row (self-installed / direct tenant).
  planCode: string | null;
  planName: string | null;
  // true → self-installed: everything unlocked, no limits (mirrors
  // lib/billing/entitlement.ts "no row = allow").
  unlimited: boolean;
  features: Set<string>;
  limits: Limits;
  usage: Usage;
};

const UNLIMITED_LIMITS: Limits = {
  maxUsers: null,
  maxFrameworks: null,
  maxEntities: null,
  maxStorageGb: null,
};

export class PlanUpgradeRequiredError extends Error {
  constructor(
    public featureCode: string,
    public requiredPlan: string | null,
  ) {
    super(
      `Plan upgrade required for ${featureCode}` +
        (requiredPlan ? ` (requires ${requiredPlan})` : ''),
    );
    this.name = 'PlanUpgradeRequiredError';
  }

  // Shape for a 403 JSON body, per the spec.
  toResponseBody() {
    return {
      error: 'plan_upgrade_required',
      requiredPlan: this.requiredPlan,
      feature: this.featureCode,
    };
  }
}

export type LimitDimension = 'users' | 'frameworks' | 'entities' | 'storage';

export class UsageLimitExceededError extends Error {
  constructor(
    public dimension: LimitDimension,
    public limit: number,
  ) {
    super(`Usage limit reached for ${dimension} (max ${limit})`);
    this.name = 'UsageLimitExceededError';
  }
}

// Resolve everything licensing needs for a tenant in one place.
// Free open-source product: a recorded plan is display-only. It does not
// lock features or quotas.
export async function resolveEntitlements(tenantId: string): Promise<Entitlements> {
  const usage = await loadUsage(tenantId);
  const [sub] = await db
    .select({ planId: subscriptions.planId })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  if (!sub) {
    return {
      planCode: null,
      planName: null,
      unlimited: true,
      features: new Set(),
      limits: UNLIMITED_LIMITS,
      usage,
    };
  }

  const [plan] = await db
    .select({ name: plans.name })
    .from(plans)
    .where(eq(plans.code, sub.planId))
    .limit(1);

  return {
    planCode: sub.planId,
    planName: plan?.name ?? null,
    unlimited: true,
    features: new Set(),
    limits: UNLIMITED_LIMITS,
    usage,
  };
}

async function loadUsage(tenantId: string): Promise<Usage> {
  // Live counts for the limit-critical dimensions (no drift); frameworkCount is
  // read from the snapshot (forward-looking until framework_id exists).
  const [userCount, entityCount, storageBytes, snapshot] = await Promise.all([
    countActiveUsers(tenantId),
    countActiveEntities(tenantId),
    sumStorageBytes(tenantId),
    db
      .select({ frameworkCount: tenantUsage.frameworkCount })
      .from(tenantUsage)
      .where(eq(tenantUsage.tenantId, tenantId))
      .limit(1),
  ]);
  return {
    userCount,
    entityCount,
    storageBytes,
    frameworkCount: snapshot[0]?.frameworkCount ?? 0,
  };
}

// ---- Pure decision helpers (no IO) — exercised directly by unit tests. ----

export function decideFeature(ent: Entitlements, code: string): boolean {
  return ent.unlimited || ent.features.has(code);
}

export function decideCanCreateUser(
  ent: Entitlements,
  options?: { existingMember?: boolean },
): boolean {
  if (options?.existingMember) return true;
  return (
    ent.unlimited || ent.limits.maxUsers === null || ent.usage.userCount < ent.limits.maxUsers
  );
}

export function decideCanCreateEntity(ent: Entitlements): boolean {
  return (
    ent.unlimited ||
    ent.limits.maxEntities === null ||
    ent.usage.entityCount < ent.limits.maxEntities
  );
}

export function decideCanStore(ent: Entitlements, additionalBytes: number): boolean {
  if (ent.unlimited || ent.limits.maxStorageGb === null) return true;
  return ent.usage.storageBytes + additionalBytes <= ent.limits.maxStorageGb * 1_000_000_000;
}

export function decideFramework(
  ent: Entitlements,
  frameworkKey: string,
  addsNewFramework = true,
): { allowed: boolean; reason?: 'feature' | 'framework_limit' } {
  const code = featureForFramework(frameworkKey);
  if (!ent.unlimited && !ent.features.has(code)) return { allowed: false, reason: 'feature' };
  if (
    addsNewFramework &&
    !ent.unlimited &&
    ent.limits.maxFrameworks !== null &&
    ent.usage.frameworkCount >= ent.limits.maxFrameworks
  ) {
    return { allowed: false, reason: 'framework_limit' };
  }
  return { allowed: true };
}

// ---- IO wrappers: resolve entitlements, then delegate to the pure helpers. ----

export async function hasFeature(
  tenantId: string,
  code: FeatureCode | string,
): Promise<boolean> {
  return decideFeature(await resolveEntitlements(tenantId), code);
}

// Lowest-priced active plan that includes the feature, by sortOrder.
export async function requiredPlanForFeature(
  code: string,
): Promise<{ code: string; name: string } | null> {
  const [row] = await db
    .select({ code: plans.code, name: plans.name })
    .from(planFeatures)
    .innerJoin(features, eq(features.id, planFeatures.featureId))
    .innerJoin(plans, eq(plans.id, planFeatures.planId))
    .where(
      and(
        eq(features.code, code),
        eq(planFeatures.enabled, true),
        eq(plans.isActive, true),
      ),
    )
    .orderBy(asc(plans.sortOrder))
    .limit(1);
  return row ?? null;
}

// Server-side enforcement. Throws PlanUpgradeRequiredError (→ 403) on denial.
export async function requireFeature(
  tenantId: string,
  code: FeatureCode | string,
): Promise<void> {
  if (await hasFeature(tenantId, code)) return;
  const required = await requiredPlanForFeature(code);
  throw new PlanUpgradeRequiredError(code, required?.code ?? null);
}

export type FrameworkGate = {
  allowed: boolean;
  requiredPlan: string | null;
  reason?: 'feature' | 'framework_limit';
};

// Can this tenant run an assessment against `frameworkKey`? Checks both the
// feature unlock and the framework-count limit (when the call would add a
// not-yet-used framework). `addsNewFramework` defaults true.
export async function canUseFramework(
  tenantId: string,
  frameworkKey: string,
  addsNewFramework = true,
): Promise<FrameworkGate> {
  const ent = await resolveEntitlements(tenantId);
  const d = decideFramework(ent, frameworkKey, addsNewFramework);
  if (d.allowed) return { allowed: true, requiredPlan: null };
  if (d.reason === 'feature') {
    const required = await requiredPlanForFeature(featureForFramework(frameworkKey));
    return { allowed: false, requiredPlan: required?.code ?? null, reason: 'feature' };
  }
  return { allowed: false, requiredPlan: null, reason: 'framework_limit' };
}

// Boolean limit checks — true when the next unit is permitted.
export async function canCreateUser(tenantId: string): Promise<boolean> {
  return decideCanCreateUser(await resolveEntitlements(tenantId));
}

export async function canCreateEntity(tenantId: string): Promise<boolean> {
  return decideCanCreateEntity(await resolveEntitlements(tenantId));
}

export async function canStore(
  tenantId: string,
  additionalBytes: number,
): Promise<boolean> {
  return decideCanStore(await resolveEntitlements(tenantId), additionalBytes);
}

// Throwing variants for server actions (→ map to a user-facing limit message).
export async function requireCanCreateUser(
  tenantId: string,
  options?: { existingMember?: boolean },
): Promise<void> {
  const ent = await resolveEntitlements(tenantId);
  if (!decideCanCreateUser(ent, options)) {
    throw new UsageLimitExceededError('users', ent.limits.maxUsers ?? 0);
  }
}

export async function requireCanCreateEntity(tenantId: string): Promise<void> {
  const ent = await resolveEntitlements(tenantId);
  if (!decideCanCreateEntity(ent)) {
    throw new UsageLimitExceededError('entities', ent.limits.maxEntities ?? 0);
  }
}

export async function requireCanStore(
  tenantId: string,
  additionalBytes: number,
): Promise<void> {
  const ent = await resolveEntitlements(tenantId);
  if (!decideCanStore(ent, additionalBytes)) {
    throw new UsageLimitExceededError('storage', ent.limits.maxStorageGb ?? 0);
  }
}
