import { describe, expect, it } from 'vitest';
import { ACTIONS, assertIndependenceGuard, isPermitted } from '@/lib/rbac/matrix';

describe('operational GRC RBAC', () => {
  it('gives assessors read-only assurance visibility', () => {
    expect(isPermitted(ACTIONS.governanceView, 'assessor')).toBe(true);
    expect(isPermitted(ACTIONS.policyWrite, 'assessor')).toBe(false);
    expect(isPermitted(ACTIONS.personnelManage, 'lead_assessor')).toBe(false);
    expect(isPermitted(ACTIONS.accessReviewManage, 'tenant_owner')).toBe(false);
    expect(isPermitted(ACTIONS.vendorManage, 'assessor_admin')).toBe(false);
  });

  it('keeps accountable approvals and sensitive registers client-owned', () => {
    expect(isPermitted(ACTIONS.policyWrite, 'client_contributor')).toBe(true);
    expect(isPermitted(ACTIONS.policyApprove, 'client_contributor')).toBe(false);
    expect(isPermitted(ACTIONS.policyApprove, 'client_admin')).toBe(true);
    expect(isPermitted(ACTIONS.policyAccept, 'client_contributor')).toBe(true);
    expect(isPermitted(ACTIONS.personnelManage, 'client_admin')).toBe(true);
    expect(isPermitted(ACTIONS.accessReviewManage, 'client_admin')).toBe(true);
    expect(isPermitted(ACTIONS.vendorManage, 'client_contributor')).toBe(true);
    expect(isPermitted(ACTIONS.vendorRiskAccept, 'client_contributor')).toBe(false);
    expect(isPermitted(ACTIONS.vendorRiskAccept, 'client_admin')).toBe(true);
    expect(assertIndependenceGuard).not.toThrow();
  });
});
