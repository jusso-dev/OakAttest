import { describe, expect, it } from 'vitest';
import {
  buildLifecycleStages,
  monitoringEventRequiresReassessment,
  riskRating,
  riskScore,
  validateAuthorisationDecision,
  validateRiskTreatmentDecision,
} from '@/lib/assurance-lifecycle';

describe('assurance lifecycle', () => {
  it('calculates the documented 5 by 5 risk bands', () => {
    expect(riskScore(5, 5)).toBe(25);
    expect(riskRating(1, 4)).toBe('low');
    expect(riskRating(3, 3)).toBe('medium');
    expect(riskRating(4, 4)).toBe('high');
    expect(riskRating(5, 5)).toBe('extreme');
    expect(() => riskScore(0, 3)).toThrow(/Likelihood/);
  });

  it('requires accountable, expiring risk acceptance', () => {
    expect(
      validateRiskTreatmentDecision({
        decision: 'accept',
        rationale: 'Accepted within the organisation risk appetite.',
        acceptedByName: 'System owner',
        acceptedByRole: 'Chief information security officer',
        acceptedAt: new Date('2026-08-22T00:00:00Z'),
        expiresAt: new Date('2026-11-22T00:00:00Z'),
      }),
    ).toEqual([]);
    expect(
      validateRiskTreatmentDecision({ decision: 'accept', rationale: 'Too short' }),
    ).toEqual(
      expect.arrayContaining([
        'Record a rationale of at least 10 characters.',
        'Name the person accepting the risk.',
        'Set an expiry or review date for the acceptance.',
      ]),
    );
  });

  it('requires a plan, owner, and deadline for non-acceptance treatments', () => {
    expect(
      validateRiskTreatmentDecision({
        decision: 'mitigate',
        rationale: 'Reduce the residual exposure below the approved threshold.',
      }),
    ).toEqual(
      expect.arrayContaining([
        'Record the treatment plan.',
        'Assign a treatment owner.',
        'Set a treatment due date.',
      ]),
    );
  });

  it('blocks authorisation when a high residual risk has no current decision', () => {
    const errors = validateAuthorisationDecision(
      {
        status: 'authorised',
        authorisingOfficerName: 'Accountable officer',
        authorisingOfficerRole: 'Agency head delegate',
        decisionStatement: 'Authorised for operation within the documented system boundary.',
        issuedAt: new Date('2026-08-22T00:00:00Z'),
        expiresAt: new Date('2027-08-22T00:00:00Z'),
      },
      [
        {
          code: 'RSK-001',
          title: 'Privileged account compromise',
          residualLikelihood: 4,
          residualImpact: 5,
          latestTreatment: null,
        },
      ],
      new Date('2026-08-22T00:00:00Z'),
    );
    expect(errors).toContain(
      'RSK-001 (Privileged account compromise) has extreme residual risk without a current treatment decision.',
    );
  });

  it('accepts authorisation with a current documented high-risk acceptance', () => {
    const errors = validateAuthorisationDecision(
      {
        status: 'authorised_with_conditions',
        authorisingOfficerName: 'Accountable officer',
        authorisingOfficerRole: 'Agency head delegate',
        decisionStatement: 'Authorised while the conditions are monitored.',
        conditions: 'Review privileged access every month.',
        issuedAt: new Date('2026-08-22T00:00:00Z'),
        expiresAt: new Date('2027-08-22T00:00:00Z'),
      },
      [
        {
          code: 'RSK-001',
          title: 'Privileged account compromise',
          residualLikelihood: 4,
          residualImpact: 5,
          latestTreatment: {
            decision: 'accept',
            acceptedAt: new Date('2026-08-20T00:00:00Z'),
            expiresAt: new Date('2026-11-20T00:00:00Z'),
          },
        },
      ],
      new Date('2026-08-22T00:00:00Z'),
    );
    expect(errors).toEqual([]);
  });

  it('opens reassessment for material change and control failure', () => {
    expect(monitoringEventRequiresReassessment('control_ineffective', 'low')).toBe(true);
    expect(monitoringEventRequiresReassessment('system_change', 'high')).toBe(true);
    expect(monitoringEventRequiresReassessment('scheduled_review', 'critical')).toBe(false);
  });

  it('shows the six lifecycle stages and flags open reassessment triggers', () => {
    const stages = buildLifecycleStages({
      boundaryLocked: true,
      assessedControlCount: 120,
      totalControlCount: 120,
      riskCount: 3,
      untreatedHighRiskCount: 0,
      authorisationStatus: 'authorised_with_conditions',
      monitoringPlanStatus: 'active',
      openReassessmentEvents: 1,
    });
    expect(stages.map((stage) => stage.key)).toEqual([
      'scope',
      'assess',
      'risk',
      'authorise',
      'monitor',
      'reassess',
    ]);
    expect(stages.at(-1)?.state).toBe('attention');
  });
});
