/**
 * Auto-Heal Reporter Plugin
 *
 * Generates a report of all self-healed selectors in a test run.
 * Tracks which selectors were automatically fixed and logs them
 * for developer review.
 */

import type {
  PluginDefinition,
  RunContext,
  RunResults,
  TestContext,
  TestResultContext,
} from "@/services/plugins/runtime";

interface HealedEntry {
  testName: string;
  testType: string;
  healedSelectors: string[];
  timestamp: string;
}

// In-memory collector for the current run's healed selectors.
// Reset at the start of each run.
let healedEntries: HealedEntry[] = [];

function formatHealReport(
  context: RunContext,
  results: RunResults,
  entries: HealedEntry[]
): string {
  const totalHealed = entries.reduce(
    (sum, e) => sum + e.healedSelectors.length,
    0
  );

  const lines: string[] = [
    `# Auto-Heal Report — ${context.projectName}`,
    "",
    `**Run ID:** ${context.runId}`,
    `**Mode:** ${context.mode}`,
    `**Total Tests:** ${results.totalTests}`,
    `**Healed Selectors:** ${totalHealed}`,
    `**Tests with Heals:** ${entries.length}`,
    "",
  ];

  if (entries.length === 0) {
    lines.push("No selectors were healed in this run.");
    return lines.join("\n");
  }

  lines.push("## Healed Tests");
  lines.push("");

  for (const entry of entries) {
    lines.push(`### ${entry.testName} (${entry.testType})`);
    for (const selector of entry.healedSelectors) {
      lines.push("- `" + selector + "`");
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(
    "Review these healed selectors and update the test plan to use the corrected selectors permanently."
  );

  return lines.join("\n");
}

export const autoHealReporterPlugin: PluginDefinition = {
  name: "auto-heal-reporter",
  version: "1.0.0",
  description: "Generates a report of all self-healed selectors in a run",
  defaultConfig: {
    logToConsole: true,
  },
  hooks: {
    beforeRun: async (_context: RunContext) => {
      // Reset the collector for this run
      healedEntries = [];
    },

    onTestComplete: async (
      context: TestContext,
      result: TestResultContext
    ) => {
      if (result.healedSelectors.length > 0) {
        healedEntries.push({
          testName: context.testName,
          testType: context.testType,
          healedSelectors: result.healedSelectors,
          timestamp: new Date().toISOString(),
        });
      }
    },

    afterRun: async (context: RunContext, results: RunResults) => {
      const report = formatHealReport(context, results, healedEntries);

      // Log the report
      console.log("[auto-heal-reporter] Report generated:");
      console.log(report);

      // In production, this would be stored as a run artifact
      // or posted to a configured endpoint.
      // For now, we log it as structured data.
      if (healedEntries.length > 0) {
        console.log(
          `[auto-heal-reporter] Summary: ${healedEntries.length} tests had healed selectors in run ${context.runId}`
        );
      }

      // Reset for next run
      healedEntries = [];
    },
  },
};
