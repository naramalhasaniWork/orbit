# Orbit Engineering Audit Report

**Date:** 2026-02-20
**Scope:** Full codebase audit of `/src` — services, API routes, components, infrastructure
**Files examined:** 100+ source files across all layers
**Prisma schema:** 1,338 lines, 40+ models

---

## 1. Working Features (Production-Quality Code)

### Indexing Service — Fully Implemented
The entire indexing pipeline is real, end-to-end.

- **Pipeline orchestrator** (`src/services/indexing/pipeline.ts`, 286 lines) — Full clone-to-embedding pipeline with WebSocket progress emission, error handling per phase, and `lastIndexedAt` timestamp update.
- **Repository cloning** (`src/services/indexing/clone.ts`, 277 lines) — GitHub API content-based cloning (not `git clone`, which is the right call for serverless). GitLab and Bitbucket adapters exist. File filtering by extension. Storage upload per file.
- **AST parsing** (`src/services/indexing/ast-parser.ts`, 297 lines) — Tree-sitter WASM initialization with lazy loading for TypeScript and JavaScript grammars. Extracts exports, imports, functions, classes, components, types, and env vars. Falls back to regex parser when tree-sitter is unavailable.
- **Regex fallback parser** (`src/services/indexing/ast-parser-regex.ts`, 140 lines) — Standalone regex-based parser used when WASM isn't available (e.g., edge runtime). Works.
- **Framework detection** (`src/services/indexing/framework-detector.ts`, 188 lines) — Detects Next.js, Express, React, Django, FastAPI, Rails, GraphQL, tRPC with confidence scores from package.json analysis and file pattern matching.
- **Route extraction** (`src/services/indexing/route-extractor.ts`, 67 lines) — Delegates to framework-specific adapters (nextjs, express, generic).
- **System map builder** (`src/services/indexing/system-map-builder.ts`, 306 lines) — Builds nodes (routes, components, endpoints, models, middleware) and edges in PostgreSQL via Prisma. Properly handles re-indexing with deletion of previous nodes/edges.
- **Component mapper** (`src/services/indexing/component-mapper.ts`, 193 lines) — Builds component dependency graph from AST import analysis.
- **Embedding generator** (`src/services/indexing/embedding-generator.ts`, 132 lines) — OpenAI text-embedding-3-small with batching and pgvector storage via raw SQL.
- **Fingerprinting** (`src/services/indexing/fingerprint.ts`, 162 lines) — Language detection, package manager detection, monorepo detection.

### Planning Service — Fully Implemented

- **Planner** (`src/services/planning/planner.ts`, 117 lines) — Orchestrates coverage analysis + journey reconstruction + test case generation + prioritization + storage. Caches to DB.
- **Test case generator** (`src/services/planning/test-case-generator.ts`, 310 lines) — LLM-backed test generation with sub-agent journey analysis for complex journeys (>5 nodes). Visual regression case generation. Zod schema validation of LLM output. Builds operator+user prompt layers.
- **Coverage analyzer** (`src/services/planning/coverage-analyzer.ts`, 155 lines) — Matches test case names to system map nodes, computes per-type and per-journey coverage percentages.
- **Journey reconstructor** (`src/services/planning/journey-reconstructor.ts`, 162 lines) — Graph-based journey reconstruction using keyword patterns (auth, onboarding, dashboard, settings, checkout, CRUD).

### Execution Service — Fully Implemented

- **Runner** (`src/services/execution/runner.ts`, 255 lines) — Sequential and parallel test execution with cancellation checks, flaky quarantine skipping, WebSocket progress emission, outbound webhook delivery.
- **Browser manager** (`src/services/execution/browser-manager.ts`, 196 lines) — Playwright Chromium launch (local or remote CDP via `BROWSERBASE_CDP_URL`). Page state extraction with interactive element discovery.
- **Stagehand adapter** (`src/services/execution/stagehand-adapter.ts`, 175 lines) — Wraps `@browserbasehq/stagehand` v3 for act/observe/close. Falls back to local Playwright if Stagehand unavailable.
- **Step executor** (`src/services/execution/step-executor.ts`, 358 lines) — LLM decision loop for browser actions, selector memory pre-application, retry + self-healing on failures, Stagehand delegation.
- **Self-healer** (`src/services/execution/self-healer.ts`, 292 lines) — 6-strategy healing chain: stored mapping, text content, ARIA label, role-based, LLM healing, sub-agent healing. Stores successful mappings for future reuse.
- **Evidence collector** (`src/services/execution/evidence-collector.ts`, 262 lines) — Captures screenshots (PNG), video (Playwright tracing), network logs, console logs, DOM snapshots. Uploads to storage, creates `RunArtifact` DB records.
- **Test case executor** (`src/services/execution/test-case-executor.ts`, 203 lines) — Full lifecycle: launch browser, navigate, execute steps, retry for flaky detection, collect evidence, close browser.
- **Action performer** (`src/services/execution/action-performer.ts`, 126 lines) — Performs navigate, click, fill, select, hover, scroll, press_key, wait, assert, screenshot, and verdict actions.
- **Environment validator** (`src/services/execution/environment-validator.ts`, 160 lines) — URL reachability validation, production domain blocking, secret decryption.

