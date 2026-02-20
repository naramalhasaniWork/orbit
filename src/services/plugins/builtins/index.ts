/**
 * Built-in Plugins Registry
 *
 * All built-in plugins that ship with Orbit.
 * These are available for installation in any workspace.
 */

import type { PluginDefinition } from "@/services/plugins/runtime";
import { slackNotifierPlugin } from "./slack-notifier";
import { githubStatusPlugin } from "./github-status";
import { autoHealReporterPlugin } from "./auto-heal-reporter";

export const BUILTIN_PLUGINS: PluginDefinition[] = [
  slackNotifierPlugin,
  githubStatusPlugin,
  autoHealReporterPlugin,
];

export const BUILTIN_PLUGIN_MAP: Record<string, PluginDefinition> = Object.fromEntries(
  BUILTIN_PLUGINS.map((p) => [p.name, p])
);

export { slackNotifierPlugin, githubStatusPlugin, autoHealReporterPlugin };
