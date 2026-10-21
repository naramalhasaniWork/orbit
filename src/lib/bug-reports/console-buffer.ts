import { MAX_CONSOLE_ERRORS, redactSecrets } from "./context";

/**
 * The last few client errors, so a bug report can say what the console saw. Installed once by
 * the dashboard shell; wraps console.error and listens for uncaught errors and rejections.
 */

const buffer: string[] = [];
let installed = false;

function describe(value: unknown): string {
  if (value instanceof Error) {
    const frame = value.stack?.split("\n").slice(1, 3).join("\n");
    return frame ? `${value.name}: ${value.message}\n${frame}` : `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function recordConsoleError(...args: unknown[]): void {
  const line = redactSecrets(args.map(describe).join(" ").slice(0, 1000));
  if (!line) return;
  buffer.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
  if (buffer.length > MAX_CONSOLE_ERRORS) buffer.shift();
}

export function recentConsoleErrors(): string[] {
  return [...buffer];
}

export function installConsoleBuffer(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    recordConsoleError(...args);
    original(...args);
  };
  window.addEventListener("error", (e) => recordConsoleError(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => recordConsoleError("Unhandled rejection:", e.reason));
}
