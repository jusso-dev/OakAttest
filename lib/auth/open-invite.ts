import { and, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagementInvitations } from '@/db/schema/invitations';
import { partnerInvitations } from '@/db/schema/partners';
import { tenantInvitations } from '@/db/schema/tenants';

export async function emailHasOpenInvite(email: string): Promise<boolean> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return false;
  const now = new Date();
  const [tenantInvite, engagementInvite, partnerInvite] = await Promise.all([
    db
      .select({ id: tenantInvitations.id })
      .from(tenantInvitations)
      .where(
        and(
          sql`lower(${tenantInvitations.email}) = ${normalised}`,
          isNull(tenantInvitations.acceptedAt),
          isNull(tenantInvitations.revokedAt),
          gt(tenantInvitations.expiresAt, now),
        ),
      )
      .limit(1),
    db
      .select({ id: engagementInvitations.id })
      .from(engagementInvitations)
      .where(
        and(
          sql`lower(${engagementInvitations.email}) = ${normalised}`,
          isNull(engagementInvitations.acceptedAt),
          isNull(engagementInvitations.revokedAt),
          gt(engagementInvitations.expiresAt, now),
        ),
      )
      .limit(1),
    db
      .select({ id: partnerInvitations.id })
      .from(partnerInvitations)
      .where(
        and(
          sql`lower(${partnerInvitations.email}) = ${normalised}`,
          isNull(partnerInvitations.acceptedAt),
          isNull(partnerInvitations.revokedAt),
          gt(partnerInvitations.expiresAt, now),
        ),
      )
      .limit(1),
  ]);
  return tenantInvite.length + engagementInvite.length + partnerInvite.length > 0;
}
