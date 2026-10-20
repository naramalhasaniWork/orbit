import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.ENCRYPTION_KEY = "a".repeat(64);

const base = vi.hoisted(() => ({ linkAccount: vi.fn(), createUser: vi.fn() }));
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => base }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { createEncryptingAdapter } from "@/lib/auth/adapter";
import { decryptToken } from "@/lib/vault/token";

beforeEach(() => vi.clearAllMocks());

describe("encrypting adapter", () => {
  it("encrypts access and refresh tokens before they are stored", async () => {
    await createEncryptingAdapter().linkAccount!({
      userId: "u1",
      provider: "github",
      providerAccountId: "42",
      type: "oauth",
      access_token: "ghu_plain_access",
      refresh_token: "ghr_plain_refresh",
      scope: "x",
    });
    const stored = base.linkAccount.mock.calls[0][0];
    expect(JSON.stringify(stored)).not.toContain("ghu_plain_access");
    expect(JSON.stringify(stored)).not.toContain("ghr_plain_refresh");
    expect(decryptToken(stored.access_token)).toBe("ghu_plain_access");
    expect(decryptToken(stored.refresh_token)).toBe("ghr_plain_refresh");
    expect(stored).toMatchObject({ userId: "u1", provider: "github", providerAccountId: "42", scope: "x" });
  });

  it("leaves absent tokens absent and delegates other methods untouched", async () => {
    const adapter = createEncryptingAdapter();
    await adapter.linkAccount!({ userId: "u", provider: "p", providerAccountId: "1", type: "oauth" });
    expect(base.linkAccount.mock.calls[0][0].access_token).toBeUndefined();
    expect(adapter.createUser).toBe(base.createUser);
  });
});
