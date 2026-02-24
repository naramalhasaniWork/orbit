# Multi-Project Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make onboarding project-scoped, replace hard delete with archive, add per-environment default run modes, and enhance environment settings UI.

**Architecture:** Four independent changes: (1) scope onboarding wizard to explicit projectId via URL params, (2) convert DELETE endpoint to soft-archive and add restore, (3) add `defaultRunMode` column to Environment and wire it into run creation, (4) enhance environment settings cards with run mode selector and set-as-default action.

**Tech Stack:** Next.js App Router, Prisma 7, TypeScript, Tailwind, shadcn/ui

---

### Task 1: Add `defaultRunMode` to Environment Schema

**Files:**
- Modify: `prisma/schema.prisma:432-451` (Environment model)

**Step 1: Add the column to the schema**

In `prisma/schema.prisma`, add `defaultRunMode` to the Environment model after `isDefault`:

```prisma
model Environment {
  id              String          @id @default(uuid()) @db.Uuid
  projectId       String          @map("project_id") @db.Uuid
  name            String
  type            EnvironmentType @default(staging)
  url             String
  teardownHookUrl String?         @map("teardown_hook_url")
  isDefault       Boolean         @default(false) @map("is_default")
  defaultRunMode  String          @default("full") @map("default_run_mode")
  source          String?
  sourceId        String?         @map("source_id")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @default(now()) @updatedAt @map("updated_at")

  project  Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  testRuns TestRun[]
  secrets  Secret[]

  @@index([projectId])
  @@map("environments")
}
```

**Step 2: Create migration**

Run: `pnpm db:migrate`
Name it: `add_environment_default_run_mode`
Expected: Migration file created in `prisma/migrations/` with `ALTER TABLE environments ADD COLUMN default_run_mode TEXT NOT NULL DEFAULT 'full'`

**Step 3: Regenerate Prisma client**

Run: `pnpm db:generate`
Expected: Client regenerated with `defaultRunMode` field on Environment type.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/generated/prisma/
git commit -m "feat: add defaultRunMode column to Environment model"
```

---

### Task 2: Wire Environment Default Run Mode into Run Creation API

**Files:**
- Modify: `src/app/api/projects/[projectId]/runs/route.ts:130-195`

**Step 1: Update environment query to include defaultRunMode**

In the POST handler, change the environment select (line ~148) to include `defaultRunMode`:

```typescript
const environment = await prisma.environment.findFirst({
  where: { id: environmentId, projectId },
  select: { id: true, type: true, url: true, defaultRunMode: true },
});
```

**Step 2: Use environment default when no explicit mode provided**

Change the run creation (line ~188) to fall back to environment default:

```typescript
const run = await prisma.testRun.create({
  data: {
    projectId,
    environmentId,
    testPlanId,
    status: "queued",
    mode: body.mode ?? (environment.defaultRunMode as "full" | "smoke" | "regression" | "targeted") ?? "full",
    trigger: "manual",
    triggeredById: session.user.id,
    branch: body.branch,
    commitSha: body.commitSha,
    prNumber: body.prNumber,
  },
});
```

**Step 3: Verify build**

Run: `pnpm build`
Expected: No TypeScript errors.

**Step 4: Commit**

```bash
git add src/app/api/projects/[projectId]/runs/route.ts
git commit -m "feat: use environment defaultRunMode when creating runs"
```

---

### Task 3: Add defaultRunMode to Environment Create/Update API

**Files:**
- Modify: `src/app/api/projects/[projectId]/environments/route.ts`

**Step 1: Add defaultRunMode to the create schema**

Update `CreateEnvironmentSchema` to accept `defaultRunMode`:

```typescript
const RUN_MODES = ["full", "smoke", "regression"] as const;

const CreateEnvironmentSchema = z.object({
  name: z.string().min(1, "Environment name is required").max(100),
  type: z.enum(ENVIRONMENT_TYPES).optional().default("staging"),
  url: z.string().url("Must be a valid URL").optional(),
  baseUrl: z.string().url("Must be a valid URL").optional(),
  teardownHookUrl: z.string().url().optional(),
  isDefault: z.boolean().optional().default(false),
  defaultRunMode: z.enum(RUN_MODES).optional().default("full"),
}).refine(
  (data) => data.url || data.baseUrl,
  { message: "Environment URL is required (url or baseUrl)", path: ["url"] }
);
```

**Step 2: Pass defaultRunMode through to prisma create**

In the POST handler, add `defaultRunMode` to the create data:

```typescript
const { name, type, url, baseUrl, teardownHookUrl, isDefault, defaultRunMode } = parsed.data;
const resolvedUrl = url ?? baseUrl!;

