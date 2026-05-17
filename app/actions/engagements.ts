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

const createSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(2).max(200),
  reference: z.string().max(60).optional(),
  classification: z.enum(['OFFICIAL', 'OFFICIAL_SENSITIVE', 'PROTECTED', 'SECRET', 'TOP_SECRET']),
  ismRevision: z.string().min(1),
  clientOrganisation: z.object({
    name: z.string().min(2),
    abn: z.string().regex(/^\d{11}$/).optional().or(z.literal('').transform(() => undefined)),
    primaryContactName: z.string().optional(),
    primaryContactEmail: z.string().email().optional(),
  }),
  system: z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    environment: z.string().optional(),
  }),
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

    if (applicable.length > 0) {
      await tx.insert(engagementControls).values(
        applicable.map((c) => ({
          engagementId,
          tenantId: data.tenantId,
          ismControlId: c.id,
          controlId: c.controlId,
          revision: c.revision,
          status: 'not_started' as const,
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
      } as never,
    });
  });

  revalidatePath('/dashboard');
  return { id: engagementId };
}
