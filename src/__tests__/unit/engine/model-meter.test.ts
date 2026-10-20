import { describe, it, expect } from "vitest";
import { meterModelCall, withModelMeter } from "@/server/ai/model-meter";

describe("model meter", () => {
  it("counts calls and cost made inside the scope and ignores calls outside it", async () => {
    meterModelCall(1);
    const { result, usage } = await withModelMeter(async () => {
      meterModelCall(0.25);
      await new Promise((r) => setTimeout(r, 1));
      meterModelCall(0.5);
      return "done";
    });
    meterModelCall(1);

    expect(result).toBe("done");
    expect(usage).toEqual({ calls: 2, costUsd: 0.75 });
  });

  it("keeps concurrent scopes separate", async () => {
    const run = (n: number) => withModelMeter(async () => {
      for (let i = 0; i < n; i++) {
        await new Promise((r) => setTimeout(r, 1));
        meterModelCall(0.1);
      }
    });
    const [a, b] = await Promise.all([run(3), run(5)]);
    expect(a.usage.calls).toBe(3);
    expect(b.usage.calls).toBe(5);
  });
});
