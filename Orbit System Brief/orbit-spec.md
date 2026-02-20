# Orbit — Product Specification v1.0
### "The Cursor of AI-Powered Software Testing"
*Prepared by Sunrise Systems | Confidential*

---

## 1. Product Vision & Core Philosophy

### What Orbit Is

Orbit is an AI-native testing platform that does what no tool on the market does today: it combines the deep code-awareness of a tool like Cursor with the live app-awareness of a browser agent, and fuses them into a single autonomous testing system. You connect your repo once. Orbit reads it, understands it, generates a complete test plan, and executes it against your running environment — automatically, continuously, and intelligently.

No test engineers. No hand-written Playwright scripts. No configuration files. Just tests that work, updated every time your code changes.

### Who It's For

Orbit's primary users are developers and small engineering teams who ship fast — particularly teams building with AI assistance (Cursor, Copilot, Claude Code) where code generation velocity has outpaced testing velocity. The target persona is the 2–10 person startup that has a staging environment, a GitHub repo, and zero QA headcount. Secondarily, Orbit serves development agencies (like Sunrise Systems) that need to deliver tested software to clients without spinning up a QA practice per engagement.

### Core Design Principles

**1. One connection, full coverage.** The only thing a user should have to do manually is connect their GitHub repo and enter their staging URL. Everything else — indexing, planning, generating, running — is Orbit's job.

**2. The AI works in the open.** Every decision Orbit makes is visible and explainable. When it generates a test plan, users see exactly what it found and why it prioritized what it did. When a test fails, the AI explains what went wrong in plain English and suggests a fix. There are no black boxes.

**3. You stay in control.** Orbit is autonomous by default but configurable at every level. Teams can set the AI model, override the system prompt, approve test plans before execution, exclude paths, annotate critical flows, and tune the flakiness tolerance. Autonomy is a dial, not a binary.

**4. Tests are a living artifact.** Orbit's test suite isn't a file you check in and forget. It's a continuously updated representation of your application's expected behavior, evolving every time you push code. Self-healing selectors, automatic plan updates on new routes, and incremental indexing keep the suite aligned with your app without manual maintenance.

**5. Cost is a first-class concern.** Every Orbit feature is designed with token efficiency in mind. Prompt caching, semantic deduplication, smart batching, and model routing (using a cheaper model for classification tasks and a smarter model for generation) keep per-run costs low enough that teams can afford to run Orbit on every PR.

### The "Wow Moment"

A developer signs up, connects their Next.js repo via GitHub OAuth, and enters their staging URL. Within 90 seconds, the dashboard shows a live-updating system map — an interactive graph of every route, API endpoint, React component, and auth flow the indexer has discovered. Then a test plan appears: 47 test cases, grouped by user journey, with confidence scores and coverage percentages. The developer clicks "Run" and watches a real browser navigate their application, filling forms, clicking buttons, checking responses — all in a live video feed embedded in the dashboard. Three minutes later they have a full pass/fail report with screenshots, AI-written failure explanations, and a list of edge cases the agent found that weren't in the original plan. That's the wow moment. It feels like hiring a QA engineer who already knows your entire codebase.

### Differentiated Positioning

| Competitor | What They Do | Orbit's Edge |
|---|---|---|
| Momentic | AI test recorder + runner | No repo indexing; tests only what users show it |
| Octomind | Auto-generates Playwright from URL crawl | No code understanding; misses auth flows, edge cases |
| QA.tech | Browser agent that explores live app | No code context; blind to business logic |
| Meticulous | Session replay → regression tests | Reactive, not proactive; requires real traffic |
| GitHub Copilot | Unit test generation in editor | No E2E; no browser; no continuous execution |
| Cursor | Code-aware AI coding | Not a testing tool at all |

Orbit's unique position: **code-aware + app-aware + fully autonomous + continuously updated**. No competitor does all four.

---

## 2. Repo Indexing & System Understanding Engine

### The Indexing Pipeline

When a user connects a repo, Orbit's Indexing Service begins a multi-phase analysis pipeline that runs in the background and completes in under 2 minutes for most mid-sized codebases.

**Phase 1: Repository Cloning & Fingerprinting**
Orbit clones the repo via GitHub/GitLab/Bitbucket API into an ephemeral sandboxed container. It immediately fingerprints the repo: file count, language distribution, directory structure, presence of `package.json`, `pyproject.toml`, `go.mod`, etc. This determines which framework adapters to activate.

**Phase 2: Framework Detection**
Orbit runs a framework detection pass using a combination of manifest file inspection and directory pattern matching:
- Next.js: presence of `next.config.js/ts`, `app/` or `pages/` directory
- Express/Fastify: `app.get/post/use()` patterns in entry files
- Django/FastAPI: `urls.py`, `@app.route()` decorators
- Rails: `routes.rb`, `config/routes.rb`
- GraphQL: schema files, `.graphql` files, Apollo/urql imports
- tRPC: `createTRPCRouter`, procedure definitions

The adapter pattern means Orbit has a specialized parser for each framework that knows how to extract routes, endpoints, and data models in framework-idiomatic ways, while a universal fallback parser handles unknown stacks through heuristic file analysis.

**Phase 3: AST Parsing with tree-sitter**
Every source file is parsed using tree-sitter, producing a concrete syntax tree. tree-sitter supports 100+ languages and is fault-tolerant (it parses partial/invalid code without crashing), making it ideal for real-world codebases. From the AST, Orbit extracts:
- Function and class definitions with their signatures
- Import/export relationships between modules
- Component props and their types (from TypeScript interfaces)
- Route definitions and their HTTP methods
- Middleware chains and authentication guards
- Database query patterns (Prisma, Drizzle, TypeORM schemas)
- Environment variable references (identifies what env vars the app depends on)

**Phase 4: Route & Endpoint Extraction**
The Route Extractor builds a complete map of every HTTP endpoint and frontend route. For Next.js App Router, it walks the `app/` directory and maps file-system routes to URLs, detecting dynamic segments (`[id]`), catch-all routes (`[...slug]`), and route groups. For API routes, it extracts handler signatures, Zod/Yup validation schemas, authentication middleware, and response shapes. This produces a structured route manifest:

```json
{
  "route": "/api/users/[id]",
  "method": "GET",
  "auth": "required",
  "auth_strategy": "Bearer JWT",
  "params": [{"name": "id", "type": "string", "format": "uuid"}],
  "response_schema": "UserResponse",
  "middleware": ["rateLimiter", "authMiddleware"]
}
```

