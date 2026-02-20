# Contributing to Orbit

## Development Setup

### Prerequisites

- **Node.js** 18+ (recommend using `nvm` or `fnm`)
- **pnpm** (`corepack enable` to activate)
- **PostgreSQL** 15+ with pgvector extension
- **Redis** 7+
- **Git**

### First-Time Setup

```bash
# Clone and install
git clone https://github.com/your-org/orbit.git
cd orbit
pnpm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your database, Redis, and API keys

# Push schema to database
pnpm db:push

# Start dev server
pnpm dev
```

### Database Setup

If running PostgreSQL locally, enable pgvector:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

For Railway PostgreSQL, pgvector is available as an add-on in the service settings.

### Running the Full Stack

You need two processes for the complete development experience:

```bash
# Terminal 1: Next.js dev server
pnpm dev

# Terminal 2: Background workers (indexing, execution, reporting)
pnpm workers
```

## Coding Standards

### TypeScript

- **Strict mode**, zero `any`. If you need to type something loosely, use `unknown` and narrow.
- **Interfaces** over types for object shapes.
- **Maps** over enums for string constants.
- **Named exports** for all components and functions.

### React

- **Server components** by default. Add `'use client'` only when the component needs browser APIs, event handlers, or hooks.
- **Functional components** only, no classes.
- **Mobile-first** responsive design with Tailwind.

### File Organization

- **Max 300 lines per file.** If approaching this, refactor into smaller modules.
- **Single responsibility** per file.
- **Colocation** — keep a component with its helpers and types.
- **Directory naming** — lowercase with dashes (`services/indexing-service`).

### Agent Prompts

- System prompts use two layers: **Operator** (Orbit-controlled) and **User** (workspace-customizable).
- Agent outputs are always **structured JSON**, never prose.
- Include safety guidelines in every operator prompt.
- Use the cheapest sufficient model per task (see model routing in `src/agents/`).

## Branch Strategy

- `main` is the production branch.
- Create feature branches from `main`: `feature/your-feature-name`.
- Keep PRs focused — one feature or fix per PR.

## Pull Requests

### Before Submitting

1. **Run the linter:** `pnpm lint`
2. **Run tests:** `pnpm test`
3. **Verify the build:** `pnpm build`
4. Remove any debug logging, `console.log`, or temporary code.

### PR Guidelines

- Write a clear title describing what changed and why.
- Include a brief description of the approach.
- Link to any related issues or spec sections.
- Keep diffs small. If a change is large, break it into reviewable chunks.

### Commit Messages

Use clear, imperative commit messages:

```
Add self-healing selector logic to executor agent
Fix auth redirect loop on expired sessions
Update System Map to handle monorepo cross-package edges
```

Avoid vague messages like "fix bug", "update stuff", or "WIP".

## Testing

- **Vitest** for unit and integration tests.
- **Playwright** for browser-level E2E tests.
- Write a test for the bug before fixing it.
- No mock data outside of test files.
- Test files live next to the code they test or in `src/__tests__/`.

```bash
pnpm test          # Run all tests once
pnpm test:watch    # Run tests in watch mode
```

## Security

- Never commit `.env` or `.env.local` files.
- Never hardcode secrets — use environment variables.
- Sensitive logic stays server-side (API routes, server components).
- Validate and sanitize all user input on the server.
- Secrets in the vault are encrypted with AES-256 — never log or display them.

## Project Architecture Reference

Refer to `CLAUDE.md` for the full architecture overview, agent system details, and service descriptions. The detailed product spec is in `Orbit System Brief/orbit-spec.md`.

## Questions

If something is unclear, open a discussion or ask in the team Slack channel before implementing. It is better to ask than to guess.
