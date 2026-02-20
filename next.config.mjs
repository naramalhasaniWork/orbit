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
