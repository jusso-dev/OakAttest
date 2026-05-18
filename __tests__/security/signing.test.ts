import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KMS_REPORT_ALGORITHM,
  certificationSignaturePayload,
  fingerprintPublicKey,
  signCertificationBundle,
  verifyCertificationSignature,
  type CertificationSigner,
} from '@/lib/security/signing';

const bundleHash = 'a'.repeat(64);

describe('certification signing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('signs and verifies a KMS-backed certification bundle hash', async () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const signer: CertificationSigner = {
      async getPublicKey() {
        return publicKeyPem;
      },
      async sign(_kmsKeyArn, payload) {
        return crypto
          .sign('sha256', payload, {
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: 32,
          })
          .toString('base64');
      },
    };

    const signature = await signCertificationBundle({
      tenantId: 'tenant-1',
      bundleHash,
      signingKey: {
        kmsKeyArn: 'arn:aws:kms:ap-southeast-2:123456789012:key/11111111-1111-1111-1111-111111111111',
      },
      signer,
    });

    expect(signature.signatureAlgorithm).toBe(KMS_REPORT_ALGORITHM);
    expect(signature.keyFingerprint).toBe(fingerprintPublicKey(publicKeyPem));
    expect(certificationSignaturePayload(bundleHash).toString()).toContain(bundleHash);

    const verification = verifyCertificationSignature({
      tenantId: 'tenant-1',
      bundleHash,
      signatureValue: signature.signatureValue,
      signatureAlgorithm: signature.signatureAlgorithm,
      signingKey: {
        publicKey: publicKeyPem,
        fingerprint: signature.keyFingerprint,
      },
    });

    expect(verification.valid).toBe(true);
    expect(verification.status).toBe('valid');
  });

  it('rejects development HMAC signing in production unless explicitly allowed', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_DEV_CERTIFICATION_SIGNING', 'false');

    await expect(
      signCertificationBundle({
        tenantId: 'tenant-1',
        bundleHash,
      }),
    ).rejects.toThrow(/requires an active tenant AWS KMS/);
  });

  it('warns but verifies historical signatures after key rotation', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const signatureValue = crypto
      .sign('sha256', certificationSignaturePayload(bundleHash), {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      })
      .toString('base64');

    const verification = verifyCertificationSignature({
      tenantId: 'tenant-1',
      bundleHash,
      signatureValue,
      signatureAlgorithm: KMS_REPORT_ALGORITHM,
      signingKey: {
        publicKey: publicKeyPem,
        fingerprint: fingerprintPublicKey(publicKeyPem),
        rotatedAt: new Date(),
      },
    });

    expect(verification.valid).toBe(true);
    expect(verification.status).toBe('valid_with_key_warning');
  });

  it('fails revoked reports even if the cryptographic signature is valid', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const signatureValue = crypto
      .sign('sha256', certificationSignaturePayload(bundleHash), {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      })
      .toString('base64');

    const verification = verifyCertificationSignature({
      tenantId: 'tenant-1',
      bundleHash,
      signatureValue,
      signatureAlgorithm: KMS_REPORT_ALGORITHM,
      signingKey: {
        publicKey: publicKeyPem,
        fingerprint: fingerprintPublicKey(publicKeyPem),
      },
      reportRevokedAt: new Date(),
    });

    expect(verification.valid).toBe(false);
    expect(verification.status).toBe('report_revoked');
  });
});
