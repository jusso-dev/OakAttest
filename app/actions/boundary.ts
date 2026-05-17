'use server';

import { z } from 'zod';
import { and, eq, desc, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import {
  systemBoundaries,
  boundaryChangeRequests,
} from '@/db/schema/boundaries';
import { engagements } from '@/db/schema/engagements';
import { auditLog } from '@/db/schema/audit';
import { boundaryGraphSchema } from '@/lib/boundary/schema';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';

async function tenantForEngagement(engagementId: string): Promise<string> {
  const [row] = await db
    .select({ tenantId: engagements.tenantId, lockedAt: engagements.boundaryLockedAt })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) throw new Error('Engagement not found');
  return row.tenantId;
}

const saveSchema = z.object({
  engagementId: z.string().uuid(),
  graph: boundaryGraphSchema,
  note: z.string().max(2000).optional(),
});

// Save a new boundary draft. If the engagement boundary is locked,
// requesters must go via `proposeBoundaryChange` instead.
export async function saveBoundaryDraft(input: z.infer<typeof saveSchema>) {
  const session = await requireSession();
  const data = saveSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.scopeUpdate, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const [active] = await db
    .select()
    .from(systemBoundaries)
    .where(
      and(
        eq(systemBoundaries.engagementId, data.engagementId),
        isNull(systemBoundaries.supersededAt),
      ),
    )
    .orderBy(desc(systemBoundaries.version))
    .limit(1);

  if (active?.locked) {
    throw new Error('Boundary is locked. Raise a change request instead.');
  }

  const nextVersion = (active?.version ?? 0) + 1;

  await db.transaction(async (tx) => {
    if (active) {
      await tx
        .update(systemBoundaries)
        .set({ supersededAt: new Date() })
        .where(eq(systemBoundaries.id, active.id));
    }
    await tx.insert(systemBoundaries).values({
      engagementId: data.engagementId,
      tenantId,
      version: nextVersion,
      graph: data.graph,
      note: data.note ?? null,
      createdBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'boundary.save',
      resourceType: 'system_boundary',
      afterJson: { version: nextVersion, nodes: data.graph.nodes.length, edges: data.graph.edges.length } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}/scope`);
  return { version: nextVersion };
}

const lockSchema = z.object({
  engagementId: z.string().uuid(),
});

export async function lockBoundary(input: z.infer<typeof lockSchema>) {
  const session = await requireSession();
  const data = lockSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.engagementLockBoundary, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const [active] = await db
    .select()
    .from(systemBoundaries)
    .where(
      and(
        eq(systemBoundaries.engagementId, data.engagementId),
        isNull(systemBoundaries.supersededAt),
      ),
    )
    .orderBy(desc(systemBoundaries.version))
    .limit(1);

  if (!active) throw new Error('No boundary to lock');
  if (active.locked) return { alreadyLocked: true };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(systemBoundaries)
      .set({ locked: true, lockedAt: now, lockedBy: session.user.id })
      .where(eq(systemBoundaries.id, active.id));
    await tx
      .update(engagements)
      .set({ boundaryLockedAt: now, phase: 'evidence', status: 'active' })
      .where(eq(engagements.id, data.engagementId));
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'boundary.lock',
      resourceType: 'system_boundary',
      resourceId: active.id,
      afterJson: { version: active.version } as never,
    });
  });

  revalidatePath(`/engagements/${data.engagementId}`);
  return { locked: true, version: active.version };
}

const proposeSchema = z.object({
  engagementId: z.string().uuid(),
  proposedGraph: boundaryGraphSchema,
  rationale: z.string().min(10).max(4000),
  impactAnalysis: z.string().max(4000).optional(),
});

export async function proposeBoundaryChange(input: z.infer<typeof proposeSchema>) {
  const session = await requireSession();
  const data = proposeSchema.parse(input);
  const tenantId = await tenantForEngagement(data.engagementId);

  await requirePermission(ACTIONS.scopeUpdate, {
    userId: session.user.id,
    tenantId,
    engagementId: data.engagementId,
  });

  const [active] = await db
    .select()
    .from(systemBoundaries)
    .where(
      and(
        eq(systemBoundaries.engagementId, data.engagementId),
        isNull(systemBoundaries.supersededAt),
      ),
    )
    .orderBy(desc(systemBoundaries.version))
    .limit(1);
  if (!active) throw new Error('No baseline boundary to amend');

  await db.transaction(async (tx) => {
    await tx.insert(boundaryChangeRequests).values({
      engagementId: data.engagementId,
      tenantId,
      baseBoundaryId: active.id,
      proposedGraph: data.proposedGraph,
      rationale: data.rationale,
      impactAnalysis: data.impactAnalysis ?? null,
      raisedBy: session.user.id,
    });
    await tx.insert(auditLog).values({
      tenantId,
      engagementId: data.engagementId,
      actorUserId: session.user.id,
      action: 'boundary.change_request',
      resourceType: 'boundary_change_request',
    });
  });

  return { ok: true };
}