### Orchestrator — Fully Implemented

- **Pipeline** (`src/services/orchestrator/pipeline.ts`, 407 lines) — Full 4-phase pipeline (indexing, audit, planning, execution, reporting) with cancellation checks between phases, token budget tracking per agent phase, distributed tracing, credit deduction.
- **Run manager** (`src/services/orchestrator/run-manager.ts`, 207 lines) — Run CRUD, cancellation (in-memory Set + DB flag), status updates with WebSocket emission, result aggregation.

### Reporting — Fully Implemented

- **Failure analyzer** (`src/services/reporting/failure-analyzer.ts`, 169 lines) — LLM-based failure analysis with Zod-validated `BugReport` output (severity, rootCause, suggestedFix, affectedComponent, reproSteps).
- **Report generator** (`src/services/reporting/report-generator.ts`, 239 lines) — LLM-generated run summaries with historical comparison to previous runs.
- **Reporter** (`src/services/reporting/reporter.ts`, 308 lines) — Full pipeline: analyze failures, generate report, trigger integrations (GitHub, Linear, Slack, outbound webhooks).
- **GitHub integration** (`src/services/reporting/integrations/github.ts`, 287 lines) — PR comments (with upsert to avoid duplicates), GitHub Check Runs with annotations.
- **Linear integration** (`src/services/reporting/integrations/linear.ts`, 306 lines) — GraphQL-based issue creation and comments with assignee resolution.
- **Slack integration** (`src/services/reporting/integrations/slack.ts`, 272 lines) — Block Kit formatted notifications and failure alerts with action buttons.
- **Outbound webhooks** (`src/services/reporting/integrations/outbound-webhooks.ts`, 283 lines) — HMAC-signed webhook delivery with exponential backoff, 7 event types.

### AI Infrastructure — Fully Implemented

- **Provider abstraction** (`src/lib/ai/index.ts`, 89 lines) — Routing to Anthropic, OpenAI, or OpenRouter based on model prefix.
- **Model router** (`src/lib/ai/model-router.ts`, 430 lines) — Task-to-model mapping with DB-backed overrides, workspace API key decryption, cost estimation, global model policy filtering.
- **Tracked completion** (`src/lib/ai/tracked-completion.ts`, 104 lines) — Wraps completions with automatic token usage recording.
- **Anthropic provider** (`src/lib/ai/providers/anthropic.ts`, 149 lines) — Real SDK calls with retry/exponential backoff + streaming support.
- **OpenAI provider** (`src/lib/ai/providers/openai.ts`, 151 lines) — Real SDK calls with retry/exponential backoff + embeddings.

### Queue Infrastructure — Fully Implemented

- **Queue definitions** (`src/lib/queue/queues.ts`, 114 lines) — 4 BullMQ queues (indexing, execution, reporting, scheduler) with Zod-validated job schemas, retry policies.
- **Workers** (`src/lib/queue/workers.ts`, 97 lines) — BullMQ worker registration for all 4 queues with scheduler repeatable job.
- **Worker handlers** (`src/lib/queue/worker-handlers.ts`, 274 lines) — Job handlers for indexing (with incremental support), execution, reporting with error handling and WebSocket emission.

### Auth — Fully Implemented

- **NextAuth** (`src/lib/auth/index.ts`, 140 lines) — GitHub + GitLab OAuth, JWT sessions (4-hour), workspace auto-creation on first login, super admin promotion via env var, GitHub access token persistence for background workers.

### Billing — Fully Implemented

