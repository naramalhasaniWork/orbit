/** Help → "Replay tour": mark the tour due again, then start it from wherever the user is. */
export async function replayTour(push: (href: string) => void): Promise<void> {
  const res = await fetch("/api/user/onboarding-tour", { method: "DELETE" }).catch(() => null);
  if (!res?.ok) return;
  const url = new URL(window.location.href);
  url.searchParams.set("tour", "start");
  push(url.pathname + url.search);
}
