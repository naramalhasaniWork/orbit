import { describe, it, expect } from "vitest";
import { resolveBadgeStatus, type HealthResponse } from "@/lib/health/badge-status";

const ok: HealthResponse = { status: "ok", checks: { database: "ok", redis: "ok" }, workers: "ok" };

describe("resolveBadgeStatus", () => {
  it("shows Workers offline when Redis is down, even if the project is healthy", () => {
    const status = resolveBadgeStatus(
      { status: "unhealthy", checks: { database: "ok", redis: "fail" }, workers: "unknown" },
      "healthy"
    );
    expect(status).toMatchObject({ tone: "failing", label: "Workers offline" });
    expect(status?.detail).toContain("Redis is not reachable");
  });

  it("shows Workers offline when no worker process is consuming jobs", () => {
    expect(resolveBadgeStatus({ ...ok, workers: "none" }, "healthy")).toMatchObject({
      tone: "degraded",
      label: "Workers offline",
    });
  });

  it("prefers database outage over everything", () => {
    expect(
      resolveBadgeStatus({ status: "unhealthy", checks: { database: "fail", redis: "fail" } }, "healthy")
    ).toMatchObject({ label: "Database offline" });
  });

  it("falls back to project health when infrastructure is fine", () => {
    expect(resolveBadgeStatus(ok, "failing")).toMatchObject({ tone: "failing", label: "Failing" });
  });

  it("claims nothing when there is no project and no outage", () => {
    expect(resolveBadgeStatus(ok, undefined)).toBeNull();
    expect(resolveBadgeStatus(undefined, undefined)).toBeNull();
  });
});
