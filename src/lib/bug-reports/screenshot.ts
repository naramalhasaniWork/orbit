export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

export const SCREENSHOT_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type ScreenshotType = keyof typeof SCREENSHOT_TYPES;

/** For the file input's `accept`. */
export const SCREENSHOT_ACCEPT = Object.keys(SCREENSHOT_TYPES).join(",");

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);
}

/** The image type the bytes actually are (PNG, JPEG or WebP), whatever the name or declared type says. */
export function sniffScreenshotType(bytes: Uint8Array): ScreenshotType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // "RIFF" <size> "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export function isScreenshotType(type: string): type is ScreenshotType {
  return Object.prototype.hasOwnProperty.call(SCREENSHOT_TYPES, type);
}
