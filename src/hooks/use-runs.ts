"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import type { RunListItem } from "@/components/runs/run-types";

export function useRuns(projectId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<RunListItem[]>(
    projectId ? `/api/projects/${projectId}/runs` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 }
  );
  return { runs: data ?? [], error, isLoading, mutate };
}
