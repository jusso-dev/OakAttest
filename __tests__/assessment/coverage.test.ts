import { describe, expect, it } from 'vitest';
import {
  buildEngagementCoverage,
  filterCoverageBlockersForRoles,
  type EngagementCoverageCounts,
} from '@/lib/assessment/coverage';

const completeCounts: EngagementCoverageCounts = {
  controlCount: 8,
  unlockedBoundary: 0,
  undecidedControls: 0,
  missingStatements: 0,
  applicableControlsWithoutEvidence: 0,
  poorEvidenceControls: 0,
  openEvidenceRequests: 0,
  pendingEvidence: 0,
  rejectedEvidence: 0,
  unverifiedEvidence: 0,
  unlinkedFindings: 0,
  findingsWithoutEvidence: 0,
  openHighFindings: 0,
  awaitingRetestFindings: 0,
  unsignedNonConformances: 0,
  residualRisksMissingAcceptance: 0,
  residualRisksMissingRating: 0,
  incompleteE8: 0,
  unapprovedSspSections: 0,
  missingSspExport: 0,
};

describe('assessment coverage readiness model', () => {
  it('has no blockers for a complete engagement', () => {
    const coverage = buildEngagementCoverage('eng-1', completeCounts);

    expect(coverage.controlCount).toBe(8);
    expect(coverage.hardFailureCount).toBe(0);
    expect(coverage.warningCount).toBe(0);
    expect(coverage.blockers).toEqual([]);
  });

  it('marks certification-critical gaps as hard failures', () => {
    const coverage = buildEngagementCoverage('eng-1', {
      ...completeCounts,
      unlockedBoundary: 1,
      undecidedControls: 2,
      missingStatements: 3,
      applicableControlsWithoutEvidence: 4,
      openEvidenceRequests: 1,
      pendingEvidence: 2,
      unverifiedEvidence: 1,
      openHighFindings: 1,
      awaitingRetestFindings: 1,
      unsignedNonConformances: 1,
      residualRisksMissingAcceptance: 1,
      residualRisksMissingRating: 1,
      missingSspExport: 1,
    });

    expect(coverage.hardFailureCount).toBeGreaterThan(0);
    expect(coverage.blockers.filter((item) => item.severity === 'danger').map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'boundary-unlocked',
        'undecided-controls',
        'missing-statements',
        'missing-control-evidence',
        'open-evidence-requests',
        'pending-evidence',
        'unverified-evidence',
        'open-high-findings',
        'awaiting-retest',
        'unsigned-non-conformances',
        'unaccepted-risks',
        'unrated-risks',
        'missing-ssp-export',
      ]),
    );
  });

  it('keeps quality, SSP review, and E8 gaps as warnings', () => {
    const coverage = buildEngagementCoverage('eng-1', {
      ...completeCounts,
      poorEvidenceControls: 2,
      unlinkedFindings: 1,
      findingsWithoutEvidence: 1,
      incompleteE8: 3,
      unapprovedSspSections: 2,
    });

    expect(coverage.hardFailureCount).toBe(0);
    expect(coverage.warningCount).toBe(5);
    expect(coverage.blockers.every((item) => item.severity === 'warning')).toBe(true);
  });

  it('filters client-visible blockers to evidence and client-actionable work', () => {
    const coverage = buildEngagementCoverage('eng-1', {
      ...completeCounts,
      undecidedControls: 1,
      missingStatements: 1,
      openEvidenceRequests: 1,
      unapprovedSspSections: 1,
      residualRisksMissingRating: 1,
    });

    const clientBlockers = filterCoverageBlockersForRoles(coverage.blockers, ['client_contributor']);

    expect(clientBlockers.map((item) => item.key)).toEqual([
      'missing-statements',
      'open-evidence-requests',
      'unrated-risks',
    ]);
  });
});