const environment = await prisma.environment.create({
  data: {
    projectId,
    name: name.trim(),
    type,
    url: resolvedUrl,
    teardownHookUrl,
    isDefault,
    defaultRunMode,
  },
});
```

**Step 3: Add PATCH support for updating environments**

Add a PATCH handler to update environment fields including `defaultRunMode` and `isDefault`. Add it after the POST handler in the same file:

```typescript
const UpdateEnvironmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(ENVIRONMENT_TYPES).optional(),
  url: z.string().url("Must be a valid URL").optional(),
  defaultRunMode: z.enum(RUN_MODES).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const parsed = UpdateEnvironmentSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
      return apiError(firstError, "VALIDATION_ERROR", 400);
    }

    // The envId comes from the request body for bulk updates on the collection
    const envId = body.id;
    if (!envId) {
      return apiError("Environment ID is required", "VALIDATION_ERROR", 400);
    }

    const env = await prisma.environment.findFirst({
      where: { id: envId, projectId },
    });

    if (!env) {
      return apiError("Environment not found", "NOT_FOUND", 404);
    }

    // If setting as default, unset other defaults
    if (parsed.data.isDefault) {
      await prisma.environment.updateMany({
        where: { projectId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.environment.update({
      where: { id: envId },
      data: parsed.data,
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
```

**Step 4: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 5: Commit**

```bash
git add "src/app/api/projects/[projectId]/environments/route.ts"
git commit -m "feat: support defaultRunMode in environment create/update API"
```

---

### Task 4: Convert Project DELETE to Archive

**Files:**
- Modify: `src/app/api/projects/[projectId]/route.ts:139-164`

**Step 1: Replace hard delete with soft archive**

Change the DELETE handler to set `status: 'archived'` and `deletedAt` instead of deleting:

```typescript
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspace();
    const { projectId } = await params;

    await requirePermission(workspaceId, "projects.update");

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });

    if (!project) {
      return apiError("Project not found", "NOT_FOUND", 404);
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "archived", deletedAt: new Date() },
    });

    return apiSuccess({ archived: true });
  } catch (error) {
    return handleApiError(error);
  }
}
```

**Step 2: Add `status` support to PATCH handler**

In the same file, update the PATCH handler (line ~88) to support `status` for restore:

```typescript
interface UpdateProjectBody {
  name?: string;
  defaultBranch?: string;
  onboardingCompleted?: boolean;
  settings?: Record<string, unknown>;
  status?: "active" | "archived";
}
```

And in the body parsing:

```typescript
if (body.status !== undefined) {
  data.status = body.status;
  if (body.status === "active") {
    data.deletedAt = null;
  }
}
```

**Step 3: Commit**

```bash
git add "src/app/api/projects/[projectId]/route.ts"
git commit -m "feat: convert project DELETE to soft archive, add restore via PATCH"
```

---

### Task 5: Filter Archived Projects from List API

**Files:**
- Modify: `src/app/api/projects/route.ts:14-26`

**Step 1: Add status filter to project list**

Update the GET handler to default-filter to active projects and support `?status=` query param:

```typescript
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "active";

    const where: Record<string, unknown> = { workspaceId };
    if (status !== "all") {
      where.status = status;
    }

    const projectList = await prisma.project.findMany({
      where,
    });

    return apiSuccess(projectList);
  } catch (error) {
    return handleApiError(error);
  }
}
```

Note: The GET handler currently doesn't take a `request` param — add `request: NextRequest` as the first parameter.

**Step 2: Commit**

```bash
git add src/app/api/projects/route.ts
git commit -m "feat: filter archived projects from list, support ?status= param"
```

---

### Task 6: Scope Onboarding Wizard to Explicit Project ID

**Files:**
- Modify: `src/app/(dashboard)/dashboard/onboarding/page.tsx`
- Modify: `src/components/onboarding/onboarding-wizard.tsx:41-117`

**Step 1: Pass projectId from page to wizard**

Update the onboarding page to be a client component that reads search params:

```typescript
"use client";

