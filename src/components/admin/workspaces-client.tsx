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
  free: "bg-tm-t3/15 text-tm-t3 border-tm-t3/20",
  starter: "bg-tm-info/15 text-tm-info border-tm-info/20",
  professional: "bg-tm-t2/15 text-tm-t2 border-tm-t2/20",
  enterprise: "bg-tm-warn/15 text-tm-warn border-tm-warn/20",
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
              ? "bg-tm-pass/15 text-tm-pass border-tm-pass/20"
              : "bg-tm-fail/15 text-tm-fail border-tm-fail/20"
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
        <h1 className="text-xl font-medium">Workspaces</h1>
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
