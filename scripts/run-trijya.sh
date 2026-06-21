#!/usr/bin/env bash
# Run the white-label TRIJYA FORGE instance on http://localhost:3001
#
# Isolated from the primary (RIG FORGE) instance:
#   - own Postgres schema  (trijya, in the same Supabase project for now)
#   - own Next build dir    (.next-trijya, via NEXT_DIST_DIR)
#   - own branding          (NEXT_PUBLIC_APP_NAME / _SHORT)
#
# Secrets are read from .env.local (gitignored) — nothing sensitive lives here.
# For a real separate-company deployment, point DATABASE_URL/DIRECT_URL at a
# dedicated database instead of the &schema=trijya namespace.
set -euo pipefail
cd "$(dirname "$0")/.."

DEV_DB=$(grep -E '^DATABASE_URL=' .env.local | head -1 | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')
DEV_DIRECT=$(grep -E '^DIRECT_URL=' .env.local | head -1 | sed 's/^DIRECT_URL=//; s/^"//; s/"$//')

export NEXT_DIST_DIR=".next-trijya"
export DATABASE_URL="${DEV_DB}&schema=trijya"
export DIRECT_URL="${DEV_DIRECT}?schema=trijya"
export NEXT_PUBLIC_APP_NAME="TRIJYA FORGE"
export NEXT_PUBLIC_APP_SHORT="TF"

exec npx next dev -p 3001
