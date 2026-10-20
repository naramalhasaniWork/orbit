import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const inner = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ default: () => inner }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/rate-limit", () => ({
  checkIpRateLimit: vi.fn(),
  getClientIp: () => "9.9.9.9",
}));

import { checkIpRateLimit } from "@/lib/auth/rate-limit";
import { GET } from "@/app/api/auth/[...nextauth]/route";

const limiter = checkIpRateLimit as ReturnType<typeof vi.fn>;
const ctx = { params: Promise.resolve({ nextauth: [] }) };

describe("auth route rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limiter.mockResolvedValue(null);
    inner.mockResolvedValue(new Response("ok"));
  });

  it("returns 429 on the OAuth callback when limited, without invoking NextAuth", async () => {
    limiter.mockResolvedValue(NextResponse.json({}, { status: 429 }));
    const res = await GET(new NextRequest("http://localhost/api/auth/callback/github?code=x"), ctx);
    expect(res.status).toBe(429);
    expect(limiter).toHaveBeenCalledWith("auth", "9.9.9.9", 20);
    expect(inner).not.toHaveBeenCalled();
  });

  it("passes through when under the limit", async () => {
    const res = await GET(new NextRequest("http://localhost/api/auth/callback/github"), ctx);
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalled();
  });

  it("does not rate limit session polling", async () => {
    await GET(new NextRequest("http://localhost/api/auth/session"), ctx);
    expect(limiter).not.toHaveBeenCalled();
    expect(inner).toHaveBeenCalled();
  });
});
