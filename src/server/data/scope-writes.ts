import { FOREIGN_KEYS, RELATIONS } from "./relations";
import { TENANCY, isCreateOp, isWhereOp, type Ownership } from "./tenancy";

/**
 * How a scope rewrites and checks one query's arguments (see scope.ts): the owner filter goes
 * into every where, creates get their owner, and no write may point a row, or a nested row,
 * at another tenant.
 */

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeError";
  }
}

type Row = Record<string, unknown>;

export interface Binding {
  level: "workspace" | "project";
  filter: (owner: Ownership) => Row;
  ownerValue: { workspaceId: string; projectId?: string };
  /** A user already known to be a member (the caller), so naming them needs no lookup. */
  memberUserId?: string;
}

/** Rows a write names by id; "User" ids must belong to members of the scope's workspace. */
export interface Reference {
  model: string;
  ids: string[];
}

const isRecord = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
const toArray = (v: unknown): unknown[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const OWNER_KEYS = new Set(["workspaceId", "projectId", "workspace", "project"]);
const isTenantModel = (model: string) => model === "Workspace" || Boolean(TENANCY[model]);

function withFilter(where: unknown, filter: Row): Row {
  const base = isRecord(where) ? where : {};
  return { ...base, AND: [...toArray(base.AND), filter] };
}

/** `{ connect: { id } }` and nothing else, or undefined. */
function connectId(value: unknown): string | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !isRecord(value.connect)) return undefined;
  const id = value.connect.id;
  return typeof id === "string" && Object.keys(value.connect).length === 1 ? id : undefined;
}

/** A scalar write: the value itself, or `{ set: value }`. */
function scalarValue(value: unknown): unknown {
  return isRecord(value) && "set" in value ? value.set : value;
}

/** The scope's own value for an owner key, or undefined when that key cannot be written at this level. */
function ownValue(key: string, binding: Binding): string | undefined {
  if (key === "workspaceId" || key === "workspace") return binding.ownerValue.workspaceId;
  if ((key === "projectId" || key === "project") && binding.level === "project") return binding.ownerValue.projectId;
  return undefined;
}

function assertOwnerWrite(model: string, key: string, value: unknown, binding: Binding): void {
  const own = ownValue(key, binding);
  const given = key === "workspace" || key === "project" ? connectId(value) : scalarValue(value);
  if (own === undefined || given !== own) {
    throw new ScopeError(`${model}.${key} cannot point outside this ${binding.level} scope`);
  }
}

/** Rows a write names by id, which the scope must see before the write runs. */
class References {
  private readonly ids = new Map<string, Set<string>>();

  add(model: string, id: unknown, where: string): void {
    if (id === null) return;
    if (typeof id !== "string") throw new ScopeError(`${where} must be an id`);
    if (!this.ids.has(model)) this.ids.set(model, new Set());
    this.ids.get(model)?.add(id);
  }

  list(): Reference[] {
    return Array.from(this.ids, ([model, ids]) => ({ model, ids: Array.from(ids) }));
  }
}

/** A foreign key worth proving: a tenant row, or a user (who must be a member of the workspace). */
const isCheckedTarget = (model: string) => model === "User" || Boolean(TENANCY[model]);

/**
 * Owner keys must stay this scope's. Every foreign key and connect to a tenant row or a user is
 * collected for the scope to verify. Tenant relations take only nested creates and updates
 * (checked the same way) and deletes/disconnects of rows already linked; set, connectOrCreate
 * and upsert can reach any row, so they are refused.
 */
function checkWrite(model: string, data: unknown, binding: Binding, mode: "create" | "update", refs: References): void {
  if (!isRecord(data)) return;
  const owner = TENANCY[model];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const where = `${model}.${key}`;

    // A workspace-owned row may name one of the workspace's projects when it is created.
    if (mode === "create" && binding.level === "workspace" && owner?.create.workspace && (key === "projectId" || key === "project")) {
      refs.add("Project", key === "project" ? connectId(value) ?? {} : scalarValue(value), where);
      continue;
    }
    // A created child names its parent by key or connect; the parent is verified like any reference.
    if (mode === "create" && owner?.parent?.relation === key) {
      refs.add(owner.parent.model, connectId(value) ?? {}, where);
      continue;
    }
    if (OWNER_KEYS.has(key) || (mode === "update" && Boolean(owner?.keys.includes(key)))) {
      assertOwnerWrite(model, key, value, binding);
      continue;
    }
    const fkTarget = FOREIGN_KEYS[model]?.[key];
    if (fkTarget) {
      if (isCheckedTarget(fkTarget)) refs.add(fkTarget, scalarValue(value), where);
      continue;
    }
    const target = RELATIONS[model]?.[key];
    if (target && (isTenantModel(target) || target === "User")) checkNested(model, key, target, value, binding, refs);
  }
}

