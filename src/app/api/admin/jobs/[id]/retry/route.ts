import { NextRequest } from "next/server";
import { requireSuperAdmin, apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { retryJobFailure } from "@/lib/queue/dead-letter";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdmin();
    const { id } = await params;
    const result = await retryJobFailure(id, session.user.id);
    if (!result.ok) {
      return apiError(result.reason, result.code, result.code === "NOT_FOUND" ? 404 : 409);
    }
    return apiSuccess({ jobId: result.jobId });
  } catch (error) {
    return handleApiError(error);
  }
}
