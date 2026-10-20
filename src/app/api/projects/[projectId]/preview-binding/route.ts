import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { deleteBinding, getBindingView, saveBinding } from "@/services/preview/binding-service";
import { listConnectionSummaries } from "@/services/preview/connection-service";
import { mapPreviewError } from "@/services/preview/http";
import { assertPermission } from "@/server/http/auth";
import { route } from "@/server/http/route";

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

export const GET = route(
  { permission: "integrations.view", onError: mapPreviewError },
  async ({ params: { projectId }, workspaceId }) => {
    if (!(await projectInWorkspace(projectId, workspaceId))) return apiError("Project not found", "NOT_FOUND", 404);

    const [view, connections] = await Promise.all([getBindingView(projectId), listConnectionSummaries(workspaceId)]);
    return apiSuccess({ ...view, connections });
  }
);

/**
 * Choose where this project's PR previews come from. A binding decides which URLs project
 * secrets are sent to, so it needs secrets.manage as well as integrations.manage.
 */
export const PUT = route(
  { permission: "integrations.manage", onError: mapPreviewError },
  async ({ req, params: { projectId }, workspaceId, session }) => {
    assertPermission(session.role, "secrets.manage");
    if (!(await projectInWorkspace(projectId, workspaceId))) return apiError("Project not found", "NOT_FOUND", 404);

    const input = BindingSchema.parse(await req.json());
    const binding = await saveBinding(workspaceId, projectId, input);
    return apiSuccess({ binding });
  }
);

export const DELETE = route(
  { permission: "integrations.manage", onError: mapPreviewError },
  async ({ params: { projectId }, workspaceId }) => {
    if (!(await projectInWorkspace(projectId, workspaceId))) return apiError("Project not found", "NOT_FOUND", 404);

    await deleteBinding(projectId);
    return apiSuccess({ bound: false });
  }
);
