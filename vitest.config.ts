import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Components under test use the React 17+ JSX runtime (tsconfig keeps jsx: preserve for Next).
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
    },
  },
});
