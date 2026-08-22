import { describe, expect, it } from 'vitest';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';

describe('connector and evidence-reuse RBAC', () => {
  it('keeps observers read-only and separates evidence proposals from review', () => {
    expect(isPermitted(ACTIONS.connectorView, 'read_only_observer')).toBe(true);
    expect(isPermitted(ACTIONS.connectorRun, 'read_only_observer')).toBe(false);
    expect(isPermitted(ACTIONS.evidenceReuseView, 'read_only_observer')).toBe(true);
    expect(isPermitted(ACTIONS.evidenceReusePropose, 'client_contributor')).toBe(true);
    expect(isPermitted(ACTIONS.evidenceReuseReview, 'client_contributor')).toBe(false);
    expect(isPermitted(ACTIONS.evidenceReuseReview, 'assessor')).toBe(true);
  });

  it('allows accountable connector configuration without allowing every contributor', () => {
    for (const role of ['tenant_owner', 'assessor_admin', 'lead_assessor', 'client_admin'] as const) {
      expect(isPermitted(ACTIONS.connectorManage, role)).toBe(true);
    }
    expect(isPermitted(ACTIONS.connectorManage, 'assessor')).toBe(false);
    expect(isPermitted(ACTIONS.connectorManage, 'client_contributor')).toBe(false);
  });
});
