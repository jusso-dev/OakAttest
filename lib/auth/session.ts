import { headers } from 'next/headers';
import { auth } from './auth';

// Server-side session resolution. Pages and Server Actions call this to
// learn the current user + active tenant. Returns null if unauthenticated.
// `await headers()` is required in Next.js 16 (async request APIs).

export async function getSession() {
  const hdrs = await headers();
  return auth.api.getSession({ headers: hdrs });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new AuthRequiredAtRouteError();
  }
  return session;
}

export class AuthRequiredAtRouteError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredAtRouteError';
  }
}
