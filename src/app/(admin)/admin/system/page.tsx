import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SystemConfigClient } from "@/components/admin/system-config-client";

const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  self_healing: true,
  ai_suggestions: true,
  parallel_execution: true,
  visual_regression: false,
  plugin_marketplace: false,
};

const DEFAULT_RATE_LIMITS = {
  runs_per_hour: 50,
  api_requests_per_minute: 100,
  concurrent_runs: 5,
};

export default async function AdminSystemPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const configs = await prisma.systemConfig.findMany();
  const configMap: Record<string, unknown> = {};
  for (const c of configs) {
    configMap[c.key] = c.value;
  }

  const featureFlags = (configMap.feature_flags as Record<string, boolean>) ?? DEFAULT_FEATURE_FLAGS;
  const rateLimits = (configMap.rate_limits as typeof DEFAULT_RATE_LIMITS) ?? DEFAULT_RATE_LIMITS;
  const maintenanceMode = (configMap.maintenance_mode as boolean) ?? false;
  const maintenanceMessage = (configMap.maintenance_message as string) ?? "";
  const systemAnnouncement = (configMap.system_announcement as string) ?? "";

  return (
    <SystemConfigClient
      featureFlags={featureFlags}
      rateLimits={rateLimits}
      maintenanceMode={maintenanceMode}
      maintenanceMessage={maintenanceMessage}
      systemAnnouncement={systemAnnouncement}
    />
  );
}
