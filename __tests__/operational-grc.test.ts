import { describe, expect, it } from 'vitest';
import {
  accessReviewCompletionBlockers,
  assertAccessReviewTransition,
  assertPersonnelTransition,
  assertPolicyTransition,
  assertVendorTransition,
  governanceOverdueItems,
  parseAccessReviewItems,
  vendorApprovalBlockers,
} from '@/lib/governance/workflow';

describe('operational GRC state machines', () => {
  it('enforces policy and personnel lifecycle transitions', () => {
    expect(() => assertPolicyTransition('draft', 'in_review')).not.toThrow();
    expect(() => assertPolicyTransition('draft', 'published')).toThrow('Invalid policy transition');
    expect(() => assertPersonnelTransition('active', 'suspended')).not.toThrow();
    expect(() => assertPersonnelTransition('terminated', 'active')).toThrow('Invalid personnel transition');
  });

  it('enforces access review decisions and remediation before completion', () => {
    expect(() => assertAccessReviewTransition('draft', 'in_progress')).not.toThrow();
    expect(() => assertAccessReviewTransition('draft', 'completed')).toThrow('Invalid access review transition');
    expect(accessReviewCompletionBlockers([
      { decision: 'retain', remediationStatus: 'none' },
      { decision: 'revoke', remediationStatus: 'open' },
    ])).toEqual(['1 access remediation item remains open.']);
    expect(accessReviewCompletionBlockers([
      { decision: 'retain', remediationStatus: 'none' },
      { decision: 'revoke', remediationStatus: 'complete' },
    ])).toEqual([]);
  });

  it('requires due diligence and risk acceptance before vendor approval', () => {
    expect(() => assertVendorTransition('intake', 'assessing')).not.toThrow();
    expect(() => assertVendorTransition('intake', 'approved')).toThrow('Invalid vendor transition');
    expect(vendorApprovalBlockers({
      dueDiligenceSummary: 'Independent assurance and contract controls reviewed.',
      residualRisk: 'high',
      nextReviewAt: new Date('2027-01-01T00:00:00Z'),
      riskAcceptanceStatement: null,
    })).toEqual(['High or critical residual risk needs a documented acceptance statement.']);
  });

  it('parses access-review intake rows and rejects malformed rows', () => {
    expect(parseAccessReviewItems('Alex | AWS | Administrator | alex@example.com')).toEqual([{
      subjectName: 'Alex',
      systemName: 'AWS',
      accessLevel: 'Administrator',
      subjectEmail: 'alex@example.com',
    }]);
    expect(() => parseAccessReviewItems('Alex | AWS')).toThrow('Name | System');
  });

  it('surfaces overdue unresolved work across all four registers', () => {
    const due = new Date('2026-01-01T00:00:00Z');
    const overdue = governanceOverdueItems({
      now: new Date('2026-02-01T00:00:00Z'),
      policies: [{ id: 'p', title: 'Access control', status: 'published', reviewDueAt: due }],
      attestations: [{ id: 'a', policyTitle: 'Access control', status: 'pending', dueAt: due }],
      personnel: [{ id: 'u', personName: 'Alex', employmentStatus: 'active', trainingDueAt: due, trainingCompletedAt: null, offboardingDueAt: null, offboardingCompletedAt: null }],
      accessReviews: [{ id: 'r', title: 'Quarterly privileged access', status: 'in_progress', dueAt: due }],
      vendors: [{ id: 'v', vendorName: 'Cloud supplier', status: 'monitoring', nextReviewAt: due }],
    });
    expect(overdue.map((item) => item.kind)).toEqual(['policy', 'attestation', 'personnel', 'access_review', 'vendor']);
  });
});
