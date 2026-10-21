import { describe, it, expect, vi } from "vitest";
import { forWorkspace, type ProjectScope, type WorkspaceScope } from "@/server/data/scope";
import type { Db } from "@/server/data/db";

/** A stand-in client: every delegate method resolves to its args, so tests see what the scope sent. */
function fakeDb(counts: Record<string, number> = {}) {
  const calls: Array<{ model: string; op: string; args: unknown }> = [];
  const models = [
    "project", "testRun", "testResult", "testPlan", "testCase", "environment", "secret", "apiKey",
    "workspaceMember", "workspace", "user", "account", "modelRegistry", "message", "conversation",
  ];
  const db: Record<string, unknown> = {};
  for (const model of models) {
    db[model] = new Proxy({}, {
      get: (_t, op: string) => vi.fn(async (args: unknown) => {
        calls.push({ model, op, args });
        if (op === "count") return counts[model] ?? 0;
        if (op === "findFirst" && model === "project") return { id: "p1" };
        return args;
      }),
    });
  }
  return { db: db as unknown as Db, calls };
}

const PROJECT = "p1";
async function scopes(counts?: Record<string, number>) {
  const fake = fakeDb(counts);
  const ws: WorkspaceScope = forWorkspace("w1", fake.db);
  const project: ProjectScope = await ws.project(PROJECT);
  return { ws, project, calls: fake.calls };
}

describe("updates keep their owner", () => {
  it("refuses moving a row to another project or workspace", async () => {
    const { ws, project } = await scopes();
    await expect(project.testRun.update({ where: { id: "r1" }, data: { projectId: "p2" } })).rejects.toThrow(/projectId/);
    await expect(project.testRun.update({ where: { id: "r1" }, data: { project: { connect: { id: "p2" } } } }))
      .rejects.toThrow(/project/);
    await expect(ws.apiKey.updateMany({ where: {}, data: { workspaceId: { set: "w2" } } })).rejects.toThrow(/workspaceId/);
    await expect(ws.apiKey.update({ where: { id: "k" }, data: { workspace: { connect: { id: "w2" } } } })).rejects.toThrow();
  });

  it("refuses any projectId write at workspace level, and owning-relation keys anywhere", async () => {
    const { ws, project } = await scopes();
    await expect(ws.testRun.update({ where: { id: "r1" }, data: { projectId: PROJECT } })).rejects.toThrow(/projectId/);
    await expect(project.testResult.update({ where: { id: "x" }, data: { testRunId: "r2" } })).rejects.toThrow(/testRunId/);
    await expect(ws.workspaceMember.update({ where: { id: "m" }, data: { userId: "u2" } })).rejects.toThrow(/userId/);
    await expect(project.testRun.upsert({ where: { id: "r" }, create: {} as never, update: { projectId: "p2" } })).rejects.toThrow();
  });

  it("lets a write restate its own owner", async () => {
    const { ws, project } = await scopes();
    await expect(project.testRun.update({ where: { id: "r1" }, data: { projectId: PROJECT, status: "queued" } })).resolves.toBeTruthy();
    await expect(ws.apiKey.update({ where: { id: "k" }, data: { workspaceId: "w1", name: "n" } })).resolves.toBeTruthy();
  });
});

describe("nested relation writes", () => {
  it("refuses connect, set, connectOrCreate and upsert on tenant relations", async () => {
    const { project } = await scopes();
    for (const op of ["connect", "set", "connectOrCreate", "upsert"]) {
      await expect(project.environment.update({ where: { id: "e1" }, data: { secrets: { [op]: [{ id: "s-foreign" }] } } }))
        .rejects.toThrow(new RegExp(`nested ${op}`));
    }
    await expect(project.testCase.create({ data: { testPlan: { connect: { id: "plan-foreign" } }, name: "x" } as never }))
      .rejects.toThrow(/nested connect/);
  });

  it("checks nested creates and updates like top-level ones", async () => {
    const { ws, project } = await scopes();
    await expect(project.testPlan.create({ data: { projectId: PROJECT, testCases: { create: [{ projectId: "p2" }] } } as never }))
      .rejects.toThrow(/projectId/);
    await expect(project.testPlan.create({ data: { projectId: PROJECT, testCases: { createMany: { data: [{ projectId: "p2" }] } } } as never }))
      .rejects.toThrow(/projectId/);
    await expect(project.environment.update({ where: { id: "e" }, data: { secrets: { updateMany: { where: {}, data: { projectId: "p2" } } } } }))
      .rejects.toThrow(/projectId/);
    // a project created at workspace level may carry its own new children
    await expect(ws.project.create({ data: { name: "n", environments: { create: [{ name: "staging" }] } } as never })).resolves.toBeTruthy();
    await expect(project.testPlan.create({ data: { projectId: PROJECT, testCases: { create: [{ projectId: PROJECT }] } } as never }))
      .resolves.toBeTruthy();
    await expect(project.environment.update({ where: { id: "e" }, data: { secrets: { deleteMany: {} } } })).resolves.toBeTruthy();
  });
});

