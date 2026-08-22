import { describe, expect, it } from 'vitest';
import { ACTIONS, assertIndependenceGuard, isPermitted } from '@/lib/rbac/matrix';

describe('assurance lifecycle RBAC', () => {
  it('lets every engagement role inspect the lifecycle', () => {
    for (const role of [
      'tenant_owner',
      'assessor_admin',
      'lead_assessor',
      'assessor',
      'client_admin',
      'client_contributor',
      'read_only_observer',
    ] as const) {
      expect(isPermitted(ACTIONS.assuranceLifecycleView, role)).toBe(true);
    }
  });

  it('keeps risk acceptance and system authorisation client-accountable', () => {
    expect(() => assertIndependenceGuard()).not.toThrow();
    for (const role of [
      'tenant_owner',
      'assessor_admin',
      'lead_assessor',
      'assessor',
      'client_contributor',
      'read_only_observer',
    ] as const) {
      expect(isPermitted(ACTIONS.riskAccept, role)).toBe(false);
      expect(isPermitted(ACTIONS.systemAuthorise, role)).toBe(false);
    }
    expect(isPermitted(ACTIONS.riskAccept, 'client_admin')).toBe(true);
    expect(isPermitted(ACTIONS.systemAuthorise, 'client_admin')).toBe(true);
  });

  it('allows assessors to record risk without choosing client treatment', () => {
    expect(isPermitted(ACTIONS.riskAssess, 'assessor')).toBe(true);
    expect(isPermitted(ACTIONS.monitoringEventCreate, 'assessor')).toBe(true);
    expect(isPermitted(ACTIONS.riskTreat, 'assessor')).toBe(false);
    expect(isPermitted(ACTIONS.monitoringManage, 'assessor')).toBe(false);
    expect(isPermitted(ACTIONS.riskTreat, 'client_contributor')).toBe(true);
  });

  it('keeps observers read-only', () => {
    expect(isPermitted(ACTIONS.assuranceLifecycleView, 'read_only_observer')).toBe(true);
    expect(isPermitted(ACTIONS.riskAssess, 'read_only_observer')).toBe(false);
    expect(isPermitted(ACTIONS.monitoringEventCreate, 'read_only_observer')).toBe(false);
  });
});
