'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { requireSession } from '@/lib/auth/session';
import { requirePermission } from '@/lib/rbac/require';
import { ACTIONS } from '@/lib/rbac/matrix';
import { watchEngagement, unwatchEngagement } from '@/lib/engagement-watch';

const schema = z.object({ engagementId: z.string().uuid(), watch: z.boolean() });

export async function toggleEngagementWatch(input: z.infer<typeof schema>) {
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

  if (data.watch) {
    await watchEngagement(data.engagementId, session.user.id);
  } else {
    await unwatchEngagement(data.engagementId, session.user.id);
  }
  revalidatePath(`/engagements/${data.engagementId}/overview`);
  return { ok: true, watching: data.watch };
}
