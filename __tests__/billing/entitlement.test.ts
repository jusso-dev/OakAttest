import { describe, it, expect } from 'vitest';
import { decideEntitlement } from '@/lib/billing/entitlement';
import type { Subscription } from '@/db/schema/subscriptions';

const NOW = new Date('2026-06-07T00:00:00Z');

function sub(overrides: Partial<Subscription>): Subscription {
  return {
    id: 'sub-1',
    tenantId: 'tenant-1',
    marketplaceSubscriptionId: 'mp-1',
    externalProvider: 'manual',
    externalSubscriptionId: null,
    purchaserUserId: null,
    planId: 'starter',
    status: 'active',
    quantity: 1,
    effectiveStartAt: new Date('2026-01-01T00:00:00Z'),
    effectiveEndAt: null,
    graceEndsAt: null,
    lastWebhookAt: null,
    metadata: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('decideEntitlement', () => {
  it('no subscription row → allow (self-installed)', () => {
    const e = decideEntitlement(null, NOW);
    expect(e.state).toBe('allow');
    expect(e.reason).toBe('no_subscription');
    expect(e.subscription).toBeNull();
  });

  it('active → allow', () => {
    const e = decideEntitlement(sub({ status: 'active' }), NOW);
    expect(e.state).toBe('allow');
    expect(e.reason).toBe('active');
  });

  it('pending → allow (provisioning)', () => {
    const e = decideEntitlement(sub({ status: 'pending' }), NOW);
    expect(e.state).toBe('allow');
    expect(e.reason).toBe('pending_provisioning');
  });

  it('suspended with future graceEndsAt stays allowed', () => {
    const grace = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const e = decideEntitlement(sub({ status: 'suspended', graceEndsAt: grace }), NOW);
    expect(e.state).toBe('allow');
    expect(e.reason).toBe('grace_open');
    expect(e.graceEndsAt).toEqual(grace);
  });

  it('suspended with past graceEndsAt stays allowed', () => {
    const grace = new Date(NOW.getTime() - 1000);
    const e = decideEntitlement(sub({ status: 'suspended', graceEndsAt: grace }), NOW);
    expect(e.state).toBe('allow');
    expect(e.reason).toBe('grace_expired');
  });

  it('suspended with no graceEndsAt stays allowed', () => {
    const e = decideEntitlement(sub({ status: 'suspended', graceEndsAt: null }), NOW);
    expect(e.state).toBe('allow');
    expect(e.reason).toBe('grace_expired');
  });

  it('grace status stays allowed when window open', () => {
    const grace = new Date(NOW.getTime() + 1000);
    const e = decideEntitlement(sub({ status: 'grace', graceEndsAt: grace }), NOW);
    expect(e.state).toBe('allow');
    expect(e.reason).toBe('grace_open');
  });

  it('cancelled stays allowed', () => {
    const e = decideEntitlement(sub({ status: 'cancelled' }), NOW);
    expect(e.state).toBe('allow');
    expect(e.reason).toBe('cancelled');
  });
});
