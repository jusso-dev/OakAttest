# Infrastructure

## Regions

- **Primary:** AWS `ap-southeast-2` (Sydney).
- **Backup replication:** AWS `ap-southeast-4` (Melbourne).
- Alternative deployment: Azure Australia East.

All persistent data, backups, and logs stay onshore (§11).

## Encryption

- **At rest:** customer-managed KMS keys per tenant for S3 (SSE-KMS) and
  EBS/RDS. KMS key alias: `alias/oakattest/{tenant_slug}`.
- **In transit:** TLS 1.3 only at the load balancer; HSTS with
  `max-age=31536000`.

## Backups

- RDS automated backups: daily snapshot, 35 day retention.
- Logical dump via `pg_dump` to S3 daily, replicated to Melbourne bucket.
- S3 evidence bucket: cross-region replication to Melbourne, both buckets
  with object-lock in compliance mode for evidence immutability (§9.7).

## Database roles

| Role              | Privileges                                |
| ----------------- | ----------------------------------------- |
| `postgres`        | Superuser; migrations only.               |
| `oakattest_app`   | DML on domain tables; INSERT+SELECT on `audit_log`. |
| `oakattest_audit` | SELECT-only on `audit_log` and read-only views.     |

See `db/migrations/post/audit_log_grants.sql`.

## Secrets

AWS Secrets Manager. Application reads via instance role; no secrets in env
files outside developer machines.
