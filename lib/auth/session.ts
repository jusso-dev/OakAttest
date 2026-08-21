import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AsyncLocalStorage } from 'node:async_hooks';
import { auth } from './auth';

export type MachineActor = {
  id: string;
  email: string;
  name: string | null;
};

const machineActorStorage = new AsyncLocalStorage<MachineActor>();

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

export async function requireSession() {
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
        activeTenantId: null,
      },
    } as unknown as NonNullable<Awaited<ReturnType<typeof getSession>>>;
  }
  const session = await getSession();
  if (!session) {
    throw new AuthRequiredAtRouteError();
  }
  return session;
}

export async function requirePageSession() {
  const session = await getSession();
  if (!session) redirect('/signin');
  return session;
}

export class AuthRequiredAtRouteError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredAtRouteError';
  }
}
