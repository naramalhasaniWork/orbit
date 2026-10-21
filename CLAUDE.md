# Orbit — AI-Native Testing Platform

## Project Overview

Orbit is an AI-native testing platform that combines deep code-awareness (like Cursor) with live app-awareness (browser agent) into a single autonomous testing system. Users connect a repo, Orbit indexes it, generates a test plan, and executes it against their staging environment — automatically, continuously, and intelligently.

**Target users:** Developers and small engineering teams (2-10 person startups) shipping fast with AI coding tools, plus development agencies.

**Core differentiator:** Code-aware + app-aware + fully autonomous + continuously updated. No competitor does all four.

## Architecture

### Four-Agent System

1. **Analyst Agent** — Repo indexing & System Map generation (classification/extraction task)
2. **Planner Agent** — Test plan generation from System Map (reasoning + adversarial thinking)
3. **Executor Agent** — Browser-based test execution via Playwright + Stagehand (vision + action)
4. **Reporter Agent** — Results analysis, failure explanations, bug reports (writing + reasoning)

### Service Architecture

- **Indexing Service** (`src/services/indexing/`) — tree-sitter AST parsing with regex fallback, framework detection (Next.js, Express, React, Django, FastAPI, Rails, GraphQL, tRPC), route/component extraction, embedding generation
- **Planning Service** (`src/services/planning/`) — LLM-backed test plan generation, coverage analysis, journey reconstruction, prioritization scoring, plan caching in Postgres
- **Execution Service** (`src/services/execution/`) — Playwright browser orchestration via remote CDP, Stagehand v3 adapter for Browserbase, self-healing selectors, evidence capture (screenshots, video, DOM snapshots)
- **Reporting Service** (`src/services/reporting/`) — AI failure analysis, GitHub PR comments/checks, Linear issue creation, Slack webhook notifications
- **Agent Orchestrator** (`src/services/orchestrator/`) — Multi-agent coordination, token budgets, context management via cosine similarity, run lifecycle management
- **API Gateway** — Next.js API routes at `src/app/api/`

### Data Layer

- **PostgreSQL + pgvector** — Primary DB on Railway, vector embeddings for semantic retrieval
- **Redis** — BullMQ job queues, rate limiting, pub/sub
- **S3/R2** — Screenshots, videos, DOM snapshots, artifacts via `@aws-sdk/client-s3`
- **Browserbase** — Cloud browser infrastructure (optional, local Playwright by default)

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Framework:** Next.js 14+ App Router (standalone output for Docker)
- **ORM:** Prisma 7 with `@prisma/adapter-pg`
  - Schema: `prisma/schema.prisma` (19 models, 10 enums, 44 indexes)
  - Client generated to: `src/generated/prisma/`
  - Import: `import { prisma } from "@/lib/db"`
- **Database:** PostgreSQL on Railway with pgvector v0.8.1
- **Queue:** BullMQ on Redis (`src/lib/queue/`)
- **Browser:** Playwright (remote CDP via `PLAYWRIGHT_WS_ENDPOINT`) + Stagehand v3
- **AST Parsing:** web-tree-sitter with WASM binaries, regex fallback (`src/services/indexing/ast-parser-regex.ts`)
- **AI:** Anthropic Claude + OpenAI, model routing per task type (`src/lib/ai/model-router.ts`)
- **Auth:** NextAuth v4 with GitHub OAuth, JWT strategy, auto workspace provisioning
- **UI:** shadcn/ui primitives on the Telemetry tokens (`src/app/globals.css`), Instrument Sans + Martian Mono + Geist Mono, motion from `src/lib/motion.ts`
- **Testing:** Vitest (`pnpm test`)
- **Deployment:** Dockerfile (Railway via `railway.toml`, or `docker-compose.yml` for self-hosting); see `docs/self-hosting/`

## Infrastructure Details

### Railway Services

| Service | Purpose | Key Env Var |
|---------|---------|-------------|
| PostgreSQL (pgvector) | Primary database | `DATABASE_URL` |
| Redis | Queues, pub/sub | `REDIS_URL` |
| Playwright | Headless browser | `PLAYWRIGHT_WS_ENDPOINT` |
| Next.js App | Web + API | `PORT=3000` |

### Environment Variables

All env vars documented in `.env.example`. Critical ones:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `NEXTAUTH_SECRET` — JWT signing key (`openssl rand -base64 32`)
- `NEXTAUTH_URL` — Deployment URL
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth app credentials
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — AI provider keys
- `PLAYWRIGHT_WS_ENDPOINT` — Remote browser CDP URL
- `ENCRYPTION_KEY` — AES-256 key for vault (`openssl rand -hex 32`)

### Database Migrations

Prisma migrations are the single source of truth for the database schema. Never use raw SQL scripts or `prisma db push` in production.

