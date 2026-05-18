import { getEngagementCoverage, type CoverageBlocker } from '@/lib/assessment/coverage';

export type CertificationReadiness = {
  readyToSign: boolean;
  blockers: CoverageBlocker[];
  warnings: CoverageBlocker[];
};

export async function getCertificationReadiness(engagementId: string): Promise<CertificationReadiness> {
  const coverage = await getEngagementCoverage(engagementId);
  return {
    readyToSign: coverage.hardFailureCount === 0,
    blockers: coverage.blockers.filter((item) => item.severity === 'danger'),
    warnings: coverage.blockers.filter((item) => item.severity !== 'danger'),
  };
}
