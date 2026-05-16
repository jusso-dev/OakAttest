# ISM Mapping (OakAttest hosting)

OakAttest aims to be hostable in an IRAP-assessed configuration so assessor
firms can use it for `PROTECTED` engagements. This document tracks which ISM
controls the platform itself meets and where evidence lives.

> The full mapping is populated alongside the milestone-2 hosting work.
> Milestone 1 covers the controls implementable in code only.

| ISM family               | Status         | Evidence / notes                                                                |
| ------------------------ | -------------- | ------------------------------------------------------------------------------- |
| Identification & auth    | In progress    | BetterAuth + TOTP + passkeys (mandatory); see `lib/auth/`.                      |
| Access control           | In progress    | RBAC matrix in `docs/RBAC.md`; enforcement in `lib/rbac/`.                      |
| Cryptography (at rest)   | Planned        | S3 SSE-KMS; KMS key per tenant. Documented in `docs/INFRASTRUCTURE.md`.         |
| Cryptography (in transit)| Planned        | TLS 1.3 terminated at load balancer; HSTS enabled.                              |
| Event logging            | In progress    | Append-only `audit_log` with DB role separation.                                |
| Patching                 | Planned        | Dependabot, base-image scanning, CVE evidence module (§9.9).                    |
| Personnel security       | Out of scope   | Tenant responsibility; OakAttest does not enforce.                              |
| Backup & restore         | Planned        | Daily snapshots, 35d retention, Melbourne replication.                          |
| Data residency           | Implemented    | ap-southeast-2 default; per-tenant declaration page.                            |

Source revision tracked in `db/schema/ism.ts` via `ism_imports.revision`.
