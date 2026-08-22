import { describe, expect, it } from 'vitest';
import {
  validateEssentialEightCriteriaForMaturity,
  validateEssentialEightWorkpaper,
} from '@/lib/essential-eight-validation';
import { buildEssentialEightCriterion, type EssentialEightCriterionResult } from '@/lib/essential-eight-criteria';

const criterion = buildEssentialEightCriterion({
  strategy: 'application_control',
  frameworkControlId: '00000000-0000-4000-8000-000000000001',
  controlId: 'ISM-1490',
  description: 'Application control is implemented on workstations.',
  sourceRevision: '2026-06',
  maturityLevel: 1,
});

describe('Essential Eight criterion workpapers', () => {
  it('accepts a defensible effective result with direct evidence and sample detail', () => {
    expect(() =>
      validateEssentialEightCriteriaForMaturity({
        currentMaturity: 'ml1',
        criteria: [criterion],
        results: [workpaper()],
      }),
    ).not.toThrow();
  });

  it('rejects unsupported maturity and weak effective evidence', () => {
    expect(() =>
      validateEssentialEightCriteriaForMaturity({
        currentMaturity: 'ml1',
        criteria: [criterion],
        results: [],
      }),
    ).toThrow(/unsupported/);
    expect(() =>
      validateEssentialEightWorkpaper(
        workpaper({ evidenceQuality: 'insufficient', evidenceRefs: [] }),
      ),
    ).toThrow(/credible evidence|sufficient evidence/);
  });

  it('requires equivalent protection for alternate controls and formal authority for exceptions', () => {
    expect(() =>
      validateEssentialEightWorkpaper(
        workpaper({ outcome: 'alternate_control', alternateControl: undefined }),
      ),
    ).toThrow(/alternate control/);
    expect(() =>
      validateEssentialEightWorkpaper(
        workpaper({
          exception: {
            justification: 'Temporary legacy dependency',
            authorityName: '',
            authorityRole: '',
            approvedAt: '',
          },
        }),
      ),
    ).toThrow(/approval authority/);
  });

  it('rejects samples larger than the tested population', () => {
    expect(() => validateEssentialEightWorkpaper(workpaper({ populationSize: 2, sampleSize: 3 }))).toThrow(
      /Sample size/,
    );
  });
});

function workpaper(
  overrides: Partial<EssentialEightCriterionResult> = {},
): EssentialEightCriterionResult {
  return {
    ...criterion,
    outcome: 'effective',
    assessmentMethods: 'Test',
    assessmentObjects: 'Managed workstation fleet',
    populationSize: 100,
    sampleSize: 10,
    sampledItems: ['device-01'],
    testProcedure: 'Attempt execution of an unapproved binary.',
    testResult: 'Execution was blocked on all sampled devices.',
    testedAt: '2026-08-22',
    evidenceQuality: 'excellent',
    evidenceRefs: ['00000000-0000-4000-8000-000000000002'],
    ...overrides,
  };
}
