import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";

const memberRole = vi.hoisted(() => ({ current: "viewer" }));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({
    user: { id: "user-1" },
    workspaceId: "ws-1",
  })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
// Any DB access beyond the membership lookup means RBAC did not stop the request.
vi.mock("@/lib/db", () => ({
  prisma: new Proxy(
    {
      workspaceMember: {
        findUnique: vi.fn(async () => ({ id: "m1", role: memberRole.current })),
      },
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop as keyof typeof target];
        throw new Error(`DB access reached before RBAC check: ${String(prop)}`);
      },
    }
  ),
}));

const API_ROOT = path.resolve(__dirname, "../../app/api/projects");
const MUTATING = ["POST", "PATCH", "PUT", "DELETE"];

function findRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory()
      ? findRouteFiles(full)
      : name === "route.ts"
        ? [full]
        : [];
  });
}

/** Source of a handler: from its declaration to the next top-level export. */
function handlerSource(source: string, method: string): string | null {
  const start = source.indexOf(`export async function ${method}(`);
  if (start === -1) return null;
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("project routes: every mutating handler checks a permission", () => {
  for (const file of findRouteFiles(API_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const method of MUTATING) {
      const body = handlerSource(source, method);
      if (!body) continue;
      it(`${path.relative(API_ROOT, file)} ${method}`, () => {
        expect(body).toMatch(/await requirePermission\(/);
      });
    }
  }
});

describe("viewer is rejected before any data access", () => {
  const params = {
    params: Promise.resolve({ projectId: "p1", secretId: "s1", envId: "e1" }),
  };
  const req = (method: string, url = "http://localhost/api/projects/p1/x") =>
    new NextRequest(url, {
      method,
      body: method === "DELETE" ? undefined : JSON.stringify({ key: "K", value: "v", content: "n" }),
    });

  beforeEach(() => {
    memberRole.current = "viewer";
  });

  it("cannot create a secret", async () => {
    const { POST } = await import("@/app/api/projects/[projectId]/secrets/route");
    expect((await POST(req("POST"), params)).status).toBe(403);
  });

  it("cannot delete a secret", async () => {
    const { DELETE } = await import("@/app/api/projects/[projectId]/secrets/[secretId]/route");
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("cannot create a note", async () => {
    const { POST } = await import("@/app/api/projects/[projectId]/notes/route");
    expect((await POST(req("POST"), params)).status).toBe(403);
  });

  it("cannot delete a note", async () => {
    const { DELETE } = await import("@/app/api/projects/[projectId]/notes/route");
    const res = await DELETE(req("DELETE", "http://localhost/api/projects/p1/notes?noteId=n1"), params);
    expect(res.status).toBe(403);
  });

  it("cannot delete an environment", async () => {
    const { DELETE } = await import("@/app/api/projects/[projectId]/environments/[envId]/route");
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("member cannot manage secrets (admin/owner only)", async () => {
    memberRole.current = "member";
    const { POST } = await import("@/app/api/projects/[projectId]/secrets/route");
    expect((await POST(req("POST"), params)).status).toBe(403);
  });
});
