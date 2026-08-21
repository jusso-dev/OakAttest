#!/bin/sh
set -eu

: "${DATABASE_MIGRATION_URL:?DATABASE_MIGRATION_URL is required}"
: "${DATABASE_APP_PASSWORD:?DATABASE_APP_PASSWORD is required}"

psql "$DATABASE_MIGRATION_URL" \
  --set ON_ERROR_STOP=1 \
  --set app_password="$DATABASE_APP_PASSWORD" \
  --file db/migrations/post/app_role_grants.sql
psql "$DATABASE_MIGRATION_URL" \
  --set ON_ERROR_STOP=1 \
  --file db/migrations/post/audit_log_grants.sql
psql "$DATABASE_MIGRATION_URL" \
  --set ON_ERROR_STOP=1 \
  --file db/migrations/post/rls_policies.sql
