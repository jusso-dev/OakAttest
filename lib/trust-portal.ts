import crypto from 'node:crypto';

export type TrustPortalSnapshot = {
  publicClassification: 'PUBLIC';
  portalTitle: string;
  organisationName: string;
  overview: string;
  commitments: string[];
  securityContactEmail: string;
  assurance: {
    publicSystemName: string;
    frameworkLabel: string;
    reportVersion: number;
    recommendation: 'recommended' | 'recommended_with_conditions' | 'not_recommended';
    signedAt: string;
    reportValidUntil: string | null;
    publicationExpiresAt: string;
    verificationToken: string;
    bundleSha256: string;
    signatureAlgorithm: string;
    signingKeyFingerprint: string;
  };
};

export type TrustPortalPublicationInput = {
  releaseClassification: string;
  approvedForPublicRelease: boolean;
  portalTitle: string;
  organisationName: string;
  overview: string;
  commitments: string[];
  securityContactEmail: string;
  publicSystemName: string;
  frameworkLabel: string;
  reportVersion: number;
  reportStatus: string;
  reportRevokedAt?: Date | null;
  recommendation: TrustPortalSnapshot['assurance']['recommendation'];
  signedAt?: Date | null;
  reportValidUntil?: Date | null;
  publicationExpiresAt: Date;
  verificationToken?: string | null;
  bundleSha256?: string | null;
  signatureAlgorithm?: string | null;
  signingKeyFingerprint?: string | null;
};

const CLASSIFIED_MARKING = /(?:\bOFFICIAL\s*:?\s*SENSITIVE\b|\bTOP\s+SECRET\b|(?:^|[\n[(])\s*(?:PROTECTED|SECRET)\b)/i;

export function normaliseTrustPortalSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function splitPublicCommitments(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function containsClassifiedMarking(input: string): boolean {
  return CLASSIFIED_MARKING.test(input);
}

export function buildTrustPortalSnapshot(
  input: TrustPortalPublicationInput,
  now = new Date(),
): TrustPortalSnapshot {
  if (input.releaseClassification !== 'PUBLIC') {
    throw new Error('Trust Portal content must be classified PUBLIC.');
  }
  if (!input.approvedForPublicRelease) {
    throw new Error('An accountable client administrator must approve the snapshot for public release.');
  }
  if (input.reportStatus !== 'signed' || input.reportRevokedAt) {
    throw new Error('Only a current signed, non-revoked artefact can be published.');
  }
  if (!input.signedAt || !input.verificationToken || !input.bundleSha256 || !input.signatureAlgorithm || !input.signingKeyFingerprint) {
    throw new Error('The signed artefact is missing verification metadata.');
  }
  if (input.publicationExpiresAt <= now) {
    throw new Error('Publication expiry must be in the future.');
  }
  if (input.reportValidUntil && input.reportValidUntil <= now) {
    throw new Error('An expired signed artefact cannot be published.');
  }
  if (input.reportValidUntil && input.publicationExpiresAt > input.reportValidUntil) {
    throw new Error('Publication cannot remain live after the signed artefact expires.');
  }

  const publicText = [
    input.portalTitle,
    input.organisationName,
    input.overview,
    input.publicSystemName,
    ...input.commitments,
  ];
  if (publicText.some(containsClassifiedMarking)) {
    throw new Error('Remove classified protective markings before publishing this PUBLIC snapshot.');
  }

  return {
    publicClassification: 'PUBLIC',
    portalTitle: input.portalTitle.trim(),
    organisationName: input.organisationName.trim(),
    overview: input.overview.trim(),
    commitments: input.commitments.map((item) => item.trim()).filter(Boolean).slice(0, 12),
    securityContactEmail: input.securityContactEmail.trim().toLowerCase(),
    assurance: {
      publicSystemName: input.publicSystemName.trim(),
      frameworkLabel: input.frameworkLabel.trim(),
      reportVersion: input.reportVersion,
      recommendation: input.recommendation,
      signedAt: input.signedAt.toISOString(),
      reportValidUntil: input.reportValidUntil?.toISOString() ?? null,
      publicationExpiresAt: input.publicationExpiresAt.toISOString(),
      verificationToken: input.verificationToken,
      bundleSha256: input.bundleSha256.toLowerCase(),
      signatureAlgorithm: input.signatureAlgorithm,
      signingKeyFingerprint: input.signingKeyFingerprint,
    },
  };
}

export function trustPortalSnapshotIsPublic(snapshot: TrustPortalSnapshot, now = new Date()): boolean {
  if (!snapshot || snapshot.publicClassification !== 'PUBLIC' || !snapshot.assurance) return false;
  const publicationExpiry = new Date(snapshot.assurance.publicationExpiresAt);
  const reportExpiry = snapshot.assurance.reportValidUntil
    ? new Date(snapshot.assurance.reportValidUntil)
    : null;
  if (Number.isNaN(publicationExpiry.getTime()) || publicationExpiry <= now) return false;
  if (reportExpiry && (Number.isNaN(reportExpiry.getTime()) || reportExpiry <= now)) return false;
  if (
    !snapshot.assurance.verificationToken ||
    !snapshot.assurance.bundleSha256 ||
    !snapshot.assurance.signatureAlgorithm ||
    !snapshot.assurance.signingKeyFingerprint
  ) return false;
  if (
    [snapshot.portalTitle, snapshot.organisationName, snapshot.overview, ...snapshot.commitments]
      .some(containsClassifiedMarking)
  ) return false;
  return true;
}

export function hashTrustPortalSnapshot(snapshot: TrustPortalSnapshot): string {
  return crypto.createHash('sha256').update(stableJson(snapshot)).digest('hex');
}

export function trustPortalSnapshotMatchesHash(
  snapshot: TrustPortalSnapshot,
  expectedSha256: string,
): boolean {
  const actual = Buffer.from(hashTrustPortalSnapshot(snapshot), 'hex');
  const expected = Buffer.from(expectedSha256, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function hashTrustPortalAccessToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function visitorFingerprint(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value || 'unknown').digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
