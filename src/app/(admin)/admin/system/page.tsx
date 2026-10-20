import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getSystemConfig, invalidateSystemConfigCache } from "@/lib/system-config";
import { SystemConfigClient } from "@/components/admin/system-config-client";

export default async function AdminSystemPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  invalidateSystemConfigCache();
  const config = await getSystemConfig();

  return (
    <SystemConfigClient
      featureFlags={config.featureFlags}
      maintenanceMode={config.maintenanceMode}
      maintenanceMessage={config.maintenanceMessage}
      systemAnnouncement={config.announcement}
    />
  );
}
