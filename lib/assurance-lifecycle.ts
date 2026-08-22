export const RISK_TREATMENT_DECISIONS = ['mitigate', 'avoid', 'transfer', 'accept'] as const;
export type RiskTreatmentDecision = (typeof RISK_TREATMENT_DECISIONS)[number];

export const AUTHORISATION_STATUSES = [
  'draft',
  'submitted',
  'authorised',
  'authorised_with_conditions',
  'declined',
  'expired',
  'revoked',
] as const;
export type AuthorisationStatus = (typeof AUTHORISATION_STATUSES)[number];

export const MONITORING_EVENT_TYPES = [
  'policy_change',
  'new_threat',
  'control_ineffective',
  'system_change',
  'incident',
  'scheduled_review',
] as const;
export type MonitoringEventType = (typeof MONITORING_EVENT_TYPES)[number];

export const RISK_RATINGS = ['low', 'medium', 'high', 'extreme'] as const;
export type RiskRating = (typeof RISK_RATINGS)[number];

export type RiskTreatmentInput = {
  decision: RiskTreatmentDecision;
  rationale: string;
  treatmentPlan?: string | null;
  ownerName?: string | null;
  dueAt?: Date | null;
  acceptedByName?: string | null;
  acceptedByRole?: string | null;
  acceptedAt?: Date | null;
  expiresAt?: Date | null;
};

export type AuthorisationRisk = {
  code: string;
  title: string;
  residualLikelihood: number;
  residualImpact: number;
  latestTreatment?: {
    decision: RiskTreatmentDecision;
    acceptedAt?: Date | null;
    expiresAt?: Date | null;
  } | null;
};

export type AuthorisationDecisionInput = {
  status: AuthorisationStatus;
  authorisingOfficerName?: string | null;
  authorisingOfficerRole?: string | null;
  decisionStatement?: string | null;
  conditions?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
};

export type LifecycleStage = {
  key: 'scope' | 'assess' | 'risk' | 'authorise' | 'monitor' | 'reassess';
  label: string;
  state: 'not_started' | 'in_progress' | 'complete' | 'attention';
  detail: string;
};

export function riskScore(likelihood: number, impact: number): number {
  if (!Number.isInteger(likelihood) || likelihood < 1 || likelihood > 5) {
    throw new Error('Likelihood must be an integer from 1 to 5');
  }
  if (!Number.isInteger(impact) || impact < 1 || impact > 5) {
    throw new Error('Impact must be an integer from 1 to 5');
  }
  return likelihood * impact;
}

export function riskRating(likelihood: number, impact: number): RiskRating {
  const score = riskScore(likelihood, impact);
  if (score <= 4) return 'low';
  if (score <= 9) return 'medium';
  if (score <= 16) return 'high';
  return 'extreme';
}

export function validateRiskTreatmentDecision(input: RiskTreatmentInput): string[] {
  const errors: string[] = [];
  if (input.rationale.trim().length < 10) errors.push('Record a rationale of at least 10 characters.');

  if (input.decision === 'accept') {
    if (!input.acceptedByName?.trim()) errors.push('Name the person accepting the risk.');
    if (!input.acceptedByRole?.trim()) errors.push('Record the risk acceptor’s role.');
    if (!input.acceptedAt) errors.push('Record when the risk was accepted.');
    if (!input.expiresAt) errors.push('Set an expiry or review date for the acceptance.');
    if (input.acceptedAt && input.expiresAt && input.expiresAt <= input.acceptedAt) {
      errors.push('Risk acceptance expiry must be after the acceptance date.');
    }
  } else {
    if (!input.treatmentPlan?.trim()) errors.push('Record the treatment plan.');
    if (!input.ownerName?.trim()) errors.push('Assign a treatment owner.');
    if (!input.dueAt) errors.push('Set a treatment due date.');
  }

  return errors;
}

