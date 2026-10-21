import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/layout/sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { RouteTransition } from "@/components/layout/route-transition";
import { ChatPanelWrapper } from "@/components/chat/chat-panel-wrapper";
import { GlobalActivityBar } from "@/components/dashboard/global-activity-bar";
import { getActiveOperations } from "@/lib/dashboard/active-operations";
import { SWRProvider } from "@/components/layout/swr-provider";
import { MaintenanceScreen, SystemBanner } from "@/components/layout/system-notices";
import { getSystemConfig } from "@/lib/system-config";
import { SIDEBAR_COOKIE, parseSidebarExpanded } from "@/lib/sidebar-pref";
import { WorkspaceRecovery } from "@/components/layout/workspace-recovery";
import { DashboardProviders } from "@/components/layout/dashboard-providers";
import { TourHost } from "@/components/onboarding/tour/tour-host";

// Private: never indexed, whatever robots.txt says.
export const metadata: Metadata = { robots: { index: false, follow: false } };


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

  const [session, systemConfig] = await Promise.all([
    getServerSession(authOptions),
    getSystemConfig(),
  ]);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const isSuperAdmin = (session as { userRole?: string } | null)?.userRole === "super_admin";

  // Next middleware runs on the Edge runtime without Prisma, so maintenance
  // mode is enforced here, at the root of every dashboard route.
  if (systemConfig.maintenanceMode && !isSuperAdmin) {
    return <MaintenanceScreen message={systemConfig.maintenanceMessage} />;
  }

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

  const sidebarExpanded = parseSidebarExpanded(cookies().get(SIDEBAR_COOKIE)?.value);

  // Frame: canvas with an 8px gutter; the workspace is one 10px-radius surface with a hairline.
  return (
    <SWRProvider fallback={{ "/api/projects": projects }}>
      <DashboardProviders>
        <div className="flex h-dvh overflow-hidden bg-background md:gap-2 md:p-2 md:pl-0">
          <Suspense>
            <Sidebar initialExpanded={sidebarExpanded} />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card md:rounded-xl md:border md:border-border">
            <Suspense>
              <DashboardHeader projects={projects} />
            </Suspense>
            <GlobalActivityBar initialOperations={initialOperations} />
            <main className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-5 lg:px-8">
              <div className="mx-auto max-w-[1440px]">
                <Suspense>
                  <RouteTransition>
                    {children}
                  </RouteTransition>
                </Suspense>
              </div>
            </main>
          </div>
          <Suspense>
            <ChatPanelWrapper projects={projects} />
          </Suspense>
          <Suspense>
            <TourHost />
          </Suspense>
        </div>
      </DashboardProviders>
    </SWRProvider>
  );
}
