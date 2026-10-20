import { z } from "zod";
import { apiSuccess } from "@/lib/utils/api";
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

export const GET = route(
  { permission: "integrations.view", onError: mapPreviewError },
  async ({ params: { projectId }, workspaceId, db }) => {
    await db.project(projectId);

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
  async ({ req, params: { projectId }, workspaceId, session, db }) => {
    assertPermission(session.role, "secrets.manage");
    await db.project(projectId);

    const input = BindingSchema.parse(await req.json());
    const binding = await saveBinding(workspaceId, projectId, input);
    return apiSuccess({ binding });
  }
);

export const DELETE = route(
  { permission: "integrations.manage", onError: mapPreviewError },
  async ({ params: { projectId }, db }) => {
    await db.project(projectId);

    await deleteBinding(projectId);
    return apiSuccess({ bound: false });
  }
);
