# Multi-Project Onboarding, Archive & Environment Config

**Date:** 2026-02-24
**Status:** Approved

## Problem

1. Starting a new project's onboarding hijacks in-progress onboarding for another project (`detectOnboardingProgress` picks most recently updated project, not a specific one).
2. No way to archive projects — only hard delete exists.
3. Environments lack a default run mode, so users can't configure "staging gets full tests, preview gets smoke tests."
4. Environment settings UI is minimal.

## Design

### 1. Project-Scoped Onboarding

**Routing:**
- "Add project..." → `/dashboard/onboarding` (no param, starts fresh at step 1)
- Resume incomplete → `/dashboard/onboarding?project={projectId}` (resumes from DB state)

**Changes to `detectOnboardingProgress()`:**
- Accept optional `projectId` parameter
- When provided: check that specific project's state, resume from correct step
- When absent: create new project flow (step 1)
- Remove the "find most recently updated project" fallback

**Changes to onboarding wizard:**
- Read `projectId` from URL search params
- Pass it through all steps
- Step 1 (connect repo) creates project, then updates URL with new `projectId`
- All subsequent steps use that explicit `projectId`

**Header dropdown enhancement:**
- Show incomplete projects with a subtle indicator (e.g., "Setting up..." text or progress dot)
- Clicking an incomplete project navigates to `/dashboard/onboarding?project={projectId}`
- Clicking a complete project navigates to `/dashboard?project={projectId}` as usual

### 2. Project Archive (No Hard Delete)

**Archive action:**
- Button in project settings: "Archive Project"
- Confirmation dialog: "This will hide {name} from your dashboard. You can restore it anytime."
- Sets `status: 'archived'` and `deletedAt: new Date()`
- Redirects to dashboard (next active project or empty state)

**Restore action:**
- Sets `status: 'active'` and clears `deletedAt`
- Project reappears in header dropdown

**Visibility:**
- Header dropdown: only shows `status: 'active'` projects
- Dashboard pages: filter to active projects
- Settings: add "Archived Projects" section showing archived projects with restore button

**API changes:**
- `DELETE /api/projects/[projectId]` → change to archive (set status, not delete rows)
- Add `PATCH /api/projects/[projectId]` with `{ status: 'active' }` for restore
- List endpoints: add `?status=active` default filter, `?status=archived` for archive view

### 3. Per-Environment Default Run Mode

**Schema change:**
```prisma
model Environment {
  // ... existing fields
  defaultRunMode  String @default("full")  // full | smoke | regression
}
```

Migration: add column with default `"full"` — non-breaking.

**Run creation flow:**
1. Resolve target environment (explicit or default)
2. Read `environment.defaultRunMode`
3. Use as the run's mode (unless caller provides explicit override)
4. `POST /api/projects/[projectId]/runs` body: `{ mode?: string }` — optional, falls back to environment default

**UI labels:**
| Mode | Label | Description |
|------|-------|-------------|
| `full` | Full Suite | All enabled test cases |
| `smoke` | Smoke (Critical Path) | Critical and high priority only |
| `regression` | Regression (Changed Code) | Tests covering recently changed areas |

### 4. Enhanced Environment Settings UI

**Environment card layout:**
- Name + type badge (staging/preview/qa/production)
- URL (truncated with copy button)
- Default run mode selector (dropdown)
- "Default" indicator on the default environment
- "Set as default" action on non-default environments
- Delete action (with confirmation, blocked if it's the only environment)

**Add environment flow:**
- Name, type selector, URL input, default run mode selector
- Option to set as default immediately

## Files to Modify

### Schema & API
- `prisma/schema.prisma` — add `defaultRunMode` to Environment
- `src/app/api/projects/route.ts` — add status filter to list
- `src/app/api/projects/[projectId]/route.ts` — change DELETE to archive, support restore via PATCH
- `src/app/api/projects/[projectId]/environments/route.ts` — support `defaultRunMode` in create/update
- `src/app/api/projects/[projectId]/runs/route.ts` — read environment default mode

### Onboarding
- `src/components/onboarding/onboarding-wizard.tsx` — accept `projectId` from URL params
- `src/app/dashboard/onboarding/page.tsx` — pass search params to wizard
- `detectOnboardingProgress()` — scope to explicit projectId

### UI
- `src/components/layout/header.tsx` — show onboarding status, filter archived
- `src/components/settings/project-settings.tsx` — replace delete with archive
- `src/components/settings/environment-settings.tsx` — enhanced cards with run mode selector
- New: archived projects view (in settings or dedicated section)

## Non-Goals

- No hard delete in UI (data preservation)
- No per-environment test case toggles (run mode is sufficient)
- No background onboarding (user stays in wizard)
- No cross-project run orchestration
