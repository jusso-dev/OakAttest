import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// S3 client + presigned-URL helpers. The default region is Sydney
// (ap-southeast-2) per §11. KMS encryption is enforced by the bucket policy
// (SSE-KMS), with the per-tenant key alias set in `S3_KMS_KEY_ID`.

const region = process.env.S3_REGION ?? 'ap-southeast-2';
const bucket = process.env.S3_BUCKET ?? 'oakattest-evidence-dev';
const kmsKeyId = process.env.S3_KMS_KEY_ID || undefined;

let cached: S3Client | null = null;

function client(): S3Client {
  if (!cached) {
    cached = new S3Client({
      region,
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
  return cached;
}

export const STORAGE_BUCKET = bucket;

// Build a deterministic storage key for an evidence upload.
export function buildEvidenceKey(opts: {
  tenantId: string;
  engagementId: string;
  evidenceItemId: string;
  filename: string;
}): string {
  const safe = opts.filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `tenants/${opts.tenantId}/engagements/${opts.engagementId}/evidence/${opts.evidenceItemId}/${safe}`;
}

export function buildSspKey(opts: {
  tenantId: string;
  engagementId: string;
  version: number;
  format: 'pdf' | 'docx';
}): string {
  return `tenants/${opts.tenantId}/engagements/${opts.engagementId}/ssp/v${opts.version}.${opts.format}`;
}

export function buildCertificationKey(opts: {
  tenantId: string;
  engagementId: string;
  version: number;
  kind: 'pdf' | 'bundle';
}): string {
  const ext = opts.kind === 'pdf' ? 'pdf' : 'zip';
  return `tenants/${opts.tenantId}/engagements/${opts.engagementId}/certification/v${opts.version}.${ext}`;
}

export async function presignUpload(opts: {
  key: string;
  contentType?: string;
  contentLength?: number;
  expiresIn?: number;
}): Promise<{ url: string; bucket: string; key: string; headers: Record<string, string> }> {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: opts.key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
    ServerSideEncryption: kmsKeyId ? 'aws:kms' : undefined,
    SSEKMSKeyId: kmsKeyId,
  });
  const url = await getSignedUrl(client(), cmd, { expiresIn: opts.expiresIn ?? 600 });
  return {
    url,
    bucket,
    key: opts.key,
    headers: {
      ...(opts.contentType ? { 'Content-Type': opts.contentType } : {}),
      ...(kmsKeyId
        ? {
            'x-amz-server-side-encryption': 'aws:kms',
            'x-amz-server-side-encryption-aws-kms-key-id': kmsKeyId,
          }
        : {}),
    },
  };
}

export async function presignDownload(opts: {
  key: string;
  expiresIn?: number;
}): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: opts.key });
  return getSignedUrl(client(), cmd, { expiresIn: opts.expiresIn ?? 300 });
}

// Upload a Buffer directly from the server (used for generated PDFs and
// certification bundles where the bytes live in app memory).
export async function putBuffer(opts: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<{ bucket: string; key: string }> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
      ServerSideEncryption: kmsKeyId ? 'aws:kms' : undefined,
      SSEKMSKeyId: kmsKeyId,
    }),
  );
  return { bucket, key: opts.key };
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
