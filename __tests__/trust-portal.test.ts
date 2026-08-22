import { describe, expect, it } from 'vitest';
import {
  buildTrustPortalSnapshot,
  containsClassifiedMarking,
  hashTrustPortalAccessToken,
  hashTrustPortalSnapshot,
  normaliseTrustPortalSlug,
  splitPublicCommitments,
  trustPortalSnapshotIsPublic,
  trustPortalSnapshotMatchesHash,
  visitorFingerprint,
  type TrustPortalPublicationInput,
} from '@/lib/trust-portal';

const now = new Date('2026-08-22T00:00:00.000Z');

function input(overrides: Partial<TrustPortalPublicationInput> = {}): TrustPortalPublicationInput {
  return {
    releaseClassification: 'PUBLIC',
    approvedForPublicRelease: true,
    portalTitle: 'Acme security assurance',
    organisationName: 'Acme Limited',
    overview: 'A bounded public summary of the signed security assessment outcome.',
    commitments: ['Review privileged access quarterly', 'Monitor material system changes'],
    securityContactEmail: 'Security@Example.com',
    publicSystemName: 'Customer service platform',
    frameworkLabel: 'Information Security Manual',
    reportVersion: 3,
    reportStatus: 'signed',
    reportRevokedAt: null,
    recommendation: 'recommended_with_conditions',
    signedAt: new Date('2026-08-20T01:02:03.000Z'),
    reportValidUntil: new Date('2027-08-20T23:59:59.000Z'),
    publicationExpiresAt: new Date('2026-11-20T23:59:59.000Z'),
    verificationToken: 'verify-123',
    bundleSha256: 'A'.repeat(64),
    signatureAlgorithm: 'RSASSA_PSS_SHA_256',
    signingKeyFingerprint: 'key-fingerprint',
    ...overrides,
  };
}

describe('Trust Portal public boundary', () => {
  it('normalises public slugs and bounded commitments', () => {
    expect(normaliseTrustPortalSlug('  Acme IRAP / 2026  ')).toBe('acme-irap-2026');
    expect(splitPublicCommitments(' First \n\n Second\r\n')).toEqual(['First', 'Second']);
  });

  it('builds only an approved PUBLIC snapshot from a signed artefact', () => {
    const snapshot = buildTrustPortalSnapshot(input(), now);
    expect(snapshot.publicClassification).toBe('PUBLIC');
    expect(snapshot.securityContactEmail).toBe('security@example.com');
    expect(snapshot.assurance.bundleSha256).toBe('a'.repeat(64));
    expect(trustPortalSnapshotIsPublic(snapshot, now)).toBe(true);
  });

  it('rejects non-public, unapproved, unsigned, revoked, and incomplete releases', () => {
    expect(() => buildTrustPortalSnapshot(input({ releaseClassification: 'OFFICIAL' }), now)).toThrow(/PUBLIC/);
    expect(() => buildTrustPortalSnapshot(input({ approvedForPublicRelease: false }), now)).toThrow(/approve/);
    expect(() => buildTrustPortalSnapshot(input({ reportStatus: 'draft' }), now)).toThrow(/signed/);
    expect(() => buildTrustPortalSnapshot(input({ reportRevokedAt: now }), now)).toThrow(/non-revoked/);
    expect(() => buildTrustPortalSnapshot(input({ bundleSha256: null }), now)).toThrow(/verification metadata/);
  });

  it('rejects expired artefacts, expired publications, and overlong publication validity', () => {
    expect(() => buildTrustPortalSnapshot(input({ publicationExpiresAt: now }), now)).toThrow(/future/);
    expect(() => buildTrustPortalSnapshot(input({ reportValidUntil: now }), now)).toThrow(/expired/);
    expect(() => buildTrustPortalSnapshot(input({ publicationExpiresAt: new Date('2028-01-01T00:00:00Z') }), now)).toThrow(/cannot remain live/);
  });

  it('blocks protective markings from every public narrative field', () => {
    for (const marking of ['OFFICIAL: Sensitive', 'OFFICIAL SENSITIVE', '[PROTECTED]', 'TOP SECRET']) {
      expect(containsClassifiedMarking(marking)).toBe(true);
      expect(() => buildTrustPortalSnapshot(input({ overview: `Summary ${marking}` }), now)).toThrow(/protective markings/);
    }
  });

  it('expires runtime snapshots and refuses malformed verification metadata', () => {
    const snapshot = buildTrustPortalSnapshot(input(), now);
    expect(trustPortalSnapshotIsPublic(snapshot, new Date('2026-12-01T00:00:00Z'))).toBe(false);
    expect(trustPortalSnapshotIsPublic({
      ...snapshot,
      assurance: { ...snapshot.assurance, publicationExpiresAt: 'not-a-date' },
    }, now)).toBe(false);
    expect(trustPortalSnapshotIsPublic({
      ...snapshot,
      assurance: { ...snapshot.assurance, verificationToken: '' },
    }, now)).toBe(false);
  });

  it('produces deterministic snapshot, token, and privacy fingerprints', () => {
    const snapshot = buildTrustPortalSnapshot(input(), now);
    expect(hashTrustPortalSnapshot(snapshot)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashTrustPortalSnapshot(snapshot)).toBe(hashTrustPortalSnapshot({ ...snapshot }));
    expect(trustPortalSnapshotMatchesHash(snapshot, hashTrustPortalSnapshot(snapshot))).toBe(true);
    expect(trustPortalSnapshotMatchesHash({ ...snapshot, portalTitle: 'Changed' }, hashTrustPortalSnapshot(snapshot))).toBe(false);
    expect(hashTrustPortalAccessToken('one')).not.toBe(hashTrustPortalAccessToken('two'));
    expect(visitorFingerprint('203.0.113.5', 'secret')).toBe(visitorFingerprint('203.0.113.5', 'secret'));
    expect(visitorFingerprint('203.0.113.5', 'secret')).not.toBe(visitorFingerprint('203.0.113.5', 'different'));
  });
});
