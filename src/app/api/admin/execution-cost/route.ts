import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { getExecutionCostReport } from "@/server/engine/metrics/execution-cost";

// ============================================================
// GET /api/admin/execution-cost?since=<ISO>|days=<n>&workspaceId=<uuid>
// Model calls and estimated $ per 100 test executions, by execution mode.
// Pass `since` = the deploy time of the instrumentation so older rows
// (recorded before model calls were counted) don't dilute the baseline.
// ============================================================

const QueryParams = z.object({
  days: z.coerce.number().min(1).max(90).optional().default(7),
  since: z.coerce.date().optional(),
  workspaceId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const url = new URL(request.url);
    const parsed = QueryParams.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return apiError("Invalid parameters", "VALIDATION_ERROR", 400);
    }

    const { days, since, workspaceId } = parsed.data;
    const from = since ?? new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return apiSuccess(await getExecutionCostReport(from, workspaceId));
  } catch (error) {
    return handleApiError(error);
  }
}
