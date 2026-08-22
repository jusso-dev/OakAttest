'use server';

import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, desc, eq, max, ne } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';
import { certificationReports } from '@/db/schema/certification';
import { clientOrganisations, engagements } from '@/db/schema/engagements';
import { frameworks } from '@/db/schema/frameworks';
import {
  trustPortalAccessGrants,
  trustPortalAccessRequests,
  trustPortalPublications,
  trustPortals,
} from '@/db/schema/trust-portal';
import { requireSession } from '@/lib/auth/session';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import {
  buildTrustPortalSnapshot,
  hashTrustPortalAccessToken,
  hashTrustPortalSnapshot,
  normaliseTrustPortalSlug,
  trustPortalSnapshotIsPublic,
  trustPortalSnapshotMatchesHash,
  visitorFingerprint,
  type TrustPortalSnapshot,
} from '@/lib/trust-portal';
import { zonedDateEndToUtc } from '@/lib/timezone';
import type { CertificationData } from '@/lib/pdf/certification';
import {
  sendTrustPortalAccessGrantedEmail,
  sendTrustPortalAccessRequestEmail,
} from '@/emails/send';

const PUBLIC_RELEASE_STATEMENT =
  'I confirm this snapshot contains PUBLIC information only and is approved for internet publication.';

async function engagementContext(engagementId: string) {
  const [row] = await db
    .select({
      engagementId: engagements.id,
      tenantId: engagements.tenantId,
      engagementName: engagements.name,
      frameworkLabel: frameworks.label,
      clientName: clientOrganisations.name,
    })
    .from(engagements)
    .innerJoin(frameworks, eq(frameworks.id, engagements.frameworkId))
    .leftJoin(
      clientOrganisations,
      and(
        eq(clientOrganisations.engagementId, engagements.id),
        eq(clientOrganisations.tenantId, engagements.tenantId),
      ),
    )
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) throw new Error('Engagement not found');
  return row;
}

function revalidatePortal(engagementId: string, slug?: string) {
  revalidatePath(`/engagements/${engagementId}/trust`);
  if (slug) revalidatePath(`/trust/${slug}`);
}

const configureSchema = z.object({
  engagementId: z.string().uuid(),
  slug: z.string().min(3).max(80),
  title: z.string().min(3).max(120),
  organisationName: z.string().min(2).max(200),
  overview: z.string().min(20).max(4000),
  commitments: z.array(z.string().min(2).max(500)).max(12),
  securityContactEmail: z.string().email().max(320),
});

export async function configureTrustPortal(input: z.infer<typeof configureSchema>) {
  const session = await requireSession();
  const data = configureSchema.parse(input);
  const context = await engagementContext(data.engagementId);
  await requirePermission(ACTIONS.trustPortalManage, {
    userId: session.user.id,
    tenantId: context.tenantId,
    engagementId: data.engagementId,
  });
  const slug = normaliseTrustPortalSlug(data.slug);
  if (slug.length < 3) throw new Error('Portal slug must contain at least three letters or numbers.');
  const [conflict] = await db
    .select({ id: trustPortals.id })
    .from(trustPortals)
    .where(and(eq(trustPortals.slug, slug), ne(trustPortals.engagementId, data.engagementId)))
    .limit(1);
  if (conflict) throw new Error('That public portal address is already in use.');

  const id = crypto.randomUUID();
  let configuredId: string = id;
  const values = {
    slug,
    title: data.title,
    organisationName: data.organisationName,
    overview: data.overview,
    commitments: data.commitments,
    securityContactEmail: data.securityContactEmail.toLowerCase(),
    updatedBy: session.user.id,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    const [configured] = await tx
      .insert(trustPortals)
      .values({
        id,
        engagementId: data.engagementId,
        tenantId: context.tenantId,
        status: 'draft',
        createdBy: session.user.id,
        ...values,
      })
      .onConflictDoUpdate({ target: trustPortals.engagementId, set: values })
      .returning({ id: trustPortals.id });
    configuredId = configured.id;
    await tx.insert(auditLog).values({
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'trust_portal.configure',
      resourceType: 'trust_portal',
      resourceId: configuredId,
      afterJson: { slug, title: data.title } as never,
    });
  });
  revalidatePortal(data.engagementId, slug);
  return { id: configuredId, slug };
}

