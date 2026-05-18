import crypto from 'node:crypto';
import {
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
  type KMSClientConfig,
} from '@aws-sdk/client-kms';

export const KMS_SIGNATURE_ALGORITHM = 'RSASSA_PSS_SHA_256';
export const KMS_REPORT_ALGORITHM = 'aws-kms-rsa-pss-sha256';
export const DEV_REPORT_ALGORITHM = 'hmac-sha256-dev';

export type SignatureResult = {
  signatureValue: string;
  signatureAlgorithm: string;
  keyFingerprint: string;
  publicKey?: string | null;
};

export type SigningKey = {
  id?: string | null;
  keyType?: string | null;
  kmsKeyArn?: string | null;
  fingerprint?: string | null;
  publicKey?: string | null;
  rotatedAt?: Date | string | null;
  revokedAt?: Date | string | null;
};

export type CertificationSigner = {
  getPublicKey(kmsKeyArn: string): Promise<string>;
  sign(kmsKeyArn: string, payload: Buffer): Promise<string>;
};

export type SignatureVerification = {
  status:
    | 'valid'
    | 'valid_with_key_warning'
    | 'invalid'
    | 'report_revoked'
    | 'missing_signature'
    | 'missing_key'
    | 'unsupported_algorithm';
  valid: boolean;
  message: string;
  keyFingerprint?: string | null;
};

export class AwsKmsCertificationSigner implements CertificationSigner {
  async getPublicKey(kmsKeyArn: string): Promise<string> {
    const client = kmsClientForKey(kmsKeyArn);
    const result = await client.send(new GetPublicKeyCommand({ KeyId: kmsKeyArn }));
    if (!result.PublicKey) throw new Error('KMS key did not return public key material.');
    return derToPem(Buffer.from(result.PublicKey), 'PUBLIC KEY');
  }

  async sign(kmsKeyArn: string, payload: Buffer): Promise<string> {
    const client = kmsClientForKey(kmsKeyArn);
    const result = await client.send(
      new SignCommand({
        KeyId: kmsKeyArn,
        Message: payload,
        MessageType: 'RAW',
        SigningAlgorithm: KMS_SIGNATURE_ALGORITHM,
      }),
    );
    if (!result.Signature) throw new Error('KMS did not return a signature.');
    return Buffer.from(result.Signature).toString('base64');
  }
}

export async function signCertificationBundle(opts: {
  tenantId: string;
  bundleHash: string;
  signingKey?: SigningKey | null;
  signer?: CertificationSigner;
}): Promise<SignatureResult> {
  assertBundleHash(opts.bundleHash);

  if (opts.signingKey?.kmsKeyArn) {
    const signer = opts.signer ?? new AwsKmsCertificationSigner();
    const publicKey = opts.signingKey.publicKey || (await signer.getPublicKey(opts.signingKey.kmsKeyArn));
    const signatureValue = await signer.sign(
      opts.signingKey.kmsKeyArn,
      certificationSignaturePayload(opts.bundleHash),
    );
    return {
      signatureValue,
      signatureAlgorithm: KMS_REPORT_ALGORITHM,
      keyFingerprint: opts.signingKey.fingerprint ?? fingerprintPublicKey(publicKey),
      publicKey,
    };
  }

  if (!allowDevCertificationSigning()) {
    throw new Error('Certification signing requires an active tenant AWS KMS asymmetric signing key.');
  }

  const secret = process.env.BETTER_AUTH_SECRET ?? 'dev';
  return {
    signatureValue: crypto
      .createHmac('sha256', `${secret}:${opts.tenantId}`)
      .update(certificationSignaturePayload(opts.bundleHash))
      .digest('hex'),
    signatureAlgorithm: DEV_REPORT_ALGORITHM,
    keyFingerprint: fingerprint(`${opts.tenantId}:dev`),
  };
}

export async function fetchKmsPublicKey(
  kmsKeyArn: string,
  signer: Pick<CertificationSigner, 'getPublicKey'> = new AwsKmsCertificationSigner(),
): Promise<{ publicKey: string; fingerprint: string }> {
  const publicKey = await signer.getPublicKey(kmsKeyArn);
  return { publicKey, fingerprint: fingerprintPublicKey(publicKey) };
}

