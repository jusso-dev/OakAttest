import type { EssentialEightStrategy } from '@/lib/essential-eight';

export const E8_ASSESSMENT_GUIDE_VERSION = '2024-08';
export const E8_CRITERIA_MODEL_VERSION = 'ism-mapped-v1';

export const E8_ASSESSMENT_OUTCOMES = [
  'not_assessed',
  'effective',
  'alternate_control',
  'ineffective',
  'no_visibility',
  'not_implemented',
  'not_applicable',
] as const;

export type EssentialEightAssessmentOutcome = (typeof E8_ASSESSMENT_OUTCOMES)[number];
export type EssentialEightEvidenceQuality =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor'
  | 'insufficient';

export type EssentialEightCriterionResult = {
  criterionId: string;
  strategy: EssentialEightStrategy;
  frameworkControlId: string;
  controlId: string;
  criterionText: string;
  sourceRevision: string;
  guideVersion: string;
  maturity: 'ml1' | 'ml2' | 'ml3';
  outcome: EssentialEightAssessmentOutcome;
  assessmentMethods?: string;
  assessmentObjects?: string;
  populationSize?: number;
  sampleSize?: number;
  sampledItems?: string[];
  testProcedure?: string;
  testResult?: string;
  evidenceQuality?: EssentialEightEvidenceQuality;
  evidenceLimitations?: string;
  evidenceRefs?: string[];
  alternateControl?: string;
  equivalentProtectionConclusion?: string;
  notApplicableJustification?: string;
  exception?: {
    justification: string;
    authorityName: string;
    authorityRole: string;
    decisionReference?: string;
    approvedAt: string;
    expiresAt?: string;
  };
  testedAt?: string;
  notes?: string;
  // Read compatibility for workpapers stored before the ASD outcome model.
  status?: 'not_assessed' | 'met' | 'partially_met' | 'not_met' | 'not_applicable';
};

export type EssentialEightCriterion = {
  criterionId: string;
  strategy: EssentialEightStrategy;
  frameworkControlId: string;
  controlId: string;
  criterionText: string;
  sourceRevision: string;
  guideVersion: string;
  maturity: 'ml1' | 'ml2' | 'ml3';
};

export function criterionIdForControl(input: {
  strategy: EssentialEightStrategy;
  sourceRevision: string;
  controlId: string;
}): string {
  return `${input.strategy}:${input.sourceRevision}:${input.controlId}`;
}

export function buildEssentialEightCriterion(input: {
  strategy: EssentialEightStrategy;
  frameworkControlId: string;
  controlId: string;
  description: string;
  sourceRevision: string;
  maturityLevel?: number | null;
  guideVersion?: string;
}): EssentialEightCriterion {
  const maturityLevel = Math.min(3, Math.max(1, input.maturityLevel ?? 1));
  return {
    criterionId: criterionIdForControl(input),
    strategy: input.strategy,
    frameworkControlId: input.frameworkControlId,
    controlId: input.controlId,
    criterionText: input.description,
    sourceRevision: input.sourceRevision,
    guideVersion: input.guideVersion ?? E8_ASSESSMENT_GUIDE_VERSION,
    maturity: `ml${maturityLevel}` as EssentialEightCriterion['maturity'],
  };
}

export function assessmentOutcome(result: Partial<EssentialEightCriterionResult> | null | undefined) {
  if (result?.outcome) return result.outcome;
  switch (result?.status) {
    case 'met':
      return 'effective';
    case 'partially_met':
    case 'not_met':
      return 'ineffective';
    case 'not_applicable':
      return 'not_applicable';
    default:
      return 'not_assessed';
  }
}

export function criteriaCompletionSummary(results: EssentialEightCriterionResult[] | null | undefined) {
  const rows = results ?? [];
  const outcomes = rows.map(assessmentOutcome);
  return {
    total: rows.length,
    assessed: outcomes.filter((outcome) => outcome !== 'not_assessed').length,
    effective: outcomes.filter((outcome) => outcome === 'effective').length,
    alternateControl: outcomes.filter((outcome) => outcome === 'alternate_control').length,
    ineffective: outcomes.filter((outcome) => outcome === 'ineffective').length,
    noVisibility: outcomes.filter((outcome) => outcome === 'no_visibility').length,
  };
}

export function outcomeLabel(outcome: EssentialEightAssessmentOutcome): string {
  return {
    not_assessed: 'Not assessed',
    effective: 'Effective',
    alternate_control: 'Alternate control',
    ineffective: 'Ineffective',
    no_visibility: 'No visibility',
    not_implemented: 'Not implemented',
    not_applicable: 'Not applicable',
  }[outcome];
}
