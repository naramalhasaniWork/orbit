export interface BulkResult {
  succeeded: string[];
  failed: Array<{ id: string; message: string }>;
}

/** Run `task` for every id with limited concurrency, collecting per-item failures. */
export async function runBulk(
  ids: readonly string[],
  task: (id: string) => Promise<void>,
  concurrency = 3
): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] };
  let next = 0;

  async function worker() {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        await task(id);
        result.succeeded.push(id);
      } catch (err) {
        result.failed.push({ id, message: err instanceof Error ? err.message : "Request failed" });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return result;
}

/** "Cancelled 3 of 4. 1 failed: <first reason>" */
export function summarizeBulk(pastTense: string, result: BulkResult): string {
  const total = result.succeeded.length + result.failed.length;
  if (result.failed.length === 0) return `${pastTense} ${total} ${total === 1 ? "item" : "items"}.`;
  const reason = result.failed[0].message;
  return `${pastTense} ${result.succeeded.length} of ${total}. ${result.failed.length} failed: ${reason}`;
}

/** Throws the API's error message for a non-ok response so runBulk can record it. */
export async function assertOk(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  const json = await res.json().catch(() => ({}));
  throw new Error((json as { error?: { message?: string } }).error?.message ?? `${fallback} (${res.status})`);
}
