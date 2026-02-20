import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

// ============================================================
// orbit.config.ts Parser & Validator
// ============================================================

interface OrbitScopeConfig {
  include: string[];
  exclude: string[];
  critical: string[];
}

interface OrbitCoverageConfig {
  target: number;
  criticalTarget: number;
}

interface OrbitExecutionConfig {
  mode: "autonomous" | "human-in-loop" | "hybrid";
  flakinessTolerance: number;
  maxParallelBrowsers: number;
  maxRunDurationMs: number;
  failureThreshold: number;
}

interface OrbitScheduleConfig {
  cron: string;
  mode: "full" | "smoke" | "regression";
  name: string;
}

interface OrbitAuthConfig {
  strategy: string;
  testUser: {
    email: string;
    passwordSecretKey: string;
  };
  loginUrl: string;
}

export interface OrbitConfig {
  scope: OrbitScopeConfig;
  coverage: OrbitCoverageConfig;
  execution: OrbitExecutionConfig;
  schedules: OrbitScheduleConfig[];
  auth: OrbitAuthConfig | null;
  environments: Record<string, { url: string; teardownHookUrl?: string }>;
}

const DEFAULT_CONFIG: OrbitConfig = {
  scope: {
    include: ["app/**", "src/**"],
    exclude: [],
    critical: [],
  },
  coverage: {
    target: 80,
    criticalTarget: 100,
  },
  execution: {
    mode: "autonomous",
    flakinessTolerance: 3,
    maxParallelBrowsers: 5,
    maxRunDurationMs: 600_000,
    failureThreshold: 50,
  },
  schedules: [],
  auth: null,
  environments: {},
};

interface ConfigValidationError {
  field: string;
  message: string;
}

