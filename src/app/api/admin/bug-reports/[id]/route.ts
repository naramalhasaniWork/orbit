import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, apiSuccess, apiError, handleApiError } from "@/lib/utils/api";
import { getBugReport, setBugReportStatus } from "@/server/data/bug-report-repo";

export const dynamic = "force-dynamic";

type Segment = { params: Promise<{ id: string }> };

const Id = z.string().uuid();
const Body = z.object({ status: z.enum(["open", "resolved"]) });

// ============================================================
// GET   /api/admin/bug-reports/[id] — one report (super admin)
// PATCH /api/admin/bug-reports/[id] — { status: "resolved" | "open" }
// ============================================================

export async function GET(_request: NextRequest, { params }: Segment) {
  try {
    await requireSuperAdmin();
    const id = Id.safeParse((await params).id);
    const report = id.success ? await getBugReport(id.data) : null;
    return report ? apiSuccess({ report }) : apiError("Report not found", "NOT_FOUND", 404);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Segment) {
  try {
    const session = await requireSuperAdmin();
    const id = Id.safeParse((await params).id);
    const { status } = Body.parse(await request.json().catch(() => ({})));
    const report = id.success ? await setBugReportStatus(id.data, status, session.user.id) : null;
    return report ? apiSuccess({ report }) : apiError("Report not found", "NOT_FOUND", 404);
  } catch (error) {
    return handleApiError(error);
  }
}
