# Orbit

**Your Codebase Already Knows What to Test**

Orbit is an AI-native testing platform that reads your repo, understands your application architecture, and generates a complete test suite — then executes it in real browsers against your staging environment. No test engineers. No hand-written scripts. Autonomous QA that updates every time your code changes.

## What It Does

1. **Connect your repo** via GitHub OAuth
2. **Orbit indexes it** in under 2 minutes — detecting frameworks, routes, components, APIs, auth flows, and data models
3. **A test plan appears** — prioritized by criticality, risk, and coverage gaps
4. **Tests run in real browsers** — navigating your app, filling forms, clicking buttons, verifying outcomes
5. **Results land where you work** — GitHub PR checks, Linear comments, Slack notifications, VS Code inline

## Key Features

- **System Map** — Interactive graph of your entire application architecture, built from AST parsing with tree-sitter
- **AI Test Generation** — Prioritized test cases covering user journeys, API contracts, auth flows, forms, and edge cases
- **Real Browser Execution** — Playwright + Stagehand running tests in actual Chromium instances
- **Self-Healing Selectors** — AI adapts to UI changes automatically; no broken tests from CSS refactors
- **Continuous on Every PR** — Diff-aware regression runs targeting only changed code paths
- **AI Failure Analysis** — Plain-English explanations of what broke, why, and how to fix it
- **Integrations** — GitHub Checks, Linear, Slack, VS Code extension, CLI, MCP server

## Architecture

Orbit uses a four-agent system where specialized AI agents handle distinct phases:

| Agent | Role | Model |
|-------|------|-------|
| **Analyst** | Indexes repos, builds the System Map | Haiku (fast classification) |
| **Planner** | Generates prioritized test plans | Sonnet (reasoning) |
| **Executor** | Runs tests in real browsers | Sonnet + Vision |
| **Reporter** | Synthesizes results, posts reports | Sonnet (writing) |

### Compile-and-replay

The Executor's first passing run of a browser case is compiled into a replay script (`test_scripts`): one resolved action per step, with css / role+name / test-id / text locators and a deterministic assertion for every step. If a step has no assertion of its own, one cheap model call derives one, and it must already hold on the page captured after that step. If any step still lacks an assertion, the case stays agent-only.

Later runs replay the script with zero model calls. When a step diverges, the agent takes over the live page from that step, and a passing heal is saved as the next script version. Scripts are keyed by environment, role and viewport. They are ignored when the case's steps change. Scripts covering changed code are marked `suspect`. The agent re-verifies 1 in 20 replays, and any script it hasn't verified for 14 days. Replay is benched for a case when more than 30% of its last 10 replays diverged.

`GET /api/admin/execution-cost?since=<ISO>` reports model calls and estimated $ per 100 executions by mode (agent / replay / replay_healed). `GET /api/projects/:id/test-cases/:caseId/script.spec.ts` exports a script as a Playwright test.

### Tech Stack

- **Framework:** Next.js 14+ App Router (TypeScript strict)
- **Database:** PostgreSQL + pgvector for semantic retrieval
- **Queue:** BullMQ on Redis
- **Browser Automation:** Playwright + Stagehand (Browserbase)
- **AST Parsing:** tree-sitter (100+ languages)
- **AI Providers:** Anthropic Claude + OpenAI (model routing per task)
- **Auth:** NextAuth with GitHub OAuth
- **Real-time:** Socket.io for live run progress

## Project Structure

```
src/
  app/
    (admin)/          # Super admin dashboard
    (auth)/           # Authentication pages
    (dashboard)/      # Main application dashboard
    (marketing)/      # Landing pages and marketing site
    api/              # API routes (REST + webhooks)
  agents/             # Agent prompt templates (operator + user layers)
  components/         # React components (shadcn/ui based)
  hooks/              # Custom React hooks
  lib/                # Shared utilities, DB client, auth config
  server/
    engine/           # Unified case runner, case executors, compile-and-replay
  services/
    indexing/         # Repo indexing, tree-sitter parsing, System Map
    planning/         # Test plan generation, coverage analysis
    execution/        # Browser orchestration, Playwright runners
    reporting/        # Results synthesis, report generation
    orchestrator/     # Multi-agent coordination, token budgets
    integrations/     # Linear, GitHub, Slack connectors
    mcp/              # MCP server for editor integrations
    ai-suggestions/   # AI-powered test suggestions
  workers/            # BullMQ job processors
  types/              # Shared TypeScript interfaces
```

## Quick Start (development)

### Prerequisites

- Node.js 20
- pnpm (version pinned by `packageManager` in `package.json`)
- PostgreSQL 16+ with the pgvector extension
- Redis

### Setup

```bash
git clone https://github.com/your-org/orbit.git
cd orbit
pnpm install

cp .env.example .env.local     # then fill in values
pnpm db:migrate:deploy         # apply migrations
pnpm dev
```

