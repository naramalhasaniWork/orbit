import { defineConfig, type Options } from "tsup";

type Plugin = NonNullable<Options["esbuildPlugins"]>[number];

// Service code reaches lib/utils/api, which imports next/headers and friends.
// Next's package has no exports map for them, so native ESM needs the ".js".
const nextSubpathExtensions: Plugin = {
  name: "next-subpath-extensions",
  setup(build) {
    build.onResolve({ filter: /^next\/[a-z-]+$/ }, (args) => ({
      path: `${args.path}.js`,
      external: true,
    }));
  },
};

// Standalone worker bundle (dist/worker.mjs): lets a worker container start
// the BullMQ workers without booting Next. Externals mirror next.config.mjs;
// they resolve from the node_modules traced into .next/standalone.
// Data backfills (prisma/backfills) ship the same way, as dist/backfills/*.mjs,
// for scripts/start.sh to run when ORBIT_RUN_BACKFILLS=true.
export default defineConfig({
  entry: {
    worker: "src/workers/index.ts",
    "backfills/20261025_integrations": "prisma/backfills/20261025_integrations.ts",
  },
  outDir: "dist",
  format: ["esm"],
  outExtension: () => ({ js: ".mjs" }),
  platform: "node",
  target: "node20",
  splitting: false,
  sourcemap: false,
  clean: true,
  // Let the plugin below see next/* instead of tsup's default dependency externals
  noExternal: [/^next\//],
  esbuildPlugins: [nextSubpathExtensions],
  external: [
    "pg",
    "bullmq",
    "ioredis",
    "web-tree-sitter",
    "tree-sitter-wasms",
    /^tree-sitter-wasms\//,
    "playwright",
    "playwright-core",
    /^playwright/,
    /^@aws-sdk\//,
    "stripe",
    "sharp",
    "@browserbasehq/stagehand",
    /^@browserbasehq\//,
    "socket.io",
    "socket.io-client",
  ],
  // CJS-only externals and node builtins need a require() inside an ES module bundle
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