const publishSchema = z.object({
  engagementId: z.string().uuid(),
  reportId: z.string().uuid(),
  publicSystemName: z.string().min(2).max(200),
  expiresOn: z.string().date(),
  releaseClassification: z.literal('PUBLIC'),
  approvedForPublicRelease: z.literal(true),
});

export async function publishTrustPortal(input: z.infer<typeof publishSchema>) {
  const session = await requireSession();
  const data = publishSchema.parse(input);
  const context = await engagementContext(data.engagementId);
  await requirePermission(ACTIONS.trustPortalManage, {
    userId: session.user.id,
    tenantId: context.tenantId,
    engagementId: data.engagementId,
  });
  const [[portal], [report]] = await Promise.all([
    db
      .select()
      .from(trustPortals)
      .where(and(eq(trustPortals.tenantId, context.tenantId), eq(trustPortals.engagementId, data.engagementId)))
      .limit(1),
    db
      .select()
      .from(certificationReports)
      .where(
        and(
          eq(certificationReports.id, data.reportId),
          eq(certificationReports.tenantId, context.tenantId),
          eq(certificationReports.engagementId, data.engagementId),
        ),
      )
      .limit(1),
  ]);
  if (!portal) throw new Error('Configure the Trust Portal before publishing.');
  if (!report) throw new Error('Signed artefact not found in this engagement.');
  const snapshotData = report.snapshot as CertificationData;
  const timeZone = await userTimeZone(session.user.id);
  const expiresAt = zonedDateEndToUtc(data.expiresOn, timeZone);
  const snapshot = buildTrustPortalSnapshot({
    releaseClassification: data.releaseClassification,
    approvedForPublicRelease: data.approvedForPublicRelease,
    portalTitle: portal.title,
    organisationName: portal.organisationName,
    overview: portal.overview,
    commitments: portal.commitments,
    securityContactEmail: portal.securityContactEmail,
    publicSystemName: data.publicSystemName,
    frameworkLabel: context.frameworkLabel,
    reportVersion: report.version,
    reportStatus: report.status,
    reportRevokedAt: report.revokedAt,
    recommendation: snapshotData.recommendation,
    signedAt: report.signedAt,
    reportValidUntil: snapshotData.validUntil ? new Date(snapshotData.validUntil) : null,
    publicationExpiresAt: expiresAt,
    verificationToken: report.publicVerificationToken,
    bundleSha256: report.bundleSha256,
    signatureAlgorithm: report.signatureAlgorithm,
    signingKeyFingerprint: report.signingKeyFingerprint,
  });
  const publicationId = crypto.randomUUID();
  const snapshotSha256 = hashTrustPortalSnapshot(snapshot);
  let version = 1;
  await db.transaction(async (tx) => {
    const [last] = await tx
      .select({ value: max(trustPortalPublications.version) })
      .from(trustPortalPublications)
      .where(eq(trustPortalPublications.portalId, portal.id));
    version = (last?.value ?? 0) + 1;
    await tx.insert(trustPortalPublications).values({
      id: publicationId,
      portalId: portal.id,
      engagementId: data.engagementId,
      tenantId: context.tenantId,
      certificationReportId: report.id,
      version,
      snapshot,
      snapshotSha256,
      releaseClassification: 'PUBLIC',
      approvalStatement: PUBLIC_RELEASE_STATEMENT,
      approvedBy: session.user.id,
      expiresAt,
    });
    await tx
      .update(trustPortals)
      .set({ status: 'published', currentPublicationId: publicationId, updatedBy: session.user.id, updatedAt: new Date() })
      .where(and(eq(trustPortals.id, portal.id), eq(trustPortals.tenantId, context.tenantId)));
    await tx.insert(auditLog).values({
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'trust_portal.publish',
      resourceType: 'trust_portal_publication',
      resourceId: publicationId,
      afterJson: {
        portalId: portal.id,
        version,
        snapshotSha256,
        reportId: report.id,
        releaseClassification: 'PUBLIC',
        expiresAt: expiresAt.toISOString(),
      } as never,
    });
  });
  revalidatePortal(data.engagementId, portal.slug);
  return { publicationId, version, slug: portal.slug, snapshotSha256 };
}

