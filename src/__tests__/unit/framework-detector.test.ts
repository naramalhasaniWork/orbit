import { describe, it, expect } from "vitest";
import { detectFramework } from "@/services/indexing/framework-detector";
import type { FileEntry } from "@/services/indexing/clone";
import type { FingerprintResult } from "@/services/indexing/fingerprint";

function makeFp(overrides: Partial<FingerprintResult> = {}): FingerprintResult {
  return {
    hasTypeScript: true,
    primaryLanguage: "typescript",
    ...overrides,
  } as FingerprintResult;
}

function makeFileTree(paths: string[]): FileEntry[] {
  return paths.map((p) => {
    const isDir = p.endsWith("/");
    return {
      path: isDir ? p.slice(0, -1) : p,
      type: isDir ? ("dir" as const) : ("file" as const),
      size: 100,
    };
  });
}

describe("framework-detector", () => {
  describe("Next.js detection", () => {
    it("detects Next.js with config file and dependency", () => {
      const files = makeFileTree(["next.config.js", "src/app/", "package.json"]);
      const pkg = JSON.stringify({ dependencies: { next: "^14.2.0" } });

      const result = detectFramework(files, pkg, makeFp());

      expect(result.name).toBe("nextjs");
      expect(result.confidence).toBe(1.0);
      expect(result.version).toBe("^14.2.0");
    });

    it("detects app router when app dir exists", () => {
      const files = makeFileTree(["next.config.ts", "src/app/"]);
      const pkg = JSON.stringify({ dependencies: { next: "^14.0.0" } });

      const result = detectFramework(files, pkg, makeFp());
      expect(result.router).toBe("app-router");
    });

    it("detects pages router when only pages dir exists", () => {
      const files = makeFileTree(["next.config.js", "pages/"]);
      const pkg = JSON.stringify({ dependencies: { next: "^13.0.0" } });

      const result = detectFramework(files, pkg, makeFp());
      expect(result.router).toBe("pages-router");
    });

    it("detects Next.js features like next-auth, prisma, tailwind", () => {
      const files = makeFileTree(["next.config.mjs", "src/app/"]);
      const pkg = JSON.stringify({
        dependencies: {
          next: "^14.0.0",
          "next-auth": "^4.0.0",
          "@prisma/client": "^5.0.0",
          tailwindcss: "^3.0.0",
          zod: "^3.0.0",
        },
      });

      const result = detectFramework(files, pkg, makeFp());
      expect(result.features).toContain("next-auth");
      expect(result.features).toContain("prisma");
      expect(result.features).toContain("tailwind");
      expect(result.features).toContain("zod-validation");
      expect(result.features).toContain("typescript");
    });

    it("confidence 0.8 when only dependency (no config file)", () => {
      const files = makeFileTree(["src/app/"]);
      const pkg = JSON.stringify({ dependencies: { next: "^14.0.0" } });

      const result = detectFramework(files, pkg, makeFp());
      expect(result.name).toBe("nextjs");
      expect(result.confidence).toBe(0.8);
    });
  });

  describe("Express detection", () => {
    it("detects Express from dependency", () => {
      const files = makeFileTree(["src/index.ts"]);
      const pkg = JSON.stringify({ dependencies: { express: "^4.18.0" } });

      const result = detectFramework(files, pkg, makeFp());
      expect(result.name).toBe("express");
      expect(result.router).toBe("express-router");
      expect(result.confidence).toBe(0.9);
    });

    it("detects Express features like passport, cors, helmet", () => {
      const files = makeFileTree(["src/index.ts"]);
      const pkg = JSON.stringify({
        dependencies: {
          express: "^4.18.0",
          passport: "^0.7.0",
          cors: "^2.8.0",
          helmet: "^7.0.0",
        },
      });

      const result = detectFramework(files, pkg, makeFp());
      expect(result.features).toContain("passport");
      expect(result.features).toContain("cors");
      expect(result.features).toContain("helmet");
    });

    it("names result fastify when both express and fastify present", () => {
      const files = makeFileTree(["src/index.ts"]);
      const pkg = JSON.stringify({
        dependencies: { express: "^4.18.0", fastify: "^4.0.0" },
      });

      const result = detectFramework(files, pkg, makeFp());
      expect(result.name).toBe("fastify");
    });
  });

  describe("React detection", () => {
    it("detects React (skips if Next.js is present)", () => {
      const files = makeFileTree(["src/App.tsx"]);
      const pkg = JSON.stringify({ dependencies: { react: "^18.0.0", next: "^14.0.0" } });

      const result = detectFramework(files, pkg, makeFp());
      // Next.js takes priority
      expect(result.name).toBe("nextjs");
    });

    it("detects standalone React with Vite", () => {
      const files = makeFileTree(["src/App.tsx"]);
      const pkg = JSON.stringify({
        dependencies: { react: "^18.0.0" },
        devDependencies: { vite: "^5.0.0" },
      });

      const result = detectFramework(files, pkg, makeFp());
      expect(result.name).toBe("react");
      expect(result.confidence).toBe(0.9);
    });

    it("detects react-router feature", () => {
      const files = makeFileTree(["src/App.tsx"]);
      const pkg = JSON.stringify({
        dependencies: { react: "^18.0.0", "react-router-dom": "^6.0.0" },
      });

      const result = detectFramework(files, pkg, makeFp());
      expect(result.features).toContain("react-router");
      expect(result.router).toBe("react-router");
    });
  });

  describe("fallback detection", () => {
    it("returns generic when no framework detected", () => {
      const files = makeFileTree(["main.py"]);
      const pkg = JSON.stringify({ dependencies: {} });

      const result = detectFramework(files, pkg, makeFp({ hasTypeScript: false, primaryLanguage: "python" }));
      expect(result.name).toBe("generic");
      expect(result.confidence).toBe(0.3);
      expect(result.language).toBe("python");
    });

    it("returns generic with no package.json", () => {
      const files = makeFileTree(["index.html"]);
      const result = detectFramework(files, null, makeFp({ hasTypeScript: false, primaryLanguage: "javascript" }));
      expect(result.name).toBe("generic");
    });

    it("sets language based on fingerprint", () => {
      const files = makeFileTree(["next.config.js", "src/app/"]);
      const pkg = JSON.stringify({ dependencies: { next: "^14.0.0" } });

      const jsResult = detectFramework(files, pkg, makeFp({ hasTypeScript: false }));
      expect(jsResult.language).toBe("javascript");

      const tsResult = detectFramework(files, pkg, makeFp({ hasTypeScript: true }));
      expect(tsResult.language).toBe("typescript");
    });
  });
});
