import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { IDS, NODES, EDGES, AUDIT_ENTRIES } from "./seed-data";
import {
  seedUsers,
  seedMembers,
  seedProject,
  seedEnvironments,
  seedSystemMap,
  seedTestPlan,
  seedTestCases,
  seedTestRuns,
  seedTestResults,
  seedFlakyTests,
  seedAuditLog,
  seedCreditTransactions,
  seedWebhookEvents,
  seedIntegrationConfigs,
  seedRunArtifacts,
  seedSelectorHistory,
  seedTestCaseVersions,
  seedFailurePatterns,
  seedBaselineSnapshots,
  seedPluginInstallations,
  seedDomainKnowledgeFiles,
  seedWebhookEndpoints,
} from "./seed-helpers";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding Orbit database...\n");

  const workspace = await prisma.workspace.upsert({
    where: { slug: "orbit-demo" },
    update: { name: "Orbit Demo", creditBalance: 5000, tier: "starter" },
    create: {
      id: IDS.workspace, name: "Orbit Demo", slug: "orbit-demo",
      tier: "starter", creditBalance: 5000, monthlyCredits: 5000,
      settings: { theme: "dark", notifications: true },
    },
  });
  console.log(`  Workspace: ${workspace.name} (${workspace.id})`);

  const users = await seedUsers(prisma);
  console.log(`  Users: ${users.length} created/updated`);

  await seedMembers(prisma, workspace.id, users);
  console.log("  Members: 3 linked to workspace");

  const project = await seedProject(prisma, workspace.id);
  console.log(`  Project: ${project.name} (${project.id})`);

  await seedEnvironments(prisma, project.id);
  console.log("  Environments: 3 created");

  await seedSystemMap(prisma, project.id);
  console.log(`  System map: ${NODES.length} nodes, ${EDGES.length} edges`);

  const testPlan = await seedTestPlan(prisma, project.id);
  const testCases = await seedTestCases(prisma, testPlan.id, project.id);
  console.log(`  Test plan: v${testPlan.version} with ${testCases.length} cases`);

  const runs = await seedTestRuns(prisma, project.id, testPlan.id, users[0].id);
  console.log(`  Test runs: ${runs.length}`);

  const resultCount = await seedTestResults(prisma, runs, testCases);
  console.log(`  Test results: ${resultCount}`);

  await seedFlakyTests(prisma, project.id, testCases);
  console.log("  Flaky tests: 3 registered");

  await seedAuditLog(prisma, workspace.id, users[0].id);
  console.log(`  Audit log: ${AUDIT_ENTRIES.length} entries`);

  await seedCreditTransactions(prisma, workspace.id);
  console.log("  Credit transactions: 7 entries");

  await seedWebhookEvents(prisma, project.id);
  console.log("  Webhook events: 5 inbound events");

  await seedIntegrationConfigs(prisma, workspace.id);
  console.log("  Integration configs: 3 providers");

  const artifactCount = await seedRunArtifacts(prisma, project.id, runs, testCases);
  console.log(`  Run artifacts: ${artifactCount} files`);

  await seedSelectorHistory(prisma, project.id);
  console.log("  Selector history: 2 entries");

  await seedTestCaseVersions(prisma, testCases);
  console.log("  Test case versions: 7 entries");

  await seedFailurePatterns(prisma, project.id, testCases);
  console.log("  Failure patterns: 4 entries");

  const lastRun = runs[runs.length - 1];
  await seedBaselineSnapshots(prisma, project.id, lastRun.id);
  console.log("  Baseline snapshots: 6 entries");

  await seedPluginInstallations(prisma, workspace.id);
  console.log("  Plugin installations: 3 entries");

  await seedDomainKnowledgeFiles(prisma, workspace.id);
  console.log("  Domain knowledge files: 3 entries");

  await seedWebhookEndpoints(prisma, workspace.id);
  console.log("  Webhook subscriptions: 2 entries");

  console.log("\nSeed complete.");
}

main()
  .then(async () => { await prisma.$disconnect(); await pool.end(); })
  .catch(async (e) => {
    console.error("Seed failed:", e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
