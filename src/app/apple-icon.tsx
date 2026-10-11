import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ícone: lente circular com anel de latão e retículo (mira) no centro. */
export default function AppleIcon() {
  const tick = (style: Record<string, number | string>) => (
    <div style={{ position: "absolute", background: "#EAF0FF", borderRadius: 4, ...style }} />
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#070B16" }}>
        <div
          style={{
            position: "relative",
            width: 140,
            height: 140,
            borderRadius: 999,
            border: "14px solid #C9A24D",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 16, height: 16, borderRadius: 999, background: "#C9A24D" }} />
          {tick({ left: 50, top: 6, width: 8, height: 28 })}
          {tick({ left: 50, bottom: 6, width: 8, height: 28 })}
          {tick({ top: 50, left: 6, width: 28, height: 8 })}
          {tick({ top: 50, right: 6, width: 28, height: 8 })}
        </div>
      </div>
    ),
    size,
  );
}
