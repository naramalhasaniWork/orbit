import { prisma } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { route } from "@/server/http/route";

export const GET = route({}, async ({ params: { projectId }, workspaceId }) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  if (!project) {
    return apiError("Project not found", "NOT_FOUND", 404);
  }

  const flakyTests = await prisma.flakyTest.findMany({
    where: { projectId },
    include: {
      testCase: {
        select: {
          id: true,
          name: true,
          type: true,
          journey: true,
          priorityScore: true,
          isCritical: true,
        },
      },
    },
    orderBy: { occurrences: "desc" },
  });

  const quarantinedCount = flakyTests.filter((f) => f.isQuarantined).length;
  const totalOccurrences = flakyTests.reduce(
    (s, f) => s + f.occurrences,
    0
  );

  return apiSuccess({
    projectId,
    totalFlaky: flakyTests.length,
    quarantinedCount,
    totalOccurrences,
    tests: flakyTests.map((f) => ({
      id: f.id,
      testCase: f.testCase,
      occurrences: f.occurrences,
      passRate: f.passRate,
      isQuarantined: f.isQuarantined,
      lastFlakyAt: f.lastFlakyAt,
    })),
  });
});
