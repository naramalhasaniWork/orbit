"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface SSEEvent<T = unknown> {
  type: string;
  data: T;
  id: string;
}

interface UseSSEOptions {
  url: string;
  enabled?: boolean;
  onEvent?: (event: SSEEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  maxRetries?: number;
  retryDelay?: number;
}

interface UseSSEReturn {
  connected: boolean;
  error: string | null;
  retryCount: number;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY = 2000;
const MAX_RETRY_DELAY = 30_000;

/**
 * Base hook for consuming SSE streams with automatic reconnection.
 *
 * Features:
 * - Auto-reconnect with exponential backoff
 * - Last-Event-ID replay on reconnect
 * - Heartbeat awareness
 * - Proper cleanup on unmount
 */
export function useSSE({
  url,
  enabled = true,
  onEvent,
  onConnected,
  onDisconnected,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryDelay = DEFAULT_RETRY_DELAY,
}: UseSSEOptions): UseSSEReturn {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const lastEventIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Stable callback refs
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  const onDisconnectedRef = useRef(onDisconnected);
  onDisconnectedRef.current = onDisconnected;

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Build URL with Last-Event-ID as query param for initial connection
    let connectUrl = url;
    if (lastEventIdRef.current) {
      const separator = url.includes("?") ? "&" : "?";
      connectUrl = `${url}${separator}lastEventId=${lastEventIdRef.current}`;
    }

    const es = new EventSource(connectUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      setError(null);
      setRetryCount(0);
      onConnectedRef.current?.();
    };

    // Listen for named events via addEventListener
    const handleMessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;

      // Track last event ID for reconnection
      if (event.lastEventId) {
        lastEventIdRef.current = event.lastEventId;
      }

      try {
        const data = JSON.parse(event.data);
        onEventRef.current?.({ type: event.type, data, id: event.lastEventId });
      } catch {
        // Ignore parse errors
      }
    };

    // Listen on default "message" event
    es.onmessage = handleMessage;

    // Register listeners for known event types
    const eventTypes = [
      "connected",
      "heartbeat",
      "timeout",
      "error",
      // Indexing events
      "indexing:started",
      "indexing:phase",
      "indexing:node_discovered",
      "indexing:progress",
      "indexing:completed",
      "indexing:failed",
      // Run events
      "run:started",
      "run:progress",
      "run:completed",
      // Test events
      "test:started",
      "test:step",
      "test:completed",
      "test:screenshot",
      "test:result",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, handleMessage as EventListener);
    }

    es.onerror = () => {
      if (!mountedRef.current) return;
      es.close();
      setConnected(false);
      onDisconnectedRef.current?.();

      setRetryCount((prev) => {
        const next = prev + 1;
        if (next <= maxRetries) {
          const delay = Math.min(retryDelay * Math.pow(2, prev), MAX_RETRY_DELAY);
          retryTimerRef.current = setTimeout(connect, delay);
          setError(`Reconnecting (attempt ${next}/${maxRetries})...`);
        } else {
          setError("Connection lost. Refresh to retry.");
        }
        return next;
      });
    };
  }, [url, maxRetries, retryDelay]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      eventSourceRef.current?.close();
      setConnected(false);
      return;
    }

    connect();

    return () => {
      mountedRef.current = false;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [enabled, connect]);

  return { connected, error, retryCount };
}
