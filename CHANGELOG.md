# Changelog

## Unreleased

### Added — milestone 1

**Foundation**

- Next.js 16 canary scaffold (Tailwind v4, App Router, ESLint) with the
  directory layout from spec §14.
- Drizzle schema for the milestone-1 domain: auth (BetterAuth core + two
  factor + passkey + trusted devices + IP allowlist), tenants and members,
  engagements + client_organisations + systems, ISM controls catalogue with
  engagement controls, append-only audit log.
- Initial migration generated (`db/migrations/0000_initial.sql`).
- Post-migration SQL hook enforces audit-log invariant via DB role
  separation + trigger blocking UPDATE/DELETE.
- Architecture, RBAC, ISM mapping, and infrastructure docs.

**Auth (item 1)**

- BetterAuth with twoFactor (TOTP + backup codes), magicLink (72h, single
  use, used for client invites), haveIBeenPwned (14-char minimum + breach
  check), oAuthProxy (SSO scaffolding), and admin plugins.
- `lib/auth/auth.ts` server config, `lib/auth/client.ts` React client,
  `lib/auth/session.ts` server-side session resolver, `lib/auth/active-tenant.ts`
  for the per-session active tenant cookie.
- Routes: `/sign-in`, `/sign-up`, `/mfa` (TOTP enrolment with backup codes).
- `/api/auth/[...all]` catch-all route handler.
- `proxy.ts` (Next.js 16 renamed middleware) enforces session presence and
  the MFA-required gate; full DB-driven enforcement happens in the app
  layout where DB queries are available.
- Passkey deferred: better-auth 1.6 ships passkey as a separate package
  that is not in milestone-1 scope per §13. Tracked in CHANGELOG.

**Tenants + RBAC (item 2)**

- `lib/rbac/matrix.ts` is the single source of truth for permission rules:
  every action is keyed against the roles allowed to perform it, including
  the IRAP independence guard which bars assessor-side roles from any
  `remediation_guidance:*` action.
- `lib/rbac/require.ts` exposes `requirePermission(action, ctx)` used in
  every Server Action and layout. Throws `PermissionDeniedError` /
  `AuthRequiredError` on denial.
- `lib/audit/log.ts` writes append-only audit rows.
- `app/actions/tenants.ts` — `createTenant`, `inviteTenantMember`.
- `app/actions/engagements.ts` — `createEngagement` (auto-populates
  `engagement_controls` by the cumulative classification rule).

**ISM ingestion (item 3)**

- `lib/ism/oscal.ts` — Zod-validated OSCAL 1.1 parser; preserves the raw
  control as `oscal_raw` JSONB; classification extracted from props with
  fallbacks; statement and guidance extracted from parts; Essential Eight
  mappings extracted from props where present.
- `lib/ism/import.ts` — idempotent upsert keyed on `(control_id, revision)`.
- `scripts/ism-import.ts` — CLI (`npm run ism:import`) supporting
  `--file`/`--url` and `ISM_OSCAL_URL` for pinned releases.
- `db/seed/index.ts` + `db/seed/ism-sample.json` — bundled subset for
  offline seeding (`npm run db:seed`).

**App shell (items 4, 8, 9, 10)**

- Sidebar shell (`components/AppShell.tsx`) with dashboard / engagements /
  audit / admin nav.
- `/dashboard` lists tenant engagements.
- `/engagements/[id]/{overview,scope,evidence,fieldwork,findings,certification}`
  sub-routes with the five-phase stepper at the top.
- `/admin` (members + data residency, billing stub).
- `/admin/audit` audit-log viewer with action/actor filters.
- Coming-soon scaffolds for the milestone-2/3 sub-routes per §13.

**Tests**

- `__tests__/rbac/matrix.test.ts` — 6 tests including the independence-guard
  programmatic check.
- `__tests__/ism/oscal.test.ts` — 6 tests covering parser, iterator,
  classification extraction, statement/guidance, E8 mapping, and the
  conservative OFFICIAL default.
- `__tests__/db/classification-rank.test.ts` — 2 tests pinning the
  cumulative-inclusion rule.
- `vitest.config.ts` wired with the `@/` alias.

### Deferred from milestone 1

- Passkey enrolment UI (better-auth 1.6 passkey plugin ships separately).
- React Flow system-boundary editor (§9.3) — milestone-1 boundary lock
  events table is in place but the visual editor lands in milestone 2.
- SSP PDF generator (§9.5) — milestone 2.
- Evidence upload with presigned URLs + virus scan (§9.7) — milestone 2.
- Findings register manual entry UI — schema landed in milestone 1; UI in
  milestone 2.
