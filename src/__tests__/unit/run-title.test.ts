import { describe, it, expect } from "vitest";
import { formatRunTitle } from "@/lib/runs/run-title";

const id = "10000000-aaaa-bbbb-cccc-000000000000";

describe("formatRunTitle", () => {
  it("uses the project sequence number", () => {
    expect(formatRunTitle({ id, sequenceNumber: 412 })).toBe("Run #412");
  });

  it("adds project name and PR number in order", () => {
    expect(
      formatRunTitle({ id, sequenceNumber: 412, projectName: "checkout", prNumber: 318 })
    ).toBe("Run #412 · checkout · PR #318");
  });

  it("skips missing parts", () => {
    expect(formatRunTitle({ id, sequenceNumber: 7, prNumber: 9 })).toBe("Run #7 · PR #9");
    expect(formatRunTitle({ id, sequenceNumber: 7, projectName: "web" })).toBe("Run #7 · web");
  });

  it("falls back to a short id when the sequence number is unassigned", () => {
    expect(formatRunTitle({ id, sequenceNumber: 0 })).toBe("Run 10000000");
    expect(formatRunTitle({ id })).toBe("Run 10000000");
  });
});
