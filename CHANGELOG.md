# Changelog

## Unreleased

### Added
- Initial Next.js 16 canary scaffold with Tailwind v4, App Router, ESLint.
- Directory layout per spec §14 (`app`, `components`, `lib`, `db`, `jobs`,
  `emails`, `docs`, `scripts`).
- Proposed Drizzle schema for milestone-1 items 1–3:
  - Auth (BetterAuth core, two-factor, passkeys, login attempts, trusted
    devices, tenant IP allowlist) — `db/schema/auth.ts`.
  - Tenants, tenant members, tenant invitations, engagement members —
    `db/schema/tenants.ts`.
  - Engagements, client organisations, systems, boundary lock events —
    `db/schema/engagements.ts`.
  - ISM controls catalogue, engagement controls (auto-populated by the
    cumulative classification rule), ISM imports —
    `db/schema/ism.ts`.
  - Append-only audit log with DB-role enforcement —
    `db/schema/audit.ts` and `db/migrations/post/audit_log_grants.sql`.
- Architecture, RBAC, ISM mapping, and infrastructure docs.
- `drizzle.config.ts`, `.env.example`.
