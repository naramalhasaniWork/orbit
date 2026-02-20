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

- **Indexing Service** — tree-sitter AST parsing, framework detection, route/component extraction, embeddings
- **Planning Service** — LLM-backed test plan generation, caching in Postgres
- **Execution Service** — Playwright browser orchestration, BullMQ job distribution, artifact capture
- **Reporting Service** — Linear/GitHub/Slack integrations, formatted reports
- **Agent Orchestrator** — Multi-agent coordination, token budgets, context passing
- **API Gateway** — Next.js API routes, webhook ingestion

### Data Layer

- **PostgreSQL + pgvector** — Primary DB, vector embeddings for semantic retrieval
- **Redis** — BullMQ job queues, sessions, rate limiting, WebSocket pub/sub, prompt cache
- **S3/R2** — Screenshots, videos, DOM snapshots, artifacts
- **Browserbase** — Cloud browser infrastructure for test execution

## Tech Stack

- **Language:** TypeScript (strict mode, no `any`)
- **Framework:** Next.js 14+ App Router
- **ORM:** Prisma 7 with `@prisma/adapter-pg` (schema in `prisma/schema.prisma`, client generated to `src/generated/prisma`)
- **Database:** PostgreSQL on Railway (embeddings stored as JSONB for now)
- **Queue:** BullMQ on Redis
- **Browser Automation:** Playwright + Stagehand (Browserbase)
- **AST Parsing:** tree-sitter
- **AI Providers:** Anthropic (Claude), OpenAI — model routing per task type
- **Auth:** NextAuth v4 with GitHub OAuth + Prisma adapter
- **Deployment:** Vercel (web) + Railway (workers + DB + Redis)

## Coding Standards

### File Organization
- Max 300 lines per file. Refactor proactively.
- Single responsibility per file.
- Colocation: component + helpers + types together.
- Directories: lowercase with dashes (`services/indexing-service`).

### TypeScript
- Strict mode, zero `any`.
- Functional components, no classes.
- Interfaces over types.
- Maps over enums.
- Named exports.
- Server components by default, `'use client'` only when needed.

### Agent Prompt Development
- System prompts use the two-layer architecture: **Operator Layer** (Orbit-controlled, not user-editable) + **User Layer** (workspace-customizable).
- Agent outputs must always be structured JSON, never prose.
- Include safety guidelines in every operator prompt: never delete data, never submit payment forms, always use test credentials.
- Model routing: use cheapest sufficient model per task (Haiku for classification, Sonnet for reasoning, Opus for security testing).

### Testing (Orbit-specific)
- Orbit dogfoods itself — use Orbit to test Orbit.
- Browser tests use Playwright + Stagehand.
- API tests validate against Zod schemas.
- All test data is cleaned up via teardown hooks.

### Security
- Secrets encrypted at rest (AES-256).
- Secrets never logged or displayed in UI (masked with `••••••`).
- Browser execution in ephemeral containers.
- Row-level tenant isolation via `workspace_id` on every table.
- Zero plaintext API key storage — hash and compare.
- All inter-service communication over TLS.

## Key Domain Concepts

- **System Map** — Directed graph of routes, components, endpoints, data models, auth strategies. Orbit's internal representation of the target application.
- **Test Plan** — Prioritized list of test cases with descriptions, expected behaviors, coverage targets. Structured JSON, not prose.
- **Test Run** — An execution of test cases against a target environment. Captures pass/fail, screenshots, videos, network logs.
- **Self-Healing** — When selectors break, Stagehand + LLM attempt to find the matching element before failing.
- **Flaky Test Registry** — Tracks tests with inconsistent results for quarantine and investigation.
- **Credit System** — Unit of consumption billing. ~1 credit per test case execution.

## Database Access

- Import `prisma` from `@/lib/db` for all database operations.
- Schema is defined in `prisma/schema.prisma` — run `npx prisma generate` after schema changes.
- Use `prisma.modelName.findMany()`, `prisma.modelName.create()`, etc. for all queries.
- All tables use UUID primary keys and `workspace_id` for tenant isolation.

## Working Conventions

