# Deploying Orbit on Railway

By default Orbit is **one web service**: BullMQ workers run in-process (`ORBIT_ROLE=all`, the default;
`src/instrumentation.ts` calls `registerWorkers()` on boot). For scale, split into a web service and a
worker service, see [Split mode](#split-mode-web--worker). Never run both `all` and `worker` against the
same Redis unless you want the extra capacity: they share the queues.

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

- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (the GitHub App's OAuth credentials; can be left blank until `/setup`, see [first-run.md](./first-run.md))
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY` (also used for embeddings)
- `SUPER_ADMIN_EMAILS` (comma-separated)

## After deploying

Open the `web` service's public domain (generate one under Settings > Networking if missing). A new
instance redirects to `/setup`, which checks the deployment and walks through the GitHub App.
The full walkthrough, with exact field values and troubleshooting, is in
[first-run.md](./first-run.md). The first account to sign in becomes the admin.

## Split mode (web + worker)

Same image, two services, selected by `ORBIT_ROLE`:

| Service | `ORBIT_ROLE` | Config file | Notes |
|---------|--------------|-------------|-------|
| `web` | `web` | `railway.toml` | HTTP only. Health check `/api/health` |
| `worker` | `worker` | `railway.worker.toml` | Runs `worker.mjs`; no HTTP, no health check |

Give `worker` the same variables as `web` (DB, Redis, browser, storage, AI keys). Migrations do **not** run
in split mode on boot. Set a pre-deploy command on `web` (service settings, or `preDeployCommand` in
`railway.toml`): `["cd /prisma && node node_modules/prisma/build/index.js migrate deploy"]`.
Worker deploys that need new schema should wait for the web deploy.

Both configs set `drainingSeconds = 90` (the gap between SIGTERM and SIGKILL). On SIGTERM a worker stops
taking jobs, finishes the current test case, and the run resumes on the next worker. Self-hosting with
Compose: `docker compose --profile split up -d` with `ORBIT_ROLE=web` on `web`, and run migrations first
with `docker compose run --rm -e ORBIT_ROLE=migrate web`. Failed jobs that used all their retries land
in **Admin > Jobs** where they can be retried or discarded.

## Migrations

For `ORBIT_ROLE=all`, `scripts/start.sh` runs `prisma migrate deploy` before the server starts. To run migrations as a
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

### Data backfills (release step)

Some releases move existing data as well as schema. Each move ships as an idempotent script in
`prisma/backfills/` (bundled into the image as `./backfills/*.mjs`). Run them once per release, after
`migrate deploy` and before the new version takes traffic:

- `ORBIT_ROLE=all` or `ORBIT_ROLE=migrate`: set `ORBIT_RUN_BACKFILLS=true` and `scripts/start.sh` runs every
  backfill, in name order, after the migrations. A failing backfill stops the start.
- Railway split mode: use `["sh", "-c", "ORBIT_ROLE=migrate ORBIT_RUN_BACKFILLS=true ./start.sh"]` as the
  pre-deploy command instead of the bare `migrate deploy` above (it runs both).
- Compose: `docker compose run --rm -e ORBIT_ROLE=migrate -e ORBIT_RUN_BACKFILLS=true web`.
- From a checkout: `pnpm backfill:20261025` with `DATABASE_URL` and `ENCRYPTION_KEY` set.

Backfills are safe to rerun: they insert with `ON CONFLICT DO NOTHING`, never overwrite rows the app
wrote since, and leave the old data in place. They need the same `ENCRYPTION_KEY` as the app, since
plaintext secrets are sealed on the way in.

**20261025_integrations** moves integration config out of the settings JSON:

| From | To |
|------|----|
| `workspace.settings` `linearApiKey` / `linearTeamId` / `linear` | `IntegrationConfig` (provider `linear`) |
| `workspace.settings` `slackWebhookUrl` / `slack` | `IntegrationConfig` (provider `slack`) |
| `project.settings` Linear/Slack overrides | the workspace's `IntegrationConfig`, only if it has none |
| `project.settings.webhooks` | `WebhookEndpoint` (same ids, secrets sealed) |
| `project.settings.testingNotes` | `ProjectNote` (same ids) |

Until it has run, readers fall back to the old keys and log `config read fell back to legacy settings`
(field `legacyRead`). Once that line stops appearing, the old keys can be stripped in a later release.
The completion line lists `conflicts`: project overrides left in `project.settings` because the
workspace already had its own connection. Review those before the old keys go.
