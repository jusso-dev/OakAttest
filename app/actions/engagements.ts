'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import crypto from 'node:crypto';
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements, clientOrganisations, systems } from '@/db/schema/engagements';
import { clients, clientMissingFields } from '@/db/schema/clients';
import { engagementMembers } from '@/db/schema/tenants';
import { frameworkControls, engagementControls, frameworkPacks } from '@/db/schema/frameworks';
import { resolveFrameworkId, selectPreferredFrameworkPack } from '@/lib/frameworks/registry';
import { notifyEngagementWatchers } from '@/lib/engagement-watch';
import { evidenceItemControls, evidenceRequestControls } from '@/db/schema/evidence';
import { findingControls } from '@/db/schema/findings';
import { interviewControls } from '@/db/schema/interviews';
import { auditLog } from '@/db/schema/audit';
import { CLASSIFICATION_RANK, type Classification } from '@/db/schema/enums';
import { requireSession } from '@/lib/auth/session';
import { ACTIONS } from '@/lib/rbac/matrix';
import { requirePermission } from '@/lib/rbac/require';
import {
  requireCanCreateEntity,
  refreshTenantUsage,
  requireFeature,
  featureForFramework,
} from '@/lib/licensing';
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
  frameworkKey: z.string().min(1).default('ism'),
  frameworkRevision: z.string().min(1),
  // The registry client this engagement is for (selected, not freeform).
  clientId: z.string().uuid(),
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

  // Plan limit: a "business entity" is an assessment engagement.
  await requireCanCreateEntity(data.tenantId);

  const classification = data.classification as Classification;
  const classificationRank = CLASSIFICATION_RANK[classification];

  // Plan feature gate. For ISM, an OFFICIAL standard assessment is
  // Essential-Eight-grade (every plan has it) while cloud_irap or anything above
  // OFFICIAL is ISM/IRAP-grade (Enterprise `ISM` feature). Other frameworks gate
  // on their own feature (NIST → NIST, SOC 2 → SOC2, ISO → ISO27001).
  const featureFrameworkKey =
    data.frameworkKey === 'ism'
      ? data.assessmentType === 'cloud_irap' || classification !== 'OFFICIAL'
        ? 'ism'
        : 'essential-eight'
      : data.frameworkKey;
  await requireFeature(data.tenantId, featureForFramework(featureFrameworkKey));

  // The catalogue this engagement draws controls from. Only ISM ships a global
  // catalogue today; the selector defaults to it.
  const frameworkId = await resolveFrameworkId(data.frameworkKey, data.tenantId);
  const now = new Date();
  const availablePacks = await db.select({ id: frameworkPacks.id, tenantId: frameworkPacks.tenantId }).from(frameworkPacks).where(and(
    eq(frameworkPacks.frameworkId, frameworkId),
    eq(frameworkPacks.revision, data.frameworkRevision),
    eq(frameworkPacks.status, 'active'),
    or(isNull(frameworkPacks.tenantId), eq(frameworkPacks.tenantId, data.tenantId)),
    or(isNull(frameworkPacks.effectiveAt), lte(frameworkPacks.effectiveAt, now)),
    or(isNull(frameworkPacks.expiresAt), gt(frameworkPacks.expiresAt, now)),
  )).limit(2);
  const pack = selectPreferredFrameworkPack(availablePacks, data.tenantId);
  if (!pack) throw new Error('Selected framework pack is not active, current, or available to this tenant.');

  // Resolve the selected client from the registry and require complete details
  // before an engagement can start.
  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(eq(clients.id, data.clientId), eq(clients.tenantId, data.tenantId), isNull(clients.deletedAt)),
    )
    .limit(1);
  if (!client) throw new Error('Selected client not found.');
  const missing = clientMissingFields(client);
  if (missing.length > 0) {
    throw new Error(
      `Client "${client.name}" is missing ${missing.join(', ')}. Update the client record before starting an engagement.`,
    );
  }

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
      frameworkId,
      frameworkRevision: data.frameworkRevision,
      status: 'draft',
      phase: 'scoping',
      assessmentType: data.assessmentType,
      cloudProvider: data.assessmentType === 'cloud_irap' ? data.cloudProvider : 'none',
    });

    // Snapshot the client's details onto the engagement, linked back to the
    // registry client.
    await tx.insert(clientOrganisations).values({
      engagementId,
      tenantId: data.tenantId,
      clientId: client.id,
      name: client.name,
      abn: client.businessNumber ?? null,
      primaryContactName: client.primaryContactName ?? null,
      primaryContactEmail: client.primaryContactEmail ?? null,
      address: client.address ?? null,
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
      .from(frameworkControls)
      .where(
        and(
          eq(frameworkControls.frameworkId, frameworkId),
          eq(frameworkControls.revision, data.frameworkRevision),
          lte(frameworkControls.minClassificationRank, classificationRank),
          // A tenant pack is an isolated materialised catalogue. A global pack
          // uses only global rows. Never blend rows from the two revisions.
          pack.tenantId === null
            ? isNull(frameworkControls.tenantId)
            : eq(frameworkControls.tenantId, data.tenantId),
        ),
      );

    // Guard against an invalid/empty framework revision: every framework seeds
    // at least one in-scope control, so zero means the revision is wrong.
    if (applicable.length === 0) {
      throw new Error(
        'No controls found for the selected framework revision. Import the catalogue or pick a valid revision.',
      );
    }

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
        applicable.map((c) => {
          const raw = c.oscalRaw && typeof c.oscalRaw === 'object' ? c.oscalRaw as Record<string, unknown> : {};
          const defaultApplicable = typeof raw.defaultApplicable === 'boolean' ? raw.defaultApplicable : null;
          const packExcluded = defaultApplicable === false;
          const packIncluded = defaultApplicable === true || data.frameworkKey === 'fedramp' || data.frameworkKey === 'nist-800-53';
          return {
            engagementId,
            tenantId: data.tenantId,
            frameworkId,
            frameworkControlId: c.id,
            controlId: c.controlId,
            revision: c.revision,
            status: providerInheritedIds.has(c.id) || packExcluded ? ('not_applicable' as const) : ('not_started' as const),
            applicable: providerInheritedIds.has(c.id) || packExcluded ? 'no' : packIncluded ? 'yes' : null,
            applicabilityJustification: providerInheritedIds.has(c.id)
              ? `Marked not applicable for a Cloud IRAP engagement because this control appears to be inherited from the ${providerName} provider layer for PROTECTED-and-below public cloud workloads. Verify against the provider IRAP package, Cloud Controls Matrix guidance, selected services, and the assessed system boundary.`
              : packExcluded
                ? 'Excluded by the activated framework pack default. Assessor must confirm this applicability decision during scoping.'
                : null,
          };
        }),
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
        frameworkRevision: data.frameworkRevision,
        frameworkPackId: pack.id,
        controlCount: applicable.length,
        assessmentType: data.assessmentType,
        cloudProvider: data.cloudProvider,
        providerInheritedControls: providerInherited.length,
      } as never,
    });
  });

  await refreshTenantUsage(data.tenantId);
  revalidatePath('/dashboard');
  return { id: engagementId };
}