export function validateConfig(
  raw: Record<string, unknown>
): { valid: boolean; errors: ConfigValidationError[]; config: OrbitConfig } {
  const errors: ConfigValidationError[] = [];
  const config = { ...DEFAULT_CONFIG };

  // Validate scope
  if (raw.scope && typeof raw.scope === "object") {
    const scope = raw.scope as Record<string, unknown>;
    if (Array.isArray(scope.include)) {
      config.scope.include = scope.include.filter(
        (s): s is string => typeof s === "string"
      );
    }
    if (Array.isArray(scope.exclude)) {
      config.scope.exclude = scope.exclude.filter(
        (s): s is string => typeof s === "string"
      );
    }
    if (Array.isArray(scope.critical)) {
      config.scope.critical = scope.critical.filter(
        (s): s is string => typeof s === "string"
      );
    }
  }

  // Validate coverage
  if (raw.coverage && typeof raw.coverage === "object") {
    const cov = raw.coverage as Record<string, unknown>;
    if (typeof cov.target === "number") {
      if (cov.target < 0 || cov.target > 100) {
        errors.push({ field: "coverage.target", message: "Must be 0-100" });
      } else {
        config.coverage.target = cov.target;
      }
    }
    if (typeof cov.criticalTarget === "number") {
      if (cov.criticalTarget < 0 || cov.criticalTarget > 100) {
        errors.push({ field: "coverage.criticalTarget", message: "Must be 0-100" });
      } else {
        config.coverage.criticalTarget = cov.criticalTarget;
      }
    }
  }

  // Validate execution
  if (raw.execution && typeof raw.execution === "object") {
    const exec = raw.execution as Record<string, unknown>;
    const validModes = new Set(["autonomous", "human-in-loop", "hybrid"]);
    if (typeof exec.mode === "string" && validModes.has(exec.mode)) {
      config.execution.mode = exec.mode as OrbitExecutionConfig["mode"];
    } else if (exec.mode !== undefined) {
      errors.push({ field: "execution.mode", message: "Must be autonomous, human-in-loop, or hybrid" });
    }
    if (typeof exec.flakinessTolerance === "number") {
      config.execution.flakinessTolerance = Math.max(0, Math.min(10, Math.round(exec.flakinessTolerance)));
    }
    if (typeof exec.maxParallelBrowsers === "number") {
      config.execution.maxParallelBrowsers = Math.max(1, Math.min(50, Math.round(exec.maxParallelBrowsers)));
    }
    if (typeof exec.failureThreshold === "number") {
      config.execution.failureThreshold = Math.max(0, Math.min(100, Math.round(exec.failureThreshold)));
    }
  }

  // Validate schedules
  if (Array.isArray(raw.schedules)) {
    const validRunModes = new Set(["full", "smoke", "regression"]);
    config.schedules = [];
    for (const sched of raw.schedules) {
      if (typeof sched === "object" && sched !== null) {
        const s = sched as Record<string, unknown>;
        if (typeof s.cron !== "string" || !s.cron) {
          errors.push({ field: "schedules[].cron", message: "Cron expression is required" });
          continue;
        }
        const mode = typeof s.mode === "string" && validRunModes.has(s.mode)
          ? (s.mode as "full" | "smoke" | "regression")
          : "smoke";
        config.schedules.push({
          cron: s.cron,
          mode,
          name: typeof s.name === "string" ? s.name : `Scheduled ${mode}`,
        });
      }
    }
  }

  // Validate auth
  if (raw.auth && typeof raw.auth === "object") {
    const auth = raw.auth as Record<string, unknown>;
    if (typeof auth.strategy === "string" && typeof auth.loginUrl === "string") {
      const testUser = auth.testUser as Record<string, unknown> | undefined;
      config.auth = {
        strategy: auth.strategy,
        testUser: {
          email: typeof testUser?.email === "string" ? testUser.email : "",
          passwordSecretKey: typeof testUser?.passwordSecretKey === "string" ? testUser.passwordSecretKey : "",
        },
        loginUrl: auth.loginUrl,
      };
    }
  }

  // Validate environments
  if (raw.environments && typeof raw.environments === "object") {
    const envs = raw.environments as Record<string, unknown>;
    for (const [name, value] of Object.entries(envs)) {
      if (typeof value === "object" && value !== null) {
        const env = value as Record<string, unknown>;
        if (typeof env.url === "string") {
          config.environments[name] = {
            url: env.url,
            teardownHookUrl: typeof env.teardownHookUrl === "string" ? env.teardownHookUrl : undefined,
          };
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, config };
}

export async function getProjectConfig(projectId: string): Promise<OrbitConfig> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { config: true },
  });

  if (!project || !project.config || typeof project.config !== "object") {
    return DEFAULT_CONFIG;
  }

  const { config } = validateConfig(project.config as Record<string, unknown>);
  return config;
}

export async function saveProjectConfig(
  projectId: string,
  rawConfig: Record<string, unknown>
): Promise<{ config: OrbitConfig; errors: ConfigValidationError[] }> {
  const { config, errors } = validateConfig(rawConfig);

  await prisma.project.update({
    where: { id: projectId },
    data: { config: rawConfig as Prisma.InputJsonValue },
  });

  return { config, errors };
}

export function generateConfigTemplate(): string {
  return `import { defineConfig } from '@orbit/config';

export default defineConfig({
  scope: {
    include: ['app/**', 'src/**'],
    exclude: ['app/admin/**', 'src/internal/**'],
    critical: ['/checkout', '/api/payments', '/login'],
  },
  coverage: {
    target: 80,
    criticalTarget: 100,
  },
  execution: {
    mode: 'autonomous',
    flakinessTolerance: 3,
    maxParallelBrowsers: 5,
    failureThreshold: 50,
  },
  schedules: [
    { name: 'Nightly Smoke', cron: '0 2 * * *', mode: 'smoke' },
    { name: 'Weekly Full Suite', cron: '0 3 * * 0', mode: 'full' },
  ],
  auth: {
    strategy: 'credentials',
    testUser: {
      email: 'orbit-test@yourdomain.com',
      passwordSecretKey: 'TEST_USER_PASSWORD',
    },
    loginUrl: '/login',
  },
  environments: {
    staging: { url: 'https://staging.example.com' },
    preview: { url: 'https://preview.example.com' },
  },
});
`;
}

export type { OrbitScopeConfig, OrbitCoverageConfig, OrbitExecutionConfig, OrbitScheduleConfig, ConfigValidationError };
