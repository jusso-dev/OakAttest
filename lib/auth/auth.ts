import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { passkey } from '@better-auth/passkey';
import { admin, haveIBeenPwned, magicLink, oAuthProxy, twoFactor } from 'better-auth/plugins';
import crypto from 'node:crypto';
import { db } from '@/lib/db/client';
import {
  accounts,
  passkeys,
  sessions,
  twoFactor as twoFactorTable,
  users,
  verificationTokens,
} from '@/db/schema/auth';
import { auditLog } from '@/db/schema/audit';
import { sendMagicLinkEmail, sendPasswordResetEmail } from '@/emails/send';
import { emailHasOpenInvite } from '@/lib/auth/open-invite';
import { isPublicSignupEnabled } from '@/lib/auth/signup-policy';

// BetterAuth configuration per spec §5.
//
// MFA: TOTP + backup codes. Password sign-in is challenged by the twoFactor
// plugin. Magic-link verify is challenged by the after hook below, because
// the plugin matcher only covers /sign-in/email|username|phone-number.
// Magic link: client invites. 72h expiry, single-use. Account creation stays
// tied to public signup; invite-only password signup uses the before hook.
// HaveIBeenPwned: 14-char password minimum + k-anonymity check.
// admin: platform impersonation. Starts are written to audit_log.
//
// Sessions: 8h idle, 12h absolute (`sessions.absoluteExpiresAt`).
// Passkeys: @better-auth/passkey 1.7.1. Column credential_id is mapped as
// credentialID to match the plugin field name.

const secret = process.env.BETTER_AUTH_SECRET ?? 'dev-insecure-please-set-BETTER_AUTH_SECRET';
const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000;

export const auth = betterAuth({
  secret,
  baseURL,
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: false,
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verificationTokens,
      twoFactor: twoFactorTable,
      passkey: passkeys,
    },
  }),

  emailAndPassword: {
    enabled: true,
    // Public page redirects when signup is closed. The before hook allows an
    // invitee to create a password account. Magic link stays closed.
    disableSignUp: false,
    minPasswordLength: 14,
    maxPasswordLength: 256,
    autoSignIn: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ to: user.email, url });
    },
  },

  session: {
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 60,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
    additionalFields: {
      absoluteExpiresAt: {
        type: 'date',
        required: false,
        input: false,
      },
    },
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

  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const current = session as { absoluteExpiresAt?: Date | string | null };
          const absoluteExpiresAt = current.absoluteExpiresAt
            ? new Date(current.absoluteExpiresAt)
            : new Date(Date.now() + ABSOLUTE_SESSION_MS);
          return { data: { ...session, absoluteExpiresAt } };
        },
        after: async (session) => {
          const impersonatedBy = session.impersonatedBy as string | null | undefined;
          if (!impersonatedBy) return;
          await db.insert(auditLog).values({
            actorUserId: impersonatedBy,
            action: 'auth.impersonate',
            resourceType: 'session',
            resourceId: session.id,
            afterJson: {
              userId: session.userId,
              impersonatedBy,
            },
          });
        },
      },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-up/email') return;
      if (isPublicSignupEnabled()) return;
      const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
      if (await emailHasOpenInvite(email)) return;
      throw APIError.from('FORBIDDEN', {
        message: 'Sign-up is invite only.',
        code: 'SIGNUP_INVITE_ONLY',
      });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/magic-link/verify') return;
      const data = ctx.context.newSession;
      if (!data?.user.twoFactorEnabled) return;

      const maxAge = 600;
      const twoFactorCookie = ctx.context.createAuthCookie('two_factor', { maxAge });
      const identifier = `2fa-${crypto.randomBytes(12).toString('hex')}`;
      const expiresAt = new Date(Date.now() + maxAge * 1000);
      await ctx.context.internalAdapter.deleteSession(data.session.token);
      ctx.context.setNewSession(null);
      const sessionCookie = ctx.context.authCookies.sessionToken;
      ctx.setCookie(sessionCookie.name, '', { ...sessionCookie.attributes, maxAge: 0 });
      await ctx.context.internalAdapter.createVerificationValue({
        value: data.user.id,
        identifier,
        expiresAt,
      });
      await ctx.context.internalAdapter.createVerificationValue({
        value: '0',
        identifier: `2fa-attempts-${identifier}`,
        expiresAt,
      });
      await ctx.setSignedCookie(
        twoFactorCookie.name,
        identifier,
        ctx.context.secret,
        twoFactorCookie.attributes,
      );
      throw ctx.redirect(`${ctx.context.baseURL}/mfa/challenge`);
    }),
  },

  plugins: [
    twoFactor({
      issuer: 'OakAttest',
      otpOptions: { period: 30, digits: 6 },
    }),
    magicLink({
      expiresIn: 60 * 60 * 72,
      disableSignUp: !isPublicSignupEnabled(),
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, url });
      },
    }),
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        'This password has appeared in known data breaches. Choose another.',
    }),
    oAuthProxy(),
    admin(),
    passkey({
      rpName: 'OakAttest',
    }),
  ],
});

export type Auth = typeof auth;
