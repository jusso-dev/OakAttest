export const ESSENTIAL_EIGHT_STRATEGIES = [
  { key: 'application_control', label: 'Application control' },
  { key: 'patch_applications', label: 'Patch applications' },
  { key: 'configure_macro_settings', label: 'Configure macro settings' },
  { key: 'user_application_hardening', label: 'User application hardening' },
  { key: 'restrict_admin_privileges', label: 'Restrict admin privileges' },
  { key: 'patch_operating_systems', label: 'Patch operating systems' },
  { key: 'multi_factor_authentication', label: 'Multi-factor authentication' },
  { key: 'regular_backups', label: 'Regular backups' },
] as const;

export const MATURITY_LEVELS = ['ml0', 'ml1', 'ml2', 'ml3'] as const;

export type EssentialEightStrategy = (typeof ESSENTIAL_EIGHT_STRATEGIES)[number]['key'];
export type MaturityLevel = (typeof MATURITY_LEVELS)[number];

export function maturityRank(level: string | null | undefined): number {
  const index = MATURITY_LEVELS.indexOf(level as MaturityLevel);
  return index >= 0 ? index : 0;
}

export function maturityFromRank(rank: number): MaturityLevel {
  return MATURITY_LEVELS[Math.max(0, Math.min(3, rank))] ?? 'ml0';
}

export function formatMaturity(level: string | null | undefined): string {
  return maturityFromRank(maturityRank(level)).toUpperCase();
}

export function calculateEssentialEightOverall(
  rows: Array<{ strategy: string; currentMaturity: string; targetMaturity?: string | null }>,
  targetMaturity: MaturityLevel = 'ml1',
) {
  const byStrategy = new Map(rows.map((row) => [row.strategy, row]));
  const currentRanks = ESSENTIAL_EIGHT_STRATEGIES.map((strategy) =>
    maturityRank(byStrategy.get(strategy.key)?.currentMaturity),
  );
  const achieved = maturityFromRank(Math.min(...currentRanks));
  const targetRank = maturityRank(targetMaturity);
  const blockers = ESSENTIAL_EIGHT_STRATEGIES.flatMap((strategy) => {
    const row = byStrategy.get(strategy.key);
    const current = maturityFromRank(maturityRank(row?.currentMaturity));
    return maturityRank(current) < targetRank
      ? [{ strategy: strategy.key, label: strategy.label, current, target: targetMaturity }]
      : [];
  });
  return { achieved, blockers };
}

export function e8StrategyLabel(strategy: string): string {
  return ESSENTIAL_EIGHT_STRATEGIES.find((item) => item.key === strategy)?.label ?? strategy;
}
