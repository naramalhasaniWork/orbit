"use client";

import { useState, useCallback } from "react";
import { Users, UserPlus } from "lucide-react";
import { MemberList } from "./member-list";
import { InviteForm } from "./invite-form";

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

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  expiresAt: string;
  invitedBy: { name: string | null };
}

interface TeamManagementProps {
  workspaceId: string;
  currentUserId: string;
  currentUserRole: string;
  initialMembers: Member[];
  initialInvitations: Invitation[];
}

export function TeamManagement({
  workspaceId,
  currentUserId,
  currentUserRole,
  initialMembers,
  initialInvitations,
}: TeamManagementProps) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);

  const canInvite = currentUserRole === "owner" || currentUserRole === "admin";

  const refreshMembers = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/members`);
    const json = await res.json();
    if (json.success) setMembers(json.data);
  }, [workspaceId]);

  const refreshInvitations = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/invitations`);
    const json = await res.json();
    if (json.success) setInvitations(json.data);
  }, [workspaceId]);

  async function handleRoleChange(memberId: string, role: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, role }),
    });

    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error?.message ?? "Failed to update role");
    }

    await refreshMembers();
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;

    const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });

    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error?.message ?? "Failed to remove member");
    }

    await refreshMembers();
  }

  async function handleTransfer(userId: string) {
    const confirmed = confirm(
      "Are you sure you want to transfer ownership? You will be demoted to Admin."
    );
    if (!confirmed) return;

    const res = await fetch(`/api/workspaces/${workspaceId}/members/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: userId }),
    });

    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error?.message ?? "Failed to transfer ownership");
    }

    await refreshMembers();
    // Reload to refresh session
    window.location.reload();
  }

  async function handleInvite(email: string, role: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error?.message ?? "Failed to send invitation");
    }

    await refreshInvitations();
    return { token: json.data?.token, emailSent: Boolean(json.data?.emailSent) };
  }

  async function handleResend(invitationId: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/invitations/${invitationId}/resend`,
      { method: "POST" }
    );

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error?.message ?? "Failed to resend invitation");
    }

    await refreshInvitations();
    return { token: json.data?.token, emailSent: Boolean(json.data?.emailSent) };
  }

  async function handleRevoke(invitationId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/invitations`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId }),
    });

    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error?.message ?? "Failed to revoke invitation");
    }

    await refreshInvitations();
  }

  return (
    <div className="space-y-8">
      {/* Members section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">
            Team Members ({members.length})
          </h3>
        </div>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <MemberList
            members={members}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            onRoleChange={handleRoleChange}
            onRemove={handleRemove}
            onTransfer={handleTransfer}
          />
        </div>
      </section>

      {/* Invitations section */}
      {canInvite && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">
              Invite Members
            </h3>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <InviteForm
              workspaceId={workspaceId}
              invitations={invitations}
              onInvite={handleInvite}
              onResend={handleResend}
              onRevoke={handleRevoke}
            />
          </div>
        </section>
      )}
    </div>
  );
}
