import { apiErrorMessage } from "@/lib/api-client";

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await apiErrorMessage(res, "Request failed"));
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? "Unknown error");
  return json.data as T;
}
