import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWorkspace, apiSuccess, apiError } from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";
import { probeAccess } from "@/services/execution/access-headers";
import { loadAccessSecrets } from "@/services/preview/binding-service";
import { previewApiError } from "@/services/preview/http";
import { validatePreviewUrl } from "@/services/preview/url-policy";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const TestSchema = z.object({
  url: z.string().trim().url("Enter a preview URL to test"),
  clientId: z.string().trim().max(200).optional(),
  clientSecret: z.string().trim().max(500).optional(),
});

/**
 * "Test access": request a preview URL without, then with, the Access service token. The URL
 * must pass the same policy as a real preview (https, the binding's allowed hosts, public).
 *
 * Allowed hosts are shared (*.pages.dev, *.up.railway.app), so anyone can own a matching
 * host. The project's stored token is therefore only sent to the URL of one of this
 * binding's own ready previews; any other URL needs the caller to type the token in.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "integrations.manage");
    await requirePermission(workspaceId, "secrets.manage");
    const { projectId } = await params;

    const binding = await prisma.previewBinding.findFirst({
      where: { projectId, project: { workspaceId } },
      select: { id: true, allowedHostSuffixes: true },
    });
    if (!binding) return apiError("Choose a preview source first", "NOT_FOUND", 404);

    const input = TestSchema.parse(await req.json());
    const checked = await validatePreviewUrl(input.url, binding.allowedHostSuffixes);
    if (!checked.ok) return apiError(checked.reason, "UNSAFE_URL", 400);

    const typed = input.clientId && input.clientSecret
      ? { clientId: input.clientId, clientSecret: input.clientSecret }
      : null;
    if (!typed) {
      const ownPreview = await prisma.previewDeployment.findFirst({
        where: { bindingId: binding.id, status: "ready", url: checked.url },
        select: { id: true },
      });
      if (!ownPreview) return apiError("Test a URL from a recent preview, or enter the token", "VALIDATION_ERROR", 400);
    }
    const token = typed ?? (await loadAccessSecrets(projectId));
    if (!token) return apiError("Enter a client ID and secret, or save them first", "VALIDATION_ERROR", 400);

    const result = await probeAccess(checked.url, {
      "CF-Access-Client-Id": token.clientId,
      "CF-Access-Client-Secret": token.clientSecret,
    });
    return apiSuccess(result);
  } catch (error) {
    return previewApiError(error);
  }
}
