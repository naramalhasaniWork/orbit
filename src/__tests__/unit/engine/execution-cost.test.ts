import { describe, it, expect } from "vitest";
import { summarizeExecutionCost } from "@/server/engine/metrics/execution-cost";

const since = new Date("2026-10-24T00:00:00Z");

describe("summarizeExecutionCost", () => {
  it("reports calls and $ per 100 executions by mode, plus the replay share", () => {
    const report = summarizeExecutionCost([
      { executionMode: "agent", _count: { _all: 20 }, _sum: { modelCalls: 240, modelCostUsd: "2.4" } },
      { executionMode: "replay", _count: { _all: 75 }, _sum: { modelCalls: 0, modelCostUsd: "0" } },
      { executionMode: "replay_healed", _count: { _all: 5 }, _sum: { modelCalls: 20, modelCostUsd: "0.2" } },
    ], since, 2.7);

    expect(report.byMode).toEqual([
      { mode: "agent", executions: 20, modelCalls: 240, costUsd: 2.4, callsPer100: 1200, costPer100Usd: 12 },
      { mode: "replay", executions: 75, modelCalls: 0, costUsd: 0, callsPer100: 0, costPer100Usd: 0 },
      { mode: "replay_healed", executions: 5, modelCalls: 20, costUsd: 0.2, callsPer100: 400, costPer100Usd: 4 },
    ]);
    expect(report.total).toEqual({
      mode: "all", executions: 100, modelCalls: 260, costUsd: 2.6, callsPer100: 260, costPer100Usd: 2.6,
    });
    expect(report.replayShare).toBe(0.8);
    expect(report.executorTokenUsageUsd).toBe(2.7);
    expect(report.since).toBe("2026-10-24T00:00:00.000Z");
  });

  it("returns zeros, not NaN, for an empty window", () => {
    const report = summarizeExecutionCost([], since, 0);
    expect(report.total).toMatchObject({ executions: 0, callsPer100: 0, costPer100Usd: 0 });
    expect(report.replayShare).toBe(0);
  });
});
