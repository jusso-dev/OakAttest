import { describe, expect, it } from 'vitest';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import { frameworkVisibleToTenant, selectPreferredFrameworkPack } from '@/lib/frameworks/registry';

describe('custom framework RBAC', () => {
  it('limits pack authoring and activation to tenant administrators', () => {
    expect(isPermitted(ACTIONS.frameworkPackManage, 'tenant_owner')).toBe(true);
    expect(isPermitted(ACTIONS.frameworkPackManage, 'assessor_admin')).toBe(true);
    expect(isPermitted(ACTIONS.frameworkPackManage, 'lead_assessor')).toBe(false);
    expect(isPermitted(ACTIONS.frameworkPackManage, 'client_admin')).toBe(false);
    expect(isPermitted(ACTIONS.frameworkPackManage, 'read_only_observer')).toBe(false);
  });

  it('exposes global packs and current-tenant packs without cross-tenant visibility', () => {
    expect(frameworkVisibleToTenant(null, 'tenant-a')).toBe(true);
    expect(frameworkVisibleToTenant('tenant-a', 'tenant-a')).toBe(true);
    expect(frameworkVisibleToTenant('tenant-b', 'tenant-a')).toBe(false);

    const global = { id: 'global', tenantId: null };
    const own = { id: 'own', tenantId: 'tenant-a' };
    const foreign = { id: 'foreign', tenantId: 'tenant-b' };
    expect(selectPreferredFrameworkPack([global, foreign, own], 'tenant-a')).toBe(own);
    expect(selectPreferredFrameworkPack([global, foreign], 'tenant-a')).toBe(global);
    expect(selectPreferredFrameworkPack([foreign], 'tenant-a')).toBeNull();
  });
});