import { useSearchParams } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project");

  return (
    <div className="h-full">
      <OnboardingWizard initialProjectId={projectId} />
    </div>
  );
}
```

**Step 2: Update OnboardingWizard to accept initialProjectId prop**

Change the component signature and `detectOnboardingProgress`:

```typescript
interface OnboardingWizardProps {
  initialProjectId?: string | null;
}

export function OnboardingWizard({ initialProjectId }: OnboardingWizardProps) {
```

**Step 3: Rewrite detectOnboardingProgress to be project-scoped**

Replace the function (lines 41-98) with:

```typescript
async function detectOnboardingProgress(
  targetProjectId: string | null
): Promise<{
  step: number;
  projectId: string | null;
  repo: RepoItem | null;
  enabledTestCount: number;
}> {
  const empty = { step: 1, projectId: null, repo: null, enabledTestCount: 0 };

  // No project specified — start fresh
  if (!targetProjectId) return empty;

  try {
    // Fetch the specific project
    const res = await fetch(`/api/projects/${targetProjectId}`);
    if (!res.ok) return empty;

    const json = await res.json();
    if (!json.success) return empty;

    const project = json.data;
    const pid = project.id as string;
    const repo: RepoItem = {
      id: pid,
      name: project.repoName ?? project.name,
      fullName: `${project.repoOwner ?? ""}/${project.repoName ?? project.name}`,
      url: project.repoUrl ?? "",
      owner: project.repoOwner ?? "",
      defaultBranch: project.defaultBranch ?? "main",
      isPrivate: false,
      language: project.framework ?? "Unknown",
      stars: 0,
      updatedAt: project.updatedAt ?? new Date().toISOString(),
    };

    // Check if there's a test plan with enabled test cases
    const planRes = await fetch(`/api/projects/${pid}/plan`);
    if (planRes.ok) {
      const planJson = await planRes.json();
      const testCases = planJson.data?.testCases ?? [];
      if (testCases.length > 0) {
        const enabled = testCases.filter((t: { isEnabled: boolean }) => t.isEnabled).length;
        return { step: 5, projectId: pid, repo, enabledTestCount: enabled };
      }
    }

    // Indexed but no plan -> map preview
    if (project.lastIndexedAt) {
      return { step: 3, projectId: pid, repo, enabledTestCount: 0 };
    }

    // Project exists but not indexed -> indexing
    return { step: 2, projectId: pid, repo, enabledTestCount: 0 };
  } catch {
    return empty;
  }
}
```

**Step 4: Update the useEffect to use initialProjectId**

```typescript
useEffect(() => {
  detectOnboardingProgress(initialProjectId ?? null).then((result) => {
    if (result.projectId) {
      setProjectId(result.projectId);
      setSelectedRepo(result.repo);
      setEnabledTestCount(result.enabledTestCount);
    }
    setStep(result.step);
  });
}, [initialProjectId]);
```

**Step 5: Update handleRepoSelect to push projectId to URL**

After creating a project, update the browser URL so refresh works:

```typescript
const handleRepoSelect = useCallback(
  (repo: RepoItem, newProjectId: string) => {
    setSelectedRepo(repo);
    setProjectId(newProjectId);
    // Update URL so refresh resumes correctly
    const url = new URL(window.location.href);
    url.searchParams.set("project", newProjectId);
    window.history.replaceState({}, "", url.toString());
    goTo(2);
  },
  [goTo]
);
```

**Step 6: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 7: Commit**

```bash
git add "src/app/(dashboard)/dashboard/onboarding/page.tsx" src/components/onboarding/onboarding-wizard.tsx
git commit -m "feat: scope onboarding wizard to explicit projectId via URL param"
```

---

### Task 7: Update Header to Show Onboarding Status and Filter Archived

**Files:**
- Modify: `src/components/layout/header.tsx:21-27, 60-127`
- Modify: `src/components/layout/dashboard-header.tsx:6-16`

**Step 1: Add onboardingCompleted and status to HeaderProject interface**

In `header.tsx`:

```typescript
interface HeaderProject {
  id: string;
  name: string;
  slug: string;
  framework: string | null;
  healthStatus: string;
  onboardingCompleted: boolean;
  status: string;
}
```

Same change in `dashboard-header.tsx`.

**Step 2: Update header dropdown to show onboarding status**

Replace the project list mapping (lines 96-118) to handle incomplete projects and hide archived:

```typescript
{projects
  .filter((p) => p.status === "active")
  .map((project) => (
    <DropdownMenuItem
      key={project.id}
      onClick={() => {
        if (!project.onboardingCompleted) {
          router.push(`/dashboard/onboarding?project=${project.id}`);
        } else {
          handleSelectProject(project.id);
        }
      }}
      className={cn(
        "gap-2 cursor-pointer",
        project.id === activeProjectId && "bg-accent"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0",
          !project.onboardingCompleted
            ? "bg-orbit-accent animate-pulse"
            : healthDot[project.healthStatus] ?? "bg-muted-foreground"
        )}
      />
      <span className="truncate flex-1">{project.name}</span>
      {!project.onboardingCompleted ? (
        <span className="text-[10px] text-orbit-accent">Setting up...</span>
      ) : project.framework ? (
        <span className="text-xs text-muted-foreground">
          {project.framework}
        </span>
      ) : null}
    </DropdownMenuItem>
  ))}
```

**Step 3: Update dashboard-header to pass new fields**

Ensure the server component that feeds `DashboardHeader` includes `onboardingCompleted` and `status` in its query. Check the dashboard layout that fetches projects — it should already include all fields from `prisma.project.findMany`. If it only selects specific fields, add `onboardingCompleted` and `status`.

**Step 4: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/components/layout/header.tsx src/components/layout/dashboard-header.tsx
git commit -m "feat: show onboarding status in header, filter archived projects"
```

---

### Task 8: Replace Delete with Archive in Project Settings

**Files:**
- Modify: `src/components/settings/project-settings.tsx:47-64, 124-132`

**Step 1: Replace handleDelete with handleArchive**

Replace the delete function and UI section:

```typescript
const [archiving, setArchiving] = useState(false);

async function handleArchive() {
  setArchiving(true);
  setError(null);
  try {
    const res = await fetch(`/api/projects/${project?.id}`, { method: "DELETE" });
    if (res.ok) {
      window.location.href = "/dashboard";
    } else {
      const json = await res.json().catch(() => null);
      setError(json?.error?.message ?? "Failed to archive project");
    }
  } catch {
    setError("Network error — could not archive");
  } finally {
    setArchiving(false);
  }
}
```

**Step 2: Replace the Danger Zone UI**

Replace the red danger zone (lines 124-132) with an amber archive zone:

```tsx
<div className="rounded-xl bg-orbit-flaky/[0.04] p-6 space-y-4">
  <h3 className="text-sm font-medium text-orbit-flaky">Archive Project</h3>
  <p className="text-xs text-muted-foreground">
    Archiving hides this project from your dashboard. All data is preserved and you can restore it anytime from settings.
  </p>
  <Button
    variant="outline"
    size="sm"
    onClick={handleArchive}
    disabled={archiving}
    className="border-orbit-flaky/30 text-orbit-flaky hover:bg-orbit-flaky/10"
  >
    {archiving ? "Archiving..." : "Archive Project"}
  </Button>
</div>
```

**Step 3: Remove `deleting` state, add `archiving`**

Remove the `deleting` useState and the old `handleDelete` function. Remove the unused `confirm()` call.

**Step 4: Commit**

```bash
git add src/components/settings/project-settings.tsx
git commit -m "feat: replace project delete with archive in settings UI"
```

---

### Task 9: Add Archived Projects Section to Settings

**Files:**
- Modify: `src/components/settings/project-settings.tsx` (add archived list below archive button)

**Step 1: Fetch archived projects on mount**

Add state and fetch for archived projects:

```typescript
const [archivedProjects, setArchivedProjects] = useState<Array<{ id: string; name: string; slug: string }>>([]);
const [restoring, setRestoring] = useState<string | null>(null);

useEffect(() => {
  fetch("/api/projects?status=archived")
    .then((r) => r.json())
    .then((json) => {
      if (json.success) setArchivedProjects(json.data);
    })
    .catch(() => {});
}, []);
```

**Step 2: Add restore handler**

```typescript
async function handleRestore(id: string) {
  setRestoring(id);
  try {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    if (res.ok) {
      setArchivedProjects((prev) => prev.filter((p) => p.id !== id));
    }
  } finally {
    setRestoring(null);
  }
}
```

**Step 3: Render archived projects list**

Add after the archive zone:

```tsx
{archivedProjects.length > 0 && (
  <div className="rounded-xl surface-1 p-6 space-y-4">
    <h3 className="text-sm font-medium text-foreground">Archived Projects</h3>
    <div className="space-y-2">
      {archivedProjects.map((ap) => (
        <div key={ap.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02]">
          <div>
            <span className="text-sm text-foreground">{ap.name}</span>
            <span className="text-xs text-muted-foreground ml-2 font-mono">{ap.slug}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRestore(ap.id)}
            disabled={restoring === ap.id}
            className="text-xs"
          >
            {restoring === ap.id ? "Restoring..." : "Restore"}
          </Button>
        </div>
      ))}
    </div>
  </div>
)}
```

**Step 4: Commit**

```bash
git add src/components/settings/project-settings.tsx
git commit -m "feat: add archived projects list with restore action in settings"
```

---

### Task 10: Enhance Environment Settings UI with Run Mode Selector

**Files:**
- Modify: `src/components/settings/environment-settings.tsx`

**Step 1: Add defaultRunMode to Environment interface**

```typescript
interface Environment {
  id: string;
  name: string;
  type: string;
  url: string;
  isDefault: boolean;
  defaultRunMode: string;
}
```

**Step 2: Add defaultRunMode to the add form**

Add a run mode selector to the `newEnv` state and form:

```typescript
const [newEnv, setNewEnv] = useState({ name: "", type: "staging", url: "", defaultRunMode: "full" });
```

Add a 4th column to the add form grid (`grid-cols-4`):

```tsx
<div className="space-y-1.5">
  <Label className="text-xs text-muted-foreground">Default Run Mode</Label>
  <select
    value={newEnv.defaultRunMode}
    onChange={(e) => setNewEnv({ ...newEnv, defaultRunMode: e.target.value })}
    className="w-full h-9 rounded-md border border-transparent bg-muted/40 px-3 text-sm focus:border-orbit-accent/30 focus:outline-none"
  >
    <option value="full">Full Suite</option>
    <option value="smoke">Smoke (Critical Path)</option>
    <option value="regression">Regression</option>
  </select>
</div>
```

**Step 3: Add set-as-default and run mode change handlers**

```typescript
async function handleSetDefault(envId: string) {
  try {
    const res = await fetch(`/api/projects/${projectId}/environments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: envId, isDefault: true }),
    });
    if (res.ok) {
      setEnvironments((prev) =>
        prev.map((e) => ({ ...e, isDefault: e.id === envId }))
      );
    }
  } catch {}
}

