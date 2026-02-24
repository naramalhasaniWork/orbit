"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/swr";

interface Project {
  id: string;
  name: string;
  slug: string;
  framework: string | null;
  healthStatus: string;
  onboardingCompleted: boolean;
  status: string;
}

export function useProjects() {
  const { data, error, isLoading, mutate } = useSWR<Project[]>(
    "/api/projects",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10000 }
  );
  return { projects: data ?? [], error, isLoading, mutate };
}
