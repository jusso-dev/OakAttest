import { maturityRank } from '@/lib/essential-eight';

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