describe("child rows prove their parent through the scope", () => {
  it("creates a result only for a run the scope can see", async () => {
    const hidden = await scopes({ testRun: 0 });
    await expect(hidden.project.testResult.create({ data: { testRunId: "r-foreign", testCaseId: "c", verdict: "pass" } }))
      .rejects.toThrow(/TestRun is not in this scope/);
    expect(hidden.calls.find((c) => c.model === "testResult")).toBeUndefined();
    expect(hidden.calls.find((c) => c.model === "testRun" && c.op === "count")?.args)
      .toEqual({ where: { id: { in: ["r-foreign"] }, AND: [{ projectId: PROJECT }] } });

    const visible = await scopes({ testRun: 1, testCase: 1 });
    await expect(visible.project.testResult.create({ data: { testRunId: "r1", testCaseId: "c", verdict: "pass" } })).resolves.toBeTruthy();
    await expect(visible.project.testResult.create({ data: { testCaseId: "c", verdict: "pass" } as never })).rejects.toThrow(/needs its testRun/);
  });
});

describe("what a scope exposes", () => {
  it("binds the workspace row to the scope and never creates or deletes it", async () => {
    const { ws, calls } = await scopes();
    await ws.workspace.findUnique({ where: { id: "w2" } });
    expect(calls.at(-1)?.args).toEqual({ where: { id: "w2", AND: [{ id: "w1" }] } });
    await expect(ws.workspace.delete({ where: { id: "w1" } })).rejects.toThrow(/not allowed/);
    await expect(ws.workspace.create({ data: { name: "x", slug: "x" } })).rejects.toThrow(/not allowed/);
  });

  it("serves platform tables read-only and hides the other global tables", async () => {
    const { ws } = await scopes();
    await expect(ws.modelRegistry.findMany()).resolves.toBeUndefined();
    await expect(ws.modelRegistry.deleteMany({})).rejects.toThrow(/read-only/);
    expect(() => ws.user).toThrow(/User is not reachable/);
    expect(() => ws.account).toThrow(/Account is not reachable/);
    expect((ws as unknown as Record<string, unknown>).$queryRawUnsafe).toBeUndefined();
    expect((ws as unknown as Record<string, unknown>).$extends).toBeUndefined();
  });
});

describe("references a write names are proved through the scope", () => {
  it("checks a parent named inside a nested create, not only at the top level", async () => {
    const hidden = await scopes({ testRun: 0 });
    const write = (p: ProjectScope) =>
      p.testCase.update({ where: { id: "c1" }, data: { testResults: { create: [{ testRunId: "r-foreign", verdict: "pass" }] } } });
    await expect(write(hidden.project)).rejects.toThrow(/TestRun is not in this scope/);
    await expect(write((await scopes({ testRun: 1 })).project)).resolves.toBeTruthy();
  });

  it("checks scalar foreign keys to tenant rows on creates and updates", async () => {
    const { project, calls } = await scopes();
    await expect(project.testRun.create({ data: { projectId: PROJECT, environmentId: "e-foreign" } })).rejects.toThrow(/Environment/);
    expect(calls.find((c) => c.model === "testRun" && c.op === "create")).toBeUndefined();
    await expect(project.testCase.update({ where: { id: "c1" }, data: { testPlanId: "plan-foreign" } })).rejects.toThrow(/TestPlan/);
    await expect((await scopes({ environment: 1 })).project.testRun.create({ data: { projectId: PROJECT, environmentId: "e1" } }))
      .resolves.toBeTruthy();
  });

  it("links users only when they are members of the workspace", async () => {
    const outsider = await scopes({ workspaceMember: 0 });
    await expect(outsider.project.testRun.update({ where: { id: "r" }, data: { triggeredById: "u-out" } })).rejects.toThrow(/User/);
    await expect(outsider.project.testPlan.update({ where: { id: "p" }, data: { approvedBy: { connect: { id: "u-out" } } } }))
      .rejects.toThrow(/User/);
    for (const op of ["connectOrCreate", "set", "create"]) {
      await expect(outsider.project.testPlan.update({ where: { id: "p" }, data: { approvedBy: { [op]: {} } } as never }))
        .rejects.toThrow(new RegExp(`nested ${op} on users`));
    }
    await expect((await scopes({ workspaceMember: 1 })).project.testRun.update({ where: { id: "r" }, data: { triggeredById: "u2" } }))
      .resolves.toBeTruthy();

    // the caller route() just verified needs no lookup
    const fake = fakeDb({ workspaceMember: 0 });
    const ws = forWorkspace({ workspaceId: "w1", memberUserId: "u-caller" }, fake.db);
    const key = (createdBy: string) => ({ data: { workspaceId: "w1", name: "k", prefix: "p", keyHash: "h", createdBy } });
    await expect(ws.apiKey.create(key("u-caller"))).resolves.toBeTruthy();
    expect(fake.calls.some((c) => c.model === "workspaceMember")).toBe(false);
    await expect(ws.apiKey.create(key("u-out"))).rejects.toThrow(/User/);
  });
});
