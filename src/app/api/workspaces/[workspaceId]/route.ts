/**
 * PATCH  /api/workspaces/:workspaceId — Rename / change slug (workspace.update)
 * DELETE /api/workspaces/:workspaceId — Soft-delete (owner only, typed-name confirmation)
 */

import { z } from "zod";
import { writeAuditLog } from "@/lib/auth/audit";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

type RouteContext = { params: Promise<{ workspaceId: string }> };

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const UpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Workspace name is required").max(100).optional(),
    slug: z
      .string()
      .trim()
      .min(3, "Slug must be at least 3 characters")
      .max(40, "Slug must be at most 40 characters")
      .regex(SLUG_PATTERN, "Slug may only contain lowercase letters, numbers and single hyphens")
      .optional(),
  })
  .refine((v) => v.name !== undefined || v.slug !== undefined, "Nothing to update");

const DeleteSchema = z.object({ confirmName: z.string() });

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
  );
}

export const PATCH = route(
  { workspace: "param", permission: "workspace.update" },
  async ({ req: request, workspaceId, session, db }) => {
    const parsed = UpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(parsed.error.errors[0]?.message ?? "Validation failed", "VALIDATION_ERROR", 400);
    }
    const { name, slug } = parsed.data;

    const current = await db.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { id: true, name: true, slug: true },
    });
    if (!current) return apiError("Workspace not found", "NOT_FOUND", 404);

    if (slug && slug !== current.slug) {
      const taken = await db.workspace.findUnique({ where: { slug }, select: { id: true } });
      if (taken) return apiError("That slug is already taken", "SLUG_TAKEN", 409);
    }

    let updated;
    try {
      updated = await db.workspace.update({
        where: { id: workspaceId },
        data: { ...(name !== undefined ? { name } : {}), ...(slug !== undefined ? { slug } : {}) },
        select: { id: true, name: true, slug: true },
      });
    } catch (error) {
      // Lost a race with another workspace claiming the slug
      if (isUniqueViolation(error)) return apiError("That slug is already taken", "SLUG_TAKEN", 409);
      throw error;
    }

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "workspace.settings_updated",
      resourceType: "workspace",
      resourceId: workspaceId,
      metadata: { from: { name: current.name, slug: current.slug }, to: { name: updated.name, slug: updated.slug } },
    });

    return apiSuccess(updated);
  }
);

export const DELETE = route(
  { workspace: "param", permission: "workspace.delete" },
  async ({ req: request, workspaceId, session, db }) => {
    if (session.role !== "owner") {
      return apiError("Only the workspace owner can delete it", "FORBIDDEN", 403);
    }

    const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("Type the workspace name to confirm", "VALIDATION_ERROR", 400);
    }

    const workspace = await db.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { id: true, name: true, stripeSubscriptionId: true },
    });
    if (!workspace) return apiError("Workspace not found", "NOT_FOUND", 404);

    if (parsed.data.confirmName !== workspace.name) {
      return apiError("Workspace name does not match", "CONFIRMATION_MISMATCH", 400);
    }

    // Deleting must not leave a paid subscription running
    if (workspace.stripeSubscriptionId) {
      return apiError(
        "Cancel the subscription in Billing before deleting this workspace",
        "ACTIVE_SUBSCRIPTION",
        409
      );
    }

    await db.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog({
      workspaceId,
      userId: session.user.id,
      action: "workspace.deleted",
      resourceType: "workspace",
      resourceId: workspaceId,
      metadata: { name: workspace.name },
    });

    return apiSuccess({ deleted: true });
  }
);
