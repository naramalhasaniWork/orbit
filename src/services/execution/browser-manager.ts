import type { Browser, BrowserContext, Page } from "playwright";

// ============================================================
// Types
// ============================================================

interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  isRemote: boolean;
}

interface LaunchOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  locale?: string;
  timezoneId?: string;
  recordVideo?: boolean;
  storagePath?: string;
}

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const DEFAULT_TIMEOUT = 30_000;

export const VIEWPORT_PRESETS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
} as const;

export type ViewportName = keyof typeof VIEWPORT_PRESETS;

// ============================================================
// Browser Lifecycle
// ============================================================

export async function launchBrowser(
  options: LaunchOptions = {}
): Promise<BrowserInstance> {
  const { chromium } = await import("playwright");

  const wsEndpoint = process.env.PLAYWRIGHT_WS_ENDPOINT;

  const contextOptions: Record<string, unknown> = {
    viewport: options.viewport ?? DEFAULT_VIEWPORT,
    locale: options.locale ?? "en-US",
    timezoneId: options.timezoneId ?? "America/New_York",
    ignoreHTTPSErrors: true,
  };

  if (options.recordVideo && options.storagePath) {
    contextOptions.recordVideo = {
      dir: options.storagePath,
      size: options.viewport ?? DEFAULT_VIEWPORT,
    };
  }

  let browser: Browser;
  let isRemote = false;

  if (wsEndpoint) {
    const startMs = Date.now();
    const usePlaywrightProtocol = wsEndpoint.includes("/playwright");

    if (usePlaywrightProtocol) {
      console.log(`[Browser] Connecting via Playwright protocol to ${wsEndpoint.split("?")[0]}...`);
      browser = await chromium.connect(wsEndpoint, {
        timeout: DEFAULT_TIMEOUT,
      });
    } else {
      console.log(`[Browser] Connecting via CDP to ${wsEndpoint.split("?")[0]}...`);
      browser = await chromium.connectOverCDP(wsEndpoint, {
        timeout: DEFAULT_TIMEOUT,
      });
    }

    console.log(`[Browser] Connected in ${Date.now() - startMs}ms`);
    isRemote = true;
  } else {
    console.log("[Browser] Launching local chromium...");
    browser = await chromium.launch({
      headless: options.headless ?? true,
    });
    console.log("[Browser] Local browser launched");
  }

  const context = await browser.newContext(contextOptions);
  context.setDefaultTimeout(DEFAULT_TIMEOUT);

  const page = await context.newPage();

  return { browser, context, page, isRemote };
}

export async function closeBrowser(instance: BrowserInstance): Promise<void> {
  try {
    await instance.page.close();
  } catch {
    // Page may already be closed
  }

  try {
    await instance.context.close();
  } catch {
    // Context may already be closed
  }

  try {
    if (instance.isRemote) {
      // For remote CDP connections, disconnect instead of closing the shared browser
      instance.browser.close();
    } else {
      await instance.browser.close();
    }
  } catch {
    // Browser may already be closed
  }
}

// ============================================================
// Page State Extraction
// ============================================================

interface InteractiveElement {
  tag: string;
  text?: string;
  selector: string;
  type?: string;
  role?: string;
}

export interface PageState {
  url: string;
  title: string;
  visibleText: string;
  interactiveElements: InteractiveElement[];
}

export async function getPageState(page: Page): Promise<PageState> {
  const url = page.url();
  const title = await page.title();

  const visibleText = await page.evaluate(() => {
    return document.body?.innerText?.slice(0, 2000) ?? "";
  });

  const interactiveElements = await page.evaluate(() => {
    const selectors = [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[role='link']",
      "[role='tab']",
      "[role='menuitem']",
      "[onclick]",
    ];

    const elements: Array<{
      tag: string;
      text?: string;
      selector: string;
      type?: string;
      role?: string;
    }> = [];

    const seen = new Set<Element>();

    for (const sel of selectors) {
      const nodes = Array.from(document.querySelectorAll(sel));
      for (const el of nodes) {
        if (seen.has(el)) continue;
        seen.add(el);

        const htmlEl = el as HTMLElement;
        const tag = htmlEl.tagName.toLowerCase();
        const text = (htmlEl.innerText || htmlEl.getAttribute("aria-label") || "")
          .trim()
          .slice(0, 100);
        const type = htmlEl.getAttribute("type") ?? undefined;
        const role = htmlEl.getAttribute("role") ?? undefined;

        // Build a selector: prefer id, then data-testid, then a css path
        let selector = "";
        if (htmlEl.id) {
          selector = `#${htmlEl.id}`;
        } else if (htmlEl.getAttribute("data-testid")) {
          selector = `[data-testid="${htmlEl.getAttribute("data-testid")}"]`;
        } else if (htmlEl.getAttribute("name")) {
          selector = `${tag}[name="${htmlEl.getAttribute("name")}"]`;
        } else if (text && tag !== "input") {
          selector = `${tag}:has-text("${text.slice(0, 40)}")`;
        } else {
          // Fallback: nth-of-type
          const parent = htmlEl.parentElement;
          if (parent) {
            const siblings = Array.from(parent.querySelectorAll(`:scope > ${tag}`));
            const idx = siblings.indexOf(htmlEl);
            selector = `${tag}:nth-of-type(${idx + 1})`;
          }
        }

        elements.push({ tag, text: text || undefined, selector, type, role });
        if (elements.length >= 50) break;
      }
      if (elements.length >= 50) break;
    }

    return elements;
  });

  return { url, title, visibleText, interactiveElements };
}

// ============================================================
// Viewport Management
// ============================================================

export async function setViewport(
  page: Page,
  viewport: ViewportName | { width: number; height: number }
): Promise<void> {
  const size = typeof viewport === "string" ? VIEWPORT_PRESETS[viewport] : viewport;
  await page.setViewportSize(size);
}

export type { BrowserInstance, LaunchOptions };
