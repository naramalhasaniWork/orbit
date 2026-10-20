import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getServerSession = vi.fn();
vi.mock("@/lib/utils/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/utils/api")>()),
  getServerSession: () => getServerSession(),
}));

import { billingWorkspaceId } from "@/lib/billing/workspace-header";

const UUID = "11111111-2222-3333-4444-555555555555";
const req = (headers: Record<string, string> = {}) => new NextRequest("http://localhost/x", { headers });

beforeEach(() => getServerSession.mockReset());

describe("billingWorkspaceId", () => {
  it("uses a valid header without touching the session", async () => {
    expect(await billingWorkspaceId(req({ "x-workspace-id": UUID }))).toBe(UUID);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid header with 400", async () => {
    await expect(billingWorkspaceId(req({ "x-workspace-id": "nope" }))).rejects.toMatchObject({ status: 400 });
  });

  it("falls back to the session workspace when the header is missing", async () => {
    getServerSession.mockResolvedValue({ workspaceId: UUID });
    expect(await billingWorkspaceId(req())).toBe(UUID);
  });

  it("401s without a session and 403s without a workspace", async () => {
    getServerSession.mockResolvedValue(null);
    await expect(billingWorkspaceId(req())).rejects.toMatchObject({ status: 401 });
    getServerSession.mockResolvedValue({ workspaceId: "" });
    await expect(billingWorkspaceId(req())).rejects.toMatchObject({ status: 403 });
  });
});
