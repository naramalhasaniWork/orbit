import { ImageResponse } from "next/og";
import { markTileDataUri } from "@/lib/closing-o";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS needs a PNG: the display cut on the ink tile, rasterised.
export default function AppleIcon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={markTileDataUri("idle", size.width)} width={size.width} height={size.height} alt="" />
    ),
    { ...size }
  );
}
