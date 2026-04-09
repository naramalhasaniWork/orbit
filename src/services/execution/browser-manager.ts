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

interface StorageState {
  cookies: Array<Record<string, unknown>>;
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
}

interface LaunchOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  locale?: string;
  timezoneId?: string;
  recordVideo?: boolean;
  storagePath?: string;
  storageState?: StorageState;
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

  if (options.storageState) {
    contextOptions.storageState = options.storageState;
  }

  let browser: Browser;
  let isRemote = false;

  const CONNECT_MAX_RETRIES = 3;
  const CONNECT_BASE_DELAY_MS = 2000;

  if (wsEndpoint) {
    const startMs = Date.now();
    const usePlaywrightProtocol = wsEndpoint.includes("/playwright");
    const protocol = usePlaywrightProtocol ? "Playwright" : "CDP";

    for (let attempt = 1; attempt <= CONNECT_MAX_RETRIES; attempt++) {
      try {
        console.log(`[Browser] Connecting via ${protocol} to ${wsEndpoint.split("?")[0]} (attempt ${attempt}/${CONNECT_MAX_RETRIES})...`);
        if (usePlaywrightProtocol) {
          browser = await chromium.connect(wsEndpoint, { timeout: DEFAULT_TIMEOUT });
        } else {
          browser = await chromium.connectOverCDP(wsEndpoint, { timeout: DEFAULT_TIMEOUT });
        }
        console.log(`[Browser] Connected in ${Date.now() - startMs}ms`);
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === CONNECT_MAX_RETRIES) {
          console.error(`[Browser] Connection failed after ${CONNECT_MAX_RETRIES} attempts: ${msg}`);
          throw err;
        }
        const delay = CONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[Browser] Connection attempt ${attempt} failed (${msg}) — retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // TypeScript: browser is guaranteed assigned by the loop (throws on all failures)
    browser = browser!;
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
  } catch (err) {
    console.warn("[Browser] Page close failed:", err instanceof Error ? err.message : String(err));
  }

  try {
    await instance.context.close();
  } catch (err) {
    console.warn("[Browser] Context close failed:", err instanceof Error ? err.message : String(err));
  }

  try {
    if (instance.isRemote) {
      // For remote CDP connections, disconnect instead of closing the shared browser
      instance.browser.close();
    } else {
      await instance.browser.close();
    }
  } catch (err) {
    console.warn("[Browser] Browser close failed:", err instanceof Error ? err.message : String(err));
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

export async function captureStorageState(context: BrowserContext): Promise<StorageState> {
  return context.storageState() as Promise<StorageState>;
}

export type { BrowserInstance, LaunchOptions, StorageState };
