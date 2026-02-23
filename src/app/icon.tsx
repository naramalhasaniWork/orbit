import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "rgba(99, 102, 241, 0.15)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {/* Orbital ring — tilted ellipse */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            style={{ position: "absolute" }}
          >
            <ellipse
              cx="12"
              cy="12"
              rx="10"
              ry="4"
              transform="rotate(-30 12 12)"
              fill="none"
              stroke="#6366f1"
              strokeWidth="1.2"
              opacity="0.5"
            />
          </svg>
          {/* Center dot with glow */}
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#6366f1",
              boxShadow: "0 0 6px rgba(99, 102, 241, 0.6)",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
