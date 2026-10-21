import { z } from "zod";
import { route } from "@/server/http/route";
import { parseWorkspaceSettings } from "@/server/data/settings-repo";
import { getTourCompletedAt, loadTourContext, setTourCompletedAt } from "@/server/data/tour-repo";

export const dynamic = "force-dynamic";

const Query = z.object({ project: z.string().uuid().optional() });

/** Whether the caller has seen the dashboard tour, and the workspace facts its stops talk about. */
export const GET = route({ query: Query }, async ({ query, auth, db, workspaceId }) => {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settings: true } });
  const githubConnected = parseWorkspaceSettings(workspace?.settings).github?.connected ?? false;
  const [completedAt, context] = await Promise.all([
    getTourCompletedAt(auth.userId),
    loadTourContext(db, query.project ?? null, githubConnected),
  ]);
  return { completedAt: completedAt?.toISOString() ?? null, context };
});

/** The tour ended (finished or skipped): don't show it after the next first run. */
export const POST = route({}, async ({ auth }) => {
  const completedAt = await setTourCompletedAt(auth.userId, new Date());
  return { completedAt: completedAt?.toISOString() ?? null };
});

/** "Replay tour": mark it due again. */
export const DELETE = route({}, async ({ auth }) => {
  await setTourCompletedAt(auth.userId, null);
  return { completedAt: null };
});
