'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import { partners, partnerMembers, partnerInvitations } from '@/db/schema/partners';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { isPlatformAdmin, requirePlatformAdmin } from '@/lib/auth/platform';
import { requirePartnerRole } from '@/lib/auth/partner';
import { sendTenantInviteEmail } from '@/emails/send';

const PARTNER_ROLES = ['partner_owner', 'partner_admin'] as const;
const INVITE_TTL_MS = 1000 * 60 * 60 * 72; // 72h, matches tenant/engagement invites.

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || crypto.randomBytes(4).toString('hex')
  );
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  while (current && typeof current === 'object') {
    if ('code' in current && (current as { code: unknown }).code === '23505') {
      return true;
    }
    current = 'cause' in current ? (current as { cause: unknown }).cause : undefined;
  }
  return false;
}

function inviteUrl(token: string): string {
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  return `${baseUrl}/invite/${token}`;
}

// Authorise a partner-scoped admin action: platform superadmin, or a
// partner_owner of the partner. Returns nothing; throws on denial.
async function requirePartnerAdmin(userId: string, partnerId: string): Promise<void> {
  if (await isPlatformAdmin(userId)) return;
  await requirePartnerRole(userId, partnerId, ['partner_owner']);
}

// PLATFORM SUPERADMIN: provision a new MSP partner and invite its first owner.
// The superadmin does NOT become a member — they stay above the partner.
const provisionPartnerSchema = z.object({
  name: z.string().min(2).max(120),
  billingEmail: z.string().email().optional(),
  ownerEmail: z.string().email(),
});

export async function provisionPartner(input: z.infer<typeof provisionPartnerSchema>) {
  const session = await requireSession();
  await requirePlatformAdmin(session.user.id);
  const data = provisionPartnerSchema.parse(input);

  const partnerId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invitationId = crypto.randomUUID();
  const baseSlug = slugify(data.name);
  let slug = baseSlug;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.transaction(async (tx) => {
        await tx.insert(partners).values({
          id: partnerId,
          slug,
          name: data.name,
          billingEmail: data.billingEmail ?? null,
        });
        await tx.insert(partnerInvitations).values({
          id: invitationId,
          partnerId,
          email: data.ownerEmail.toLowerCase(),
          role: 'partner_owner',
          token,
          invitedBy: session.user.id,
          expiresAt,
        });
        await tx.insert(auditLog).values({
          actorType: 'user',
          actorUserId: session.user.id,
          action: 'partner.provisioned',
          resourceType: 'partner',
          resourceId: partnerId,
          afterJson: { name: data.name, ownerEmail: data.ownerEmail.toLowerCase() } as never,
        });
      });
      break;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      if (attempt === 4) throw new Error('That name is already taken.');
      slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
    }
  }

  const url = inviteUrl(token);
  await sendTenantInviteEmail({
    to: data.ownerEmail,
    url,
    tenantName: data.name,
    inviterName: session.user.name ?? session.user.email,
  });

  revalidatePath('/owner');
  return { partnerId, url, expiresAt: expiresAt.toISOString() };
}

// Invite an additional MSP staff member to a partner. Platform superadmin or a
// partner_owner of the partner.
const inviteMemberSchema = z.object({
  partnerId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(PARTNER_ROLES),
});

export async function invitePartnerMember(input: z.infer<typeof inviteMemberSchema>) {
  const session = await requireSession();
  const data = inviteMemberSchema.parse(input);
  await requirePartnerAdmin(session.user.id, data.partnerId);

  const [partner] = await db
    .select({ name: partners.name })
    .from(partners)
    .where(and(eq(partners.id, data.partnerId), isNull(partners.deletedAt)))
    .limit(1);
  if (!partner) throw new Error('Partner not found');

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const invitationId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(partnerInvitations).values({
      id: invitationId,
      partnerId: data.partnerId,
      email: data.email.toLowerCase(),
      role: data.role,
      token,
      invitedBy: session.user.id,
      expiresAt,
    });
    await tx.insert(auditLog).values({
      actorType: 'user',
      actorUserId: session.user.id,
      action: 'partner.invite',
      resourceType: 'partner_invitation',
      resourceId: invitationId,
      afterJson: { partnerId: data.partnerId, email: data.email.toLowerCase(), role: data.role } as never,
    });
  });

  const url = inviteUrl(token);
  await sendTenantInviteEmail({
    to: data.email,
    url,
    tenantName: partner.name,
    inviterName: session.user.name ?? session.user.email,
  });

  revalidatePath('/owner');
  revalidatePath('/partner');
  return { id: invitationId, url, expiresAt: expiresAt.toISOString() };
}

// Accept a partner invitation. The signed-in user joins the partner as the
// invited MSP role.
const acceptSchema = z.object({ token: z.string().min(8) });

export async function acceptPartnerInvitation(input: z.infer<typeof acceptSchema>) {
  const session = await requireSession();
  const { token } = acceptSchema.parse(input);

  const [invitation] = await db
    .select()
    .from(partnerInvitations)
    .where(eq(partnerInvitations.token, token))
    .limit(1);
  if (!invitation) throw new Error('Invitation not found');
  if (invitation.revokedAt) throw new Error('Invitation has been revoked');
  if (invitation.acceptedAt) throw new Error('Invitation already accepted');
  if (invitation.expiresAt < new Date()) throw new Error('Invitation has expired');

  if (invitation.email.toLowerCase() !== (session.user.email ?? '').toLowerCase()) {
    throw new Error('This invitation is addressed to a different email');
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(partnerMembers)
      .values({
        partnerId: invitation.partnerId,
        userId: session.user.id,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.createdAt,
        joinedAt: new Date(),
      })
      .onConflictDoNothing();
    await tx
      .update(partnerInvitations)
      .set({ acceptedAt: new Date(), acceptedBy: session.user.id })
      .where(eq(partnerInvitations.id, invitation.id));
    await tx.insert(auditLog).values({
      actorType: 'user',
      actorUserId: session.user.id,
      action: 'partner.invite.accept',
      resourceType: 'partner_invitation',
      resourceId: invitation.id,
    });
  });

  return { partnerId: invitation.partnerId };
}

const revokeSchema = z.object({
  partnerId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

export async function revokePartnerInvitation(input: z.infer<typeof revokeSchema>) {
  const session = await requireSession();
  const data = revokeSchema.parse(input);
  await requirePartnerAdmin(session.user.id, data.partnerId);

  await db
    .update(partnerInvitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(partnerInvitations.id, data.invitationId),
        eq(partnerInvitations.partnerId, data.partnerId),
        isNull(partnerInvitations.acceptedAt),
      ),
    );

  revalidatePath('/owner');
  revalidatePath('/partner');
  return { ok: true };
}
