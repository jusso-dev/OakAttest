# OakAttest Architecture

OakAttest is an open-source, self-hostable multi-tenant product for
ASD-registered IRAP assessor firms. It runs the full five-phase IRAP assessment
lifecycle: scoping, evidence, fieldwork, findings, and certification, plus
ongoing compliance.

## Tech stack

- Next.js 16 (App Router, RSC, Server Actions, `'use cache'`)
- React 19, Tailwind CSS v4, shadcn/ui, lucide-react
- BetterAuth with `twoFactor`, `passkey`, `organization`, `admin`, `magicLink`,
  `oAuthProxy` plugins
- PostgreSQL 16 via Drizzle ORM, migrations via `drizzle-kit`
- S3-compatible storage, presigned URLs, encryption at rest
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

## Framework packs

`frameworks` holds global framework definitions and tenant-authored methods.
`framework_packs` is the selectable lifecycle boundary; `framework_controls`
contains either global catalogue rows or one tenant's materialised rows. New
engagements require an active, current pack and snapshot only that pack's control
scope. Tenant packs take precedence over a global pack with the same revision,
without merging their controls. See [FRAMEWORK_PACKS.md](FRAMEWORK_PACKS.md).

## Authorisation flow

1. `proxy.ts` (Next.js 16 renamed middleware) blocks unauthenticated requests
   at the edge using the BetterAuth session cookie.
2. The `(app)` layout calls `getSession()`, resolves the active tenant via
   `resolveActiveTenant`, and redirects unauthenticated or tenantless users.
3. Each engagement layout calls `requirePermission(ACTIONS.engagementView,
   ...)` and short-circuits to 404 on denial so the tenant boundary cannot
   be probed.
4. Every Server Action calls `requirePermission` with its own action key
   before any mutation. Audit rows are written in the same transaction.

## Assessment automation MCP

`/api/mcp` is a stateless Streamable HTTP MCP surface backed by the official
TypeScript SDK. Bearer credentials resolve to a tenant and user actor, then an
AsyncLocalStorage request context invokes existing server actions. UI and agent
workflows therefore share RBAC, licensing, audit logging, checksum verification,
notifications, invitations, and package generation.

MCP credentials are stored as one-way hashes in `mcp_api_tokens`; plaintext is
returned only at creation. Each tool call records an integration audit event,
while its domain action records the normal resource-specific events.

## Status

The platform is feature-complete across the five IRAP phases and the §13
milestone roadmap with the noted follow-ups. See `CHANGELOG.md` for the
exhaustive list.

### Route map

- `/` — public landing
- `/sign-in`, `/sign-up`, `/mfa`, `/invite/[token]` — auth flows
- `/terms` — data handling acknowledgement (first-login gate)
- `/onboarding` — create a tenant
- `/dashboard` — engagements list
- `/engagements/new` — scoping form
- `/engagements/[id]/overview` — at-a-glance + members + SSP export
- `/engagements/[id]/scope` — boundary builder + applicability worksheet
- `/engagements/[id]/evidence` — requests, uploads, review
- `/engagements/[id]/evidence/cve` — OSV.dev supply-chain scan
- `/engagements/[id]/fieldwork` — interviews + Nessus/Rapid7/Qualys import
- `/engagements/[id]/findings` — register, sign-off, remediation actions
- `/engagements/[id]/essential-eight` — maturity scorecard + trend chart
- `/engagements/[id]/certification` — draft, sign, public verify URL
- `/engagements/[id]/audit-readiness` — ISO 27001 Stage 1 or SOC 2 readiness,
  auditor access, and timestamped evidence packages
- `/engagements/[id]/connectors` — role-only assurance connectors, machine-test
  ledger, common-control mappings, and governed evidence reuse
- `/engagements/[id]/questionnaires` — CSV/XLSX/DOCX/PDF intake, assignment,
  evidence-cited human/Burl drafts, independent approval, finalisation, and CSV export
- `/engagements/[id]/governance` — client-owned policy, personnel, access-review,
  and vendor-risk registers with overdue work consolidated in the user's timezone
- `/admin` — members, deployment data location, billing stub
- `/admin/frameworks` — official catalogue imports, tenant CSV/profile packs,
  pack lifecycle, and custom assessment builder
- `/admin/audit` — append-only viewer
- `/admin/branding`, `/admin/ip-allowlist`, `/admin/compliance`
- `/verify/[token]` — public certification verification
- `/trust/[slug]` — immutable PUBLIC assurance snapshot and controlled PDF request
- `/trust/access/[token]` — expiring, download-limited signed PDF redirect
- `/api/auth/[...all]` — BetterAuth handler
- `/api/interviews/[id]/ics` — calendar export
- `/api/engagements/[id]/findings/csv` — findings register CSV
- `/api/engagements/[id]/questionnaires/[questionnaireId]/csv` — audited questionnaire export
- `/api/mcp` — bearer-authenticated Streamable HTTP assessment automation
