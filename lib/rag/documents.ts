import { PDFParse } from 'pdf-parse';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { evidenceDocumentChunks, evidenceItems } from '@/db/schema/evidence';
import { getObjectBuffer } from '@/lib/storage/s3';
import {
  chunkDocumentText,
  MAX_SEARCH_DOCUMENT_BYTES,
  normalizeDocumentText,
} from './chunking';

const MAX_INDEX_CHARACTERS = 240_000;

export type RagIndexStatus = 'indexed' | 'unsupported' | 'failed';

export async function indexEvidenceDocument({
  tenantId,
  engagementId,
  evidenceItemId,
}: {
  tenantId: string;
  engagementId: string;
  evidenceItemId: string;
}): Promise<{ status: RagIndexStatus; chunks: number; error?: string }> {
  const [item] = await db
    .select({
      filename: evidenceItems.filename,
      mimeType: evidenceItems.mimeType,
      sizeBytes: evidenceItems.sizeBytes,
      storageKey: evidenceItems.storageKey,
      storageVerifiedAt: evidenceItems.storageVerifiedAt,
      quarantinedAt: evidenceItems.quarantinedAt,
    })
    .from(evidenceItems)
    .where(
      and(
        eq(evidenceItems.id, evidenceItemId),
        eq(evidenceItems.tenantId, tenantId),
        eq(evidenceItems.engagementId, engagementId),
      ),
    )
    .limit(1);

  if (!item || !item.storageVerifiedAt || item.quarantinedAt) {
    return markIndexFailure({
      tenantId,
      engagementId,
      evidenceItemId,
      status: 'failed',
      error: 'Only verified, non-quarantined evidence can be indexed.',
    });
  }

  if (item.sizeBytes > MAX_SEARCH_DOCUMENT_BYTES) {
    return markIndexFailure({
      tenantId,
      engagementId,
      evidenceItemId,
      status: 'unsupported',
      error: 'Search indexing supports documents up to 24 MB.',
    });
  }

  try {
    const buffer = await getObjectBuffer(item.storageKey);
    const extracted = await extractDocumentText({
      buffer,
      filename: item.filename,
      mimeType: item.mimeType,
    });
    const chunks = chunkDocumentText(extracted);
    if (chunks.length === 0) {
      return markIndexFailure({
        tenantId,
        engagementId,
        evidenceItemId,
        status: 'unsupported',
        error: 'No searchable text could be extracted from this document.',
      });
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(evidenceDocumentChunks)
        .where(
          and(
            eq(evidenceDocumentChunks.evidenceItemId, evidenceItemId),
            eq(evidenceDocumentChunks.tenantId, tenantId),
            eq(evidenceDocumentChunks.engagementId, engagementId),
          ),
        );
      await tx.insert(evidenceDocumentChunks).values(
        chunks.map((content, chunkIndex) => ({
          tenantId,
          engagementId,
          evidenceItemId,
          chunkIndex,
          content,
        })),
      );
      await tx
        .update(evidenceItems)
        .set({ ragStatus: 'indexed', ragError: null, ragIndexedAt: new Date() })
        .where(
          and(
            eq(evidenceItems.id, evidenceItemId),
            eq(evidenceItems.tenantId, tenantId),
            eq(evidenceItems.engagementId, engagementId),
          ),
        );
    });

    return { status: 'indexed', chunks: chunks.length };
  } catch (error) {
    return markIndexFailure({
      tenantId,
      engagementId,
      evidenceItemId,
      status: isUnsupportedDocumentError(error) ? 'unsupported' : 'failed',
      error: error instanceof Error ? error.message : 'Document indexing failed.',
    });
  }
}

export async function searchEvidenceDocuments({
  tenantId,
  engagementId,
  query,
  limit = 8,
}: {
  tenantId: string;
  engagementId: string;
  query: string;
  limit?: number;
}) {
  const normalizedQuery = query.replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!normalizedQuery) return [];

  const rank = sql<number>`ts_rank_cd(
    to_tsvector('english', ${evidenceDocumentChunks.content}),
    websearch_to_tsquery('english', ${normalizedQuery})
  )`;

  return db
    .select({
      filename: evidenceItems.filename,
      dataClassification: evidenceItems.dataClassification,
      chunkIndex: evidenceDocumentChunks.chunkIndex,
      content: evidenceDocumentChunks.content,
      rank,
    })
    .from(evidenceDocumentChunks)
    .innerJoin(evidenceItems, eq(evidenceItems.id, evidenceDocumentChunks.evidenceItemId))
    .where(
      and(
        eq(evidenceDocumentChunks.tenantId, tenantId),
        eq(evidenceDocumentChunks.engagementId, engagementId),
        eq(evidenceItems.ragStatus, 'indexed'),
        isNotNull(evidenceItems.storageVerifiedAt),
        isNull(evidenceItems.quarantinedAt),
        sql`to_tsvector('english', ${evidenceDocumentChunks.content}) @@ websearch_to_tsquery('english', ${normalizedQuery})`,
      ),
    )
    .orderBy(desc(rank))
    .limit(Math.min(Math.max(limit, 1), 12));
}

export async function extractDocumentText({
  buffer,
  filename,
  mimeType,
}: {
  buffer: Buffer;
  filename: string;
  mimeType: string | null;
}) {
  const extension = filename.toLowerCase().split('.').pop() ?? '';
  const isPdf = mimeType === 'application/pdf' || extension === 'pdf';
  if (isPdf) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return normalizeDocumentText(result.text).slice(0, MAX_INDEX_CHARACTERS);
    } finally {
      await parser.destroy();
    }
  }

  const isText =
    mimeType?.startsWith('text/') ||
    mimeType === 'application/json' ||
    ['txt', 'md', 'markdown', 'csv', 'json', 'log', 'xml'].includes(extension);
  if (!isText) {
    throw new UnsupportedDocumentError(
      'Search indexing supports PDF, text, Markdown, CSV, JSON, XML, and log files.',
    );
  }

  return normalizeDocumentText(buffer.toString('utf8')).slice(0, MAX_INDEX_CHARACTERS);
}

async function markIndexFailure({
  tenantId,
  engagementId,
  evidenceItemId,
  status,
  error,
}: {
  tenantId: string;
  engagementId: string;
  evidenceItemId: string;
  status: Exclude<RagIndexStatus, 'indexed'>;
  error: string;
}) {
  const safeError = error.slice(0, 800);
  await db
    .update(evidenceItems)
    .set({ ragStatus: status, ragError: safeError, ragIndexedAt: null })
    .where(
      and(
        eq(evidenceItems.id, evidenceItemId),
        eq(evidenceItems.tenantId, tenantId),
        eq(evidenceItems.engagementId, engagementId),
      ),
    );
  return { status, chunks: 0, error: safeError };
}

class UnsupportedDocumentError extends Error {}

function isUnsupportedDocumentError(error: unknown) {
  return error instanceof UnsupportedDocumentError;
}
