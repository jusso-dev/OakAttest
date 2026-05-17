'use server';

import { z } from 'zod';
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
import { recordAudit } from '@/lib/audit/log';

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
  abn: z.string().regex(/^\d{11}$/).optional().or(z.literal('').transform(() => undefined)),
});

export async function createTenant(input: z.infer<typeof createSchema>) {
  const session = await requireSession();
  const data = createSchema.parse(input);

  // Anyone with a verified session can found a new tenant (becomes the
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

  revalidatePath('/dashboard');
  return { id: tenantId, slug };
}

const inviteSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['tenant_owner', 'assessor_admin']),
});

export async function inviteTenantMember(input: z.infer<typeof inviteSchema>) {
  const session = await requireSession();
  const data = inviteSchema.parse(input);

  await requirePermission(ACTIONS.tenantInvite, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

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

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 72);
  const hdrs = await headers();

  await db.transaction(async (tx) => {
    await tx.insert(tenantInvitations).values({
      tenantId: data.tenantId,
      email: data.email.toLowerCase(),
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
      afterJson: { email: data.email, role: data.role } as never,
    });
  });

  await recordAudit({
    tenantId: data.tenantId,
    actorUserId: session.user.id,
    action: 'tenant.invite.email_queued',
    resourceType: 'tenant_invitation',
  });

  return { token, expiresAt: expiresAt.toISOString() };
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
