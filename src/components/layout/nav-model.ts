import {
  Activity,
  ClipboardList,
  CreditCard,
  Home,
  KeyRound,
  Map,
  MessageSquareText,
  Plug,
  Settings,
  ShieldCheck,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavLink {
  name: string;
  href: string;
  icon: LucideIcon;
}

/** Shortcuts under the modules. Everything that used to be a flat nav item stays reachable. */
export const SHORTCUTS: readonly NavLink[] = [
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "System Map", href: "/dashboard/map", icon: Map },
  { name: "Test Plans", href: "/dashboard/plans", icon: ClipboardList },
  { name: "Runs", href: "/dashboard/runs", icon: Activity },
  { name: "Agent", href: "/dashboard/agent", icon: MessageSquareText },
  { name: "Code Audit", href: "/dashboard/audit", icon: ShieldCheck },
  { name: "Operations", href: "/dashboard/operations", icon: Workflow },
];

export const SETTINGS_LINK: NavLink = { name: "Settings", href: "/dashboard/settings", icon: Settings };

export const BILLING_HREF = "/dashboard/settings/billing";

/** One Settings entry; these are its sections (rendered by the settings layout). */
const SETTINGS_SECTIONS: readonly NavLink[] = [
  { name: "General", href: "/dashboard/settings", icon: Settings },
  { name: "Providers", href: "/dashboard/settings/providers", icon: KeyRound },
  { name: "MCP tools", href: "/dashboard/settings/mcp", icon: Plug },
  { name: "Team", href: "/dashboard/settings/members", icon: Users },
  { name: "Billing", href: BILLING_HREF, icon: CreditCard },
];

export function settingsSections({ hideBilling }: { hideBilling: boolean }): NavLink[] {
  return SETTINGS_SECTIONS.filter((s) => !(hideBilling && s.href === BILLING_HREF));
}

/** Exact match for roots (/dashboard, /dashboard/settings), prefix match otherwise. */
export function isActiveHref(pathname: string | null, href: string, exactRoots = ["/dashboard", "/dashboard/settings"]): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  if (exactRoots.includes(href)) return false;
  return pathname.startsWith(`${href}/`);
}

/** Project-scoped pages keep the selected project; settings are workspace-wide. */
export function withProjectParam(href: string, project: string | null): string {
  return project && !href.startsWith("/dashboard/settings") ? `${href}?project=${project}` : href;
}