- When implementing a service, check the spec in `Orbit System Brief/orbit-spec.md` for detailed requirements.
- Use the agent definitions in `.claude/agents/` when spawning specialized work.
- Never mock external services in production code — mocks only in test files.
- Build for the MVP scope first: Indexing (Section 2), Planning (Section 3), Execution (Section 4), Dashboard onboarding + main view (Section 8).
# Cursor Development Rules

## Core Philosophy

1. **Simplicity** - Simple, clear, maintainable solutions. No over-engineering.
2. **Iterate** - Extend existing code, don't rebuild from scratch unless necessary.
3. **Focus** - Stick to the task. No scope creep.
4. **Modular** - Everything that can be a component should be. Reuse relentlessly.
5. **Clean** - Working directory stays clean. No orphan files, no accumulation.

## Code Organization

### File Structure
- **Max 300 lines per file** - Refactor proactively when approaching this.
- **Single responsibility** - One component/function does one thing well.
- **Colocation** - Keep related code together (component + its helpers/types).
- **Directory naming** - Lowercase with dashes (`components/auth-wizard`).

### Modularity Rules
- Break large components into smaller, reusable pieces.
- Extract repeated logic into shared utilities.
- Before creating anything new, check if it exists or can extend something existing.
- **No duplicate code** - If you're copy-pasting, you're doing it wrong.

### Clean Working Directory
- **No temp files** - Don't create files named "temp", "test", "old", "v2", etc.
- **No orphans** - If you replace/refactor something, delete the old version.
- **No one-time scripts** - Don't commit utility scripts to main codebase.
- **Edit in place** - Modify existing files, don't duplicate and rename.

## Documentation

### What We Maintain
1. **`README.md`** - Project overview, setup, architecture. Update when these change.
2. **`dev_log.md`** - Brief, dated entries for significant changes only. Keep entries concise (2-3 lines max per entry).
3. **User Guides** - Live alongside their feature. Update the guide when updating the feature.

### What We Don't Create
- No `status.md`, `tasks.md`, or task tracking files
- No `fixes/` directory or fix documentation files
- No `architecture.md` or `technical.md` sprawl
- No documentation for documentation's sake

### User Guide Pattern
```
feature/
├── component.tsx
├── utils.ts
└── GUIDE.md  # Only if feature needs user-facing docs
```

Update `GUIDE.md` **in the same PR/commit** as the feature change. Not separately, not later.

## Code Style (TypeScript/React/Next.js)

- TypeScript strict mode, no `any`.
- Functional components, no classes.
- Interfaces over types.
- Maps over enums.
- Named exports for components.
- Shadcn UI + Radix + Tailwind for styling.
- Server components by default, `'use client'` only when necessary.
- Mobile-first responsive design.

### Next.js Specifics
- Params are Promises - always `await params` in page components.
- No duplicate route paths.
- Favor SSR and server components.

### PowerShell Note
```powershell
# Use semicolons, not &&
cd prisma; npx prisma studio
```

## Task Execution

1. **Understand** - Read the request fully before starting.
2. **Check existing** - Look for code to extend before creating new.
3. **Plan** - One logical change at a time.
4. **Implement** - Edit existing files when possible.
5. **Clean up** - Remove dead code, unused imports, orphan files.
6. **Verify** - Test the change works, check console for errors.

## Debugging

- **Fix root cause**, not symptoms.
- Check console output after every change.
- Add targeted logging for complex issues.
- Research before deep-diving (docs, web search).

## Testing

- Tests must pass before considering work complete.
- Write test for bug before fixing it.
- **No mock data** outside test files.

## Security

- Sensitive logic stays server-side.
- Validate/sanitize all user input on server.
- Never hardcode secrets - use env vars.
- Never commit `.env` files.

## Git

- Atomic commits with clear messages.
- No temp/unrelated files committed.
- Kill old servers before starting new ones.

## AI Collaboration

- Be specific about what you want.
- Question AI output - verify logic, don't trust blindly.
- For code adjustments, show only the changed lines + minimal context.
- If something's unclear, ask before implementing.

---

**NEVER BUILD WITH MOCK DATA**

**ALWAYS USE `prisma db push` FOR DB UPDATES**

