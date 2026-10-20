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
import { MaintenanceScreen, SystemBanner } from "@/components/layout/system-notices";
import { getSystemConfig } from "@/lib/system-config";

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
      <div className="flex h-screen surface-0 overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Suspense>
            <DashboardHeader projects={projects} />
          </Suspense>
          <SystemBanner
            announcement={systemConfig.announcement}
            maintenanceActiveForAdmin={systemConfig.maintenanceMode}
          />
          <GlobalActivityBar initialOperations={initialOperations} />
          <main className="flex-1 overflow-auto px-6 py-5 lg:px-8 xl:px-10 border-t border-white/[0.04]">
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
    </SWRProvider>
  );
}
