import { prisma } from "@/lib/db";
import { advancePreviewDeployment } from "./coordinator";
import { PREVIEW_STATUS } from "./types";

/** Rows per tick; the oldest first so timeouts are never starved. */
const BATCH = 50;

/**
 * Repeatable job (every 2 min): re-resolve every pending preview deployment. This is what
 * makes webhooks optional (Cloudflare Pages is polling-only, and Railway delivery is
 * best-effort) and what times a PR out with a neutral check after 15 minutes.
 */
export async function reconcilePreviews(): Promise<{ checked: number; changed: number }> {
  const pending = await prisma.previewDeployment.findMany({
    where: { status: PREVIEW_STATUS.pending },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    select: { id: true },
  });

  let changed = 0;
  for (const { id } of pending) {
    try {
      const status = await advancePreviewDeployment(id);
      if (status !== PREVIEW_STATUS.pending) changed++;
    } catch (err) {
      // One provider outage must not stop the rest of the batch.
      console.error(`[preview] Reconcile failed for ${id}:`, err instanceof Error ? err.message : err);
    }
  }
  return { checked: pending.length, changed };
}
