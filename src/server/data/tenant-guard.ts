import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/server/observability/logger";
import type { Db } from "./db";
import { findTenantViolation, modelOf } from "./tenancy";

export type GuardMode = "throw" | "log" | "off";

export class TenantGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantGuardError";
  }
}

/** ORBIT_TENANT_GUARD wins; otherwise production logs and everything else (dev, test) throws. */
export function guardMode(env: NodeJS.ProcessEnv = process.env): GuardMode {
  const explicit = env.ORBIT_TENANT_GUARD;
  if (explicit === "throw" || explicit === "log" || explicit === "off") return explicit;
  return env.NODE_ENV === "production" ? "log" : "throw";
}

export function enforceTenantFilter(model: string | undefined, operation: string, args: unknown, mode: GuardMode): void {
  if (mode === "off") return;
  const violation = findTenantViolation(model, operation, args);
  if (!violation) return;
  if (mode === "throw") throw new TenantGuardError(violation);
  logger.warn({ model, operation }, `tenantGuard: ${violation}`);
}

/** Prisma extension: every model query on the client passes the tenant check first. */
export function tenantGuard(mode: GuardMode = guardMode()) {
  return Prisma.defineExtension({
    name: "tenantGuard",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          enforceTenantFilter(model, operation, args, mode);
          return query(args);
        },
      },
    },
  });
}

/**
 * The client with the guard on. A real client gets the extension; a test double (no $extends)
 * gets the same check through a proxy, so route tests trip on unscoped queries too.
 */
export function withTenantGuard(db: Db, mode: GuardMode = guardMode()): Db {
  if (mode === "off") return db;
  const extendable = db as Db & { $extends?: (ext: ReturnType<typeof tenantGuard>) => unknown };
  if (typeof extendable.$extends === "function") return extendable.$extends(tenantGuard(mode)) as Db;

  return new Proxy(db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (typeof prop !== "string" || prop.startsWith("$") || typeof value !== "object" || value === null) return value;
      const model = modelOf(prop);
      return new Proxy(value, {
        get(delegate, op) {
          const fn: unknown = Reflect.get(delegate, op);
          if (typeof op !== "string" || typeof fn !== "function") return fn;
          return (args: unknown) => {
            enforceTenantFilter(model, op, args, mode);
            return (fn as (a: unknown) => unknown).call(delegate, args);
          };
        },
      });
    },
  });
}
