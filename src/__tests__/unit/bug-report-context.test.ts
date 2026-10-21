import { describe, it, expect } from "vitest";
import { redactSecrets, sanitizeClientContext, sanitizePath } from "@/lib/bug-reports/context";
import { sniffScreenshotType } from "@/lib/bug-reports/screenshot";
import { recentConsoleErrors, recordConsoleError } from "@/lib/bug-reports/console-buffer";

describe("bug report context", () => {
  it("keeps the path only, and redacts opaque tokens inside it", () => {
    expect(sanitizePath("https://app.orbit.dev/dashboard/runs?project=p#x")).toBe("/dashboard/runs");
    expect(sanitizePath("/invite/a8Fq39dKs02LmZp7Qx1RtY6vWn4Bc5Jh")).toBe("/invite/[redacted]");
    expect(sanitizePath("/dashboard/runs/6f1c1e1a-1b2c-4d3e-8f90-123456789abc")).toBe(
      "/dashboard/runs/6f1c1e1a-1b2c-4d3e-8f90-123456789abc"
    );
    expect(sanitizePath(42)).toBe("/");
  });

  it("redacts credentials but leaves ordinary error text readable", () => {
    expect(redactSecrets("GET /api/x failed with Bearer abc.def-123")).toBe("GET /api/x failed with Bearer [redacted]");
    expect(redactSecrets("key sk-ant-api03-aaaaaaaaaaaaaaaa leaked")).toBe("key [redacted] leaked");
    expect(redactSecrets("ghp_1234567890abcdef1234")).toBe("[redacted]");
    expect(redactSecrets('{"password":"hunter2"}')).toBe('{"password":"[redacted]"}');
    expect(redactSecrets("TypeError: Cannot read properties of undefined (reading 'map')")).toBe(
      "TypeError: Cannot read properties of undefined (reading 'map')"
    );
  });

  it("caps console errors at the last 20 and drops non-strings", () => {
    const errors = Array.from({ length: 30 }, (_, i) => `e${i}`);
    const out = sanitizeClientContext({ consoleErrors: [...errors, 7, null] });
    expect(out.consoleErrors).toHaveLength(20);
    expect(out.consoleErrors[0]).toBe("e10");
  });

  it("drops a malformed viewport", () => {
    expect(sanitizeClientContext({ viewport: { width: "wide", height: 900 } }).viewport).toBeNull();
    expect(sanitizeClientContext({ viewport: { width: 390.4, height: 844 } }).viewport).toEqual({ width: 390, height: 844 });
  });
});

describe("console ring buffer", () => {
  it("keeps the 20 most recent errors, redacted", () => {
    for (let i = 0; i < 25; i++) recordConsoleError(`boom ${i}`, new Error("token=abc"));
    const recent = recentConsoleErrors();
    expect(recent).toHaveLength(20);
    expect(recent[19]).toContain("boom 24");
    expect(recent.join("\n")).not.toContain("token=abc");
  });
});

describe("screenshot sniffing", () => {
  it("recognises PNG, JPEG and WebP by their magic bytes only", () => {
    expect(sniffScreenshotType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffScreenshotType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffScreenshotType(webp)).toBe("image/webp");
    expect(sniffScreenshotType(new TextEncoder().encode("RIFF\0\0\0\0WAVE"))).toBeNull();
    expect(sniffScreenshotType(new TextEncoder().encode("<svg/>"))).toBeNull();
  });
});
