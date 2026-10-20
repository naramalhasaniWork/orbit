import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/redis", async () => (await import("../helpers/fake-redis")).redisMock());
vi.mock("@/lib/db", () => ({ prisma: { testRun: { findFirst: vi.fn() } } }));
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

type Where = { id: string; projectId: string; project: { workspaceId: string } };
const findRun = (prisma as unknown as { testRun: { findFirst: ReturnType<typeof vi.fn> } }).testRun.findFirst;

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
    // The run exists only inside workspace ws-1, as the scoped query would find it.
    findRun.mockImplementation(async ({ where }: { where: Where }) =>
      where.project.workspaceId === "ws-1" && where.id === RUN ? { id: RUN } : null
    );
  });

  it("serves the frame to a member of the owning workspace", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(JPEG);
    expect(findRun).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: RUN, projectId: PROJECT, project: { workspaceId: "ws-1" } },
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
