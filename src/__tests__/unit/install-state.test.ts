import { describe, it, expect } from "vitest";

process.env.NEXTAUTH_SECRET = "n".repeat(40);

import { createInstallState, verifyInstallState } from "@/lib/github/install-state";

describe("install state", () => {
  it("round-trips workspace and user", () => {
    expect(verifyInstallState(createInstallState("w", "u"))).toEqual({ workspaceId: "w", userId: "u" });
  });

  it("rejects tampering with the payload or signature", () => {
    const [body, sig] = createInstallState("w", "u").split(".");
    const forged = Buffer.from(JSON.stringify({ workspaceId: "victim", userId: "u", exp: Date.now() + 1e6, nonce: "x" })).toString("base64url");
    expect(verifyInstallState(`${forged}.${sig}`)).toBeNull();
    expect(verifyInstallState(`${body}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifyInstallState(`${body}`)).toBeNull();
  });

  it("rejects expired, empty and foreign-secret states", () => {
    expect(verifyInstallState(createInstallState("w", "u", 0))).toBeNull();
    expect(verifyInstallState(null)).toBeNull();
    expect(verifyInstallState("")).toBeNull();
    const state = createInstallState("w", "u");
    process.env.NEXTAUTH_SECRET = "z".repeat(40);
    expect(verifyInstallState(state)).toBeNull();
    process.env.NEXTAUTH_SECRET = "n".repeat(40);
  });
});