function checkNested(model: string, field: string, target: string, value: unknown, binding: Binding, refs: References): void {
  if (!isRecord(value)) return;
  const where = `${model}.${field}`;
  for (const [op, arg] of Object.entries(value)) {
    if (target === "User" && op !== "connect" && op !== "disconnect") {
      throw new ScopeError(`${where}: nested ${op} on users is not allowed from a tenant scope`);
    }
    switch (op) {
      case "connect":
        if (target !== "User") throw new ScopeError(`${where}: nested connect can reach another tenant's ${target}`);
        toArray(arg).forEach((item) => refs.add("User", isRecord(item) ? item.id : undefined, where));
        break;
      case "create":
        toArray(arg).forEach((row) => checkWrite(target, row, binding, "create", refs));
        break;
      case "createMany":
        toArray(isRecord(arg) ? arg.data : undefined).forEach((row) => checkWrite(target, row, binding, "create", refs));
        break;
      case "update":
      case "updateMany":
        for (const item of toArray(arg)) {
          const data = isRecord(item) && "data" in item ? item.data : item;
          checkWrite(target, data, binding, "update", refs);
        }
        break;
      case "delete":
      case "deleteMany":
      case "disconnect":
        break;
      default:
        throw new ScopeError(`${where}: nested ${op} can reach another tenant's ${target}; write it through the scope`);
    }
  }
}

/** A created row with its owner set (or checked); child rows must name their parent. */
function ownedRow(model: string, owner: Ownership, binding: Binding, data: unknown, refs: References): Row {
  const row = isRecord(data) ? { ...data } : {};
  const key = owner.create[binding.level];
  if (!key && !owner.parent) throw new ScopeError(`${model} rows cannot be created from a ${binding.level} scope`);

  if (key) {
    const relation = key === "workspaceId" ? "workspace" : "project";
    if (row[relation] !== undefined) assertOwnerWrite(model, relation, row[relation], binding);
    else if (row[key] !== undefined) assertOwnerWrite(model, key, row[key], binding);
    else row[key] = binding.ownerValue[key];
  }
  if (owner.parent && row[owner.parent.key] == null && row[owner.parent.relation] === undefined) {
    throw new ScopeError(`${model} needs its ${owner.parent.relation}`);
  }
  checkWrite(model, row, binding, "create", refs);
  return row;
}

/** Rewrites one query's args for the scope; `references` must be verified before it runs. */
export function scopeArgs(
  model: string,
  owner: Ownership,
  binding: Binding,
  op: string,
  args: unknown
): { args: Row; references: Reference[] } {
  const a: Row = isRecord(args) ? { ...args } : {};
  const refs = new References();

  if (isWhereOp(op)) {
    a.where = withFilter(a.where, binding.filter(owner));
    if (op.startsWith("update")) checkWrite(model, a.data, binding, "update", refs);
  } else if (op === "upsert") {
    a.where = withFilter(a.where, binding.filter(owner));
    a.create = ownedRow(model, owner, binding, a.create, refs);
    checkWrite(model, a.update, binding, "update", refs);
  } else if (isCreateOp(op)) {
    a.data = Array.isArray(a.data)
      ? a.data.map((row) => ownedRow(model, owner, binding, row, refs))
      : ownedRow(model, owner, binding, a.data, refs);
  }
  const references = refs
    .list()
    .map((r) => (r.model === "User" ? { ...r, ids: r.ids.filter((id) => id !== binding.memberUserId) } : r))
    .filter((r) => r.ids.length > 0);
  return { args: a, references };
}
