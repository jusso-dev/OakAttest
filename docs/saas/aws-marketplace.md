# AWS Marketplace listing (hosted OakAttest SaaS)

Walk this file when filling the AWS Marketplace SaaS listing. It records the
offer decision, the asset paths, and the security answers. It does not claim
that a seller account or a live hosted stack already exists.

Azure Marketplace and Microsoft Partner Center are not required work.

## Seller account and offer

| Item | Status |
| --- | --- |
| AWS Marketplace seller account | Not recorded in this repo. Confirm in the Marketplace Management Portal before submit. |
| Product type | SaaS |
| v1 offer | SaaS contract, flat. Not usage-metered. |
| Hosted region | `ap-southeast-2` (Sydney), unless a later decision names another region. |
| Support contact | `hello@yumait.com.au` (same address as the public privacy policy) |
| Fulfillment | Not built. See [#88](https://github.com/jusso-dev/OakAttest/issues/88). |

Private offers are out of scope for v1.

## Listing copy

**Title:** OakAttest

**Short description:** IRAP assessment workspace for assessor firms and the organisations they assess. Hosted SaaS covers scoping, evidence, findings, certification, and an append-only audit log.

**Long description:**

OakAttest is an IRAP assessment workspace. Assessor firms run engagements for client organisations: scope and ISM applicability, evidence collection, fieldwork, findings, certification, and ongoing compliance.

The hosted product is multi-tenant. A tenant is the assessor firm or the subscribing organisation. Engagement data stays on that tenant. Access is role-based. Security-relevant actions are written to an append-only audit log.

An authenticated MCP endpoint lets an external agent perform the same tenant-scoped actions as the UI. Tokens are created by a tenant owner and can be revoked.

Burl is an in-product assistant for ISM questions and evidence mapping. It drafts suggestions. It does not approve evidence or change assessment records on its own.

**Suggested categories:** Security, Compliance. Pick the official names from the listing form.

**Highlights for the form:**

- IRAP assessment lifecycle in one workspace
- Tenant-scoped evidence, findings, and exports
- Append-only audit log
- Authenticated MCP for assessor automation

## Assets

| Use | Path |
| --- | --- |
| Shield mark | `public/oak-attest-mark.png` |
| Logo | `public/oak-attest-logo.png` |
| Logo lockup | `public/oak-attest-logo-lockup.png` |
| Screenshots | `docs/screenshots/01-sign-up.png` through `docs/screenshots/18-burl-pdf-evidence-mapping.png` |

Export those files to the pixel sizes the listing form asks for. Do not crop in a way that hides the product UI.

Screenshot order for the listing, first to last:

1. `10-dashboard.png`
2. `06-new-engagement.png`
3. `07-scope-boundary-applicability.png`
4. `14-enterprise-evidence.png`
5. `11-findings.png`
6. `12-certification.png`

## Hosted topology (target)

This is the topology the listing describes. It is not proof that the account is already configured this way. Operator guidance that is not the hosted account lives in `docs/INFRASTRUCTURE.md`.

- App: Next.js container, HTTPS on the public hostname.
- Database: PostgreSQL in `ap-southeast-2`.
- Evidence objects: S3 in `ap-southeast-2`.
- App role `oakattest_app` has no `BYPASSRLS`. Migrations use a separate owner role.
- `audit_log` grants are INSERT and SELECT for the app role. See `db/migrations/post/audit_log_grants.sql`.

## Security answers

Each Marketplace security bar maps to one issue. "Proven" means the control is in the repo and covered by a check. "Gap" means the listing must not claim it yet.

| Bar | Issue | Status |
| --- | --- | --- |
| Listing foundation (this file) | [#79](https://github.com/jusso-dev/OakAttest/issues/79) | In progress. Seller account still unconfirmed. |
| Encryption in transit and at rest | [#80](https://github.com/jusso-dev/OakAttest/issues/80) | Gap. `docs/INFRASTRUCTURE.md` describes TLS 1.3, HSTS, and per-tenant KMS as an operator profile. The hosted account is not shown to be configured that way. |
| Tenant isolation | [#81](https://github.com/jusso-dev/OakAttest/issues/81) | Gap. RLS policies exist in `db/migrations/post/rls_policies.sql` but allow all rows when `app.current_tenant_id` is unset. Cross-tenant tests in `docs/saas/oakattest-tenancy-model.md` §11 are not written. |
| Authentication before customer data | [#82](https://github.com/jusso-dev/OakAttest/issues/82) | Gap. `proxy.ts` sends anonymous app routes to `/signin`. There is no automated crawl proving every app, API, MCP, and evidence URL fails closed. |
| No known vulns, malware, or EOL components | [#83](https://github.com/jusso-dev/OakAttest/issues/83) | Gap. `npm audit --omit=dev` on 2026-10-10 reported 8 high findings in the production tree. |
| Data collection, use, retention | [#84](https://github.com/jusso-dev/OakAttest/issues/84) | Partial. Public privacy policy is merged (`app/privacy/page.tsx`, Privacy Act 1988). A Marketplace data-practices note is not written yet. |
| Incident reporting process | [#85](https://github.com/jusso-dev/OakAttest/issues/85) | Gap. No process doc. |
| Notify affected customers | [#86](https://github.com/jusso-dev/OakAttest/issues/86) | Gap. No customer notification path for incidents. |
| Audit log kept at least one year | [#87](https://github.com/jusso-dev/OakAttest/issues/87) | Gap. The app role cannot update or delete `audit_log`. There is no 365-day retention guard and no hosted backup restore check. |
| Subscribe and unsubscribe fulfillment | [#88](https://github.com/jusso-dev/OakAttest/issues/88) | Gap. No `resolveCustomer` landing page and no SNS entitlement handler. |

## What not to submit yet

Do not submit the listing while fulfillment (#88), isolation (#81), or encryption proof (#80) are still gaps. A security questionnaire that points at this table is fine. A listing that says those controls are live is not.
