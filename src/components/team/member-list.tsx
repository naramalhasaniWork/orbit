"use client";

import { useState } from "react";
import Image from "next/image";
import { MoreHorizontal, Shield, Crown, Eye, CreditCard, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

interface MemberListProps {
  members: Member[];
  currentUserId: string;
  currentUserRole: string;
  onRoleChange: (memberId: string, role: string) => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
  onTransfer: (userId: string) => Promise<void>;
}

const ROLE_CONFIG = {
  owner: { label: "Owner", icon: Crown, color: "text-amber-400" },
  admin: { label: "Admin", icon: Shield, color: "text-orbit-accent" },
  member: { label: "Member", icon: Shield, color: "text-muted-foreground" },
  viewer: { label: "Viewer", icon: Eye, color: "text-muted-foreground" },
  billing: { label: "Billing", icon: CreditCard, color: "text-muted-foreground" },
} as const;

const ASSIGNABLE_ROLES = ["admin", "member", "viewer", "billing"] as const;

function canManage(actorRole: string, targetRole: string): boolean {
  const hierarchy = ["viewer", "billing", "member", "admin", "owner"];
  return hierarchy.indexOf(actorRole) > hierarchy.indexOf(targetRole);
}

export function MemberList({
  members,
  currentUserId,
  currentUserRole,
  onRoleChange,
  onRemove,
  onTransfer,
}: MemberListProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleRoleChange(memberId: string, role: string) {
    setLoadingId(memberId);
    try {
      await onRoleChange(memberId, role);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleRemove(memberId: string) {
    setLoadingId(memberId);
    try {
      await onRemove(memberId);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-1">
      {members.map((member) => {
        const config = ROLE_CONFIG[member.role as keyof typeof ROLE_CONFIG] ?? ROLE_CONFIG.member;
        const RoleIcon = config.icon;
        const isCurrentUser = member.userId === currentUserId;
        const canEdit = !isCurrentUser && canManage(currentUserRole, member.role);
        const isOwner = currentUserRole === "owner";

        return (
          <div
            key={member.id}
            className={cn(
              "flex items-center justify-between px-4 py-3 rounded-lg",
              "hover:bg-muted/30 transition-colors",
              loadingId === member.id && "opacity-50 pointer-events-none"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              {member.user.image ? (
                <Image
                  src={member.user.image}
                  alt=""
                  width={32}
                  height={32}
                  className="rounded-full ring-1 ring-border"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                  <span className="text-xs font-medium text-muted-foreground">
                    {member.user.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </span>
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {member.user.name ?? "Unnamed"}
                  </span>
                  {isCurrentUser && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      You
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground truncate block">
                  {member.user.email}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className={cn("flex items-center gap-1.5", config.color)}>
                <RoleIcon className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">{config.label}</span>
              </div>

              {(canEdit || (isOwner && !isCurrentUser)) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Change Role
                    </DropdownMenuLabel>
                    {ASSIGNABLE_ROLES.map((role) => (
                      <DropdownMenuItem
                        key={role}
                        disabled={role === member.role}
                        onClick={() => handleRoleChange(member.id, role)}
                        className="cursor-pointer"
                      >
                        {ROLE_CONFIG[role].label}
                      </DropdownMenuItem>
                    ))}

                    {isOwner && member.role !== "owner" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onTransfer(member.userId)}
                          className="cursor-pointer text-amber-400"
                        >
                          <Crown className="h-3.5 w-3.5 mr-2" />
                          Transfer Ownership
                        </DropdownMenuItem>
                      </>
                    )}

                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleRemove(member.id)}
                      className="cursor-pointer text-red-400"
                    >
                      <UserMinus className="h-3.5 w-3.5 mr-2" />
                      Remove Member
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
