#!/bin/sh
# Container entrypoint: apply pending migrations, then start the Next.js server.
# Set ORBIT_SKIP_MIGRATIONS=true to start without migrating (e.g. when migrations
# run as a separate release step).
set -eu

if [ "${ORBIT_SKIP_MIGRATIONS:-}" != "true" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[start] DATABASE_URL is not set" >&2
    exit 1
  fi
  echo "[start] Applying database migrations"
  (cd /prisma && node node_modules/prisma/build/index.js migrate deploy)
fi

exec node server.js