async function handleRunModeChange(envId: string, mode: string) {
  try {
    const res = await fetch(`/api/projects/${projectId}/environments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: envId, defaultRunMode: mode }),
    });
    if (res.ok) {
      setEnvironments((prev) =>
        prev.map((e) => (e.id === envId ? { ...e, defaultRunMode: mode } : e))
      );
    }
  } catch {}
}
```

**Step 4: Enhance environment card layout**

Replace the existing environment card rendering with richer cards:

```tsx
environments.map((env) => (
  <div
    key={env.id}
    className="rounded-xl surface-1 p-4 space-y-3"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{env.name}</span>
        <Badge variant="outline" className={cn("text-[10px]", typeColors[env.type])}>
          {env.type}
        </Badge>
        {env.isDefault && (
          <Badge variant="outline" className="text-[10px] text-orbit-accent">
            default
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!env.isDefault && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => handleSetDefault(env.id)}
          >
            Set as default
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-red-400"
          onClick={() => handleDelete(env.id)}
          disabled={deletingId === env.id}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>

    <div className="flex items-center gap-4 text-xs">
      <span className="text-muted-foreground font-mono truncate flex-1">{env.url}</span>
      <select
        value={env.defaultRunMode}
        onChange={(e) => handleRunModeChange(env.id, e.target.value)}
        className="h-7 rounded-md border border-transparent bg-white/[0.04] px-2 text-xs text-muted-foreground focus:border-orbit-accent/30 focus:outline-none"
      >
        <option value="full">Full Suite</option>
        <option value="smoke">Smoke</option>
        <option value="regression">Regression</option>
      </select>
    </div>
  </div>
))
```

**Step 5: Verify build**

Run: `pnpm build`
Expected: No errors.

**Step 6: Commit**

```bash
git add src/components/settings/environment-settings.tsx
git commit -m "feat: enhanced environment cards with run mode selector and set-as-default"
```

---

### Task 11: Final Verification

**Step 1: Run full build**

Run: `pnpm build`
Expected: Clean build, no errors.

**Step 2: Run tests**

Run: `pnpm test`
Expected: All existing tests pass (no regressions).

**Step 3: Final commit if any fixes needed**

Only if build/tests required small fixes.
