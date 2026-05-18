import { describe, expect, it } from 'vitest';
import { calculateEssentialEightOverall, formatMaturity } from '@/lib/essential-eight';
import { criteriaForStrategy, criteriaCompletionSummary } from '@/lib/essential-eight-criteria';
import { validateEssentialEightAssessment } from '@/lib/essential-eight-validation';

describe('Essential Eight package maturity', () => {
  it('uses the lowest maturity across all eight strategies', () => {
    const rows = [
      'application_control',
      'patch_applications',
      'configure_macro_settings',
      'user_application_hardening',
      'restrict_admin_privileges',
      'patch_operating_systems',
      'multi_factor_authentication',
      'regular_backups',
    ].map((strategy, index) => ({
      strategy,
      currentMaturity: index === 3 ? 'ml1' : 'ml2',
      targetMaturity: 'ml2',
    }));

    const result = calculateEssentialEightOverall(rows, 'ml2');
    expect(result.achieved).toBe('ml1');
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].strategy).toBe('user_application_hardening');
  });

  it('treats missing strategies as ML0 blockers', () => {
    const result = calculateEssentialEightOverall([], 'ml1');
    expect(result.achieved).toBe('ml0');
    expect(result.blockers).toHaveLength(8);
    expect(formatMaturity(result.achieved)).toBe('ML0');
  });

  it('handles mixed ML0, ML1, ML2, and ML3 results as a package', () => {
    const rows = [
      ['application_control', 'ml3'],
      ['patch_applications', 'ml2'],
      ['configure_macro_settings', 'ml1'],
      ['user_application_hardening', 'ml0'],
      ['restrict_admin_privileges', 'ml3'],
      ['patch_operating_systems', 'ml2'],
      ['multi_factor_authentication', 'ml1'],
      ['regular_backups', 'ml3'],
    ].map(([strategy, currentMaturity]) => ({
      strategy,
      currentMaturity,
      targetMaturity: 'ml2',
    }));

    const result = calculateEssentialEightOverall(rows, 'ml2');
    expect(result.achieved).toBe('ml0');
    expect(result.blockers.map((item) => item.strategy)).toEqual([
      'configure_macro_settings',
      'user_application_hardening',
      'multi_factor_authentication',
    ]);
  });

  it('requires a defensible conclusion before marking target maturity achieved', () => {
    expect(() =>
      validateEssentialEightAssessment({
        currentMaturity: 'ml2',
        targetMaturity: 'ml2',
        evidenceQuality: 'good',
        assessorConclusion: '',
      }),
    ).toThrow(/Assessor conclusion/);
    expect(() =>
      validateEssentialEightAssessment({
        currentMaturity: 'ml2',
        targetMaturity: 'ml2',
        evidenceQuality: 'insufficient',
        assessorConclusion: 'Meets the criterion.',
      }),
    ).toThrow(/Evidence quality/);
    expect(() =>
      validateEssentialEightAssessment({
        currentMaturity: 'ml1',
        targetMaturity: 'ml2',
        evidenceQuality: 'insufficient',
        assessorConclusion: '',
      }),
    ).not.toThrow();
  });

  it('provides structured ML1 to ML3 criteria per strategy', () => {
    const criteria = criteriaForStrategy('multi_factor_authentication');
    expect(criteria.map((item) => item.maturity)).toEqual(['ml1', 'ml2', 'ml3']);
    expect(criteria.every((item) => item.title.length > 20)).toBe(true);
    expect(
      criteriaCompletionSummary([
        { criterionId: criteria[0].id, maturity: 'ml1', status: 'met' },
        { criterionId: criteria[1].id, maturity: 'ml2', status: 'not_met' },
      ]),
    ).toMatchObject({ assessed: 2, notMet: 1 });
  });
});
