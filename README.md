# Orbit

AI-native testing platform. Connect your repo, get autonomous test coverage.

## Architecture

Orbit uses a four-agent system:

- **Analyst** — Indexes repos, builds the System Map (code understanding)
- **Planner** — Generates prioritized test plans from the System Map
- **Executor** — Runs tests in real browsers via Playwright + Stagehand
- **Reporter** — Synthesizes results, posts to Linear/GitHub/Slack

## Tech Stack

- TypeScript / Next.js 14+ App Router
- PostgreSQL + pgvector
- Redis + BullMQ
- Playwright + Stagehand (Browserbase)
- tree-sitter for AST parsing
- Claude + OpenAI (model routing per task)

## Getting Started

```bash
pnpm install
cp .env.example .env.local
# Fill in your env vars
pnpm dev
```

## Project Structure

```
src/
  app/              # Next.js App Router pages
  components/       # React components
  lib/              # Shared utilities
  services/
    indexing/        # Repo indexing & System Map
    planning/        # Test plan generation
    execution/       # Browser test execution
    reporting/       # Results & integrations
    orchestrator/    # Agent coordination
  agents/            # Agent prompt templates
  integrations/      # Linear, GitHub, Slack, etc.
```

## MVP Scope

Sections from the spec targeted for v1:
- Repo Indexing & System Map (Section 2)
- Test Planning Engine (Section 3)
- Test Execution Engine (Section 4)
- Dashboard: onboarding + main view (Section 8)
