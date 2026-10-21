import { getStorage } from "@/lib/storage";
import { apiError } from "@/lib/utils/api";
import { avatarStorageKey, resolveAvatarUrl } from "@/lib/avatar/resolve";
import {
  MAX_AVATAR_BYTES,
  REJECTION_MESSAGES,
  processAvatar,
  rejectAvatarUpload,
  type AvatarRejection,
} from "@/server/avatar/avatar-image";
import { getAvatarSource, setAvatarKey } from "@/server/data/user-avatar-repo";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

const STATUS: Record<AvatarRejection, number> = { WRONG_TYPE: 415, TOO_LARGE: 413, EMPTY: 400, BAD_IMAGE: 400 };
// Multipart framing around a 2 MB file stays well under this.
const MAX_REQUEST_BYTES = MAX_AVATAR_BYTES + 64 * 1024;

function reject(reason: AvatarRejection) {
  return apiError(REJECTION_MESSAGES[reason], reason, STATUS[reason]);
}

/** The old object is unreachable once the key changes; deleting it is housekeeping. */
async function discard(key: string | null) {
  if (key) await getStorage().remove(key).catch(() => undefined);
}

// ============================================================
// POST /api/user/avatar — upload your own photo (multipart "file").
// PNG/JPEG/WebP ≤ 2 MB, checked by magic bytes, stored as 256×256 WebP.
// ============================================================

export const POST = route({}, async ({ req, session }) => {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return reject("TOO_LARGE");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("Choose an image to upload.", "VALIDATION_ERROR", 400);
  if (file.size > MAX_AVATAR_BYTES) return reject("TOO_LARGE");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const rejection = rejectAvatarUpload(file.type, bytes);
  if (rejection) return reject(rejection);

  let processed: Awaited<ReturnType<typeof processAvatar>>;
  try {
    processed = await processAvatar(bytes);
  } catch {
    return reject("BAD_IMAGE");
  }

  const userId = session.user.id;
  const key = avatarStorageKey(userId, processed.hash);
  await getStorage().upload(key, processed.data, "image/webp");
  const previous = await setAvatarKey(userId, key);
  if (previous !== key) await discard(previous);

  return { image: resolveAvatarUrl({ id: userId, image: null, avatarKey: key }) };
});

// ============================================================
// DELETE /api/user/avatar — remove your photo; GitHub's, then initials, show instead.
// ============================================================

export const DELETE = route({}, async ({ session }) => {
  const userId = session.user.id;
  await discard(await setAvatarKey(userId, null));
  const user = await getAvatarSource(userId);
  return { image: user ? resolveAvatarUrl(user) : null };
});
