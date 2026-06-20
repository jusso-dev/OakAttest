# OakAttest MSP Single-Instance Hosting — Readiness & Hardening Plan

Status: planning. Companion to `docs/saas/oakattest-tenancy-model.md` (authoritative spec).
Goal: host **one** OakAttest instance that many independent MSPs self-onboard to via signup +
invite link, each isolated, with the host (you) as platform operator.

Decision on record (2026-06-18): **engagement = client**. An MSP is one tenant; each of the
MSP's customers/systems is an engagement under that tenant. No reseller sub-tenant hierarchy.
This keeps the existing schema; it does NOT require tenant groups or a parent/child billing model.

---

## 1. Verdict

The multi-tenant core is **production-shaped and ready for a trusted pilot today**. Four gaps
must close before opening the instance to mutually-distrusting MSPs through a public marketplace.

| Capability | State | Evidence |
|---|---|---|
| Open self-signup | ✅ ready | `app/(auth)/sign-up`, `lib/auth/auth.ts` (`emailAndPassword.enabled`, `autoSignIn`) |
| Self-serve tenant creation | ✅ ready | `app/actions/tenants.ts:46` — any authed user founds a tenant, becomes `tenant_owner`; no admin gate, no bootstrap |
| Invite links (email-optional) | ✅ ready | 32-byte token, 72h expiry, `app/actions/tenants.ts:211`; Resend optional → copy link, `emails/send.ts:12` |
| Per-tenant white-label branding | ✅ ready | `tenants.branding` (logo, colours, productName) |
| Per-tenant MFA policy + grace | ✅ ready | `tenants.securityPolicy`, `lib/auth/mfa-policy.ts` |
| App-level tenant isolation | ✅ ready | active-tenant cookie re-validated every request `lib/auth/active-tenant.ts:40`; RBAC + explicit `tenantId` WHERE; URL traversal blocked `app/(app)/engagements/[id]/layout.tsx:47` |
| **DB-level RLS** | ❌ gap | no `CREATE POLICY` anywhere; isolation is app-code only |
| **Isolation test suite** | ❌ gap | tenancy doc §11 lists these as not-written |
| **Signup abuse controls** | ❌ gap | no rate limit, no captcha, email verification optional |
| **Platform-operator (host) view** | ❌ gap | doc §4.5 reserves it; unbuilt |

---

## 2. Why the gaps matter for a shared MSP instance

When competing MSPs share one Postgres database, the blast radius of a single missing
`tenantId` predicate is a cross-customer data leak of sensitive client compliance evidence.
App-level isolation is correct today, but it is enforced by convention (every query must
filter by `tenantId`, every action must call `requirePermission`). A shared marketplace
instance warrants a second, structural line of defence.

---

## 3. Hardening plan (priority order)

### 3.1 Postgres Row-Level Security (defence-in-depth) — FOUNDATION DELIVERED

RLS lets the database refuse cross-tenant rows even if app code forgets a predicate.

**Delivered:**
- `db/migrations/post/rls_policies.sql` — idempotent post-migration hook (same pattern as
  `audit_log_grants.sql`). Enables RLS + a `tenant_isolation` policy on **every BASE TABLE
  carrying `tenant_id`** (discovered dynamically — no hand-maintained list). Catalogue tables,
  `tenants`, `partners`, `partner_members` are excluded (global / partner-scoped). Enforced for
  the non-owner `oakattest_app` role; the migration/owner role bypasses it.
- `runWithTenantScope(tenantId, fn)` (`lib/db/scoped.ts`) — runs a transaction with
  `set_config('app.current_tenant_id', …, true)` so the policies filter to that tenant.

**Gradual-adoption semantics (non-breaking):** the policy is **permissive when the GUC is
unset**, so existing direct `db.select()` reads behave exactly as today. A query only gets
DB-enforced isolation once it runs inside `runWithTenantScope()`. This is deliberate: blanket
strict RLS would return zero rows for the app's many unscoped reads and break it.

**Rollout to mandatory enforcement:**
1. Ensure `oakattest_app` does NOT have `BYPASSRLS`.
2. Apply `rls_policies.sql` (safe to apply now — permissive until adopted).
3. Migrate tenant-scoped reads/writes onto `runWithTenantScope()` (start with the highest-value
   paths: engagements, evidence, findings, SSP).
4. Once all tenant-scoped access is routed through the helper, drop the
   `current_setting(...) IS NULL OR` escape in the policies and re-run → isolation becomes
   mandatory and a forgotten predicate can no longer leak rows.

This complements (does not replace) the application predicates and the §3.2 isolation tests.

### 3.2 Tenant-isolation test suite — HIGH

Write the tests the spec already enumerates (doc §11): cross-tenant engagement read denied,
cross-tenant evidence read denied, soft-deleted membership denies access, invitation token
single-purpose/expiry/revocation, lone `lead_assessor`/`tenant_owner` removal blocked, audit
log append-only at DB role level. Gate them in CI. These are the regression net that makes
RLS + app isolation trustworthy on every future change.

### 3.3 Signup abuse controls — HIGH (before public listing)

Open signup is correct for self-service but is an abuse surface on a public instance.
- Enforce email verification before a tenant can be created (currently optional).
- Rate-limit signup + invite-accept (per IP + per email).
- Add a bot check (captcha / Turnstile) on signup.
- Optional: a "request access" gate or allowlist while in early Pax8 pilot.

### 3.4 Platform-operator console — MEDIUM

You, the host, need an internal-ops scope (doc §4.5 reserves it; not modelled yet):
- List all tenants, their subscription state, seat usage, last activity.
- Suspend / read-only / offboard a tenant (support-led, doc §7).
- View platform-wide audit without breaking per-tenant isolation (separate role).
This is also where Pax8 manual provisioning (see `pax8-integration-spec.md` §6) lives.

### 3.5 Operational must-haves for hosted mode — MEDIUM

- **Email delivery is mandatory now** (invites, magic-links, verification). Self-installed
  may skip it; your hosted instance may not. Configure Resend + a sending domain.
- Backups + PITR on Postgres; documented restore.
- Region/residency: `tenants.dataRegion` defaults `ap-southeast-2`. Decide whether all MSPs
  share one region (simplest) and state it in onboarding. Multi-region is out of scope.
- Secrets: per-tenant data is one DB — KMS/object-store keys are shared infra, not per-tenant.
  Confirm evidence object paths are prefixed by `tenantId` (`lib/storage`).
- Custom domains / per-MSP subdomain: optional white-label nicety, not required for launch.

---

## 4. Suggested sequencing

1. Pilot-ready (now): hand a single MSP a login + invite link. Works.
2. Pre-public (close §3.1, §3.2, §3.3): structural isolation + tests + abuse controls.
3. Operate (add §3.4, §3.5): host console + email/backups/residency.
4. Then layer billing (`pax8-integration-spec.md`) and frameworks (`../frameworks/multi-framework-plan.md`).
