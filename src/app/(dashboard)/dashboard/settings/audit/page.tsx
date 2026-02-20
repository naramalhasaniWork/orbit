"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { AuditLogViewer } from "@/components/audit/audit-log-viewer";

export default function SettingsAuditPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  if (!workspaceId) {
    redirect("/login");
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Activity log for your workspace. Track changes, access, and administrative actions.
        </p>
      </div>
      <AuditLogViewer workspaceId={workspaceId} />
    </div>
  );
}
