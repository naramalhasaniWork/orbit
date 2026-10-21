import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { GLOBAL_MODELS, TENANCY, findTenantViolation } from "@/server/data/tenancy";
import { FOREIGN_KEYS, RELATIONS } from "@/server/data/relations";
import { TenantGuardError, enforceTenantFilter, guardMode, withTenantGuard } from "@/server/data/tenant-guard";
import type { Db } from "@/server/data/db";

const logWarn = vi.hoisted(() => vi.fn());
vi.mock("@/server/observability/logger", () => ({ logger: { warn: logWarn } }));

describe("findTenantViolation", () => {
  it("flags reads, writes and deletes on tenant models without an owner filter", () => {
    expect(findTenantViolation("TestRun", "findUnique", { where: { id: "r1" } })).toMatch(/TestRun.findUnique/);
    expect(findTenantViolation("TestRun", "update", { where: { id: "r1" }, data: {} })).toMatch(/no tenant filter/);
    expect(findTenantViolation("Secret", "deleteMany", {})).toMatch(/no tenant filter/);
    expect(findTenantViolation("Project", "findFirst", { where: { id: "p1" } })).toMatch(/workspaceId/);
  });

  it("accepts the owner key, the owning relation, or either inside AND", () => {
    expect(findTenantViolation("TestRun", "findFirst", { where: { id: "r1", projectId: "p1" } })).toBeNull();
    expect(findTenantViolation("TestRun", "findMany", { where: { project: { workspaceId: "w1" } } })).toBeNull();
    expect(findTenantViolation("TestResult", "count", { where: { testRunId: "r1" } })).toBeNull();
    expect(findTenantViolation("TestRun", "update", { where: { id: "r1", AND: [{ projectId: "p1" }] } })).toBeNull();
    expect(findTenantViolation("WorkspaceMember", "findMany", { where: { userId: "u1" } })).toBeNull();
  });

  it("treats an undefined owner value as missing (Prisma drops it from the query)", () => {
    expect(findTenantViolation("TestRun", "findFirst", { where: { id: "r1", projectId: undefined } })).not.toBeNull();
  });

  it("checks creates and upserts set an owner, and ignores global models", () => {
    expect(findTenantViolation("Secret", "create", { data: { key: "K" } })).toMatch(/sets no owner/);
    expect(findTenantViolation("Secret", "createMany", { data: [{ projectId: "p1" }, { key: "K" }] })).toMatch(/sets no owner/);
    expect(findTenantViolation("Secret", "create", { data: { projectId: "p1" } })).toBeNull();
    expect(findTenantViolation("ApiKey", "upsert", { where: { id: "k" }, create: { workspaceId: "w" } })).toMatch(/upsert/);
    expect(findTenantViolation("User", "findUnique", { where: { id: "u1" } })).toBeNull();
  });
});

describe("tenantGuard modes", () => {
  it("throws in dev and test, logs in production, and honours ORBIT_TENANT_GUARD", () => {
    expect(guardMode({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("throw");
    expect(guardMode({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe("throw");
    expect(guardMode({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("log");
    expect(guardMode({ NODE_ENV: "production", ORBIT_TENANT_GUARD: "throw" } as NodeJS.ProcessEnv)).toBe("throw");
    expect(guardMode()).toBe("throw");
  });

  it("log mode warns instead of throwing", () => {
    const unscoped = { where: { id: "r1" } };
    expect(() => enforceTenantFilter("TestRun", "findFirst", unscoped, "throw")).toThrow(TenantGuardError);
    expect(() => enforceTenantFilter("TestRun", "findFirst", unscoped, "log")).not.toThrow();
    expect(logWarn).toHaveBeenCalledWith({ model: "TestRun", operation: "findFirst" }, expect.stringMatching(/tenantGuard/));
  });

  it("guards a test double the same way as a real client", async () => {
    const findFirst = vi.fn(async () => ({ id: "r1" }));
    const db = withTenantGuard({ testRun: { findFirst } } as unknown as Db, "throw");
    expect(() => db.testRun.findFirst({ where: { id: "r1" } })).toThrow(TenantGuardError);
    await expect(db.testRun.findFirst({ where: { id: "r1", projectId: "p1" } })).resolves.toEqual({ id: "r1" });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("tenancy table", () => {
  const schema = readFileSync(join(__dirname, "../../../prisma/schema.prisma"), "utf8");
  const models = Array.from(schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)).map(([, name, body]) => ({ name, body }));

  it("classifies every model as tenant-owned or global, never both", () => {
    for (const { name } of models) {
      expect(Boolean(TENANCY[name]) !== GLOBAL_MODELS.has(name), `${name} must be in exactly one of TENANCY / GLOBAL_MODELS`).toBe(true);
    }
  });

  it("keeps RELATIONS in step with the schema, so nested writes are checked on every relation", () => {
    const names = new Set(models.map((m) => m.name));
    const fromSchema: Record<string, Record<string, string>> = {};
    for (const { name, body } of models) {
      for (const [, field, type] of Array.from(body.matchAll(/^\s+(\w+)\s+(\w+)(?:\[\]|\?)?(?:\s|$)/gm))) {
        if (names.has(type)) (fromSchema[name] ??= {})[field] = type;
      }
    }
    expect(RELATIONS).toEqual(fromSchema);
  });

  it("keeps FOREIGN_KEYS in step with the schema, so every scalar reference is checked", () => {
    const names = new Set(models.map((m) => m.name));
    const fromSchema: Record<string, Record<string, string>> = {};
    for (const { name, body } of models) {
      for (const [, type, column] of Array.from(body.matchAll(/^\s+\w+\s+(\w+)\??\s.*@relation\([^)]*fields: \[(\w+)\]/gm))) {
        if (names.has(type)) (fromSchema[name] ??= {})[column] = type;
      }
    }
    expect(FOREIGN_KEYS).toEqual(fromSchema);
  });

  it("names a tenant parent for every child model", () => {
    for (const [name, owner] of Object.entries(TENANCY)) {
      if (owner.parent) expect(TENANCY[owner.parent.model], name).toBeDefined();
    }
  });

  it("puts every model with a required workspaceId or projectId under TENANCY", () => {
    const owned = models.filter(({ body }) => /^\s+(workspaceId|projectId)\s+String\s/m.test(body)).map((m) => m.name);
    expect(owned.filter((name) => !TENANCY[name])).toEqual([]);
  });
});