**Phase 5: Component & User Journey Mapping**
Orbit traces the component tree from page-level components down to leaf nodes, understanding which components are user-interactive (buttons, forms, inputs, modals) and which are presentational. It identifies user journeys by following navigation links, form submissions, and state transitions — building a graph of how a user moves through the application.

**Phase 6: Embedding & Vector Storage**
Every extracted artifact (route, component, function, schema) is embedded using a text-embedding model (OpenAI `text-embedding-3-small` or a self-hosted alternative). Embeddings are stored in pgvector (Postgres extension) alongside the raw structured data. This enables semantic retrieval during test generation — when the planning agent needs context about a specific feature, it retrieves the most relevant code chunks rather than dumping the entire codebase into the prompt.

### The System Map

The output of the indexing pipeline is the **System Map** — Orbit's internal representation of the application. It is a directed graph where nodes are routes, components, API endpoints, data models, and auth strategies, and edges represent navigation flows, data dependencies, and component relationships. The System Map is stored in Postgres as a structured JSON document and also rendered as an interactive visualization in the dashboard.

### Handling Monorepos & Multi-Service Repos

For monorepos (Turborepo, Nx, Lerna), Orbit detects the workspace configuration and indexes each package/app independently, then builds cross-package relationship edges where imports cross package boundaries. Each sub-application gets its own test plan, but Orbit can also generate integration tests that span services. Users can configure which packages to include in testing scope.

### Incremental Updates

On every push or PR, Orbit runs an incremental re-index rather than a full re-index. It identifies changed files via the GitHub commit diff API, re-parses only those files and their direct dependents, updates the affected nodes in the System Map, and flags any test cases that need to be regenerated or re-evaluated due to the changes. This keeps the index always current without the cost of full re-indexing.

---

## 3. Test Planning Engine

### From System Map to Test Plan

The Test Planning Engine takes the System Map as input and produces a structured Test Plan — a prioritized, annotated list of test cases with descriptions, expected behaviors, coverage targets, and execution metadata.

The planning process runs through a multi-agent planning loop:

**Step 1 — Coverage Analysis:** The planner analyzes the System Map against any existing test files in the repo (detected by pattern: `*.test.ts`, `*.spec.ts`, `cypress/`, `e2e/`). It identifies what is already tested vs. what has zero coverage. It also pulls Git history to identify files with the most recent changes and files with the most historical bug churn (via `git log --stat`).

**Step 2 — Journey Reconstruction:** Using the component and navigation graph, the planner reconstructs likely user journeys — the paths a real user would take through the application. Common journeys it looks for: sign up → onboard → core action → success state; login → dashboard → perform action → log out; form fill → validation → submission → confirmation.

**Step 3 — Test Case Generation:** For each journey and each API endpoint, the planner generates test case descriptions. A test case at this stage is a structured object, not yet runnable code — it describes what to test, what inputs to use, what success looks like, and what edge cases to cover.

**Step 4 — Prioritization Scoring:** Each test case is scored on three dimensions: Criticality (is this on the auth path? checkout flow? core business action?), Risk (how recently was the code changed? how many dependencies does it have?), and Coverage gap (is this area currently untested?). The final score determines execution order.

### Test Types Generated

**User Journey Tests:** Multi-step browser flows that simulate real user behavior. Example: "Visit /register, fill in email and password, submit form, verify redirect to /onboarding, verify welcome email trigger."

**API Contract Tests:** Orbit hits every detected API endpoint with a valid payload (generated from the validation schema), an invalid payload (to test error handling), and an unauthenticated request (to verify auth is enforced). Response shapes are validated against the detected response schema.

**Authentication Flow Tests:** Login, logout, token refresh, protected route access with and without valid credentials, session expiry behavior, OAuth callback flows.

**Form Validation Tests:** For every detected form, Orbit tests required field enforcement, format validation (email, phone, URL), length limits, and submission with valid data.

**Edge Case Tests:** Generated by prompting the AI to think adversarially: "What would a malicious or confused user do on this screen?" Results in tests for XSS payloads in inputs, extremely long strings, special characters, rapid double-clicks on submit buttons.

**Regression Tests:** After the first run establishes baselines, future runs compare results. Any behavior change on a previously passing test is flagged as a potential regression.

### Coverage Configuration

Users configure test scope through a `orbit.config.ts` file in their repo root (or via the dashboard UI):

```typescript
export default defineConfig({
  scope: {
    include: ['app/**', 'src/**'],
    exclude: ['app/admin/**', 'src/internal/**'],
    critical: ['/checkout', '/api/payments', '/login'],
  },
  coverage: {
    target: 80, // % of routes with at least one test
    criticalTarget: 100, // % of critical paths covered
  },
  execution: {
    mode: 'hybrid', // autonomous | human-in-loop | hybrid
    flakinessTolerance: 2, // max retries before marking flaky
  }
})
```

### Planning Prompt Strategy

The planner uses a structured chain-of-thought prompt architecture. The system prompt establishes Orbit's role and the application context. The user turn provides the System Map excerpt and asks for test cases. The assistant is instructed to reason step-by-step: "First, identify the critical user paths. Second, consider what could break at each step. Third, generate test cases that cover the happy path, the error path, and at least one edge case per flow."

Critically, the planner is instructed to output structured JSON rather than prose, enabling programmatic consumption of test cases without fragile text parsing.

---

## 4. Test Execution Engine

### Browser Agent Architecture

