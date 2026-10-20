import { describe, it, expect, vi, beforeEach } from "vitest";

const assertPublicUrl = vi.hoisted(() => vi.fn());
vi.mock("@/lib/utils/ssrf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils/ssrf")>()),
  assertPublicUrl,
}));

import { UnsafeUrlError } from "@/lib/utils/ssrf";
import { normalizeHostSuffix, validatePreviewUrl } from "@/services/preview/url-policy";
import { decideTransition, PREVIEW_TIMEOUT_MS } from "@/services/preview/state-machine";
import { generateWebhookToken, webhookTokenMatches } from "@/services/preview/connections";

describe("validatePreviewUrl", () => {
  beforeEach(() => {
    assertPublicUrl.mockReset().mockResolvedValue(undefined);
  });

  it("accepts https URLs on an allowed host suffix", async () => {
    expect(await validatePreviewUrl("https://web-pr-1.up.railway.app/", ["up.railway.app"])).toEqual({
      ok: true,
      url: "https://web-pr-1.up.railway.app",
    });
  });

  it("rejects http, hosts outside the allowlist and look-alike suffixes", async () => {
    expect((await validatePreviewUrl("http://a.up.railway.app", ["up.railway.app"])).ok).toBe(false);
    expect((await validatePreviewUrl("https://evil.example.com", ["up.railway.app"])).ok).toBe(false);
    expect((await validatePreviewUrl("https://evilup.railway.app", ["up.railway.app"])).ok).toBe(false);
    expect(assertPublicUrl).not.toHaveBeenCalled();
  });

  it("rejects allowed hosts that resolve to private addresses", async () => {
    assertPublicUrl.mockRejectedValue(new UnsafeUrlError("Host x resolves to a private address"));
    const result = await validatePreviewUrl("https://x.pages.dev", ["pages.dev"]);
    expect(result).toMatchObject({ ok: false });
  });

  it("refuses suffixes without a dot so one entry cannot allow a whole TLD", () => {
    expect(normalizeHostSuffix("app")).toBeNull();
    expect(normalizeHostSuffix("*.Pages.dev")).toBe("pages.dev");
    expect(normalizeHostSuffix("bad host.com")).toBeNull();
  });
});

describe("decideTransition", () => {
  const created = new Date("2026-10-20T12:00:00Z");

  it("waits while pending inside the timeout, then fails neutral", () => {
    expect(decideTransition({ state: "pending" }, created, new Date(created.getTime() + 60_000))).toEqual({ kind: "wait" });
    expect(decideTransition({ state: "pending" }, created, new Date(created.getTime() + PREVIEW_TIMEOUT_MS))).toMatchObject({
      kind: "fail",
      status: "failed",
      conclusion: "neutral",
    });
  });

  it("maps provider failure to a failing check and removal to gone", () => {
    expect(decideTransition({ state: "failed", externalId: "d", reason: "build failed" }, created, created)).toMatchObject({
      kind: "fail", status: "failed", conclusion: "failure", error: "build failed",
    });
    expect(decideTransition({ state: "gone", externalId: null }, created, created)).toMatchObject({ status: "gone" });
  });
});

describe("webhook tokens", () => {
  it("matches only the issued token and fails closed without a stored hash", () => {
    const { token, hash } = generateWebhookToken();
    expect(webhookTokenMatches(token, hash)).toBe(true);
    expect(webhookTokenMatches(`${token}x`, hash)).toBe(false);
    expect(webhookTokenMatches(null, hash)).toBe(false);
    expect(webhookTokenMatches(token, null)).toBe(false);
  });
});
