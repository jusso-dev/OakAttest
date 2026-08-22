import { describe, expect, it } from 'vitest';
import {
  E8_ASSESSMENT_OUTCOMES,
  E8_ASSESSMENT_GUIDE_VERSION,
  assessmentOutcome,
  buildEssentialEightCriterion,
  criteriaCompletionSummary,
} from '@/lib/essential-eight-criteria';

describe('Essential Eight versioned criteria', () => {
  it('uses every ASD standardised assessment outcome', () => {
    expect(E8_ASSESSMENT_OUTCOMES).toEqual([
      'not_assessed',
      'effective',
      'alternate_control',
      'ineffective',
      'no_visibility',
      'not_implemented',
      'not_applicable',
    ]);
  });

  it('builds stable criteria from the pinned ISM control and guide revision', () => {
    const criterion = buildEssentialEightCriterion({
      strategy: 'multi_factor_authentication',
      frameworkControlId: '00000000-0000-4000-8000-000000000001',
      controlId: 'ISM-1800',
      description: 'Multi-factor authentication is used for privileged users.',
      sourceRevision: '2026-06',
      maturityLevel: 2,
    });

    expect(criterion).toMatchObject({
      criterionId: 'multi_factor_authentication:2026-06:ISM-1800',
      guideVersion: E8_ASSESSMENT_GUIDE_VERSION,
      maturity: 'ml2',
    });
  });

  it('reads legacy result statuses without rewriting historical snapshots', () => {
    expect(assessmentOutcome({ status: 'met' })).toBe('effective');
    expect(assessmentOutcome({ status: 'partially_met' })).toBe('ineffective');
    expect(
      criteriaCompletionSummary([
        result({ outcome: 'effective' }),
        result({ outcome: 'alternate_control', controlId: 'ISM-2', criterionId: 'id-2' }),
        result({ outcome: 'no_visibility', controlId: 'ISM-3', criterionId: 'id-3' }),
      ]),
    ).toMatchObject({ total: 3, assessed: 3, effective: 1, alternateControl: 1, noVisibility: 1 });
  });
});

function result(overrides: Record<string, unknown> = {}) {
  return {
    criterionId: 'id-1',
    strategy: 'application_control' as const,
    frameworkControlId: '00000000-0000-4000-8000-000000000001',
    controlId: 'ISM-1',
    criterionText: 'Criterion',
    sourceRevision: '2026-06',
    guideVersion: '2024-08',
    maturity: 'ml1' as const,
    outcome: 'not_assessed' as const,
    ...overrides,
  };
}
