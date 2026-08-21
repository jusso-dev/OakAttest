#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${DATABASE_MIGRATION_URL:?DATABASE_MIGRATION_URL is required}"
: "${DATABASE_APP_PASSWORD:?DATABASE_APP_PASSWORD is required}"

DATABASE_URL="$DATABASE_MIGRATION_URL" npm run db:migrate
npm run db:postdeploy
DATABASE_URL="$DATABASE_MIGRATION_URL" npm run db:seed:plans
DATABASE_URL="$DATABASE_MIGRATION_URL" npm run db:seed:frameworks
DATABASE_URL="$DATABASE_MIGRATION_URL" npm run db:seed:admin

exec npm run start
