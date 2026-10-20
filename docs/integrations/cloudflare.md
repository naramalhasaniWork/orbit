# Cloudflare Pages PR previews

Orbit tests each pull request on its Cloudflare Pages preview deployment, then posts the result
on the PR. Pages has no webhook Orbit can use, so Orbit polls the Pages API every 2 minutes.

## How it works

1. A PR is opened or pushed to. Orbit records a pending preview and adds an **Orbit preview**
   check ("Waiting for preview"). No test run starts yet.
2. Every 2 minutes Orbit lists the project's preview deployments
   (`GET /accounts/{account}/pages/projects/{project}/deployments?env=preview`) and looks for
   the one whose commit matches the PR head.
3. When its latest stage is `deploy` with status `success`, Orbit takes the deployment's own URL
   (`https://<hash>.<project>.pages.dev`). That URL is immutable, so a later push cannot change
   what was tested. The branch alias URL is not used.
4. The URL is checked (https, an allowed host, a public address), a `PR #<n> preview`
   environment is created or re-pointed, and the run starts. The PR comment names the URL.
5. A failed or cancelled build fails the preview check. No preview within 15 minutes gives a
   neutral check. Pull requests from forks get no preview deployment.

## Setup

1. **Find your account ID.** Cloudflare dashboard → any zone or Workers & Pages → the right-hand
   sidebar shows **Account ID** (32 hex characters).
2. **Create an API token.** My Profile → API Tokens → Create Token → Custom token, with the
   permission **Account › Cloudflare Pages › Read**, scoped to that account.
3. **Connect in Orbit.** Settings → Integrations → Cloudflare Pages → enter the account ID and
   token → Connect Cloudflare Pages. Orbit lists your Pages projects to check the token.
4. **Pick the preview source.** Settings → Environments → Preview source → Provider:
   Cloudflare Pages → choose the Pages project. Keep the allowed host `pages.dev` (add your own
   suffix only if previews are served from a custom domain). Save.

## Previews behind Cloudflare Access

If your preview URLs are protected by Cloudflare Access, give Orbit a service token:

1. Zero Trust → Access → Service Auth → Service Tokens → Create Service Token. Copy the
   Client ID and Client Secret (the secret is shown once).
2. In the Access application that covers your previews, add a policy with action
   **Service Auth** that includes this service token. Without a Service Auth policy, Access
   still redirects the browser to its login page.
3. In Orbit: Settings → Environments → Preview source → turn on **Previews are behind
   Cloudflare Access** → enter the Client ID and Client Secret → Save. They are stored as the
   project secrets `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.
4. **Test access**: enter a preview URL and press Test access. Orbit requests it once without
   and once with the token (redirects are not followed) and tells you whether Access is on and
   whether the token gets through.

During a run, Orbit sends `CF-Access-Client-Id` and `CF-Access-Client-Secret` on every request
to the preview's own origin only, never to third-party hosts the page loads. If Access still
sends the browser to its login page, the tests are recorded as environment errors with a
message pointing at the token and policy, not as app failures.