const disableSchema = z.object({
  engagementId: z.string().uuid(),
  reason: z.string().min(10).max(1000),
});

export async function disableTrustPortal(input: z.infer<typeof disableSchema>) {
  const session = await requireSession();
  const data = disableSchema.parse(input);
  const context = await engagementContext(data.engagementId);
  await requirePermission(ACTIONS.trustPortalManage, {
    userId: session.user.id,
    tenantId: context.tenantId,
    engagementId: data.engagementId,
  });
  const [portal] = await db
    .select()
    .from(trustPortals)
    .where(and(eq(trustPortals.tenantId, context.tenantId), eq(trustPortals.engagementId, data.engagementId)))
    .limit(1);
  if (!portal) throw new Error('Trust Portal not found.');
  const now = new Date();
  await db.transaction(async (tx) => {
    if (portal.currentPublicationId) {
      await tx
        .update(trustPortalPublications)
        .set({ revokedAt: now, revokedBy: session.user.id, revokedReason: data.reason })
        .where(
          and(
            eq(trustPortalPublications.id, portal.currentPublicationId),
            eq(trustPortalPublications.tenantId, context.tenantId),
          ),
        );
    }
    await tx
      .update(trustPortals)
      .set({ status: 'disabled', currentPublicationId: null, updatedBy: session.user.id, updatedAt: now })
      .where(and(eq(trustPortals.id, portal.id), eq(trustPortals.tenantId, context.tenantId)));
    await tx.insert(auditLog).values({
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'trust_portal.disable',
      resourceType: 'trust_portal',
      resourceId: portal.id,
      afterJson: { reason: data.reason, revokedPublicationId: portal.currentPublicationId } as never,
    });
  });
  revalidatePortal(data.engagementId, portal.slug);
  return { ok: true };
}

const requestSchema = z.object({
  slug: z.string().min(3).max(80),
  requesterEmail: z.string().email().max(320),
  requesterOrganisation: z.string().min(2).max(200),
  purpose: z.string().min(20).max(2000),
  website: z.string().max(0).optional(),
});

