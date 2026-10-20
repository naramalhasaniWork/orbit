import { describe, it, expect } from "vitest";
import {
  detectedStep,
  maxReachableStep,
  parseStepParam,
  resolveResumeStep,
  type ProgressSnapshot,
} from "@/lib/onboarding/resume";

const none: ProgressSnapshot = { hasProject: false, indexed: false, hasPlan: false };
const created: ProgressSnapshot = { hasProject: true, indexed: false, hasPlan: false };
const indexed: ProgressSnapshot = { hasProject: true, indexed: true, hasPlan: false };
const planned: ProgressSnapshot = { hasProject: true, indexed: true, hasPlan: true };

describe("detectedStep", () => {
  it("follows the furthest data", () => {
    expect([none, created, indexed, planned].map(detectedStep)).toEqual([1, 2, 3, 5]);
  });
});

describe("resolveResumeStep", () => {
  it("falls back to detection with no step in the URL", () => {
    expect(resolveResumeStep(null, indexed)).toBe(3);
  });

  it("resumes the step the user was on, e.g. env config before a plan exists", () => {
    expect(resolveResumeStep(4, indexed)).toBe(4);
    expect(resolveResumeStep(6, planned)).toBe(6);
  });

  it("never lands past what the project can show", () => {
    expect(resolveResumeStep(6, indexed)).toBe(5);
    expect(resolveResumeStep(4, created)).toBe(2);
    expect(resolveResumeStep(3, none)).toBe(1);
  });

  it("clamps junk below the first step", () => {
    expect(resolveResumeStep(0, planned)).toBe(1);
    expect(resolveResumeStep(-3, planned)).toBe(1);
  });

  it("lets the user go back to an earlier step", () => {
    expect(resolveResumeStep(1, planned)).toBe(1);
  });
});

describe("maxReachableStep", () => {
  it("grows with the data", () => {
    expect([none, created, indexed, planned].map(maxReachableStep)).toEqual([1, 2, 5, 6]);
  });
});

describe("parseStepParam", () => {
  it("accepts digits only", () => {
    expect(parseStepParam("4")).toBe(4);
    expect(parseStepParam("4abc")).toBeNull();
    expect(parseStepParam("-1")).toBeNull();
    expect(parseStepParam("")).toBeNull();
    expect(parseStepParam(null)).toBeNull();
  });
});
