import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, twoFactor, haveIBeenPwned, oAuthProxy, admin } from 'better-auth/plugins';
import { db } from '@/lib/db/client';
import { sendMagicLinkEmail } from '@/emails/send';

// BetterAuth configuration per spec §5.
//
// MFA: TOTP + backup codes (twoFactor plugin). It is optional for now and
//   encouraged in the first-run/admin flow.
// Magic link: used for client invites (§9.2). 72h expiry, single-use.
// HaveIBeenPwned: 14-char password minimum + k-anonymity check (§5).
// oAuthProxy: scaffolded for future SSO.
// admin: tenant-level admin actions (suspend, impersonate audit, etc.).
//
// Sessions:
//   Default 8h. Client users can be shortened later after role-aware session
//   creation lands.
//   sign-in time by reading the user's tenant memberships and setting the
//   session expiry accordingly via `customSession` (added in milestone 2).
//   Absolute cap 12h enforced by the middleware against
//   `sessions.absoluteExpiresAt`.
//
// Passkeys: planned but the better-auth 1.6 passkey plugin ships in a
// separate package; deferred to a follow-up commit. UI affordances will land
// alongside that work.

const secret = process.env.BETTER_AUTH_SECRET ?? 'dev-insecure-please-set-BETTER_AUTH_SECRET';
const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

export const auth = betterAuth({
  secret,
  baseURL,
  database: drizzleAdapter(db, { provider: 'pg', usePlural: true }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 14,
    maxPasswordLength: 256,
    autoSignIn: true,
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 60,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
  },

  advanced: {
    database: { generateId: 'uuid' },
    cookies: { session_token: { attributes: { sameSite: 'lax' } } },
  },

  plugins: [
    twoFactor({
      issuer: 'OakAttest',
      otpOptions: { period: 30, digits: 6 },
    }),
    magicLink({
      expiresIn: 60 * 60 * 72,
      disableSignUp: false,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, url });
      },
    }),
    haveIBeenPwned({ customPasswordCompromisedMessage: 'This password has appeared in known data breaches. Choose another.' }),
    oAuthProxy(),
    admin(),
  ],
});

export type Auth = typeof auth;
