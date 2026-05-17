'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { engagementInvitations } from '@/db/schema/invitations';
import { tenantInvitations, engagementMembers, tenantMembers } from '@/db/schema/tenants';
import { engagements } from '@/db/schema/engagements';
import { tenants } from '@/db/schema/tenants';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { sendEngagementInviteEmail } from '@/emails/send';

const inviteSchema = z.object({
  engagementId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum([
    'lead_assessor',
    'assessor',
    'client_admin',
    'client_contributor',
    'read_only_observer',
  ]),
});

export async function inviteToEngagement(input: z.infer<typeof inviteSchema>) {
  const session = await requireSession();
  const data = inviteSchema.parse(input);
  const [engagement] = await db
    .select({
      tenantId: engagements.tenantId,
      name: engagements.name,
    })
    .from(engagements)
    .where(eq(engagements.id, data.engagementId))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.engagementInvite, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
  });

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 72);
  const id = crypto.randomUUID();
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  const url = `${baseUrl}/invite/${token}`;

  await db.transaction(async (tx) => {
    await tx.insert(engagementInvitations).values({
      id,
      engagementId: data.engagementId,
      tenantId: engagement.tenantId,
      email: data.email.toLowerCase(),
      role: data.role,
      token,
      invitedBy: session.user.id,
      expiresAt,
    });
    await tx.insert(auditLog).values({
      tenantId: engagement.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'engagement.invite',
      resourceType: 'engagement_invitation',
      resourceId: id,
      afterJson: { email: data.email.toLowerCase(), role: data.role } as never,
    });
  });

  await sendEngagementInviteEmail({
    to: data.email,
    url,
    engagementName: engagement.name,
    inviterName: session.user.name ?? session.user.email,
  });

  revalidatePath(`/engagements/${data.engagementId}`);
  return { id, url, expiresAt: expiresAt.toISOString() };
}

const acceptSchema = z.object({ token: z.string().min(8) });

export async function acceptEngagementInvitation(input: z.infer<typeof acceptSchema>) {
  const session = await requireSession();
  const { token } = acceptSchema.parse(input);

  const [invitation] = await db
    .select()
    .from(engagementInvitations)
    .where(eq(engagementInvitations.token, token))
    .limit(1);
  if (!invitation) throw new Error('Invitation not found');
  if (invitation.revokedAt) throw new Error('Invitation has been revoked');
  if (invitation.acceptedAt) throw new Error('Invitation already accepted');
  if (invitation.expiresAt < new Date()) throw new Error('Invitation has expired');

  if (
    session.user.email &&
    invitation.email.toLowerCase() !== session.user.email.toLowerCase()
  ) {
    throw new Error('This invitation is addressed to a different email');
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(engagementMembers)
      .values({
        engagementId: invitation.engagementId,
        tenantId: invitation.tenantId,
        userId: session.user.id,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.createdAt,
        joinedAt: new Date(),
      })
      .onConflictDoNothing();
    await tx
      .update(engagementInvitations)
      .set({ acceptedAt: new Date(), acceptedBy: session.user.id })
      .where(eq(engagementInvitations.id, invitation.id));
    await tx.insert(auditLog).values({
      tenantId: invitation.tenantId,
      engagementId: invitation.engagementId,
      actorUserId: session.user.id,
      action: 'engagement.invite.accept',
      resourceType: 'engagement_invitation',
      resourceId: invitation.id,
    });
  });

  return { engagementId: invitation.engagementId };
}

const acceptTenantSchema = z.object({ token: z.string().min(8) });

export async function acceptTenantInvitation(input: z.infer<typeof acceptTenantSchema>) {
  const session = await requireSession();
  const { token } = acceptTenantSchema.parse(input);

  const [invitation] = await db
    .select()
    .from(tenantInvitations)
    .where(eq(tenantInvitations.token, token))
    .limit(1);
  if (!invitation) throw new Error('Invitation not found');
  if (invitation.revokedAt) throw new Error('Invitation has been revoked');
  if (invitation.acceptedAt) throw new Error('Invitation already accepted');
  if (invitation.expiresAt < new Date()) throw new Error('Invitation has expired');

  await db.transaction(async (tx) => {
    await tx
      .insert(tenantMembers)
      .values({
        tenantId: invitation.tenantId,
        userId: session.user.id,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.createdAt,
        joinedAt: new Date(),
      })
      .onConflictDoNothing();
    await tx
      .update(tenantInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(tenantInvitations.id, invitation.id));
    await tx.insert(auditLog).values({
      tenantId: invitation.tenantId,
      actorUserId: session.user.id,
      action: 'tenant.invite.accept',
      resourceType: 'tenant_invitation',
      resourceId: invitation.id,
    });
  });

  return { tenantId: invitation.tenantId };
}

// Look up the invitation (used by the invite-accept page to render details).
export async function getInvitationDetails(token: string) {
  const [eng] = await db
    .select({
      engagementId: engagementInvitations.engagementId,
      tenantId: engagementInvitations.tenantId,
      email: engagementInvitations.email,
      role: engagementInvitations.role,
      expiresAt: engagementInvitations.expiresAt,
      acceptedAt: engagementInvitations.acceptedAt,
      revokedAt: engagementInvitations.revokedAt,
    })
    .from(engagementInvitations)
    .where(eq(engagementInvitations.token, token))
    .limit(1);
  if (eng) {
    const [engagement] = await db
      .select({ name: engagements.name })
      .from(engagements)
      .where(eq(engagements.id, eng.engagementId))
      .limit(1);
    const [tenant] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, eng.tenantId))
      .limit(1);
    return {
      ...eng,
      kind: 'engagement' as const,
      engagementName: engagement?.name,
      tenantName: tenant?.name,
    };
  }
  const [ten] = await db
    .select()
    .from(tenantInvitations)
    .where(eq(tenantInvitations.token, token))
    .limit(1);
  if (ten) {
    const [tenant] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, ten.tenantId))
      .limit(1);
    return { kind: 'tenant' as const, ...ten, tenantName: tenant?.name };
  }
  return null;
}

// Tenant admin can also send a magic-link sign-in to a colleague who is
// already on the platform but in a different account.
const resendSchema = z.object({ tenantId: z.string().uuid(), invitationId: z.string().uuid() });

export async function revokeTenantInvitation(input: z.infer<typeof resendSchema>) {
  const session = await requireSession();
  const data = resendSchema.parse(input);
  await requirePermission(ACTIONS.tenantInvite, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });
  await db
    .update(tenantInvitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(tenantInvitations.id, data.invitationId),
        eq(tenantInvitations.tenantId, data.tenantId),
        isNull(tenantInvitations.acceptedAt),
      ),
    );
  return { ok: true };
}
