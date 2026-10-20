/** fetch + JSON for the preview settings UI; throws the API's error message. */
export async function sendJson<T>(url: string, method: "GET" | "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json?.data as T;
}

export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
