import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const reduced = vi.hoisted(() => ({ value: true }));
vi.mock("framer-motion", async (orig) => ({
  ...(await orig<typeof import("framer-motion")>()),
  useReducedMotion: () => reduced.value,
}));

import { RollingNumber } from "@/components/telemetry/rolling-number";

describe("RollingNumber", () => {
  it("renders the final value immediately under reduced motion, with no roll", () => {
    reduced.value = true;
    const html = renderToStaticMarkup(createElement(RollingNumber, { value: 1234 }));
    expect(html).toContain("1,234");
    expect(html).not.toContain("tm-roll");
  });

  it("does not roll on first paint either", () => {
    reduced.value = false;
    const html = renderToStaticMarkup(createElement(RollingNumber, { value: "07/19" }));
    expect(html).toContain("07/19");
    expect(html).toContain("tabular-nums");
    expect(html).not.toContain("tm-roll");
  });
});
