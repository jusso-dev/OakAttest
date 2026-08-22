# RBAC

Two role scopes: **tenant** (assessor firm) and **engagement** (per assessment).

## Tenant roles

| Role             | Scope  | Capabilities                                              |
| ---------------- | ------ | --------------------------------------------------------- |
| `tenant_owner`   | Tenant | Billing, member management, all engagements               |
| `assessor_admin` | Tenant | Create engagements, assign assessors, view all engagements |

Tenant owners and assessor administrators may manage framework packs. Only a platform
administrator may import or replace a shared official catalogue. Tenant profile results,
CSV packs, and custom controls remain tenant-scoped; engagement and client roles cannot
author, activate, or retire them.

## Engagement roles

| Role                 | Scope      | Capabilities                                                  |
| -------------------- | ---------- | ------------------------------------------------------------- |
| `lead_assessor`      | Engagement | Run the engagement, sign off findings, generate certification |
| `assessor`           | Engagement | Review evidence, log findings, conduct interviews             |
| `client_admin`       | Engagement | Invite client staff, upload evidence, accept risk, authorise systems, manage monitoring |
| `client_contributor` | Engagement | Upload evidence, respond to requests, treat risk, support monitoring |
| `read_only_observer` | Engagement | View and download only (external auditor, liaison, peer reviewer) |

Trust Portal state is visible to engagement members. Only `client_admin` can configure public wording,
approve a PUBLIC release, decide controlled PDF requests, disable a publication, or revoke an access link.
This is a client-accountability boundary: assessor and tenant-administration roles cannot publish on the
client's behalf.

Connector state and evidence-reuse records are visible to engagement members. Tenant owners, assessor
administrators, lead assessors, and client administrators configure connectors; non-observer engagement
roles may run an active connector. Clients and assessors can propose same-client evidence reuse, but only
assessor roles approve, reject, or revoke a reuse decision. Tenant owners, assessor administrators, and
lead assessors author tenant-scoped common-control mappings.

Questionnaire state is visible to engagement members. Tenant owners, assessor administrators, lead
assessors, and client administrators import, assign, finalise, and independently review responses.
Assessors and client contributors may draft and submit cited answers but cannot approve them. Server-side
four-eyes enforcement prevents any submitter from approving their own response; observers remain read only.

Operational GRC records remain client-owned. Assessors, tenant administrators, and observers may inspect
policy, personnel, access-review, and vendor-risk state as assessment evidence but cannot mutate it. Client
contributors may draft policies, accept their own published-policy attestations, and maintain vendor due
diligence. Only client administrators approve or publish policies, manage personnel and access reviews, and
accept vendor residual risk.

Audit readiness changes are limited to tenant owners, assessor admins, lead
assessors, and client admins. Auditors use `read_only_observer`: they can inspect
the workspace, evidence, findings, and immutable packages, but cannot change
scope, checklist state, evidence review, or findings.

## MCP machine access

MCP tokens do not introduce a privileged role. A token is bound to its creator,
tenant, expiry, and scopes. Tool execution reuses that user's current tenant and
engagement roles; removing the user's access immediately removes the token's
effective access. Only tenant owners may issue or revoke tokens.

This preserves assessor/client independence for agent workflows: an
assessor-side token cannot perform client-only evidence uploads or author
implementation statements, and a client-side role cannot decide applicability
or review its own evidence.

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
(`client_admin`, `client_contributor`). Risk acceptance and system authorisation
are restricted further to `client_admin`. Assessor-side and tenant-level roles
cannot invoke those accountable client decisions. The static permission matrix
and `assertIndependenceGuard()` enforce these boundaries.
