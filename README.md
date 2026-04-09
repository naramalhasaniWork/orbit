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

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL with pgvector extension
- Redis

### Setup

```bash
# Clone the repo
git clone https://github.com/your-org/orbit.git
cd orbit

# Install dependencies
pnpm install

# Copy environment file and fill in values
cp .env.example .env.local

# Push database schema
pnpm db:push

# Start the dev server
pnpm dev
```

The app runs at `http://localhost:3000`.

### Running Workers

Test execution and indexing jobs run on background workers:

```bash
pnpm workers
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (must have pgvector) |
| `REDIS_URL` | Yes | Redis connection string (for BullMQ + sessions) |
| `NEXTAUTH_URL` | Yes | App URL (`http://localhost:3000` for dev) |
| `NEXTAUTH_SECRET` | Yes | Random secret (`openssl rand -base64 32`) |
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth app client secret |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude models |
| `OPENAI_API_KEY` | Yes | OpenAI API key for embeddings + routing |
| `ENCRYPTION_KEY` | Yes | AES-256 key for secrets vault (`openssl rand -hex 32`) |
| `PLAYWRIGHT_WS_ENDPOINT` | No | Remote Playwright server (local Chromium used if not set) |
| `BROWSERBASE_API_KEY` | No | Browserbase cloud browser API key |
| `BROWSERBASE_PROJECT_ID` | No | Browserbase project ID |
| `STORAGE_PROVIDER` | No | `local`, `s3`, or `r2` (default: `local`) |
| `S3_BUCKET` | No | S3/R2 bucket for artifacts |
| `S3_REGION` | No | S3 region |
| `S3_ACCESS_KEY_ID` | No | S3 access key |
| `S3_SECRET_ACCESS_KEY` | No | S3 secret key |
| `S3_ENDPOINT` | No | Custom S3 endpoint (for R2) |
| `LINEAR_API_KEY` | No | Linear integration API key |
| `SLACK_BOT_TOKEN` | No | Slack bot OAuth token |
| `SLACK_SIGNING_SECRET` | No | Slack request signing secret |
| `GITHUB_WEBHOOK_SECRET` | No | GitHub webhook HMAC secret |

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run tests with Vitest |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:push` | Push schema to database |
| `pnpm db:studio` | Open Drizzle Studio (DB browser) |
| `pnpm db:migrate` | Run pending migrations |
| `pnpm workers` | Start BullMQ background workers |

## Deployment

### Vercel (Web)

Deploy the Next.js app to Vercel. Set all required environment variables in the Vercel dashboard.

### Railway (Database + Redis + Workers)

Orbit uses Railway for PostgreSQL (with pgvector), Redis, and worker processes:

1. Create a Railway project with PostgreSQL and Redis services
2. Enable the pgvector extension on PostgreSQL
3. Deploy the worker service using `pnpm workers` as the start command
4. Set environment variables referencing Railway's internal connection strings

### Docker

```dockerfile
FROM node:18-alpine AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, coding standards, and PR guidelines.

## License

Proprietary. Copyright Naram Alhasani. All rights reserved.
