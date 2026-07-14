#!/usr/bin/env bash
set -euo pipefail
# ---------------------------------------------------------------------------
# Regenerate schema-bundle.sql from the canonical database/*.sql files, in the
# dependency order Supabase needs. Run this whenever the schema changes so the
# bundle never drifts from source.
# ---------------------------------------------------------------------------
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
db="$here/../../database"
out="$here/schema-bundle.sql"

# Order matters: base tables first, then print manager, then agent add-ons.
files=(schema.sql print_schema.sql agent_schema.sql)

{
  echo "-- ============================================================"
  echo "-- CaféOS tenant schema bundle — GENERATED. Do not edit by hand."
  echo "-- Regenerate with: scripts/provision-tenant/build-bundle.sh"
  echo "-- Order: schema.sql -> print_schema.sql -> agent_schema.sql"
  echo "-- Paste this whole file into a fresh Supabase project's SQL editor,"
  echo "-- then run create-admin.sql to promote the owner account."
  echo "-- ============================================================"
  echo
  for f in "${files[@]}"; do
    echo "-- >>>>>>>>>> BEGIN $f >>>>>>>>>>"
    cat "$db/$f"
    echo
    echo "-- <<<<<<<<<< END $f <<<<<<<<<<"
    echo
  done
} > "$out"

echo "Wrote $out ($(wc -l < "$out") lines)"
