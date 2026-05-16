# OakAttest

IRAP assessment platform for ASD-registered assessor firms and the client
organisations they assess. Built for the full five-phase IRAP lifecycle:
scoping, evidence, fieldwork, findings, certification, and ongoing compliance.

## Stack

Next.js 16 (App Router, RSC), React 19, Tailwind v4, shadcn/ui, BetterAuth,
Drizzle ORM, PostgreSQL 16, S3 (ap-southeast-2), Resend, Vitest, Playwright.

## Getting started

```bash
cp .env.example .env
npm install
npm run dev
```

## Layout

```
app/         Routes (marketing, auth, app)
components/  Feature + UI components
lib/         auth, db, rbac, audit, ism, pdf, storage
db/          Drizzle schema, migrations, seeds
jobs/        Background workers
emails/      React Email templates
docs/        ARCHITECTURE, RBAC, ism-mapping, INFRASTRUCTURE
```

## Status

Milestone 1 in progress — see `CHANGELOG.md`.

## Compliance

- Australian data residency (ap-southeast-2 primary, Melbourne replication)
- Append-only audit log enforced at the DB role layer
- MFA mandatory for assessor-side users
- All copy in Australian English