export function validateAuthorisationDecision(
  input: AuthorisationDecisionInput,
  risks: AuthorisationRisk[],
  now = new Date(),
): string[] {
  const errors: string[] = [];
  const isDecision = ['authorised', 'authorised_with_conditions', 'declined'].includes(input.status);

  if (isDecision) {
    if (!input.authorisingOfficerName?.trim()) errors.push('Name the authorising officer.');
    if (!input.authorisingOfficerRole?.trim()) errors.push('Record the authorising officer’s role.');
    if (!input.decisionStatement?.trim()) errors.push('Record the authorisation decision statement.');
    if (!input.issuedAt) errors.push('Record the decision date.');
  }
  if (input.status === 'authorised_with_conditions' && !input.conditions?.trim()) {
    errors.push('Conditional authorisation requires conditions.');
  }
  if (
    (input.status === 'authorised' || input.status === 'authorised_with_conditions') &&
    (!input.expiresAt || (input.issuedAt && input.expiresAt <= input.issuedAt))
  ) {
    errors.push('Authorisation requires an expiry after the issue date.');
  }

  if (input.status === 'authorised' || input.status === 'authorised_with_conditions') {
    for (const risk of risks) {
      const rating = riskRating(risk.residualLikelihood, risk.residualImpact);
      if (rating !== 'high' && rating !== 'extreme') continue;
      const treatment = risk.latestTreatment;
      const hasCurrentDecision = Boolean(
        treatment &&
          (treatment.decision !== 'accept' ||
            (treatment.acceptedAt && treatment.expiresAt && treatment.expiresAt > now)),
      );
      if (!hasCurrentDecision) {
        errors.push(`${risk.code} (${risk.title}) has ${rating} residual risk without a current treatment decision.`);
      }
    }
  }

  return errors;
}

export function monitoringEventRequiresReassessment(
  type: MonitoringEventType,
  severity: 'low' | 'medium' | 'high' | 'critical',
): boolean {
  if (type === 'control_ineffective') return true;
  if (type === 'incident') return severity !== 'low';
  if (type === 'new_threat' || type === 'system_change') return severity === 'high' || severity === 'critical';
  return false;
}

export function buildLifecycleStages(input: {
  boundaryLocked: boolean;
  assessedControlCount: number;
  totalControlCount: number;
  riskCount: number;
  untreatedHighRiskCount: number;
  authorisationStatus?: AuthorisationStatus | null;
  monitoringPlanStatus?: string | null;
  openReassessmentEvents: number;
}): LifecycleStage[] {
  const assessed = input.totalControlCount > 0 && input.assessedControlCount >= input.totalControlCount;
  const authorised = input.authorisationStatus === 'authorised' || input.authorisationStatus === 'authorised_with_conditions';
  const monitoring = input.monitoringPlanStatus === 'active';

  return [
    {
      key: 'scope',
      label: '1. Scope',
      state: input.boundaryLocked ? 'complete' : 'in_progress',
      detail: input.boundaryLocked ? 'System boundary locked' : 'Lock the system boundary before assessment',
    },
    {
      key: 'assess',
      label: '2. Assess',
      state: assessed ? 'complete' : input.assessedControlCount > 0 ? 'in_progress' : 'not_started',
      detail: `${input.assessedControlCount} of ${input.totalControlCount} controls assessed`,
    },
    {
      key: 'risk',
      label: '3. Treat risk',
      state: input.untreatedHighRiskCount > 0 ? 'attention' : input.riskCount > 0 ? 'complete' : 'not_started',
      detail: input.untreatedHighRiskCount > 0
        ? `${input.untreatedHighRiskCount} high or extreme risks need a decision`
        : `${input.riskCount} risks recorded`,
    },
    {
      key: 'authorise',
      label: '4. Authorise',
      state: authorised ? 'complete' : input.authorisationStatus ? 'in_progress' : 'not_started',
      detail: input.authorisationStatus?.replaceAll('_', ' ') ?? 'No authorisation record',
    },
    {
      key: 'monitor',
      label: '5. Monitor',
      state: monitoring ? 'complete' : input.monitoringPlanStatus ? 'in_progress' : 'not_started',
      detail: input.monitoringPlanStatus ?? 'No monitoring plan',
    },
    {
      key: 'reassess',
      label: '6. Reassess',
      state: input.openReassessmentEvents > 0 ? 'attention' : monitoring ? 'complete' : 'not_started',
      detail: input.openReassessmentEvents > 0
        ? `${input.openReassessmentEvents} monitoring events require reassessment`
        : 'No reassessment triggers open',
    },
  ];
}
