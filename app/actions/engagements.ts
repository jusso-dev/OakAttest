'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import crypto from 'node:crypto';
import { and, eq, lte } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements, clientOrganisations, systems } from '@/db/schema/engagements';
import { engagementMembers } from '@/db/schema/tenants';
import { ismControls, engagementControls } from '@/db/schema/ism';
import { auditLog } from '@/db/schema/audit';
import { CLASSIFICATION_RANK, type Classification } from '@/db/schema/enums';
import { requireSession } from '@/lib/auth/session';
import { ACTIONS } from '@/lib/rbac/matrix';
import { requirePermission } from '@/lib/rbac/require';
import { isValidAbn, normalizeAbn } from '@/lib/abn';
import {
  CLOUD_PROVIDERS,
  ASSESSMENT_TYPES,
  canUseProtectedCloudInheritance,
  cloudProviderLabel,
  isCloudProviderInheritedControl,
} from '@/lib/irap/cloud-scope';

const createSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(2).max(200),
  reference: z.string().max(60).optional(),
  classification: z.enum(['OFFICIAL', 'OFFICIAL_SENSITIVE', 'PROTECTED', 'SECRET', 'TOP_SECRET']),
  assessmentType: z.enum(ASSESSMENT_TYPES).default('standard'),
  cloudProvider: z.enum(CLOUD_PROVIDERS).default('none'),
  ismRevision: z.string().min(1),
  clientOrganisation: z.object({
    name: z.string().min(2),
    abn: z.preprocess(
      (value) => (typeof value === 'string' ? value : ''),
      z
        .string()
        .transform(normalizeAbn)
        .refine((value) => value === '' || isValidAbn(value), 'Enter a valid ABN')
        .transform((value) => value || undefined),
    ),
    primaryContactName: z.string().optional(),
    primaryContactEmail: z.string().email().optional(),
  }),
  system: z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    environment: z.string().optional(),
  }),
});

const stateSchema = z.object({
  engagementId: z.string().uuid(),
  phase: z.enum([
    'scoping',
    'evidence',
    'fieldwork',
    'findings',
    'certification',
    'maintenance',
  ]),
  status: z.enum(['draft', 'active', 'on_hold', 'completed', 'archived']),
});

const migrateIsmSchema = z.object({
  engagementId: z.string().uuid(),
  toRevision: z.string().min(1),
  reason: z.string().min(10).max(4000),
});

export async function createEngagement(input: z.infer<typeof createSchema>) {
  const session = await requireSession();
  const data = createSchema.parse(input);

  await requirePermission(ACTIONS.engagementCreate, {
    userId: session.user.id,
    tenantId: data.tenantId,
  });

  const classification = data.classification as Classification;
  const classificationRank = CLASSIFICATION_RANK[classification];
  const engagementId = crypto.randomUUID();
  const hdrs = await headers();

  await db.transaction(async (tx) => {
    await tx.insert(engagements).values({
      id: engagementId,
      tenantId: data.tenantId,
      name: data.name,
      reference: data.reference ?? null,
      classification,
      classificationRank,
      ismRevision: data.ismRevision,
      status: 'draft',
      phase: 'scoping',
      assessmentType: data.assessmentType,
      cloudProvider: data.assessmentType === 'cloud_irap' ? data.cloudProvider : 'none',
    });

    await tx.insert(clientOrganisations).values({
      engagementId,
      tenantId: data.tenantId,
      name: data.clientOrganisation.name,
      abn: data.clientOrganisation.abn ?? null,
      primaryContactName: data.clientOrganisation.primaryContactName ?? null,
      primaryContactEmail: data.clientOrganisation.primaryContactEmail ?? null,
    });

    await tx.insert(systems).values({
      engagementId,
      tenantId: data.tenantId,
      name: data.system.name,
      description: data.system.description ?? null,
      environment: data.system.environment ?? null,
      classification,
    });

    // Auto-populate engagement_controls. Cumulative inclusion (§3, §8): all
    // controls whose min_classification_rank <= engagement.classification_rank
    // at the pinned ISM revision.
    const applicable = await tx
      .select()
      .from(ismControls)
      .where(
        and(
          eq(ismControls.revision, data.ismRevision),
          lte(ismControls.minClassificationRank, classificationRank),
        ),
      );

    const cloudInheritanceEnabled = canUseProtectedCloudInheritance(
      data.assessmentType,
      data.cloudProvider,
      classification,
    );
    const providerInherited = cloudInheritanceEnabled
      ? applicable.filter(isCloudProviderInheritedControl)
      : [];
    const providerInheritedIds = new Set(providerInherited.map((control) => control.id));
    const providerName = cloudProviderLabel(data.cloudProvider);

    if (applicable.length > 0) {
      await tx.insert(engagementControls).values(
        applicable.map((c) => ({
          engagementId,
          tenantId: data.tenantId,
          ismControlId: c.id,
          controlId: c.controlId,
          revision: c.revision,
          status: providerInheritedIds.has(c.id) ? ('not_applicable' as const) : ('not_started' as const),
          applicable: providerInheritedIds.has(c.id) ? 'no' : null,
          applicabilityJustification: providerInheritedIds.has(c.id)
            ? `Marked not applicable for a Cloud IRAP engagement because this control appears to be inherited from the ${providerName} provider layer for PROTECTED-and-below public cloud workloads. Verify against the provider IRAP package, Cloud Controls Matrix guidance, selected services, and the assessed system boundary.`
            : null,
        })),
      );
    }

    // The creator joins the engagement as lead_assessor by default.
    await tx.insert(engagementMembers).values({
      engagementId,
      tenantId: data.tenantId,
      userId: session.user.id,
      role: 'lead_assessor',
      joinedAt: new Date(),
    });

    await tx.insert(auditLog).values({
      tenantId: data.tenantId,
      engagementId,
      actorType: 'user',
      actorUserId: session.user.id,
      actorIp: hdrs.get('x-forwarded-for'),
      actorUserAgent: hdrs.get('user-agent'),
      action: 'engagement.create',
      resourceType: 'engagement',
      resourceId: engagementId,
      afterJson: {
        name: data.name,
        classification,
        ismRevision: data.ismRevision,
        controlCount: applicable.length,
        assessmentType: data.assessmentType,
        cloudProvider: data.cloudProvider,
        providerInheritedControls: providerInherited.length,
      } as never,
    });
  });

  revalidatePath('/dashboard');
  return { id: engagementId };
}