Orbit's browser execution layer is built on **Playwright** as the underlying browser control framework, with **Stagehand** (by Browserbase) as the AI action layer. This combination provides:
- Playwright handles low-level browser control: navigation, clicks, form fills, network interception, screenshot/video capture
- Stagehand provides three high-level AI primitives: `act()` (perform a natural language action on the page), `extract()` (pull structured data from the page), `observe()` (get a description of what's currently visible)
- Stagehand's built-in **prompt caching and element caching** means repeat interactions with the same UI components skip LLM inference entirely — a critical cost and speed optimization
- Stagehand's **self-healing selectors** automatically adapt when element identifiers change between runs

For visual verification where pixel-level accuracy matters, Orbit falls back to **Anthropic Computer Use** or screenshot-to-Claude analysis. For standard form fills and clicks, it uses Playwright's native selectors (which are faster and more reliable than AI-driven interaction).

The execution loop for a single test case:
1. Navigate to starting URL
2. For each step in the test plan, call `stagehand.act(stepDescription)`
3. After each action, call `stagehand.extract()` to verify the expected state
4. On unexpected state, capture screenshot + DOM snapshot, mark step as failed, continue to next test
5. On test completion, generate pass/fail verdict with evidence

### Environment Management

Orbit never touches production. Every test run is scoped to a user-configured environment — typically a staging URL. Orbit does not spin up environments itself (in the MVP), but it does:
- Validate environment reachability before a run starts
- Clear test-created data between runs using configurable teardown hooks (e.g., calling a `/api/test/reset` endpoint the user registers)
- Support multiple named environments per project (staging, preview, QA)
- Detect Vercel/Railway/Render preview deployment URLs from PR webhooks and automatically target them

In a later release (v2), Orbit will integrate with Vercel's deployment API and Railway's API to spin up ephemeral preview environments on demand for isolated test runs.

### Credential & Secret Management

Security is non-negotiable. Orbit handles secrets through an encrypted vault layer:
- All credentials (staging URL passwords, test account credentials, API keys) are encrypted at rest using AES-256
- Secrets are scoped per environment — staging credentials never bleed into production config
- Secrets are injected into test runs via environment variables in the ephemeral execution container, never written to disk or logs
- Orbit displays secret values as `••••••` in all UI surfaces; they can be rotated but never read back
- Audit logs record every time a secret is accessed, by which run, and at what timestamp

Test account credentials (username/password for the test user in staging) are stored in the vault and used to authenticate during auth-flow tests. Orbit recommends creating a dedicated test user account in staging environments with a predictable email pattern like `orbit-test@yourdomain.com`.

### Execution Modes

**Full Suite:** Runs all generated test cases. Used for scheduled nightly runs or major release validation.

**Smoke Test:** Runs only the highest-priority tests (critical path score > 80). Completes in under 2 minutes. Suitable for every PR.

**Regression-Only:** Runs only test cases that cover code changed in the current branch diff. Most efficient mode for PR checks.

**Targeted:** User specifies a path or feature area; Orbit runs only tests covering that area. Useful for debugging a specific flow.

### Parallelism

Test cases are partitioned into independent groups (by user journey) and executed in parallel across multiple Playwright browser instances. Orbit uses a job queue (BullMQ + Redis) to distribute test execution across worker processes. A cloud execution tier (using Browserbase's cloud browser infrastructure) allows spinning up 10–50 parallel browser instances for large suites, reducing a 500-test suite from 30 minutes to under 5 minutes.

### Failure Capture & Evidence

On any test step failure, Orbit automatically captures:
- Full-page screenshot at the moment of failure
- 30-second video clip of browser activity leading up to the failure
- DOM snapshot (full HTML of the page at failure point)
- Network log (all HTTP requests and responses during the test)
- Console errors from the browser
- AI-written failure analysis: "The test expected to find a 'Submit' button on the checkout page but the element was not found. This may be caused by a conditional rendering issue — the button may only appear after selecting a shipping method."

### Self-Healing

When Orbit detects a selector failure (element not found), it attempts self-healing before marking the test as failed:
1. Run Stagehand's `observe()` to get a description of the current page state
2. Ask the LLM to identify the most likely matching element given the original test intent
3. If confidence > 85%, execute the action on the new element and continue the test
4. Log the selector update and surface it in the dashboard as a "healed" event — the user can review and approve the new selector mapping

Persistent selector changes (healed 3+ times) are flagged for the user to update the underlying component or annotate the test with a more stable selector strategy.

### Flakiness Management

Orbit maintains a **Flaky Test Registry** — a running record of tests that have had inconsistent results across runs. A test is classified as flaky if it fails and then passes on retry without any code change. Flaky tests are:
- Automatically retried up to N times (configurable, default 3)
- Scored with a "confidence percentage" (pass rate over last 10 runs)
- Surfaced prominently in the dashboard with a stability warning
- Optionally quarantined (excluded from blocking CI) while the instability is investigated

---

## 5. AI Agent Architecture & Prompt System

### The Four-Agent Architecture

Orbit uses a multi-agent system where specialized agents handle distinct phases of the testing lifecycle. Each agent has a focused responsibility, its own system prompt, and a defined input/output contract.

**Agent 1 — The Analyst (Repo Indexing & System Map)**
Responsibility: understand the codebase and build the System Map.
Input: raw code files, AST parse results, framework metadata.
Output: structured System Map JSON.
Model: Claude Haiku or GPT-4o-mini (fast, cheap — this is a classification and extraction task, not reasoning).

**Agent 2 — The Planner (Test Plan Generation)**
Responsibility: generate a prioritized, comprehensive test plan from the System Map.
Input: System Map, user configuration, existing test files, Git history.
Output: structured Test Plan JSON with test cases, priorities, and rationale.
Model: Claude Sonnet or GPT-4o (requires reasoning and creative adversarial thinking).

**Agent 3 — The Executor (Test Execution)**
Responsibility: execute individual test cases step-by-step in the browser.
Input: single test case from Test Plan, current page state, screenshot.
Output: step-by-step execution log, pass/fail verdict, evidence artifacts.
Model: Claude Sonnet with vision (needs to interpret screenshots and make action decisions). Uses Stagehand for action primitives.

**Agent 4 — The Reporter (Results Analysis & Communication)**
Responsibility: synthesize test results into human-readable reports, identify patterns, generate bug reports.
Input: execution logs, failure artifacts, historical run data.
Output: run summary, failure explanations, Linear/GitHub comments, suggested fixes.
Model: Claude Sonnet (requires good writing and reasoning).

### System Prompt Architecture

Orbit uses a layered prompt system with two tiers:

**Operator Layer (Orbit-controlled):** The foundational system prompt that every agent runs with. This is not editable by end users. It establishes: what Orbit is, the agent's specific role, output format constraints (always output valid JSON), safety guidelines (never delete data, never submit payment forms with real values, always use test credentials), and quality standards. This layer is version-controlled by Sunrise Systems and updated with each Orbit release.

**User Layer (Workspace-controlled):** An additive context block that workspace admins can customize. This is appended to the operator system prompt. Users can inject: application-specific domain knowledge ("This is a construction management SaaS. The primary user actions are creating bids, managing subcontractors, and tracking project timelines."), custom testing rules ("Always verify that the permission system prevents non-admin users from accessing /admin routes."), and technology context ("We use Auth0 for authentication. Test accounts are pre-configured. Never attempt to create new Auth0 accounts.").

**Plugin Context (User-level):** Individual users and workspace admins can upload context files that are chunked, embedded, and retrieved into relevant prompts at runtime. These might be: API documentation (OpenAPI specs), design system documentation (which components exist and how they behave), business logic documentation, test credential files.

### Model Router Logic

Not every task needs the most expensive model. Orbit's model router assigns models based on task type:

| Task | Model |
|---|---|
| Framework detection | Claude Haiku / GPT-4o-mini |
| Route extraction | Claude Haiku |
| Test case generation | Claude Sonnet |
| Browser action execution | Claude Sonnet (with vision) |
| Failure analysis | Claude Sonnet |
| Report writing | Claude Haiku |
| Security test generation | Claude Opus / GPT-4o |

Workspace admins can override the default model selection globally or per-task-type. Enterprise customers can bring their own API keys and route to their preferred provider.

### MCP Integrations

Orbit natively exposes an MCP server that allows AI coding tools (Cursor, Claude Code, VS Code Copilot) to query Orbit's test results, test plans, and system map directly from inside the editor. Additionally, Orbit consumes external MCP servers for specific integrations:

- **GitHub MCP:** Used to fetch PR diffs, commit data, and branch information during incremental re-indexing and scoped test runs
- **Linear MCP:** Used to read issue details, update issue status, and post comments when Orbit is triggered by Linear events
- **Slack MCP:** Used to post notifications and receive slash commands
- **Playwright MCP (Microsoft):** Used as the browser control interface for the Executor agent, giving the LLM structured browser control via accessibility trees rather than raw screenshots

### Context Window Management

For large repos (1M+ tokens of code), Orbit never dumps the entire codebase into a prompt. Instead:
- The System Map is stored in pgvector and retrieved semantically
- For each planning or execution task, only the relevant System Map nodes are retrieved (top-K most similar by embedding cosine similarity)
- Code files are chunked at function/class boundaries (not arbitrary character counts) to preserve semantic integrity
- Prompt caching is used aggressively — the system prompt and application context (which rarely change) are cached, reducing per-run API costs by 60–90%
- Extended context window models (Claude's 200K context) are used selectively for complex reasoning tasks that benefit from full context

### Memory System

Orbit maintains persistent memory across test runs:

**Run History:** Every test run is stored — pass/fail per test case, timing, failure artifacts, model used, cost. This enables trend analysis and regression detection.

**Flaky Test Registry:** Tracks which tests have been unstable, when, and in correlation with which code changes.

**Selector Memory:** When self-healing updates a selector, the mapping is stored so future runs use the correct selector without invoking the LLM.

**Failure Pattern Library:** When Orbit identifies a failure pattern (e.g., "submit button disappears when form validation fails"), it stores this pattern and uses it to generate additional edge case tests in future planning cycles.

**Baseline Snapshots:** After each successful run, Orbit stores UI snapshots and API response shapes as baselines for future regression comparison.

---

## 6. Settings & Configuration Architecture

### Workspace Settings

Workspace settings apply globally to all projects and users within an organization.

**AI Configuration:**
- Default AI model for each agent type (Analyst, Planner, Executor, Reporter) with per-model API key management
- System prompt customization (the user layer described in Section 5)
- Token budget: max tokens per run, max spend per month (with alert thresholds at 75% and 100%)
- Model fallback strategy: if primary model is unavailable, fall back to specified alternative

**Execution Defaults:**
- Default execution mode: Autonomous, Human-in-Loop, Hybrid (configurable per project override)
- Default flakiness tolerance (N retries before classifying as flaky)
- Notification channels: Slack webhook URL, email recipients for run summaries

**Security:**
- SSO/SAML configuration (Enterprise)
- Data residency preference (US, EU)
- IP allowlist for API access
- Audit log retention period

### Project Settings

**Repository:**
- Connected repo (GitHub/GitLab/Bitbucket OAuth), selected branch strategy
- Branch trigger rules: run on main push, run on PR open, run on PR update, scheduled cron
- Monorepo sub-package selection

**Environments:**
- Named environments (staging, preview, QA) with URL, credentials vault entries, and teardown hook configuration
- Environment-specific test scope overrides
- Preview environment auto-detection (Vercel/Railway integration)

**Test Scope:**
- Include/exclude path patterns (gitignore-style glob syntax)
- Critical path annotations (routes marked critical always get 100% coverage)
- Coverage targets (overall %, critical path %)
- Test plan approval requirement (if enabled, a human must approve the generated plan before execution begins)

**Execution:**
- Per-project model overrides
- Parallelism level (1–50 browser instances)
- Maximum run duration
- Failure threshold (fail the run if X% of tests fail, regardless of which)

**Integrations:**
- Linear project ID and automation rules
- GitHub repository and check configuration
- Slack channel for this project's notifications

### User Settings

- Personal preferred model for interactive queries (the CLI and VS Code extension respect this)
- Notification preferences: email frequency, Slack DM for assigned runs
- Personal context files (uploaded knowledge docs that apply to all projects this user works on)
- API key for personal CLI/extension authentication
- Theme preference for the dashboard

### Admin Settings

**Team Management:**
- Invite members by email, assign roles (Admin, Member, Viewer, Billing)
- Seat allocation and usage tracking
- Permission matrix: who can create projects, manage secrets, modify system prompts, access billing

**Billing & Usage:**
- Current plan, seats, credit balance
- Usage breakdown: credits consumed per project per month, breakdown by agent type (execution vs. planning vs. indexing)
- Invoice history and payment method management
- Credit top-up and auto-refill configuration

**Audit Logs:**
- Full log of all admin actions: project created, secret accessed, model changed, user invited
- Filterable by user, action type, date range
- Exportable as CSV for compliance

**Data Management:**
- Data retention configuration: how long to keep run history, screenshots, videos
- Deletion tools: purge a project's data, export a workspace's data
- Compliance exports for SOC 2 / GDPR purposes

---

## 7. Integrations Architecture

### Linear Integration

**Trigger: Issue moves to "Done" state**
When a Linear issue transitions to "Done," Orbit receives a webhook from Linear's GraphQL subscription. Orbit extracts the issue title, description, linked branch (from Linear's Git integration), and associated project. It finds the corresponding Orbit project, identifies the branch, determines which code files were changed on that branch, and initiates a regression-scoped test run targeting only the tests that cover changed areas.

**Test Result Comment**
On run completion, Orbit posts a structured comment on the Linear issue using the Linear API's `commentCreate` mutation. The comment includes: overall pass/fail verdict, number of tests run, number failed, links to screenshots for any failures, and an AI-written summary ("3 tests failed. The checkout flow tests failed because the shipping selector element was not found — this may be related to the CSS changes in `CheckoutForm.tsx`. The auth tests passed. No regressions detected in the user profile area.").

**Bug Creation**
When Orbit discovers a genuine bug (consistent failure across 2+ retries), it optionally creates a new Linear issue in a configured "Bug" project, tagged with the relevant team, linked to the failing PR, and pre-populated with the AI-written failure analysis and screenshot evidence.

**Orbit as Assignee**
Users can create a Linear automation: "When an issue with label 'Needs Testing' is moved to 'In Review', assign Orbit." Orbit appears as a team member in Linear (via Linear's API integration member). When assigned an issue, it reads the issue description and any linked design files, interprets the feature, and generates a targeted test plan for that specific feature on the feature branch.

### GitHub/GitLab Integration

**PR Status Checks**
Orbit registers as a GitHub Checks API integration. On every PR, it creates a check run named "Orbit Testing." This check blocks merge (configurable) if tests fail. The check detail page shows the full test summary with linked artifacts.

**PR Comment Bot**
Orbit posts a comment on every PR with a collapsible summary of test results. If tests pass: a green checkmark summary. If tests fail: a detailed breakdown with screenshots embedded directly in the comment (using GitHub's image hosting via the API).

**Diff-Aware Scoping**
Orbit fetches the PR diff via the GitHub API and uses it to determine which parts of the System Map are affected by the changes. Only tests covering changed code paths are run for PR checks, keeping run time under 3 minutes for most PRs.

**Bug Issues**
When Orbit discovers a bug in a PR, it can open a GitHub Issue in the repository with the failure evidence, assigned to the PR author, labeled `orbit-discovered` and `bug`.

### VS Code / Cursor Extension

**Sidebar Panel:** Shows the current test health for the open project. Displays a tree view of test results by file, with pass/fail indicators. Clicking a test result navigates to the relevant code section.

**Inline Decorations:** Files with failing tests get a gutter indicator. Hovering shows the failure summary. Clicking opens the run detail in a webview panel inside the editor.

**Coverage Overlay:** Activatable coverage overlay highlights lines covered by at least one test (green) and uncovered lines (yellow/red), similar to Istanbul coverage visualization but powered by Orbit's test plan.

**Test Generation Command:** Right-click any function or component → "Generate Orbit tests for this." Orbit generates targeted test cases for the selected code and adds them to the test plan.

**Live Run Trigger:** Command palette → "Orbit: Run smoke tests" triggers an immediate smoke test run for the current branch. Results stream back into the editor.

**AI Chat Integration:** In Cursor specifically, Orbit exposes an MCP server so developers can ask "Did Orbit find any issues with the checkout flow?" or "What tests cover this file?" directly in the Cursor AI chat.

### CLI

```bash
# Authentication
orbit auth login                    # Browser-based OAuth flow
orbit auth status                   # Show current auth + workspace

# Indexing
orbit sync                          # Force full re-index of current repo
orbit sync --incremental            # Re-index only changed files

# Test Planning
orbit plan                          # Generate/update test plan (no execution)
orbit plan --show                   # Display current test plan in terminal
orbit plan --approve                # Approve pending test plan (human-in-loop mode)

# Execution
orbit run                           # Full suite
orbit run --mode smoke              # Smoke tests only
orbit run --mode regression         # Regression tests (changed files only)
orbit run --scope /checkout         # Tests covering specific path
orbit run --branch feature/my-pr   # Tests for specific branch

# Results
orbit status                        # Test health summary for current project
orbit results --last                # Show results from last run
orbit results --run <run-id>        # Show specific run results
orbit results --format json         # Machine-readable output for CI

# Configuration
orbit config init                   # Create orbit.config.ts in current directory
orbit config validate               # Validate current config

# CI Usage
orbit run --mode regression --format json --fail-on-failure
# Exits with code 1 if any tests fail — useful in CI pipelines
```

### CI/CD Integration

Orbit provides a **GitHub Action** (`orbit-hq/orbit-action@v1`) that wraps the CLI for use in GitHub Actions workflows:

```yaml
- uses: orbit-hq/orbit-action@v1
  with:
    api-key: ${{ secrets.ORBIT_API_KEY }}
    mode: regression
    environment: staging
    fail-on-failure: true
```

Equivalent integrations are provided for GitLab CI, CircleCI (as an Orb), and as a generic shell script for Jenkins and custom CI systems.

### Slack Integration

**Channel Notifications:** Configurable per project. Run completed → post summary. Run failed → post failure alert with screenshot thumbnail. Nightly full suite → post health dashboard.

**Slash Commands:**
- `/orbit status` — shows current test health for the workspace
- `/orbit run [project]` — triggers a smoke test run
- `/orbit results [project]` — shows last run summary

**Interactive Messages:** Failure alerts include "View Details" and "Mark as Known Flaky" action buttons that interact with Orbit's API without leaving Slack.

### REST API & Webhooks

Orbit exposes a full REST API (`api.orbit.run/v1`) for programmatic access to all platform functionality. Authentication is via API keys scoped to workspaces.

Key endpoints:
- `POST /projects/{id}/runs` — trigger a test run
- `GET /projects/{id}/runs/{runId}` — get run status and results
- `GET /projects/{id}/plan` — get current test plan
- `POST /projects/{id}/sync` — trigger re-indexing
- `GET /workspaces/{id}/health` — overall test health dashboard data

**Webhook Events** (delivered via HTTP POST to user-configured URLs):
- `run.started` — payload includes run ID, project, mode, triggered by
- `run.completed` — payload includes full results summary, pass/fail counts
- `run.failed` — triggered when run itself errors (infrastructure failure, not test failure)
- `test.failed` — individual test failure with evidence URLs
- `test.flaky` — test classified as flaky
- `bug.discovered` — Orbit found a consistent failure worth reporting
- `plan.updated` — test plan changed due to code changes

Webhooks are delivered with HMAC signature headers for verification. A delivery log and retry UI is available in the dashboard.

---

## 8. Dashboard & UI Specification

### Design Philosophy

Orbit's UI should feel like a mission control center — data-dense but visually calm. The dominant aesthetic is dark mode by default with a clean, minimal layout. The System Map visualization is the hero element — it should feel alive, animated, and impressive on first load. Every screen should convey "this system understands your application."

### Onboarding Flow

**Step 1 — Connect Repository**
Full-screen centered card. GitHub/GitLab/Bitbucket OAuth buttons. Below the fold: "Orbit needs read access to your repository. We never store your code — only the structural index."

**Step 2 — Indexing (The Magic Moment)**
Full-screen visualization of the indexing process. A network graph begins rendering in real time as Orbit discovers routes, components, and endpoints. Nodes appear and connect with smooth animations. A sidebar shows the live log: "Detected: Next.js 14 App Router," "Found 23 API routes," "Mapped 67 React components," "Identified auth: Clerk." This screen should feel impressive — this is the wow moment.

**Step 3 — Review System Map**
The full interactive System Map is displayed. Users can click nodes to see details. A panel on the right shows the detected configuration. Call to action: "Does this look right? Add any corrections before we generate your test plan."

**Step 4 — Configure Environment**
Clean form: Staging URL, environment credentials (masked input), teardown hook URL (optional). "We'll use this environment for all test runs. You can add more environments in settings."

**Step 5 — Test Plan Preview**
Generated test plan displayed as a structured list grouped by user journey. Users can expand each test case to see the steps, expected outcomes, and AI rationale. Toggle switches to include/exclude individual tests. Annotate-as-critical button for each test. Call to action: "Looks good? Let's run it."

**Step 6 — First Run (Live)**
Watch mode: a browser viewport embedded in the page shows the live test run in progress. Test cases check off in real time on the right panel. Bottom bar shows: tests passed, tests failed, time elapsed. This is the moment users understand what Orbit does.

### Main Dashboard

**Header:** Project selector dropdown, current health badge (Healthy / Degraded / Failing), last run timestamp, "Run Now" button.

**Test Health Overview Strip:** 4 stat cards — Pass Rate (%), Flaky Tests (count), Coverage (%), Last Run Duration. All with trend indicators (up/down arrow vs. previous 7 days).

**System Map Panel (Left 60%):** Interactive force-directed graph of the application. Nodes are colored by test status: green (passing), red (failing), yellow (flaky), gray (not covered). Clicking a node opens a detail panel with the associated tests. Filter controls: show by status, show by coverage, highlight critical paths.

**Recent Runs Timeline (Right 40%):** Vertical timeline of the last 20 runs with: trigger (push/PR/scheduled), mode, duration, pass/fail counts, and a sparkline showing which tests passed vs. failed. Click any run to go to Run Detail View.

**Active Runs:** If a run is in progress, a live progress bar appears at the top of the timeline with a "Watch Live" button.

### Test Plan View

Full list of all test cases organized by user journey (expandable sections). Each test shows: name, steps summary, priority score, last result, coverage area. Top toolbar: search, filter by status/journey/priority, "Add Test" (manually author a test case), "Re-generate Plan" (re-run the planner).

Coverage map below the list: a color-coded grid of the application routes showing which are covered, which are partially covered, and which have no coverage.

AI Suggestions panel (collapsible right panel): "Orbit noticed you have no tests for the password reset flow. Would you like to generate them?" with one-click approval.

### Run Detail View

**Header:** Run ID, trigger, start/end time, total duration, pass/fail counts, model used, credits consumed.

**Test Results List:** Each test case with expandable detail. Status icon, test name, duration, steps. Expand to see: step-by-step log with timestamps, screenshots at each step (thumbnail grid), video replay (embedded), AI failure analysis.

**Failure Analysis Panel:** For failed tests, a dedicated panel shows: what Orbit expected to happen, what actually happened, a screenshot comparison (expected state vs. actual state), AI-suggested fix ("This failure is likely caused by the conditional rendering in `CheckoutSummary.tsx` line 47 where the button only renders if `cartItems.length > 0`. Consider adding a test for the empty cart state separately."), and a "Create Linear Issue" button.

**Diff View:** Shows which code changed between the last passing run and this run, with affected tests highlighted.

### Settings UI

Standard settings shell with left-nav categories matching the settings architecture in Section 6. Each settings page uses a clean form layout with inline validation, auto-save for non-critical settings, and confirmation dialogs for destructive actions.

Secret fields use a dedicated SecretInput component: value is never displayed after initial entry, shows masked placeholder, has "Rotate" and "Delete" actions but no "Reveal" action.

### Plugin Marketplace

Grid layout of available plugins with: name, icon, description, publisher, install count, rating. Filter by category (Testing, Integrations, Context, Reporters). Each plugin has a detail page with full description, configuration options, and reviews. Installed plugins appear in a separate "Installed" tab.

---

## 9. Plugin & Extension System

### Plugin Architecture

Orbit's plugin system is designed around a simple principle: plugins are context injectors and capability extenders, not code executors. This keeps the security model manageable while enabling powerful customization.

Plugins can do three things:
1. **Inject context** into agent prompts at specific phases (pre-planning, pre-execution, post-failure)
2. **Register custom test templates** — predefined test patterns for specific technologies (Stripe payment flows, Auth0 login flows, Twilio SMS verification flows)
3. **Add custom reporters** — format and deliver test results to custom destinations

Plugins cannot execute arbitrary code on Orbit's infrastructure. They run in a sandboxed context with access only to the defined plugin API.

### Plugin Manifest Format

```json
{
  "name": "stripe-payments",
  "version": "1.2.0",
  "description": "Test generation and execution support for Stripe payment flows",
  "author": "Orbit Community",
  "permissions": ["context.inject", "templates.register"],
  "hooks": {
    "plan.before": "./hooks/inject-stripe-context.js",
    "execute.before": "./hooks/setup-stripe-test-env.js"
  },
  "templates": [
    {
      "id": "stripe-checkout",
      "name": "Stripe Checkout Flow",
      "description": "Tests the complete Stripe payment flow using test card numbers",
      "steps": ["..structured step definitions.."]
    }
  ],
  "config_schema": {
    "test_card_number": {"type": "string", "default": "4242424242424242"},
    "webhook_secret": {"type": "secret"}
  }
}
```

### Domain Knowledge Files

Users can upload knowledge files — markdown documents, OpenAPI specs, design system docs — that Orbit chunks, embeds, and retrieves into relevant prompts. Examples:

- **OpenAPI spec (`openapi.yaml`):** Orbit uses the spec to generate more accurate API test payloads and validate response shapes against the documented schema rather than inferring them from code
- **Design system doc (`design-system.md`):** Helps the executor agent recognize components by their documented names rather than inferred selectors
- **Business logic doc (`business-rules.md`):** "Users on the free plan cannot create more than 3 projects. Upgrade prompts should appear when this limit is reached." — gives the planner context for edge case generation
- **Test credentials file (`test-accounts.md`):** Pre-configured test user accounts for different roles (admin, regular user, guest) — helps the executor authenticate as different user types

### Native Plugin Examples

**Stripe Plugin:** Injects Stripe test card numbers and webhook simulation into payment flow tests. Sets up Stripe CLI webhook forwarding in the test environment. Provides pre-built test templates for: successful payment, declined card, 3DS challenge, subscription creation, refund flow.

**Auth0 Plugin:** Pre-configures Auth0 test tenant credentials. Injects correct OAuth callback handling. Provides templates for: standard login, social login, MFA flow, password reset, token refresh.

**Accessibility Plugin:** Adds an accessibility audit phase to every browser test using axe-core. Reports WCAG 2.1 AA violations alongside functional test results. Can be configured to fail tests on accessibility violations above a severity threshold.

**Performance Budgets Plugin:** After each test run, checks Core Web Vitals against configured thresholds. Fails the run if LCP > 2.5s, CLS > 0.1, or FID > 100ms. Reports trends over time.

**Datadog Plugin:** Sends test result metrics to Datadog as custom metrics. Enables alerting on test health degradation from within existing Datadog dashboards.

---

## 10. Future-Forward Features (Roadmap Vision)

### Orbit Agent Tasks (v2)

The complete vision for Linear integration: when a developer marks a Linear issue as "Done," Orbit doesn't just run tests — it becomes a full test engineer. It reads the issue description and linked design files (Figma via Figma API), understands what feature was built, finds the associated branch, optionally triggers a preview deployment, generates feature-specific test cases on top of the base regression suite, executes them, and comments back on the ticket with a comprehensive QA report. The developer gets a QA verdict before the PR is even reviewed by a human.

### Semantic Visual Regression (v2)

Current tools do pixel-level diff (screenshot A vs. screenshot B, highlight different pixels). This produces thousands of false positives for any minor UI change. Orbit's approach: ask Claude to look at two screenshots and describe what *semantically* changed. "The checkout button moved from the bottom-left to the bottom-right of the panel." "The font size of the price appears larger." "The loading spinner was replaced with a skeleton loader." This semantic diffing can distinguish intentional design changes from unintentional regressions in a way pixel-diffing cannot.

### Performance Testing Agent (v2)

A specialized sub-agent that runs alongside functional tests and tracks: Core Web Vitals (LCP, CLS, FID, INP), API latency by endpoint (with percentile breakdowns), database query counts per page load (via APM integration), and bundle size trends. When it detects a regression ("API response time for `/api/users` increased from 120ms to 890ms"), it flags it and suggests likely causes based on the code diff.

### Security Testing Agent (v3)

An opt-in security testing agent that runs OWASP Top 10 checks against the staging environment. It attempts: SQL injection payloads in form inputs, XSS payloads in text fields, unauthorized access to protected routes (by manipulating JWT claims), IDOR attacks (guessing other users' resource IDs), CSRF token bypasses, and open redirect vulnerabilities. All done in the staging environment, never production. Results are reported separately from functional tests with severity ratings.

### Multi-Agent Parallel Architecture (v3)

Rather than running functional, performance, accessibility, and security tests sequentially, Orbit spins up specialized agents in parallel — one browser instance per agent type, all hitting the staging environment simultaneously. Total test suite time drops dramatically. A coordinator agent aggregates results from all sub-agents into a unified report.

### Test as Documentation (v2)

Orbit generates a human-readable specification document alongside the test plan. Each test case produces a plain-English description of the expected behavior: "When a logged-in user navigates to /checkout with items in their cart, they should see an itemized order summary, a shipping address form, and a payment form. Submitting valid information should redirect them to /order/confirmation." This document is kept in sync with the test plan and serves as living functional documentation of the application — always up to date because it's derived from the same code analysis as the tests.

### Orbit Insights & Analytics (v2)

A dedicated analytics view showing: test health trends over time, most frequently failing tests (and their correlation with which team members' code changes), most bug-prone areas of the codebase (routes/components that generate the most failures), mean time to detect (MTTD) regressions, and test coverage trend over time. These insights help engineering leads understand where technical debt is accumulating and where testing investment should be focused.

### Cross-Service Integration Testing (v3)

For microservice architectures, Orbit coordinates test runs across multiple repos/services. A "service mesh" configuration defines which services interact with which. Integration test scenarios exercise API contracts between services — verifying that Service A's requests are handled correctly by Service B, using contract testing principles (similar to Pact). Orbit automatically detects service boundaries from import patterns and API call sites.

### Mobile Testing — React Native / Expo (v3)

Extend Orbit's repo indexing and test planning to React Native codebases. Execution via Detox (for simulator testing) or cloud device farms (BrowserStack, Sauce Labs). The same planning and reporting infrastructure applies, with mobile-specific test primitives: tap, swipe, pinch, back button, deep link.

### Shadow Testing (v3)

An advanced capability for teams that want zero-risk production validation: Orbit intercepts a sample of real production HTTP requests (via a proxy layer) and replays them against the staging environment, comparing responses. If production returns `{"status": "success"}` but staging returns `{"status": "error"}`, that's a divergence worth investigating. This catches environment-specific bugs that only manifest with real data shapes.

### LLM-Powered Test Review (v2)

Orbit reviews human-written tests and suggests improvements. "This test doesn't assert the error state when the email is invalid." "This test uses a hardcoded user ID that may not exist in all environments — consider creating the user as part of the test setup." "This test has no teardown and will leave test data in the database." Surfaced as inline suggestions in the VS Code extension and as a "Test Quality Report" in the dashboard.

### Orbit for AI-Generated Code (v2)

A special mode triggered when Orbit detects that a PR was authored primarily by an AI coding tool (detected via commit metadata from Cursor, Claude Code, etc. — these tools often include identifiers in commit messages). In this mode, Orbit applies a stricter testing posture: 100% coverage target for all changed code, automatic generation of adversarial edge case tests, deeper security checks, and a mandatory human review step before test results are marked as passing. Addresses the real and documented problem that AI-generated code has higher defect rates.

---

## 11. Technical Architecture Overview

### System Services

**Indexing Service:** Stateless workers that clone repos, run tree-sitter parsing, extract routes/components/endpoints, generate embeddings, and write to the System Map store. Horizontally scalable. Written in TypeScript, runs on Node.js. Triggered by webhook events or manual sync requests. Queue-backed via BullMQ.

**Planning Service:** LLM-backed service that consumes the System Map and produces test plans. Interfaces with the AI provider APIs. Caches generated plans in Postgres. Exposes REST endpoints for plan retrieval and modification.

**Execution Service:** Manages test run orchestration. Allocates browser instances (via Browserbase API or self-managed Playwright cluster), distributes test cases to executor workers via BullMQ, collects results, stores artifacts (screenshots, videos) in S3-compatible object storage, updates run status in real time via WebSocket for the dashboard.

**Agent Orchestrator:** The coordinator that manages multi-agent workflows. Decides which agent runs when, passes context between agents, handles agent failures and retries, manages token budgets per run.

**Reporting Service:** Consumes run results and generates reports, comments, and notifications. Interfaces with Linear API, GitHub API, Slack API. Stores formatted reports in Postgres.

**API Gateway:** Next.js API routes (or a separate Express service for high-traffic deployments) that serve the REST API and handle webhook ingestion.

**Event Bus:** BullMQ on Redis for job queuing between services. Enables async processing, retry logic, and job prioritization.

### Data Layer

**PostgreSQL (primary database):** Stores workspaces, projects, users, test plans, run history, billing data, audit logs, secret vault (encrypted). Managed Postgres (Neon, Supabase, or RDS).

**pgvector (vector embeddings):** Extension on the same Postgres instance stores code embeddings for semantic retrieval. For very large customers, a dedicated Pinecone or Qdrant instance.

**Redis:** Job queues (BullMQ), session storage, rate limiting, real-time pub/sub for WebSocket run progress updates, prompt cache layer.

**S3-Compatible Object Storage (Cloudflare R2 or AWS S3):** Screenshots, videos, DOM snapshots, full run artifact archives.

**Browserbase / Self-Managed Playwright Cluster:** Cloud browser infrastructure for test execution. Browserbase provides managed browser sessions with anti-bot, CAPTCHA solving, and reliable network. Self-hosted option using Playwright running in Docker containers on Railway or Fly.io for cost-sensitive deployments.

### Security Architecture

- All inter-service communication over TLS
- Secrets stored encrypted at rest (AES-256) with keys managed by AWS KMS or Vault
- Browser execution runs in ephemeral, network-isolated containers — each test run gets a fresh container that is destroyed after completion
- Agent access is scoped: the executor agent can only interact with the configured staging environment URL, never make arbitrary HTTP requests
- API keys are hashed (not stored in plaintext) — auth via bcrypt comparison
- Zero-trust network model: services authenticate to each other via short-lived JWTs, not shared secrets

### Multi-Tenancy & Isolation

- Each workspace's data is row-isolated in Postgres via workspace_id foreign key on every table
- Vector embeddings are namespaced per workspace in pgvector
- Browser sessions are fully isolated — one workspace's execution cannot access another's environment
- Rate limiting applied per workspace at the API gateway level

### Scalability

For 100 concurrent test runs: the Execution Service distributes jobs across a pool of Playwright worker processes (each running 1 browser instance). Browserbase supports 500+ concurrent sessions on enterprise plans. The database read path is handled by read replicas. Redis handles the job queue fan-out. Horizontal scaling of the Execution Service workers handles increased load without architectural changes.

---

## 12. Monetization & Pricing Architecture

### Credit System

Test execution consumes credits. Credits are the unit of consumption billing that sits on top of seat pricing. One credit roughly corresponds to one test case execution (browser agent run + LLM inference for one test). Credits are consumed at rates that reflect actual LLM and infrastructure costs with a margin.

Approximate credit costs:
- Smoke test (5–10 tests): ~10–20 credits
- Full suite (50 tests): ~100–150 credits
- PR regression run (10–20 tests): ~20–40 credits

### Pricing Tiers

**Free**
- 1 project, 1 user
- 500 credits/month (enough for ~25 PR regression runs)
- Core indexing + planning + execution
- GitHub integration, basic dashboard
- Community support

**Pro — $79/month per seat**
- Unlimited projects
- 5,000 credits/month per seat, purchasable top-ups at $0.02/credit
- All integrations (Linear, Slack, VS Code extension, CLI)
- Custom system prompt (user layer)
- Plugin marketplace access
- 30-day run history
- Email support + SLA

**Team — $149/month per seat**
- Everything in Pro
- 20,000 credits/month per seat
- Admin settings, audit logs, role-based permissions
- SSO (Google Workspace, Okta)
- Plugin authoring (create and publish workspace-private plugins)
- 1-year run history
- Priority support + Slack Connect

**Enterprise — Custom pricing**
- Everything in Team
- Self-hosted deployment option (single-tenant on customer's infrastructure)
- Bring your own AI API keys (route to your own Anthropic/OpenAI accounts)
- Custom data retention and residency
- SOC 2 Type II report access
- Dedicated support and onboarding
- SLA with uptime guarantees
- Audit log export and compliance tooling

**Managed QA Service — $2,000–5,000/month per project**
- Sunrise Systems operates Orbit on behalf of the client
- Our team reviews test plans, annotates critical flows, triages failures
- Monthly QA health report delivered to the client
- Bridges the gap between "buy a tool" and "hire a QA engineer"
- This is the agency play — Orbit becomes both our internal advantage and our service offering

### Credit Top-Ups

Available in blocks: 5,000 credits ($90), 25,000 credits ($400), 100,000 credits ($1,400). Volume discounts at higher tiers. Credits roll over for 12 months. Enterprise accounts can negotiate per-seat unlimited credits.

### Billing Dashboard

Real-time credit balance, consumption chart (by project, by day), per-run credit breakdown, projected end-of-month usage based on current burn rate, alert thresholds (notify at 75% and 95% consumed). One-click credit purchase.

---

*Orbit v1.0 Specification | Sunrise Systems | Confidential*
*Next: Technical RFC for Indexing Service implementation | MVP scope: Sections 2, 3, 4, 8 (onboarding + main dashboard only)*
