# Railway PR previews

Orbit tests each pull request on the PR environment Railway deploys for it, then posts the
result on the PR. Without this, PRs are tested against the project's default environment.

## How it works

1. A PR is opened or pushed to. Orbit records a pending preview and adds an **Orbit preview**
   check ("Waiting for preview") to the commit. No test run starts yet.
2. Railway deploys the PR environment. Its webhook (optional) tells Orbit to look; Orbit also
   polls every 2 minutes. Either way Orbit asks the Railway API for the deployment of that exact
   commit and its domain. The webhook body is never trusted for the URL.
3. When the deployment succeeded, the URL is checked (https, an allowed host, a public address),
   a `PR #<n> preview` environment is created or re-pointed, and the run starts against it.
4. The **Orbit Test Run** check and the PR comment name the URL that was tested.
5. No preview within 15 minutes gives a neutral check. Closing the PR archives its environment.

## Requirements

- The project's repo is connected through GitHub (the GitHub App or OAuth), so Orbit receives
  `pull_request` webhooks and can write checks and comments.
- PR environments are enabled on the Railway project (Project → Settings → Environments →
  PR Environments).
- The base environment's service uses a **Railway-provided domain** (`*.up.railway.app`).
  Railway only gives PR environments a domain in that case; without one Orbit marks the
  preview failed and says why.
- Pull requests from forks get no PR environment, so Orbit reports a neutral check for them.

## Setup

1. **Create a workspace token.** In Railway: Account Settings → Tokens → Create token, and pick
   the workspace that owns the project. Use a workspace token, not a project token: a project
   token is limited to one environment and cannot see PR environments.
2. **Connect it in Orbit.** Settings → Integrations → Railway → paste the token → Connect
   Railway. Orbit lists your projects to check the token works.
3. **Copy the webhook details.** After connecting, the card shows a webhook URL
   (`https://<your-orbit>/api/webhooks/preview/railway/<connection-id>`) and an
   `X-Orbit-Token` value. The token is shown once; Orbit stores only its hash. If you lose it,
   use **Generate new token** (the old one stops working).
4. **Add the webhook in Railway.** Project → Settings → Webhooks → add the URL, and add a custom
   header named `X-Orbit-Token` with the token value. (Railway refuses header names starting
   with `X-Railway-`.) This step is optional: without it Orbit still finds previews by polling,
   just up to 2 minutes later.
5. **Pick the preview source.** Settings → Environments → Preview source → Provider: Railway →
   choose the service that serves your app (`project / service`). Keep the allowed host
   `up.railway.app`, or add your own domain suffix if PR environments use a custom domain.
   Save.
6. Optional: **Import Railway environments** creates Orbit environments for the service's
   long-lived Railway environments (production, staging). PR environments are not imported.

Successful deploys of long-lived environments (not PR environments) start a smoke run on the
project's default environment, once per deployment.

## Notes

- Orbit authenticates webhooks only by `X-Orbit-Token`. A request without it, with a wrong one,
  or for a connection that has no token yet is rejected with 401.
- `/api/webhooks/railway?connection=<connection-id>` is kept as an alias of the URL above.
- Not yet verified against a live Railway account (all isolated in
  `src/services/preview/providers/railway-api.ts`): the deployment status values
  (`SUCCESS`, `FAILED`, `CRASHED`, `REMOVED`), the removal event names, listing projects with a
  workspace token, `deployments(...).meta.commitHash`, and the `domains` query.
