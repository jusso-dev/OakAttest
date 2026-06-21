'use server';

import { z } from 'zod';
import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import {
  tenants,
  tenantMembers,
  tenantInvitations,
} from '@/db/schema/tenants';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { ACTIONS, isPermitted, type Role } from '@/lib/rbac/matrix';
import { PermissionDeniedError, requirePermission } from '@/lib/rbac/require';
import { requireCanCreateUser, refreshTenantUsage } from '@/lib/licensing';
import { recordAudit } from '@/lib/audit/log';
import { sendTenantInviteEmail } from '@/emails/send';
import { writeActiveTenantCookie } from '@/lib/auth/active-tenant';
import { isValidAbn, normalizeAbn } from '@/lib/abn';

// Slugify a tenant name for the URL. Strict: only ASCII lowercase + dashes.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const createSchema = z.object({
  name: z.string().min(2).max(120),
  abn: z.preprocess(
    (value) => (typeof value === 'string' ? value : ''),
    z
      .string()
      .transform(normalizeAbn)
      .refine((value) => value === '' || isValidAbn(value), 'Enter a valid ABN')
      .transform((value) => value || undefined),
  ),
});

export async function createTenant(input: z.infer<typeof createSchema>) {
  const session = await requireSession();
  const data = createSchema.parse(input);

  // Anyone with an authenticated session can found a new tenant (becomes the
  // tenant_owner). RBAC kicks in for subsequent actions.
  const slug = slugify(data.name) || crypto.randomBytes(4).toString('hex');

  const tenantId = crypto.randomUUID();
  const hdrs = await headers();

  await db.transaction(async (tx) => {
    await tx.insert(tenants).values({
      id: tenantId,
      slug,
      name: data.name,
      abn: data.abn ?? null,
    });
    await tx.insert(tenantMembers).values({
      tenantId,
      userId: session.user.id,
      role: 'tenant_owner',
      joinedAt: new Date(),
    });
    await tx.insert(auditLog).values({
      tenantId,
      actorType: 'user',
      actorUserId: session.user.id,
      actorIp: hdrs.get('x-forwarded-for'),
      actorUserAgent: hdrs.get('user-agent'),
      action: 'tenant.create',
      resourceType: 'tenant',
      resourceId: tenantId,
      afterJson: { name: data.name, slug } as never,
    });
  });

  await writeActiveTenantCookie(tenantId);
  revalidatePath('/dashboard');
  return { id: tenantId, slug };
}

const inviteSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['tenant_owner', 'assessor_admin']),
});

const securityPolicySchema = z.object({
  tenantId: z.string().uuid(),
  mfaMode: z.enum(['optional', 'assessor_required', 'all_users_required']),
  mfaGracePeriodDays: z.number().int().min(0).max(30).default(0),
});

const compliancePolicySchema = z.object({
  tenantId: z.string().uuid(),
  dueSoonDays: z.number().int().min(1).max(365),
  reassessmentMonths: z.object({
    OFFICIAL: z.number().int().min(1).max(120),
    OFFICIAL_SENSITIVE: z.number().int().min(1).max(120),
    PROTECTED: z.number().int().min(1).max(120),
    SECRET: z.number().int().min(1).max(120),
    TOP_SECRET: z.number().int().min(1).max(120),
  }),
});

export async function updateTenantSecurityPolicy(input: z.infer<typeof securityPolicySchema>) {
  const session = await requireSession();
  const data = securityPolicySchema.parse(input);

  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(tenants)
      .set({
        securityPolicy: {
          mfaMode: data.mfaMode,
          mfaGracePeriodDays: data.mfaGracePeriodDays,
        } as never,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, data.tenantId));
    await tx.insert(auditLog).values({
      tenantId: data.tenantId,
      actorUserId: session.user.id,
      action: 'tenant.security_policy.update',
      resourceType: 'tenant',
      resourceId: data.tenantId,
      afterJson: { mfaMode: data.mfaMode, mfaGracePeriodDays: data.mfaGracePeriodDays } as never,
    });
  });

  revalidatePath('/admin');
  return { ok: true };
}

export async function updateTenantCompliancePolicy(input: z.infer<typeof compliancePolicySchema>) {
  const session = await requireSession();
  const data = compliancePolicySchema.parse(input);

  // Writing the compliance policy is a tenant-management action, not a read.
  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(tenants)
      .set({
        compliancePolicy: {
          dueSoonDays: data.dueSoonDays,
          reassessmentMonths: data.reassessmentMonths,
        } as never,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, data.tenantId));
    await tx.insert(auditLog).values({
      tenantId: data.tenantId,
      actorUserId: session.user.id,
      action: 'tenant.compliance_policy.update',
      resourceType: 'tenant',
      resourceId: data.tenantId,
      afterJson: {
        dueSoonDays: data.dueSoonDays,
        reassessmentMonths: data.reassessmentMonths,
      } as never,
    });
  });

  revalidatePath('/admin/compliance');
  return { ok: true };
}

