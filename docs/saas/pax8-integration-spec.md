# OakAttest × Pax8 Marketplace — Integration Spec (Plan)

Not part of the product. OakAttest is free and open source. Do not implement this spec.

Status: planning. Companion to `docs/saas/oakattest-tenancy-model.md` §8–§9, §13.
Goal: distribute OakAttest through the **Pax8** partner marketplace so MSPs buy it via Pax8
and their purchase auto-provisions an isolated OakAttest tenant.

> ⚠️ Channel mismatch. The current subscription model is shaped for the **Microsoft/Azure
> Marketplace** SaaS fulfillment lifecycle (`db/schema/subscriptions.ts:15` maps
> `PendingFulfillmentStart→pending`, `Subscribed→active`, `Suspended→suspended`,
> `Unsubscribed→cancelled`). Pax8 is a different integration. The good news: the *core* of the
> billing layer is provider-agnostic and reusable; only the channel-facing edge changes.

> ⚠️ The Pax8 API surface below is described at the design level. Confirm exact endpoint
> names, auth, and webhook event types against current Pax8 vendor/partner integration docs
> before implementation (see §8). Treat field names here as placeholders.

---

## 1. What already exists (reusable, provider-agnostic)

| Piece | File | Reuse |
|---|---|---|
| Subscription row (1:1 tenant) | `db/schema/subscriptions.ts` | Keep. `marketplaceSubscriptionId`, `planId` are plain text — provider-neutral. |
| Status enum + state machine | `db/schema/subscriptions.ts`, `lib/billing/transitions.ts` | Keep. States `pending/active/suspended/grace/cancelled` are generic; `cancelled` terminal. |
| Entitlement decider | `lib/billing/entitlement.ts` | Keep. No-row=allow (self-installed), pending=allow, grace-open=grace, expired/cancelled=block. |
| Write-gate enforcement | `lib/rbac/require.ts:109` + `lib/billing/actions.ts` | Keep. `MUTATING_ACTIONS` already gates every write on entitlement. |
| Audit on transition | `transitions.ts:96` | Keep. Every state change is audited. |

## 2. What is missing (must build — currently 0% of any channel)

- `lib/billing/plans.ts` — **referenced in schema comments but does not exist.** No
  plan→entitlement resolution, no seat/engagement/feature gating anywhere.
- Any provisioning endpoint: no webhook, no order/landing resolver, no fulfillment client.
- Any billing credentials in `.env` / `.env.example`.

So Pax8 is not a "swap Microsoft for Pax8" job — there is no Microsoft implementation to swap.
It is a greenfield build on top of a clean, reusable core.

---

## 3. Schema changes

1. **Add a provider discriminator** to `subscriptions`:
   ```
   provider text not null default 'manual'   -- 'pax8' | 'azure' | 'manual'
   ```
   Lets one instance accept Pax8-sourced and manually-provisioned tenants side by side.
2. **Generalise the ID column** semantics: keep `marketplaceSubscriptionId` (text) but treat
   it as "provider subscription/order id". Optionally rename to `providerSubscriptionId` in a
   later migration — not required for v1 (the comment already says it is swappable).
3. **Store the Pax8 product/SKU** in `planId` (text), resolved by `plans.ts` (§4).
4. Keep the unique constraints: one subscription per tenant; unique provider subscription id.

No change to the tenancy model, isolation, or the 1-subscription-per-tenant rule (doc §8/§9).

---

## 4. Plan / entitlement model — `lib/billing/plans.ts` (new)

Define plans as data, resolve entitlements by `planId`. Pax8 SKUs map onto these.

```
type PlanEntitlement = {
  planId: string;            // matches subscriptions.planId
  label: string;
  maxSeats: number | null;        // tenant_members cap (null = unlimited)
  maxActiveEngagements: number | null;
  features: Set<string>;          // e.g. 'frameworks.nist', 'export.bundle', 'sso'
};
```

