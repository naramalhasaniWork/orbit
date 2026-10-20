import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const s3 = vi.hoisted(() => ({ configs: [] as unknown[] }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(config: unknown) {
      s3.configs.push(config);
    }
    send = vi.fn();
  },
  PutObjectCommand: class {},
  GetObjectCommand: class {},
  DeleteObjectCommand: class {},
  HeadObjectCommand: class {},
  ListObjectsV2Command: class {},
}));

beforeEach(() => {
  vi.resetModules();
  s3.configs.length = 0;
  vi.stubEnv("S3_ENDPOINT", "https://acct.r2.cloudflarestorage.com");
  vi.stubEnv("S3_ACCESS_KEY", "ak");
  vi.stubEnv("S3_SECRET_KEY", "sk");
  vi.stubEnv("S3_BUCKET", "bucket");
});
afterEach(() => vi.unstubAllEnvs());

describe("getStorage", () => {
  it.each(["s3", "r2"])("STORAGE_PROVIDER=%s uses the S3 client with S3_ENDPOINT", async (provider) => {
    vi.stubEnv("STORAGE_PROVIDER", provider);
    const { getStorage } = await import("@/lib/storage");
    getStorage();
    expect(s3.configs).toHaveLength(1);
    expect(s3.configs[0]).toMatchObject({ endpoint: "https://acct.r2.cloudflarestorage.com" });
  });

  it("local does not create an S3 client", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "local");
    vi.stubEnv("STORAGE_PATH", "/tmp/orbit-storage-provider-test");
    const { getStorage } = await import("@/lib/storage");
    getStorage();
    expect(s3.configs).toHaveLength(0);
  });
});
