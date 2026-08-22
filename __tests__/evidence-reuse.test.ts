import { describe, expect, it } from 'vitest';
import { evidenceReuseErrors } from '@/lib/evidence/reuse';

const now = new Date('2026-08-22T00:00:00.000Z');

function state(overrides: Record<string, unknown> = {}) {
  return {
    sourceTenantId: 'tenant-one',
    targetTenantId: 'tenant-one',
    sourceClientId: 'client-one',
    targetClientId: 'client-one',
    sourceEngagementId: 'assessment-one',
    targetEngagementId: 'assessment-two',
    evidenceClassification: 'OFFICIAL' as const,
    targetClassification: 'OFFICIAL_SENSITIVE' as const,
    reviewStatus: 'accepted',
    storageVerifiedAt: new Date('2026-08-20T00:00:00Z'),
    quarantinedAt: null,
    sha256: 'a'.repeat(64),
    validUntil: new Date('2026-11-22T00:00:00Z'),
    ...overrides,
  };
}

describe('common-control evidence reuse boundary', () => {
  it('permits reviewed evidence for another assessment of the same client', () => {
    expect(evidenceReuseErrors(state(), now)).toEqual([]);
  });

  it('blocks cross-tenant and cross-client reuse', () => {
    expect(evidenceReuseErrors(state({ targetTenantId: 'tenant-two' }), now)).toContain(
      'Evidence cannot cross tenant boundaries.',
    );
    expect(evidenceReuseErrors(state({ targetClientId: 'client-two' }), now)).toContain(
      'Evidence reuse is limited to assessments for the same registered client.',
    );
  });

  it('blocks same-assessment copies and classification boundary breaches', () => {
    expect(evidenceReuseErrors(state({ targetEngagementId: 'assessment-one' }), now)).toContain(
      'Link the evidence directly to another control within the same assessment.',
    );
    expect(evidenceReuseErrors(state({
      evidenceClassification: 'OFFICIAL_SENSITIVE',
      targetClassification: 'OFFICIAL',
    }), now)).toContain('The target workspace is not approved to hold this evidence classification.');
  });

  it('requires accepted, verified, non-quarantined, current evidence', () => {
    expect(evidenceReuseErrors(state({ reviewStatus: 'pending' }), now)).toContain(
      'Only assessor-accepted evidence can be reused.',
    );
    expect(evidenceReuseErrors(state({ storageVerifiedAt: null }), now)).toContain(
      'Evidence storage and checksum must be verified.',
    );
    expect(evidenceReuseErrors(state({ quarantinedAt: now }), now)).toContain(
      'Quarantined evidence cannot be reused.',
    );
    expect(evidenceReuseErrors(state({ validUntil: now }), now)).toContain(
      'Evidence reuse must have a future review or expiry date.',
    );
  });
});
