/** Sidebar expanded/rail preference, stored in a cookie so the server renders the right width (no shift). */
export const SIDEBAR_COOKIE = "orbit-sidebar";

export function parseSidebarExpanded(value: string | undefined): boolean {
  return value === "expanded";
}

export function sidebarCookie(expanded: boolean): string {
  return `${SIDEBAR_COOKIE}=${expanded ? "expanded" : "rail"}; path=/; max-age=31536000; samesite=lax`;
}
