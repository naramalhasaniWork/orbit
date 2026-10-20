# Slack

Orbit posts run results and failure alerts to a Slack channel, and the `/orbit` slash command
works from Slack.

## Notifications

Settings → Integrations → Slack: paste an incoming webhook URL (`https://hooks.slack.com/services/…`).
It is stored encrypted. The notification switches choose what gets posted.

## Slash commands and buttons

Commands (`/orbit status|run|results|health|link`) and message buttons (re-run, mark flaky,
create Linear issue) come from one Orbit Slack app. They use its request URLs
`/api/webhooks/slack/commands` and `/api/webhooks/slack/interactions` and are signed with its
`SLACK_SIGNING_SECRET`. Without the secret both URLs answer 503.

Because every Slack workspace posts to the same URL with the same app secret, Orbit can't give
each connection its own URL the way it does for Linear. It routes like this instead:

1. The Slack signature is verified first, so the `team_id` in the request is the one Slack sent.
2. That team must be **linked** to exactly one connected Orbit workspace. The only way to link
   one is a signed `/orbit link <code>`, where the code was issued by an Orbit admin
   (Slack card → **Get link code**). The code works once and expires after 15 minutes. Orbit
   stores only a hash of it.
3. If another Orbit workspace already holds that Slack team, the new link is not applied.
   Commands keep going to the current holder, and the Slack card of the workspace that issued
   the code shows **Move Slack team here**. When one of its admins confirms, the team moves and
   the previous workspace loses it. The newest claim always needs that confirmation.
4. If a team is ever bound to more than one workspace, commands are refused instead of guessed.

Every button action is then scoped to the linked workspace. A run, test case or result id from
another workspace reads as "not found".

## Changed in 20261025

Commands used to find the workspace from a `slackTeamId` settings key. Nothing set that key,
and any workspace could have claimed any team. That lookup is gone. Run `/orbit link <code>`
once per Slack workspace to keep using commands.
