'use server';

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import { partners, partnerMembers } from '@/db/schema/partners';
import { tenants } from '@/db/schema/tenants';
import { subscriptions } from '@/db/schema/subscriptions';
import { plans } from '@/db/schema/plans';
import { auditLog } from '@/db/schema/audit';
import { requireSession } from '@/lib/auth/session';
import { requirePartnerRole } from '@/lib/auth/partner';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { classifyPlanChange } from '@/lib/licensing';
import { transitionSubscription } from '@/lib/billing/transitions';
import { isValidAbn, normalizeAbn } from '@/lib/abn';

const PLAN_CODES = ['ESSENTIAL', 'PROFESSIONAL', 'ENTERPRISE'] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const abnField = z.preprocess(
  (value) => (typeof value === 'string' ? value : ''),
  z
    .string()
    .transform(normalizeAbn)
    .refine((value) => value === '' || isValidAbn(value), 'Enter a valid ABN')
    .transform((value) => value || undefined),
);

// Create an MSP partner. Any authenticated user may found a partner and becomes
// its first partner_owner (mirrors `createTenant`). For the manual-onboarding
// model, the host runs this on behalf of the MSP.
const createPartnerSchema = z.object({
  name: z.string().min(2).max(120),
  billingEmail: z.string().email().optional(),
});

export async function createPartner(input: z.infer<typeof createPartnerSchema>) {
  const session = await requireSession();
  const data = createPartnerSchema.parse(input);
  const slug = slugify(data.name) || crypto.randomBytes(4).toString('hex');
  const partnerId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(partners).values({
      id: partnerId,
      slug,
      name: data.name,
      billingEmail: data.billingEmail ?? null,
    });
    await tx.insert(partnerMembers).values({
      partnerId,
      userId: session.user.id,
      role: 'partner_owner',
      joinedAt: new Date(),
    });
  });

  revalidatePath('/partner');
  return { id: partnerId, slug };
}

// Create a client tenant under a partner, optionally on a plan.
const createClientTenantSchema = z.object({
  partnerId: z.string().uuid(),
  name: z.string().min(2).max(120),
  abn: abnField,
  planCode: z.enum(PLAN_CODES).optional(),
});

export async function createClientTenant(input: z.infer<typeof createClientTenantSchema>) {
  const session = await requireSession();
  const data = createClientTenantSchema.parse(input);
  await requirePartnerRole(session.user.id, data.partnerId, ['partner_owner', 'partner_admin']);

  const slug = slugify(data.name) || crypto.randomBytes(4).toString('hex');
  const tenantId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(tenants).values({
      id: tenantId,
      partnerId: data.partnerId,
      slug,
      name: data.name,
      abn: data.abn ?? null,
    });

    if (data.planCode) {
      const [plan] = await tx
        .select({ code: plans.code })
        .from(plans)
        .where(eq(plans.code, data.planCode))
        .limit(1);
      if (plan) {
        await tx.insert(subscriptions).values({
          tenantId,
          planId: data.planCode,
          status: 'active',
          externalProvider: 'manual',
          effectiveStartAt: new Date(),
        });
      }
    }

    await tx.insert(auditLog).values({
      tenantId,
      actorType: 'user',
      actorUserId: session.user.id,
      action: 'tenant.provisioned',
      resourceType: 'tenant',
      resourceId: tenantId,
      afterJson: { name: data.name, partnerId: data.partnerId, plan: data.planCode ?? null } as never,
    });
  });

  revalidatePath('/partner');
  return { id: tenantId, slug };
}

// Assign or change a tenant's plan. Permitted for the tenant owner OR a partner
// owner of the tenant's partner (mapped to tenant_owner by rolesForUser).
const setTenantPlanSchema = z.object({
  tenantId: z.string().uuid(),
  planCode: z.enum(PLAN_CODES),
});

export async function setTenantPlan(input: z.infer<typeof setTenantPlanSchema>) {
  const session = await requireSession();
  const data = setTenantPlanSchema.parse(input);

  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  const [plan] = await db
    .select({ code: plans.code, name: plans.name })
    .from(plans)
    .where(eq(plans.code, data.planCode))
    .limit(1);
  if (!plan) throw new Error('Unknown plan');

  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, data.tenantId))
    .limit(1);

  await db.transaction(async (tx) => {
    if (!existing) {
      const subId = crypto.randomUUID();
      await tx.insert(subscriptions).values({
        id: subId,
        tenantId: data.tenantId,
        planId: data.planCode,
        status: 'active',
        externalProvider: 'manual',
        effectiveStartAt: new Date(),
      });
      await tx.insert(auditLog).values({
        tenantId: data.tenantId,
        actorType: 'user',
        actorUserId: session.user.id,
        action: 'subscription.created',
        resourceType: 'subscription',
        resourceId: subId,
        afterJson: { planId: data.planCode } as never,
      });
    } else {
      const kind = classifyPlanChange(existing.planId, data.planCode);
      await tx
        .update(subscriptions)
        .set({ planId: data.planCode, updatedAt: new Date() })
        .where(eq(subscriptions.tenantId, data.tenantId));
      await tx.insert(auditLog).values({
        tenantId: data.tenantId,
        actorType: 'user',
        actorUserId: session.user.id,
        // upgraded | downgraded | (unchanged → plan_changed)
        action: kind === 'unchanged' ? 'subscription.plan_changed' : `subscription.${kind}`,
        resourceType: 'subscription',
        resourceId: existing.id,
        beforeJson: { planId: existing.planId } as never,
        afterJson: { planId: data.planCode } as never,
      });
    }
  });

  revalidatePath('/admin/subscription');
  revalidatePath('/partner');
  return { ok: true };
}

// Subscription lifecycle controls (manual). Each transition is audited inside
// `transitionSubscription` as `subscription.<status>`.
const lifecycleSchema = z.object({ tenantId: z.string().uuid() });

export async function suspendTenantSubscription(input: z.infer<typeof lifecycleSchema>) {
  const session = await requireSession();
  const data = lifecycleSchema.parse(input);
  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });
  await transitionSubscription({
    tenantId: data.tenantId,
    toStatus: 'suspended',
    actorUserId: session.user.id,
    actorType: 'user',
    graceEndsAt: null,
  });
  revalidatePath('/admin/subscription');
  revalidatePath('/partner');
  return { ok: true };
}

export async function cancelTenantSubscription(input: z.infer<typeof lifecycleSchema>) {
  const session = await requireSession();
  const data = lifecycleSchema.parse(input);
  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });
  await transitionSubscription({
    tenantId: data.tenantId,
    toStatus: 'cancelled',
    actorUserId: session.user.id,
    actorType: 'user',
  });
  revalidatePath('/admin/subscription');
  revalidatePath('/partner');
  return { ok: true };
}

export async function reinstateTenantSubscription(input: z.infer<typeof lifecycleSchema>) {
  const session = await requireSession();
  const data = lifecycleSchema.parse(input);
  await requirePermission(ACTIONS.tenantManage, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });
  await transitionSubscription({
    tenantId: data.tenantId,
    toStatus: 'active',
    actorUserId: session.user.id,
    actorType: 'user',
  });
  revalidatePath('/admin/subscription');
  revalidatePath('/partner');
  return { ok: true };
}
