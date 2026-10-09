'use client';

import { createAuthClient } from 'better-auth/react';
import { passkeyClient } from '@better-auth/passkey/client';
import { magicLinkClient, twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? '',
  plugins: [
    magicLinkClient(),
    twoFactorClient({ twoFactorPage: '/mfa/challenge' }),
    passkeyClient(),
  ],
});

export const { signIn, signUp, signOut, useSession } = authClient;
