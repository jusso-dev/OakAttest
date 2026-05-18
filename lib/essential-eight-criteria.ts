import { ESSENTIAL_EIGHT_STRATEGIES, type EssentialEightStrategy } from '@/lib/essential-eight';

export type EssentialEightCriterion = {
  id: string;
  strategy: EssentialEightStrategy;
  maturity: 'ml1' | 'ml2' | 'ml3';
  title: string;
};

export type EssentialEightCriterionResult = {
  criterionId: string;
  maturity: 'ml1' | 'ml2' | 'ml3';
  status: 'not_assessed' | 'met' | 'partially_met' | 'not_met' | 'not_applicable';
  notes?: string;
  evidenceRefs?: string[];
};

export const E8_CRITERION_STATUSES = [
  'not_assessed',
  'met',
  'partially_met',
  'not_met',
  'not_applicable',
] as const;

const CRITERION_TITLES: Record<EssentialEightStrategy, string[]> = {
  application_control: [
    'Application allow-listing is defined and enforced for the assessed scope.',
    'Application control policy covers common user and administrative execution paths.',
    'Application control bypasses are monitored, reviewed, and remediated.',
  ],
  patch_applications: [
    'Application patch sources, ownership, and deployment cadence are documented.',
    'Security updates for internet-facing and commonly exploited applications are prioritised.',
    'Application patch compliance is measured and exceptions are actively managed.',
  ],
  configure_macro_settings: [
    'Macro execution policy is defined for users and business units in scope.',
    'Only approved and trusted macro use is permitted for the assessed scope.',
    'Macro policy enforcement and exceptions are monitored and reviewed.',
  ],
  user_application_hardening: [
    'User application hardening baseline is documented and deployed.',
    'High-risk browser, document, and scripting features are restricted where not required.',
    'Hardening drift is measured and remediated across sampled systems.',
  ],
  restrict_admin_privileges: [
    'Privileged roles and accounts are identified for the assessed environment.',
    'Privileged access is restricted, approved, and separated from standard user activity.',
    'Privileged access use is logged, reviewed, and exceptions are time-bound.',
  ],
  patch_operating_systems: [
    'Operating system patch ownership and deployment cadence are documented.',
    'Security updates for operating systems are prioritised by exposure and risk.',
    'Operating system patch compliance is measured and exceptions are actively managed.',
  ],
  multi_factor_authentication: [
    'MFA coverage is documented for users, administrators, and remote access paths.',
    'MFA is enforced for privileged and externally accessible authentication flows.',
    'MFA strength, exceptions, and bypass events are reviewed and remediated.',
  ],
  regular_backups: [
    'Backup scope, schedule, retention, and ownership are documented.',
    'Backup restoration is tested for important systems and data sets.',
    'Backup integrity, isolation, and recovery objectives are monitored and reviewed.',
  ],
};

export const ESSENTIAL_EIGHT_CRITERIA: EssentialEightCriterion[] = ESSENTIAL_EIGHT_STRATEGIES.flatMap(
  (strategy) =>
    CRITERION_TITLES[strategy.key].map((title, index) => ({
      id: `${strategy.key}-ml${index + 1}`,
      strategy: strategy.key,
      maturity: `ml${index + 1}` as 'ml1' | 'ml2' | 'ml3',
      title,
    })),
);

export function criteriaForStrategy(strategy: string): EssentialEightCriterion[] {
  return ESSENTIAL_EIGHT_CRITERIA.filter((criterion) => criterion.strategy === strategy);
}

export function criteriaCompletionSummary(results: EssentialEightCriterionResult[] | null | undefined) {
  const total = ESSENTIAL_EIGHT_CRITERIA.length;
  const assessed = (results ?? []).filter((result) => result.status !== 'not_assessed').length;
  const notMet = (results ?? []).filter((result) => result.status === 'not_met').length;
  const partiallyMet = (results ?? []).filter((result) => result.status === 'partially_met').length;
  return { total, assessed, notMet, partiallyMet };
}
