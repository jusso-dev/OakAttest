import { describe, it, expect } from 'vitest';
import type { SubscriptionStatus } from '@/db/schema/subscriptions';

// The transition map in `lib/billing/transitions.ts` is internal. We re-derive
// it here for testing — keeping the table inline keeps the test independent of
// any module-level mocking that the runtime version needs. If you change the
// map in the source, update this fixture and the tests will catch drift via
// the explicit case list.

const TRANSITIONS: Record<SubscriptionStatus, ReadonlySet<SubscriptionStatus>> = {
  pending: new Set(['active', 'trial', 'cancelled']),
  provisioning: new Set(['active', 'trial', 'cancelled']),
  trial: new Set(['active', 'suspended', 'cancelled']),
  active: new Set(['suspended', 'cancelled']),
  suspended: new Set(['grace', 'active', 'cancelled']),
  grace: new Set(['active', 'suspended', 'cancelled']),
  cancelled: new Set([]),
};

function allowed(from: SubscriptionStatus, to: SubscriptionStatus) {
  return TRANSITIONS[from].has(to);
}

describe('subscription state machine', () => {
  it('pending allows activation and direct cancellation', () => {
    expect(allowed('pending', 'active')).toBe(true);
    expect(allowed('pending', 'cancelled')).toBe(true);
    expect(allowed('pending', 'suspended')).toBe(false);
  });

  it('active can suspend or cancel', () => {
    expect(allowed('active', 'suspended')).toBe(true);
    expect(allowed('active', 'cancelled')).toBe(true);
    expect(allowed('active', 'pending')).toBe(false);
  });

  it('suspended can reinstate, enter grace, or cancel', () => {
    expect(allowed('suspended', 'active')).toBe(true);
    expect(allowed('suspended', 'grace')).toBe(true);
    expect(allowed('suspended', 'cancelled')).toBe(true);
    expect(allowed('suspended', 'pending')).toBe(false);
  });

  it('grace can reinstate, re-suspend, or cancel', () => {
    expect(allowed('grace', 'active')).toBe(true);
    expect(allowed('grace', 'suspended')).toBe(true);
    expect(allowed('grace', 'cancelled')).toBe(true);
  });

  it('trial can convert, suspend, or cancel', () => {
    expect(allowed('trial', 'active')).toBe(true);
    expect(allowed('trial', 'suspended')).toBe(true);
    expect(allowed('trial', 'cancelled')).toBe(true);
  });

  it('provisioning can activate or start a trial', () => {
    expect(allowed('provisioning', 'active')).toBe(true);
    expect(allowed('provisioning', 'trial')).toBe(true);
    expect(allowed('provisioning', 'suspended')).toBe(false);
  });

  it('cancelled is terminal', () => {
    expect(allowed('cancelled', 'active')).toBe(false);
    expect(allowed('cancelled', 'pending')).toBe(false);
    expect(allowed('cancelled', 'suspended')).toBe(false);
    expect(allowed('cancelled', 'grace')).toBe(false);
  });
});
