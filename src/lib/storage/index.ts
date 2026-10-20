import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname, resolve, basename, sep } from "path";
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

/** Resolve a storage key inside basePath; throws if it would escape it. */
function resolveInside(basePath: string, key: string): string {
  const base = resolve(basePath);
  const resolved = resolve(base, key);
  if (resolved !== base && !resolved.startsWith(base + sep)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return resolved;
}

/** Reduce a user-supplied filename to a safe basename for use in storage keys. */
export function sanitizeFilename(name: string): string {
  const cleaned = basename(name.replace(/\\/g, "/"))
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "");
  return cleaned.slice(0, 120) || "file";
}

export function createLocalStorage(basePath: string): StorageProvider {
  return {
    async upload(key, data) {
      const filePath = resolveInside(basePath, key);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, data);
    },

    async download(key) {
      return readFile(resolveInside(basePath, key));
    },

    async getUrl(key) {
      return `file://${resolveInside(basePath, key)}`;
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
    // Try configured path, then /data/storage (Docker), then /tmp fallback
    const candidates = [
      process.env.STORAGE_PATH,
      "/data/storage",
      "/tmp/orbit-storage",
    ].filter(Boolean) as string[];

    let resolved = "";
    for (const candidate of candidates) {
      const path = candidate.startsWith("/") ? candidate : join(process.cwd(), candidate);
      try {
        if (!existsSync(path)) {
          mkdirSync(path, { recursive: true });
        }
        resolved = path;
        break;
      } catch {
        // Permission denied or other error, try next candidate
        continue;
      }
    }

    if (!resolved) {
      resolved = "/tmp/orbit-storage";
      mkdirSync(resolved, { recursive: true });
    }

    instance = createLocalStorage(resolved);
  }

  return instance;
}
