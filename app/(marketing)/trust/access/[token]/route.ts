import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';
import { certificationReports } from '@/db/schema/certification';
import {
  trustPortalAccessGrants,
  trustPortalPublications,
  trustPortals,
} from '@/db/schema/trust-portal';
import { presignDownload } from '@/lib/storage/s3';
import {
  hashTrustPortalAccessToken,
  trustPortalSnapshotIsPublic,
  trustPortalSnapshotMatchesHash,
  visitorFingerprint,
} from '@/lib/trust-portal';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return unavailable();
  const tokenSha256 = hashTrustPortalAccessToken(token);
  const now = new Date();
  const ipFingerprint = visitorFingerprint(
    request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? '',
    process.env.BETTER_AUTH_SECRET ?? 'oakattest-unconfigured-secret',
  );

  const key = await db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        grantId: trustPortalAccessGrants.id,
        tenantId: trustPortalAccessGrants.tenantId,
        engagementId: trustPortals.engagementId,
        expiresAt: trustPortalAccessGrants.expiresAt,
        maxDownloads: trustPortalAccessGrants.maxDownloads,
        downloadCount: trustPortalAccessGrants.downloadCount,
        portalStatus: trustPortals.status,
        currentPublicationId: trustPortals.currentPublicationId,
        publicationId: trustPortalPublications.id,
        publicationRevokedAt: trustPortalPublications.revokedAt,
        snapshot: trustPortalPublications.snapshot,
        snapshotSha256: trustPortalPublications.snapshotSha256,
        reportStatus: certificationReports.status,
        reportRevokedAt: certificationReports.revokedAt,
        pdfStorageKey: certificationReports.pdfStorageKey,
      })
      .from(trustPortalAccessGrants)
      .innerJoin(trustPortals, eq(trustPortals.id, trustPortalAccessGrants.portalId))
      .innerJoin(trustPortalPublications, eq(trustPortalPublications.id, trustPortalAccessGrants.publicationId))
      .innerJoin(certificationReports, eq(certificationReports.id, trustPortalAccessGrants.certificationReportId))
      .where(
        and(
          eq(trustPortalAccessGrants.tokenSha256, tokenSha256),
          isNull(trustPortalAccessGrants.revokedAt),
        ),
      )
      .limit(1);
    if (
      !record ||
      record.portalStatus !== 'published' ||
      record.currentPublicationId !== record.publicationId ||
      record.publicationRevokedAt ||
      record.reportStatus !== 'signed' ||
      record.reportRevokedAt ||
      !record.pdfStorageKey ||
      record.expiresAt <= now ||
      record.downloadCount >= record.maxDownloads ||
      !trustPortalSnapshotIsPublic(record.snapshot, now) ||
      !trustPortalSnapshotMatchesHash(record.snapshot, record.snapshotSha256)
    ) {
      return null;
    }

    const [consumed] = await tx
      .update(trustPortalAccessGrants)
      .set({
        downloadCount: sql`${trustPortalAccessGrants.downloadCount} + 1`,
        lastDownloadedAt: now,
      })
      .where(
        and(
          eq(trustPortalAccessGrants.id, record.grantId),
          eq(trustPortalAccessGrants.downloadCount, record.downloadCount),
          isNull(trustPortalAccessGrants.revokedAt),
        ),
      )
      .returning({ id: trustPortalAccessGrants.id });
    if (!consumed) return null;

    await tx.insert(auditLog).values({
      tenantId: record.tenantId,
      engagementId: record.engagementId,
      actorType: 'system',
      actorUserAgent: request.headers.get('user-agent'),
      action: 'trust_portal.artefact_download',
      resourceType: 'trust_portal_access_grant',
      resourceId: record.grantId,
      afterJson: {
        publicationId: record.publicationId,
        downloadNumber: record.downloadCount + 1,
        visitorFingerprint: ipFingerprint,
      } as never,
    });
    return record.pdfStorageKey;
  });
  if (!key) return unavailable();

  const url = await presignDownload({ key, expiresIn: 60 });
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function unavailable() {
  return new Response('This controlled download link is invalid, expired, revoked, or fully used.', {
    status: 410,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
