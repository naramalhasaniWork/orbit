import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWorkspace, apiSuccess, apiError } from "@/lib/utils/api";
import { requirePermission } from "@/lib/auth/rbac";
import { deleteBinding, getBindingView, saveBinding } from "@/services/preview/binding-service";
import { listConnectionSummaries } from "@/services/preview/connection-service";
import { previewApiError } from "@/services/preview/http";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const BindingSchema = z.object({
  provider: z.enum(["railway", "cloudflare_pages"]),
  targetRef: z.string().trim().min(1).max(200),
  allowedHostSuffixes: z.array(z.string().trim().min(1).max(253)).max(10).optional(),
  access: z
    .object({
      clientId: z.string().trim().min(1, "Client ID is required").max(200),
      clientSecret: z.string().trim().min(1, "Client secret is required").max(500),
    })
    .nullable()
    .optional(),
});

async function projectInWorkspace(projectId: string, workspaceId: string): Promise<boolean> {
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
  return !!project;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "integrations.view");
    const { projectId } = await params;
    if (!(await projectInWorkspace(projectId, workspaceId))) return apiError("Project not found", "NOT_FOUND", 404);

    const [view, connections] = await Promise.all([getBindingView(projectId), listConnectionSummaries(workspaceId)]);
    return apiSuccess({ ...view, connections });
  } catch (error) {
    return previewApiError(error);
  }
}

/**
 * Choose where this project's PR previews come from. A binding decides which URLs project
 * secrets are sent to, so it needs secrets.manage as well as integrations.manage.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "integrations.manage");
    await requirePermission(workspaceId, "secrets.manage");
    const { projectId } = await params;
    if (!(await projectInWorkspace(projectId, workspaceId))) return apiError("Project not found", "NOT_FOUND", 404);

    const input = BindingSchema.parse(await req.json());
    const binding = await saveBinding(workspaceId, projectId, input);
    return apiSuccess({ binding });
  } catch (error) {
    return previewApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await requireWorkspace();
    await requirePermission(workspaceId, "integrations.manage");
    const { projectId } = await params;
    if (!(await projectInWorkspace(projectId, workspaceId))) return apiError("Project not found", "NOT_FOUND", 404);

    await deleteBinding(projectId);
    return apiSuccess({ bound: false });
  } catch (error) {
    return previewApiError(error);
  }
}
