import { describe, expect, it } from 'vitest';
import { renderEssentialEightReportPdf, type EssentialEightReportData } from '@/lib/pdf/essential-eight';
import { buildEssentialEightReportKey } from '@/lib/storage/s3';

describe('Essential Eight report export', () => {
  it('renders a PDF report and stores reports with a PDF object key', async () => {
    const data: EssentialEightReportData = {
      tenant: { name: 'Assessor Co', productName: 'OakAttest' },
      engagement: {
        name: 'Example IRAP',
        reference: 'IRAP-001',
        classification: 'protected',
        ismRevision: '2025-12',
      },
      client: { name: 'Client Co' },
      system: { name: 'Client Platform', description: null, environment: 'AWS' },
      report: { version: 1, generatedAt: new Date('2026-01-01T00:00:00Z').toISOString() },
      profile: {
        targetMaturity: 'ml2',
        scope: 'Corporate fleet and identity platform.',
        approach: 'Configuration review and sample testing.',
        limitations: 'Production access was read-only.',
      },
      overall: {
        achieved: 'ml1',
        blockers: [{ label: 'Patch applications', current: 'ml1', target: 'ml2' }],
      },
      strategies: [
        {
          strategy: 'application_control',
          currentMaturity: 'ml2',
          targetMaturity: 'ml2',
          remediationPlan: null,
          assessmentMethods: 'Configuration review',
          assessmentObjects: 'Endpoint policy',
          sampleSize: '12 workstations',
          evidenceQuality: 'good',
          evidenceLimitations: null,
          assessorConclusion: 'Meets target for sampled fleet.',
          exceptions: [],
          mappedControls: [{ controlId: 'ISM-0001', maturityLevel: 2 }],
          evidence: [{ filename: 'policy.pdf', sha256: 'a'.repeat(64), reviewStatus: 'accepted' }],
          findings: [],
        },
      ],
    };

    const pdf = await renderEssentialEightReportPdf(data);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buildEssentialEightReportKey({ tenantId: 't1', engagementId: 'e1', version: 2 })).toBe(
      'tenants/t1/engagements/e1/essential-eight/v2.pdf',
    );
  });
});