export function verifyCertificationSignature(opts: {
  tenantId: string;
  bundleHash?: string | null;
  signatureValue?: string | null;
  signatureAlgorithm?: string | null;
  signingKey?: SigningKey | null;
  reportRevokedAt?: Date | string | null;
}): SignatureVerification {
  if (opts.reportRevokedAt) {
    return {
      status: 'report_revoked',
      valid: false,
      message: 'This certification report has been revoked by the issuing tenant.',
      keyFingerprint: opts.signingKey?.fingerprint ?? null,
    };
  }

  if (!opts.bundleHash || !opts.signatureValue || !opts.signatureAlgorithm) {
    return {
      status: 'missing_signature',
      valid: false,
      message: 'The report is missing signing metadata.',
      keyFingerprint: opts.signingKey?.fingerprint ?? null,
    };
  }

  assertBundleHash(opts.bundleHash);

  if (opts.signatureAlgorithm === DEV_REPORT_ALGORITHM) {
    if (!allowDevCertificationSigning()) {
      return {
        status: 'unsupported_algorithm',
        valid: false,
        message: 'Development HMAC signatures are not accepted in this deployment.',
        keyFingerprint: opts.signingKey?.fingerprint ?? fingerprint(`${opts.tenantId}:dev`),
      };
    }
    const expected = crypto
      .createHmac('sha256', `${process.env.BETTER_AUTH_SECRET ?? 'dev'}:${opts.tenantId}`)
      .update(certificationSignaturePayload(opts.bundleHash))
      .digest('hex');
    const valid = timingSafeEqual(expected, opts.signatureValue);
    return {
      status: valid ? 'valid' : 'invalid',
      valid,
      message: valid
        ? 'Development signature matches the stored bundle hash.'
        : 'Development signature does not match the stored bundle hash.',
      keyFingerprint: opts.signingKey?.fingerprint ?? fingerprint(`${opts.tenantId}:dev`),
    };
  }

  if (opts.signatureAlgorithm !== KMS_REPORT_ALGORITHM) {
    return {
      status: 'unsupported_algorithm',
      valid: false,
      message: `Unsupported signature algorithm: ${opts.signatureAlgorithm}.`,
      keyFingerprint: opts.signingKey?.fingerprint ?? null,
    };
  }

  if (!opts.signingKey?.publicKey) {
    return {
      status: 'missing_key',
      valid: false,
      message: 'The public key used for signing is not available.',
      keyFingerprint: opts.signingKey?.fingerprint ?? null,
    };
  }

  let valid = false;
  try {
    valid = crypto.verify(
      'sha256',
      certificationSignaturePayload(opts.bundleHash),
      {
        key: opts.signingKey.publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      },
      Buffer.from(opts.signatureValue, 'base64'),
    );
  } catch {
    valid = false;
  }

  if (!valid) {
    return {
      status: 'invalid',
      valid: false,
      message: 'Signature does not match the stored bundle hash and tenant public key.',
      keyFingerprint: opts.signingKey.fingerprint ?? fingerprintPublicKey(opts.signingKey.publicKey),
    };
  }

  const hasKeyWarning = Boolean(opts.signingKey.revokedAt || opts.signingKey.rotatedAt);
  return {
    status: hasKeyWarning ? 'valid_with_key_warning' : 'valid',
    valid: true,
    message: opts.signingKey.revokedAt
      ? 'Signature is valid. The signing key has since been revoked, so treat this as historical verification.'
      : opts.signingKey.rotatedAt
        ? 'Signature is valid. The signing key has since been rotated.'
        : 'Signature is valid for the stored bundle hash and tenant public key.',
    keyFingerprint: opts.signingKey.fingerprint ?? fingerprintPublicKey(opts.signingKey.publicKey),
  };
}

export function certificationSignaturePayload(bundleHash: string): Buffer {
  assertBundleHash(bundleHash);
  return Buffer.from(`oakattest-certification-bundle-sha256:${bundleHash}`, 'utf8');
}

export function fingerprintPublicKey(publicKeyPem: string): string {
  const body = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  return crypto.createHash('sha256').update(Buffer.from(body, 'base64')).digest('hex');
}

function allowDevCertificationSigning(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.ALLOW_DEV_CERTIFICATION_SIGNING === 'true'
  );
}

function assertBundleHash(bundleHash: string): void {
  if (!/^[a-f0-9]{64}$/i.test(bundleHash)) {
    throw new Error('Certification bundle hash must be a SHA-256 hex digest.');
  }
}

function kmsClientForKey(kmsKeyArn: string): KMSClient {
  const region = process.env.AWS_REGION || regionFromArn(kmsKeyArn);
  const config: KMSClientConfig = region ? { region } : {};
  return new KMSClient(config);
}

function regionFromArn(arn: string): string | undefined {
  const parts = arn.split(':');
  return parts[0] === 'arn' && parts[2] === 'kms' ? parts[3] : undefined;
}

function derToPem(der: Buffer, label: string): string {
  const base64 = der.toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----\n`;
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function fingerprint(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
