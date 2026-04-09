import { describe, it, expect } from "vitest";
import {
  checkConsoleInvariant,
  checkPageLoadInvariant,
  checkNetworkInvariant,
  checkBrokenImagesInvariant,
  checkAccessibilityInvariant,
  runAllInvariants,
} from "@/services/execution/invariant-checker";
import type { PageState } from "@/services/execution/invariant-checker";

// ============================================================
// Console Invariant
// ============================================================

describe("checkConsoleInvariant", () => {
  it("detects console errors", () => {
    const result = checkConsoleInvariant([
      { type: "error", text: "Uncaught TypeError: cannot read property" },
    ]);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].invariantType).toBe("console_error");
    expect(result.violations[0].severity).toBe("error");
  });

  it("ignores console warnings", () => {
    const result = checkConsoleInvariant([
      { type: "warning", text: "Deprecated API usage" },
    ]);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("passes on clean console", () => {
    const result = checkConsoleInvariant([]);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.checksRun).toBe(1);
  });

  it("truncates long error text to 200 characters", () => {
    const longText = "A".repeat(300);
    const result = checkConsoleInvariant([{ type: "error", text: longText }]);

    expect(result.violations[0].actual?.length).toBeLessThanOrEqual(204); // 200 + "..."
  });

  it("detects multiple console errors", () => {
    const result = checkConsoleInvariant([
      { type: "error", text: "Error 1" },
      { type: "log", text: "Normal log" },
      { type: "error", text: "Error 2" },
    ]);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});

// ============================================================
// Page Load Invariant
// ============================================================

describe("checkPageLoadInvariant", () => {
  it("fails when load time exceeds default threshold", () => {
    const result = checkPageLoadInvariant(6000);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].invariantType).toBe("page_load_time");
    expect(result.violations[0].severity).toBe("warning");
  });

  it("passes when load time is under default threshold", () => {
    const result = checkPageLoadInvariant(3000);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("respects custom threshold", () => {
    const result = checkPageLoadInvariant(1500, 1000);

    expect(result.passed).toBe(false);
    expect(result.violations[0].expected).toBe("<= 1000ms");
    expect(result.violations[0].actual).toBe("1500ms");
  });

  it("passes when exactly at threshold", () => {
    const result = checkPageLoadInvariant(5000);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ============================================================
// Network Invariant
// ============================================================

describe("checkNetworkInvariant", () => {
  it("detects 500 server errors", () => {
    const result = checkNetworkInvariant([
      { url: "https://api.example.com/data", status: 500 },
    ]);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].invariantType).toBe("server_error");
    expect(result.violations[0].severity).toBe("error");
  });

  it("detects 502 and 503 errors", () => {
    const result = checkNetworkInvariant([
      { url: "https://api.example.com/a", status: 502 },
      { url: "https://api.example.com/b", status: 503 },
    ]);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });

  it("ignores 4xx client errors", () => {
    const result = checkNetworkInvariant([
      { url: "https://api.example.com/missing", status: 404 },
      { url: "https://api.example.com/forbidden", status: 403 },
    ]);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("passes on clean responses", () => {
    const result = checkNetworkInvariant([
      { url: "https://example.com/", status: 200 },
      { url: "https://example.com/api", status: 201 },
    ]);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ============================================================
// Broken Images Invariant
// ============================================================

describe("checkBrokenImagesInvariant", () => {
  it("detects broken images", () => {
    const result = checkBrokenImagesInvariant([
      { src: "https://example.com/broken.png", loaded: false },
    ]);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].invariantType).toBe("broken_image");
    expect(result.violations[0].severity).toBe("warning");
  });

  it("passes when all images loaded", () => {
    const result = checkBrokenImagesInvariant([
      { src: "https://example.com/logo.png", loaded: true },
      { src: "https://example.com/hero.jpg", loaded: true },
    ]);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("passes with no images", () => {
    const result = checkBrokenImagesInvariant([]);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("detects multiple broken images", () => {
    const result = checkBrokenImagesInvariant([
      { src: "https://example.com/a.png", loaded: true },
      { src: "https://example.com/b.png", loaded: false },
      { src: "https://example.com/c.png", loaded: false },
    ]);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});

// ============================================================
// Accessibility Invariant
// ============================================================

describe("checkAccessibilityInvariant", () => {
  it("detects missing title", () => {
    const result = checkAccessibilityInvariant("", true);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].invariantType).toBe("missing_title");
    expect(result.violations[0].severity).toBe("warning");
  });

  it("detects whitespace-only title", () => {
    const result = checkAccessibilityInvariant("   ", true);

    expect(result.passed).toBe(false);
    expect(result.violations[0].invariantType).toBe("missing_title");
  });

  it("detects missing h1", () => {
    const result = checkAccessibilityInvariant("My Page", false);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].invariantType).toBe("missing_h1");
  });

  it("detects both missing title and h1", () => {
    const result = checkAccessibilityInvariant("", false);

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });

  it("passes when both title and h1 present", () => {
    const result = checkAccessibilityInvariant("My Page", true);

    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ============================================================
// runAllInvariants
// ============================================================

describe("runAllInvariants", () => {
  it("aggregates violations from all checkers", () => {
    const state: PageState = {
      consoleMessages: [{ type: "error", text: "fail" }],
      responses: [{ url: "https://api.test.com/x", status: 500 }],
      images: [{ src: "https://test.com/broken.png", loaded: false }],
      loadTimeMs: 6000,
      title: "",
      hasH1: false,
    };

    const result = runAllInvariants(state);

    expect(result.passed).toBe(false);
    expect(result.checksRun).toBe(5);
    // 1 console + 1 load + 1 network + 1 image + 2 a11y = 6
    expect(result.violations).toHaveLength(6);
  });

  it("passes when all checks are clean", () => {
    const state: PageState = {
      consoleMessages: [{ type: "log", text: "info" }],
      responses: [{ url: "https://api.test.com/ok", status: 200 }],
      images: [{ src: "https://test.com/ok.png", loaded: true }],
      loadTimeMs: 1000,
      title: "Test Page",
      hasH1: true,
    };

    const result = runAllInvariants(state);

    expect(result.passed).toBe(true);
    expect(result.checksRun).toBe(5);
    expect(result.violations).toHaveLength(0);
  });

  it("handles empty page state", () => {
    const state: PageState = {
      consoleMessages: [],
      responses: [],
      images: [],
      loadTimeMs: 500,
      title: "Page",
      hasH1: true,
    };

    const result = runAllInvariants(state);

    expect(result.passed).toBe(true);
    expect(result.checksRun).toBe(5);
    expect(result.violations).toHaveLength(0);
  });

  it("includes mixed severities", () => {
    const state: PageState = {
      consoleMessages: [{ type: "error", text: "JS error" }],
      responses: [],
      images: [{ src: "https://test.com/bad.png", loaded: false }],
      loadTimeMs: 1000,
      title: "Page",
      hasH1: true,
    };

    const result = runAllInvariants(state);

    expect(result.passed).toBe(false);
    const severities = result.violations.map((v) => v.severity);
    expect(severities).toContain("error");
    expect(severities).toContain("warning");
  });
});
