import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/layout/sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let projects: {
    id: string;
    name: string;
    slug: string;
    framework: string | null;
    healthStatus: string;
  }[] = [];

  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;

  if (workspaceId) {
    projects = await prisma.project.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        framework: true,
        healthStatus: true,
      },
    });
  }

  return (
    <div className="flex h-screen surface-0 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <DashboardHeader projects={projects} />
        <main className="flex-1 overflow-auto p-6 animate-fade-in border-t border-white/[0.04]">
          {children}
        </main>
      </div>
    </div>
  );
}