- Enforce caps at the relevant mutating actions: seat cap on `tenantInvite`, engagement cap on
  `engagementCreate`. Surface remaining quota in the admin/subscription page.
- Feature flags gate optional capabilities (e.g. which frameworks the plan unlocks — ties into
  `../frameworks/multi-framework-plan.md`).
- Downgrades: block at the webhook layer if the new plan's caps are below current usage
  (doc §9). Report drift in the host console.

---

## 5. Pax8 provisioning integration

Pax8's model: the MSP purchases the product in the Pax8 marketplace; Pax8 then drives
provisioning toward the vendor (OakAttest) via API + webhooks, using OAuth2 client-credentials.

Build these (names to be confirmed against Pax8 docs):

### 5.1 Auth client — `lib/billing/pax8/client.ts`
- OAuth2 client-credentials token fetch + cache; signed calls to the Pax8 API.
- Env: `PAX8_CLIENT_ID`, `PAX8_CLIENT_SECRET`, `PAX8_API_BASE`, `PAX8_WEBHOOK_SECRET`.

### 5.2 Webhook handler — `app/api/pax8/webhook/route.ts`
- Verify Pax8 signature (`PAX8_WEBHOOK_SECRET`); reject unsigned.
- Map Pax8 order/subscription events → `transitionSubscription()` (reuse `transitions.ts`):
  - order created / provisioned → create tenant + subscription (`pending`→`active`).
  - quantity/plan changed → update `quantity`/`planId` (apply §4 downgrade guard).
  - suspended / past-due → `suspended` (set `graceEndsAt`).
  - cancelled / unsubscribed → `cancelled` (read-only grace per doc §10).
- Idempotent: events may redeliver; key on provider subscription id + event id.
- Reject re-binding an existing tenant to a second subscription (doc §13).

### 5.3 Provisioning / activation
Two patterns depending on what Pax8 supports for your product type:
- **Auto-provision**: webhook creates the tenant and emails the MSP an invite/setup link to
  the new `tenant_owner` (reuse the invite-link flow — `app/actions/tenants.ts`).
- **Landing/activation page** (`app/pax8/activate/page.tsx`): if Pax8 redirects the buyer to
  your URL with an order token, resolve it, create tenant+subscription atomically, and seat
  the buyer as first `tenant_owner` (mirrors the doc §8 Marketplace landing flow).

---

## 6. Interim manual provisioning (recommended for launch)

You can transact via Pax8 **before** the API integration is done:
- Pax8 sells the SKU → you receive an order notification → host operator (console, §3.4 of
  `msp-hosting-readiness.md`) creates the tenant + a `provider='manual'` subscription row and
  sends the MSP an invite link.
- Reconcile against Pax8 monthly. Swap to webhook auto-provisioning (§5.2) when ready.
This unblocks revenue early and de-risks the API build.

---

## 7. Testing

Extend existing billing tests (`__tests__/billing/*`):
- Webhook → transition mapping (each Pax8 event → correct status), with idempotent redelivery.
- Signature verification (reject unsigned / wrong secret).
- Plan cap enforcement (seat cap blocks invite; engagement cap blocks create).
- Downgrade-below-usage guard.
- Re-bind rejection (second subscription for an existing tenant).

---

## 8. Open items to confirm with Pax8

1. Vendor onboarding path + sandbox availability for ISV self-listing.
2. Exact provisioning model for a web-app SaaS product: auto-provision vs. activation
   redirect, and the webhook event catalogue + payload schema.
3. Auth scheme (assumed OAuth2 client-credentials) and webhook signing method.
4. Billing granularity Pax8 expects (per-seat vs. flat) and how plan/quantity changes arrive.
5. Whether Pax8 requires usage reporting back to them (metered billing).

When ready, fetch the current Pax8 partner/vendor integration docs and replace the placeholder
field/endpoint names in §5 with the verified contract.
