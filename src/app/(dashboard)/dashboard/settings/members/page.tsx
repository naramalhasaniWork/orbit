import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TeamManagement } from "@/components/team/team-management";

export default async function MembersSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ext = session as {
    user: { id: string };
    workspaceId?: string;
    role?: string;
  };

  if (!ext.workspaceId) redirect("/login");

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: ext.workspaceId, workspace: { deletedAt: null } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const invitations = await prisma.workspaceInvitation.findMany({
    where: { workspaceId: ext.workspaceId },
    include: {
      invitedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const serializedMembers = members.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
    user: {
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
    },
  }));

  const serializedInvitations = invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    token: inv.token,
    expiresAt: inv.expiresAt.toISOString(),
    invitedBy: { name: inv.invitedBy.name },
  }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-medium text-foreground">Team Members</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage who has access to this workspace and their permissions.
        </p>
      </div>

      <TeamManagement
        workspaceId={ext.workspaceId}
        currentUserId={ext.user.id}
        currentUserRole={ext.role ?? "member"}
        initialMembers={serializedMembers}
        initialInvitations={serializedInvitations}
      />
    </div>
  );
}
