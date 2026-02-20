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
} from "./seed-helpers";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding Orbit database...\n");

  const workspace = await prisma.workspace.upsert({
    where: { slug: "orbit-demo" },
    update: { name: "Orbit Demo", creditBalance: 5000, plan: "pro" },
    create: {
      id: IDS.workspace, name: "Orbit Demo", slug: "orbit-demo",
      plan: "pro", creditBalance: 5000, monthlyCredits: 5000,
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
