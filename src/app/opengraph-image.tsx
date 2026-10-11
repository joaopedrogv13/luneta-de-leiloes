import { ImageResponse } from "next/og";
import { SITE } from "@/content/site";
import { BRAZIL_PATH, BRAZIL_PINS } from "@/lib/brazil";

export const alt = "Luneta de Leilões: todos os leilões de imóveis do Brasil na mira da sua luneta";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const [spX, spY] = BRAZIL_PINS.sp;
const lensSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><radialGradient id="g" cx="50%" cy="45%"><stop offset="0" stop-color="#16224A"/><stop offset=".6" stop-color="#0F1830"/><stop offset="1" stop-color="#0A1226"/></radialGradient></defs><circle cx="200" cy="200" r="194" fill="url(#g)" stroke="#C9A24D" stroke-width="10"/><circle cx="200" cy="200" r="178" fill="none" stroke="#C9A24D" stroke-opacity=".5" stroke-width="2"/><g transform="translate(28 28) scale(.86)"><path d="${BRAZIL_PATH}" fill="rgba(201,162,77,0.14)" stroke="#C9A24D" stroke-width="2.4" stroke-linejoin="round"/><circle cx="${spX}" cy="${spY}" r="26" fill="none" stroke="#EAF0FF" stroke-width="2.5"/><path d="M${spX} ${spY - 40}v18M${spX} ${spY + 22}v18M${spX - 40} ${spY}h18M${spX + 22} ${spY}h18" stroke="#EAF0FF" stroke-width="2.5"/><circle cx="${spX}" cy="${spY}" r="5" fill="#4ADE9A"/></g></svg>`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: "radial-gradient(circle at 80% 20%, #16224A 0%, #070B16 60%)",
          color: "#EAF0FF",
          padding: "0 72px",
          gap: 48,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 700 }}>
            <div style={{ width: 30, height: 30, borderRadius: 999, border: "4px solid #C9A24D", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 9, height: 9, borderRadius: 999, background: "#C9A24D" }} />
            </div>
            {SITE.name}
          </div>
          <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.04, marginTop: 36, letterSpacing: -2 }}>
            Todos os leilões do Brasil. Na mira da sua luneta.
          </div>
          <div style={{ fontSize: 26, color: "#8E9BB5", marginTop: 28, lineHeight: 1.4 }}>
            Reunidos, comparados e classificados por risco, da névoa ao alvo.
          </div>
        </div>
        <img width={420} height={420} alt="" src={`data:image/svg+xml;utf8,${encodeURIComponent(lensSvg)}`} />
      </div>
    ),
    size,
  );
}
