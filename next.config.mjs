/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      "pg",
      "bullmq",
      "ioredis",
      "web-tree-sitter",
      "tree-sitter-wasms",
      "playwright",
      "playwright-core",
      "@aws-sdk/client-s3",
      "@aws-sdk/s3-request-presigner",
      "stripe",
      "sharp",
    ],
    outputFileTracingIncludes: {
      "/**": ["./src/generated/prisma/**/*"],
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "web-tree-sitter",
        "tree-sitter-wasms",
        /^tree-sitter-wasms\//,
        "playwright",
        "playwright-core",
        /^@aws-sdk\//,
        "stripe",
        "sharp",
        "@browserbasehq/stagehand",
      ];
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;
