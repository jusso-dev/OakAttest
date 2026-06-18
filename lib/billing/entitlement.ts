import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { subscriptions, type Subscription } from '@/db/schema/subscriptions';

// Entitlement decisions a caller cares about. `block` denies write actions;
// reads are never gated by entitlement.
export type EntitlementState = 'allow' | 'grace' | 'block';

export type Entitlement = {
  state: EntitlementState;
  reason:
    | 'no_subscription'
    | 'active'
    | 'trial'
    | 'pending_provisioning'
    | 'grace_open'
    | 'grace_expired'
    | 'cancelled';
  subscription: Subscription | null;
  // When state === 'grace', the timestamp writes start failing.
  graceEndsAt: Date | null;
};

// Pure decision function. No DB. Lets the entitlement state-machine be
// exercised by unit tests without spinning up a database.
export function decideEntitlement(
  row: Subscription | null,
  now: Date,
): Entitlement {
  if (!row) {
    return {
      state: 'allow',
      reason: 'no_subscription',
      subscription: null,
      graceEndsAt: null,
    };
  }

  switch (row.status) {
    case 'active':
      return { state: 'allow', reason: 'active', subscription: row, graceEndsAt: null };

    case 'pending':
      // Marketplace has acknowledged purchase but the customer has not finished
      // landing-page activation. Allow writes so onboarding can complete; the
      // landing page itself is the only write path before activation anyway.
      return {
        state: 'allow',
        reason: 'pending_provisioning',
        subscription: row,
        graceEndsAt: null,
      };

    case 'grace':
    case 'suspended': {
      const grace = row.graceEndsAt;
      if (grace && grace.getTime() > now.getTime()) {
        return { state: 'grace', reason: 'grace_open', subscription: row, graceEndsAt: grace };
      }
      return { state: 'block', reason: 'grace_expired', subscription: row, graceEndsAt: grace };
    }

    case 'provisioning':
      // Synonym of `pending`: acknowledged, activation not yet complete.
      return {
        state: 'allow',
        reason: 'pending_provisioning',
        subscription: row,
        graceEndsAt: null,
      };

    case 'trial':
      return { state: 'allow', reason: 'trial', subscription: row, graceEndsAt: null };

    case 'cancelled':
      return { state: 'block', reason: 'cancelled', subscription: row, graceEndsAt: null };
  }
}

// Resolve a tenant's current entitlement. Missing rows = self-installed = allow.
// Pure read against the DB; safe to call from anywhere on the server.
export async function resolveEntitlement(
  tenantId: string,
  now: Date = new Date(),
): Promise<Entitlement> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);
  return decideEntitlement(row ?? null, now);
}
