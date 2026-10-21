/** Live screenshot frames: JPEGs parked in Redis while a run is watched; the bus only carries a pointer. */

/** Long enough to cover a reconnect or a paused viewer; the gallery uses the persisted RunArtifact. */
export const FRAME_TTL_SECONDS = 30 * 60;

export const FRAME_KEY_PATTERN = /^[0-9a-f-]{36}$/;

export const frameRedisKey = (runId: string, frameKey: string) => `frame:${runId}:${frameKey}`;
