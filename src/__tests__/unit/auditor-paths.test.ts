import { describe, it, expect, vi, beforeEach } from "vitest";

const download = vi.fn();
vi.mock("@/lib/storage", () => ({ getStorage: () => ({ download }) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUniqueOrThrow: vi.fn() },
    systemMapNode: { findMany: vi.fn() },
    auditResult: { create: vi.fn() },
  },
}));
vi.mock("@/lib/github/token", () => ({ resolveGitHubToken: vi.fn() }));
vi.mock("@/lib/ai/tracked-completion", () => ({ createTrackedCompletion: vi.fn() }));
vi.mock("@/lib/ai/model-router", () => ({ getModelForTask: vi.fn().mockResolvedValue("m") }));

import { prisma } from "@/lib/db";
import { resolveGitHubToken } from "@/lib/github/token";
import { runCodeAudit, AuditUnavailableError } from "@/services/auditing/auditor";

const db = prisma as unknown as {
  project: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
  systemMapNode: { findMany: ReturnType<typeof vi.fn> };
};
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("runCodeAudit file paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.project.findUniqueOrThrow.mockResolvedValue({
      id: "p1", framework: "nextjs", defaultBranch: "main", repoOwner: "acme", repoName: "app",
      workspaceId: "ws-1", workspace: { name: "W" },
    });
    db.systemMapNode.findMany.mockResolvedValue([
      { filePath: "src/app/page.tsx" },
      { filePath: "../../orgs/acme" }, // a poisoned node is never used
    ]);
    download.mockRejectedValue(new Error("not in storage"));
    (resolveGitHubToken as ReturnType<typeof vi.fn>).mockResolvedValue({ token: "ghs_x", source: "installation" });
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
  });

  it("refuses requested paths that aren't in the project's index (400)", async () => {
    const err = await runCodeAudit({ projectId: "p1", filePaths: ["../../../orgs/acme/members"] }).catch((e) => e);

    expect(err).toBeInstanceOf(AuditUnavailableError);
    expect(err.status).toBe(400);
    expect(download).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only requests indexed, safe paths from storage and GitHub, encoded", async () => {
    await runCodeAudit({ projectId: "p1" }).catch(() => undefined);

    expect(download.mock.calls.map((c) => c[0])).toEqual(["repos/p1/main/src/app/page.tsx"]);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(["https://api.github.com/repos/acme/app/contents/src/app/page.tsx?ref=main"]);
  });
});
