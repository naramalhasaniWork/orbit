import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma before importing the module
vi.mock("@/lib/db", () => ({
  prisma: {
    flakyTest: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    testResult: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import {
  recordFlakyResult,
  isTestQuarantined,
  detectFlakyFromRetry,
  resetFlakyStatus,
  getProjectFlakyTests,
} from "@/services/execution/flaky-registry";

const mockPrisma = prisma as unknown as {
  flakyTest: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  testResult: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

describe("flaky-registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordFlakyResult", () => {
    it("creates a new flaky record on first occurrence", async () => {
      mockPrisma.flakyTest.findUnique.mockResolvedValue(null);
      mockPrisma.flakyTest.create.mockResolvedValue({ id: "flaky-1" });

      const result = await recordFlakyResult("proj-1", "tc-1", true);

      expect(result.isFlaky).toBe(true);
      expect(result.isQuarantined).toBe(false);
      expect(mockPrisma.flakyTest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: "proj-1",
            testCaseId: "tc-1",
            occurrences: 1,
            passRate: 1.0,
          }),
        })
      );
    });

    it("creates with passRate 0.0 when test failed", async () => {
      mockPrisma.flakyTest.findUnique.mockResolvedValue(null);
      mockPrisma.flakyTest.create.mockResolvedValue({ id: "flaky-1" });

      await recordFlakyResult("proj-1", "tc-1", false);

      expect(mockPrisma.flakyTest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passRate: 0.0 }),
        })
      );
    });

    it("increments occurrences on existing record", async () => {
      mockPrisma.flakyTest.findUnique.mockResolvedValue({
        id: "flaky-1",
        occurrences: 3,
        isQuarantined: false,
      });
      mockPrisma.testResult.findMany.mockResolvedValue([
        { verdict: "pass" },
        { verdict: "fail" },
        { verdict: "pass" },
        { verdict: "pass" },
      ]);
      mockPrisma.flakyTest.update.mockResolvedValue({ id: "flaky-1" });

      const result = await recordFlakyResult("proj-1", "tc-1", true);

      expect(result.isFlaky).toBe(true);
      expect(mockPrisma.flakyTest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ occurrences: 4 }),
        })
      );
    });

    it("quarantines when threshold reached and pass rate < 0.5", async () => {
      mockPrisma.flakyTest.findUnique.mockResolvedValue({
        id: "flaky-1",
        occurrences: 4,
        isQuarantined: false,
      });
      // 2 passes out of 10 = 0.2 pass rate
      mockPrisma.testResult.findMany.mockResolvedValue([
        { verdict: "fail" },
        { verdict: "fail" },
        { verdict: "pass" },
        { verdict: "fail" },
        { verdict: "fail" },
        { verdict: "fail" },
        { verdict: "fail" },
        { verdict: "pass" },
        { verdict: "fail" },
        { verdict: "fail" },
      ]);
      mockPrisma.flakyTest.update.mockResolvedValue({ id: "flaky-1" });

      const result = await recordFlakyResult("proj-1", "tc-1", false);

      expect(result.isQuarantined).toBe(true);
      expect(mockPrisma.flakyTest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isQuarantined: true }),
        })
      );
    });

    it("does not quarantine when pass rate >= 0.5", async () => {
      mockPrisma.flakyTest.findUnique.mockResolvedValue({
        id: "flaky-1",
        occurrences: 4,
        isQuarantined: false,
      });
      // 6 passes out of 10 = 0.6 pass rate
      mockPrisma.testResult.findMany.mockResolvedValue(
        Array(6).fill({ verdict: "pass" }).concat(Array(4).fill({ verdict: "fail" }))
      );
      mockPrisma.flakyTest.update.mockResolvedValue({ id: "flaky-1" });

      const result = await recordFlakyResult("proj-1", "tc-1", true);

      expect(result.isQuarantined).toBe(false);
    });

    it("preserves existing quarantine status", async () => {
      mockPrisma.flakyTest.findUnique.mockResolvedValue({
        id: "flaky-1",
        occurrences: 10,
        isQuarantined: true,
      });
      // Even if pass rate is now above 0.5
      mockPrisma.testResult.findMany.mockResolvedValue(
        Array(8).fill({ verdict: "pass" }).concat(Array(2).fill({ verdict: "fail" }))
      );
      mockPrisma.flakyTest.update.mockResolvedValue({ id: "flaky-1" });

      const result = await recordFlakyResult("proj-1", "tc-1", true);

      expect(result.isQuarantined).toBe(true);
    });
  });

  describe("isTestQuarantined", () => {
    it("returns true when test is quarantined", async () => {
      mockPrisma.flakyTest.findUnique.mockResolvedValue({ isQuarantined: true });
      expect(await isTestQuarantined("proj-1", "tc-1")).toBe(true);
    });

    it("returns false when test is not quarantined", async () => {
      mockPrisma.flakyTest.findUnique.mockResolvedValue({ isQuarantined: false });
      expect(await isTestQuarantined("proj-1", "tc-1")).toBe(false);
    });

    it("returns false when no record exists", async () => {
      mockPrisma.flakyTest.findUnique.mockResolvedValue(null);
      expect(await isTestQuarantined("proj-1", "tc-1")).toBe(false);
    });
  });

  describe("detectFlakyFromRetry", () => {
    it("detects flaky when fail then pass", async () => {
      mockPrisma.flakyTest.findUnique.mockResolvedValue(null);
      mockPrisma.flakyTest.create.mockResolvedValue({ id: "flaky-1" });

      const isFlaky = await detectFlakyFromRetry("proj-1", "tc-1", "fail", "pass");
      expect(isFlaky).toBe(true);
    });

    it("detects flaky when pass then fail", async () => {
      mockPrisma.flakyTest.findUnique.mockResolvedValue(null);
      mockPrisma.flakyTest.create.mockResolvedValue({ id: "flaky-1" });

      const isFlaky = await detectFlakyFromRetry("proj-1", "tc-1", "pass", "fail");
      expect(isFlaky).toBe(true);
    });

    it("returns false when both pass", async () => {
      const isFlaky = await detectFlakyFromRetry("proj-1", "tc-1", "pass", "pass");
      expect(isFlaky).toBe(false);
    });

    it("returns false when both fail", async () => {
      const isFlaky = await detectFlakyFromRetry("proj-1", "tc-1", "fail", "fail");
      expect(isFlaky).toBe(false);
    });
  });

  describe("resetFlakyStatus", () => {
    it("resets occurrences and quarantine", async () => {
      mockPrisma.flakyTest.updateMany.mockResolvedValue({ count: 1 });

      await resetFlakyStatus("proj-1", "tc-1");

      expect(mockPrisma.flakyTest.updateMany).toHaveBeenCalledWith({
        where: { projectId: "proj-1", testCaseId: "tc-1" },
        data: { isQuarantined: false, occurrences: 0, passRate: null },
      });
    });
  });

  describe("getProjectFlakyTests", () => {
    it("queries flaky tests for a project ordered by occurrences", async () => {
      mockPrisma.flakyTest.findMany.mockResolvedValue([]);

      await getProjectFlakyTests("proj-1");

      expect(mockPrisma.flakyTest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: "proj-1" },
          orderBy: { occurrences: "desc" },
        })
      );
    });
  });
});