```bash
pnpm db:generate        # Regenerate Prisma client after schema changes
pnpm db:migrate         # Create a new migration (dev) — interactive, names the migration
pnpm db:migrate:deploy  # Apply pending migrations (production) — non-interactive
pnpm db:migrate:status  # Check which migrations have been applied
pnpm db:push            # Sync schema without migration file (prototyping only)
pnpm db:seed            # Seed demo data
```

**Workflow for schema changes:**
1. Edit `prisma/schema.prisma`
2. Run `pnpm db:migrate` — creates a migration file in `prisma/migrations/`
3. Review the generated SQL
4. Commit the migration file with your code changes
5. On deploy, `prisma migrate deploy` runs automatically (configured in `railway.toml` and `Dockerfile`)

**Rules:**
- Never modify the database directly with raw SQL — always go through migrations
- Never use `prisma db push` on the production database
- Never create manual SQL sync scripts — they cause column name drift
- The `prisma/migrations/` directory must be committed to git
- Baseline migration `0_init` captures the full schema as of 2026-02-20

## File Structure

```
src/
  app/                    # Next.js App Router pages + API routes
    api/                  # 28 API endpoints
    dashboard/            # Dashboard pages (map, plans, runs, settings, onboarding)
    login/                # GitHub OAuth login
  agents/
    prompts/              # 4 agent prompt builders (analyst, planner, executor, reporter)
    schemas/              # Zod schemas for agent I/O
  components/
    dashboard/            # System Map, health strip, sparklines, active run bar
    layout/               # Sidebar, header, project selector
    onboarding/           # 6-step wizard (connect repo → first run)
    runs/                 # Run list, run detail, filters
    plans/                # Plan list, plan detail, coverage map
    settings/             # Project, environment, secret, workspace settings
    shared/               # Loading spinner, empty state, error boundary, status dot
    ui/                   # shadcn/ui primitives
  hooks/                  # Custom hooks (use-run-events SSE, use-projects)
  lib/
    ai/                   # AI client, model router, provider wrappers
    auth/                 # NextAuth config + helpers
    db/                   # Prisma client singleton
    queue/                # BullMQ queues + worker handlers
    redis/                # ioredis connection
    storage/              # S3 storage provider
    vault/                # AES-256-GCM encrypt/decrypt
    websocket/            # SSE event emitters
    utils/                # API helpers, slug generation, validation
  services/
    execution/            # Browser manager, step executor, self-healer, evidence collector, Stagehand adapter
    indexing/             # Clone, fingerprint, framework detector, AST parser, system map builder, pipeline
    orchestrator/         # Mode selector, context manager, token budget, run manager, pipeline
    planning/             # Coverage analyzer, journey reconstructor, test case generator, prioritizer
    reporting/            # Failure analyzer, report generator, GitHub/Linear/Slack integrations
  workers/                # BullMQ worker entry point
prisma/
  schema.prisma           # 19 models, 10 enums
  migrations/             # Prisma migration files (committed to git, auto-applied on deploy)
    0_init/               # Baseline migration — full schema snapshot
  seed.ts                 # Seed orchestrator
  seed-data.ts            # Demo data (45 nodes, 52 edges, 15 test cases, 5 runs)
  seed-helpers.ts         # Idempotent DB operations
```

## Key Patterns

### API Route Pattern
All API routes use shared helpers from `src/lib/utils/api.ts`:
```typescript
import { requireWorkspace, apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
```
- `requireWorkspace()` — Gets authenticated user's workspace (throws on no auth)
- `apiSuccess(data, status?)` — Consistent success response
- `apiError(message, code, status)` — Consistent error response

### Real-Time Updates
Uses Server-Sent Events (SSE) instead of WebSocket:
- `src/app/api/projects/[projectId]/runs/[runId]/progress/route.ts` — Run progress SSE
- `src/app/api/projects/[projectId]/sync/progress/route.ts` — Indexing progress SSE
- `src/hooks/use-run-events.ts` — Client-side EventSource hook

### Vault Encryption
```typescript
import { encrypt, decrypt } from "@/lib/vault";
const { encrypted, iv } = encrypt(plaintext);
const plaintext = decrypt(encrypted, iv);
```

### Model Routing
```typescript
import { getModelForTask } from "@/lib/ai/model-router";
const model = getModelForTask("test_planning"); // Returns appropriate model ID
```
Task types: `classification`, `extraction`, `test_planning`, `browser_execution`, `failure_analysis`, `report_generation`, `security_testing`

### System Map Visualization
The default view is a layered left→right map (routes → components → APIs → data), not force-directed:
- Layout, journey path and change impact in `src/lib/map/layered.ts`; rendering in `src/components/dashboard/layered-map.tsx`
- Border style encodes node type (solid route, dashed component, double API, filled data); a 4px mark carries test status
- `?view=impact` highlights nodes changed in the last sync plus their dependents; `?view=3d` lazy-loads `system-map-3d.tsx`
- Click-to-inspect with detail panel (`?node=`)

