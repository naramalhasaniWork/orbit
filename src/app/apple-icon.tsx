import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0f",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: 32,
            background: "rgba(99, 102, 241, 0.15)",
            border: "2px solid rgba(99, 102, 241, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <svg
            width="100"
            height="100"
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
              strokeWidth="0.8"
              opacity="0.5"
            />
          </svg>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "#6366f1",
              boxShadow: "0 0 24px rgba(99, 102, 241, 0.5)",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
