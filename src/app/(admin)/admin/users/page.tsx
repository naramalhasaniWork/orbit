import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UsersClient } from "@/components/admin/users-client";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      memberships: {
        include: {
          workspace: { select: { id: true, name: true, slug: true } },
        },
      },
      _count: { select: { testRuns: true } },
    },
  });

  const data = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    lastActive: u.updatedAt.toISOString(),
    workspaces: u.memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
    })),
    runsTriggered: u._count.testRuns,
  }));

  return (
    <UsersClient users={data} total={await prisma.user.count()} />
  );
}
