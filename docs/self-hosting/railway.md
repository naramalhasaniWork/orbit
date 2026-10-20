# Deploying Orbit on Railway

Orbit v1 is **one web service**. BullMQ workers run in-process (`src/instrumentation.ts`
calls `registerWorkers()` on boot), so there is no separate worker service. Do not add one.

Services in the project:

| Service | Source | Notes |
|---------|--------|-------|
| `web` | This repo (Dockerfile) | Builds via `railway.toml`; health check `/api/health` |
| `Postgres` | Docker image `pgvector/pgvector:pg16` | Must include pgvector. Add a volume at `/var/lib/postgresql/data` |
| `Redis` | Railway Redis | |
| `browserless` | Docker image `ghcr.io/browserless/chromium` | Headless browsers over the private network |

## What was verified against Railway's docs (Oct 2026)

- Config as Code (`railway.toml` / `railway.json`) works per service: `[build] builder = "DOCKERFILE"`,
  `[deploy] healthcheckPath`, `healthcheckTimeout`, `restartPolicyType = "ON_FAILURE"`.
  Railway marks Config as Code **deprecated** (legacy files keep working until 2026-12-01) in favor of
  Infrastructure as Code (`.railway/railway.ts`). The IaC reference does not yet document a Dockerfile
  build option or custom database images, so this repo stays on `railway.toml` for now.
- Railway's docs describe creating templates only through the dashboard (Templates > New Template, or
  "Generate Template from Project"). There is no documented file format for a multi-service template, so
  none is committed here. Build the template once in the dashboard using the settings below.
- Template variable function: `${{secret(length, alphabet)}}` (32 chars by default).
- Reference variables: `${{Service.VAR}}`. System variables: `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_PRIVATE_DOMAIN`.
- Not verified: whether Railway's own Postgres offers pgvector. Use the pgvector image above.

## Variables for `web`

```
DATABASE_URL=${{Postgres.DATABASE_URL}}          # pgvector image: build the URL from POSTGRES_* if no DATABASE_URL is exposed
REDIS_URL=${{Redis.REDIS_URL}}
NEXTAUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
PLAYWRIGHT_WS_ENDPOINT=ws://${{browserless.RAILWAY_PRIVATE_DOMAIN}}:3000?token=${{browserless.TOKEN}}
NEXTAUTH_SECRET=${{secret(44)}}
ENCRYPTION_KEY=${{secret(64, "abcdef0123456789")}}
ORBIT_SELF_HOSTED=true
STORAGE_PROVIDER=local                            # add a volume mounted at /data/storage, or use s3 (see .env.example)
```

`browserless` needs `TOKEN=${{secret(32)}}` and its own port set to `3000` (`PORT=3000`).
Generated secrets are created once at deploy time. Do not regenerate `ENCRYPTION_KEY` later:
stored integration secrets become unreadable.

If your Postgres image does not expose `DATABASE_URL`, set it explicitly:
`postgres://${{Postgres.POSTGRES_USER}}:${{Postgres.POSTGRES_PASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.POSTGRES_DB}}`.

## Asked at deploy time (template prompts)

Mark these as user-provided with no default:

- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (GitHub OAuth app)
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY` (also used for embeddings)
- `SUPER_ADMIN_EMAILS` (comma-separated)

## After deploying

1. Open the `web` service's public domain (generate one under Settings > Networking if missing).
2. Create a GitHub OAuth app at https://github.com/settings/developers with
   Homepage URL `https://<domain>` and callback `https://<domain>/api/auth/callback/github`.
   Put its client id/secret into the `web` variables and redeploy.
3. Sign in with an email listed in `SUPER_ADMIN_EMAILS`.

## Migrations

`scripts/start.sh` runs `prisma migrate deploy` before the server starts. To run migrations as a
Railway pre-deploy step instead, set `ORBIT_SKIP_MIGRATIONS=true` on `web` and configure the
pre-deploy command in the service settings (`cd /prisma && node node_modules/prisma/build/index.js migrate deploy`).

### Existing databases created with `db push`

The 20261020 migration is idempotent, but older migrations are not: on a database that already has
the schema but no `_prisma_migrations` history, mark the baseline as applied first:

```bash
cd /prisma
for m in 0_init 20260220_add_conversations_messages 20260224_add_environment_error_verdict; do
  node node_modules/prisma/build/index.js migrate resolve --applied "$m"
done
```

Then deploy as usual; the drift migration only adds what is missing.
