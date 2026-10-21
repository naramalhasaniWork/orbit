import { RELATIONS } from "./relations";
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
}

/** Parent rows a create names, which the scope must still prove are its own. */
export interface ParentCheck {
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

/**
 * Owner keys must stay this scope's; tenant relations take only nested creates and updates
 * (checked the same way) and deletes/disconnects of rows already linked. connect, set,
 * connectOrCreate and upsert can reach any row by id, so they are refused.
 */
function checkWrite(model: string, data: unknown, binding: Binding, mode: "create" | "update"): void {
  if (!isRecord(data)) return;
  const owner = TENANCY[model];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const parent = owner?.parent;
    if (mode === "create" && parent && (key === parent.key || key === parent.relation)) continue;
    const ownerKey = OWNER_KEYS.has(key) || (mode === "update" && Boolean(owner?.keys.includes(key)));
    if (ownerKey) {
      assertOwnerWrite(model, key, value, binding);
      continue;
    }
    const target = RELATIONS[model]?.[key];
    if (target && isTenantModel(target)) checkNested(model, key, target, value, binding);
  }
}

function checkNested(model: string, field: string, target: string, value: unknown, binding: Binding): void {
  if (!isRecord(value)) return;
  for (const [op, arg] of Object.entries(value)) {
    switch (op) {
      case "create":
        toArray(arg).forEach((row) => checkWrite(target, row, binding, "create"));
        break;
      case "createMany":
        toArray(isRecord(arg) ? arg.data : undefined).forEach((row) => checkWrite(target, row, binding, "create"));
        break;
      case "update":
      case "updateMany":
        for (const item of toArray(arg)) {
          const data = isRecord(item) && "data" in item ? item.data : item;
          checkWrite(target, data, binding, "update");
        }
        break;
      case "delete":
      case "deleteMany":
      case "disconnect":
        break;
      default:
        throw new ScopeError(`${model}.${field}: nested ${op} can reach another tenant's ${target}; write it through the scope`);
    }
  }
}

/** A created row with its owner set (or checked), plus the parent id it names, if the model has one. */
function ownedRow(model: string, owner: Ownership, binding: Binding, data: unknown, parents: string[]): Row {
  const row = isRecord(data) ? { ...data } : {};
  const key = owner.create[binding.level];
  if (!key && !owner.parent) throw new ScopeError(`${model} rows cannot be created from a ${binding.level} scope`);

  if (key) {
    const relation = key === "workspaceId" ? "workspace" : "project";
    if (row[relation] !== undefined) assertOwnerWrite(model, relation, row[relation], binding);
    else if (row[key] !== undefined) assertOwnerWrite(model, key, row[key], binding);
    else row[key] = binding.ownerValue[key];
  }
  if (owner.parent) {
    const id = row[owner.parent.key] ?? connectId(row[owner.parent.relation]);
    if (typeof id !== "string") throw new ScopeError(`${model} needs its ${owner.parent.relation}`);
    parents.push(id);
  }
  checkWrite(model, row, binding, "create");
  return row;
}

/** Rewrites one query's args for the scope; `parent` lists rows the caller must verify first. */
export function scopeArgs(
  model: string,
  owner: Ownership,
  binding: Binding,
  op: string,
  args: unknown
): { args: Row; parent?: ParentCheck } {
  const a: Row = isRecord(args) ? { ...args } : {};
  const parents: string[] = [];

  if (isWhereOp(op)) {
    a.where = withFilter(a.where, binding.filter(owner));
    if (op.startsWith("update")) checkWrite(model, a.data, binding, "update");
  } else if (op === "upsert") {
    a.where = withFilter(a.where, binding.filter(owner));
    a.create = ownedRow(model, owner, binding, a.create, parents);
    checkWrite(model, a.update, binding, "update");
  } else if (isCreateOp(op)) {
    a.data = Array.isArray(a.data)
      ? a.data.map((row) => ownedRow(model, owner, binding, row, parents))
      : ownedRow(model, owner, binding, a.data, parents);
  }

  return owner.parent && parents.length
    ? { args: a, parent: { model: owner.parent.model, ids: Array.from(new Set(parents)) } }
    : { args: a };
}
