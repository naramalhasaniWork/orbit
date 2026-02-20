"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Image from "next/image";
import { MoreHorizontal, ShieldCheck, User, Shield } from "lucide-react";

interface UserWorkspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
  lastActive: string;
  workspaces: UserWorkspace[];
  runsTriggered: number;
}

interface UsersClientProps {
  users: UserRow[];
  total: number;
}

const roleColors: Record<string, string> = {
  user: "bg-white/[0.06] text-muted-foreground border-white/[0.1]",
  admin: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  super_admin: "bg-red-500/15 text-red-400 border-red-500/20",
};

const roleIcons: Record<string, typeof User> = {
  user: User,
  admin: ShieldCheck,
  super_admin: Shield,
};

export function UsersClient({ users, total }: UsersClientProps) {
  const [userList, setUserList] = useState(users);

  async function handleRoleChange(userId: string, newRole: string) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: newRole }),
    });

    if (res.ok) {
      setUserList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    }
  }

  const columns = [
    {
      key: "name",
      header: "User",
      sortable: true,
      render: (row: UserRow) => (
        <div className="flex items-center gap-3">
          {row.image ? (
            <Image
              src={row.image}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-full"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-white/[0.06] flex items-center justify-center">
              <span className="text-[10px] font-semibold text-muted-foreground">
                {(row.name ?? row.email)[0]?.toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <p className="font-medium">{row.name ?? "Unnamed"}</p>
            <p className="text-xs text-muted-foreground">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      render: (row: UserRow) => {
        const RoleIcon = roleIcons[row.role] ?? User;
        return (
          <Badge
            className={cn(
              "text-[10px] font-medium border gap-1",
              roleColors[row.role] ?? roleColors.user
            )}
          >
            <RoleIcon className="h-3 w-3" />
            {row.role.replace("_", " ")}
          </Badge>
        );
      },
    },
    {
      key: "workspaces",
      header: "Workspaces",
      render: (row: UserRow) => (
        <div className="flex flex-wrap gap-1">
          {row.workspaces.slice(0, 2).map((ws) => (
            <span
              key={ws.id}
              className="text-xs px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground"
            >
              {ws.name}
            </span>
          ))}
          {row.workspaces.length > 2 && (
            <span className="text-xs text-muted-foreground">
              +{row.workspaces.length - 2}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "runs",
      header: "Runs",
      className: "text-center",
      render: (row: UserRow) => (
        <span className="text-muted-foreground">{row.runsTriggered}</span>
      ),
    },
    {
      key: "created_at",
      header: "Joined",
      sortable: true,
      render: (row: UserRow) => (
        <span className="text-muted-foreground text-xs">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "last_active",
      header: "Last Active",
      render: (row: UserRow) => (
        <span className="text-muted-foreground text-xs">
          {new Date(row.lastActive).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-10",
      render: (row: UserRow) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => handleRoleChange(row.id, "user")}
              disabled={row.role === "user"}
            >
              Set as User
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleRoleChange(row.id, "admin")}
              disabled={row.role === "admin"}
            >
              Set as Admin
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleRoleChange(row.id, "super_admin")}
              disabled={row.role === "super_admin"}
            >
              Set as Super Admin
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All users on the platform
        </p>
      </div>

      <DataTable
        columns={columns}
        data={userList}
        total={total}
        page={1}
        limit={20}
        searchPlaceholder="Search users..."
      />
    </div>
  );
}
