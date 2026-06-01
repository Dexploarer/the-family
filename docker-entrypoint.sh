#!/bin/sh
set -e

# Idempotent schema apply (db/schema.sql uses IF NOT EXISTS). Set RUN_MIGRATE_ON_START=false
# to skip when migrations are managed externally.
if [ "${RUN_MIGRATE_ON_START:-true}" = "true" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "docker-entrypoint: DATABASE_URL is required when RUN_MIGRATE_ON_START=true" >&2
    exit 1
  fi
  bun src/db/migrate.ts
fi

exec "$@"
