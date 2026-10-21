import { createHash } from "node:crypto";
import sharp from "sharp";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_PX = 256;

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** The real type from the first bytes; the browser-declared type is only a hint. */
export function sniffImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const at = (offset: number, sig: number[]) => sig.every((b, i) => bytes[offset + i] === b);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}

export type AvatarRejection = "WRONG_TYPE" | "TOO_LARGE" | "EMPTY" | "BAD_IMAGE";

export const REJECTION_MESSAGES: Record<AvatarRejection, string> = {
  WRONG_TYPE: "Use a PNG, JPEG or WebP image.",
  TOO_LARGE: "The image is over 2 MB.",
  EMPTY: "The file is empty.",
  BAD_IMAGE: "That file is not a readable PNG, JPEG or WebP image.",
};

/** Checks declared type, size, then magic bytes; null when the upload may be processed. */
export function rejectAvatarUpload(declaredType: string, bytes: Uint8Array): AvatarRejection | null {
  if (!ACCEPTED_TYPES.has(declaredType)) return "WRONG_TYPE";
  if (bytes.length === 0) return "EMPTY";
  if (bytes.length > MAX_AVATAR_BYTES) return "TOO_LARGE";
  if (sniffImageType(bytes) === null) return "BAD_IMAGE";
  return null;
}

/** Square crop to 256×256 WebP (EXIF rotation applied, metadata stripped) plus its content hash. */
export async function processAvatar(bytes: Uint8Array): Promise<{ data: Buffer; hash: string }> {
  const data = await sharp(bytes, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize(AVATAR_PX, AVATAR_PX, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
  return { data, hash: createHash("sha256").update(data).digest("hex").slice(0, 16) };
}
