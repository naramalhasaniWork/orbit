import { describe, it, expect, vi, beforeEach } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { systemConfig: { findMany } } }));

import {
  getFlag,
  getSystemConfig,
  invalidateSystemConfigCache,
  parseSystemConfig,
} from "@/lib/system-config";

describe("parseSystemConfig", () => {
  it("falls back to defaults and ignores unknown or malformed values", () => {
    const config = parseSystemConfig([
      { key: "maintenance_mode", value: "yes" },
      { key: "system_announcement", value: "  Deploy at 5pm  " },
      { key: "feature_flags", value: { visual_regression: true, self_healing: "no", plugin_marketplace: true } },
      { key: "rate_limits", value: { runs_per_hour: 1 } },
    ]);
    expect(config).toEqual({
      maintenanceMode: false,
      maintenanceMessage: "",
      announcement: "Deploy at 5pm",
      featureFlags: {
        self_healing: true,
        ai_suggestions: true,
        parallel_execution: true,
        visual_regression: true,
      },
    });
  });
});

describe("getSystemConfig", () => {
  beforeEach(() => {
    invalidateSystemConfigCache();
    findMany.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("caches reads until invalidated", async () => {
    findMany.mockResolvedValue([{ key: "maintenance_mode", value: true }]);
    expect((await getSystemConfig()).maintenanceMode).toBe(true);
    await getSystemConfig();
    expect(findMany).toHaveBeenCalledTimes(1);

    findMany.mockResolvedValue([{ key: "maintenance_mode", value: false }]);
    invalidateSystemConfigCache();
    expect((await getSystemConfig()).maintenanceMode).toBe(false);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("uses defaults when the database is unavailable", async () => {
    findMany.mockRejectedValue(new Error("connection refused"));
    expect(await getFlag("self_healing")).toBe(true);
    expect(await getFlag("visual_regression")).toBe(false);
    expect((await getSystemConfig()).maintenanceMode).toBe(false);
  });
});