export async function requestTrustPortalAccess(input: z.infer<typeof requestSchema>) {
  const data = requestSchema.parse(input);
  const slug = normaliseTrustPortalSlug(data.slug);
  const [portal] = await db
    .select()
    .from(trustPortals)
    .where(and(eq(trustPortals.slug, slug), eq(trustPortals.status, 'published')))
    .limit(1);
  if (!portal?.currentPublicationId) throw new Error('This Trust Portal is not accepting requests.');
  const [publication] = await db
    .select()
    .from(trustPortalPublications)
    .where(
      and(
        eq(trustPortalPublications.id, portal.currentPublicationId),
        eq(trustPortalPublications.portalId, portal.id),
        eq(trustPortalPublications.tenantId, portal.tenantId),
      ),
    )
    .limit(1);
  if (
    !publication ||
    publication.revokedAt ||
    !trustPortalSnapshotIsPublic(publication.snapshot) ||
    !trustPortalSnapshotMatchesHash(publication.snapshot, publication.snapshotSha256)
  ) {
    throw new Error('This Trust Portal publication is no longer current.');
  }
  const [sourceReport] = await db
    .select({ status: certificationReports.status, revokedAt: certificationReports.revokedAt })
    .from(certificationReports)
    .where(
      and(
        eq(certificationReports.id, publication.certificationReportId),
        eq(certificationReports.tenantId, portal.tenantId),
        eq(certificationReports.engagementId, portal.engagementId),
      ),
    )
    .limit(1);
  if (!sourceReport || sourceReport.status !== 'signed' || sourceReport.revokedAt) {
    throw new Error('This Trust Portal publication is no longer current.');
  }

  const requesterEmail = data.requesterEmail.toLowerCase();
  const [existing] = await db
    .select({ id: trustPortalAccessRequests.id })
    .from(trustPortalAccessRequests)
    .where(
      and(
        eq(trustPortalAccessRequests.publicationId, publication.id),
        eq(trustPortalAccessRequests.requesterEmail, requesterEmail),
        eq(trustPortalAccessRequests.status, 'pending'),
      ),
    )
    .orderBy(desc(trustPortalAccessRequests.requestedAt))
    .limit(1);
  if (existing) return { id: existing.id, alreadyPending: true };

  const id = crypto.randomUUID();
  const hdrs = await headers();
  const fingerprint = visitorFingerprint(
    hdrs.get('cf-connecting-ip') ?? hdrs.get('x-forwarded-for') ?? '',
    process.env.BETTER_AUTH_SECRET ?? 'oakattest-unconfigured-secret',
  );
  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(trustPortalAccessRequests).values({
      id,
      portalId: portal.id,
      publicationId: publication.id,
      tenantId: portal.tenantId,
      requesterEmail,
      requesterOrganisation: data.requesterOrganisation,
      purpose: data.purpose,
    }).onConflictDoNothing().returning({ id: trustPortalAccessRequests.id });
    if (!inserted) return false;
    await tx.insert(auditLog).values({
      tenantId: portal.tenantId,
      engagementId: portal.engagementId,
      actorType: 'system',
      actorUserAgent: hdrs.get('user-agent'),
      action: 'trust_portal.access_request',
      resourceType: 'trust_portal_access_request',
      resourceId: id,
      afterJson: { portalId: portal.id, publicationId: publication.id, visitorFingerprint: fingerprint } as never,
    });
    return true;
  });
  if (!created) {
    const [pending] = await db
      .select({ id: trustPortalAccessRequests.id })
      .from(trustPortalAccessRequests)
      .where(
        and(
          eq(trustPortalAccessRequests.publicationId, publication.id),
          eq(trustPortalAccessRequests.requesterEmail, requesterEmail),
          eq(trustPortalAccessRequests.status, 'pending'),
        ),
      )
      .limit(1);
    return { id: pending?.id ?? id, alreadyPending: true };
  }
  await sendTrustPortalAccessRequestEmail({
    to: portal.securityContactEmail,
    requesterEmail,
    requesterOrganisation: data.requesterOrganisation,
    portalTitle: publication.snapshot.portalTitle,
  });
  revalidatePath(`/engagements/${portal.engagementId}/trust`);
  return { id, alreadyPending: false };
}

const decideRequestSchema = z.object({
  engagementId: z.string().uuid(),
  requestId: z.string().uuid(),
  decisionNotes: z.string().max(1000).optional(),
});

export async function denyTrustPortalAccess(input: z.infer<typeof decideRequestSchema>) {
  const session = await requireSession();
  const data = decideRequestSchema.parse(input);
  const context = await engagementContext(data.engagementId);
  await requirePermission(ACTIONS.trustPortalManage, {
    userId: session.user.id,
    tenantId: context.tenantId,
    engagementId: data.engagementId,
  });
  const [request] = await db
    .select({ id: trustPortalAccessRequests.id, status: trustPortalAccessRequests.status })
    .from(trustPortalAccessRequests)
    .where(and(eq(trustPortalAccessRequests.id, data.requestId), eq(trustPortalAccessRequests.tenantId, context.tenantId)))
    .limit(1);
  if (!request) throw new Error('Access request not found.');
  if (request.status !== 'pending') throw new Error('Access request has already been decided.');
  await db.transaction(async (tx) => {
    const [decided] = await tx
      .update(trustPortalAccessRequests)
      .set({ status: 'denied', decisionNotes: data.decisionNotes || null, decidedBy: session.user.id, decidedAt: new Date() })
      .where(and(eq(trustPortalAccessRequests.id, request.id), eq(trustPortalAccessRequests.status, 'pending')))
      .returning({ id: trustPortalAccessRequests.id });
    if (!decided) throw new Error('Access request has already been decided.');
    await tx.insert(auditLog).values({
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'trust_portal.access_deny',
      resourceType: 'trust_portal_access_request',
      resourceId: request.id,
    });
  });
  revalidatePortal(data.engagementId);
  return { ok: true };
}

