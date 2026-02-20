"use client";

import { useSearchParams } from "next/navigation";
import { Header } from "./header";

interface HeaderProject {
  id: string;
  name: string;
  slug: string;
  framework: string | null;
  healthStatus: string;
}

interface DashboardHeaderProps {
  projects: HeaderProject[];
}

export function DashboardHeader({ projects }: DashboardHeaderProps) {
  const searchParams = useSearchParams();
  const selectedProjectId = searchParams.get("project");

  const activeProjectId = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)?.id ?? projects[0]?.id ?? null
    : projects[0]?.id ?? null;

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <Header
      projects={projects}
      activeProjectId={activeProjectId}
      healthStatus={
        (activeProject?.healthStatus as "healthy" | "degraded" | "failing") ?? "healthy"
      }
    />
  );
}