export async function inviteTenantMember(input: z.infer<typeof inviteSchema>) {
  const session = await requireSession();
  const data = inviteSchema.parse(input);
  const email = data.email.toLowerCase();

  await requirePermission(ACTIONS.tenantInvite, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  // Plan seat limit — early signal so admins don't over-invite past the cap.
  await requireCanCreateUser(data.tenantId);

  // Only an owner can invite another owner.
  if (data.role === 'tenant_owner') {
    const roles = await rolesForTenant(session.user.id, data.tenantId);
    if (!roles.includes('tenant_owner')) {
      throw new PermissionDeniedError(
        ACTIONS.tenantInvite,
        'only tenant owners can invite owners',
      );
    }
  }

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, data.tenantId))
    .limit(1);
  if (!tenant) throw new Error('Tenant not found');

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 72);
  const hdrs = await headers();
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  const url = `${baseUrl}/invite/${token}`;

  await db.transaction(async (tx) => {
    await tx.insert(tenantInvitations).values({
      tenantId: data.tenantId,
      email,
      role: data.role,
      token,
      invitedBy: session.user.id,
      expiresAt,
    });
    await tx.insert(auditLog).values({
      tenantId: data.tenantId,
      actorType: 'user',
      actorUserId: session.user.id,
      actorIp: hdrs.get('x-forwarded-for'),
      actorUserAgent: hdrs.get('user-agent'),
      action: 'tenant.invite',
      resourceType: 'tenant_invitation',
      afterJson: { email, role: data.role } as never,
    });
  });

  await sendTenantInviteEmail({
    to: email,
    url,
    tenantName: tenant.name,
    inviterName: session.user.name ?? session.user.email,
  });

  await recordAudit({
    tenantId: data.tenantId,
    actorUserId: session.user.id,
    action: 'tenant.invite.email_queued',
    resourceType: 'tenant_invitation',
  });

  return { token, url, expiresAt: expiresAt.toISOString() };
}

async function rolesForTenant(userId: string, tenantId: string): Promise<Role[]> {
  const rows = await db.query.tenantMembers.findMany({
    where: (m, { and, eq, isNull }) =>
      and(eq(m.userId, userId), eq(m.tenantId, tenantId), isNull(m.deletedAt)),
  });
  return rows.map((r) => r.role as Role);
}

// Re-export the helper so the rbac role check uses the same code path the
// permission test exercises.
export { isPermitted };

// Count active tenant_owner members — used to prevent removing/demoting the
// last owner, which would orphan the tenant.
async function activeOwnerCount(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.role, 'tenant_owner'),
        isNull(tenantMembers.deletedAt),
      ),
    );
  return row?.value ?? 0;
}

const changeRoleSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['tenant_owner', 'assessor_admin']),
});

export async function changeTenantMemberRole(input: z.infer<typeof changeRoleSchema>) {
  const session = await requireSession();
  const data = changeRoleSchema.parse(input);
  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  const [member] = await db
    .select({ role: tenantMembers.role })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, data.tenantId),
        eq(tenantMembers.userId, data.userId),
        isNull(tenantMembers.deletedAt),
      ),
    )
    .limit(1);
  if (!member) throw new Error('Member not found');
  if (member.role === data.role) return { ok: true };

  // Don't demote the last owner.
  if (member.role === 'tenant_owner' && data.role !== 'tenant_owner') {
    if ((await activeOwnerCount(data.tenantId)) <= 1) {
      throw new Error('Cannot demote the last tenant owner. Promote another owner first.');
    }
  }

  await db
    .update(tenantMembers)
    .set({ role: data.role })
    .where(
      and(
        eq(tenantMembers.tenantId, data.tenantId),
        eq(tenantMembers.userId, data.userId),
        isNull(tenantMembers.deletedAt),
      ),
    );
  await recordAudit({
    tenantId: data.tenantId,
    actorUserId: session.user.id,
    action: 'tenant.member.role_change',
    resourceType: 'tenant_member',
    resourceId: data.userId,
    beforeJson: { role: member.role },
    afterJson: { role: data.role },
  });
  revalidatePath('/admin');
  return { ok: true };
}

const removeMemberSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function removeTenantMember(input: z.infer<typeof removeMemberSchema>) {
  const session = await requireSession();
  const data = removeMemberSchema.parse(input);
  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  const [member] = await db
    .select({ role: tenantMembers.role })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, data.tenantId),
        eq(tenantMembers.userId, data.userId),
        isNull(tenantMembers.deletedAt),
      ),
    )
    .limit(1);
  if (!member) throw new Error('Member not found');
  if (member.role === 'tenant_owner' && (await activeOwnerCount(data.tenantId)) <= 1) {
    throw new Error('Cannot remove the last tenant owner. Assign another owner first.');
  }

  await db
    .update(tenantMembers)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(tenantMembers.tenantId, data.tenantId),
        eq(tenantMembers.userId, data.userId),
        isNull(tenantMembers.deletedAt),
      ),
    );
  // Drop their engagement memberships in this tenant too.
  await recordAudit({
    tenantId: data.tenantId,
    actorUserId: session.user.id,
    action: 'tenant.member.remove',
    resourceType: 'tenant_member',
    resourceId: data.userId,
    beforeJson: { role: member.role },
  });
  await refreshTenantUsage(data.tenantId);
  revalidatePath('/admin');
  return { ok: true };
}
