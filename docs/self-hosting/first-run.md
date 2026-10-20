# First run on Railway

From "Deploy template" to your first test run. Allow about 20 minutes, most of it creating the
GitHub App. For what each Railway service is, see [railway.md](./railway.md).

## 1. Deploy the template

1. Deploy the Orbit template. It creates `web`, `Postgres` (pgvector image), `Redis` and `browserless`.
2. When asked, fill in `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`. Leave `GITHUB_*` blank for now.
3. Open `web` > Settings > Networking and generate a public domain if none exists.
   `NEXTAUTH_URL` is set from it by the template (`https://${{RAILWAY_PUBLIC_DOMAIN}}`).
4. Wait for the deploy to go green. The container applies database migrations on boot.

## 2. Open /setup

Go to `https://<your-domain>`. A new instance sends you to **/setup**, a checklist that checks:

| Group | Checks |
|-------|--------|
| Infrastructure | database reachable, migrations applied, Redis reachable, browser endpoint reachable |
| Secrets | `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` matches the address you opened |
| GitHub App | client ID and secret, app ID, slug, private key, webhook secret |
| AI | `ANTHROPIC_API_KEY` |

Each red item says which variable to set on which service. After changing variables, Railway
redeploys; click **Re-run checks**.

/setup is only available while the instance has **no users**. After the first sign-in it redirects
to /login (or /dashboard when signed in).

## 3. Create the GitHub App

One GitHub App handles both sign-in and repository access.

**Shortcut:** on /setup click **Create GitHub App for me**. GitHub shows a pre-filled form; confirm it,
and Orbit shows the credentials once as Railway variables. Paste them into `web` > Variables >
Raw Editor and skip to step 4. (The credentials are not stored by Orbit; if you lose the page, create
a new key on the App's GitHub settings page.)

**Manually:** open <https://github.com/settings/apps/new> (or your organization's settings) and
enter exactly the values shown on /setup. With `https://orbit.example.com` as your domain:

| GitHub field | Value |
|--------------|-------|
| GitHub App name | anything unique, e.g. `Orbit orbit-yourco` |
| Homepage URL | `https://orbit.example.com` |
| Callback URL | `https://orbit.example.com/api/auth/callback/github` |
| Request user authorization (OAuth) during installation | **checked** |
| Expire user authorization tokens | leave the default |
| Setup URL (optional) | `https://orbit.example.com/api/github/installations/callback` |
| Redirect on update | **checked** |
| Webhook > Active | checked |
| Webhook URL | `https://orbit.example.com/api/webhooks/github` |
| Webhook secret | a long random string; keep it for step 4 |
| Repository permissions | Contents: Read-only; Pull requests: Read and write; Checks: Read and write; Metadata: Read-only |
| Organization permissions | Members: Read-only |
| Subscribe to events | Installation, Pull request, Push, Issue comment |
| Where can this GitHub App be installed? | Only on this account, or Any account if teammates use other orgs |

After creating it, on the App page: copy the **App ID** and the **slug** (the last part of
`github.com/apps/<slug>`), click **Generate a new client secret**, and **Generate a private key**
(downloads a `.pem`).

## 4. Put the credentials into Railway

In `web` > Variables, set:

```
GITHUB_APP_ID=<App ID>
GITHUB_APP_SLUG=<slug>
GITHUB_CLIENT_ID=<Client ID>
GITHUB_CLIENT_SECRET=<client secret>
GITHUB_WEBHOOK_SECRET=<webhook secret from step 3>
GITHUB_APP_PRIVATE_KEY=<whole .pem; newlines may be written as \n>
```

Railway redeploys. Reopen /setup; every row should be green.

## 5. Sign in as admin

On /setup click **Sign in with GitHub**. The **first account to sign in becomes the owner and
super admin** of the instance. Do this yourself before sharing the URL.

By default sign-up is invite-only (`ORBIT_SIGNUP=invite`); teammates need an invitation from
Settings > Team. Set `ORBIT_SIGNUP=open` or `closed` on `web` to change that.

## 6. Finish setup

The dashboard shows a **Finish setup** card (dismissible) with:

- **Install the GitHub App on your repositories.** Settings > Integrations > GitHub, then pick the repos.
- **Connect a model key (optional).** Orbit already uses `ANTHROPIC_API_KEY`; add a key in Settings >
  Providers only for per-workspace keys.
- **Invite teammates.** Settings > Team. Invitation emails are sent when `RESEND_API_KEY` and
  `EMAIL_FROM` are set; otherwise copy the invite link.
- **Choose who can sign up** (`ORBIT_SIGNUP`).

## 7. First test run

1. Create a project from an installed repository. Orbit indexes it and builds the System Map.
2. In Settings > Environments, add a **staging** URL. Run it against a non-production environment.
3. Open Plans and generate a test plan; a run needs an active plan.
4. Click **Run**. Watch it live on the run page; failures include an explanation and screenshots.

## Troubleshooting

**1. Sign-in fails with `redirect_uri` error or loops back to the login page.**
`NEXTAUTH_URL` does not match the address in your browser, or the GitHub App's Callback URL is
different. /setup shows both values. Fix `NEXTAUTH_URL` on `web` (no trailing path), update the
Callback URL on GitHub, redeploy.

**2. "Migrations applied" stays red, or the deploy logs show `type "vector" does not exist`.**
The Postgres service is not the pgvector image. Use `pgvector/pgvector:pg16`, keep its volume at
`/var/lib/postgresql/data`, point `DATABASE_URL` at it, and redeploy `web`.

**3. "GitHub App private key" is red although the variable is set.**
The key was pasted without its `BEGIN`/`END` lines or with the newlines mangled. Paste the full
`.pem`, or write it on one line with literal `\n` between lines.

**4. Pull requests do not trigger runs.**
Check the App's Advanced tab > Recent deliveries on GitHub. A 401 means `GITHUB_WEBHOOK_SECRET`
differs from the App's webhook secret; a connection error means the Webhook URL is wrong. The App
must also be installed on that repository.

**5. "Browser endpoint reachable" is red, or runs end as `environment_error`.**
The `browserless` service is down or `PLAYWRIGHT_WS_ENDPOINT` is wrong. It must use the private
domain and port 3000 with the service token:
`ws://${{browserless.RAILWAY_PRIVATE_DOMAIN}}:3000?token=${{browserless.TOKEN}}`.

**A teammate sees "This instance is invite-only".** Invite them from Settings > Team, or set
`ORBIT_SIGNUP=open`.

**Lost the setup page after creating a user?** /setup is intentionally unavailable once any user
exists. Use Railway > web > Variables directly; the checklist rows above map to the variable names.
