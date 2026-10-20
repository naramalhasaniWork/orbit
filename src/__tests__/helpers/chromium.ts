import { existsSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { chromium } from "playwright";

/**
 * A Chromium the real-browser tests can launch: PLAYWRIGHT_CHROMIUM_EXECUTABLE, then
 * Playwright's own build, then the newest headless shell in the local Playwright cache
 * (the installed build often differs from the one the pinned Playwright expects).
 * Null when none exists, so suites can skip.
 */
export function findChromium(): string | null {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (override && existsSync(override)) return override;
  try {
    const bundled = chromium.executablePath();
    if (existsSync(bundled)) return bundled;
  } catch {
    // Playwright throws when its expected build is not installed
  }
  const roots = [join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse();
    for (const dir of dirs) {
      for (const sub of readdirSync(join(root, dir))) {
        const binary = join(root, dir, sub, "chrome-headless-shell");
        if (existsSync(binary)) return binary;
      }
    }
  }
  return null;
}
