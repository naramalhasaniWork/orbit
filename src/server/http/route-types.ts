import type { NextRequest } from "next/server";
import type { z, ZodTypeAny } from "zod";
import type { Logger } from "pino";
import type { MemberRole, Permission } from "@/lib/auth/permissions";
import type { OrbitSession } from "@/lib/utils/types";
import type { WorkspaceScope } from "@/server/data/scope";

/** Throws AuthError when the signature does not verify. Gets the raw body, since signatures cover exact bytes. */
export type WebhookVerifier = (req: NextRequest, rawBody: string) => void | Promise<void>;

export type RouteAuth = "session" | "apiKey" | "sessionOrApiKey" | "public" | { webhook: WebhookVerifier };

export interface RateLimitSpec {
  /** Names the bucket, so two routes never share one. */
  scope: string;
  limit: number;
  windowSec?: number;
  /** Who shares a bucket: the workspace (default, falling back to the client IP) or the signed-in user. */
  per?: "workspace" | "user";
}

export interface RouteSpec {
  /** Default "session". */
  auth?: RouteAuth;
  /** Where the workspace comes from: the session (default) or a path param. */
  workspace?: "session" | "param";
  /** Path param holding the workspace id when `workspace` is "param". Default "workspaceId". */
  workspaceParam?: string;
  /** Needs a session (role from the membership read); not allowed with auth "apiKey". */
  permission?: Permission;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
  rateLimit?: RateLimitSpec;
  /** Domain error mapping tried before the standard one; return null to fall through. */
  onError?: (error: unknown) => Response | null;
  /** Honour an Idempotency-Key header (Redis, 24h). */
  idempotent?: boolean;
}

type AuthOf<S> = S extends { auth: infer A } ? A : "session";
type IsAnonymous<A> = A extends "public" | { webhook: WebhookVerifier } ? true : false;

type SessionOf<A> = A extends "apiKey" ? null : A extends "sessionOrApiKey" ? OrbitSession | null : OrbitSession;

export interface AuthInfo<A> {
  userId: A extends "apiKey" ? null : A extends "sessionOrApiKey" ? string | null : string;
  role: MemberRole | null;
  memberId: A extends "apiKey" ? null : A extends "sessionOrApiKey" ? string | null : string;
  via: A extends "apiKey" ? "apiKey" : A extends "sessionOrApiKey" ? "session" | "apiKey" : "session";
}

interface BaseContext<S> {
  req: NextRequest;
  params: S extends { params: infer P extends ZodTypeAny } ? z.output<P> : Record<string, string>;
  query: S extends { query: infer Q extends ZodTypeAny } ? z.output<Q> : Record<string, string | string[]>;
  body: S extends { body: infer B extends ZodTypeAny } ? z.output<B> : undefined;
  /** The unparsed body; set for webhook routes only (their handler cannot read the stream again). */
  rawBody: string | null;
  requestId: string;
  log: Logger;
}

interface WorkspaceContext<A> {
  workspaceId: string;
  /** The caller's workspace view of the database; `await ctx.db.project(id)` for project rows. */
  db: WorkspaceScope;
  session: SessionOf<A>;
  auth: AuthInfo<A>;
}

export type RouteContext<S extends RouteSpec> = BaseContext<S> &
  (IsAnonymous<AuthOf<S>> extends true ? { auth: null; db: null } : WorkspaceContext<AuthOf<S>>);

/** A handler returns a Response (apiSuccess/apiError) or a plain value, which is sent as apiSuccess(value). */
export type RouteHandler<S extends RouteSpec> = (ctx: RouteContext<S>) => unknown;

/** Second argument Next passes to every route handler. */
export interface RouteSegment {
  params: Promise<Record<string, string>> | Record<string, string>;
}
