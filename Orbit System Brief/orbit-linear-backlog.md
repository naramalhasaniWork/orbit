# Orbit — Linear Backlog

Import these into the **Orbit** team in Linear. Projects group related work. Tasks within each project should be created as issues.

---

## Project 1: Core Platform Infrastructure

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| Next.js 14 App Router scaffolding | High | Project init with TypeScript strict, Tailwind, pnpm, shadcn/ui dark theme |
| Prisma schema (48 models) | High | Full schema: workspaces, users, projects, environments, secrets, system_map_nodes/edges, test_plans, test_cases, test_runs, test_results, flaky_tests, selector_mappings, audit_logs, webhook_deliveries, scheduled_runs, domain_knowledge, knowledge_chunks, api_keys, invitations, provider_configs, model_configs, prompt_overrides, billing tables, plugin_configs, visual_baselines |
| PostgreSQL + pgvector setup | High | Railway Postgres with vector extension, HNSW indexes for semantic search |
| NextAuth with GitHub OAuth | High | JWT strategy, auto-workspace provisioning, GitHub token persistence to DB |
| Route protection middleware | High | Middleware.ts protecting /dashboard/*, /api/* routes, redirect to /login |
| RBAC + permissions system | Medium | Role-based access control: owner, admin, member, viewer. Per-resource permissions |
| Tenant isolation | High | workspace_id on every query, API helpers enforce tenant scoping |
| API key authentication | Medium | Hash-based API key auth for external API access (v1 routes) |
| Redis connection + pub/sub | High | ioredis singleton, pub/sub helpers for real-time events |
| BullMQ queues + workers | High | Queue definitions (indexing, execution, reporting, scheduling), worker handlers |
| AES-256 vault encryption | High | Secret encryption/decryption for storing credentials |
| Storage abstraction | High | Local filesystem + S3/R2 compatible storage with automatic fallback chain |
| WebSocket (Socket.IO) setup | Medium | Real-time channels for indexing progress, run progress, dashboard updates |
| SSE streaming endpoints | Medium | Server-Sent Events for /sync/progress and /runs/[runId]/progress |

### Remaining / Future

| Task | Priority | Description |
|------|----------|-------------|
| Database migration automation | Medium | Prisma migrate deploy in CI/CD pipeline |
| Connection pooling tuning | Low | PgBouncer or Prisma connection pool optimization for production load |
| Redis cluster support | Low | Multi-node Redis for HA deployment |
| Rate limiting per workspace | Medium | Redis-based rate limiter on API routes (structure exists, needs tuning) |

---

## Project 2: AI & Model System

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| Anthropic Claude provider | High | Claude API wrapper with streaming, tool use, structured output |
| OpenAI provider + embeddings | High | GPT/embedding API wrapper, text-embedding-3-small for vectors |
| OpenRouter provider | Medium | OpenRouter API wrapper for additional model access |
| Model router | High | Task-type-to-model mapping with workspace overrides (Haiku for classification, Sonnet for reasoning, Opus for security) |
| Token budget tracker | Medium | Per-run token tracking, budget enforcement, workspace usage aggregation |
| Tracked completions | Medium | AI call wrapper that logs token usage, latency, model used to DB |
| Agent prompt templates | High | Operator + User layer prompts for all 4 agents (Analyst, Planner, Executor, Reporter) |
| Agent Zod schemas | High | Structured output schemas for System Map, Test Plan, Execution Result, Run Summary |
| Agent registry | Medium | Dynamic agent registration with phase routing |
| Agent context window manager | Medium | Token-aware context truncation and prioritization |
| Prompt versioning API | Medium | CRUD for workspace prompt overrides with version history |
| Admin model management | Medium | Global model config CRUD, enable/disable models per workspace |

### Remaining / Future

| Task | Priority | Description |
|------|----------|-------------|
| Prompt A/B testing | Low | Compare prompt versions by output quality metrics |
| Model cost optimization | Medium | Auto-downgrade to cheaper models when budget is low |
| Fine-tuned model support | Low | Support for fine-tuned OpenAI/Anthropic models |
| Prompt caching (Redis) | Medium | Cache frequent prompt+context combinations to reduce API calls |

---

## Project 3: Repo Indexing & System Map

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| GitHub repo cloning | High | Clone via GitHub API with user's persisted access token |
| GitLab repo cloning | Medium | GitLab clone adapter |
| Bitbucket repo cloning | Low | Bitbucket clone adapter |
| Language/manifest fingerprinting | High | Detect languages, package managers, config files |
| Framework detection | High | Next.js, Express, React, Vue, Angular, Django, Rails, Laravel, etc. |
| Next.js route/component extraction | High | App Router + Pages Router, layouts, API routes, middleware |
| Express route extraction | High | Express/Koa/Fastify route parsing |
| Generic fallback parser | Medium | Regex-based extraction for unsupported frameworks |
| AST parsing (tree-sitter) | High | tree-sitter WASM integration for TypeScript, JavaScript, Python, Go, Rust, Java |
| Regex-based AST fallback | Medium | Fallback parser when tree-sitter WASM fails |
| Route manifest builder | High | Aggregate all routes into structured manifest |
| Component tree mapper | High | Map component hierarchy and dependencies |
| Embedding generation | High | OpenAI text-embedding-3-small, store in pgvector |
| System Map directed graph builder | High | Build nodes (routes, components, endpoints, models, auth) and edges (imports, calls, renders) |
| 6-phase indexing pipeline | High | Clone -> Fingerprint -> Detect -> Parse -> Embed -> Build Map |
| Incremental re-indexing | Medium | Diff-based re-index on subsequent syncs |
| Indexing progress SSE | Medium | Real-time progress streaming during indexing |
| System Map API (GET/POST) | High | API routes for fetching and triggering system map generation |

### Remaining / Future

| Task | Priority | Description |
|------|----------|-------------|
| Monorepo support | Medium | Handle monorepos with multiple packages/apps |
| Private npm registry auth | Low | Support for private package registries during indexing |
| Webhook-triggered re-index | Medium | Auto re-index on GitHub push events (webhook receiver exists, needs wiring) |
| System Map diff visualization | Low | Show what changed between index versions |

---

## Project 4: Test Planning

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| Coverage analyzer | High | Detect existing tests, identify gaps in coverage |
| Journey reconstructor | High | Reconstruct user journeys from System Map routes |
| LLM test case generator | High | AI-generated test cases with descriptions, steps, assertions |
| Priority scorer | High | Criticality/risk/coverage scoring for test case prioritization |
| Plan cache + versioning | Medium | Store and version test plans in Postgres |
| Planning pipeline orchestrator | High | End-to-end: analyze coverage -> reconstruct journeys -> generate tests -> prioritize |
| Diff-based plan updates | Medium | Update plan based on code changes (diff analyzer) |
| AI suggestions engine | Medium | Suggest additional test cases based on patterns |
| orbit.config.ts support | Medium | Project-level config for planning preferences |
| Plan approval workflow | Medium | Approve/reject generated test plans before execution |
| Manual test case CRUD | Medium | Add, edit, delete individual test cases |
| Plan API routes | High | GET plan, POST generate, POST approve, POST add-test |

### Remaining / Future

| Task | Priority | Description |
|------|----------|-------------|
| Test case templates | Low | Reusable templates for common test patterns |
| Cross-project test sharing | Low | Share test patterns across workspace projects |
| Regression detection | Medium | Auto-flag areas with recent failures for extra coverage |

---

## Project 5: Test Execution

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| Playwright browser manager | High | Browser lifecycle management, pool, cleanup |
| Stagehand adapter | High | Stagehand act/extract/observe wrapper for AI-driven browser interaction |
| Step executor | High | Execute individual test steps with timeout, retry |
| Action performer | High | Translate test actions to browser commands |
| Test case executor | High | Execute full test case (multiple steps) |
| Self-healer | High | When selectors break, AI attempts to find matching element (confidence > 85%) |
| Sub-agent healing | Medium | Delegate complex healing to sub-agent with DOM context |
| Selector memory | Medium | Remember healed selectors for future runs |
| Evidence collector | High | Capture screenshots, DOM snapshots, network logs, console output |
| Screenshot streamer | Medium | Real-time screenshot streaming during execution |
| Flaky test registry | Medium | Track tests with inconsistent results for quarantine |
| Environment validator | Medium | Pre-run checks (URL reachable, auth working, etc.) |
| Baseline snapshot manager | Medium | Visual regression baselines for comparison |
| Run orchestrator | High | Full run lifecycle: validate -> execute cases -> collect evidence -> report |
| Parallel test executor | Medium | Run multiple test cases in parallel (configurable concurrency) |
| Run progress SSE | Medium | Real-time progress streaming during execution |
| Run cancel API | Medium | Cancel in-progress runs |
| Run comparison API | Medium | Compare results between two runs |

### Remaining / Future

| Task | Priority | Description |
|------|----------|-------------|
| Browserbase cloud integration | Medium | Use Browserbase for cloud browser execution instead of local Playwright |
| Video recording | Medium | Full video capture of test execution |
| Network request interception | Low | Mock/intercept network requests during execution |
| Mobile viewport testing | Medium | Execute tests in mobile viewport sizes |
| Multi-browser support | Low | Test across Chrome, Firefox, Safari |

---

## Project 6: Reporting & Integrations

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| AI failure analyzer | High | LLM-powered failure explanations with root cause analysis |
| Failure pattern tracker | Medium | Track recurring failure patterns across runs |
| Run report generator | High | Aggregate run results into structured report |
| Test documentation generator | Medium | Auto-generate test documentation from plans/results |
| GitHub PR comments | Medium | Post test results as PR comments (integration stub) |
| GitHub status checks | Medium | Report pass/fail as GitHub commit status |
| GitHub repo webhook receiver | High | Receive push/PR events, HMAC validation |
| Linear issue creation | Medium | Create Linear issues from failed tests |
| Linear webhook receiver | Medium | Receive Linear webhook events |
| Slack notifications | Medium | Send run results to Slack channels |
| Slack slash commands | Medium | /orbit-run, /orbit-status Slack commands |
| Slack webhook receiver | Medium | Receive Slack interaction callbacks |
| Outbound webhook delivery | Medium | Send events to user-configured webhook URLs |
| CI workflow integration | Medium | Generate CI config for automated runs |
| Railway integration | Medium | Connect Railway projects, sync environments, deploy triggers |

### Remaining / Future

| Task | Priority | Description |
|------|----------|-------------|
| Email report delivery | Low | Send HTML email reports |
| Jira integration | Low | Create Jira tickets from failures |
| PagerDuty integration | Low | Alert on critical test failures |
| Custom webhook templates | Low | User-customizable webhook payload templates |
| Trend analysis reports | Medium | Weekly/monthly trend reports with charts |

---

## Project 7: Dashboard & UI

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| Dashboard layout shell | High | Sidebar + header + main content area |
| Collapsible sidebar navigation | High | Icon-only collapsed, expand on hover, 11 nav items |
| Dashboard header + project selector | High | Top bar with workspace context |
| Health badge component | Medium | Status indicator badge |
| System Map visualization | High | Force-directed graph (react-force-graph-2d), nodes colored by test status |
| System Map controls | Medium | Zoom, filter, search, layout toggle |
| System Map node detail panel | Medium | Click-to-inspect node details, connected edges |
| Health strip (4 stat cards) | High | Pass rate, coverage, flaky count, avg duration with trend sparklines |
| Runs timeline | High | Last 20 runs with status, duration, sparklines |
| Active run bar | Medium | Live progress indicator for running tests |
| Activity feed | Medium | Real-time event feed on dashboard |
| Quick actions panel | Medium | Common actions: run tests, sync repo, view plan |
| Coverage map | Medium | Color-coded route grid showing test coverage |
| Run comparison view | Medium | Side-by-side run result comparison |
| Dashboard client component | High | Main dashboard page with all widgets |

### Remaining / Future (see also Project 10: UI Overhaul)

| Task | Priority | Description |
|------|----------|-------------|
| Dashboard widget customization | Low | Drag-and-drop widget layout |
| Keyboard shortcuts | Medium | Navigation shortcuts (g+d for dashboard, g+m for map, etc.) |
| Command palette (Cmd+K) | Medium | Global command palette for quick navigation |
| Dashboard mobile responsiveness | Medium | Mobile-optimized dashboard layout |

---

## Project 8: Onboarding

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| 6-step onboarding wizard | High | State machine: Connect Repo -> Indexing -> Map Preview -> Config Env -> Plan Preview -> First Run |
| Step indicator component | Medium | Progress dots showing current step |
| Connect repo step | High | GitHub OAuth repo list, select and connect |
| Indexing progress step | High | Live force-directed graph, animated nodes appearing, real-time log |
| System Map preview step | High | Full interactive map review |
| Configure environment step | High | Staging URL, vault credentials setup |
| Test plan preview step | High | Journey-grouped test list with toggles |
| First run / launch step | High | Embedded browser viewport with live execution |

### Remaining / Future

| Task | Priority | Description |
|------|----------|-------------|
| Onboarding analytics | Low | Track drop-off at each step |
| Skip/resume onboarding | Medium | Allow users to skip steps and return later |
| Onboarding tutorial tooltips | Low | Contextual help during first use |

---

## Project 9: Test Plans & Runs Views

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| Test plans list page | High | Plans grouped by journey, expandable test cases |
| Plan summary component | Medium | Coverage stats, priority distribution |
| Journey group component | High | Collapsible journey sections with test cases |
| Plan row component | High | Individual test case row with status, priority, actions |
| Coverage map visualization | Medium | Color-coded route grid |
| AI suggestions panel | Medium | AI-recommended additional tests |
| Add test dialog | Medium | Manual test case creation form |
| Plan approval component | Medium | Approve/reject workflow UI |
| Test case editor | Medium | Edit test case details, steps, assertions |
| Runs list page | High | Filterable list of all test runs with status |
| Runs filter component | Medium | Filter by status, date range, trigger type |
| Runs summary bar | Medium | Aggregate stats for filtered runs |
| Run detail page | High | Metadata header, step-by-step logs, screenshots |
| Step log component | High | Expandable step execution log with timing |
| Failure analysis panel | High | Expected vs actual, AI root cause, fix suggestion |
| Failure patterns panel | Medium | Recurring failure pattern visualization |
| Test result card | Medium | Individual test result with evidence |
| Run comparison view | Medium | Compare two runs side-by-side |

### Remaining / Future

| Task | Priority | Description |
|------|----------|-------------|
| Video replay in run detail | Medium | Playback of test execution recording |
| Test case history view | Medium | View all runs of a specific test case over time |
| Bulk test case operations | Low | Select multiple, bulk enable/disable/delete |

---

## Project 10: UI Overhaul & Brand Refresh (ACTIVE)

### To Do

| Task | Priority | Description |
|------|----------|-------------|
| Replace Punch Red with FF6000 accent | Urgent | Change primary/accent from HSL 353 87% 54% (red) to HSL 24 100% 50% (#FF6000 orange) across globals.css, tailwind.config.ts |
| Fix dark text on dark background | Urgent | Increase contrast ratios for all text on dark surfaces, ensure WCAG AA compliance |
| Redesign dark mode surface system | High | Current Space Indigo tints cause readability issues — recalibrate lightness levels |
| Build proper light mode | High | Current light mode is generic — design intentional light theme with FF6000 accent |
| Update all hardcoded color references | High | Find and replace hardcoded HSL/hex values in components referencing old red |
| Update selection/focus/ring colors | Medium | Selection highlight, focus rings, input borders to use new accent |
| Update glow effects | Medium | All glow utilities (glow-primary, glow-accent, etc.) to use FF6000 |
| Update marketing pages brand | High | Landing, about, pricing, features pages with new color system |
| Update sidebar active indicators | Medium | Sidebar active state uses orbit-accent — ensure it works with new color |
| Update status colors harmony | Medium | Ensure pass/fail/flaky/untested colors harmonize with FF6000 accent |
| Typography audit | Medium | Review font sizes, weights, line-heights for readability across all pages |
| Button/badge/input component audit | Medium | Verify all UI primitives work in both light and dark mode |
| Loading states + skeleton colors | Low | Update skeleton and loading spinner to match new theme |
| Scrollbar styling | Low | Update dark scrollbar thumb colors |
| System Map node colors | Medium | Ensure graph node colors are visible and meaningful against new backgrounds |

---

## Project 11: Settings & Configuration

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| Project settings page | High | Environment URLs, secret management |
| Environment CRUD | High | Create, edit, delete environments with staging URLs |
| Secret management (masked UI) | High | AES-256 encrypted secrets, masked display |
| Workspace settings page | Medium | Workspace name, slug, general settings |
| Team member management | High | Invite, remove, change roles |
| Invitation system | Medium | Email-based invitations with token acceptance |
| Workspace switcher | Medium | Switch between workspaces |
| API key management | Medium | Generate, revoke API keys |
| Webhook settings | Medium | Configure outbound webhook URLs |
| Integration settings page | Medium | GitHub, Linear, Slack connection management |
| Provider configuration | Medium | Configure AI providers (Anthropic, OpenAI, OpenRouter) per workspace |
| Model selection per workspace | Medium | Choose which models to use for each agent phase |
| Billing page | Medium | Subscription status, usage dashboard, invoice history |
| Stripe checkout integration | Medium | Subscribe to plans, manage billing |
| Credit system | Medium | Token/credit usage tracking and alerts |
| Plugin configuration | Medium | Enable/disable workspace plugins |
| Knowledge base management | Medium | Upload domain knowledge files for context |
| Prompt override editor | Medium | Customize agent prompts per workspace |
| Audit log viewer | Medium | View workspace and project audit trails |
| Profile page | Medium | User profile settings |
| MCP tools configuration | Low | Configure MCP server connections |
| Agent configuration | Low | Configure agent behavior per workspace |

### Remaining / Future

| Task | Priority | Description |
|------|----------|-------------|
| SSO/SAML authentication | Low | Enterprise SSO support |
| Custom domain support | Low | White-label with custom domains |
| Data export (GDPR) | Medium | Export all workspace data |
| Workspace deletion workflow | Medium | Full workspace data deletion |

---

## Project 12: Admin Panel

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| Admin dashboard | High | Platform-wide stats, active workspaces, usage |
| Admin workspace management | High | View all workspaces, impersonate users |
| Admin user management | High | View all users, roles, activity |
| Admin analytics | Medium | Platform usage analytics |
| Admin system config | Medium | Feature flags, global settings |
| Admin audit logs | Medium | Platform-wide audit trail |
| Admin model management | Medium | Global model availability, pricing config |
| Admin prompt management | Medium | Default prompt templates management |
| Super admin email promotion | High | Auto-promote configured emails to super_admin role |
| Impersonation | Medium | Admin can impersonate workspace for debugging |

---

## Project 13: Marketing Website

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| Landing page | High | Hero section, feature highlights, CTA, animated system map |
| About page | Medium | Company story, team, mission |
| Pricing page | High | Tier cards, feature comparison table, FAQ |
| Features page | High | Categorized feature grid with icons |
| Documentation page | Medium | Getting started, API reference links |
| Blog page | Low | Blog listing page (placeholder) |
| Changelog page | Low | Release notes page (placeholder) |
| Privacy policy page | Low | Privacy policy content |
| Terms of service page | Low | ToS content |
| Security page | Low | Security practices page |
| Marketing footer | Medium | Links, social, newsletter signup |
| Marketing header/nav | Medium | Navigation with sign in/up CTAs |
| Animated system map hero | High | Canvas-based animated graph on landing page |
| CTA section component | Medium | Reusable call-to-action section |

### Remaining / Future (see also Project 10: UI Overhaul)

| Task | Priority | Description |
|------|----------|-------------|
| SEO optimization | Medium | Meta tags, Open Graph, structured data |
| Blog CMS integration | Low | Connect to headless CMS for blog content |
| Customer testimonials | Low | Testimonial section on landing page |
| Interactive demo | Medium | Embedded demo of Orbit workflow without sign-up |

---

## Project 14: DevOps & Deployment

### Completed (mark as Done)

| Task | Priority | Description |
|------|----------|-------------|
| Dockerfile (multi-stage) | High | Base -> Deps -> Builder -> Runner, standalone output |
| Railway deployment config | High | Connected to Railway with Postgres + Redis |
| Environment variable setup | High | All env vars configured in Railway |
| Health check endpoint | Medium | /api/health for monitoring |

### Remaining / To Do

| Task | Priority | Description |
|------|----------|-------------|
| Fix STORAGE_PATH env var | Urgent | Change from `./data` to `/data/storage` in Railway (volume mounted at /data) |
| GitHub OAuth callback URL | High | Update NEXTAUTH_URL and GitHub OAuth app callback after Railway URL is live |
| CI/CD pipeline | Medium | GitHub Actions for lint, type-check, test, deploy |
| Staging environment | Medium | Separate Railway environment for staging |
| Error monitoring (Sentry) | Medium | Add Sentry for production error tracking |
| Log aggregation | Low | Structured logging to external service |
| Uptime monitoring | Low | External health check monitoring |
| Database backups | Medium | Automated Postgres backup schedule |
| CDN for static assets | Low | CloudFront or Cloudflare CDN for public assets |

---

## Project 15: Testing & Quality

### To Do

| Task | Priority | Description |
|------|----------|-------------|
| Unit tests for services | High | Test indexing, planning, execution, reporting services |
| API route integration tests | High | Test all API endpoints with Zod schema validation |
| E2E flow test | High | Sign up -> connect repo -> index -> plan -> execute -> view results |
| Component tests (Vitest) | Medium | Test React components with testing-library |
| Auth flow tests | Medium | Test OAuth, session, middleware, RBAC |
| Load testing | Low | Stress test concurrent indexing and execution |
| Security audit | Medium | OWASP top 10 review, dependency audit |
| Accessibility audit | Medium | WCAG compliance check across all pages |

---

## Bug Fixes (create as standalone issues)

| Bug | Priority | Status | Description |
|-----|----------|--------|-------------|
| pgvector jsonb column type | High | Fixed | Prisma creates vector columns as jsonb — ensureVectorSetup() now detects and converts |
| GitHub token not persisted to DB | High | Fixed | Token was only in JWT, workers couldn't access — now persists on sign-in |
| Storage EACCES on Railway | High | Code fixed, env var needs update | STORAGE_PATH=./data resolves to /app/data, not the volume at /data. Change to /data/storage |
| tree-sitter WASM webpack bundle | High | Fixed | Added webpack externals + createRequire for opaque resolution |
| Duplicate page.tsx conflict | High | Fixed | Root page.tsx and (marketing)/page.tsx both resolved to / — deleted marketing one |
| scheduled_runs column mismatch | High | Fixed | DB had wrong column names vs Prisma schema — ran SQL migration |
| CtaSection prop type error | Medium | Fixed | Removed unused content prop from 3 marketing page components |
| User needs re-login for token | Medium | Known | After deploying auth fix, user must sign out and back in for GitHub token to persist |

---

## Milestones

### Milestone 1: MVP Launch
**Target:** First public users
- All Project 14 (DevOps) remaining items
- Project 10 (UI Overhaul) — at least accent color + dark mode fix
- Project 15 (Testing) — at least E2E flow test
- Fix all Urgent bugs

### Milestone 2: Integration Launch
- Browserbase cloud execution
- Full GitHub/Linear/Slack integrations (not just stubs)
- CI/CD auto-trigger on push
- Video recording in execution

### Milestone 3: Enterprise
- SSO/SAML
- Custom domains
- Advanced billing
- Multi-region deployment
- SOC 2 compliance
