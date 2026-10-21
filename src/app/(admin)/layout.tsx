import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminSignOut } from "@/components/admin/admin-sign-out";
import { countOpenBugReports } from "@/server/data/bug-report-repo";

// Private: never indexed, whatever robots.txt says.
export const metadata: Metadata = { robots: { index: false, follow: false } };


export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");

  const userRole = (session as { userRole?: string } | null)?.userRole;
  if (userRole !== "super_admin") redirect("/dashboard");

  const openReports = await countOpenBugReports();

  return (
    <div className="flex h-dvh surface-0 overflow-hidden">
      <AdminSidebar counts={{ "/admin/reports": openReports }} />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex h-[52px] items-center justify-between border-b border-border bg-card px-6">
          <div className="flex items-center gap-2">
            <span className="tm-label rounded-sm border border-tm-line-strong px-1.5 text-tm-t2">Super admin</span>
            <span className="text-sm text-muted-foreground">
              Platform Management
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {(session as { user?: { email?: string } }).user?.email}
            </span>
            <AdminSignOut />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6 animate-fade-in border-t border-border">
          {children}
        </main>
      </div>
    </div>
  );
}
