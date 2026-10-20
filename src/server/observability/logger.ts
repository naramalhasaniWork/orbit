import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";
import { PROTECTED_SETTINGS_KEYS, SECRET_WEBHOOK_FIELDS } from "@/lib/integrations/redact";

/** Ids stamped on every log line written inside a request. The wrapper fills workspaceId once it is known. */
export interface LogContext {
  requestId: string;
  workspaceId?: string;
}

const contextStore = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return contextStore.run(context, fn);
}

export function getLogContext(): LogContext | undefined {
  return contextStore.getStore();
}

/** Keys that never belong in a log line, on top of the integration keys redact.ts already guards. */
const SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "secret",
  "encryptedValue",
  "credentials",
  ...PROTECTED_SETTINGS_KEYS,
  ...SECRET_WEBHOOK_FIELDS,
];

// pino wildcards match one level each, so cover the key at the top and up to three levels down
// (e.g. req.headers.authorization, workspace.settings.linearApiKey).
const MAX_REDACT_DEPTH = 3;

export function redactPaths(): string[] {
  const paths: string[] = [];
  for (const key of SENSITIVE_KEYS) {
    const accessor = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `["${key}"]`;
    paths.push(accessor);
    for (let depth = 1; depth <= MAX_REDACT_DEPTH; depth++) {
      paths.push(`${"*.".repeat(depth)}${accessor}`);
    }
  }
  return paths;
}

function defaultLevel(): string {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  return process.env.NODE_ENV === "test" ? "silent" : "info";
}

export function createLogger(destination?: DestinationStream, options: LoggerOptions = {}): Logger {
  const config: LoggerOptions = {
    level: defaultLevel(),
    redact: { paths: redactPaths(), censor: "[Redacted]" },
    serializers: { err: pino.stdSerializers.err },
    mixin: () => ({ ...contextStore.getStore() }),
    ...options,
  };
  return destination ? pino(config, destination) : pino(config);
}

export const logger = createLogger();
