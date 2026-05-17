import { describe, it, expect } from 'vitest';
import {
  ACTIONS,
  PERMISSIONS,
  isPermitted,
  assertIndependenceGuard,
} from '@/lib/rbac/matrix';

describe('RBAC matrix', () => {
  it('every action has at least one permitted role', () => {
    for (const action of Object.values(ACTIONS)) {
      expect(PERMISSIONS[action].length).toBeGreaterThan(0);
    }
  });

  it('tenant_owner can manage the tenant', () => {
    expect(isPermitted(ACTIONS.tenantManage, 'tenant_owner')).toBe(true);
    expect(isPermitted(ACTIONS.tenantManage, 'assessor_admin')).toBe(false);
  });

  it('only lead_assessor can sign off findings', () => {
    expect(isPermitted(ACTIONS.findingSignOff, 'lead_assessor')).toBe(true);
    expect(isPermitted(ACTIONS.findingSignOff, 'assessor')).toBe(false);
    expect(isPermitted(ACTIONS.findingSignOff, 'client_admin')).toBe(false);
  });

  it('client roles can upload evidence, assessors cannot', () => {
    expect(isPermitted(ACTIONS.evidenceUpload, 'client_admin')).toBe(true);
    expect(isPermitted(ACTIONS.evidenceUpload, 'client_contributor')).toBe(true);
    expect(isPermitted(ACTIONS.evidenceUpload, 'lead_assessor')).toBe(false);
    expect(isPermitted(ACTIONS.evidenceUpload, 'assessor')).toBe(false);
  });

  it('read_only_observer can view but not mutate', () => {
    expect(isPermitted(ACTIONS.engagementView, 'read_only_observer')).toBe(true);
    expect(isPermitted(ACTIONS.findingCreate, 'read_only_observer')).toBe(false);
    expect(isPermitted(ACTIONS.evidenceUpload, 'read_only_observer')).toBe(false);
  });

  it('independence guard: no assessor-side role has remediation_guidance', () => {
    expect(() => assertIndependenceGuard()).not.toThrow();

    expect(isPermitted(ACTIONS.remediationGuidanceView, 'lead_assessor')).toBe(false);
    expect(isPermitted(ACTIONS.remediationGuidanceView, 'assessor')).toBe(false);
    expect(isPermitted(ACTIONS.remediationGuidanceView, 'tenant_owner')).toBe(false);
    expect(isPermitted(ACTIONS.remediationGuidanceView, 'assessor_admin')).toBe(false);
    expect(isPermitted(ACTIONS.remediationGuidanceView, 'read_only_observer')).toBe(false);

    expect(isPermitted(ACTIONS.remediationGuidanceView, 'client_admin')).toBe(true);
    expect(isPermitted(ACTIONS.remediationGuidanceView, 'client_contributor')).toBe(true);
  });

  it('certification signing is restricted to lead_assessor', () => {
    expect(isPermitted(ACTIONS.certificationSign, 'lead_assessor')).toBe(true);
    expect(isPermitted(ACTIONS.certificationSign, 'tenant_owner')).toBe(false);
    expect(isPermitted(ACTIONS.certificationSign, 'assessor')).toBe(false);
  });
});
