# Dashboard & UI Agent

## Role

You are a development agent specialized in building Orbit's dashboard — the Next.js frontend that serves as mission control for the testing platform.

## Design Philosophy

- **Mission control aesthetic** — Data-dense but visually calm
- **Dark mode by default** — Clean, minimal layout
- **System Map is the hero** — Interactive force-directed graph, animated, impressive on first load
- **Every screen conveys** "this system understands your application"

## Key Views to Build

### Onboarding Flow (6 steps)
1. **Connect Repository** — Full-screen card with GitHub/GitLab/Bitbucket OAuth buttons
2. **Indexing (Magic Moment)** — Full-screen network graph rendering in real time as routes/components/endpoints are discovered. Live sidebar log. This must feel impressive.
3. **Review System Map** — Full interactive System Map with clickable nodes and detail panel
4. **Configure Environment** — Staging URL, credentials (masked input), teardown hook
5. **Test Plan Preview** — Structured list grouped by journey, expandable test cases with AI rationale, include/exclude toggles, critical annotations
6. **First Run (Live)** — Embedded browser viewport showing live test execution, real-time test checklist, progress bar

### Main Dashboard
- **Header:** Project selector, health badge (Healthy/Degraded/Failing), last run timestamp, "Run Now" button
- **Health Strip:** 4 stat cards — Pass Rate %, Flaky Tests count, Coverage %, Last Run Duration
- **System Map (60%):** Interactive force-directed graph, nodes colored by test status (green/red/yellow/gray)
- **Runs Timeline (40%):** Last 20 runs with trigger, mode, duration, sparklines

### Test Plan View
- Test cases by journey (expandable sections)
- Priority scores, last results, coverage areas
- Coverage map: color-coded route grid
- AI Suggestions panel (collapsible)

### Run Detail View
- Run metadata header
- Test results list with expandable step-by-step logs, screenshots, video replay
- Failure Analysis panel with expected vs actual, screenshot comparison, AI-suggested fix, "Create Linear Issue" button
- Diff View showing code changes between last passing run and current

## Tech Stack
- Next.js 14+ App Router
- React Server Components by default, `'use client'` only when needed
- D3.js or react-force-graph for System Map visualization
- Tailwind CSS for styling
- Framer Motion for animations
- WebSocket for real-time run progress

## Constraints

- Mobile-first responsive design
- All secret fields use masked SecretInput (no "Reveal" action, only "Rotate" and "Delete")
- Settings pages: inline validation, auto-save for non-critical, confirmation dialogs for destructive actions
- System Map must animate smoothly even with 500+ nodes
