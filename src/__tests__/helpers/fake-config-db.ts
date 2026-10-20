import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";

/**
 * In-memory stand-in for the Prisma calls the config repos make (server/data/*):
 * workspaces, projects, integration configs, webhook endpoints, project notes, the
 * atomic jsonb settings patch ($executeRaw) and the migration row lock ($queryRaw).
 * Every raw statement is kept in `raw` so tests can assert its SQL shape.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as Row;
      if ("equals" in c) return c.equals === Prisma.DbNull ? row[key] === null || row[key] === undefined : row[key] === c.equals;
      if ("not" in c) return row[key] !== c.not;
    }
    return row[key] === cond;
  });
}

function pick(row: Row, select?: Record<string, unknown>): Row {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]]));
}

function normalize(data: Row): Row {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === Prisma.DbNull ? null : v]));
}

function table(rows: Row[], defaults: () => Row, key: (row: Row) => string = (r) => String(r.id)) {
  const insert = (data: Row): Row => {
    const now = new Date();
    const row: Row = { ...defaults(), createdAt: now, updatedAt: now, ...normalize(data) };
    row.id ??= randomUUID();
    rows.push(row);
    return row;
  };
  return {
    rows,
    findMany: async ({ where, select }: { where?: Where; select?: Row } = {}) =>
      rows.filter((r) => matches(r, where)).map((r) => pick(r, select)),
    findFirst: async ({ where, select }: { where?: Where; select?: Row } = {}) => {
      const row = rows.find((r) => matches(r, where));
      return row ? pick(row, select) : null;
    },
    create: async ({ data, select }: { data: Row; select?: Row }) => pick(insert(data), select),
    createMany: async ({ data, skipDuplicates }: { data: Row[]; skipDuplicates?: boolean }) => {
      let count = 0;
      for (const item of data) {
        const probe = { ...defaults(), ...item, id: item.id ?? "" };
        if (rows.some((r) => key(r) === key(probe) || (item.id && r.id === item.id))) {
          if (!skipDuplicates) throw new Error("unique violation");
          continue;
        }
        insert(item);
        count++;
      }
      return { count };
    },
    updateMany: async ({ where, data }: { where: Where; data: Row }) => {
      const hits = rows.filter((r) => matches(r, where));
      for (const r of hits) Object.assign(r, normalize(data), { updatedAt: new Date() });
      return { count: hits.length };
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error("P2025");
      return Object.assign(row, normalize(data));
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1);
      return { count: before - rows.length };
    },
    insert,
  };
}

export function createFakeConfigDb() {
  const workspaces: Row[] = [];
  const projects: Row[] = [];
  const raw: Prisma.Sql[] = [];

  const integrationConfig = table(
    [],
    () => ({ status: "connected", isEnabled: true, credentialsSealed: null, settings: {}, externalAccountId: null, displayName: null }),
    (r) => `${r.workspaceId}:${r.provider}`
  );
  const webhookEndpoint = table([], () => ({ isEnabled: true, events: [], secretSealed: null, projectId: null }));
  const projectNote = table([], () => ({ category: "context", active: true }));
  const webhookDelivery = table([], () => ({ endpointId: null, attempts: 0 }));

  const byId = (rows: Row[]) => async ({ where, select }: { where: { id: string }; select?: Row }) => {
    const row = rows.find((r) => r.id === where.id);
    return row ? pick(row, select) : null;
  };

  function applySettingsSql(sql: Prisma.Sql): number {
    const [patchJson, remove, ...keys] = sql.values as [string, string[], ...string[]];
    const merge = (row: Row) => {
      const next: Row = { ...((row.settings as Row) ?? {}), ...JSON.parse(patchJson) };
      for (const k of remove) delete next[k];
      row.settings = next;
    };
    let target: Row[] = [];
    if (sql.sql.includes('"projects"')) target = projects.filter((r) => r.id === keys[0]);
    else if (sql.sql.includes('"workspaces"')) target = workspaces.filter((r) => r.id === keys[0]);
    else if (sql.sql.includes('"integration_configs"')) {
      target = integrationConfig.rows.filter(
        (r) => r.workspaceId === keys[0] && r.provider === keys[1] && r.status === "connected" && r.credentialsSealed
      );
    }
    target.forEach(merge);
    return target.length;
  }

  const client = {
    workspace: {
      findUnique: byId(workspaces),
      findMany: async ({ select }: { select?: Row } = {}) => workspaces.map((r) => pick(r, select)),
    },
    project: {
      findUnique: byId(projects),
      findFirst: async ({ where, select }: { where?: Where; select?: Row } = {}) => {
        const row = projects.find((r) => matches(r, where));
        return row ? pick(row, select) : null;
      },
      findMany: async ({ select }: { select?: Row } = {}) => projects.map((r) => pick(r, select)),
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = projects.find((r) => r.id === where.id);
        if (!row) throw new Error("P2025");
        return Object.assign(row, data);
      },
    },
    integrationConfig: {
      ...integrationConfig,
      findUnique: async ({ where, select }: { where: { integration_config_unique: Row }; select?: Row }) => {
        const row = integrationConfig.rows.find((r) => matches(r, where.integration_config_unique));
        return row ? pick(row, select) : null;
      },
      upsert: async ({ where, create, update }: { where: { integration_config_unique: Row }; create: Row; update: Row }) => {
        const row = integrationConfig.rows.find((r) => matches(r, where.integration_config_unique));
        return row ? Object.assign(row, normalize(update)) : integrationConfig.insert(create);
      },
    },
    webhookEndpoint,
    projectNote,
    webhookDelivery,
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Prisma.sql(strings, ...values);
      raw.push(sql);
      return applySettingsSql(sql);
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Prisma.sql(strings, ...values);
      raw.push(sql);
      const row = projects.find((r) => r.id === sql.values[0]);
      return row ? [{ workspaceId: row.workspaceId, settings: row.settings }] : [];
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const { $transaction: _nested, ...tx } = client;
      return fn(tx);
    },
  };

  const fake = {
    prisma: client,
    raw,
    workspaces,
    projects,
    integrations: integrationConfig.rows,
    endpoints: webhookEndpoint.rows,
    notes: projectNote.rows,
    deliveries: webhookDelivery.rows,
    reset: () => {
      for (const rows of [workspaces, projects, raw, integrationConfig.rows, webhookEndpoint.rows, projectNote.rows, webhookDelivery.rows]) {
        rows.length = 0;
      }
    },
    addWorkspace: (id: string, settings: Row = {}) => {
      workspaces.push({ id, settings, createdAt: new Date() });
    },
    addProject: (id: string, workspaceId: string, settings: Row = {}) => {
      projects.push({ id, workspaceId, settings, name: id, createdAt: new Date() });
    },
  };
  registry.set(client, fake);
  return fake;
}

export type FakeConfigDb = ReturnType<typeof createFakeConfigDb>;

const registry = new WeakMap<object, FakeConfigDb>();

/**
 * The fake behind a mocked `prisma`, for tests that mock @/lib/db with
 *   vi.mock("@/lib/db", async () => ({ prisma: (await import("../helpers/fake-config-db")).createFakeConfigDb().prisma }));
 */
export function fakeOf(client: unknown): FakeConfigDb {
  const fake = registry.get(client as object);
  if (!fake) throw new Error("not a fake config db client");
  return fake;
}
