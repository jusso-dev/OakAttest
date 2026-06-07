# OakAttest SaaS Tenancy Model

Status: authoritative for engineering. Maps to issue #39 (EPIC 4 — OakAttest SaaS readiness).

This document defines how assessor firms, clients, engagements, and the underlying assessment artefacts are isolated, owned, invited, billed, and offboarded. Every rule below MUST be enforceable in code; sections cite the existing tables and modules that implement them.

---

## 1. Entities and hierarchy

```
Tenant (assessor firm)
  └── TenantMember (assessor-side user)
  └── Engagement (one IRAP assessment of one client system)
        ├── ClientOrganisation (1:1 with engagement)
        ├── System (1:1 with engagement)
        ├── EngagementMember (assessor- or client-side user)
        ├── EvidenceLibrary (per engagement)
        ├── Findings (per engagement)
        ├── SSP / Certification artefacts (per engagement)
        └── Audit log entries (tenant + engagement scoped)
```

| Term | Definition | Table |
|---|---|---|
| Tenant | An assessor firm or organisation. Owns a Marketplace subscription. | `tenants` |
| Tenant member | A user with a role in the assessor firm. | `tenant_members` |
| Engagement | One scoped IRAP assessment package for one client system. The unit of work. | `engagements` |
| Client organisation | The assessed party for a given engagement. One per engagement. | `client_organisations` |
| System | The system under assessment. One per engagement. | `systems` |
| Engagement member | A user (assessor- or client-side) participating in an engagement. | `engagement_members` |
| External participant | A client-side user. Held via `engagement_members` with `client_admin`, `client_contributor`, or `read_only_observer`. | `engagement_members` |
| Evidence library | Evidence requests and submissions for the engagement. Cascades on engagement delete. | `evidence_*` |
| Findings | Non-conformances and observations for the engagement. | `findings`, `remediation_actions` |
| Reports | SSP exports, certification PDFs, export bundles for the engagement. | `ssp_*`, `certifications` |

**Tenant = assessor firm, NOT client.** Client organisations are first-class but live in `client_organisations`, not `tenants`. Rationale: clients are scoped to one engagement and one assessor relationship; they do not own a workspace or a subscription.

A user may be a tenant member of many tenants (cross-firm consultants). Uniqueness is per (tenant_id, user_id): `tenant_members_tenant_user_uq`.

A user may be an engagement member in many engagements across many tenants. Uniqueness is per (engagement_id, user_id): `engagement_members_engagement_user_uq`.

---

## 2. Data ownership

Ownership is decided at engagement creation and **does not transfer**.

