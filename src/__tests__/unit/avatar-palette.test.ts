import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AVATAR_TONES } from "@/lib/avatar/identity";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const lightBlock = css.slice(css.indexOf(":root {"), css.indexOf(".dark {"));
const darkBlock = css.slice(css.indexOf(".dark {"), css.indexOf("/* Semantic layer"));

function token(block: string, name: string): [number, number, number] {
  const match = block.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`));
  if (!match) throw new Error(`missing --${name}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hsl: [number, number, number]): number {
  const [r, g, b] = hslToRgb(hsl).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("avatar palette", () => {
  for (const [mode, block] of [["light", lightBlock], ["dark", darkBlock]] as const) {
    for (const tone of AVATAR_TONES) {
      it(`${tone} initials meet WCAG AA in ${mode} mode`, () => {
        const ratio = contrast(token(block, `tm-avatar-${tone}-bg`), token(block, `tm-avatar-${tone}-fg`));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      it(`${tone} has no blue, magenta or purple in ${mode} mode`, () => {
        for (const part of ["bg", "fg"]) {
          const [hue, sat] = token(block, `tm-avatar-${tone}-${part}`);
          // Near-neutral greys (graphite) may lean cool; anything saturated must stay warm or green.
          if (sat > 12) expect(hue < 190 || hue > 345).toBe(true);
        }
      });
    }
  }
});
