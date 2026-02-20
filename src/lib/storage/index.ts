import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync, mkdirSync } from "fs";

// ============================================================
// Storage Provider Interface
// ============================================================

export interface StorageProvider {
  upload(key: string, data: Buffer, contentType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  getUrl(key: string): Promise<string>;
}

// ============================================================
// Local Filesystem Storage
// ============================================================

function createLocalStorage(basePath: string): StorageProvider {
  return {
    async upload(key, data) {
      const filePath = join(basePath, key);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, data);
    },

    async download(key) {
      const filePath = join(basePath, key);
      return readFile(filePath);
    },

    async getUrl(key) {
      return `file://${join(basePath, key)}`;
    },
  };
}

// ============================================================
// S3-Compatible Storage (AWS S3 / Cloudflare R2)
// ============================================================

function createS3Storage(): StorageProvider {
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || "auto",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
    },
    forcePathStyle: true,
  });

  const bucket = process.env.S3_BUCKET || "orbit-artifacts";

  return {
    async upload(key, data, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: contentType })
      );
    },

    async download(key) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) throw new Error(`Empty response for key: ${key}`);
      return Buffer.from(bytes);
    },

    async getUrl(key) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: 3600 });
    },
  };
}

// ============================================================
// Singleton Factory
// ============================================================

let instance: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (instance) return instance;

  const provider = process.env.STORAGE_PROVIDER || "local";

  if (provider === "s3") {
    instance = createS3Storage();
  } else {
    const basePath = process.env.STORAGE_PATH || "./storage";
    const resolved = basePath.startsWith("/") ? basePath : join(process.cwd(), basePath);
    if (!existsSync(resolved)) {
      mkdirSync(resolved, { recursive: true });
    }
    instance = createLocalStorage(resolved);
  }

  return instance;
}
