import { NotFoundError } from "@/server/domain/errors";
import { defaultDb, withTransaction, type Db } from "./db";
import { withTenantGuard } from "./tenant-guard";
import { ScopeError, scopeArgs, type Binding, type Reference } from "./scope-writes";
import { GLOBAL_MODELS, TENANCY, modelOf, type Ownership } from "./tenancy";

const KNOWN_MODELS = new Set([...Object.keys(TENANCY), ...Array.from(GLOBAL_MODELS)]);
const delegateOf = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

/**
 * Tenant-scoped data access. A scope is a Prisma client whose every query gets its owner
 * filter added (workspaceId, projectId or the owning relation, per tenancy.ts), so a row of
 * another tenant reads as missing and can never be updated or deleted. Raw SQL ($queryRaw,
 * $executeRaw) passes through unscoped and must filter by itself.
 *
 *   const keys = await ctx.db.apiKey.findMany();          // this workspace's keys
 *   const project = await ctx.db.project(projectId);      // NotFound across tenants
 *   const run = await project.testRun.findUnique({ where: { id: runId } });
 */

export interface ProjectScope extends Db {
  readonly id: string;
  readonly workspaceId: string;
  tx<T>(fn: (project: ProjectScope) => Promise<T>): Promise<T>;
}

/** `ctx.db.project(id)` opens a project; `ctx.db.project.findMany()` lists this workspace's. */
type ProjectDoor = Db["project"] & ((id: string) => Promise<ProjectScope>);

export interface WorkspaceScope extends Omit<Db, "project"> {
  readonly workspaceId: string;
  /** The only door to a project's rows: calling it throws NotFoundError outside this workspace. */
  project: ProjectDoor;
  /** project(id) for handlers outside route() that answer a missing project themselves. */
  findProject(id: string): Promise<ProjectScope | null>;
  tx<T>(fn: (ws: WorkspaceScope) => Promise<T>): Promise<T>;
}

export { ScopeError } from "./scope-writes";

/** The workspace row itself: readable and updatable by its own scope only, never created or deleted. */
const OWN_WORKSPACE: Ownership = {
  keys: ["id"],
  inWorkspace: (workspaceId) => ({ id: workspaceId }),
  inProject: (_projectId, workspaceId) => ({ id: workspaceId }),
  create: {},
};
const WORKSPACE_DENIED = new Set(["create", "createMany", "createManyAndReturn", "upsert", "delete", "deleteMany"]);

/** Platform tables a tenant may read but never write. Anything else global needs a repo. */
const GLOBAL_READ_ONLY = new Set(["ModelRegistry", "GlobalModelPolicy", "EmbeddingConfig"]);
const READ_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
]);

/** Raw SQL stays available to repos (it must filter by itself); no other $-member is exposed. */
const PASSTHROUGH = new Set(["$queryRaw", "$executeRaw"]);

type Call = (args?: unknown) => unknown;
type Counter = Record<string, { count(args: unknown): Promise<number> }>;

function refuse(message: string): Call {
  return () => Promise.reject(new ScopeError(message));
}

function scopedDelegate(model: string, owner: Ownership, binding: Binding, delegate: object, client: Db): object {
  return new Proxy(delegate, {
    get(target, op) {
      const fn: unknown = Reflect.get(target, op);
      if (typeof op !== "string" || typeof fn !== "function") return fn;
      if (model === "Workspace" && WORKSPACE_DENIED.has(op)) return refuse(`Workspace.${op} is not allowed from a tenant scope`);
      return (args?: unknown) => {
        let scoped: ReturnType<typeof scopeArgs>;
        try {
          scoped = scopeArgs(model, owner, binding, op, args);
        } catch (error) {
          return Promise.reject(error);
        }
        const run = () => (fn as Call).call(target, scoped.args);
        if (!scoped.references.length) return run();
        return verifyReferences(client, model, scoped.references).then(run);
      };
    },
  });
}

/**
 * Every row a write names (a parent, a foreign key, a connected user) must be visible to this
 * scope, so a write can never link into another tenant. Users count when they are members.
 */
async function verifyReferences(client: Db, model: string, references: Reference[]): Promise<void> {
  const counters = client as unknown as Counter;
  await Promise.all(
    references.map(async ({ model: target, ids }) => {
      const found =
        target === "User"
          ? await counters.workspaceMember.count({ where: { userId: { in: ids } } })
          : await counters[delegateOf(target)].count({ where: { id: { in: ids } } });
      if (found !== ids.length) throw new ScopeError(`${model}: a referenced ${target} is not in this scope`);
    })
  );
}

function readOnlyDelegate(model: string, delegate: object): object {
  return new Proxy(delegate, {
    get(target, op) {
      const fn: unknown = Reflect.get(target, op);
      if (typeof op !== "string" || typeof fn !== "function") return fn;
      return READ_OPS.has(op) ? (fn as Call).bind(target) : refuse(`${model} is read-only from a tenant scope`);
    },
  });
}

