import { z } from "zod";
import { getStorage } from "@/lib/storage";
import { apiError } from "@/lib/utils/api";
import { avatarVersion } from "@/lib/avatar/resolve";
import { canSeeAvatar, getAvatarKey } from "@/server/data/user-avatar-repo";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

const CACHE = "private, max-age=86400";
const notFound = () => apiError("Avatar not found", "NOT_FOUND", 404);

// ============================================================
// GET /api/users/[userId]/avatar — a user's uploaded photo.
// Visible to the user and to members of any workspace they share;
// everyone else gets the same 404 as a user with no photo.
// ============================================================

export const GET = route(
  { params: z.object({ userId: z.string().uuid() }) },
  async ({ params: { userId }, session, req }) => {
    const visible = session.userRole === "super_admin" || (await canSeeAvatar(session.user.id, userId));
    if (!visible) return notFound();

    const key = await getAvatarKey(userId);
    if (!key) return notFound();

    const etag = `"${avatarVersion(key)}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE } });
    }

    let data: Buffer;
    try {
      data = await getStorage().download(key);
    } catch {
      return notFound();
    }

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(data.length),
        ETag: etag,
        "Cache-Control": CACHE,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
);
