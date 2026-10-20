import { createPrivateKey } from "crypto";
import { connect } from "net";
import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import type { Env } from "@/lib/self-host";
import { configuredEnvProviders } from "@/server/ai/providers";
import { isByokOnly } from "@/server/ai/env";

export type CheckGroup = "Infrastructure" | "Secrets" | "GitHub App" | "AI";

export interface SetupCheck {
  id: string;
  group: CheckGroup;
  label: string;
  ok: boolean;
  /** One sentence on how to fix it on Railway; null when the check passes. */
  fix: string | null;
}

export interface InfraProbes {
  database(): Promise<boolean>;
  migrations(): Promise<boolean>;
  redis(): Promise<boolean>;
  browser(endpoint: string): Promise<boolean>;
}

const PROBE_TIMEOUT_MS = 3000;

function timeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), PROBE_TIMEOUT_MS)),
  ]);
}

async function attempt(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await timeout(fn());
    return true;
  } catch {
    return false;
  }
}

function tcpReachable(endpoint: string): Promise<boolean> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      resolve(false);
      return;
    }
    const port = Number(url.port) || (url.protocol === "wss:" || url.protocol === "https:" ? 443 : 80);
    const socket = connect({ host: url.hostname, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export const defaultProbes: InfraProbes = {
  database: () => attempt(() => prisma.$queryRaw`SELECT 1`),
  migrations: () =>
    attempt(async () => {
      const rows = await prisma.$queryRaw<Array<{ total: number; unfinished: number }>>`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS unfinished
        FROM _prisma_migrations`;
      if (!rows[0] || rows[0].total === 0 || rows[0].unfinished > 0) throw new Error("not applied");
    }),
  redis: () => attempt(() => getRedis().ping()),
  browser: (endpoint) => timeout(tcpReachable(endpoint)).catch(() => false),
};

const set = (env: Env, name: string) => Boolean(env[name]?.trim());
const longEnough = (env: Env, name: string) => (env[name]?.trim().length ?? 0) >= 32;

function privateKeyParses(env: Env): boolean {
  const raw = env.GITHUB_APP_PRIVATE_KEY;
  if (!raw?.trim()) return false;
  try {
    createPrivateKey(raw.replace(/\\n/g, "\n"));
    return true;
  } catch {
    return false;
  }
}

function sameOrigin(a: string | undefined, b: string): boolean {
  if (!a) return false;
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** Checks that need only the environment and the request origin. */
export function envChecks(env: Env, origin: string): SetupCheck[] {
  const check = (id: string, group: CheckGroup, label: string, ok: boolean, fix: string): SetupCheck => ({
    id,
    group,
    label,
    ok,
    fix: ok ? null : fix,
  });

  return [
    check(
      "encryption-key",
      "Secrets",
      "ENCRYPTION_KEY is set",
      longEnough(env, "ENCRYPTION_KEY"),
      "Set ENCRYPTION_KEY on the web service to a generated secret of 32+ characters (template value: ${{secret(64, \"abcdef0123456789\")}}); never change it once secrets are stored."
    ),
    check(
      "nextauth-secret",
      "Secrets",
      "NEXTAUTH_SECRET is set",
      longEnough(env, "NEXTAUTH_SECRET"),
      "Set NEXTAUTH_SECRET on the web service to a generated secret of 32+ characters (template value: ${{secret(44)}})."
    ),
    check(
      "nextauth-url",
      "Secrets",
      `NEXTAUTH_URL matches this address (${origin})`,
      sameOrigin(env.NEXTAUTH_URL, origin),
      `Set NEXTAUTH_URL on the web service to ${origin} (currently ${env.NEXTAUTH_URL?.trim() || "unset"}); sign-in redirects break otherwise.`
    ),
    check("github-client", "GitHub App", "GitHub App client ID and secret", set(env, "GITHUB_CLIENT_ID") && set(env, "GITHUB_CLIENT_SECRET"), "Copy the Client ID and a generated client secret from the GitHub App page into GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on the web service."),
    check("github-app-id", "GitHub App", "GitHub App ID", set(env, "GITHUB_APP_ID"), "Copy the numeric App ID from the GitHub App page into GITHUB_APP_ID on the web service."),
    check("github-app-slug", "GitHub App", "GitHub App slug", set(env, "GITHUB_APP_SLUG"), "Set GITHUB_APP_SLUG on the web service to the last part of github.com/apps/<slug>."),
    check("github-private-key", "GitHub App", "GitHub App private key", privateKeyParses(env), "Generate a private key on the GitHub App page and paste the whole .pem into GITHUB_APP_PRIVATE_KEY on the web service (newlines may be written as \\n)."),
    check("github-webhook-secret", "GitHub App", "GitHub App webhook secret", set(env, "GITHUB_WEBHOOK_SECRET"), "Set the same webhook secret in the GitHub App and in GITHUB_WEBHOOK_SECRET on the web service."),
    check(
      "ai-key",
      "AI",
      "AI provider key",
      configuredEnvProviders(env).length > 0 || isByokOnly(env),
      "Set ANTHROPIC_API_KEY (or OPENAI_API_KEY, OPENROUTER_API_KEY, ORBIT_OPENAI_COMPATIBLE_BASE_URL) on the web service and worker, or ORBIT_AI_KEYS=byok to use per-workspace keys only."
    ),
  ];
}

export async function runSetupChecks(input: {
  env?: Env;
  origin: string;
  probes?: InfraProbes;
}): Promise<SetupCheck[]> {
  const env = input.env ?? process.env;
  const probes = input.probes ?? defaultProbes;
  const endpoint = env.PLAYWRIGHT_WS_ENDPOINT?.trim();

  const [database, redis, browser] = await Promise.all([
    probes.database(),
    probes.redis(),
    endpoint ? probes.browser(endpoint) : Promise.resolve(false),
  ]);
  // Migrations are only meaningful once the database answers
  const migrations = database ? await probes.migrations() : false;

  const infra = (id: string, label: string, ok: boolean, fix: string): SetupCheck => ({
    id,
    group: "Infrastructure",
    label,
    ok,
    fix: ok ? null : fix,
  });

  return [
    infra("database", "Database reachable", database, "Set DATABASE_URL on the web service to the Postgres service's URL (pgvector image) and check the Postgres service is running."),
    infra("migrations", "Migrations applied", migrations, database
      ? "Redeploy the web service; it runs prisma migrate deploy on boot unless ORBIT_SKIP_MIGRATIONS=true, so check its deploy logs for a migration error."
      : "Fix the database connection first; migrations cannot be checked without it."),
    infra("redis", "Redis reachable", redis, "Add a Redis service and set REDIS_URL=${{Redis.REDIS_URL}} on the web service."),
    infra("browser", "Browser endpoint reachable", browser, endpoint
      ? "The browserless service is not answering: check it is running and PLAYWRIGHT_WS_ENDPOINT on the web service uses its private domain and port 3000."
      : "Add the browserless service and set PLAYWRIGHT_WS_ENDPOINT=ws://${{browserless.RAILWAY_PRIVATE_DOMAIN}}:3000?token=${{browserless.TOKEN}} on the web service."),
    ...envChecks(env, input.origin),
  ];
}