- **Token tracker** (`src/lib/billing/token-tracker.ts`, 94 lines) — Per-model cost calculation and recording to DB.
- **Usage aggregator** (`src/lib/billing/usage-aggregator.ts`, 249 lines) — Workspace/project usage summaries, daily trends, budget limit checks.
- **Stripe client** (`src/lib/stripe/client.ts`, 28 lines) — Lazy initialization via Proxy.
- **Stripe webhook handler** (`src/app/api/webhooks/stripe/route.ts`, 106 lines) — Signature verification, idempotency check, event routing to handlers.
- **Billing API routes** — Checkout, portal, usage, invoices, subscription, analytics, credits.

### Webhook Infrastructure — Fully Implemented

- **GitHub webhook** (`src/app/api/webhooks/github/route.ts`, 192 lines) — HMAC signature verification, push and PR event handling, triggers indexing + run creation via BullMQ.
- **Delivery logging** — All webhook deliveries recorded in `WebhookDelivery` table.

### Other Working Services

- **pgvector** (`src/lib/db/vector.ts`, 132 lines) — Extension setup, HNSW index creation, embedding CRUD, similarity search.
- **Storage** (`src/lib/storage/index.ts`, 126 lines) — Local filesystem + S3/R2 abstraction with auto-directory creation.
- **WebSocket** (`src/lib/websocket/index.ts`, 172 lines) — Redis pub/sub emission for run, test, and indexing events.
- **MCP server** (`src/services/mcp/server.ts`, 207 lines) — 7 tool definitions with routing.
- **Visual QA** (`src/services/visual-qa/visual-test-runner.ts`, 184 lines) — Screenshot capture, baseline comparison, brand color checking.
- **Scheduler** (`src/services/scheduler/index.ts`, 111 lines) — Cron-based scheduled runs.
- **Knowledge embedder** (`src/services/knowledge/embedder.ts`, 134 lines) — Chunk embedding and semantic search.

### Dashboard & UI Components — Extensive

- **20 dashboard pages** covering projects, runs, plans, map, settings, billing, audit, onboarding, profile, plugins, providers, agents, MCP, knowledge, members.
- **100+ React components** across 18 directories: admin, audit, billing, dashboard, execution, integrations, layout, marketing, onboarding, plans, project, projects, providers, runs, settings, shared, team, UI.
- **Dashboard server page** (`src/app/(dashboard)/dashboard/page.tsx`, 155 lines) — Real data fetching: projects, recent runs, stats, active run, system map nodes/edges, indexing queue status.

### API Routes — Extensive

- **80+ API route files** covering projects, runs, plans, sync, environments, secrets, system-map, coverage, trends, flaky-tests, events, suggestions, export/import, webhook-deliveries, health, billing, admin, workspaces, members, invitations, providers, prompts, models, mcp, visual-tests, audit-logs, schedules, baselines, traces, screenshots, artifacts, failure-patterns, diff-analysis, and more.
- **v1 API namespace** — Public API routes mirroring internal routes for external integrations.

### Test Suite

- **21 test files** (7 unit, 8+ integration) covering vault, prioritizer, mode-selector, token-budget, slug, flaky-registry, environment-validator, framework-detector, model-router, openrouter, prompt-builder, mcp-client, api-projects, api-runs, api-webhooks, api-secrets, pipeline, api-providers, api-prompts, api-admin-models.

---

## 2. Partially Working

### Git History Integration
- **File:** `src/services/planning/test-case-generator.ts`, line 250
- **Issue:** `gitHistory: []` with comment "Git history integration deferred to indexing service"
- **Impact:** Test generation cannot factor in recently changed code when prioritizing which paths to test. The planner context type defines `gitHistory` as an input field, but it always receives an empty array. This means targeted/regression modes are less intelligent than they could be — they cannot weight test cases toward recently modified code.
- **Severity:** Medium. The planner still works, it just lacks git-based prioritization signals.

### Outbound Webhook Delivery (Legacy Path)
- **File:** `src/lib/webhooks/deliver.ts`, lines 36-38
- **Issue:** Uses dynamic Prisma model access `prisma["webhook"]` to find registered webhooks. The Prisma schema has `WebhookSubscription` (mapped to `webhook_subscriptions`), not `webhook`. This code will silently return `[]` every time because the model name doesn't match.
- **Note:** This is the OLDER delivery system. The codebase has a NEWER, working system at `src/services/reporting/integrations/outbound-webhooks.ts` that reads webhook config from `project.settings.webhooks` JSON field instead. The new system works correctly. The old `deliver.ts` is still imported in `runner.ts` but will be a no-op.
- **Severity:** Low. The working path (`outbound-webhooks.ts`) is used by the reporter. The broken path in `deliver.ts` is dead code in practice.

