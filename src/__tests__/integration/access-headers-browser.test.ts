import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type IncomingHttpHeaders, type Server } from "http";
import { existsSync } from "fs";
import type { AddressInfo } from "net";
import { chromium, type Browser } from "playwright";
import { installAccessHeaders } from "@/services/execution/access-headers";

// Real-browser check that the Cloudflare Access token never follows a redirect off the
// environment's origin. Skipped where no Playwright Chromium is installed; set
// PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a different local Chromium build.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const hasChromium = (() => {
  try {
    return existsSync(executablePath ?? chromium.executablePath());
  } catch {
    return false;
  }
})();

const headers = { "CF-Access-Client-Id": "id.access", "CF-Access-Client-Secret": "s3cret" };

function listen(handler: (path: string, headers: IncomingHttpHeaders, res: import("http").ServerResponse) => void) {
  const server = createServer((req, res) => handler(req.url ?? "/", req.headers, res));
  return new Promise<{ server: Server; origin: string }>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }))
  );
}

describe.skipIf(!hasChromium)("Access headers in a real browser", () => {
  let browser: Browser;
  let preview: { server: Server; origin: string };
  let thirdParty: { server: Server; origin: string };
  const seen: Record<string, IncomingHttpHeaders[]> = { preview: [], thirdParty: [] };

  beforeAll(async () => {
    thirdParty = await listen((_path, h, res) => {
      seen.thirdParty.push(h);
      res.writeHead(200, { "content-type": "text/html" }).end("<p>elsewhere</p>");
    });
    preview = await listen((path, h, res) => {
      seen.preview.push(h);
      if (path === "/") res.writeHead(302, { location: `${thirdParty.origin}/landing` }).end();
      else res.writeHead(200, { "content-type": "text/html" }).end("<p>ok</p>");
    });
    browser = await chromium.launch({ headless: true, executablePath });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    preview?.server.close();
    thirdParty?.server.close();
  });

  it("sends the token to the preview origin but not to the host it redirects to", async () => {
    const context = await browser.newContext();
    await installAccessHeaders(context, `${preview.origin}/`, headers);
    const page = await context.newPage();

    await page.goto(`${preview.origin}/`);

    expect(page.url()).toBe(`${thirdParty.origin}/landing`);
    expect(seen.preview[0]["cf-access-client-id"]).toBe("id.access");
    expect(seen.thirdParty.length).toBeGreaterThan(0);
    for (const h of seen.thirdParty) {
      expect(h["cf-access-client-id"]).toBeUndefined();
      expect(h["cf-access-client-secret"]).toBeUndefined();
    }
    await context.close();
  }, 60_000);
});
