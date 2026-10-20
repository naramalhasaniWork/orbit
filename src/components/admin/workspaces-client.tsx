"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import { cn } from "@/lib/utils";
import { TIER_DISPLAY_NAMES, type WorkspaceTier } from "@/lib/auth/tier-limits";

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  tier: WorkspaceTier;
  creditBalance: number;
  memberCount: number;
  projectCount: number;
  runCount: number;
  owner: { name: string | null; email: string } | null;
  status: string;
  createdAt: string;
}

interface WorkspacesClientProps {
  workspaces: WorkspaceRow[];
  total: number;
}

const tierColors: Record<WorkspaceTier, string> = {
  free: "bg-gray-500/15 text-gray-400 border-gray-500/20",
  starter: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  professional: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  enterprise: "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

export function WorkspacesClient({ workspaces, total }: WorkspacesClientProps) {
  const router = useRouter();

  const columns = [
    {
      key: "name",
      header: "Workspace",
      sortable: true,
      render: (row: WorkspaceRow) => (
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">{row.slug}</p>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      render: (row: WorkspaceRow) => (
        <span className="text-muted-foreground text-xs">
          {row.owner?.name ?? row.owner?.email ?? "No owner"}
        </span>
      ),
    },
    {
      key: "tier",
      header: "Plan",
      render: (row: WorkspaceRow) => (
        <Badge
          className={cn(
            "text-[10px] font-medium border",
            tierColors[row.tier]
          )}
        >
          {TIER_DISPLAY_NAMES[row.tier]}
        </Badge>
      ),
    },
    {
      key: "members",
      header: "Members",
      sortable: true,
      className: "text-center",
      render: (row: WorkspaceRow) => (
        <span className="text-muted-foreground">{row.memberCount}</span>
      ),
    },
    {
      key: "projects",
      header: "Projects",
      sortable: true,
      className: "text-center",
      render: (row: WorkspaceRow) => (
        <span className="text-muted-foreground">{row.projectCount}</span>
      ),
    },
    {
      key: "runs",
      header: "Runs",
      className: "text-center",
      render: (row: WorkspaceRow) => (
        <span className="text-muted-foreground">{row.runCount}</span>
      ),
    },
    {
      key: "credits",
      header: "Credits",
      className: "text-right",
      render: (row: WorkspaceRow) => (
        <span className="text-muted-foreground">
          {row.creditBalance.toLocaleString()}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      render: (row: WorkspaceRow) => (
        <span className="text-muted-foreground text-xs">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: WorkspaceRow) => (
        <Badge
          className={cn(
            "text-[10px] font-medium border",
            row.status === "active"
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
              : "bg-red-500/15 text-red-400 border-red-500/20"
          )}
        >
          {row.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Workspaces</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All workspaces on the platform
        </p>
      </div>

      <DataTable
        columns={columns}
        data={workspaces}
        total={total}
        page={1}
        limit={20}
        searchPlaceholder="Search workspaces..."
        onRowClick={(row) => router.push(`/admin/workspaces/${row.id}`)}
      />
    </div>
  );
}