## Coding Standards

- **Max 300 lines per file** — Refactor proactively when approaching this
- **Single responsibility** — One component/function does one thing well
- **TypeScript strict mode** — Minimize `any` usage (only for third-party library boundaries like web-tree-sitter)
- **Functional components** — No classes
- **Interfaces over types** — Maps over enums
- **Named exports** — For components and utilities
- **Server components by default** — `'use client'` only when needed
- **Prisma for all DB access** — Never raw SQL except for pgvector operations in `src/lib/db/vector.ts`
- **Prisma migrations for all schema changes** — Never modify the DB directly (see Database Migrations section)
- **Zod validation** — All API inputs validated, all agent outputs parsed with Zod schemas
- **Never mock in production** — Mocks only in `src/__tests__/` files
- **No orphan files** — Delete old versions when refactoring
- **Atomic commits** — Clear messages, no temp files
- **No hardcoded credentials** — Never commit database URLs, API keys, or secrets to code or scripts

## Security

- Secrets encrypted at rest (AES-256-GCM) via `src/lib/vault/`
- Secrets never logged or displayed in UI (masked with `••••••`)
- Row-level tenant isolation via `workspaceId` on every table
- HMAC-SHA256 webhook signature verification
- All sensitive logic server-side
- Never hardcode secrets — use env vars

## Testing

Run tests with:
```bash
pnpm test        # Run all tests
pnpm test:watch  # Watch mode
```

Test structure:
- `src/__tests__/unit/` — Unit tests for vault, model router, prioritizer, etc.
- `src/__tests__/integration/` — API route tests, pipeline tests

## Agent Definitions

Agent prompt definitions live in `.claude/agents/`. Use these when spawning specialized work:
- `analyst.md` — Repo indexing, System Map construction
- `planner.md` — Test plan generation, coverage analysis
- `executor.md` — Browser test execution, self-healing
- `reporter.md` — Results analysis, integration reporting
- `orchestrator.md` — Multi-agent coordination
- `dashboard.md` — UI development, mission-control aesthetic
- `indexing-service.md` — Indexing pipeline implementation
- `integrations.md` — GitHub/Linear/Slack connectors

## License and Ownership

Copyright (c) 2026 Naram Alhasani (personally). Everything outside `src/ee/` is AGPL-3.0-only (`LICENSE`); `src/ee/` is under the commercial Orbit Enterprise License (`src/ee/LICENSE`). See `COPYRIGHT`.

- Paid features live in `src/ee/` and are gated with `eeLicenseRequired()` / `hasEeLicense()` (offline Ed25519 check of `ORBIT_EE_LICENSE_KEY` against the embedded `EE_PUBLIC_KEY`; keys issued with `scripts/ee/issue-license.ts`; the private key never enters the repo). Currently gated: audit log CSV export.
- Gating another existing core feature is an owner decision; never cripple self-hosting of the core.
- Contributions need the CLA (`.github/CLA.md`). No per-file license headers.

## Deployment

Railway deploys via `railway.toml` (nixpacks builder). The build pipeline:
1. `pnpm install` — Install dependencies
2. `pnpm prisma generate` — Generate Prisma client
3. `pnpm prisma migrate deploy` — Apply any pending migrations
4. `pnpm build` — Build Next.js (standalone output)

The `Dockerfile` mirrors this pipeline for alternative deployment targets.

**Key deploy practices:**
- Migrations run automatically on every deploy — no manual DB work needed
- Schema changes must include a migration file (created via `pnpm db:migrate`)
- The healthcheck endpoint is `/api/auth/session`
- Storage path is `/data/storage` on Railway (volume mount at `/data`)

## Common Tasks

### Adding a new API endpoint
1. Create route file at `src/app/api/[path]/route.ts`
2. Use `requireWorkspace()` for auth
3. Validate input with Zod
4. Return with `apiSuccess()` / `apiError()`

### Adding a new dashboard page
1. Create page at `src/app/dashboard/[name]/page.tsx` (server component)
2. Create client component at `src/components/[name]/[name]-client.tsx`
3. Fetch data server-side, pass as props to client component

### Adding a new service
1. Create directory at `src/services/[name]/`
2. Define types and Zod schemas
3. Wire to BullMQ queue in `src/lib/queue/queues.ts`
4. Add worker handler in `src/lib/queue/worker-handlers.ts`

### Running the full pipeline
Trigger flow: GitHub webhook → BullMQ job → Indexing → Planning → Execution → Reporting
Manual trigger: POST `/api/projects/[projectId]/runs` with `{ mode, trigger }`
