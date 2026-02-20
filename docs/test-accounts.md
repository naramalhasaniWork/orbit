# Orbit Test Accounts & Seed Data

## How to Seed

```bash
pnpm db:seed
```

The seed script is **idempotent** — safe to run multiple times. It uses upserts for core entities and deletes/recreates graph data (nodes, edges, results).

## Test Accounts

| Email | Role | Workspace |
|---|---|---|
| admin@orbit-test.com | Admin | Orbit Demo |
| member@orbit-test.com | Member | Orbit Demo |
| viewer@orbit-test.com | Viewer | Orbit Demo |

## Demo Data

- **Workspace**: "Orbit Demo" (slug: `orbit-demo`, 5000 credits, pro plan)
- **Project**: "Acme Dashboard" (slug: `acme-dashboard`, repo: vercel/next.js)
- **System Map**: 45 nodes (15 routes, 9 endpoints, 12 components, 6 models, 3 auth strategies) + 52 edges
- **Test Plan**: v1 with 15 test cases across 6 journeys
- **Test Runs**: 5 runs over the last 7 days with mixed results
- **Environments**: Staging, Preview, QA (default)
- **Flaky Tests**: 3 registered with pass rates and quarantine status
- **Audit Log**: 10 recent activity entries

## Where to See It

- **Dashboard**: `/dashboard` — health strip, system map, runs timeline
- **System Map**: `/dashboard/map` — full interactive map with 45 nodes and 52 edges
- **Test Plans**: `/dashboard/plans` — 15 test cases grouped by journey
- **Test Runs**: `/dashboard/runs` — 5 runs with expandable results
- **Settings**: `/dashboard/settings` — environments and secrets
