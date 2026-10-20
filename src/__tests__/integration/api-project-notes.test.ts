import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", async () => ({
  prisma: (await import("../helpers/fake-config-db")).createFakeConfigDb().prisma,
}));
vi.mock("@/server/http/session", async () => (await import("../helpers/route-auth")).sessionMock());
vi.mock("@/server/http/auth", async (orig) =>
  (await import("../helpers/route-auth")).authMock(await orig<Record<string, unknown>>())
);

import { resetRouteAuth, routeAuth } from "../helpers/route-auth";
import { fakeOf } from "../helpers/fake-config-db";
import { prisma } from "@/lib/db";

const db = fakeOf(prisma);

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/x", { method, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  db.reset();
  db.addWorkspace("w1");
  db.addProject("p1", "w1");
  resetRouteAuth();
  routeAuth.workspaceId = "w1";
});

describe("project notes routes", () => {
  const pParams = { params: Promise.resolve({ projectId: "p1" }) };

  it("creates, lists, edits and deletes ProjectNote rows; concurrent creates both survive", async () => {
    const { GET, POST, PATCH, DELETE } = await import("@/app/api/projects/[projectId]/notes/route");
    const [a, b] = await Promise.all([
      POST(req("POST", { content: " use the staging card ", category: "instruction" }), pParams),
      POST(req("POST", { content: "search is flaky" }), pParams),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const first = (await a.json()).data;
    expect(first).toMatchObject({ content: "use the staging card", category: "instruction", active: true });

    const listed = (await (await GET(req("GET"), pParams)).json()).data;
    expect(listed).toHaveLength(2);

    const edited = await PATCH(req("PATCH", { noteId: first.id, active: false }), pParams);
    expect((await edited.json()).data).toMatchObject({ id: first.id, active: false });

    const del = await DELETE(new NextRequest(`http://localhost/x?noteId=${first.id}`, { method: "DELETE" }), pParams);
    expect(del.status).toBe(200);
    expect(db.notes.map((n) => n.content)).toEqual(["search is flaky"]);
    expect(db.projects[0].settings).not.toHaveProperty("testingNotes");
  });

  it("validates input and scopes notes to the project", async () => {
    const { POST, PATCH } = await import("@/app/api/projects/[projectId]/notes/route");
    expect((await POST(req("POST", { content: "  " }), pParams)).status).toBe(400);
    expect((await POST(req("POST", { content: "x", category: "nope" }), pParams)).status).toBe(400);

    db.addProject("p2", "w1");
    db.notes.push({ id: "6f1c1d1e-0000-4000-8000-000000000009", projectId: "p2", content: "other", category: "context", active: true });
    const res = await PATCH(req("PATCH", { noteId: "6f1c1d1e-0000-4000-8000-000000000009", active: false }), pParams);
    expect(res.status).toBe(404);
    expect(db.notes[0].active).toBe(true);
  });
});
