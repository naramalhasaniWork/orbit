/**
 * Redis stream entry ids ("<ms>-<seq>") double as SSE event ids. They are
 * strictly increasing per channel, which is what lets the server dedupe a
 * replayed gap against live events and the client drop repeats.
 */

const STREAM_ID = /^(\d{1,16})-(\d{1,10})$/;

export function isStreamId(value: string | null | undefined): value is string {
  return !!value && STREAM_ID.test(value);
}

/** Negative when a is older than b, 0 when equal, positive when newer. Both must be valid ids. */
export function compareStreamIds(a: string, b: string): number {
  const [aMs, aSeq] = a.split("-").map(Number);
  const [bMs, bSeq] = b.split("-").map(Number);
  return aMs !== bMs ? aMs - bMs : aSeq - bSeq;
}
