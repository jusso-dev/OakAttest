# RBAC

Two role scopes: **tenant** (assessor firm) and **engagement** (per assessment).

## Tenant roles

| Role             | Scope  | Capabilities                                              |
| ---------------- | ------ | --------------------------------------------------------- |
| `tenant_owner`   | Tenant | Billing, member management, all engagements               |
| `assessor_admin` | Tenant | Create engagements, assign assessors, view all engagements |

## Engagement roles

| Role                 | Scope      | Capabilities                                                  |
| -------------------- | ---------- | ------------------------------------------------------------- |
| `lead_assessor`      | Engagement | Run the engagement, sign off findings, generate certification |
| `assessor`           | Engagement | Review evidence, log findings, conduct interviews             |
| `client_admin`       | Engagement | Invite client staff, manage system boundary, upload evidence  |
| `client_contributor` | Engagement | Upload evidence, respond to evidence requests                 |
| `read_only_observer` | Engagement | View-only (ASD liaison, peer reviewer)                        |

## Enforcement

All mutations call `requirePermission(action, resource, ctx)` from
`lib/rbac/require.ts`. The helper:

1. Resolves the active session.
2. Loads the user's `tenant_members` and `engagement_members` rows for the
   relevant tenant/engagement.
3. Maps `(role, action, resource)` against a static permission matrix.
4. Throws `PermissionDeniedError` (rendered as 403) on failure.

Permission boundary tests live in `__tests__/rbac/`. Every new Server Action
must include a denial test for at least one role that should not be able to
call it.

## Independence guard (§15)

Anything tagged `remediation_guidance` is callable only by client-side roles
(`client_admin`, `client_contributor`). Assessor-side roles cannot invoke
those actions even with elevated tenant permissions. This is checked in
`requirePermission` via a hard branch on `action` prefix.
