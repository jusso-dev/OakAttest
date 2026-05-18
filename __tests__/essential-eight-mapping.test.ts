import { describe, expect, it } from 'vitest';
import { groupEssentialEightMappedControls } from '@/lib/essential-eight-mapping';

describe('Essential Eight ISM mapping', () => {
  it('groups mapped ISM controls by strategy with evidence and findings', () => {
    const grouped = groupEssentialEightMappedControls({
      controls: [
        {
          ismControlId: 'ism-1',
          controlId: 'ISM-0001',
          description: 'Application control is implemented.',
          status: 'implemented',
          applicable: 'applicable',
          mapping: [
            { strategy: 'application_control', maturityLevel: 1 },
            { strategy: 'restrict_admin_privileges', maturityLevel: 2 },
          ],
        },
      ],
      evidence: [
        {
          ismControlId: 'ism-1',
          id: 'evidence-1',
          filename: 'allow-list.pdf',
          reviewStatus: 'accepted',
          sha256: 'a'.repeat(64),
        },
      ],
      findings: [
        {
          ismControlId: 'ism-1',
          code: 'FND-001',
          title: 'Policy drift',
          type: 'observation',
          severity: 'medium',
          status: 'open',
        },
      ],
    });

    expect(grouped.get('application_control')).toEqual([
      expect.objectContaining({
        controlId: 'ISM-0001',
        maturityLevel: 1,
        evidence: [expect.objectContaining({ filename: 'allow-list.pdf' })],
        findings: [expect.objectContaining({ code: 'FND-001' })],
      }),
    ]);
    expect(grouped.get('restrict_admin_privileges')?.[0].maturityLevel).toBe(2);
  });
});
