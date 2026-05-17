# Infrastructure

OakAttest is distributed as an open-source product. Operators choose where to
host the application, database, object storage, backups, and logs. Do not treat
this document as a hosted-service residency guarantee.

## Example Region Profile

- **Primary:** AWS `ap-southeast-2` (Sydney), if selected by the operator.
- **Backup replication:** AWS `ap-southeast-4` (Melbourne), if configured by the operator.
- Alternative deployment: Azure Australia East.

For Australian deployments, configure the database, object storage, backups,
logs, and monitoring exports so persistent data stays in the required regions.

## Encryption

- **At rest:** customer-managed KMS keys per tenant for S3 (SSE-KMS) and
  EBS/RDS. KMS key alias: `alias/oakattest/{tenant_slug}`.
- **In transit:** TLS 1.3 only at the load balancer; HSTS with
  `max-age=31536000`.

## Backups

- RDS automated backups: daily snapshot, 35 day retention.
- Logical dump via `pg_dump` to object storage on the schedule chosen by the
  operator.
- Evidence bucket: enable object-lock for evidence immutability (§9.7) and
  configure replication only where it matches your residency requirements.

## Database roles

| Role              | Privileges                                |
| ----------------- | ----------------------------------------- |
| `postgres`        | Superuser; migrations only.               |
| `oakattest_app`   | DML on domain tables; INSERT+SELECT on `audit_log`. |
| `oakattest_audit` | SELECT-only on `audit_log` and read-only views.     |

See `db/migrations/post/audit_log_grants.sql`.

## Secrets

Use your platform's secret manager where available. Application instances
should read secrets via workload identity or instance role; keep `.env` files
for local development only.
