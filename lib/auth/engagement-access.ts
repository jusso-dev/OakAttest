import { notFound } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { engagements } from '@/db/schema/engagements';
import { ACTIONS, type Action } from '@/lib/rbac/matrix';
import { PermissionDeniedError, requirePermission } from '@/lib/rbac/require';
import { getMachineActor, requireSession } from '@/lib/auth/session';

export async function requireEngagementAccess(
  engagementId: string,
  action: Action = ACTIONS.engagementView,
) {
  const session = await requireSession();
  const [engagement] = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.id, engagementId), isNull(engagements.deletedAt)))
    .limit(1);
  if (!engagement) {
    throw new PermissionDeniedError(action, 'engagement not found');
  }
  const machine = getMachineActor();
  if (machine?.tenantId && machine.tenantId !== engagement.tenantId) {
    throw new PermissionDeniedError(action, 'MCP token is bound to a different tenant');
  }
  await requirePermission(action, {
    userId: session.user.id,
    tenantId: engagement.tenantId,
    engagementId,
  });
  return { session, engagement };
}

export async function requireEngagementPage(
  engagementId: string,
  action: Action = ACTIONS.engagementView,
) {
  try {
    return await requireEngagementAccess(engagementId, action);
  } catch (error) {
    if (error instanceof PermissionDeniedError) notFound();
    throw error;
  }
}
