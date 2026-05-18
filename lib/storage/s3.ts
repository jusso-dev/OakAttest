import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';

// S3-compatible client + presigned-URL helpers. The default region is suitable
// for local Australian examples; production residency depends on the operator's
// database, bucket, backup, and logging configuration.

type StorageConfig = {
  region: string;
  bucket: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  kmsKeyId?: string;
  useDefaultCredentialChain: boolean;
};

function readStorageConfig(): StorageConfig {
  const endpoint = process.env.R2_ENDPOINT ?? process.env.S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY;
  const useDefaultCredentialChain = process.env.S3_USE_DEFAULT_CREDENTIAL_CHAIN === 'true';

  return {
    region: process.env.R2_REGION ?? process.env.S3_REGION ?? 'ap-southeast-2',
    bucket: process.env.R2_BUCKET ?? process.env.S3_BUCKET ?? 'oakattest-evidence-dev',
    endpoint,
    accessKeyId,
    secretAccessKey,
    kmsKeyId: process.env.S3_KMS_KEY_ID || undefined,
    useDefaultCredentialChain,
  };
}

let cached: S3Client | null = null;
let cachedKey: string | null = null;

function client(): S3Client {
  const config = readStorageConfig();
  const configKey = [
    config.region,
    config.bucket,
    config.endpoint,
    Boolean(config.accessKeyId),
    Boolean(config.secretAccessKey),
    config.useDefaultCredentialChain,
  ].join('|');

  if (!cached || cachedKey !== configKey) {
    if (!config.accessKeyId || !config.secretAccessKey) {
      if (config.endpoint || !config.useDefaultCredentialChain) {
        throw new Error(
          'Evidence storage is not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT, and R2_REGION=auto for Cloudflare R2. For AWS IAM role/profile auth, set S3_USE_DEFAULT_CREDENTIAL_CHAIN=true.',
        );
      }
    }
    cached = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    });
    cachedKey = configKey;
  }
  return cached;
}

export const STORAGE_BUCKET = readStorageConfig().bucket;

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
  format: 'pdf' | 'docx' | 'xlsx' | 'zip';
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

export function buildEssentialEightReportKey(opts: {
  tenantId: string;
  engagementId: string;
  version: number;
}): string {
  return `tenants/${opts.tenantId}/engagements/${opts.engagementId}/essential-eight/v${opts.version}.json`;
}

export async function presignUpload(opts: {
  key: string;
  contentType?: string;
  contentLength?: number;
  expiresIn?: number;
}): Promise<{ url: string; bucket: string; key: string; headers: Record<string, string> }> {
  const config = readStorageConfig();
  const cmd = new PutObjectCommand({
    Bucket: config.bucket,
    Key: opts.key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
    ServerSideEncryption: config.kmsKeyId ? 'aws:kms' : undefined,
    SSEKMSKeyId: config.kmsKeyId,
  });
  const url = await getSignedUrl(client(), cmd, { expiresIn: opts.expiresIn ?? 600 });
  return {
    url,
    bucket: config.bucket,
    key: opts.key,
    headers: {
      ...(opts.contentType ? { 'Content-Type': opts.contentType } : {}),
      ...(config.kmsKeyId
        ? {
            'x-amz-server-side-encryption': 'aws:kms',
            'x-amz-server-side-encryption-aws-kms-key-id': config.kmsKeyId,
          }
        : {}),
    },
  };
}

export async function presignDownload(opts: {
  key: string;
  expiresIn?: number;
}): Promise<string> {
  const config = readStorageConfig();
  const cmd = new GetObjectCommand({ Bucket: config.bucket, Key: opts.key });
  return getSignedUrl(client(), cmd, { expiresIn: opts.expiresIn ?? 300 });
}

export async function verifyObject(opts: {
  key: string;
  expectedSizeBytes?: number;
}): Promise<{ bucket: string; key: string; sizeBytes: number | null; etag: string | null }> {
  const config = readStorageConfig();
  const result = await client().send(new HeadObjectCommand({ Bucket: config.bucket, Key: opts.key }));
  const sizeBytes = result.ContentLength ?? null;
  if (
    opts.expectedSizeBytes !== undefined &&
    sizeBytes !== null &&
    sizeBytes !== opts.expectedSizeBytes
  ) {
    throw new Error(`Uploaded object size mismatch: expected ${opts.expectedSizeBytes}, got ${sizeBytes}`);
  }
  return {
    bucket: config.bucket,
    key: opts.key,
    sizeBytes,
    etag: result.ETag?.replaceAll('"', '') ?? null,
  };
}

export async function verifyObjectChecksum(opts: {
  key: string;
  expectedSha256: string;
  expectedSizeBytes?: number;
}): Promise<{
  bucket: string;
  key: string;
  sha256: string;
  sizeBytes: number;
  etag: string | null;
}> {
  const config = readStorageConfig();
  const head = await verifyObject({
    key: opts.key,
    expectedSizeBytes: opts.expectedSizeBytes,
  });
  const result = await client().send(new GetObjectCommand({ Bucket: config.bucket, Key: opts.key }));
  if (!result.Body) throw new Error('Uploaded object is empty or unreadable');

  const hash = crypto.createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of toAsyncIterable(result.Body)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    sizeBytes += buffer.byteLength;
    hash.update(buffer);
  }

  if (opts.expectedSizeBytes !== undefined && sizeBytes !== opts.expectedSizeBytes) {
    throw new Error(`Uploaded object size mismatch: expected ${opts.expectedSizeBytes}, got ${sizeBytes}`);
  }

  const sha256 = hash.digest('hex');
  if (sha256 !== opts.expectedSha256.toLowerCase()) {
    throw new Error('Uploaded object checksum mismatch');
  }

  return {
    bucket: config.bucket,
    key: opts.key,
    sha256,
    sizeBytes,
    etag: head.etag,
  };
}

function toAsyncIterable(body: unknown): AsyncIterable<Uint8Array> {
  if (body instanceof Readable) return body;
  if (
    body &&
    typeof body === 'object' &&
    Symbol.asyncIterator in body
  ) {
    return body as AsyncIterable<Uint8Array>;
  }
  if (
    body &&
    typeof body === 'object' &&
    'transformToByteArray' in body &&
    typeof (body as { transformToByteArray: unknown }).transformToByteArray === 'function'
  ) {
    return (async function* () {
      yield await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    })();
  }
  throw new Error('Unsupported storage response body');
}

// Upload a Buffer directly from the server (used for generated PDFs and
// certification bundles where the bytes live in app memory).
export async function putBuffer(opts: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<{ bucket: string; key: string }> {
  const config = readStorageConfig();
  await client().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
      ServerSideEncryption: config.kmsKeyId ? 'aws:kms' : undefined,
      SSEKMSKeyId: config.kmsKeyId,
    }),
  );
  return { bucket: config.bucket, key: opts.key };
}

export async function deleteObject(key: string): Promise<void> {
  const config = readStorageConfig();
  await client().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}
