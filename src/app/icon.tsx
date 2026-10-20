import { markTileSvg } from "@/lib/closing-o";

export const size = { width: 32, height: 32 };
export const contentType = "image/svg+xml";

// The small cut of the Closing O on an ink tile. Live state swaps it client-side (LiveFavicon).
export default function Icon() {
  return new Response(markTileSvg("idle", size.width), {
    headers: { "Content-Type": contentType },
  });
}
