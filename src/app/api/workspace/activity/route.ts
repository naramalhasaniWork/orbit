import { apiSuccess } from "@/lib/utils/api";
import { getActiveOperations } from "@/lib/dashboard/active-operations";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

export const GET = route({}, async ({ workspaceId }) => {
  const operations = await getActiveOperations(workspaceId);
  return apiSuccess(operations);
});