### Dual Execution Paths
Two different code paths exist for executing tests:

1. **Orchestrator pipeline** (`src/services/orchestrator/pipeline.ts`) — Runs the full index-plan-execute-report cycle sequentially. Used by the scheduler and the orchestrator pipeline directly. Calls `executeRun()` in `runner.ts`.
2. **API route queue-based** (`src/app/api/projects/[projectId]/runs/route.ts`) — Creates a run, then enqueues individual test cases as separate BullMQ jobs via `getExecutionQueue()`. The worker handler processes them one-by-one.

These are not necessarily conflicting — the API route provides fine-grained per-test-case queuing for manual runs, while the orchestrator runs the full pipeline for automated triggers. But the worker handler for execution jobs processes individual test cases, whereas `runner.ts` loads and executes all test cases for a run. If both paths are triggered for the same run, results could conflict.

- **Severity:** Medium. Needs clear documentation or a single unified entry point.

---

## 3. Stub / Placeholder

### Marketing Pages
- **Blog** (`src/app/(marketing)/blog/page.tsx`) — "Coming soon" placeholder
- **API Docs** (`src/app/(marketing)/docs/api/page.tsx`) — "Coming soon" placeholder
- **Impact:** None on core functionality. These are marketing pages, not application features.

### No Other Stubs Found
A comprehensive grep for `TODO`, `FIXME`, `HACK`, `WORKAROUND`, `XXX`, `not implemented`, `placeholder`, `stub`, and `coming soon` across the entire `src/` directory found zero hits in service or infrastructure code. Mock usage is confined entirely to the 21 test files in `src/__tests__/`.

---

## 4. Missing Connections

### WebhookSubscription Model Not Wired to UI
- The Prisma schema defines `WebhookSubscription` with `url`, `events`, `secret`, `isEnabled`, and `description` fields.
- `src/components/settings/webhook-settings.tsx` exists for the UI.
- But the outbound webhook dispatcher (`outbound-webhooks.ts`) reads webhook config from `project.settings` JSON, not from the `WebhookSubscription` table.
- **Fix needed:** Either update the dispatcher to query `WebhookSubscription` or ensure the webhook settings UI writes to `project.settings`.

### Incremental Indexing Connection
- The worker handler (`worker-handlers.ts`, line 28-30) calls `runIncrementalIndex` when `isIncremental` is true with changed files.
- The GitHub webhook handler (`route.ts`) correctly passes `changedFiles` and `isIncremental` flags.
- `src/services/indexing/incremental.ts` exists and is dynamically imported. This chain is connected.

### SSE/WebSocket Client-Side Consumption
- Server-side WebSocket emission (`src/lib/websocket/index.ts`) publishes events to Redis pub/sub channels.
- SSE endpoints exist (`src/app/api/projects/[projectId]/sync/progress/route.ts`, `runs/[runId]/progress/route.ts`) for client consumption.
- The dashboard client components consume these for real-time updates. This chain appears complete.

### Tracing Service
- The orchestrator pipeline imports `startTrace`, `completeTrace`, `failTrace` from `@/services/tracing`.
- `src/services/tracing/index.ts` exists. This connection is intact.

---

## 5. Critical Bugs

### Bug 1: Dead Webhook Delivery Code With Wrong Model Name
- **File:** `src/lib/webhooks/deliver.ts`, line 37
- **Code:** `prismaRecord["webhook"]` — references a model that doesn't exist in the schema
- **Impact:** Any code path that calls `deliverWebhook` from `deliver.ts` (imported in `runner.ts`) will silently return empty results. No crash, but no webhook delivery either.
- **Fix:** Either remove the dead `deliver.ts` and update `runner.ts` to use `outbound-webhooks.ts`, or fix the model name to `webhookSubscription`.

### Bug 2: Potential Race on Dual Execution Paths
- **Files:** `src/app/api/projects/[projectId]/runs/route.ts` vs `src/services/execution/runner.ts`
- **Issue:** The POST runs API route creates a run and enqueues individual test cases via `getExecutionQueue()`. If the orchestrator pipeline also runs the same run (e.g., triggered by a GitHub webhook), two separate processes could execute the same test cases simultaneously.
- **Fix:** Ensure the run status is checked before execution starts and use a distributed lock (Redis) to prevent double-execution of the same run.

