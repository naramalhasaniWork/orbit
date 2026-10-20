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
  userId: string;
  workspaceId: string;
  projectId: string;
  planId: string;
  testCaseId: string;
  runId: string;
  environmentId: string;
  secretId: string;
  artifactId: string;
  webhookId: string;
  deliveryId: string;
  apiKeyId: string;
  mcpConnectionId: string;
  invitationId: string;
}

/** A workspace (with an owner) holding one row of each kind the id-param routes read. */
export async function seedTenant(db: PrismaClient, label: string): Promise<TenantFixture> {
  const tag = `${label}-${randomUUID().slice(0, 8)}`;
  const user = await db.user.create({ data: { email: `${tag}@w2.test` } });
  const workspace = await db.workspace.create({ data: { name: `w2 ${tag}`, slug: `w2-${tag}` } });
  await db.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
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
  const artifact = await db.runArtifact.create({
    data: { projectId, testRunId: run.id, type: "screenshot", storageKey: `w2/${tag}.png` },
  });
  const webhook = await db.webhookEndpoint.create({
    data: { workspaceId: workspace.id, projectId, url: "https://hooks.example.com/w2", events: ["run.completed"] },
  });
  const delivery = await db.webhookDelivery.create({
    data: { projectId, endpointId: webhook.id, event: "run.completed", url: webhook.url, payload: {} },
  });
  const apiKey = await db.apiKey.create({
    data: { workspaceId: workspace.id, name: "ci", prefix: "orb_w2", keyHash: `w2-${tag}` },
  });
  const mcp = await db.mcpConnection.create({
    data: { workspaceId: workspace.id, name: "mcp", serverUrl: "https://mcp.example.com" },
  });
  const invitation = await db.workspaceInvitation.create({
    data: {
      workspaceId: workspace.id, email: `invitee-${tag}@w2.test`, token: `w2-${tag}`,
      invitedById: user.id, expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  return {
    apiKeyId: apiKey.id, mcpConnectionId: mcp.id, invitationId: invitation.id,
    userId: user.id, workspaceId: workspace.id, projectId, planId: plan.id, testCaseId: testCase.id,
    runId: run.id, environmentId: environment.id, secretId: secret.id,
    artifactId: artifact.id, webhookId: webhook.id, deliveryId: delivery.id,
  };
}

/** Workspace delete cascades to everything seedTenant made except the user. */
export async function dropTenant(db: PrismaClient, fixture: TenantFixture | undefined): Promise<void> {
  if (!fixture) return;
  await db.workspace.delete({ where: { id: fixture.workspaceId } });
  await db.user.delete({ where: { id: fixture.userId } });
}
