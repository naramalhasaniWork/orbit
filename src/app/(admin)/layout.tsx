import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminSignOut } from "@/components/admin/admin-sign-out";

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

  return (
    <div className="flex h-dvh surface-0 overflow-hidden">
      <AdminSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="h-14 flex items-center justify-between px-6 border-b border-border surface-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-tm-fail/15 text-tm-fail border border-tm-fail/20">
              SUPER ADMIN
            </span>
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
