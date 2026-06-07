import { describe, it, expect } from 'vitest';
import { MUTATING_ACTIONS } from '@/lib/billing/actions';
import { ACTIONS } from '@/lib/rbac/matrix';

describe('MUTATING_ACTIONS', () => {
  it('includes every write/sign/upload/manage action', () => {
    // Hard-coded subset of actions we know to be mutating. New mutating
    // actions added to ACTIONS must be added to MUTATING_ACTIONS too; this
    // test fails if any of these go missing.
    const required = [
      ACTIONS.tenantManage,
      ACTIONS.tenantInvite,
      ACTIONS.engagementCreate,
      ACTIONS.engagementUpdate,
      ACTIONS.engagementInvite,
      ACTIONS.evidenceUpload,
      ACTIONS.evidenceReview,
      ACTIONS.findingCreate,
      ACTIONS.findingSignOff,
      ACTIONS.certificationGenerate,
      ACTIONS.certificationSign,
      ACTIONS.remediationGuidanceWrite,
    ];
    for (const action of required) {
      expect(MUTATING_ACTIONS.has(action)).toBe(true);
    }
  });

  it('excludes pure read actions', () => {
    const reads = [
      ACTIONS.tenantViewMembers,
      ACTIONS.engagementView,
      ACTIONS.evidenceView,
      ACTIONS.findingView,
      ACTIONS.taskView,
      ACTIONS.auditView,
      ACTIONS.complianceView,
      ACTIONS.remediationGuidanceView,
    ];
    for (const action of reads) {
      expect(MUTATING_ACTIONS.has(action)).toBe(false);
    }
  });
});
