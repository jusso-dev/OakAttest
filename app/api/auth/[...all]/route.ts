import { auth } from '@/lib/auth/auth';
import { toNextJsHandler } from 'better-auth/next-js';

// BetterAuth catch-all route. All flows (sign in, sign up, magic link, 2FA,
// session checks) route through here.
export const { GET, POST } = toNextJsHandler(auth.handler);
