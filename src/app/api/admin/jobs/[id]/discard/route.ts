import { NextRequest } from "next/server";
import { requireSuperAdmin, apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { discardJobFailure } from "@/lib/queue/dead-letter";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdmin();
    const { id } = await params;
    if (!(await discardJobFailure(id, session.user.id))) {
      return apiError("Job failure not found or already resolved", "NOT_OPEN", 409);
    }
    return apiSuccess({ discarded: true });
  } catch (error) {
    return handleApiError(error);
  }
}
