"use client";

import { useEffect, useRef, useState } from "react";
import { openReconnectingSource, type SSEMessage, type SSEStatus } from "@/lib/sse/reconnecting-source";

interface UseSSEOptions {
  url: string;
  enabled?: boolean;
  onEvent?: (event: SSEMessage) => void;
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

/**
 * Consumes an SSE stream with bounded, jittered reconnection.
 * Retry policy lives in openReconnectingSource; this hook only mirrors its
 * status into React state and closes the stream on unmount or disable.
 */
export function useSSE({
  url,
  enabled = true,
  onEvent,
  onConnected,
  onDisconnected,
  maxRetries,
  retryDelay,
}: UseSSEOptions): UseSSEReturn {
  const [status, setStatus] = useState<SSEStatus | null>(null);

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  const onDisconnectedRef = useRef(onDisconnected);
  onDisconnectedRef.current = onDisconnected;

  useEffect(() => {
    if (!enabled || !url) {
      setStatus(null);
      return;
    }

    let wasOpen = false;
    const source = openReconnectingSource({
      url,
      maxRetries,
      baseDelayMs: retryDelay,
      onMessage: (message) => onEventRef.current?.(message),
      onStatus: (next) => {
        setStatus(next);
        if (next.state === "open") {
          wasOpen = true;
          onConnectedRef.current?.();
        } else if (wasOpen && (next.state === "waiting" || next.state === "failed")) {
          wasOpen = false;
          onDisconnectedRef.current?.();
        }
      },
    });

    return () => source.close();
  }, [url, enabled, maxRetries, retryDelay]);

  return {
    connected: status?.state === "open",
    error: describe(status),
    retryCount: status?.attempt ?? 0,
  };
}

function describe(status: SSEStatus | null): string | null {
  if (!status) return null;
  if (status.state === "waiting") {
    return `${status.reason}. Reconnecting in ${Math.ceil(status.delayMs / 1000)}s...`;
  }
  if (status.state === "failed") {
    return `${status.reason}. Live updates paused; refresh to retry.`;
  }
  return null;
}
