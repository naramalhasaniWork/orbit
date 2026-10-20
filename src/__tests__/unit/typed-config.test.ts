import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ENCRYPTION_KEY = "d".repeat(64);

vi.mock("@/lib/db", async () => ({
  prisma: (await import("../helpers/fake-config-db")).createFakeConfigDb().prisma,
}));

import { prisma } from "@/lib/db";
import { fakeOf } from "../helpers/fake-config-db";
import { openSecret, sealSecret } from "@/lib/integrations/secret-field";
import { LegacyNoteSchema, parseIntegrationSettings, parseLegacyList } from "@/server/domain/config";
import { parseProjectSettings, parseWorkspaceSettings, patchProjectSettings } from "@/server/data/settings-repo";
import { getIntegration, resolveProjectIntegration } from "@/server/data/integration-repo";
import { legacyReadCounts, resetLegacyReadCounts } from "@/server/data/legacy-reads";
import { activeProjectNotes, deleteProjectNote, listProjectNotes } from "@/server/data/project-note-repo";
import { deliverableEndpoints } from "@/server/data/webhook-endpoint-repo";
import { runBackfill } from "../../../prisma/backfills/20261025_integrations";

const db = fakeOf(prisma);
const NOTE_ID = "6f1c1d1e-0000-4000-8000-000000000001";
const HOOK_ID = "6f1c1d1e-0000-4000-8000-0000000000aa";

beforeEach(() => {
  db.reset();
  resetLegacyReadCounts();
});

describe("settings parse fallbacks", () => {
  it("project settings: malformed known keys read as unset, unknown keys pass through", () => {
    const parsed = parseProjectSettings({ schemaVersion: "x", autoSync: "yes", criticalPaths: [1], extra: { a: 1 } });
    expect(parsed).toMatchObject({ schemaVersion: 1, extra: { a: 1 } });
    expect(parsed.autoSync).toBeUndefined();
    expect(parsed.criticalPaths).toBeUndefined();
  });

  it("non-object settings fall back to defaults", () => {
    expect(parseProjectSettings("nope")).toEqual({ schemaVersion: 1 });
    expect(parseWorkspaceSettings(null)).toEqual({ schemaVersion: 1 });
    expect(parseWorkspaceSettings({ customPrompt: 3, linear: "x" })).toEqual({ schemaVersion: 1 });
  });

  it("integration settings fall back to the provider's defaults", () => {
    expect(parseIntegrationSettings("slack", "garbage")).toMatchObject({
      provider: "slack",
      notifications: { runCompleted: true, testFailed: true },
    });
    expect(parseIntegrationSettings("linear", { provider: "slack", autoCreateIssues: "no" })).toMatchObject({
      provider: "linear",
      autoCreateIssues: true,
    });
  });

  it("legacy lists keep the valid entries only", () => {
    const notes = parseLegacyList(LegacyNoteSchema, [{ content: "a", category: "weird" }, { nope: 1 }, "x"]);
    expect(notes).toEqual([{ content: "a", category: "context", active: true }]);
  });
});

