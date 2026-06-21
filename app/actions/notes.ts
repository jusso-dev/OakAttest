'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { requireSession } from '@/lib/auth/session';
import { requirePermission, rolesForUser } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { createEngagementNote, canPostToAudience } from '@/lib/engagement-notes';

const schema = z.object({
  engagementId: z.string().uuid(),
  audience: z.enum(['assessor', 'client']),
  body: z.string().min(1).max(10_000),
  mentionedUserIds: z.array(z.string().uuid()).default([]),
});

export async function postEngagementNote(input: z.infer<typeof schema>) {
  const session = await requireSession();
  const data = schema.parse(input);

  const [engagement] = await db
    .select({ tenantId: engagements.tenantId })
    .from(engagements)
    .where(and(eq(engagements.id, data.engagementId), isNull(engagements.deletedAt)))
    .limit(1);
  if (!engagement) throw new Error('Engagement not found');

  await requirePermission(ACTIONS.engagementView, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
  });

  const roles = await rolesForUser({
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId: data.engagementId,
  });
  if (!canPostToAudience(roles, data.audience)) {
    throw new Error('You do not have access to this thread.');
  }

  const note = await createEngagementNote({
    engagementId: data.engagementId,
    tenantId: engagement.tenantId,
    authorId: session.user.id,
    authorName: session.user.name ?? session.user.email,
    audience: data.audience,
    body: data.body,
    mentionedUserIds: data.mentionedUserIds,
  });

  revalidatePath(`/engagements/${data.engagementId}/overview`);
  return note;
}
