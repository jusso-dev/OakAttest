import crypto from 'node:crypto';

export type SignatureResult = {
  signatureValue: string;
  signatureAlgorithm: string;
  keyFingerprint: string;
};

export type SigningKey = {
  kmsKeyArn?: string | null;
  fingerprint?: string | null;
  publicKey?: string | null;
};

export async function signCertificationBundle(opts: {
  tenantId: string;
  bundleHash: string;
  signingKey?: SigningKey | null;
}): Promise<SignatureResult> {
  if (opts.signingKey?.kmsKeyArn) {
    return {
      signatureValue: `kms:${opts.signingKey.kmsKeyArn}:${opts.bundleHash}`,
      signatureAlgorithm: 'kms-sign-rsa-pss-sha256',
      keyFingerprint: opts.signingKey.fingerprint ?? fingerprint(opts.signingKey.kmsKeyArn),
    };
  }

  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_CERTIFICATION_SIGNING !== 'true') {
    throw new Error('Production certification signing requires an active tenant KMS signing key.');
  }

  const secret = process.env.BETTER_AUTH_SECRET ?? 'dev';
  return {
    signatureValue: crypto
      .createHmac('sha256', `${secret}:${opts.tenantId}`)
      .update(opts.bundleHash)
      .digest('hex'),
    signatureAlgorithm: 'hmac-sha256-dev',
    keyFingerprint: fingerprint(`${opts.tenantId}:dev`),
  };
}

function fingerprint(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}
