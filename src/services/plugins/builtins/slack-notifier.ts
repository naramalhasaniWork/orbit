/**
 * Slack Notifier Plugin
 *
 * Sends Slack notifications when test runs complete.
 * Configurable webhook URL and notification preferences.
 */

import type { PluginDefinition, RunContext, RunResults } from "@/services/plugins/runtime";

function buildSlackMessage(context: RunContext, results: RunResults): Record<string, unknown> {
  const passRate = results.totalTests > 0
    ? Math.round((results.passed / results.totalTests) * 100)
    : 0;

  const statusEmoji = results.failed === 0 ? ":white_check_mark:" : ":x:";
  const statusText = results.failed === 0 ? "All tests passed" : `${results.failed} test(s) failed`;

  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${statusEmoji} Orbit Test Run — ${context.projectName}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Status:* ${statusText}` },
          { type: "mrkdwn", text: `*Mode:* ${context.mode}` },
          { type: "mrkdwn", text: `*Pass Rate:* ${passRate}%` },
          { type: "mrkdwn", text: `*Duration:* ${Math.round(results.durationMs / 1000)}s` },
          { type: "mrkdwn", text: `*Total:* ${results.totalTests}` },
          { type: "mrkdwn", text: `*Failed:* ${results.failed}` },
        ],
      },
      ...(context.branch
        ? [
            {
              type: "context",
              elements: [
                { type: "mrkdwn", text: "Branch: `" + context.branch + "`" },
                ...(context.commitSha
                  ? [{ type: "mrkdwn", text: "Commit: `" + context.commitSha.slice(0, 7) + "`" }]
                  : []),
              ],
            },
          ]
        : []),
    ],
  };
}

async function sendSlackWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
  }
}

export const slackNotifierPlugin: PluginDefinition = {
  name: "slack-notifier",
  version: "1.0.0",
  description: "Sends Slack notifications when test runs complete",
  defaultConfig: {
    webhookUrl: "",
    notifyOnSuccess: true,
    notifyOnFailure: true,
  },
  hooks: {
    afterRun: async (context: RunContext, results: RunResults) => {
      // Config is accessed via the runtime — this is a static definition.
      // The webhook URL must be set via plugin config in workspace settings.
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (!webhookUrl) {
        console.warn("[slack-notifier] No webhook URL configured, skipping notification");
        return;
      }

      const shouldNotify =
        results.failed > 0 || results.totalTests > 0;

      if (!shouldNotify) return;

      const message = buildSlackMessage(context, results);
      await sendSlackWebhook(webhookUrl, message);
    },
  },
};
