import { requireWorkspace, apiSuccess, handleApiError } from "@/lib/utils/api";
import { getActiveOperations } from "@/lib/dashboard/active-operations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace();
    const operations = await getActiveOperations(workspaceId);
    return apiSuccess(operations);
  } catch (error) {
    return handleApiError(error);
  }
}
