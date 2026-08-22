import { describe, expect, it } from 'vitest';
import { ACTIONS, assertIndependenceGuard, isPermitted } from '@/lib/rbac/matrix';

describe('Trust Portal RBAC', () => {
  const roles = [
    'tenant_owner',
    'assessor_admin',
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
    'read_only_observer',
  ] as const;

  it('allows every engagement role to inspect publication state', () => {
    for (const role of roles) expect(isPermitted(ACTIONS.trustPortalView, role)).toBe(true);
  });

  it('keeps public release and access approval client-accountable', () => {
    expect(() => assertIndependenceGuard()).not.toThrow();
    for (const role of roles) {
      expect(isPermitted(ACTIONS.trustPortalManage, role)).toBe(role === 'client_admin');
    }
  });
});
