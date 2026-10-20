import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Real-Postgres suites run only when ORBIT_TEST_DATABASE_URL points at a migrated database
 * (e.g. postgresql://postgres@127.0.0.1:5434/orbit_mig); otherwise they skip. Call
 * useRealDb() before anything imports @/lib/db, since the client reads DATABASE_URL once.
 */
export const realDbUrl = process.env.ORBIT_TEST_DATABASE_URL ?? null;

export function useRealDb(): void {
  if (realDbUrl) process.env.DATABASE_URL = realDbUrl;
}

export interface TenantFixture {
  workspaceId: string;
  projectId: string;
  planId: string;
  testCaseId: string;
  runId: string;
  environmentId: string;
  secretId: string;
}

/** A workspace with one row of each project-owned kind the id-param routes read. */
export async function seedTenant(db: PrismaClient, label: string): Promise<TenantFixture> {
  const tag = `${label}-${randomUUID().slice(0, 8)}`;
  const workspace = await db.workspace.create({ data: { name: `w2 ${tag}`, slug: `w2-${tag}` } });
  const project = await db.project.create({
    data: {
      workspaceId: workspace.id, name: tag, slug: tag,
      repoUrl: `https://github.com/w2/${tag}`, repoOwner: "w2", repoName: tag,
    },
  });
  const projectId = project.id;
  const plan = await db.testPlan.create({ data: { projectId } });
  const testCase = await db.testCase.create({
    data: { projectId, testPlanId: plan.id, name: "case", type: "journey", steps: [] },
  });
  const environment = await db.environment.create({ data: { projectId, name: "staging", url: "https://example.com" } });
  const run = await db.testRun.create({ data: { projectId, environmentId: environment.id } });
  const secret = await db.secret.create({
    data: { projectId, environmentId: environment.id, key: "API_KEY", encryptedValue: "x", iv: "y" },
  });
  return {
    workspaceId: workspace.id, projectId, planId: plan.id, testCaseId: testCase.id,
    runId: run.id, environmentId: environment.id, secretId: secret.id,
  };
}

/** Workspace delete cascades to everything seedTenant made. */
export async function dropTenant(db: PrismaClient, fixture: TenantFixture | undefined): Promise<void> {
  if (fixture) await db.workspace.delete({ where: { id: fixture.workspaceId } });
}
