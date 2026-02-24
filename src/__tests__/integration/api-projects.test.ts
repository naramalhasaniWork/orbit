import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock auth utilities
vi.mock("@/lib/utils/api", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireWorkspace: vi.fn(),
    apiSuccess: (data: unknown, status = 200) =>
      NextResponse.json({ success: true, data }, { status }),
    apiError: (message: string, code: string, status = 400) =>
      NextResponse.json({ success: false, error: { message, code } }, { status }),
    handleApiError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Internal server error";
      return NextResponse.json(
        { success: false, error: { message: msg, code: "INTERNAL_ERROR" } },
        { status: 500 }
      );
    },
    AuthError: class extends Error {
      code: string;
      status: number;
      constructor(message: string, code: string, status: number) {
        super(message);
        this.code = code;
        this.status = status;
      }
    },
  };
});

vi.mock("@/lib/utils/slug", () => ({
  generateSlug: vi.fn(() => "test-slug-abc123"),
}));

import { prisma } from "@/lib/db";
import { requireWorkspace } from "@/lib/utils/api";
import { NextRequest } from "next/server";

const mockPrisma = prisma as unknown as {
  project: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
const mockRequireWorkspace = requireWorkspace as ReturnType<typeof vi.fn>;

describe("api-projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireWorkspace.mockResolvedValue({
      session: { user: { id: "user-1" }, workspaceId: "ws-1" },
      workspaceId: "ws-1",
    });
  });

  describe("GET /api/projects", () => {
    it("returns project list for workspace", async () => {
      const projects = [
        { id: "p1", name: "Project One", workspaceId: "ws-1" },
        { id: "p2", name: "Project Two", workspaceId: "ws-1" },
      ];
      mockPrisma.project.findMany.mockResolvedValue(projects);

      const { GET } = await import("@/app/api/projects/route");
      const request = new NextRequest("http://localhost/api/projects");
      const response = await GET(request);
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(json.data[0].name).toBe("Project One");
    });

    it("returns empty array when no projects", async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);

      const { GET } = await import("@/app/api/projects/route");
      const request = new NextRequest("http://localhost/api/projects");
      const response = await GET(request);
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
    });
  });

  describe("POST /api/projects", () => {
    it("creates a project with valid data", async () => {
      const newProject = {
        id: "p-new",
        name: "New Project",
        slug: "test-slug-abc123",
        repoUrl: "https://github.com/org/repo",
        workspaceId: "ws-1",
      };
      mockPrisma.project.create.mockResolvedValue(newProject);

      const { POST } = await import("@/app/api/projects/route");
      const request = new NextRequest("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "New Project",
          repoUrl: "https://github.com/org/repo",
          repoOwner: "org",
          repoName: "repo",
          defaultBranch: "main",
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.name).toBe("New Project");
    });

    it("rejects missing project name", async () => {
      const { POST } = await import("@/app/api/projects/route");
      const request = new NextRequest("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          repoUrl: "https://github.com/org/repo",
          repoOwner: "org",
          repoName: "repo",
        }),
      });

      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects missing repoUrl", async () => {
      const { POST } = await import("@/app/api/projects/route");
      const request = new NextRequest("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Project",
          repoOwner: "org",
          repoName: "repo",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("rejects missing repoOwner", async () => {
      const { POST } = await import("@/app/api/projects/route");
      const request = new NextRequest("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Project",
          repoUrl: "https://github.com/org/repo",
          repoName: "repo",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it("rejects missing repoName", async () => {
      const { POST } = await import("@/app/api/projects/route");
      const request = new NextRequest("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Project",
          repoUrl: "https://github.com/org/repo",
          repoOwner: "org",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/projects/[projectId]", () => {
    it("returns project details", async () => {
      const project = { id: "p1", name: "My Project", workspaceId: "ws-1" };
      mockPrisma.project.findFirst.mockResolvedValue(project);

      const { GET } = await import("@/app/api/projects/[projectId]/route");
      const request = new NextRequest("http://localhost/api/projects/p1");
      const response = await GET(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.name).toBe("My Project");
    });

    it("returns 404 for non-existent project", async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      const { GET } = await import("@/app/api/projects/[projectId]/route");
      const request = new NextRequest("http://localhost/api/projects/missing");
      const response = await GET(request, {
        params: Promise.resolve({ projectId: "missing" }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/projects/[projectId]", () => {
    it("updates project name", async () => {
      mockPrisma.project.findFirst.mockResolvedValue({ id: "p1" });
      mockPrisma.project.update.mockResolvedValue({
        id: "p1",
        name: "Updated Name",
      });

      const { PATCH } = await import("@/app/api/projects/[projectId]/route");
      const request = new NextRequest("http://localhost/api/projects/p1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated Name" }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ projectId: "p1" }),
      });
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.name).toBe("Updated Name");
    });

    it("returns 404 for non-existent project", async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      const { PATCH } = await import("@/app/api/projects/[projectId]/route");
      const request = new NextRequest("http://localhost/api/projects/missing", {
        method: "PATCH",
        body: JSON.stringify({ name: "New Name" }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ projectId: "missing" }),
      });

      expect(response.status).toBe(404);
    });
  });
});