describe("atomic settings patch", () => {
  it("is one parameterized UPDATE merging with || and removing with - text[]", async () => {
    db.addProject("p1", "w1", { keep: true });
    await patchProjectSettings("p1", { autoSync: true }, ["stale"]);

    const [sql] = db.raw;
    expect(sql.text).toMatch(/^\s*UPDATE "projects"\s+SET "settings" = \(COALESCE\("settings", '\{\}'::jsonb\) \|\| \$1::jsonb\) - \$2::text\[\]/);
    expect(sql.text).toContain('WHERE "id" = $3::uuid');
    expect(sql.values).toEqual([JSON.stringify({ autoSync: true }), ["stale"], "p1"]);
  });

  it("two concurrent patches to different keys both survive (no read-modify-write)", async () => {
    db.addProject("p1", "w1", { keep: true });
    const findUnique = vi.spyOn(db.prisma.project, "findUnique");

    await Promise.all([patchProjectSettings("p1", { a: 1 }), patchProjectSettings("p1", { b: 2 })]);

    expect(db.projects[0].settings).toEqual({ keep: true, a: 1, b: 2 });
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("integration repo dual-read", () => {
  it("falls back to legacy workspace.settings, counted, until a typed row exists", async () => {
    db.addWorkspace("w1", { slackWebhookUrl: sealSecret("https://hooks.slack.com/services/A/B/C"), slack: { notifications: { runCompleted: false } } });
    db.addProject("p1", "w1");

    const legacy = await resolveProjectIntegration("p1", "slack");
    expect(legacy?.secret).toBe("https://hooks.slack.com/services/A/B/C");
    expect(legacy?.settings.notifications).toEqual({ runCompleted: false, testFailed: true });
    expect(legacyReadCounts()).toEqual({ "workspace.slack": 1 });

    // A disconnect recorded in the table wins over the stale legacy key
    db.integrations.push({ workspaceId: "w1", provider: "slack", status: "disconnected", credentialsSealed: null, settings: {} });
    expect((await resolveProjectIntegration("p1", "slack"))?.secret).toBeNull();
    expect(await getIntegration("w1", "slack")).toMatchObject({ connected: false, status: "disconnected" });
  });

  it("a seeded pre-W3 row without credentials still defers to the legacy keys", async () => {
    db.addWorkspace("w1", { linearApiKey: "lin_plain", linearTeamId: "team-1" });
    db.integrations.push({ workspaceId: "w1", provider: "linear", status: "connected", credentialsSealed: null, settings: {} });
    expect(await getIntegration("w1", "linear")).toMatchObject({ connected: true, externalAccountId: "team-1" });
  });

  it("legacy per-project Linear overrides apply part by part", async () => {
    db.addWorkspace("w1");
    db.addProject("p1", "w1", { linearTeamId: "project-team" });
    db.integrations.push({
      workspaceId: "w1", provider: "linear", status: "connected",
      credentialsSealed: sealSecret("ws_key"), externalAccountId: "ws-team", settings: {},
    });
    expect(await resolveProjectIntegration("p1", "linear")).toMatchObject({ secret: "ws_key", externalAccountId: "project-team" });
    expect(legacyReadCounts()).toEqual({ "project.linear": 1 });
  });
});

describe("20261025 backfill", () => {
  function seedLegacy() {
    db.addWorkspace("w1", {
      linearApiKey: "lin_plain",
      linearTeamId: "team-1",
      linear: { connected: true, teamName: "Eng", autoCreateIssues: false },
      slackWebhookUrl: sealSecret("https://hooks.slack.com/services/A/B/C"),
    });
    db.addWorkspace("w2");
    db.addProject("p1", "w1", {
      customRules: ["keep"],
      testingNotes: [
        { id: NOTE_ID, content: "use staging creds", category: "instruction", active: true, createdAt: "2026-01-01T00:00:00Z" },
        { id: "n-legacy", content: "old", active: false },
        { broken: true },
      ],
      webhooks: [
        { id: HOOK_ID, url: "https://example.com/a", events: ["run.started"], secret: "plain_secret" },
        { url: "https://example.com/b", events: ["run.completed"], enabled: false, secretSealed: sealSecret("s2") },
      ],
      slackWebhookUrl: "https://hooks.slack.com/services/P/R/OJ",
    });
    db.addProject("p2", "w2", { linearApiKey: "p2_key", linearTeamId: "p2-team" });
  }

  it("moves integrations, webhooks and notes, sealing plaintext and keeping ids", async () => {
    seedLegacy();
    const report = await runBackfill(prisma);

    expect(report).toEqual({ integrations: 2, promoted: 1, conflicts: ["p1:slack"], projects: 2, notes: 2, endpoints: 2 });

    const linear = db.integrations.find((r) => r.workspaceId === "w1" && r.provider === "linear");
    expect(linear).toMatchObject({ status: "connected", externalAccountId: "team-1", displayName: "Eng" });
    expect(linear?.credentialsSealed).toHaveProperty("iv");
    expect(openSecret(linear?.credentialsSealed)).toBe("lin_plain");
    expect(linear?.settings).toMatchObject({ provider: "linear", autoCreateIssues: false });

    const promoted = db.integrations.find((r) => r.workspaceId === "w2");
    expect(promoted).toMatchObject({ provider: "linear", externalAccountId: "p2-team" });
    expect(openSecret(promoted?.credentialsSealed)).toBe("p2_key");

    expect(db.endpoints.map((e) => [e.id, e.url, e.isEnabled, e.workspaceId])).toEqual([
      [HOOK_ID, "https://example.com/a", true, "w1"],
      [expect.stringMatching(/^[0-9a-f-]{36}$/), "https://example.com/b", false, "w1"],
    ]);
    expect(db.endpoints[0].secretSealed).toHaveProperty("iv");
    expect(openSecret(db.endpoints[0].secretSealed)).toBe("plain_secret");

    expect(db.notes.map((n) => [n.id, n.content, n.category, n.active])).toEqual([
      [NOTE_ID, "use staging creds", "instruction", true],
      [expect.stringMatching(/^[0-9a-f-]{36}$/), "old", "context", false],
    ]);

    // Old keys stay for the dual-read release; the version marks the move
    expect(db.projects[0].settings).toMatchObject({ schemaVersion: 2, customRules: ["keep"] });
    expect(db.projects[0].settings).toHaveProperty("webhooks");
    expect(db.projects[0].settings).toHaveProperty("testingNotes");
    expect(db.workspaces[0].settings).toHaveProperty("linearApiKey");
  });

  it("is idempotent: a second run changes nothing", async () => {
    seedLegacy();
    await runBackfill(prisma);
    const snapshot = JSON.stringify([db.integrations, db.endpoints, db.notes, db.projects, db.workspaces]);

    const second = await runBackfill(prisma);

    expect(second).toEqual({ integrations: 0, promoted: 0, conflicts: [], projects: 0, notes: 0, endpoints: 0 });
    expect(JSON.stringify([db.integrations, db.endpoints, db.notes, db.projects, db.workspaces])).toBe(snapshot);
  });

  it("never overwrites a connection the new routes wrote", async () => {
    seedLegacy();
    db.integrations.push({
      workspaceId: "w1", provider: "linear", status: "connected",
      credentialsSealed: sealSecret("new_key"), externalAccountId: "new-team", settings: {},
    });
    await runBackfill(prisma);
    const linear = db.integrations.filter((r) => r.workspaceId === "w1" && r.provider === "linear");
    expect(linear).toHaveLength(1);
    expect(openSecret(linear[0].credentialsSealed)).toBe("new_key");
  });
});

describe("notes and webhooks after migration", () => {
  it("readers fall back to settings before the move and read the table after", async () => {
    db.addWorkspace("w1");
    db.addProject("p1", "w1", {
      testingNotes: [{ id: NOTE_ID, content: "n", category: "context", active: true }],
      webhooks: [{ id: HOOK_ID, url: "https://example.com/a", events: ["run.started"], secret: "s" }],
    });

    expect(await activeProjectNotes("p1")).toEqual([{ id: NOTE_ID, content: "n", category: "context", active: true }]);
    expect((await deliverableEndpoints("p1")).map((e) => [e.id, e.secret])).toEqual([[null, "s"]]);
    expect(legacyReadCounts()).toEqual({ "project.testingNotes": 1, "project.webhooks": 1 });

    // The first management call moves the project; deleting the last note must not resurrect it
    expect((await listProjectNotes("p1")).map((n) => n.id)).toEqual([NOTE_ID]);
    expect(await deleteProjectNote("p1", NOTE_ID)).toBe(true);
    expect(await activeProjectNotes("p1")).toEqual([]);
    expect((await deliverableEndpoints("p1")).map((e) => [e.id, e.secret])).toEqual([[HOOK_ID, "s"]]);
    expect(legacyReadCounts()).toEqual({ "project.testingNotes": 1, "project.webhooks": 1 });
  });
});
