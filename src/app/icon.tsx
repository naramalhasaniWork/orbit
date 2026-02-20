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
        {/* Orbital ring */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "2.5px solid #6366f1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Center dot */}
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#6366f1",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