- **The tenant owns the engagement, evidence library, findings, SSP, and certification artefacts.** This is the assessor firm's working file. They retain it after the client relationship ends, subject to retention rules (§7).
- **The client organisation owns the underlying evidence content.** They consent to its use for the assessment. Export bundles (issue #45) include a client-side copy.
- **The user owns their own account, MFA enrolment, sessions, passkeys, and trusted devices** (`users`, `two_factor`, `passkeys`, `sessions`, `trusted_devices`). User-level records are not tenant-scoped; removing a tenant membership never deletes the underlying user.
- **The audit log is owned by the tenant** and is append-only at the DB role level (see `db/schema/audit.ts` comment). It is never edited, even by `tenant_owner`.

Every domain table that is engagement- or tenant-scoped carries `tenant_id` explicitly so range queries and isolation predicates do not need a join through `engagements`. This denormalisation is required — do not remove it.

Source of truth for tenant column presence: every file in `db/schema/` except `auth.ts` (user-level), `ism.ts` (catalogue, global), and `enums.ts` carries `tenantId`.

---

## 3. Roles

Two scopes. Source of truth: `lib/rbac/matrix.ts`.

### Tenant roles (`tenantRoleEnum`)
- `tenant_owner` — Marketplace subscription owner. Billing, branding, IP allowlist, member management.
- `assessor_admin` — Can invite, manage ISM revisions, view members, create engagements.

### Engagement roles (`engagementRoleEnum`)
- `lead_assessor` — Sign-off authority. Creates findings, signs certification.
- `assessor` — Assessor-side worker. Creates findings, reviews evidence.
- `client_admin` — Client-side lead. Uploads evidence, writes implementation statements, invites client peers.
- `client_contributor` — Client-side worker.
- `read_only_observer` — Peer reviewer or ASD liaison. View only.

### Independence rule (hard)

Remediation guidance actions (`remediation_guidance:*`) are **client-side only**. No assessor-side role may hold them, including `tenant_owner` and `assessor_admin`. Enforced two ways:

1. The matrix in `lib/rbac/matrix.ts` lists only `client_admin` and `client_contributor`.
2. The function `assertIndependenceGuard()` runs in tests and CI; it throws if any assessor-side role appears on a `remediation_guidance:*` row.

This is required for IRAP independence and **must not** be relaxed.

---

## 4. Access boundaries

Enforcement is server-side in `lib/rbac/require.ts` via `requirePermission(action, ctx)`. Every Server Action and Route Handler that touches engagement data MUST call it. Permission denial throws; the caller must let it propagate so the route renders 403.

Rules:

1. **Tenant boundary.** A user can never read or write a row whose `tenant_id` is one they have no membership in. The session carries an `activeTenantId` (`sessions.active_tenant_id`); RBAC lookups derive context from it. The active tenant cookie (`oakattest_active_tenant`) is re-validated against `tenant_members` and `engagement_members` on every request — never trusted alone. See `lib/auth/active-tenant.ts`.
2. **Engagement boundary.** Engagement-scoped actions also require an `engagement_id` in the context. `rolesForUser` looks up both tenant and engagement roles and unions them; a user holding only an engagement role (a client-side user) still has a valid context.
3. **Client users are confined to their engagement(s).** A client-side user (engagement role only, no `tenant_members` row) cannot enumerate other engagements in the same tenant. They have no tenant-level actions in the matrix.
4. **`read_only_observer` is read-only.** No mutation action lists this role.
5. **Cross-tenant joins are forbidden in the data layer.** Queries that span tenants are limited to the audit/platform admin role (not yet modelled; reserved for a future internal-ops scope).

Tests live in `__tests__/rbac/matrix.test.ts` (matrix integrity). DB-level isolation tests are required and currently a gap (see §11).

---

## 5. Workspace lifecycle

Engagement status (`engagementStatusEnum`): `draft → active → on_hold | completed → archived`.

Engagement phase (`engagementPhaseEnum`): `scoping → evidence → fieldwork → findings → certification → maintenance`. Phase and status are orthogonal: an `active` engagement may be in any phase; `archived` engagements freeze at whatever phase they were in.

| Transition | Trigger | Side effects |
|---|---|---|
| `draft → active` | `engagement:update` by `lead_assessor` or higher, scope minimally complete | Audit log entry. ISM revision pinned at creation; cannot change after `active`. |
| `* → on_hold` | Same actors | Pauses due-date counters; no destructive side effects. |
| `active → completed` | `lead_assessor` after certification signed | Locks evidence and findings against further mutation. Read remains permitted. |
| `completed → archived` | `tenant_owner` or `assessor_admin` | Sets `engagements.deleted_at = null` and a separate `status='archived'`. Engagement disappears from default lists but remains queryable for compliance. |
| `* → archived` (early) | `tenant_owner` | Permitted for abandoned engagements. Audit entry mandatory with `reason`. |

The boundary lock is a separate lifecycle, logged in `boundary_lock_events`; it gates scope mutation independently of engagement status.

**Engagements never hard-delete in product flows.** See §7 for retention and the archive/delete process.

---

## 6. Invitations

Two flows. Both use single-purpose tokens through `verification_tokens` for the email-delivery side.

### Tenant invitations (assessor firm inviting a colleague)

Table: `tenant_invitations`. Issued by `tenant_owner` or `assessor_admin` (action `tenant:invite`). Carries an assessor-side role only. Acceptance requires a verified email and MFA enrolment within the grace period (§9).

### Engagement invitations (assessor inviting a client, or client inviting a client peer)

Table: `engagement_invitations`. Issued by `tenant_owner`, `assessor_admin`, `lead_assessor`, or `client_admin` (action `engagement:invite`). Carries an engagement role and is bound to a specific engagement.

Rules common to both:

- Tokens are single-purpose; the `verification_tokens.purpose` field prevents reuse across flows.
- Tokens expire at `expires_at`. After expiry, acceptance fails closed.
- `revoked_at` immediately invalidates an outstanding invitation.
- Accepting an invitation creates a membership row (`tenant_members` or `engagement_members`) and writes an audit entry.
- An email already in the tenant/engagement results in no-op on acceptance (idempotent re-acceptance of an existing membership).
- Self-installed deployments without email delivery MUST surface the invitation URL inline so a tenant_owner can copy it (PRODUCT.md anti-reference: "Avoid flows that assume public SaaS email delivery is always configured").

---

## 7. Archive and delete process

Soft-delete is the default. `deleted_at` exists on `tenants`, `tenant_members`, `engagement_members`, `engagements`. Hard-delete is reserved for retention expiry and account closure flows.

### Soft-archive (default)

- Engagement: `status='archived'`. Hidden from default lists. All reads still gated by RBAC. No further mutations except audit log writes.
- Tenant member: `deletedAt` set. Sessions are terminated. RBAC lookups exclude soft-deleted memberships (`isNull(deletedAt)` predicate in every query).
- Engagement member: same.

### Hard-delete (compliance-driven)

- Triggered by the retention controls in issue #46 (`add OakAttest data retention controls`). Per-tenant retention policy lives in `tenants.compliancePolicy` (jsonb).
- Cascade order: engagement → boundaries, evidence, findings, certifications, exports (FK `onDelete: 'cascade'` from `engagements`). Audit log entries for the deleted engagement are **retained** with `engagement_id` left intact — they survive the cascade because `audit_log` has no FK reference to `engagements`.
- Tenant hard-delete: forbidden through product UI. Reserved for support-led offboarding. Cascades through `tenant_members`, `tenant_invitations`, and `engagement_members.tenant_id` is `restrict` on `engagements` — engagements must be archived/deleted first.
- User hard-delete: deletes account, sessions, MFA, passkeys, trusted devices. Memberships cascade. Audit entries authored by the user retain `actor_user_id` as a UUID pointing nowhere — intentional, so the audit trail does not lose attribution.

### Export before delete

A tenant_owner can trigger the assessment export bundle (issue #45) prior to archive/delete. Bundle includes assessment metadata, evidence inventory, findings, certifications, and audit slice. Required for IRAP record-keeping.

---

## 8. Billing account relationship

- **One Marketplace subscription = one tenant.** Enforced by storing `billingCustomerId` on `tenants` and rejecting subscription provisioning when the value is already set.
- The Marketplace SaaS landing page (issue #41) creates the tenant atomically with the subscription. The user who completes the landing page becomes the first `tenant_owner`.
- `tenant_owner` is the **billing contact**. Multiple `tenant_owner` rows are permitted; the matrix allows it. By convention, the row with the earliest `joinedAt` is the displayed primary, but the system does not enforce a single owner.
- Subscription cancellation does NOT delete tenant data. It transitions the tenant to a read-only grace state (modelled in issue #40, `OakAttest SaaS subscription model`). Reactivation in the grace window restores write access.
- Self-installed deployments leave `billingCustomerId` null. No Marketplace coupling.
- Private offers and assessor-firm-pay (vs client-pay) variants are handled by issue #60; the underlying mapping does not change.

---

## 9. Subscription-to-tenant mapping

| Property | Value |
|---|---|
| Cardinality | 1 subscription : 1 tenant. Never many-to-one. |
| Subscription ID storage | `tenants.billingCustomerId` (text, swappable). |
| Marketplace SaaS plan | Stored on the subscription record (issue #40), not on `tenants`. The tenant references the live plan via the subscription. |
| Per-tenant entitlements | Derived from the plan; resolved on session establishment, cached on the session row. Entitlement schema lands with #40. |
| Tenant slug | Stable and unique (`tenants_slug_uq`). Used in URLs (`/orgs/{slug}/...`). |
| Region | `tenants.dataRegion` defaults to `ap-southeast-2`. Single-region per tenant; cross-region moves require export + re-provision. |
| Plan downgrades | Cannot reduce a tenant below its current usage (active engagements, member count). Block at the subscription webhook layer (issue #44). |
| Reassessment cadence | Per-classification, configured on `tenants.compliancePolicy.reassessmentMonths`. Affects due-date banners only, not access. |

MFA enforcement and the grace window are tenant-policy concerns held on `tenants.securityPolicy`:
- `mfaMode`: `optional | assessor_required | all_users_required`.
- `mfaGracePeriodDays`: how long after first join an assessor-side user may operate before being blocked.

---

## 10. Offboarding edge cases

### An assessor leaves a firm

Performed by `tenant_owner` (action `tenant:manage` plus a planned `tenant:remove_member`; the latter is a follow-up — currently runs through the same `tenant:manage` action).

Steps:
1. Soft-delete the `tenant_members` row (`deletedAt = now()`).
2. For every `engagement_members` row where the user is assessor-side AND in this tenant: soft-delete.
3. Terminate all active sessions where `activeTenantId` matches; the user can re-login but with no access to this tenant.
4. Audit log: `tenant.member_removed`, `engagement.member_removed` per engagement.
5. **Do not** rewrite historical authorship. Findings, evidence reviews, certifications, and audit entries authored by the user retain `actor_user_id` pointing at the (still-existing) user. IRAP record-keeping requires this.
6. If the user is the **only** `lead_assessor` on an active engagement, the removal blocks until a replacement is assigned. Hard rule.
7. If the user is the **only** `tenant_owner`, the removal blocks until another `tenant_owner` exists OR the tenant is transitioned to support-led offboarding.

### A client user leaves an assessment

Performed by `client_admin` or any assessor-side admin on that engagement.

Steps:
1. Soft-delete the `engagement_members` row.
2. Revoke any outstanding `engagement_invitations` they hold by email (set `revokedAt`).
3. Terminate sessions if the engagement is their only access; otherwise leave sessions intact (the user may belong to other engagements).
4. Evidence already uploaded **remains owned by the engagement.** It does not delete with the user.
5. Audit log: `engagement.member_removed`.

### A user closes their account

User-initiated. Soft-deletes the user row (`users.disabledAt`) and the membership rows; sessions terminate. Hard-delete is a separate compliance flow per §7.

### A tenant is suspended for non-payment

Marketplace webhook (issue #44) sets the subscription to a grace state. RBAC denies all write actions tenant-wide; reads remain. Tenant_owner sees a billing banner. After the grace window, the tenant transitions to read-only-archive (no writes, including audit) and engagements are archived but not deleted.

---

## 11. Engineering test mapping

Acceptance criterion: "Engineering tests map to the tenancy model." Mapping below.

| Rule | Test file | Status |
|---|---|---|
| Matrix integrity, independence guard | `__tests__/rbac/matrix.test.ts` | ✅ exists |
| Tenant boundary on engagement read | `__tests__/db/tenant-isolation.test.ts` | ❌ to add |
| Tenant boundary on evidence read | `__tests__/db/tenant-isolation.test.ts` | ❌ to add |
| Engagement boundary excludes other tenant's engagements | `__tests__/db/tenant-isolation.test.ts` | ❌ to add |
| Soft-deleted membership denies access | `__tests__/rbac/membership-soft-delete.test.ts` | ❌ to add |
| Invitation token single-purpose, expiry, revocation | `__tests__/auth/invitation-lifecycle.test.ts` | ❌ to add |
| Lone `lead_assessor` removal blocked | `__tests__/rbac/lifecycle.test.ts` | ❌ to add |
| Audit log is append-only at DB role level | DB grant test (post-migration) | ❌ to add |

Gap-closing tests are scoped under issue #27 (`Add tenant and workspace isolation tests`). This document is the spec they implement against.

---

## 12. Security implications

- All engagement data is tenant-scoped in storage; isolation breaches require either a missing `requirePermission` call OR a query that omits the tenant predicate. Code review must reject both.
- The active tenant cookie is HMAC-validated by being re-checked against `tenant_members`/`engagement_members` on every request — it is a hint, not an authority.
- Soft-delete predicates (`isNull(deletedAt)`) are mandatory in membership queries. A missing predicate would let a removed member retain access. Lint or test for this.
- The audit log is append-only at the DB role level; UPDATE/DELETE grants are revoked from the application role. See `db/migrations/post/audit_log_grants.sql` (referenced in `db/schema/audit.ts`).
- MFA is mandatory for assessor-side users by tenant policy; the grace window is policy-driven, not hard-coded.
- Independence guard (§3) is enforced in tests AND at runtime by `assertIndependenceGuard()` — call from a CI gate.

---

## 13. Marketplace implications

- One subscription per tenant constrains how Microsoft Partner Center maps SaaS offer purchases. The landing page (#41) and webhook (#44) must reject re-binding an existing tenant to a second subscription.
- Private offer flows (#60) attach to the same tenant model — no new isolation primitives are required.
- Plan entitlements (issue #40) layer on top of the tenancy model. They constrain quotas (members, engagements) but do not change isolation rules.
- Region is per-tenant. Multi-region tenants are out of scope for v1.

---

## 14. Open follow-ups

These are tracked in adjacent issues, not in scope for #39:

- Plan entitlement schema → #40
- Marketplace SaaS landing page → #41
- SaaS webhook (provisioning, grace, cancel) → #44
- Marketplace Fulfillment API integration → #43
- Per-tenant retention policy implementation → #46
- Export bundle for archive/delete → #45
- Engineering isolation tests against this spec → #27

---

## 15. Change control

Changes to this document require a corresponding code change OR an issue noting the gap. Do not let the doc drift ahead of the code. If you add a new isolation primitive (new table, new role, new boundary), update §1, §2, §3, §11 in the same PR.
