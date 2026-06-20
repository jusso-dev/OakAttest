// Feature codes — the stable identifiers used by `plan_features` rows,
// `requireFeature(code)`, and `<FeatureGate feature={code}>`. Keep in sync with
// the catalogue seeded by `db/seed/plans.ts`.
export const FEATURES = {
  ESSENTIAL_EIGHT: 'ESSENTIAL_EIGHT',
  ISO27001: 'ISO27001',
  NIST: 'NIST',
  SOC2: 'SOC2',
  // ISM is the framework. IRAP is an assessment performed AGAINST the ISM, not
  // a separate framework, so it is gated by the ISM feature.
  ISM: 'ISM',
  PSPF: 'PSPF',
  MULTI_FRAMEWORK: 'MULTI_FRAMEWORK',
  EVIDENCE_REUSE: 'EVIDENCE_REUSE',
  AUDITOR_ACCESS: 'AUDITOR_ACCESS',
  API_ACCESS: 'API_ACCESS',
  ADVANCED_REPORTING: 'ADVANCED_REPORTING',
  CUSTOM_REPORTS: 'CUSTOM_REPORTS',
  SSO: 'SSO',
  ADVANCED_WORKFLOWS: 'ADVANCED_WORKFLOWS',
  INTEGRATIONS: 'INTEGRATIONS',
} as const;

export type FeatureCode = (typeof FEATURES)[keyof typeof FEATURES];

// Maps a framework key (as used by the controls catalogue and engagements) to
// the feature code that unlocks it. Adjust as frameworks land — see
// docs/frameworks/multi-framework-plan.md. Unknown keys fall back to
// MULTI_FRAMEWORK so nothing unlocks by accident.
export const FRAMEWORK_FEATURE: Record<string, FeatureCode> = {
  'essential-eight': FEATURES.ESSENTIAL_EIGHT,
  e8: FEATURES.ESSENTIAL_EIGHT,
  'iso-27001': FEATURES.ISO27001,
  iso27001: FEATURES.ISO27001,
  nist: FEATURES.NIST,
  'nist-csf': FEATURES.NIST,
  'nist-800-53': FEATURES.NIST,
  fedramp: FEATURES.NIST,
  soc2: FEATURES.SOC2,
  'soc-2': FEATURES.SOC2,
  // ISM is the framework; an "irap" key resolves to the ISM feature because
  // IRAP is an assessment run against the ISM.
  ism: FEATURES.ISM,
  irap: FEATURES.ISM,
  pspf: FEATURES.PSPF,
};

export function featureForFramework(frameworkKey: string): FeatureCode {
  return FRAMEWORK_FEATURE[frameworkKey.toLowerCase()] ?? FEATURES.MULTI_FRAMEWORK;
}

// Plan ordering for upgrade/downgrade classification + audit. Mirrors the seed
// sortOrder. Pure.
export const PLAN_RANK: Record<string, number> = {
  ESSENTIAL: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

export type PlanChangeKind = 'created' | 'upgraded' | 'downgraded' | 'unchanged';

export function classifyPlanChange(
  from: string | null | undefined,
  to: string,
): PlanChangeKind {
  if (!from) return 'created';
  const f = PLAN_RANK[from] ?? 0;
  const t = PLAN_RANK[to] ?? 0;
  if (t > f) return 'upgraded';
  if (t < f) return 'downgraded';
  return 'unchanged';
}
