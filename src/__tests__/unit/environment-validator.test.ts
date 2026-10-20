import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies
vi.mock("@/lib/db", () => ({
  prisma: {
    environment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    secret: {
      findMany: vi.fn(),
    },
  },
}));

// Public DNS answer so the real SSRF guard runs without network access
vi.mock("dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

vi.mock("@/lib/vault", () => ({
  decrypt: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/vault";
import {
  validateEnvironment,
  getDefaultEnvironment,
} from "@/services/execution/environment-validator";

const mockPrisma = prisma as unknown as {
  environment: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  secret: {
    findMany: ReturnType<typeof vi.fn>;
  };
};
const mockDecrypt = decrypt as ReturnType<typeof vi.fn>;

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("environment-validator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateEnvironment", () => {
    it("returns error when environment not found", async () => {
      mockPrisma.environment.findUnique.mockResolvedValue(null);

      const result = await validateEnvironment("env-missing");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Environment not found");
    });

    it("blocks production environments", async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        id: "env-1",
        type: "production",
        url: "https://prod.example.com",
        projectId: "proj-1",
        project: { id: "proj-1", name: "Prod App" },
      });

      const result = await validateEnvironment("env-1");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Cannot run tests against production environments");
      expect(result.environmentUrl).toBe("https://prod.example.com");
    });

    it("validates reachable staging environment", async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        id: "env-1",
        type: "staging",
        url: "https://staging.example.com",
        projectId: "proj-1",
        project: { id: "proj-1", name: "Staging App" },
      });
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      mockPrisma.secret.findMany.mockResolvedValue([
        { key: "TEST_EMAIL", encryptedValue: "enc1", iv: "iv1" },
        { key: "TEST_PASSWORD", encryptedValue: "enc2", iv: "iv2" },
      ]);
      mockDecrypt.mockReturnValueOnce("test@example.com").mockReturnValueOnce("password123");

      const result = await validateEnvironment("env-1");

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.credentials.TEST_EMAIL).toBe("test@example.com");
      expect(result.credentials.TEST_PASSWORD).toBe("password123");
    });

    it("reports unreachable URL as error", async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        id: "env-1",
        type: "staging",
        url: "https://staging.example.com",
        projectId: "proj-1",
        project: { id: "proj-1", name: "App" },
      });
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
      mockPrisma.secret.findMany.mockResolvedValue([]);

      const result = await validateEnvironment("env-1");

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("not reachable");
    });

    it("blocks environment URLs that point at internal addresses without fetching", async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        id: "env-1",
        type: "staging",
        url: "http://169.254.169.254/latest/meta-data",
        projectId: "proj-1",
        project: { id: "proj-1", name: "App" },
      });
      mockPrisma.secret.findMany.mockResolvedValue([]);

      const result = await validateEnvironment("env-1");

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("URL blocked");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks a redirect from a public URL to an internal one", async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        id: "env-1",
        type: "staging",
        url: "https://staging.example.com",
        projectId: "proj-1",
        project: { id: "proj-1", name: "App" },
      });
      mockPrisma.secret.findMany.mockResolvedValue([]);
      mockFetch.mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "http://localhost:6379" } })
      );

      const result = await validateEnvironment("env-1");

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("URL blocked");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("treats 401/403 as reachable (auth required is ok)", async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        id: "env-1",
        type: "staging",
        url: "https://staging.example.com",
        projectId: "proj-1",
        project: { id: "proj-1", name: "App" },
      });
      mockFetch.mockResolvedValue({ ok: false, status: 401 });
      mockPrisma.secret.findMany.mockResolvedValue([]);

      const result = await validateEnvironment("env-1");

      const urlErrors = result.errors.filter((e) => e.includes("not reachable"));
      expect(urlErrors).toHaveLength(0);
    });

    it("reports 500 status as unreachable", async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        id: "env-1",
        type: "staging",
        url: "https://staging.example.com",
        projectId: "proj-1",
        project: { id: "proj-1", name: "App" },
      });
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      mockPrisma.secret.findMany.mockResolvedValue([]);

      const result = await validateEnvironment("env-1");

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("status 500");
    });

    it("warns about failed secret decryption", async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        id: "env-1",
        type: "staging",
        url: "https://staging.example.com",
        projectId: "proj-1",
        project: { id: "proj-1", name: "App" },
      });
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      mockPrisma.secret.findMany.mockResolvedValue([
        { key: "BAD_SECRET", encryptedValue: "bad", iv: "bad" },
      ]);
      mockDecrypt.mockImplementation(() => {
        throw new Error("Decryption failed");
      });

      const result = await validateEnvironment("env-1");

      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining("Failed to decrypt")])
      );
    });

    it("warns about missing common test credentials", async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        id: "env-1",
        type: "staging",
        url: "https://staging.example.com",
        projectId: "proj-1",
        project: { id: "proj-1", name: "App" },
      });
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      mockPrisma.secret.findMany.mockResolvedValue([]);

      const result = await validateEnvironment("env-1");

      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining("TEST_EMAIL")])
      );
    });
  });

  describe("getDefaultEnvironment", () => {
    it("returns default environment id", async () => {
      mockPrisma.environment.findFirst
        .mockResolvedValueOnce({ id: "env-default" });

      const result = await getDefaultEnvironment("proj-1");
      expect(result).toBe("env-default");
    });

    it("falls back to first non-production environment", async () => {
      mockPrisma.environment.findFirst
        .mockResolvedValueOnce(null) // no default
        .mockResolvedValueOnce({ id: "env-staging" }); // fallback

      const result = await getDefaultEnvironment("proj-1");
      expect(result).toBe("env-staging");
    });

    it("returns null when no environments exist", async () => {
      mockPrisma.environment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await getDefaultEnvironment("proj-1");
      expect(result).toBeNull();
    });
  });
});
