import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/layout/sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { ContentTransition } from "@/components/layout/content-transition";
import { ChatPanelWrapper } from "@/components/chat/chat-panel-wrapper";
import { GlobalActivityBar } from "@/components/dashboard/global-activity-bar";
import { getActiveOperations } from "@/lib/dashboard/active-operations";
import { SWRProvider } from "@/components/layout/swr-provider";
import { DashboardProviders } from "@/components/layout/dashboard-providers";
import { isSelfHosted } from "@/lib/self-host";
import { WorkspaceRecovery } from "@/components/layout/workspace-recovery";

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
    onboardingCompleted: boolean;
    status: string;
    hasEnvironment: boolean;
    hasActivePlan: boolean;
  }[] = [];

  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;

  // The session may point at a workspace that was deleted or that the user left
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (workspaceId && userId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId, workspace: { deletedAt: null } },
      select: { id: true },
    });
    if (!membership) return <WorkspaceRecovery />;
  }

  let initialOperations: Awaited<ReturnType<typeof getActiveOperations>> = [];

  if (workspaceId) {
    const [projectsRaw, ops] = await Promise.all([
      prisma.project.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          framework: true,
          healthStatus: true,
          onboardingCompleted: true,
          status: true,
          // Readiness signals for the "Run" button (non-production env + active plan)
          environments: {
            where: { type: { not: "production" } },
            take: 1,
            select: { id: true },
          },
          testPlans: {
            where: { isActive: true },
            take: 1,
            select: { id: true },
          },
        },
      }),
      getActiveOperations(workspaceId),
    ]);
    initialOperations = ops;
    projects = projectsRaw.map(({ environments, testPlans, ...p }) => ({
      ...p,
      hasEnvironment: environments.length > 0,
      hasActivePlan: testPlans.length > 0,
    }));
  }

  return (
    <SWRProvider fallback={{ "/api/projects": projects }}>
      <DashboardProviders>
        <div className="flex h-screen surface-0 overflow-hidden">
          <Sidebar hideBilling={isSelfHosted()} />
          <div className="flex flex-col flex-1 min-w-0">
            <Suspense>
              <DashboardHeader projects={projects} />
            </Suspense>
            <GlobalActivityBar initialOperations={initialOperations} />
            <main className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-5 lg:px-8 xl:px-10 border-t border-white/[0.04]">
              <div className="max-w-[1440px] mx-auto">
                <Suspense>
                  <ContentTransition>
                    {children}
                  </ContentTransition>
                </Suspense>
              </div>
            </main>
          </div>
          <Suspense>
            <ChatPanelWrapper projects={projects} />
          </Suspense>
        </div>
      </DashboardProviders>
    </SWRProvider>
  );
}