The app runs at `http://localhost:3000`. Background workers (BullMQ) start in-process
with the web server via `src/instrumentation.ts` (`ORBIT_ROLE=all`, the default). To run them in
their own container set `ORBIT_ROLE=web` on the server and `ORBIT_ROLE=worker` on a second container
(see `docs/self-hosting/railway.md`). `pnpm workers` starts workers alone for development; don't run it
next to a server that also runs them, or the two just share the queues.

Generate the two required secrets:

```bash
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"; echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

Optional demo data: `pnpm db:seed`. When changing `prisma/schema.prisma`, create a migration
with `pnpm db:migrate` (never `db push` against a shared database). Read the generated SQL before
committing it: it must never contain `DROP INDEX` for the search indexes that `src/lib/db/vector.ts`
builds at startup. `system_map_nodes_name_trgm_idx` is declared in the schema for that reason; the
HNSW and full-text expression indexes are invisible to Prisma, so it leaves them alone.

### Data access

API routes read and write through `ctx.db`, the caller's workspace scope from
`src/server/data/scope.ts`: every query gets its tenant filter added, and `await ctx.db.project(id)`
is the only way to a project's rows (404 for another workspace's project). Writes cannot move a row
to another tenant or connect another tenant's rows (nested `connect`/`set`/`upsert` are refused),
child rows (results, messages) are created only under a parent the scope can see, and global
tables other than the caller's own workspace row and read-only platform tables are not on `ctx.db`.
Workers and the engine
use `forSystem()`. `.eslintrc.json` bans `@/lib/db` and `@/generated/prisma` in `src/app/api` and
`src/components`; files not yet migrated sit in an allowlist override there, which only shrinks.
The `tenantGuard` extension throws on an unscoped tenant query in dev and tests and logs in
production (`ORBIT_TENANT_GUARD=throw|log|off` overrides). Real-Postgres suites run when
`ORBIT_TEST_DATABASE_URL` points at a migrated database.

## Environment Variables

Required for every deployment:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (pgvector required) |
| `REDIS_URL` | Redis connection string (BullMQ queues, pub/sub) |
| `NEXTAUTH_URL` | Public URL of the app |
| `NEXTAUTH_SECRET` | JWT signing secret |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Credentials of your **GitHub App** (login and repo access; plain OAuth Apps are not supported) |
| `ENCRYPTION_KEY` | Key for the secrets vault; losing it makes stored secrets unreadable |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `ORBIT_OPENAI_COMPATIBLE_BASE_URL` | AI chat providers; at least one is required (or `ORBIT_AI_KEYS=byok`). `ORBIT_EMBEDDINGS=openai\|voyage\|ollama\|none` picks the embedding provider; `none` uses keyword search |
| `PLAYWRIGHT_WS_ENDPOINT` | Remote browser (browserless). Falls back to local Chromium if unset |

**GitHub setup:** create one GitHub App for both login and repo access. Set its callback URL to `<NEXTAUTH_URL>/api/auth/callback/github`, its setup URL to `<NEXTAUTH_URL>/api/github/installations/callback`, and enable "Request user authorization (OAuth) during installation". Also set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` and `GITHUB_APP_SLUG` (required at boot unless `ORBIT_SELF_HOSTED=true`, where only a warning is logged). Permissions come from the App's configuration; OAuth scopes are not requested. On self-hosted instances `GITHUB_TOKEN` is used only for public repos unless `ORBIT_GITHUB_TOKEN_FALLBACK=true`; it is never used on hosted Orbit.

`STORAGE_PROVIDER` is `local`, `s3` or `r2`; `s3` and `r2` need `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `r2` also needs `S3_ENDPOINT`. Anything else fails at boot.

Everything else (storage, GitHub App, GitLab, Linear, Slack, Stripe, `ORBIT_*` deployment
flags, `SUPER_ADMIN_EMAILS`) is optional and documented in [`.env.example`](./.env.example).

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server (standalone) |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run tests with Vitest |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate` | Create and apply a migration (dev) |
| `pnpm db:migrate:deploy` | Apply pending migrations (production) |
| `pnpm db:migrate:status` | Show migration status |
| `pnpm db:seed` | Load demo data |
| `pnpm db:studio` | Open Prisma Studio |

## Deployment

Orbit is a single web service plus Postgres, Redis and a headless-browser sidecar.
The container applies pending migrations (`prisma migrate deploy`) on start, then runs the server.
Health check: `GET /api/health` (returns 503 naming the failed dependency).

### Self-host with Docker Compose

```bash
cp .env.selfhost.example .env     # fill in secrets, OAuth app, AI keys
docker compose up -d
```

Starts `web`, `postgres` (pgvector), `redis` and `browser` (browserless). Artifacts are stored
in the `storage-data` volume.

### Railway

See [docs/self-hosting/railway.md](./docs/self-hosting/railway.md) for the services, then [docs/self-hosting/first-run.md](./docs/self-hosting/first-run.md) for the first-run walkthrough (`/setup` checklist, GitHub App, first admin login).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, coding standards, and PR guidelines.

## License

Proprietary. Copyright Naram Alhasani. All rights reserved.