const grantSchema = decideRequestSchema.extend({
  expiresInDays: z.coerce.number().int().min(1).max(30),
  maxDownloads: z.coerce.number().int().min(1).max(20),
});

export async function grantTrustPortalAccess(input: z.input<typeof grantSchema>) {
  const session = await requireSession();
  const data = grantSchema.parse(input);
  const context = await engagementContext(data.engagementId);
  await requirePermission(ACTIONS.trustPortalManage, {
    userId: session.user.id,
    tenantId: context.tenantId,
    engagementId: data.engagementId,
  });
  const [request] = await db
    .select()
    .from(trustPortalAccessRequests)
    .where(and(eq(trustPortalAccessRequests.id, data.requestId), eq(trustPortalAccessRequests.tenantId, context.tenantId)))
    .limit(1);
  if (!request) throw new Error('Access request not found.');
  if (request.status !== 'pending') throw new Error('Access request has already been decided.');
  const [[publication], [portal]] = await Promise.all([
    db
      .select()
      .from(trustPortalPublications)
      .where(
        and(
          eq(trustPortalPublications.id, request.publicationId),
          eq(trustPortalPublications.tenantId, context.tenantId),
          eq(trustPortalPublications.engagementId, data.engagementId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(trustPortals)
      .where(and(eq(trustPortals.id, request.portalId), eq(trustPortals.tenantId, context.tenantId)))
      .limit(1),
  ]);
  if (
    !publication ||
    publication.revokedAt ||
    !trustPortalSnapshotIsPublic(publication.snapshot) ||
    !trustPortalSnapshotMatchesHash(publication.snapshot, publication.snapshotSha256)
  ) {
    throw new Error('The requested publication is no longer current.');
  }
  if (!portal || portal.status !== 'published' || portal.currentPublicationId !== publication.id) {
    throw new Error('The Trust Portal publication has changed. Ask the requester to submit a new request.');
  }
  const [report] = await db
    .select({ id: certificationReports.id, status: certificationReports.status, revokedAt: certificationReports.revokedAt, pdfStorageKey: certificationReports.pdfStorageKey })
    .from(certificationReports)
    .where(
      and(
        eq(certificationReports.id, publication.certificationReportId),
        eq(certificationReports.tenantId, context.tenantId),
        eq(certificationReports.engagementId, data.engagementId),
      ),
    )
    .limit(1);
  if (!report || report.status !== 'signed' || report.revokedAt || !report.pdfStorageKey) {
    throw new Error('The signed PDF is not available for controlled access.');
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenSha256 = hashTrustPortalAccessToken(rawToken);
  const requestedExpiry = new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000);
  const expiresAt = requestedExpiry < publication.expiresAt ? requestedExpiry : publication.expiresAt;
  if (expiresAt <= new Date()) throw new Error('The publication expires too soon to grant access.');
  const grantId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const [decided] = await tx
      .update(trustPortalAccessRequests)
      .set({ status: 'approved', decisionNotes: data.decisionNotes || null, decidedBy: session.user.id, decidedAt: new Date() })
      .where(and(eq(trustPortalAccessRequests.id, request.id), eq(trustPortalAccessRequests.status, 'pending')))
      .returning({ id: trustPortalAccessRequests.id });
    if (!decided) throw new Error('Access request has already been decided.');
    await tx.insert(trustPortalAccessGrants).values({
      id: grantId,
      requestId: request.id,
      portalId: portal.id,
      publicationId: publication.id,
      certificationReportId: report.id,
      tenantId: context.tenantId,
      tokenSha256,
      requesterEmail: request.requesterEmail,
      expiresAt,
      maxDownloads: data.maxDownloads,
      createdBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId: context.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'trust_portal.access_grant',
      resourceType: 'trust_portal_access_grant',
      resourceId: grantId,
      afterJson: { requestId: request.id, expiresAt: expiresAt.toISOString(), maxDownloads: data.maxDownloads } as never,
    });
  });
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  const accessUrl = `${baseUrl}/trust/access/${rawToken}`;
  await sendTrustPortalAccessGrantedEmail({
    to: request.requesterEmail,
    portalTitle: publication.snapshot.portalTitle,
    accessUrl,
    expiresAt: expiresAt.toISOString(),
    maxDownloads: data.maxDownloads,
  });
  revalidatePortal(data.engagementId, portal.slug);
  return { grantId, accessUrl, expiresAt: expiresAt.toISOString() };
}

const revokeGrantSchema = z.object({
  engagementId: z.string().uuid(),
  grantId: z.string().uuid(),
});

export async function revokeTrustPortalAccess(input: z.infer<typeof revokeGrantSchema>) {
  const session = await requireSession();
  const data = revokeGrantSchema.parse(input);
  const context = await engagementContext(data.engagementId);
  await requirePermission(ACTIONS.trustPortalManage, {
    userId: session.user.id,
    tenantId: context.tenantId,
    engagementId: data.engagementId,
  });
  const now = new Date();
  const [grant] = await db
    .update(trustPortalAccessGrants)
    .set({ revokedAt: now, revokedBy: session.user.id })
    .where(and(eq(trustPortalAccessGrants.id, data.grantId), eq(trustPortalAccessGrants.tenantId, context.tenantId)))
    .returning({ id: trustPortalAccessGrants.id });
  if (!grant) throw new Error('Access grant not found.');
  await db.insert(auditLog).values({
    tenantId: context.tenantId,
    engagementId: data.engagementId,
    actorUserId: session.user.id,
    action: 'trust_portal.access_revoke',
    resourceType: 'trust_portal_access_grant',
    resourceId: grant.id,
  });
  revalidatePortal(data.engagementId);
  return { ok: true };
}

export async function recordTrustPortalVisit(input: { slug: string; publicationId: string }) {
  const data = z.object({ slug: z.string().min(3).max(80), publicationId: z.string().uuid() }).parse(input);
  const [portal] = await db
    .select({ id: trustPortals.id, tenantId: trustPortals.tenantId, engagementId: trustPortals.engagementId, currentPublicationId: trustPortals.currentPublicationId })
    .from(trustPortals)
    .where(and(eq(trustPortals.slug, normaliseTrustPortalSlug(data.slug)), eq(trustPortals.status, 'published')))
    .limit(1);
  if (!portal || portal.currentPublicationId !== data.publicationId) return;
  const hdrs = await headers();
  const fingerprint = visitorFingerprint(
    hdrs.get('cf-connecting-ip') ?? hdrs.get('x-forwarded-for') ?? '',
    process.env.BETTER_AUTH_SECRET ?? 'oakattest-unconfigured-secret',
  );
  await db.insert(auditLog).values({
    tenantId: portal.tenantId,
    engagementId: portal.engagementId,
    actorType: 'system',
    actorUserAgent: hdrs.get('user-agent'),
    action: 'trust_portal.view',
    resourceType: 'trust_portal_publication',
    resourceId: data.publicationId,
    afterJson: { visitorFingerprint: fingerprint, referrer: hdrs.get('referer') } as never,
  });
}

export type { TrustPortalSnapshot };
