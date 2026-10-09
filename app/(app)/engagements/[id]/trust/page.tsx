import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { certificationReports } from '@/db/schema/certification';
import {
  trustPortalAccessGrants,
  trustPortalAccessRequests,
  trustPortalPublications,
  trustPortals,
} from '@/db/schema/trust-portal';
import { requireEngagementPage } from '@/lib/auth/engagement-access';
import { userTimeZone } from '@/lib/auth/user-timezone';
import { requirePermission, rolesForUser } from '@/lib/rbac/require';
import { ACTIONS, isPermitted } from '@/lib/rbac/matrix';
import { formatDateInput } from '@/lib/timezone';
import { TrustPortalManager } from '@/components/trust/TrustPortalManager';

export default async function TrustPortalManagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session } = await requireEngagementPage(id);
  const [engagement] = await db
    .select({ tenantId: engagements.tenantId, name: engagements.name })
    .from(engagements)
    .where(eq(engagements.id, id))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.trustPortalView, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: id,
  });

  const [roles, timeZone, [portal], reports] = await Promise.all([
    rolesForUser({ userId: session.user.id, tenantId: engagement.tenantId, engagementId: id }),
    userTimeZone(session.user.id),
    db
      .select()
      .from(trustPortals)
      .where(and(eq(trustPortals.engagementId, id), eq(trustPortals.tenantId, engagement.tenantId)))
      .limit(1),
    db
      .select({
        id: certificationReports.id,
        version: certificationReports.version,
        signedAt: certificationReports.signedAt,
        snapshot: certificationReports.snapshot,
      })
      .from(certificationReports)
      .where(
        and(
          eq(certificationReports.engagementId, id),
          eq(certificationReports.tenantId, engagement.tenantId),
          eq(certificationReports.status, 'signed'),
          isNull(certificationReports.revokedAt),
        ),
      )
      .orderBy(desc(certificationReports.version)),
  ]);

  const [publications, requests, grants] = portal
    ? await Promise.all([
        db
          .select()
          .from(trustPortalPublications)
          .where(
            and(
              eq(trustPortalPublications.portalId, portal.id),
              eq(trustPortalPublications.tenantId, engagement.tenantId),
            ),
          )
          .orderBy(desc(trustPortalPublications.version)),
        db
          .select()
          .from(trustPortalAccessRequests)
          .where(
            and(
              eq(trustPortalAccessRequests.portalId, portal.id),
              eq(trustPortalAccessRequests.tenantId, engagement.tenantId),
            ),
          )
          .orderBy(desc(trustPortalAccessRequests.requestedAt)),
        db
          .select()
          .from(trustPortalAccessGrants)
          .where(
            and(
              eq(trustPortalAccessGrants.portalId, portal.id),
              eq(trustPortalAccessGrants.tenantId, engagement.tenantId),
            ),
          )
          .orderBy(desc(trustPortalAccessGrants.createdAt)),
      ])
    : [[], [], []];

  const canManage = roles.some((role) => isPermitted(ACTIONS.trustPortalManage, role));
  const defaultExpiry = new Date();
  defaultExpiry.setUTCDate(defaultExpiry.getUTCDate() + 90);

  return (
    <TrustPortalManager
      engagementId={id}
      engagementName={engagement.name}
      timeZone={timeZone}
      defaultExpiry={formatDateInput(defaultExpiry, timeZone)}
      canManage={canManage}
      portal={portal ? {
        ...portal,
        createdAt: portal.createdAt.toISOString(),
        updatedAt: portal.updatedAt.toISOString(),
      } : null}
      reports={reports.map((report) => ({
        id: report.id,
        version: report.version,
        signedAt: report.signedAt?.toISOString() ?? null,
        validUntil: readValidUntil(report.snapshot),
      }))}
      publications={publications.map((publication) => ({
        id: publication.id,
        version: publication.version,
        snapshotSha256: publication.snapshotSha256,
        certificationReportId: publication.certificationReportId,
        publishedAt: publication.publishedAt.toISOString(),
        expiresAt: publication.expiresAt.toISOString(),
        revokedAt: publication.revokedAt?.toISOString() ?? null,
        revokedReason: publication.revokedReason,
      }))}
      requests={requests.map((request) => ({
        id: request.id,
        requesterEmail: request.requesterEmail,
        requesterOrganisation: request.requesterOrganisation,
        purpose: request.purpose,
        status: request.status,
        decisionNotes: request.decisionNotes,
        requestedAt: request.requestedAt.toISOString(),
        decidedAt: request.decidedAt?.toISOString() ?? null,
      }))}
      grants={grants.map((grant) => ({
        id: grant.id,
        requestId: grant.requestId,
        requesterEmail: grant.requesterEmail,
        expiresAt: grant.expiresAt.toISOString(),
        maxDownloads: grant.maxDownloads,
        downloadCount: grant.downloadCount,
        createdAt: grant.createdAt.toISOString(),
        revokedAt: grant.revokedAt?.toISOString() ?? null,
      }))}
    />
  );
}

function readValidUntil(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object' || !('validUntil' in snapshot)) return null;
  const value = (snapshot as { validUntil?: unknown }).validUntil;
  return typeof value === 'string' ? value : null;
}
