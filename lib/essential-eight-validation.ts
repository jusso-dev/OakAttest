import { maturityRank } from '@/lib/essential-eight';
import {
  assessmentOutcome,
  type EssentialEightCriterion,
  type EssentialEightCriterionResult,
} from '@/lib/essential-eight-criteria';

export type EssentialEightAssessmentValidationInput = {
  currentMaturity: string;
  targetMaturity: string;
  evidenceQuality?: string | null;
  assessorConclusion?: string | null;
};

export function validateEssentialEightAssessment(input: EssentialEightAssessmentValidationInput) {
  const meetsTarget = maturityRank(input.currentMaturity) >= maturityRank(input.targetMaturity);
  if (!meetsTarget) return;

  if (!input.assessorConclusion?.trim()) {
    throw new Error('Assessor conclusion is required before marking the target maturity as achieved.');
  }

  if (!input.evidenceQuality || input.evidenceQuality === 'insufficient') {
    throw new Error('Evidence quality must be recorded and cannot be insufficient when target maturity is achieved.');
  }
}

export function validateEssentialEightWorkpaper(
  result: EssentialEightCriterionResult,
): void {
  const outcome = assessmentOutcome(result);
  if (
    result.sampleSize !== undefined &&
    result.populationSize !== undefined &&
    result.sampleSize > result.populationSize
  ) {
    throw new Error('Sample size cannot exceed population size.');
  }
  if (
    result.sampledItems &&
    result.sampleSize !== undefined &&
    result.sampledItems.length > result.sampleSize
  ) {
    throw new Error('Sampled item count cannot exceed sample size.');
  }
  if (outcome === 'not_assessed') return;
  if (!result.testProcedure?.trim() || !result.testResult?.trim()) {
    throw new Error(`${result.controlId}: test procedure and result are required.`);
  }
  if (!result.assessmentMethods?.trim() || !result.assessmentObjects?.trim()) {
    throw new Error(`${result.controlId}: assessment methods and objects are required.`);
  }
  if (!result.testedAt) {
    throw new Error(`${result.controlId}: test date is required.`);
  }
  if (outcome === 'effective' || outcome === 'alternate_control') {
    if (!result.evidenceRefs?.length) {
      throw new Error(`${result.controlId}: credible evidence is required for an effective outcome.`);
    }
    if (!result.evidenceQuality || result.evidenceQuality === 'insufficient') {
      throw new Error(`${result.controlId}: sufficient evidence quality is required.`);
    }
  }
  if (
    outcome === 'alternate_control' &&
    (!result.alternateControl?.trim() || !result.equivalentProtectionConclusion?.trim())
  ) {
    throw new Error(
      `${result.controlId}: alternate control and equivalent-protection conclusion are required.`,
    );
  }
  if (outcome === 'not_applicable' && !result.notApplicableJustification?.trim()) {
    throw new Error(`${result.controlId}: not-applicable justification is required.`);
  }
  if (result.exception) {
    const exception = result.exception;
    if (
      !exception.justification.trim() ||
      !exception.authorityName.trim() ||
      !exception.authorityRole.trim() ||
      !exception.approvedAt
    ) {
      throw new Error(`${result.controlId}: exception approval authority and decision are required.`);
    }
  }
}

export function validateEssentialEightCriteriaForMaturity(input: {
  currentMaturity: string;
  criteria: EssentialEightCriterion[];
  results: EssentialEightCriterionResult[];
}): void {
  const currentRank = maturityRank(input.currentMaturity);
  const resultById = new Map(input.results.map((result) => [result.criterionId, result]));

  for (const result of input.results) validateEssentialEightWorkpaper(result);
  if (currentRank === 0) return;
  if (input.criteria.length === 0) {
    throw new Error('Current maturity cannot be assessed without versioned ISM criteria.');
  }

  const incomplete = input.criteria.filter((criterion) => {
    if (maturityRank(criterion.maturity) > currentRank) return false;
    const outcome = assessmentOutcome(resultById.get(criterion.criterionId));
    return outcome !== 'effective' && outcome !== 'alternate_control' && outcome !== 'not_applicable';
  });
  if (incomplete.length > 0) {
    throw new Error(
      `Current maturity is unsupported: ${incomplete
        .map((criterion) => criterion.controlId)
        .join(', ')} need an effective, alternate-control, or justified not-applicable outcome.`,
    );
  }
}
