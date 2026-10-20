# Linear

Orbit files Linear issues for critical and high-severity failures, and Linear issue events can
start test runs.

## Connect

Settings → Integrations → Linear: paste a personal API key (Linear → Settings → API). Orbit checks
it against Linear, picks the key's first team, and stores the key encrypted. **Auto-create issues**
turns issue filing on or off.

## Inbound webhook (issue events start runs)

1. In the Linear card, click **Generate URL**. Orbit shows
   `https://<orbit>/api/webhooks/linear/<connectionId>?token=<token>` once. Orbit keeps only a
   hash of the token, so copy the URL now. **Generate new URL** replaces it, and the old one stops
   working at once.
2. In Linear → Settings → API → Webhooks, create a webhook with that URL and select **Issues**.
3. Under **Runs go to**, pick the project the runs belong to. With no project picked, events go to
   the workspace's only active project. A workspace with several projects and none picked ignores
   the events.

What triggers a run:

- An issue moved to a completed state (or a state named Done) starts a regression run.
- The **Needs Testing** label starts a targeted run.

Both run on the issue's branch, or the project's default branch when the issue has none.

Requests are rejected with 401 when the connection is unknown or disconnected, or when the token
is missing or wrong. Events from a Linear team other than the connected one are ignored.

## Changed in 20261025: the shared URL is retired

`/api/webhooks/linear` (one URL for every workspace, signed with `LINEAR_WEBHOOK_SECRET`) found
the project by the team id in the payload. A workspace could claim another workspace's team id
and receive its events. That URL now answers **410** for every request, and
`LINEAR_WEBHOOK_SECRET` is no longer read. To keep issue events flowing, generate the
per-connection URL above and swap it into the Linear webhook.
