# OakAttest Licensing, Plans & Feature Gating

Status: authoritative for engineering. Companion to `oakattest-tenancy-model.md`
(introduces the **partner** isolation primitive that doc's §15 requires recording).

OakAttest is free and open source. Marketplace fulfillment (AWS, Azure, Pax8) is not
part of the product. A recorded plan does not gate features or usage.

The notes below describe an earlier paid-plan catalogue. Do not build marketplace
webhooks or paywalls from them.

---

## 1. Tenancy shape (decided 2026-06-18)

```
Partner (MSP)                      partners / partner_members
  └── Tenant (client org)          tenants  (tenants.partner_id → partners.id)
        └── Engagement (assessment) engagements
              └── …evidence, findings, SSP, certification (unchanged)
```

- **Partner** = the MSP. Partner members (MSP staff) get access to every tenant under the
  partner. Roles: `partner_owner`, `partner_admin` (`partnerRoleEnum`).
- **Tenant** = one MSP client organisation. Each tenant carries its own **subscription**,
  **plan**, **usage limits**, users, frameworks, and storage quota. `tenants.partner_id` is
  nullable — null = a direct (non-MSP) customer or a self-installed deployment.
- The engagement/assessment machinery is unchanged and runs **inside** each tenant.

This reverses the earlier "engagement = client, MSP = one tenant" idea: clients are now full
tenants so each can hold its own plan (the spec's per-client plans + MSP console).

---

## 2. Plan catalogue (seeded by `db/seed/plans.ts`, run `npm run db:seed:plans`)

| Plan | Price (AUD/mo) | Users | Frameworks | Entities | Storage | Adds (gated features) |
|---|---|---|---|---|---|---|
| Essential | 199 | 10 | 1 | 1 | 5 GB | `ESSENTIAL_EIGHT` |
| Professional | 499 | 50 | 3 | 3 | 50 GB | + `ISO27001`, `NIST`, `SOC2`, `MULTI_FRAMEWORK`, `EVIDENCE_REUSE`, `AUDITOR_ACCESS`, `API_ACCESS`, `ADVANCED_REPORTING` |
| Enterprise | 1499 | ∞ | ∞ | ∞ | ∞ | + `ISM`, `PSPF`, `SSO`, `ADVANCED_WORKFLOWS`, `CUSTOM_REPORTS`, `INTEGRATIONS` |

> **`ISM` not `IRAP`.** ISM is the framework; IRAP is an assessment performed against the ISM
> (an engagement `assessmentType`), not a separate framework — so it is gated by the `ISM`
> feature, not its own. **`ISO27001` / `SOC2`** unlock the capability, but OakAttest does not
> redistribute those copyrighted catalogues — the client imports their own licensed control
> set via CSV. See `../frameworks/multi-framework-plan.md`.

`NULL` on any `plan_limits` column = unlimited. Evidence repository, reporting, audit logs,
customer/MSP users and email support are baseline (not gated features).

---

## 3. Data model

New tables (`db/migrations/0011_licensing_partners.sql`):
- `partners`, `partner_members` — the MSP layer (`db/schema/partners.ts`).
- `plans` (`code` unique), `features` (`code` unique), `plan_features` (plan↔feature),
  `plan_limits` (one row/plan) — `db/schema/plans.ts`.
- `tenant_usage` (one row/tenant: storage_bytes, user_count, entity_count, framework_count)
  — `db/schema/usage.ts`.

Reused / extended `subscriptions` (`db/schema/subscriptions.ts`):
- `planId` (text) now holds a **plan code** referencing `plans.code` (text-by-value, not FK,
  so a subscription survives catalogue edits).
- `externalProvider` (default `'manual'`) + `externalSubscriptionId` added; the legacy
  `marketplaceSubscriptionId` is now nullable.
- status enum gained `trial` (writes allowed, like active) and `provisioning` (synonym of
  `pending`). Additive — see `lib/billing/entitlement.ts` / `transitions.ts`.
- The existing 1-subscription-per-tenant rule and write-gate are unchanged.

---

## 4. Enforcement — server is the only source of truth (`lib/licensing`)

`lib/licensing/service.ts` resolves a tenant's entitlements in one read
(`resolveEntitlements`) and exposes:

| Function | Use |
|---|---|
| `hasFeature(tenantId, code)` / `requireFeature(tenantId, code)` | feature gate; `requireFeature` throws `PlanUpgradeRequiredError` → `403 {error:'plan_upgrade_required', requiredPlan}` |
| `canUseFramework(tenantId, frameworkKey)` | framework gate (feature unlock **and** framework-count limit) |
| `canCreateUser` / `requireCanCreateUser` | seat limit |
| `canCreateEntity` / `requireCanCreateEntity` | entity limit |
| `canStore` / `requireCanStore(bytes)` | storage limit |

Rules:
- **No subscription row = unlimited** (self-installed / direct tenant), mirroring
  `lib/billing/entitlement.ts` "no row = allow".
- Unknown plan code = fail closed (no features granted).
- Framework keys map to feature codes via `lib/licensing/catalog.ts` (`FRAMEWORK_FEATURE`);
  unknown keys fall back to `MULTI_FRAMEWORK` so nothing unlocks by accident.
- Enforcement is wired at the **server action / route handler** layer (alongside
  `requirePermission`). `<FeatureGate>` (Phase 3) is cosmetic only.

---

## 5. Manual onboarding (no marketplace integration)

1. MSP buys via Pax8 (out-of-band) → host operator creates a `partners` row.
2. Operator creates the client `tenant` (with `partner_id`), a `subscriptions` row
   (`externalProvider='manual'`, `planId` = plan code, `status='active'|'trial'`), and invites
   the tenant owner.
3. Plan changes (upgrade/downgrade/suspend/cancel) go through `transitionSubscription`
   (`lib/billing/transitions.ts`) and are audited.
`externalProvider`/`externalSubscriptionId` remain for future automated provisioning.

---

## 6. Status

**Phase 1 (done):** schema, migration, licensing service, plan catalogue seed. Typecheck +
billing tests green.

**Remaining:**
- Phase 2 — wire `requireFeature` / limit checks into server actions; maintain `tenant_usage`.
- Phase 3 — `<FeatureGate>`, Settings→Subscription screen, partner/MSP console + manual plan
  assignment, partner-aware onboarding + active-context resolution, partner-scoped RBAC.
- Phase 4 — audit events for plan lifecycle; licensing tests.

Framework feature keys (`ISO27001`, `NIST`, `SOC2`, `ISM`, `PSPF`) gate active framework-pack
workflows. ISM and NIST use official catalogues; FedRAMP resolves tenant OSCAL profiles;
PSPF uses the public-source CSV template; ISO 27001 and SOC 2 accept licensed tenant CSVs.
Licensed text is never redistributed;
see `../frameworks/multi-framework-plan.md`.
