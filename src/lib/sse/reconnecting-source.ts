/**
 * Framework-agnostic SSE client with bounded, jittered reconnection.
 *
 * Kept outside React so every side effect (timers, EventSource lifecycle)
 * happens in plain callbacks, never inside a state updater, and so the
 * retry policy can be tested with fake timers.
 */

export interface SSEMessage {
  type: string;
  data: unknown;
  id: string;
}

export type SSEStatus =
  | { state: "connecting"; attempt: number }
  | { state: "open"; attempt: number }
  | { state: "waiting"; attempt: number; delayMs: number; reason: string }
  | { state: "failed"; attempt: number; reason: string };

/** Minimal surface of the browser EventSource we depend on. */
export interface EventSourceLike {
  onopen: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void;
  close(): void;
}

export interface ReconnectingSourceOptions {
  url: string;
  onMessage: (message: SSEMessage) => void;
  onStatus?: (status: SSEStatus) => void;
  /** Give up after this many consecutive failed attempts. */
  maxRetries?: number;
  /** Base delay for the first retry; doubles each attempt. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** A connection must stay open this long before the retry budget resets. */
  healthyAfterMs?: number;
  createEventSource?: (url: string) => EventSourceLike;
  random?: () => number;
}

export const DEFAULT_SSE_EVENT_TYPES = [
  "connected",
  "heartbeat",
  "timeout",
  "error",
  "indexing:started",
  "indexing:phase",
  "indexing:node_discovered",
  "indexing:progress",
  "indexing:completed",
  "indexing:failed",
  "run:started",
  "run:progress",
  "run:completed",
  "test:started",
  "test:step",
  "test:completed",
  "test:screenshot",
  "test:result",
  "screenshot:frame",
  "screenshots:complete",
  "plan:progress",
  "plan:completed",
  "plan:failed",
] as const;

const DEFAULTS = {
  maxRetries: 8,
  baseDelayMs: 2000,
  maxDelayMs: 30_000,
  healthyAfterMs: 10_000,
};

/**
 * Exponential backoff with "equal jitter": half the window is fixed, half is
 * random, so clients never reconnect in lockstep and never retry instantly.
 */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + random() * (exp / 2));
}

export function openReconnectingSource(options: ReconnectingSourceOptions): { close: () => void } {
  const maxRetries = options.maxRetries ?? DEFAULTS.maxRetries;
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const healthyAfterMs = options.healthyAfterMs ?? DEFAULTS.healthyAfterMs;
  const createEventSource =
    options.createEventSource ?? ((url: string) => new EventSource(url) as EventSourceLike);

  let source: EventSourceLike | null = null;
  let attempt = 0;
  let lastEventId: string | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let healthyTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const clearTimers = () => {
    if (retryTimer) clearTimeout(retryTimer);
    if (healthyTimer) clearTimeout(healthyTimer);
    retryTimer = null;
    healthyTimer = null;
  };

  const teardownSource = () => {
    if (!source) return;
    source.onopen = null;
    source.onerror = null;
    source.onmessage = null;
    source.close();
    source = null;
  };

  const fail = (reason: string) => {
    if (closed) return;
    teardownSource();
    clearTimers();
    attempt += 1;
    if (attempt > maxRetries) {
      options.onStatus?.({ state: "failed", attempt, reason });
      return;
    }
    const delayMs = backoffDelay(attempt, baseDelayMs, maxDelayMs, options.random);
    options.onStatus?.({ state: "waiting", attempt, delayMs, reason });
    retryTimer = setTimeout(connect, delayMs);
  };

  function connect() {
    if (closed) return;
    retryTimer = null;
    options.onStatus?.({ state: "connecting", attempt });

    let url = options.url;
    if (lastEventId) {
      url += `${url.includes("?") ? "&" : "?"}lastEventId=${encodeURIComponent(lastEventId)}`;
    }

    const es = createEventSource(url);
    source = es;

    es.onopen = () => {
      if (closed || source !== es) return;
      options.onStatus?.({ state: "open", attempt });
      // Only a connection that stays up earns a fresh retry budget; a server
      // that accepts and immediately drops us must keep backing off.
      healthyTimer = setTimeout(() => {
        attempt = 0;
        healthyTimer = null;
      }, healthyAfterMs);
    };

    const handle = (event: MessageEvent) => {
      if (closed || source !== es) return;
      if (event.lastEventId) lastEventId = event.lastEventId;
      if (typeof event.data !== "string") return; // transport-level error event
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      options.onMessage({ type: event.type, data, id: event.lastEventId });
      if (event.type === "error") {
        // Server-reported failure (e.g. pub/sub unavailable): back off.
        const message = (data as { message?: unknown } | null)?.message;
        fail(typeof message === "string" ? message : "Server reported an error");
      }
    };

    es.onmessage = handle;
    for (const type of DEFAULT_SSE_EVENT_TYPES) {
      es.addEventListener(type, handle);
    }

    es.onerror = () => {
      if (closed || source !== es) return;
      fail("Connection lost");
    };
  }

  connect();

  return {
    close() {
      closed = true;
      clearTimers();
      teardownSource();
    },
  };
}
