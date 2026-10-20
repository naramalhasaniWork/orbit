import { describe, it, expect } from "vitest";
import { meterModelCall, withModelMeter } from "@/server/engine/model-meter";

const call = { model: "unknown-model", inputTokens: 100, outputTokens: 10 };

describe("model meter", () => {
  it("counts calls made inside the scope and ignores calls outside it", async () => {
    meterModelCall(call);
    const { result, usage } = await withModelMeter(async () => {
      meterModelCall(call);
      await new Promise((r) => setTimeout(r, 1));
      meterModelCall(call);
      return "done";
    });
    meterModelCall(call);

    expect(result).toBe("done");
    expect(usage.calls).toBe(2);
  });

  it("keeps concurrent scopes separate", async () => {
    const run = (n: number) => withModelMeter(async () => {
      for (let i = 0; i < n; i++) {
        await new Promise((r) => setTimeout(r, 1));
        meterModelCall(call);
      }
    });
    const [a, b] = await Promise.all([run(3), run(5)]);
    expect(a.usage.calls).toBe(3);
    expect(b.usage.calls).toBe(5);
  });

  it("prices known models", async () => {
    const { MODELS } = await import("@/lib/ai");
    const { usage } = await withModelMeter(async () => {
      meterModelCall({ model: MODELS.SONNET, inputTokens: 10_000, outputTokens: 1_000 });
    });
    expect(usage.costUsd).toBeGreaterThan(0);
  });
});
