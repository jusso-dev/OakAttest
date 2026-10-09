import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AsyncLocalStorage } from 'node:async_hooks';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sessions, users } from '@/db/schema/auth';
import { tenantMembers, tenants } from '@/db/schema/tenants';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { shouldRequireMfaEnrollment, type MfaPolicy } from '@/lib/auth/mfa-policy';
import type { Role } from '@/lib/rbac/matrix';
import { auth } from './auth';

export const ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000;

export type MachineActor = {
  id: string;
  email: string;
  name: string | null;
  tenantId: string;
};

const machineActorStorage = new AsyncLocalStorage<MachineActor>();

export function getMachineActor(): MachineActor | undefined {
  return machineActorStorage.getStore();
}

// MCP tools reuse the same domain actions as the UI. The machine principal is
// held in request-local async context so concurrent requests cannot leak an
// actor into one another. Only server-side code can enter this context.
export function runWithMachineActor<T>(actor: MachineActor, task: () => Promise<T>): Promise<T> {
  return machineActorStorage.run(actor, task);
}

// Server-side session resolution. Pages and Server Actions call this to
// learn the current user + active tenant. Returns null if unauthenticated.
// `await headers()` is required in Next.js 16 (async request APIs).

export async function getSession() {
  const hdrs = await headers();
  return auth.api.getSession({ headers: hdrs });
}

export async function requireSession(options?: { skipPolicy?: boolean }) {
  const machineActor = machineActorStorage.getStore();
  if (machineActor) {
    return {
      user: {
        id: machineActor.id,
        email: machineActor.email,
        name: machineActor.name,
      },
      session: {
        id: `mcp:${machineActor.id}`,
        userId: machineActor.id,
        activeTenantId: machineActor.tenantId,
      },
    } as unknown as NonNullable<Awaited<ReturnType<typeof getSession>>>;
  }
  const session = await getSession();
  if (!session) {
    throw new AuthRequiredAtRouteError();
  }
  if (!options?.skipPolicy) {
    await assertHumanSessionPolicy(session.user.id, session.session.id);
  }
  return session;
}

export async function assertHumanSessionPolicy(userId: string, sessionId: string) {
  const [row] = await db
    .select({
      absoluteExpiresAt: sessions.absoluteExpiresAt,
      accepted: users.dataHandlingAcceptedAt,
      twoFactorEnabled: users.twoFactorEnabled,
      mfaEnrolledAt: users.mfaEnrolledAt,
      mfaEnforcedAt: users.mfaEnforcedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  if (!row) throw new AuthRequiredAtRouteError();
  if (row.absoluteExpiresAt.getTime() <= Date.now()) {
    throw new SessionPolicyError('Session exceeded the 12 hour absolute limit.');
  }
  if (!row.accepted) {
    throw new SessionPolicyError('Accept the data-handling terms before continuing.');
  }
  const tenant = await resolveActiveTenant(userId);
  if (!tenant) return;
  const [security, memberships] = await Promise.all([
    db
      .select({ securityPolicy: tenants.securityPolicy })
      .from(tenants)
      .where(eq(tenants.id, tenant.tenantId))
      .limit(1),
    db
      .select({ role: tenantMembers.role })
      .from(tenantMembers)
      .where(
        and(
          eq(tenantMembers.userId, userId),
          eq(tenantMembers.tenantId, tenant.tenantId),
          isNull(tenantMembers.deletedAt),
        ),
      ),
  ]);
  if (
    shouldRequireMfaEnrollment({
      roles: memberships.map((membership) => membership.role as Role),
      policy: (security[0]?.securityPolicy ?? null) as MfaPolicy | null,
      enrolledAt: row.mfaEnrolledAt,
      twoFactorEnabled: row.twoFactorEnabled,
      enforcedAt: row.mfaEnforcedAt,
    })
  ) {
    throw new SessionPolicyError('Enrol multi-factor authentication before continuing.');
  }
}

export async function requirePageSession() {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof SessionPolicyError) {
      if (error.message.includes('terms')) redirect('/terms');
      if (error.message.includes('multi-factor')) redirect('/mfa?next=/dashboard');
      redirect('/signin');
    }
    if (error instanceof AuthRequiredAtRouteError) redirect('/signin');
    throw error;
  }
}

export class AuthRequiredAtRouteError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredAtRouteError';
  }
}

export class SessionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionPolicyError';
  }
}
