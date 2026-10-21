import { describe, it, expect } from "vitest";
import {
  jumpFromNode,
  jumpFromPlan,
  jumpFromRun,
  journeysByRun,
  personOf,
  rankJumpItems,
  shapeActivity,
  shapePullRequestRows,
  type AuditRow,
  type JumpItem,
  type PrRunRow,
} from "@/lib/dashboard/launchpad-shape";
import { nodeTestStatuses } from "@/lib/map/map-data";

const REPO = { owner: "acme", name: "web" };
const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12));

const prRun = (over: Partial<PrRunRow> = {}): PrRunRow => ({
  id: "r1",
  sequenceNumber: 12,
  trigger: "pr",
  status: "completed",
  branch: "fix/checkout",
  commitSha: "7c2a1b9e44",
  prNumber: 318,
  failed: 0,
  flaky: 0,
  durationMs: 1_680_000,
  createdAt: day(18),
  metadata: { prTitle: "Fix the coupon field" },
  triggeredBy: null,
  ...over,
});

describe("pull request rows", () => {
  it("a PR row reads repo#number, the PR title, its journeys and the run's verdict", () => {
    const journeys = journeysByRun([
      { testRunId: "r1", testCase: { journey: "Checkout" } },
      { testRunId: "r1", testCase: { journey: "Checkout" } },
      { testRunId: "r1", testCase: { journey: "Sign in" } },
      { testRunId: "r1", testCase: { journey: null } },
    ]);
    const [row] = shapePullRequestRows([prRun({ failed: 1 })], journeys, REPO);
    expect(row).toMatchObject({
      ref: "acme/web#318",
      title: "Fix the coupon field",
      triggerLabel: "PR",
      commit: "7c2a1b9",
      journeys: ["Checkout", "Sign in"],
      tone: "fail",
      author: null,
    });
  });

  it("a push without PR metadata falls back to branch @ commit, never an invented title", () => {
    const [row] = shapePullRequestRows([prRun({ trigger: "push", prNumber: null, metadata: {} })], new Map(), REPO);
    expect(row.ref).toBe("acme/web");
    expect(row.title).toBe("fix/checkout @ 7c2a1b9");
    expect(row.triggerLabel).toBe("Push");
    expect(row.journeys).toEqual([]);
  });

  it("a running PR check is live; the person who started it in Orbit is the author", () => {
    const [row] = shapePullRequestRows(
      [prRun({ status: "executing", triggeredBy: { id: "u1", name: null, email: "dana@acme.dev", image: null, avatarKey: null } })],
      new Map(),
      REPO
    );
    expect(row.tone).toBe("live");
    expect(row.author).toEqual({ name: "dana", email: "dana@acme.dev", image: null });
  });
});

describe("jump back in", () => {
  const item = (key: string, at: number, tone: JumpItem["tone"] = "pass", href = `/x/${key}`): JumpItem => ({
    key,
    kind: "run",
    title: key,
    detail: "",
    href,
    at: day(at).toISOString(),
    tone,
  });

  it("puts live runs first, then newest first, five at most", () => {
    const ranked = rankJumpItems([item("a", 1), item("b", 9), item("live", 2, "live"), item("c", 5), item("d", 7), item("e", 3), item("f", 4)]);
    expect(ranked.map((i) => i.key)).toEqual(["live", "b", "d", "c", "f"]);
  });

  it("shows one row per destination", () => {
    const ranked = rankJumpItems([item("plan-1", 5, "flaky", "/dashboard/plans"), item("plan-2", 4, "pass", "/dashboard/plans")]);
    expect(ranked.map((i) => i.key)).toEqual(["plan-1"]);
  });

  it("says why each item is there", () => {
    const run = { id: "r", sequenceNumber: 4, status: "completed", failed: 2, flaky: 0, triggeredById: "u2", createdAt: day(3) };
    expect(jumpFromRun(run, "u1", "p").detail).toBe("2 failed");
    expect(jumpFromRun({ ...run, failed: 0 }, "u2", "p").detail).toBe("Passed · you started it");
    expect(jumpFromRun({ ...run, failed: 0, flaky: 1 }, "u1", "p").detail).toBe("Flaky");
    expect(jumpFromRun({ ...run, status: "executing" }, "u1", "p")).toMatchObject({ detail: "Running now", tone: "live" });
    const plan = { id: "pl", version: 3, approvedAt: null, approvedById: null, createdAt: day(2) };
    expect(jumpFromPlan(plan, "u1", "p")).toMatchObject({ detail: "Waiting for approval", title: "Test plan v3" });
    const node = jumpFromNode({ id: "n", name: "/checkout", type: "route", changeStatus: "added", updatedAt: day(4) }, "p");
    expect(node.href).toBe("/dashboard/map?project=p&view=impact&node=n");
  });

  it("is empty when nothing was touched and nothing needs attention", () => {
    expect(rankJumpItems([])).toEqual([]);
  });
});

describe("team activity", () => {
  const log = (over: Partial<AuditRow>): AuditRow => ({
    id: "l1",
    action: "run.trigger",
    resourceType: "run",
    resourceId: "r1",
    createdAt: day(5),
    user: { id: "u1", name: "Dana Ito", email: "dana@acme.dev", image: null, avatarKey: null },
    ...over,
  });

  it("is hidden in a one-member workspace", () => {
    expect(shapeActivity([log({})], new Map([["r1", 7]]), 1)).toEqual([]);
  });

  it("tells who ran what and who approved a plan, and skips runs it cannot name", () => {
    const rows = shapeActivity(
      [
        log({}),
        log({ id: "l2", action: "plan.approved", resourceType: "test_plan", resourceId: "pl" }),
        log({ id: "l3", resourceId: "gone" }),
        log({ id: "l4", action: "login" }),
      ],
      new Map([["r1", 7]]),
      3
    );
    expect(rows.map((r) => r.what)).toEqual(["started Run #7", "approved the test plan"]);
    expect(rows[0].href).toBe("/dashboard/runs/r1");
    expect(rows[1].who?.name).toBe("Dana Ito");
  });

  it("names a person without a display name by their email", () => {
    expect(personOf({ id: "u", name: "  ", email: "kim@x.io", image: null, avatarKey: null })?.name).toBe("kim");
  });

  it("shows an uploaded photo over the GitHub one", () => {
    const p = personOf({ id: "u", name: "Kim", email: "kim@x.io", image: "https://avatars.githubusercontent.com/u/1", avatarKey: "u/abc" });
    expect(p?.image).not.toContain("githubusercontent");
  });
});

describe("map node status", () => {
  it("takes the worst latest verdict of the journey named like the node", () => {
    const s = nodeTestStatuses(
      [{ id: "a", name: "Checkout" }, { id: "b", name: "Sign in" }, { id: "c", name: "Admin" }],
      [
        { journey: "Checkout", lastVerdict: "pass" },
        { journey: "Checkout", lastVerdict: "fail" },
        { journey: "Sign in", lastVerdict: "healed" },
      ]
    );
    expect([s.get("a"), s.get("b"), s.get("c")]).toEqual(["fail", "pass", "untested"]);
  });
});
