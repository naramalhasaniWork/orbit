import { describe, it, expect } from "vitest";
import {
  buildFaultRoutes,
  getDefaultResilienceConfig,
} from "@/services/execution/fault-injector";
import type { FaultConfig } from "@/services/execution/fault-injector";

describe("fault-injector", () => {
  describe("buildFaultRoutes", () => {
    it("generates a network_error route when networkErrors is enabled", () => {
      const config: FaultConfig = {
        networkErrors: {
          enabled: true,
          errorRate: 0.2,
          targetPattern: "**/api/**",
        },
      };

      const routes = buildFaultRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0].type).toBe("network_error");
      expect(routes[0].pattern).toBe("**/api/**");
      expect(routes[0].config).toEqual({ errorRate: 0.2 });
    });

    it("generates a slow_response route when slowResponses is enabled", () => {
      const config: FaultConfig = {
        slowResponses: {
          enabled: true,
          delayMs: 5000,
          targetPattern: "**/graphql",
        },
      };

      const routes = buildFaultRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0].type).toBe("slow_response");
      expect(routes[0].pattern).toBe("**/graphql");
      expect(routes[0].config).toEqual({ delayMs: 5000 });
    });

    it("generates a server_error route when serverErrors is enabled", () => {
      const config: FaultConfig = {
        serverErrors: {
          enabled: true,
          statusCode: 503,
          errorRate: 0.3,
          targetPattern: "**/api/v2/**",
        },
      };

      const routes = buildFaultRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0].type).toBe("server_error");
      expect(routes[0].pattern).toBe("**/api/v2/**");
      expect(routes[0].config).toEqual({ statusCode: 503, errorRate: 0.3 });
    });

    it("generates a missing_asset route when missingAssets is enabled", () => {
      const config: FaultConfig = {
        missingAssets: {
          enabled: true,
          targetPattern: "**/*.css",
        },
      };

      const routes = buildFaultRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0].type).toBe("missing_asset");
      expect(routes[0].pattern).toBe("**/*.css");
      expect(routes[0].config).toEqual({});
    });

    it("skips disabled fault types", () => {
      const config: FaultConfig = {
        networkErrors: {
          enabled: false,
          errorRate: 0.5,
          targetPattern: "**/api/**",
        },
        slowResponses: {
          enabled: true,
          delayMs: 1000,
          targetPattern: "**/api/**",
        },
        serverErrors: {
          enabled: false,
          statusCode: 500,
          errorRate: 0.1,
          targetPattern: "**/api/**",
        },
      };

      const routes = buildFaultRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0].type).toBe("slow_response");
    });

    it("generates routes for all enabled types", () => {
      const config: FaultConfig = {
        networkErrors: {
          enabled: true,
          errorRate: 0.1,
          targetPattern: "**/api/**",
        },
        slowResponses: {
          enabled: true,
          delayMs: 2000,
          targetPattern: "**/api/**",
        },
        serverErrors: {
          enabled: true,
          statusCode: 500,
          errorRate: 0.15,
          targetPattern: "**/api/**",
        },
        missingAssets: {
          enabled: true,
          targetPattern: "**/*.js",
        },
      };

      const routes = buildFaultRoutes(config);

      expect(routes).toHaveLength(4);
      const types = routes.map((r) => r.type);
      expect(types).toContain("network_error");
      expect(types).toContain("slow_response");
      expect(types).toContain("server_error");
      expect(types).toContain("missing_asset");
    });

    it("returns empty array for empty config", () => {
      const routes = buildFaultRoutes({});
      expect(routes).toHaveLength(0);
    });

    it("returns empty array when all types are disabled", () => {
      const config: FaultConfig = {
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
          targetPattern: "**/*.js",
        },
      };

      const routes = buildFaultRoutes(config);
      expect(routes).toHaveLength(0);
    });

    it("preserves custom target patterns", () => {
      const config: FaultConfig = {
        networkErrors: {
          enabled: true,
          errorRate: 0.5,
          targetPattern: "https://api.example.com/v1/**",
        },
        slowResponses: {
          enabled: true,
          delayMs: 100,
          targetPattern: "**/graphql",
        },
      };

      const routes = buildFaultRoutes(config);

      expect(routes[0].pattern).toBe("https://api.example.com/v1/**");
      expect(routes[1].pattern).toBe("**/graphql");
    });

    it("handles errorRate of 0 (never triggers)", () => {
      const config: FaultConfig = {
        networkErrors: {
          enabled: true,
          errorRate: 0,
          targetPattern: "**/api/**",
        },
      };

      const routes = buildFaultRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0].config.errorRate).toBe(0);
    });

    it("handles errorRate of 1 (always triggers)", () => {
      const config: FaultConfig = {
        networkErrors: {
          enabled: true,
          errorRate: 1,
          targetPattern: "**/api/**",
        },
      };

      const routes = buildFaultRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0].config.errorRate).toBe(1);
    });

    it("handles extreme delayMs values", () => {
      const config: FaultConfig = {
        slowResponses: {
          enabled: true,
          delayMs: 0,
          targetPattern: "**/api/**",
        },
      };

      const routes = buildFaultRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0].config.delayMs).toBe(0);
    });
  });

  describe("getDefaultResilienceConfig", () => {
    it("returns a config with all types disabled", () => {
      const config = getDefaultResilienceConfig();

      expect(config.networkErrors?.enabled).toBe(false);
      expect(config.slowResponses?.enabled).toBe(false);
      expect(config.serverErrors?.enabled).toBe(false);
      expect(config.missingAssets?.enabled).toBe(false);
    });

    it("sets default errorRate for networkErrors", () => {
      const config = getDefaultResilienceConfig();
      expect(config.networkErrors?.errorRate).toBe(0.1);
    });

    it("sets default delayMs for slowResponses", () => {
      const config = getDefaultResilienceConfig();
      expect(config.slowResponses?.delayMs).toBe(3000);
    });

    it("sets default statusCode and errorRate for serverErrors", () => {
      const config = getDefaultResilienceConfig();
      expect(config.serverErrors?.statusCode).toBe(500);
      expect(config.serverErrors?.errorRate).toBe(0.15);
    });

    it("uses API pattern as default target for network faults", () => {
      const config = getDefaultResilienceConfig();
      expect(config.networkErrors?.targetPattern).toBe("**/api/**");
      expect(config.slowResponses?.targetPattern).toBe("**/api/**");
      expect(config.serverErrors?.targetPattern).toBe("**/api/**");
    });

    it("produces zero routes when passed to buildFaultRoutes", () => {
      const config = getDefaultResilienceConfig();
      const routes = buildFaultRoutes(config);
      expect(routes).toHaveLength(0);
    });

    it("produces routes for all types when all are enabled", () => {
      const config = getDefaultResilienceConfig();
      if (config.networkErrors) config.networkErrors.enabled = true;
      if (config.slowResponses) config.slowResponses.enabled = true;
      if (config.serverErrors) config.serverErrors.enabled = true;
      if (config.missingAssets) config.missingAssets.enabled = true;

      const routes = buildFaultRoutes(config);
      expect(routes).toHaveLength(4);
    });
  });
});
