import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { sendEmail } from "@/lib/email/send";
import { buildInviteEmail } from "@/lib/email/invite-email";

const message = { to: "a@x.com", subject: "s", html: "<p>h</p>", text: "t" };

describe("sendEmail", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });
  afterEach(() => vi.restoreAllMocks());

  it("no-ops without configuration", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendEmail(message)).toEqual({ sent: false, reason: "not_configured" });
    process.env.RESEND_API_KEY = "k";
    expect(await sendEmail(message)).toMatchObject({ sent: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to Resend with bearer auth", async () => {
    process.env.RESEND_API_KEY = "re_key";
    process.env.EMAIL_FROM = "Orbit <i@x.com>";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sendEmail(message)).toEqual({ sent: true, id: "m1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body as string)).toMatchObject({ from: "Orbit <i@x.com>", to: ["a@x.com"] });
  });

  it("reports failure instead of throwing", async () => {
    process.env.RESEND_API_KEY = "k";
    process.env.EMAIL_FROM = "f@x.com";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 422 })));
    expect(await sendEmail(message)).toEqual({ sent: false, reason: "provider_error_422" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await sendEmail(message)).toEqual({ sent: false, reason: "network_error" });
  });
});

describe("buildInviteEmail", () => {
  it("includes the link in both parts and escapes html", () => {
    const { subject, html, text } = buildInviteEmail({
      to: "a@x.com",
      workspaceName: "Acme <b>",
      inviterName: "Sam",
      role: "member",
      acceptUrl: "https://orbit.test/invite/tok",
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    });
    expect(subject).toContain("Sam invited you to Acme <b>");
    expect(text).toContain("https://orbit.test/invite/tok");
    expect(html).toContain('href="https://orbit.test/invite/tok"');
    expect(html).toContain("Acme &lt;b&gt;");
    expect(html).not.toContain("Acme <b>");
  });
});
