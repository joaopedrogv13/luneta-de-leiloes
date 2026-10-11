import { BRAZIL_PATH, BRAZIL_PINS, type PinId } from "@/lib/brazil";

const PULSE_DELAYS: Partial<Record<PinId, string>> = {
  sp: "0s",
  rj: "0.4s",
  bh: "0.9s",
  bsb: "1.3s",
  ssa: "0.6s",
  for_: "1.7s",
  cwb: "1.1s",
};

/**
 * Mapa do Brasil em SVG com pins que pulsam (CSS, 2s). Os pins são posicionados em % do viewBox
 * 400×400, então o mesmo componente serve para a lente do hero e para o painel de filtros.
 */
export function BrazilMap({
  variant = "panel",
  pins = Object.keys(BRAZIL_PINS) as PinId[],
  highlight,
  label = "Mapa do Brasil com leilões monitorados",
  pinClassName = "",
}: {
  variant?: "panel" | "lens";
  pins?: PinId[];
  highlight?: PinId;
  label?: string;
  /** classe extra nos pins (usada pela animação do hero para acendê-los em sequência) */
  pinClassName?: string;
}) {
  const lens = variant === "lens";
  return (
    <div className="relative h-full w-full">
      <svg viewBox="0 0 400 400" role="img" aria-label={label} className="block h-full w-full">
        <path
          d={BRAZIL_PATH}
          fill={lens ? "rgba(201,162,77,0.12)" : "#0F1830"}
          stroke="#C9A24D"
          strokeWidth={lens ? 2 : 1.5}
          strokeLinejoin="round"
        />
      </svg>
      {pins.map((id) => {
        const [x, y] = BRAZIL_PINS[id];
        const big = id === highlight;
        const delay = PULSE_DELAYS[id];
        return (
          <span
            key={id}
            data-pin={id}
            aria-hidden="true"
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-latao ${big ? "size-3 shadow-[0_0_10px_#C9A24D]" : "size-2"} ${pinClassName}`}
            style={{ left: `${(x / 400) * 100}%`, top: `${(y / 400) * 100}%` }}
          >
            {delay !== undefined && (
              <span
                className="absolute top-1/2 left-1/2 size-3.5 animate-pulse-ring rounded-full border-[1.5px] border-latao motion-reduce:hidden"
                style={{ animationDelay: delay }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}