const detailsSchema = z.object({
  engagementId: z.string().uuid(),
  name: z.string().min(2).max(200),
  reference: z.string().max(60).optional(),
});

// Edit core engagement details (name, reference). Assessor-side update.
export async function updateEngagementDetails(input: z.infer<typeof detailsSchema>) {
  const session = await requireSession();
  const data = detailsSchema.parse(input);
  const [engagement] = await db
    .select({ tenantId: engagements.tenantId, name: engagements.name, reference: engagements.reference })
    .from(engagements)
    .where(and(eq(engagements.id, data.engagementId), isNull(engagements.deletedAt)))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.engagementUpdate, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(engagements)
      .set({ name: data.name, reference: data.reference ?? null, updatedAt: new Date() })
      .where(eq(engagements.id, data.engagementId));
    await tx.insert(auditLog).values({
      tenantId: engagement.tenantId,
      engagementId: data.engagementId,
      actorType: 'user',
      actorUserId: session.user.id,
      action: 'engagement.update_details',
      resourceType: 'engagement',
      resourceId: data.engagementId,
      beforeJson: { name: engagement.name, reference: engagement.reference } as never,
      afterJson: { name: data.name, reference: data.reference ?? null } as never,
    });
  });

  void notifyEngagementWatchers({
    engagementId: data.engagementId,
    tenantId: engagement.tenantId,
    actorUserId: session.user.id,
    type: 'engagement_updated',
    title: 'Engagement details updated',
    body: `Name: ${data.name}`,
  }).catch(() => {});

  revalidatePath(`/engagements/${data.engagementId}/overview`);
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function updateEngagementState(input: z.infer<typeof stateSchema>) {
  const session = await requireSession();
  const data = stateSchema.parse(input);
  const [engagement] = await db
    .select({ tenantId: engagements.tenantId, phase: engagements.phase, status: engagements.status })
    .from(engagements)
    .where(and(eq(engagements.id, data.engagementId), isNull(engagements.deletedAt)))
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
      .where(
        and(
          eq(engagements.id, data.engagementId),
          eq(engagements.tenantId, engagement.tenantId),
          isNull(engagements.deletedAt),
        ),
      );

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

  void notifyEngagementWatchers({
    engagementId: data.engagementId,
    tenantId: engagement.tenantId,
    actorUserId: session.user.id,
    type: 'engagement_updated',
    title: 'Engagement status updated',
    body: `Phase ${data.phase} · status ${data.status}`,
  }).catch(() => {});

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
    .where(and(eq(engagements.id, data.engagementId), isNull(engagements.deletedAt)))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.engagementUpdate, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
  });

  const nextControls = await db
    .select()
    .from(frameworkControls)
    .where(
      and(
        eq(frameworkControls.frameworkId, engagement.frameworkId),
        eq(frameworkControls.revision, data.toRevision),
        lte(frameworkControls.minClassificationRank, engagement.classificationRank),
        or(
          isNull(frameworkControls.tenantId),
          eq(frameworkControls.tenantId, engagement.tenantId),
        ),
      ),
    );
  if (nextControls.length === 0) throw new Error('No controls found for target revision');

  const existing = await db
    .select()
    .from(engagementControls)
    .where(
      and(
        eq(engagementControls.tenantId, engagement.tenantId),
        eq(engagementControls.engagementId, data.engagementId),
      ),
    );
  const existingByControlId = new Map(existing.map((row) => [row.controlId, row]));
  const nextByControlId = new Map(nextControls.map((row) => [row.controlId, row]));

  let updated = 0;
  let added = 0;
  let removed = 0;

  await db.transaction(async (tx) => {
    for (const next of nextControls) {
      const current = existingByControlId.get(next.controlId);
      if (current) {
        if (current.revision !== data.toRevision || current.frameworkControlId !== next.id) {
          updated += 1;
          await preserveControlLinksForRevisionMigration(tx, {
            fromIsmControlId: current.frameworkControlId,
            toIsmControlId: next.id,
          });
          await tx
            .update(engagementControls)
            .set({
              frameworkControlId: next.id,
              revision: next.revision,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(engagementControls.id, current.id),
                eq(engagementControls.tenantId, engagement.tenantId),
                eq(engagementControls.engagementId, data.engagementId),
              ),
            );
        }
      } else {
        added += 1;
        await tx.insert(engagementControls).values({
          engagementId: data.engagementId,
          tenantId: engagement.tenantId,
          frameworkId: engagement.frameworkId,
          frameworkControlId: next.id,
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
          .where(
            and(
              eq(engagementControls.id, current.id),
              eq(engagementControls.tenantId, engagement.tenantId),
              eq(engagementControls.engagementId, data.engagementId),
            ),
          );
      }
    }

    await tx
      .update(engagements)
      .set({ frameworkRevision: data.toRevision, updatedAt: new Date() })
      .where(
        and(
          eq(engagements.id, data.engagementId),
          eq(engagements.tenantId, engagement.tenantId),
          isNull(engagements.deletedAt),
        ),
      );
    await tx.insert(auditLog).values({
      tenantId: engagement.tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'engagement.ism_migrate',
      resourceType: 'engagement',
      resourceId: data.engagementId,
      beforeJson: { frameworkRevision: engagement.frameworkRevision } as never,
      afterJson: { frameworkRevision: data.toRevision, updated, added, removed, reason: data.reason } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}`);
  revalidatePath(`/engagements/${data.engagementId}/scope`);
  return { updated, added, removed };
}

async function preserveControlLinksForRevisionMigration(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  opts: { fromIsmControlId: string; toIsmControlId: string },
) {
  const [evidenceLinks, requestLinks, findingLinks, interviewLinks] = await Promise.all([
    tx
      .select({ evidenceItemId: evidenceItemControls.evidenceItemId })
      .from(evidenceItemControls)
      .where(eq(evidenceItemControls.frameworkControlId, opts.fromIsmControlId)),
    tx
      .select({ evidenceRequestId: evidenceRequestControls.evidenceRequestId })
      .from(evidenceRequestControls)
      .where(eq(evidenceRequestControls.frameworkControlId, opts.fromIsmControlId)),
    tx
      .select({ findingId: findingControls.findingId })
      .from(findingControls)
      .where(eq(findingControls.frameworkControlId, opts.fromIsmControlId)),
    tx
      .select({ interviewId: interviewControls.interviewId })
      .from(interviewControls)
      .where(eq(interviewControls.frameworkControlId, opts.fromIsmControlId)),
  ]);

  if (evidenceLinks.length > 0) {
    await tx
      .insert(evidenceItemControls)
      .values(evidenceLinks.map((link) => ({ ...link, frameworkControlId: opts.toIsmControlId })))
      .onConflictDoNothing();
  }
  if (requestLinks.length > 0) {
    await tx
      .insert(evidenceRequestControls)
      .values(requestLinks.map((link) => ({ ...link, frameworkControlId: opts.toIsmControlId })))
      .onConflictDoNothing();
  }
  if (findingLinks.length > 0) {
    await tx
      .insert(findingControls)
      .values(findingLinks.map((link) => ({ ...link, frameworkControlId: opts.toIsmControlId })))
      .onConflictDoNothing();
  }
  if (interviewLinks.length > 0) {
    await tx
      .insert(interviewControls)
      .values(interviewLinks.map((link) => ({ ...link, frameworkControlId: opts.toIsmControlId })))
      .onConflictDoNothing();
  }
}
