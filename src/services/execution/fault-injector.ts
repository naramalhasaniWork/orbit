import type { Page, Route } from "playwright";

// ============================================================
// Types
// ============================================================

export interface FaultConfig {
  networkErrors?: {
    enabled: boolean;
    errorRate: number;
    targetPattern: string;
  };
  slowResponses?: {
    enabled: boolean;
    delayMs: number;
    targetPattern: string;
  };
  serverErrors?: {
    enabled: boolean;
    statusCode: number;
    errorRate: number;
    targetPattern: string;
  };
  missingAssets?: {
    enabled: boolean;
    targetPattern: string;
  };
}

export interface FaultRoute {
  pattern: string;
  type: "network_error" | "slow_response" | "server_error" | "missing_asset";
  config: Record<string, unknown>;
}

export interface FaultStats {
  appliedRoutes: number;
  faultsTriggered: number;
}

// ============================================================
// Pure Functions
// ============================================================

/**
 * Builds an array of FaultRoute descriptors from the given config.
 * Pure function — no side effects, fully testable.
 */
export function buildFaultRoutes(config: FaultConfig): FaultRoute[] {
  const routes: FaultRoute[] = [];

  if (config.networkErrors?.enabled) {
    routes.push({
      pattern: config.networkErrors.targetPattern,
      type: "network_error",
      config: { errorRate: config.networkErrors.errorRate },
    });
  }

  if (config.slowResponses?.enabled) {
    routes.push({
      pattern: config.slowResponses.targetPattern,
      type: "slow_response",
      config: { delayMs: config.slowResponses.delayMs },
    });
  }

  if (config.serverErrors?.enabled) {
    routes.push({
      pattern: config.serverErrors.targetPattern,
      type: "server_error",
      config: {
        statusCode: config.serverErrors.statusCode,
        errorRate: config.serverErrors.errorRate,
      },
    });
  }

  if (config.missingAssets?.enabled) {
    routes.push({
      pattern: config.missingAssets.targetPattern,
      type: "missing_asset",
      config: {},
    });
  }

  return routes;
}

/**
 * Returns a sensible default FaultConfig with all types disabled.
 */
export function getDefaultResilienceConfig(): FaultConfig {
  return {
    networkErrors: {
      enabled: false,
      errorRate: 0.1,
      targetPattern: "**/api/**",
    },
    slowResponses: {
      enabled: false,
      delayMs: 3000,
      targetPattern: "**/api/**",
    },
    serverErrors: {
      enabled: false,
      statusCode: 500,
      errorRate: 0.15,
      targetPattern: "**/api/**",
    },
    missingAssets: {
      enabled: false,
      targetPattern: "**/*.{js,css,png,jpg,svg,woff2}",
    },
  };
}

// ============================================================
// Route Handlers
// ============================================================

function shouldTrigger(errorRate: number): boolean {
  return Math.random() < errorRate;
}

async function handleNetworkError(
  route: Route,
  errorRate: number,
  stats: FaultStats,
): Promise<void> {
  if (shouldTrigger(errorRate)) {
    stats.faultsTriggered++;
    await route.abort("failed");
  } else {
    await route.continue();
  }
}

async function handleSlowResponse(
  route: Route,
  delayMs: number,
  stats: FaultStats,
): Promise<void> {
  stats.faultsTriggered++;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
  await route.continue();
}

async function handleServerError(
  route: Route,
  statusCode: number,
  errorRate: number,
  stats: FaultStats,
): Promise<void> {
  if (shouldTrigger(errorRate)) {
    stats.faultsTriggered++;
    await route.fulfill({
      status: statusCode,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Injected server error",
        _orbit_fault: true,
      }),
    });
  } else {
    await route.continue();
  }
}

async function handleMissingAsset(
  route: Route,
  stats: FaultStats,
): Promise<void> {
  stats.faultsTriggered++;
  await route.abort("blockedbyclient");
}

// ============================================================
// Main Entry Point
// ============================================================

/**
 * Applies fault injection route interceptors to a Playwright page.
 * Each enabled fault type registers a `page.route()` handler that
 * intercepts matching requests and injects the configured fault.
 */
export async function applyFaultInjection(
  page: Page,
  config: FaultConfig,
): Promise<FaultStats> {
  const faultRoutes = buildFaultRoutes(config);
  const stats: FaultStats = { appliedRoutes: 0, faultsTriggered: 0 };

  for (const fr of faultRoutes) {
    switch (fr.type) {
      case "network_error": {
        const errorRate = fr.config.errorRate as number;
        await page.route(fr.pattern, (route) =>
          handleNetworkError(route, errorRate, stats),
        );
        break;
      }
      case "slow_response": {
        const delayMs = fr.config.delayMs as number;
        await page.route(fr.pattern, (route) =>
          handleSlowResponse(route, delayMs, stats),
        );
        break;
      }
      case "server_error": {
        const statusCode = fr.config.statusCode as number;
        const errorRate = fr.config.errorRate as number;
        await page.route(fr.pattern, (route) =>
          handleServerError(route, statusCode, errorRate, stats),
        );
        break;
      }
      case "missing_asset": {
        await page.route(fr.pattern, (route) =>
          handleMissingAsset(route, stats),
        );
        break;
      }
    }
    stats.appliedRoutes++;
  }

  return stats;
}
