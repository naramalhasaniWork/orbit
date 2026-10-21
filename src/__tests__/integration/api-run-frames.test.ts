import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/redis", async () => (await import("../helpers/fake-redis")).redisMock());
vi.mock("@/lib/db", () => ({ prisma: { project: { findFirst: vi.fn() }, testRun: { findUnique: vi.fn() } } }));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);

import { prisma } from "@/lib/db";
import { fakeRedis as redis } from "../helpers/fake-redis";
import { GET } from "@/app/api/projects/[projectId]/runs/[runId]/frames/[frameKey]/route";
import { frameRedisKey } from "@/server/realtime/frames";
import { resetRouteAuth, routeAuth } from "../helpers/route-auth";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const OTHER_RUN = "44444444-4444-4444-8444-444444444444";
const FRAME = "33333333-3333-4333-8333-333333333333";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

type Where = { id: string; AND: Array<Record<string, string>> };
const db = prisma as unknown as {
  project: { findFirst: ReturnType<typeof vi.fn> };
  testRun: { findUnique: ReturnType<typeof vi.fn> };
};
const findRun = db.testRun.findUnique;

function call(frameKey = FRAME, runId = RUN) {
  const params = { projectId: PROJECT, runId, frameKey };
  return GET(new NextRequest(`http://localhost/api/projects/${PROJECT}/runs/${runId}/frames/${frameKey}`), {
    params: Promise.resolve(params),
  });
}

describe("GET runs/[runId]/frames/[frameKey]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRouteAuth();
    redis.buffers.clear();
    redis.buffers.set(frameRedisKey(RUN, FRAME), JPEG);
    // The project exists only inside workspace ws-1, and the run only inside that project.
    db.project.findFirst.mockImplementation(async ({ where }: { where: Where }) =>
      where.id === PROJECT && where.AND.some((t) => t.workspaceId === "ws-1") ? { id: PROJECT } : null
    );
    findRun.mockImplementation(async ({ where }: { where: Where }) =>
      where.id === RUN && where.AND.some((t) => t.projectId === PROJECT) ? { id: RUN } : null
    );
  });

  it("serves the frame to a member of the owning workspace", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(JPEG);
    expect(findRun).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: RUN, AND: [{ projectId: PROJECT }] },
    }));
  });

  it("404s for another workspace without touching the frame", async () => {
    routeAuth.workspaceId = "ws-2";
    const read = vi.spyOn(redis, "getBuffer");
    expect((await call()).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });

  it("404s for an expired frame and for a frame that belongs to another run", async () => {
    redis.buffers.clear();
    expect((await call()).status).toBe(404);

    redis.buffers.set(frameRedisKey(OTHER_RUN, FRAME), JPEG);
    expect((await call()).status).toBe(404);
  });

  it("rejects a frame key that is not one we issued", async () => {
    expect((await call("../../etc/passwd")).status).toBe(400);
  });
});
