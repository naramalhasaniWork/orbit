import { describe, it, expect } from "vitest";
import { selectRunMode } from "@/services/orchestrator/mode-selector";

describe("mode-selector", () => {
  it("selects full mode for first run", () => {
    const result = selectRunMode({ trigger: "push", isFirstRun: true });
    expect(result.mode).toBe("full");
    expect(result.reason).toContain("First run");
  });

  it("selects targeted mode when targetPaths are provided", () => {
    const result = selectRunMode({
      trigger: "push",
      targetPaths: ["/auth", "/checkout"],
    });
    expect(result.mode).toBe("targeted");
    expect(result.reason).toContain("/auth");
    expect(result.reason).toContain("/checkout");
  });

  it("first run takes priority over targetPaths", () => {
    const result = selectRunMode({
      trigger: "push",
      isFirstRun: true,
      targetPaths: ["/auth"],
    });
    expect(result.mode).toBe("full");
  });

  it("selects smoke for push with small changeset (<= 5 files)", () => {
    const result = selectRunMode({
      trigger: "push",
      changedFiles: ["a.ts", "b.ts"],
    });
    expect(result.mode).toBe("smoke");
    expect(result.reason).toContain("Small push");
  });

  it("selects regression for push with large changeset (> 5 files)", () => {
    const result = selectRunMode({
      trigger: "push",
      changedFiles: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"],
    });
    expect(result.mode).toBe("regression");
  });

  it("selects regression for PR trigger", () => {
    const result = selectRunMode({ trigger: "pr" });
    expect(result.mode).toBe("regression");
    expect(result.reason).toContain("PR trigger");
  });

  it("selects full for scheduled trigger", () => {
    const result = selectRunMode({ trigger: "scheduled" });
    expect(result.mode).toBe("full");
    expect(result.reason).toContain("Scheduled");
  });

  it("selects full for manual trigger", () => {
    const result = selectRunMode({ trigger: "manual" });
    expect(result.mode).toBe("full");
    expect(result.reason).toContain("Manual");
  });

  it("selects targeted for linear trigger", () => {
    const result = selectRunMode({ trigger: "linear" });
    expect(result.mode).toBe("targeted");
    expect(result.reason).toContain("Linear");
  });

  it("selects full for api trigger", () => {
    const result = selectRunMode({ trigger: "api" });
    expect(result.mode).toBe("full");
    expect(result.reason).toContain("API trigger");
  });

  it("selects smoke for push with exactly 5 changed files", () => {
    const result = selectRunMode({
      trigger: "push",
      changedFiles: ["1.ts", "2.ts", "3.ts", "4.ts", "5.ts"],
    });
    expect(result.mode).toBe("smoke");
  });

  it("selects regression for push with no changedFiles array", () => {
    const result = selectRunMode({ trigger: "push" });
    expect(result.mode).toBe("regression");
  });
});