export async function updateEngagementState(input: z.infer<typeof stateSchema>) {
  const session = await requireSession();
  const data = stateSchema.parse(input);
  const [engagement] = await db
    .select({ tenantId: engagements.tenantId, phase: engagements.phase, status: engagements.status })
    .from(engagements)
    .where(eq(engagements.id, data.engagementId))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.engagementUpdate, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
  });

  const hdrs = await headers();
  await db.transaction(async (tx) => {
    await tx
      .update(engagements)
      .set({
        phase: data.phase,
        status: data.status,
        updatedAt: new Date(),
      })
      .where(eq(engagements.id, data.engagementId));

    await tx.insert(auditLog).values({
      tenantId: engagement.tenantId,
      engagementId: data.engagementId,
      actorType: 'user',
      actorUserId: session.user.id,
      actorIp: hdrs.get('x-forwarded-for'),
      actorUserAgent: hdrs.get('user-agent'),
      action: 'engagement.state.update',
      resourceType: 'engagement',
      resourceId: data.engagementId,
      beforeJson: { phase: engagement.phase, status: engagement.status } as never,
      afterJson: { phase: data.phase, status: data.status } as never,
    });
  });

  revalidatePath('/dashboard');
  revalidatePath(`/engagements/${data.engagementId}`);
  revalidatePath(`/engagements/${data.engagementId}/overview`);
  return { ok: true };
}

export async function migrateEngagementIsmRevision(input: z.infer<typeof migrateIsmSchema>) {
  const session = await requireSession();
  const data = migrateIsmSchema.parse(input);
  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, data.engagementId))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.engagementUpdate, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
  });

  const nextControls = await db
    .select()
    .from(ismControls)
    .where(
      and(
        eq(ismControls.revision, data.toRevision),
        lte(ismControls.minClassificationRank, engagement.classificationRank),
      ),
    );
  if (nextControls.length === 0) throw new Error('No controls found for target revision');

  const existing = await db
    .select()
    .from(engagementControls)
    .where(eq(engagementControls.engagementId, data.engagementId));
  const existingByControlId = new Map(existing.map((row) => [row.controlId, row]));
  const nextByControlId = new Map(nextControls.map((row) => [row.controlId, row]));

  let updated = 0;
  let added = 0;
  let removed = 0;

  await db.transaction(async (tx) => {
    for (const next of nextControls) {
      const current = existingByControlId.get(next.controlId);
      if (current) {
        if (current.revision !== data.toRevision || current.ismControlId !== next.id) {
          updated += 1;
          await tx
            .update(engagementControls)
            .set({
              ismControlId: next.id,
              revision: next.revision,
              updatedAt: new Date(),
            })
            .where(eq(engagementControls.id, current.id));
        }
      } else {
        added += 1;
        await tx.insert(engagementControls).values({
          engagementId: data.engagementId,
          tenantId: engagement.tenantId,
          ismControlId: next.id,
          controlId: next.controlId,
          revision: next.revision,
        });
      }
    }

    for (const current of existing) {
      if (!nextByControlId.has(current.controlId)) {
        removed += 1;
        await tx
          .update(engagementControls)
          .set({
            status: 'not_applicable',
            applicable: 'no',
            applicabilityJustification: `Control was not present in migrated ISM revision ${data.toRevision}. Previous assessment material is retained for audit history. Migration reason: ${data.reason}`,
            updatedAt: new Date(),
          })
          .where(eq(engagementControls.id, current.id));
      }
    }

    await tx
      .update(engagements)
      .set({ ismRevision: data.toRevision, updatedAt: new Date() })
      .where(eq(engagements.id, data.engagementId));
    await tx.insert(auditLog).values({
      tenantId: engagement.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'engagement.ism_migrate',
      resourceType: 'engagement',
      resourceId: data.engagementId,
      beforeJson: { ismRevision: engagement.ismRevision } as never,
      afterJson: { ismRevision: data.toRevision, updated, added, removed, reason: data.reason } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}`);
  revalidatePath(`/engagements/${data.engagementId}/scope`);
  return { updated, added, removed };
}
