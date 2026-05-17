import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  integer,
  uniqueIndex,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';

// BetterAuth core tables. Column names match BetterAuth defaults so the
// adapter does not need a custom mapping. UUID v7 is generated in the
// application layer (BetterAuth + a uuidv7 helper); the DB default is a
// fallback for direct inserts (seeds, migrations).
const uuidv7 = () => uuid('id').primaryKey().defaultRandom();

export const users = pgTable(
  'users',
  {
    id: uuidv7(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name'),
    image: text('image'),
    // Australian English: title fields are user-set, so no language enforcement.
    // Set on first login after acceptance of the data-handling terms.
    dataHandlingAcceptedAt: timestamp('data_handling_accepted_at', { withTimezone: true }),
    // Hard requirement (section 5): MFA mandatory for assessor-side users.
    // `mfaEnforcedAt` is set when the user first joins an assessor tenant; auth
    // middleware blocks further access until a second factor is registered.
    mfaEnforcedAt: timestamp('mfa_enforced_at', { withTimezone: true }),
    mfaEnrolledAt: timestamp('mfa_enrolled_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

// Linked credential/oauth providers. BetterAuth manages writes.
export const accounts = pgTable(
  'accounts',
  {
    id: uuidv7(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('accounts_provider_account_uq').on(t.providerId, t.accountId),
    index('accounts_user_idx').on(t.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuidv7(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    // Session length enforced in BetterAuth config: 8h assessor, 4h client,
    // 12h absolute. Stored here so middleware can short-circuit.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    // Device trust (section 5): remember device for 30d after MFA.
    trustedDeviceId: uuid('trusted_device_id'),
    // Active tenant for this session. Set when the user picks a tenant via the
    // command palette; RBAC lookups derive from this.
    activeTenantId: uuid('active_tenant_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_uq').on(t.token),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

// Used for email verification, password resets, and magic-link invitations
// (section 9.2). `purpose` distinguishes them so a single-purpose token cannot
// be reused for another flow.
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuidv7(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    purpose: text('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('verification_tokens_identifier_idx').on(t.identifier),
    index('verification_tokens_value_idx').on(t.value),
  ],
);

// TOTP enrolment from BetterAuth twoFactor plugin. Secret stored encrypted at
// rest via pgcrypto at the application layer.
export const twoFactor = pgTable(
  'two_factor',
  {
    id: uuidv7(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('two_factor_user_uq').on(t.userId)],
);

// WebAuthn credentials from BetterAuth passkey plugin.
export const passkeys = pgTable(
  'passkeys',
  {
    id: uuidv7(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    credentialId: text('credential_id').notNull(),
    counter: integer('counter').notNull().default(0),
    deviceType: text('device_type'),
    backedUp: boolean('backed_up').notNull().default(false),
    transports: text('transports'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('passkeys_credential_uq').on(t.credentialId),
    index('passkeys_user_idx').on(t.userId),
  ],
);

// Failed-login lockout state (section 5: 5 attempts, 15min cool-off).
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuidv7(),
    identifier: text('identifier').notNull(),
    ipAddress: text('ip_address'),
    succeeded: boolean('succeeded').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('login_attempts_identifier_idx').on(t.identifier),
    index('login_attempts_occurred_idx').on(t.occurredAt),
  ],
);

// Per-tenant IP allowlist (section 5). Each row is a CIDR. Empty set means
// "any IP".
export const tenantIpAllowlist = pgTable(
  'tenant_ip_allowlist',
  {
    id: uuidv7(),
    tenantId: uuid('tenant_id').notNull(),
    cidr: text('cidr').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [index('tenant_ip_allowlist_tenant_idx').on(t.tenantId)],
);

// Trusted device records (section 5: remember device for 30d after MFA).
export const trustedDevices = pgTable(
  'trusted_devices',
  {
    id: uuidv7(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    label: text('label'),
    fingerprint: text('fingerprint').notNull(),
    lastSeenIp: text('last_seen_ip'),
    metadata: jsonb('metadata'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('trusted_devices_user_idx').on(t.userId),
    uniqueIndex('trusted_devices_user_fingerprint_uq').on(t.userId, t.fingerprint),
  ],
);
