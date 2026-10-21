import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, apiSuccess, handleApiError } from "@/lib/utils/api";
import { listBugReports } from "@/server/data/bug-report-repo";

export const dynamic = "force-dynamic";

const Filter = z.enum(["open", "resolved", "all"]).catch("open");

// ============================================================
// GET /api/admin/bug-reports?status=open|resolved|all — triage queue (super admin)
// ============================================================

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
    const status = Filter.parse(request.nextUrl.searchParams.get("status") ?? "open");
    return apiSuccess({ reports: await listBugReports(status) });
  } catch (error) {
    return handleApiError(error);
  }
}
