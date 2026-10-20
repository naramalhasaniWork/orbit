import { NotFoundError } from "@/server/domain/errors";
import { defaultDb, withTransaction, type Db } from "./db";
import { withTenantGuard } from "./tenant-guard";
import { TENANCY, isCreateOp, isWhereOp, modelOf, type Ownership } from "./tenancy";

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

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeError";
  }
}

type Row = Record<string, unknown>;
type Level = "workspace" | "project";

interface Binding {
  level: Level;
  filter: (owner: Ownership) => Row;
  ownerValue: { workspaceId: string; projectId?: string };
}

const isRecord = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
const toArray = (v: unknown): unknown[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function withFilter(where: unknown, filter: Row): Row {
  const base = isRecord(where) ? where : {};
  return { ...base, AND: [...toArray(base.AND), filter] };
}

/** The owner a created row must get, checked against what the caller already set. */
function withOwner(model: string, owner: Ownership, binding: Binding, data: unknown): Row {
  const key = owner.create[binding.level];
  if (!key) throw new ScopeError(`${model} rows cannot be created from a ${binding.level} scope`);
  const value = binding.ownerValue[key];
  const row = isRecord(data) ? data : {};
  const relation = key === "workspaceId" ? "workspace" : "project";

  if (relation in row) {
    const connect = isRecord(row[relation]) ? (row[relation] as Row).connect : undefined;
    if (!isRecord(connect) || connect.id !== value) throw new ScopeError(`${model}.${relation} must connect to this scope`);
    return row;
  }
  if (row[key] !== undefined && row[key] !== value) throw new ScopeError(`${model}.${key} belongs to another tenant`);
  return { ...row, [key]: value };
}

function assertOwnerKept(model: string, owner: Ownership, binding: Binding, data: unknown): void {
  if (!isRecord(data)) return;
  for (const key of ["workspaceId", "projectId"] as const) {
    const value = binding.ownerValue[key];
    if (data[key] !== undefined && value !== undefined && data[key] !== value && owner.keys.includes(key)) {
      throw new ScopeError(`${model}.${key} cannot move to another tenant`);
    }
  }
}

function scopeArgs(model: string, owner: Ownership, binding: Binding, op: string, args: unknown): unknown {
  const a: Row = isRecord(args) ? { ...args } : {};
  const filter = binding.filter(owner);

  if (isWhereOp(op)) {
    a.where = withFilter(a.where, filter);
    if (op.startsWith("update")) assertOwnerKept(model, owner, binding, a.data);
  } else if (op === "upsert") {
    a.where = withFilter(a.where, filter);
    a.create = withOwner(model, owner, binding, a.create);
    assertOwnerKept(model, owner, binding, a.update);
  } else if (isCreateOp(op)) {
    a.data = Array.isArray(a.data)
      ? a.data.map((row) => withOwner(model, owner, binding, row))
      : withOwner(model, owner, binding, a.data);
  }
  return a;
}

function scopedDelegate(model: string, owner: Ownership, binding: Binding, delegate: object): object {
  return new Proxy(delegate, {
    get(target, op) {
      const fn: unknown = Reflect.get(target, op);
      if (typeof op !== "string" || typeof fn !== "function") return fn;
      return (args?: unknown) => {
        let scoped: unknown;
        try {
          scoped = scopeArgs(model, owner, binding, op, args);
        } catch (error) {
          return Promise.reject(error);
        }
        return (fn as (a: unknown) => unknown).call(target, scoped);
      };
    },
  });
}

function scopedClient(base: Db, binding: Binding): Db {
  return new Proxy(base, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (prop === "$transaction" && typeof value === "function") {
        // Interactive transactions stay scoped; the array form only carries already-scoped queries.
        return (arg: unknown, options?: unknown) =>
          typeof arg === "function"
            ? (value as (f: unknown, o?: unknown) => unknown).call(target, (tx: Db) => arg(scopedClient(tx, binding)), options)
            : (value as (a: unknown, o?: unknown) => unknown).call(target, arg, options);
      }
      if (typeof prop !== "string" || prop.startsWith("$") || typeof value !== "object" || value === null) return value;
      const model = modelOf(prop);
      const owner = TENANCY[model];
      return owner ? scopedDelegate(model, owner, binding, value) : value;
    },
  });
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

function projectScope(projectId: string, workspaceId: string, base: Db): ProjectScope {
  const client = scopedClient(base, {
    level: "project",
    filter: (owner) => owner.inProject(projectId, workspaceId),
    ownerValue: { workspaceId, projectId },
  });
  return withMembers<ProjectScope>(client, {
    id: projectId,
    workspaceId,
    tx: <T>(fn: (project: ProjectScope) => Promise<T>) =>
      withTransaction(base, (tx) => fn(projectScope(projectId, workspaceId, tx))),
  });
}

/** A workspace's view of the database. `db` defaults to the shared guarded client; pass a transaction to join it. */
export function forWorkspace(scope: string | { workspaceId: string }, db: Db = guardedDb()): WorkspaceScope {
  const workspaceId = typeof scope === "string" ? scope : scope.workspaceId;
  if (!workspaceId) throw new ScopeError("forWorkspace needs a workspace id");

  const client = scopedClient(db, {
    level: "workspace",
    filter: (owner) => owner.inWorkspace(workspaceId),
    ownerValue: { workspaceId },
  });

  const findProject = async (id: string): Promise<ProjectScope | null> => {
    const row = id ? await client.project.findFirst({ where: { id }, select: { id: true } }) : null;
    return row ? projectScope(id, workspaceId, db) : null;
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
    tx: <T>(fn: (ws: WorkspaceScope) => Promise<T>) => withTransaction(db, (tx) => fn(forWorkspace(workspaceId, tx))),
  });
}

/**
 * The unscoped, unguarded client for workers and the engine, which act for every tenant.
 * Lint restricts the import to src/server/jobs and src/server/engine.
 */
export function forSystem(): Db {
  return defaultDb;
}
