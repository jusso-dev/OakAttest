import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenantMembers, engagementMembers } from '@/db/schema/tenants';
import {
  type Action,
  type Role,
  isPermitted,
} from './matrix';

export class PermissionDeniedError extends Error {
  constructor(public action: Action, public reason: string) {
    super(`Permission denied for ${action}: ${reason}`);
    this.name = 'PermissionDeniedError';
  }
}

export class AuthRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredError';
  }
}

export type AuthContext = {
  userId: string;
  // Optional. When set, permission checks search engagement_members first,
  // then fall back to tenant_members for tenant-scoped actions.
  engagementId?: string;
  tenantId: string;
};

// Returns the roles the user holds in the current tenant/engagement context.
// One user can hold a tenant role and an engagement role simultaneously; both
// are considered when checking permission.
export async function rolesForUser(ctx: AuthContext): Promise<Role[]> {
  const roles: Role[] = [];

  const tenantRow = await db
    .select({ role: tenantMembers.role })
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.tenantId, ctx.tenantId),
        eq(tenantMembers.userId, ctx.userId),
        isNull(tenantMembers.deletedAt),
      ),
    )
    .limit(1);
  if (tenantRow[0]) roles.push(tenantRow[0].role as Role);

  if (ctx.engagementId) {
    const engagementRow = await db
      .select({ role: engagementMembers.role })
      .from(engagementMembers)
      .where(
        and(
          eq(engagementMembers.engagementId, ctx.engagementId),
          eq(engagementMembers.userId, ctx.userId),
          isNull(engagementMembers.deletedAt),
        ),
      )
      .limit(1);
    if (engagementRow[0]) roles.push(engagementRow[0].role as Role);
  }

  return roles;
}

// Server-side enforcement gate. Use in every Server Action and Route Handler.
//
//   await requirePermission(ACTIONS.findingCreate, {
//     userId: session.user.id,
//     tenantId: session.activeTenantId,
//     engagementId: input.engagementId,
//   });
//
// Throws on denial. Callers should let the error propagate so the route
// renders a 403; do not swallow.
export async function requirePermission(action: Action, ctx: AuthContext): Promise<Role[]> {
  if (!ctx.userId) throw new AuthRequiredError();
  const roles = await rolesForUser(ctx);
  if (roles.length === 0) {
    throw new PermissionDeniedError(action, 'no membership in tenant/engagement');
  }
  const allowed = roles.some((r) => isPermitted(action, r));
  if (!allowed) {
    throw new PermissionDeniedError(
      action,
      `no role among [${roles.join(', ')}] permits this action`,
    );
  }
  return roles;
}
