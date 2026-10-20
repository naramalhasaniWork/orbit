#!/bin/sh
# Container entrypoint. ORBIT_ROLE selects what this container runs:
#   all     (default) web server + in-process workers; applies migrations first
#   web     web server only; no workers, no migrations
#   worker  BullMQ workers only (dist/worker.mjs); no HTTP, no migrations
# In split mode (web + worker) run migrations once as a release step, not per
# container: Railway preDeployCommand or `docker compose run --rm web migrate`
# (see docs/self-hosting/railway.md). ORBIT_SKIP_MIGRATIONS=true skips them for role=all.
# ORBIT_RUN_BACKFILLS=true also runs the idempotent data backfills (./backfills/*.mjs,
# in name order) after the migrations; see docs/self-hosting/railway.md.
set -eu

ROLE="${ORBIT_ROLE:-all}"

migrate() {
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[start] DATABASE_URL is not set" >&2
    exit 1
  fi
  echo "[start] Applying database migrations"
  (cd /prisma && node node_modules/prisma/build/index.js migrate deploy)
  if [ "${ORBIT_RUN_BACKFILLS:-}" = "true" ]; then
    for backfill in ./backfills/*.mjs; do
      [ -e "$backfill" ] || continue
      echo "[start] Running backfill $(basename "$backfill" .mjs)"
      node "$backfill"
    done
  fi
}

case "$ROLE" in
  all)
    if [ "${ORBIT_SKIP_MIGRATIONS:-}" != "true" ]; then migrate; fi
    # The in-process workers drain on SIGTERM (instrumentation.ts); stop Next
    # from exiting first.
    export NEXT_MANUAL_SIG_HANDLE=true
    exec node server.js
    ;;
  web)
    exec node server.js
    ;;
  worker)
    exec node worker.mjs
    ;;
  migrate)
    migrate
    ;;
  *)
    echo "[start] Unknown ORBIT_ROLE '$ROLE' (expected all, web, worker)" >&2
    exit 1
    ;;
esac
