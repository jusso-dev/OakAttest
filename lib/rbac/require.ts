import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tenantMembers, engagementMembers } from '@/db/schema/tenants';
import { partnerRoleForTenant } from '@/lib/auth/partner';
import { isPlatformAdmin } from '@/lib/auth/platform';
import {
  type Action,
  type Role,
  isPermitted,
  partnerRoleToTenantRole,
} from './matrix';
import { resolveEntitlement, type Entitlement } from '@/lib/billing/entitlement';
import { MUTATING_ACTIONS } from '@/lib/billing/actions';

export class PermissionDeniedError extends Error {
  constructor(public action: Action, public reason: string) {
    super(`Permission denied for ${action}: ${reason}`);
    this.name = 'PermissionDeniedError';
  }
}

export class SubscriptionBlockedError extends Error {
  constructor(public action: Action, public entitlement: Entitlement) {
    super(
      `Subscription gate blocked ${action}: ${entitlement.reason}`,
    );
    this.name = 'SubscriptionBlockedError';
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

  // Partner (MSP) members get effective management of every client tenant under
  // their partner. Map the partner role to a standard tenant role so the matrix
  // and the IRAP independence guard apply unchanged. Additive only.
  if (!roles.includes('tenant_owner')) {
    const partnerRole = await partnerRoleForTenant(ctx.userId, ctx.tenantId);
    if (partnerRole) {
      const mapped = partnerRoleToTenantRole(partnerRole);
      if (!roles.includes(mapped)) roles.push(mapped);
    }
  }

  // The platform superadmin (host/owner) has full tenant-owner access to every
  // tenant — they administer the whole instance.
  if (!roles.includes('tenant_owner') && (await isPlatformAdmin(ctx.userId))) {
    roles.push('tenant_owner');
  }

  if (ctx.engagementId) {
    const engagementRow = await db
      .select({ role: engagementMembers.role })
      .from(engagementMembers)
      .where(
        and(
          eq(engagementMembers.tenantId, ctx.tenantId),
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
//
// Mutating actions also pass through the subscription entitlement gate
// (`lib/billing/entitlement.ts`). Reads never hit the gate. Self-installed
// deployments (no subscription row) are treated as `allow` and never gated.
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

  if (MUTATING_ACTIONS.has(action)) {
    const entitlement = await resolveEntitlement(ctx.tenantId);
    if (entitlement.state === 'block') {
      throw new SubscriptionBlockedError(action, entitlement);
    }
  }

  return roles;
}
