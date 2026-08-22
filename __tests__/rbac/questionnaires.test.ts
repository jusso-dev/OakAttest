import { describe, expect, it } from 'vitest';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';

describe('questionnaire RBAC', () => {
  it('keeps observers read-only and lets contributors draft without approval rights', () => {
    expect(isPermitted(ACTIONS.questionnaireView, 'read_only_observer')).toBe(true);
    expect(isPermitted(ACTIONS.questionnaireRespond, 'read_only_observer')).toBe(false);
    expect(isPermitted(ACTIONS.questionnaireRespond, 'client_contributor')).toBe(true);
    expect(isPermitted(ACTIONS.questionnaireReview, 'client_contributor')).toBe(false);
  });

  it('limits questionnaire import and finalisation to accountable managers', () => {
    for (const role of ['tenant_owner', 'assessor_admin', 'lead_assessor', 'client_admin'] as const) {
      expect(isPermitted(ACTIONS.questionnaireManage, role)).toBe(true);
      expect(isPermitted(ACTIONS.questionnaireReview, role)).toBe(true);
    }
    expect(isPermitted(ACTIONS.questionnaireManage, 'assessor')).toBe(false);
  });
});