/**
 * Exposes tenant models (filtered), the scope's own workspace row, and read-only platform
 * tables. Other global models throw, so a route cannot reach users, sessions or billing events
 * through ctx.db by accident.
 */
function scopedClient(base: Db, binding: Binding): Db {
  const client: Db = new Proxy(base, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (typeof prop !== "string") return value;
      if (prop === "$transaction" && typeof value === "function") {
        // Interactive transactions stay scoped; the array form only carries already-scoped queries.
        return (arg: unknown, options?: unknown) =>
          typeof arg === "function"
            ? (value as (f: unknown, o?: unknown) => unknown).call(target, (tx: Db) => arg(scopedClient(tx, binding)), options)
            : (value as (a: unknown, o?: unknown) => unknown).call(target, arg, options);
      }
      if (prop.startsWith("$")) return PASSTHROUGH.has(prop) && typeof value === "function" ? value.bind(target) : undefined;

      const model = modelOf(prop);
      if (typeof value !== "object" || value === null) {
        if (KNOWN_MODELS.has(model)) throw new ScopeError(`${model} is not on this client`);
        return value;
      }
      const owner = model === "Workspace" ? OWN_WORKSPACE : TENANCY[model];
      if (owner) return scopedDelegate(model, owner, binding, value, client);
      if (GLOBAL_READ_ONLY.has(model)) return readOnlyDelegate(model, value);
      if (KNOWN_MODELS.has(model)) throw new ScopeError(`${model} is not reachable from a tenant scope; use a repo`);
      return value;
    },
  });
  return client;
}

/** The scoped client plus the scope's own members (id, tx, ...), which win over model names. */
function withMembers<T extends object>(client: Db, members: Record<string, unknown>): T {
  return new Proxy(client, {
    get: (target, prop) => (typeof prop === "string" && prop in members ? members[prop] : Reflect.get(target, prop)),
  }) as unknown as T;
}

let guarded: Db | undefined;
/** The shared client with tenantGuard on; scopes sit on top of it. */
function guardedDb(): Db {
  guarded ??= withTenantGuard(defaultDb);
  return guarded;
}

function projectScope(projectId: string, workspaceId: string, base: Db, memberUserId?: string): ProjectScope {
  const client = scopedClient(base, {
    level: "project",
    filter: (owner) => owner.inProject(projectId, workspaceId),
    ownerValue: { workspaceId, projectId },
    memberUserId,
  });
  return withMembers<ProjectScope>(client, {
    id: projectId,
    workspaceId,
    tx: <T>(fn: (project: ProjectScope) => Promise<T>) =>
      withTransaction(base, (tx) => fn(projectScope(projectId, workspaceId, tx, memberUserId))),
  });
}

export interface WorkspaceRef {
  workspaceId: string;
  /** The caller, when route() has just read their membership; writes naming them skip the member check. */
  memberUserId?: string;
}

/** A workspace's view of the database. `db` defaults to the shared guarded client; pass a transaction to join it. */
export function forWorkspace(scope: string | WorkspaceRef, db: Db = guardedDb()): WorkspaceScope {
  const { workspaceId, memberUserId } = typeof scope === "string" ? { workspaceId: scope, memberUserId: undefined } : scope;
  if (!workspaceId) throw new ScopeError("forWorkspace needs a workspace id");

  const client = scopedClient(db, {
    level: "workspace",
    filter: (owner) => owner.inWorkspace(workspaceId),
    ownerValue: { workspaceId },
    memberUserId,
  });

  const findProject = async (id: string): Promise<ProjectScope | null> => {
    const row = id ? await client.project.findFirst({ where: { id }, select: { id: true } }) : null;
    return row ? projectScope(id, workspaceId, db, memberUserId) : null;
  };
  const openProject = async (id: string): Promise<ProjectScope> => {
    const project = await findProject(id);
    if (!project) throw new NotFoundError("Project not found");
    return project;
  };
  // Callable to open a project, and still the (scoped) project delegate for lists and updates.
  const project = new Proxy(openProject, { get: (_fn, op) => Reflect.get(client.project, op) });

  return withMembers<WorkspaceScope>(client, {
    workspaceId,
    project,
    findProject,
    tx: <T>(fn: (ws: WorkspaceScope) => Promise<T>) => withTransaction(db, (tx) => fn(forWorkspace({ workspaceId, memberUserId }, tx))),
  });
}

/**
 * The unscoped, unguarded client for workers and the engine, which act for every tenant.
 * Lint restricts the import to src/server/jobs and src/server/engine.
 */
export function forSystem(): Db {
  return defaultDb;
}
