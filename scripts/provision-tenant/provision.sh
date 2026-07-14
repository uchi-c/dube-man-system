#!/usr/bin/env bash
set -euo pipefail
# ---------------------------------------------------------------------------
# One-shot tenant database provision via psql (optional convenience).
# Applies the schema to a fresh Supabase project's Postgres directly, instead
# of pasting into the SQL editor. Idempotent — safe to re-run.
#
# Usage:
#   DATABASE_URL='postgresql://postgres:PWD@db.<ref>.supabase.co:5432/postgres' \
#     scripts/provision-tenant/provision.sh [--seed]
#
# Get the connection string from: Supabase > Project Settings > Database.
# Pass --seed to also load demo data (database/seed.sql). Skip it for a
# real client — you don't want demo products/customers in their books.
# ---------------------------------------------------------------------------
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
db="$here/../../database"

: "${DATABASE_URL:?Set DATABASE_URL to the Supabase connection string for this tenant (Project Settings > Database).}"

run() { echo ">> applying $1"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$db/$1"; }

run schema.sql
run print_schema.sql
run agent_schema.sql

if [[ "${1:-}" == "--seed" ]]; then
  echo ">> loading demo seed data"
  run seed.sql
fi

echo
echo "Schema applied. Next:"
echo "  1. Create the owner in Supabase > Authentication > Users."
echo "  2. Fill in and run scripts/provision-tenant/create-admin.sql."