### Bug 3: pgvector Column Type Mismatch Handling
- **File:** `src/lib/db/vector.ts`, lines 28-48
- **Issue:** When fixing jsonb columns to vector type, the code drops and re-adds the column. This will delete all existing embedding data for any nodes that already have embeddings. If `ensureVectorSetup()` is called on a database where embeddings already exist and the column type is correct (`USER-DEFINED`), it skips. But if Prisma somehow creates the column as jsonb (which it does for `Unsupported("vector(1536)")`), the data loss is real.
- **Fix:** Before dropping, check if the column already has data. If so, create a temp column, copy data, and rename. Or better: run this only during migration, never at runtime.

---

## 6. Priority Fix List

### P0 — Must Fix Before Any User Testing

1. **Remove or fix `src/lib/webhooks/deliver.ts`.** The dead code with wrong Prisma model name is confusing. Update `runner.ts` to import from `outbound-webhooks.ts` instead, then delete `deliver.ts` and `src/lib/webhooks/event-types.ts`.

### P1 — Fix Before Beta

2. **Unify execution paths.** Document or refactor so there is one clear entry point for test execution. Either the API route should call `executeRun()` from `runner.ts` (which handles the full lifecycle) or the individual-test-case queue approach should be the standard. Not both.

3. **Add distributed locking for run execution.** Use Redis `SET NX` to prevent two workers from executing the same run simultaneously.

4. **Wire git history into test generation.** The `gitHistory: []` in `test-case-generator.ts` means targeted and regression modes cannot prioritize recently changed code. Add a `getRecentCommits()` call during the indexing phase that populates a `recentChanges` field on the project, then pass it into the planner context.

### P2 — Fix Before Production

5. **Protect `ensureVectorSetup()` from data loss.** The DROP COLUMN approach for fixing jsonb-to-vector columns deletes existing embeddings. Either run this only in migrations or add a safe migration path with temp columns.

6. **Wire `WebhookSubscription` model to outbound webhook dispatcher.** Currently the dispatcher reads from `project.settings.webhooks` JSON, but the UI/settings page may write to the `WebhookSubscription` table. Align these so one source of truth exists.

7. **Add rate limiting to webhook endpoints.** The GitHub and Stripe webhook endpoints validate signatures but have no rate limiting. A replay attack with valid signatures could overwhelm the queue.

### P3 — Polish

8. **Marketing pages.** Blog and API docs are "coming soon" placeholders. Not blocking, but visible to users.

9. **Test coverage expansion.** 21 test files exist which is a solid foundation, but core services (planner, runner, reporter, step-executor, self-healer) lack dedicated test files. The integration tests mock Prisma which is appropriate, but end-to-end tests for the pipeline are missing.

10. **Clean up component count.** 100+ components across 18 directories is extensive. Audit for unused or duplicate components (e.g., `dashboard/coverage-map.tsx` vs `plans/coverage-map.tsx`, `dashboard/run-comparison.tsx` vs `runs/run-comparison.tsx`).

---

## Summary Assessment

The Orbit codebase is substantially complete. This is not a scaffold or prototype — it is a real, functioning system with production-quality implementations across all four agent phases (Analyst, Planner, Executor, Reporter), all supporting infrastructure (AI providers, queue, storage, auth, billing, webhooks), a comprehensive API layer (80+ routes), and an extensive UI (100+ components, 20 pages).

**What works well:**
- The four-agent pipeline is fully implemented with real LLM calls, real browser automation, and real integrations
- Code quality is consistently high: Zod validation on LLM outputs, retry logic with exponential backoff, proper error handling, WebSocket real-time updates
- The AI infrastructure (model routing, tracked completions, per-task model selection, workspace-level API key management) is sophisticated and production-ready
- Security patterns are correct: HMAC signature verification on webhooks, JWT sessions, RBAC checks, production domain blocking, secret encryption

**What needs attention:**
- Three potential bugs (dead webhook code, race condition on dual execution, vector column data loss)
- Git history integration is deferred, weakening targeted/regression test modes
- Some code paths have evolved into dual implementations that need consolidation
- Webhook subscription model and outbound webhook dispatcher use different data sources
