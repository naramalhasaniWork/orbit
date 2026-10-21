import { NextRequest } from "next/server";
import { z } from "zod";
import { getStorage } from "@/lib/storage";
import { sniffScreenshotType } from "@/lib/bug-reports/screenshot";
import { requireSuperAdmin, apiError, handleApiError } from "@/lib/utils/api";
import { getBugReportScreenshotKey } from "@/server/data/bug-report-repo";

export const dynamic = "force-dynamic";

// ============================================================
// GET /api/admin/bug-reports/[id]/screenshot — the attached image (super admin).
// Streamed through the app: storage keys and bucket URLs never reach the browser.
// ============================================================

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const id = z.string().uuid().safeParse((await params).id);
    const key = id.success ? await getBugReportScreenshotKey(id.data) : null;
    if (!key) return apiError("No screenshot", "NOT_FOUND", 404);

    let data: Buffer;
    try {
      data = await getStorage().download(key);
    } catch {
      return apiError("Screenshot missing from storage", "GONE", 410);
    }

    return new Response(new Uint8Array(data), {
      headers: {
        // Checked again on the way out; the upload already refused anything else.
        "Content-Type": sniffScreenshotType(data) ?? "application/octet-stream",
        "Content-Length": String(data.length),
        "Cache-Control": "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
