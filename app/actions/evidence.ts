'use server';

import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import {
  evidenceRequests,
  evidenceRequestControls,
  evidenceItems,
  evidenceItemControls,
} from '@/db/schema/evidence';
import { engagements } from '@/db/schema/engagements';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import {
  STORAGE_BUCKET,
  buildEvidenceKey,
  presignUpload,
  presignDownload,
} from '@/lib/storage/s3';

async function tenantForEngagement(engagementId: string): Promise<string> {
  const [row] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) throw new Error('Engagement not found');
  return row.tenantId;
}

const createRequestSchema = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  artifactType: z.string().max(100).optional(),
  dueAt: z.string().datetime().optional(),
  ismControlIds: z.array(z.string().uuid()).min(1),
});

export async function createEvidenceRequest(input: z.infer<typeof createRequestSchema>) {
  const session = await requireSession();
  const data = createRequestSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.evidenceRequest, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(evidenceRequests).values({
      id,
      engagementId: data.engagementId,
      tenantId,
      title: data.title,
      description: data.description ?? null,
      artifactType: data.artifactType ?? null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      requestedBy: session.user.id,
    });
    await tx.insert(evidenceRequestControls).values(
      data.ismControlIds.map((cid) => ({ evidenceRequestId: id, ismControlId: cid })),
    );
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'evidence_request.create',
      resourceType: 'evidence_request',
      resourceId: id,
      afterJson: { title: data.title, controlCount: data.ismControlIds.length } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/evidence`);
  return { id };
}

// Step 1 of upload: client asks for a presigned URL. We reserve an evidence
// item row in `pending` state. Step 2 (`finaliseUpload`) sets sha + size
// after the client posts to S3 and reports back.
const startUploadSchema = z.object({
  engagementId: z.string().uuid(),
  evidenceRequestId: z.string().uuid().optional(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.number().int().positive().max(2_000_000_000),
  ismControlIds: z.array(z.string().uuid()).optional(),
});

export async function startEvidenceUpload(input: z.infer<typeof startUploadSchema>) {
  const session = await requireSession();
  const data = startUploadSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.evidenceUpload, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const id = crypto.randomUUID();
  const key = buildEvidenceKey({
    tenantId,
    engagementId: data.engagementId,
    evidenceItemId: id,
    filename: data.filename,
  });

  // Detect chained version. If an item with the same filename exists for
  // this engagement, the new upload is treated as a replacement and links
  // back via `supersedes_id`.
  const [previous] = await db
    .select({ id: evidenceItems.id, version: evidenceItems.version })
    .from(evidenceItems)
    .where(
      and(
        eq(evidenceItems.engagementId, data.engagementId),
        eq(evidenceItems.filename, data.filename),
      ),
    )
    .orderBy(desc(evidenceItems.version))
    .limit(1);

  const presigned = await presignUpload({
    key,
    contentType: data.mimeType,
    contentLength: data.sizeBytes,
    expiresIn: 600,
  });

  await db.transaction(async (tx) => {
    await tx.insert(evidenceItems).values({
      id,
      engagementId: data.engagementId,
      tenantId,
      evidenceRequestId: data.evidenceRequestId ?? null,
      filename: data.filename,
      mimeType: data.mimeType ?? null,
      sizeBytes: data.sizeBytes,
      sha256: 'pending',
      storageKey: key,
      storageBucket: STORAGE_BUCKET,
      version: (previous?.version ?? 0) + 1,
      supersedesId: previous?.id ?? null,
      uploadedBy: session.user.id,
    });

    if (data.ismControlIds && data.ismControlIds.length > 0) {
      await tx.insert(evidenceItemControls).values(
        data.ismControlIds.map((cid) => ({ evidenceItemId: id, ismControlId: cid })),
      );
    }

    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'evidence.upload.started',
      resourceType: 'evidence_item',
      resourceId: id,
      afterJson: { filename: data.filename, size: data.sizeBytes } as never,
    });
  });

  return {
    evidenceItemId: id,
    uploadUrl: presigned.url,
    storageKey: key,
    headers: presigned.headers,
  };
}

const finaliseSchema = z.object({
  engagementId: z.string().uuid(),
  evidenceItemId: z.string().uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  description: z.string().max(2000).optional(),
});

// Step 2: client reports the SHA-256 it computed for the bytes it just
// PUT to S3. The server stores it and links the item to its evidence
// request (if any).
export async function finaliseEvidenceUpload(input: z.infer<typeof finaliseSchema>) {
  const session = await requireSession();
  const data = finaliseSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.evidenceUpload, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(evidenceItems)
      .set({
        sha256: data.sha256.toLowerCase(),
        description: data.description ?? null,
      })
      .where(
        and(
          eq(evidenceItems.id, data.evidenceItemId),
          eq(evidenceItems.engagementId, data.engagementId),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'evidence.upload.finalised',
      resourceType: 'evidence_item',
      resourceId: data.evidenceItemId,
      afterJson: { sha256: data.sha256.toLowerCase() } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/evidence`);
  return { ok: true };
}

const reviewSchema = z.object({
  engagementId: z.string().uuid(),
  evidenceItemId: z.string().uuid(),
  status: z.enum(['accepted', 'insufficient', 'rejected']),
  notes: z.string().max(4000).optional(),
});

export async function reviewEvidence(input: z.infer<typeof reviewSchema>) {
  const session = await requireSession();
  const data = reviewSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.evidenceReview, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(evidenceItems)
      .set({
        reviewStatus: data.status,
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        reviewNotes: data.notes ?? null,
      })
      .where(eq(evidenceItems.id, data.evidenceItemId));
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'evidence.review',
      resourceType: 'evidence_item',
      resourceId: data.evidenceItemId,
      afterJson: { status: data.status } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/evidence`);
  return { ok: true };
}

// Issue a short-lived download URL. Audit-logged.
export async function getEvidenceDownloadUrl(opts: {
  engagementId: string;
  evidenceItemId: string;
}): Promise<{ url: string }> {
  const session = await requireSession();
  const tenantId = await tenantForEngagement(opts.engagementId);
  await requirePermission(ACTIONS.evidenceView, {
    userId: session.user.id,
    tenantId,
    engagementId: opts.engagementId,
  });

  const [item] = await db
    .select({ key: evidenceItems.storageKey, engagementId: evidenceItems.engagementId })
    .from(evidenceItems)
    .where(eq(evidenceItems.id, opts.evidenceItemId))
    .limit(1);
  if (!item || item.engagementId !== opts.engagementId) {
    throw new Error('Evidence not found');
  }

  await db.insert(auditLog).values({
    tenantId,
    engagementId: opts.engagementId,
    actorUserId: session.user.id,
    action: 'evidence.download',
    resourceType: 'evidence_item',
    resourceId: opts.evidenceItemId,
  });

  const url = await presignDownload({ key: item.key, expiresIn: 300 });
  return { url };
}
