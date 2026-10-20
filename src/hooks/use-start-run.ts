"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

export interface RunError {
  message: string;
  cta?: { label: string; href: string };
}

/** Map a run-trigger API error code to an actionable CTA link for this project. */
function ctaForRunError(code: string | undefined, projectId: string): RunError["cta"] {
  switch (code) {
    case "NO_ENVIRONMENT":
      return {
        label: "Configure environment",
        href: `/dashboard/settings?project=${projectId}&tab=environments`,
      };
    case "NO_TEST_PLAN":
      return { label: "View test plans", href: `/dashboard/plans?project=${projectId}` };
    case "LIMIT_REACHED":
      return { label: "View billing", href: "/dashboard/settings/billing" };
    default:
      return undefined;
  }
}

/** Starts a manual run for a project and routes to it; surfaces API errors with a CTA. */
export function useStartRun(projectId: string | null | undefined) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState<RunError | null>(null);

  const startRun = useCallback(async () => {
    if (!projectId || starting) return;
    setRunError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const id = (json as { data?: { id?: string } }).data?.id;
        router.push(id ? `/dashboard/runs/${id}` : `/dashboard/runs?project=${projectId}`);
        return;
      }
      const err = (json as { error?: { message?: string; code?: string } }).error;
      setRunError({
        message: err?.message ?? `Failed to start run (${res.status})`,
        cta: ctaForRunError(err?.code, projectId),
      });
    } catch {
      setRunError({ message: "Failed to start run. Check your connection and try again." });
    } finally {
      setStarting(false);
    }
  }, [projectId, starting, router]);

  return { starting, runError, setRunError, startRun };
}
