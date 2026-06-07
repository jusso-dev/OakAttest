import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  subscriptions,
  type Subscription,
  type SubscriptionStatus,
} from '@/db/schema/subscriptions';
import { recordAudit } from '@/lib/audit/log';

// Allowed transitions. Webhook handlers (#44) call into the same map so the
// Marketplace push and admin actions cannot diverge.
//
// `cancelled` is terminal. Reinstatement out of `cancelled` requires a new
// subscription row keyed by a new `marketplaceSubscriptionId` — Microsoft does
// not reissue a cancelled subscription.
const TRANSITIONS: Record<SubscriptionStatus, ReadonlySet<SubscriptionStatus>> = {
  pending: new Set(['active', 'cancelled']),
  active: new Set(['suspended', 'cancelled']),
  // Suspended is the entry point for the grace window. The transition to
  // `grace` happens at write time if `graceEndsAt` is in the future; webhooks
  // typically set `suspended` directly and OakAttest derives `grace` from the
  // timestamp. We still allow an explicit transition for admin tooling.
  suspended: new Set(['grace', 'active', 'cancelled']),
  grace: new Set(['active', 'suspended', 'cancelled']),
  cancelled: new Set([]),
};

export class InvalidTransitionError extends Error {
  constructor(public from: SubscriptionStatus, public to: SubscriptionStatus) {
    super(`Invalid subscription transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export type TransitionInput = {
  tenantId: string;
  toStatus: SubscriptionStatus;
  actorUserId?: string | null;
  actorType?: 'user' | 'system' | 'integration';
  // For suspended/grace transitions. Ignored otherwise.
  graceEndsAt?: Date | null;
  effectiveEndAt?: Date | null;
  reason?: string;
};

// Apply a status change and emit an audit entry. Returns the updated row.
// Callers must wrap in a transaction if they need atomicity with sibling writes.
export async function transitionSubscription(input: TransitionInput): Promise<Subscription> {
  const [current] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, input.tenantId))
    .limit(1);

  if (!current) {
    throw new Error(`No subscription for tenant ${input.tenantId}`);
  }
  if (current.status === input.toStatus) {
    return current;
  }
  if (!TRANSITIONS[current.status].has(input.toStatus)) {
    throw new InvalidTransitionError(current.status, input.toStatus);
  }

  const patch: Partial<typeof subscriptions.$inferInsert> = {
    status: input.toStatus,
    updatedAt: new Date(),
  };
  if (input.toStatus === 'suspended' || input.toStatus === 'grace') {
    if (input.graceEndsAt !== undefined) patch.graceEndsAt = input.graceEndsAt;
  }
  if (input.toStatus === 'active') {
    // Reinstatement clears the grace timestamp.
    patch.graceEndsAt = null;
  }
  if (input.toStatus === 'cancelled') {
    patch.effectiveEndAt = input.effectiveEndAt ?? new Date();
  }

  const [updated] = await db
    .update(subscriptions)
    .set(patch)
    .where(
      and(
        eq(subscriptions.tenantId, input.tenantId),
        eq(subscriptions.status, current.status),
      ),
    )
    .returning();

  if (!updated) {
    // Optimistic-concurrency miss: someone else moved it.
    throw new Error('Subscription status changed concurrently');
  }

  await recordAudit({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType ?? 'system',
    action: `subscription.${input.toStatus}`,
    resourceType: 'subscription',
    resourceId: updated.id,
    beforeJson: { status: current.status, graceEndsAt: current.graceEndsAt },
    afterJson: { status: updated.status, graceEndsAt: updated.graceEndsAt },
    message: input.reason ?? null,
  });

  return updated;
}
