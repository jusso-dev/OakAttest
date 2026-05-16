# OakAttest Architecture

OakAttest is a multi-tenant SaaS for ASD-registered IRAP assessor firms. It
runs the full five-phase IRAP assessment lifecycle: scoping, evidence,
fieldwork, findings, and certification, plus ongoing compliance.

## Tech stack

- Next.js 16 (App Router, RSC, Server Actions, `'use cache'`)
- React 19, Tailwind CSS v4, shadcn/ui, lucide-react
- BetterAuth with `twoFactor`, `passkey`, `organization`, `admin`, `magicLink`,
  `oAuthProxy` plugins
- PostgreSQL 16 via Drizzle ORM, migrations via `drizzle-kit`
- S3-compatible storage (AWS S3 ap-southeast-2), presigned URLs, KMS at rest
- Zod for shared validation, React Hook Form, TanStack Table v8, Recharts
- `@react-pdf/renderer` for SSP, findings, and certification reports
- Resend + React Email for transactional mail
- Inngest or BullMQ for background jobs
- Vitest + Playwright for tests

## Tenancy

- **Tenant** = assessor firm (`tenants`).
- **Engagement** = one client system being assessed (`engagements`). A single
  classification (`OFFICIAL`..`TOP_SECRET`).
- Classification is **cumulative**: an engagement at rank R selects every ISM
  control where `min_classification_rank <= R`.
- A user can belong to many tenants and many engagements. Row-level isolation
  is enforced via a tenant-scoped Drizzle query helper that injects the
  predicate; URLs are never trusted.

## Layout (§14)

```
/app              -- routes (marketing, auth, app)
/components       -- ui + feature components
/lib              -- auth, db, rbac, audit, ism, pdf, storage
/db               -- schema, migrations, seeds
/jobs             -- background workers
/emails           -- React Email templates
/docs             -- ARCHITECTURE, RBAC, ism-mapping, INFRASTRUCTURE
```

## Audit log

Append-only. The app database role has only `INSERT, SELECT` on `audit_log`;
a separate `oakattest_audit` role has `SELECT` for the viewer. A trigger
blocks any `UPDATE` or `DELETE` even if grants are accidentally regranted.
See `db/migrations/post/audit_log_grants.sql`.

## ISM ingestion

The catalogue is ingested from ASD's official OSCAL release. The ingester
preserves the original OSCAL control verbatim (`oscal_raw` JSONB) so
re-rendering, params, and props are lossless. Engagements pin to a specific
revision; new revisions surface a `Compare and migrate` banner.

## Status

- Milestone 1 in progress: see `CHANGELOG.md` for current scope.
