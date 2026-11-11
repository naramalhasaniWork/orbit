import { ImageResponse } from "next/og";
import { SITE } from "@/lib/marketing/site";

export const alt = `${SITE.name}: ${SITE.headline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The display cut of the Closing O, ink on paper, accent dot (brand lockup).
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96"><path d="M12.815 3.539 A8.5 8.5 0 1 0 20.461 11.185" fill="none" stroke="#111316" stroke-width="2.5" stroke-linecap="round"/><circle cx="18.01" cy="5.99" r="2" fill="#FF5B14"/></svg>`;

/** Social card: the mark, the wordmark and the headline on the Telemetry canvas. Static. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#F7F7F5",
          color: "#111316",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/svg+xml,${encodeURIComponent(MARK)}`} width={64} height={64} alt="" />
          <span style={{ fontSize: 48, fontWeight: 500, letterSpacing: "-0.035em" }}>orbit</span>
        </div>
        <div style={{ display: "flex", fontSize: 76, lineHeight: 1, letterSpacing: "-0.045em", fontWeight: 500, maxWidth: 980 }}>
          {SITE.headline}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #111316", paddingTop: 20, fontSize: 22, color: "#4A5059" }}>
          <span>AI QA for pull requests</span>
          <span>Self-hosted · O'Saasy license</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
