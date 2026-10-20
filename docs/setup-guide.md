# Orbit Setup Guide

Get Orbit running locally in under 15 minutes.

## Prerequisites

- **Node.js 18+** ([nodejs.org](https://nodejs.org))
- **pnpm** (`npm install -g pnpm`)
- **Railway account** (for managed PostgreSQL + Redis) or local Docker
- **GitHub OAuth App** (for authentication)
- **Anthropic API key** and/or **OpenAI API key** (for AI agents)

---

## Quick Start (5 minutes)

```bash
# 1. Clone the repo
git clone <your-repo-url> orbit
cd orbit

# 2. Install dependencies
pnpm install

# 3. Copy environment template
cp .env.example .env.local

# 4. Fill in your values in .env.local (see sections below)

# 5. Push schema to database
pnpm prisma db push

# 6. Generate Prisma client
pnpm prisma generate

# 7. Seed demo data
pnpm db:seed

# 8. Start development server
pnpm dev
```

Visit **http://localhost:3000** and sign in with one of the [test accounts](#test-accounts).

---

## Environment Variable Reference

### Database (Required)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Must have pgvector extension enabled. |
| `REDIS_URL` | Yes | Redis connection string. Used for BullMQ job queues and caching. |

### Authentication (Required)

| Variable | Required | Description |
|---|---|---|
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App Client ID. See [GitHub OAuth Setup](#github-oauth-setup). |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub OAuth App Client Secret. |
| `NEXTAUTH_URL` | Yes | Base URL of your app. `http://localhost:3000` for local dev. |
| `NEXTAUTH_SECRET` | Yes | Random string for session encryption. Generate with `openssl rand -base64 32`. |

### AI Providers (At least one required)

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Recommended | Anthropic API key from [console.anthropic.com](https://console.anthropic.com). Used for Planner and Reporter agents. |
| `OPENAI_API_KEY` | Optional | OpenAI API key from [platform.openai.com](https://platform.openai.com). Used for embeddings and fallback. |

### Browser Automation (Required for test execution)

| Variable | Required | Description |
|---|---|---|
| `PLAYWRIGHT_WS_ENDPOINT` | For remote | WebSocket URL for headless Playwright instance. Format: `ws://host:port`. |
| `USE_STAGEHAND` | Optional | Set to `true` to enable Stagehand AI-assisted browser actions. |
| `BROWSERBASE_API_KEY` | Optional | Browserbase API key for cloud browser infrastructure. |
| `BROWSERBASE_PROJECT_ID` | Optional | Browserbase project identifier. |

### Storage (Optional)

| Variable | Required | Description |
|---|---|---|
| `STORAGE_PROVIDER` | No | `local` (default), `s3`, or `r2`. Controls where screenshots/videos are saved. |
| `STORAGE_PATH` | No | Local storage directory. Default: `./storage`. |
| `S3_BUCKET` | If S3/R2 | S3 bucket name for artifacts. |
| `S3_REGION` | If S3 | AWS region (e.g., `us-east-1`). |
| `S3_ACCESS_KEY_ID` | If S3/R2 | AWS/R2 access key. |
| `S3_SECRET_ACCESS_KEY` | If S3/R2 | AWS/R2 secret key. |
| `S3_ENDPOINT` | If R2 | Cloudflare R2 endpoint URL. |
| `S3_PUBLIC_URL` | No | Optional CDN URL for public artifact access. |

### Encryption (Required)

| Variable | Required | Description |
|---|---|---|
| `ENCRYPTION_KEY` | Yes | AES-256 key for encrypting stored secrets. Generate with `openssl rand -hex 32`. |

### Webhooks (Optional)

| Variable | Required | Description |
|---|---|---|
| `GITHUB_WEBHOOK_SECRET` | For webhooks | Shared secret for verifying GitHub webhook payloads. Unsigned or unverifiable deliveries are rejected (503 when unset). |

### Integrations (Optional)

| Variable | Required | Description |
|---|---|---|
| `LINEAR_API_KEY` | No | Linear API key for creating bug reports from test failures. |
| `LINEAR_TEAM_ID` | No | Linear team to file issues against. |
| `SLACK_BOT_TOKEN` | No | Slack bot token for sending test run notifications. |
| `SLACK_SIGNING_SECRET` | For Slack | Slack signing secret for verifying requests. Slack endpoints return 503 when unset. |
| `SLACK_WEBHOOK_URL` | No | Slack incoming webhook URL for notifications. |

---

## GitHub OAuth Setup

1. Go to **GitHub Settings > Developer Settings > OAuth Apps > New OAuth App**
2. Fill in:
   - **Application name**: `Orbit Dev` (or any name)
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
3. Click **Register application**
4. Copy the **Client ID** into `GITHUB_CLIENT_ID`
5. Click **Generate a new client secret** and copy it into `GITHUB_CLIENT_SECRET`
6. For production: update the callback URL to your deployed app URL (e.g., `https://orbit.yourapp.com/api/auth/callback/github`)

---

## Database Setup

### Option A: Railway (Recommended)

1. Create a [Railway](https://railway.app) project
2. Add a **PostgreSQL** service (Railway supports pgvector natively)
3. Copy the connection string from the service's **Connect** tab
4. Set it as `DATABASE_URL` in `.env.local`
5. Enable pgvector:
   ```bash
   # Using node (if psql is not installed)
   node -e "
   const { Client } = require('pg');
   const c = new Client({ connectionString: process.env.DATABASE_URL });
   c.connect().then(() => c.query('CREATE EXTENSION IF NOT EXISTS vector'))
    .then(() => { console.log('pgvector enabled'); c.end(); });
   "
   ```
6. Push the schema:
   ```bash
   pnpm prisma db push
   ```
7. Generate the client:
   ```bash
   pnpm prisma generate
   ```

### Option B: Local Docker

```bash
# Start PostgreSQL with pgvector
docker run -d --name orbit-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=orbit \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# Enable the extension
docker exec -it orbit-pg psql -U postgres -d orbit -c "CREATE EXTENSION vector;"
```

Set `DATABASE_URL=postgres://postgres:postgres@localhost:5432/orbit` in `.env.local`.

### Seeding Data

```bash
pnpm db:seed
```

This creates demo data including 3 test accounts, a sample project with system map (45 nodes, 52 edges), test plans (15 cases), and 5 test runs. The seed is idempotent and safe to run multiple times.

---

## Test Accounts

After running `pnpm db:seed`, these accounts are available:

| Email | Role | Workspace |
|---|---|---|
| admin@orbit-test.com | Admin | Orbit Demo |
| member@orbit-test.com | Member | Orbit Demo |
| viewer@orbit-test.com | Viewer | Orbit Demo |

See [docs/test-accounts.md](./test-accounts.md) for full details on demo data.

---

## Redis Setup

### Option A: Railway (Recommended)

1. Add a **Redis** service to your Railway project
2. Copy the connection string from the **Connect** tab
3. Set it as `REDIS_URL` in `.env.local`

### Option B: Local Docker

```bash
docker run -d --name orbit-redis -p 6379:6379 redis:7-alpine
```

Set `REDIS_URL=redis://localhost:6379` in `.env.local`.

---

## Connecting Services

### Playwright (Browser Automation)

Orbit uses Playwright for executing browser-based tests. You can run it locally or as a remote service.

**Local (development):**
No extra config needed. Playwright runs in-process. Install browsers:
```bash
npx playwright install chromium
```

**Remote (production/Railway):**
Deploy a headless Playwright service and set:
```
PLAYWRIGHT_WS_ENDPOINT=ws://your-playwright-host:3000
```

For Railway, deploy a Playwright Docker image (e.g., `browserless/chrome`) and use its internal URL.

### S3/R2 Artifact Storage

For production, configure cloud storage for screenshots, videos, and DOM snapshots:

**AWS S3:**
```
STORAGE_PROVIDER=s3
S3_BUCKET=orbit-artifacts
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
```

**Cloudflare R2:**
```
STORAGE_PROVIDER=r2
S3_BUCKET=orbit-artifacts
S3_ACCESS_KEY_ID=your-r2-access-key
S3_SECRET_ACCESS_KEY=your-r2-secret-key
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
```

### GitHub Webhooks

To trigger test runs on push/PR events:

1. In your GitHub repo, go to **Settings > Webhooks > Add webhook**
2. **Payload URL**: `https://your-orbit-url/api/webhooks/github`
3. **Content type**: `application/json`
4. **Secret**: Generate a random string and set it as `GITHUB_WEBHOOK_SECRET`
5. **Events**: Select "Push events" and "Pull request events"

### Linear Integration (Optional)

1. Get an API key from **Linear > Settings > API > Personal API keys**
2. Set `LINEAR_API_KEY` and `LINEAR_TEAM_ID` in `.env.local`
3. Orbit will create Linear issues for test failures

### Slack Integration (Optional)

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps)
2. Add the `chat:write` bot scope
3. Install to your workspace
4. Set `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`
5. Or use an incoming webhook: set `SLACK_WEBHOOK_URL`

---

## Railway Deployment

The repo includes `railway.toml` and `Dockerfile` pre-configured for Railway.

**What the build does:**
- Installs dependencies with pnpm (frozen lockfile)
- Generates Prisma client
- Builds Next.js in standalone mode
- Produces a minimal Docker image (~150MB)

**What the runtime does:**
- Runs `node server.js` (Next.js standalone)
- Healthcheck on `/api/health` (30s timeout)
- Restarts on failure (max 3 retries)
- Exposes port 3000

### Step-by-Step

1. **Create a Railway project** at [railway.app](https://railway.app)

2. **Add PostgreSQL service**
   - Click "New Service" > "Database" > "PostgreSQL"
   - Railway includes pgvector support
   - Enable pgvector: run `CREATE EXTENSION IF NOT EXISTS vector;` via the Railway SQL editor or a node script (see Database Setup above)

3. **Add Redis service**
   - Click "New Service" > "Database" > "Redis"

4. **Deploy the Next.js app**
   - Click "New Service" > "GitHub Repo" > select your repo
   - Railway detects the `railway.toml` and uses the Dockerfile builder
   - The build automatically runs `prisma generate` and `next build`

5. **Set environment variables**
   - Go to your app service > "Variables"
   - Add all required env vars from the reference above
   - Use Railway's variable references for DB/Redis: `${{Postgres.DATABASE_URL}}` and `${{Redis.REDIS_URL}}`
   - Set `NEXTAUTH_URL` to your Railway app URL (e.g., `https://orbit-production.up.railway.app`)

6. **Run migrations** (first deploy only)
   - In the Railway shell or via local CLI pointed at Railway DB:
     ```bash
     DATABASE_URL="your-railway-postgres-url" pnpm prisma db push
     ```

7. **Seed data (optional)**
   ```bash
   DATABASE_URL="your-railway-postgres-url" pnpm db:seed
   ```

8. **Configure GitHub webhook** (optional)
   - Set the payload URL to `https://your-railway-app.up.railway.app/api/webhooks/github`

---

## Running Tests

```bash
# Run all tests (unit + integration)
pnpm test

# Run tests in watch mode
pnpm test:watch

# Seed demo data for visual testing
pnpm db:seed
```

---

## Available Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start development server on port 3000 |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run test suite |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm prisma db push` | Push schema to database |
| `pnpm prisma generate` | Generate Prisma client |
| `pnpm db:seed` | Seed demo data |
| `pnpm workers` | Start BullMQ background workers |

---

## Architecture Overview

```
Browser (Next.js App)
    |
    v
Next.js API Routes ---- NextAuth (GitHub OAuth)
    |
    +---> PostgreSQL (pgvector)  <-- Schema, embeddings, all data
    |
    +---> Redis                  <-- BullMQ queues, sessions, caching
    |
    +---> Playwright             <-- Browser automation for test execution
    |
    +---> Anthropic / OpenAI     <-- AI agents (Analyst, Planner, Executor, Reporter)
    |
    +---> S3 / R2 (optional)     <-- Screenshots, videos, artifacts
    |
    +---> Linear / Slack (opt.)  <-- Bug reports, notifications
```

**Key connections:**
- `DATABASE_URL` connects Next.js + Workers to PostgreSQL
- `REDIS_URL` connects Next.js + Workers to Redis (BullMQ)
- `PLAYWRIGHT_WS_ENDPOINT` connects Executor to headless browsers
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` connects AI agents to LLM providers
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` enables GitHub sign-in
- `ENCRYPTION_KEY` encrypts user secrets at rest

---

## Troubleshooting

**"pgvector extension not found"**
Run `CREATE EXTENSION IF NOT EXISTS vector;` on your database. Railway supports this natively.

**"NEXTAUTH_SECRET not set"**
Generate one: `openssl rand -base64 32` and add to `.env.local`.

**"Cannot connect to database"**
Check that your `DATABASE_URL` is correct and the database is accessible from your network. Railway URLs work from any network.

**"Prisma client not generated"**
Run `pnpm prisma generate` after any schema changes.

**"Redis connection refused"**
Verify `REDIS_URL` and that Redis is running. For local dev: `docker run -d -p 6379:6379 redis:7-alpine`.
