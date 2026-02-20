"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/shared/status-dot";
import { EmptyState } from "@/components/shared/empty-state";
import {
  FolderGit2,
  Plus,
  GitBranch,
  Layers,
  TestTube2,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  framework: string | null;
  healthStatus: string;
  lastIndexedAt: string | null;
  lastRunAt: string | null;
  onboardingCompleted: boolean;
  nodeCount: number;
  edgeCount: number;
  testCaseCount: number;
  testRunCount: number;
}

interface ProjectsListClientProps {
  projects: ProjectSummary[];
}

const healthDot: Record<string, "pass" | "fail" | "flaky" | "untested"> = {
  healthy: "pass",
  degraded: "flaky",
  failing: "fail",
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

export function ProjectsListClient({ projects }: ProjectsListClientProps) {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderGit2}
        title="No projects yet"
        description="Connect your first repository to get started with AI-powered testing."
        action={
          <Link href="/dashboard/onboarding">
            <Button className="bg-orbit-accent hover:bg-orbit-accent/90 text-white gap-2">
              <Plus className="h-4 w-4" />
              Add Project
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6 max-w-4xl"
    >
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Projects</h1>
        <Link href="/dashboard/onboarding">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs gap-1.5 border-white/[0.08] hover:bg-white/[0.04]"
          >
            <Plus className="h-3 w-3" />
            Add Project
          </Button>
        </Link>
      </motion.div>

      <motion.div variants={fadeUp} className="space-y-2">
        {projects.map((project) => (
          <ProjectRow key={project.id} project={project} />
        ))}
      </motion.div>
    </motion.div>
  );
}

function ProjectRow({ project }: { project: ProjectSummary }) {
  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="flex items-center gap-4 p-4 rounded-xl surface-1 border border-white/[0.04] hover:border-white/[0.08] transition-all duration-200"
    >
      <StatusDot status={healthDot[project.healthStatus] ?? "untested"} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {project.name}
          </span>
          {project.framework && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
              {project.framework}
            </Badge>
          )}
          {!project.onboardingCompleted && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0 text-orbit-flaky border-orbit-flaky/30">
              Setup incomplete
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <GitBranch className="h-3 w-3" />
          <span className="truncate">{project.repoOwner}/{project.repoName}</span>
          {project.lastIndexedAt && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <span>
                Indexed {formatDistanceToNow(new Date(project.lastIndexedAt), { addSuffix: true })}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums shrink-0">
        <div className="flex items-center gap-1">
          <Layers className="h-3 w-3" />
          {project.nodeCount}
        </div>
        <div className="flex items-center gap-1">
          <TestTube2 className="h-3 w-3" />
          {project.testCaseCount}
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40" />
      </div>
    </Link>
  );
}
