import type { ReactNode } from "react";
import type { TipoImovel } from "@/lib/catalogo/tipos";

/**
 * Ilustração de linha por tipo de imóvel (fundo de foto ausente ou que não carregou). Desenhada num
 * quadro 4:3 (400×300) com as cores do tema: traço em luar, janelas acesas em latão, estrelas e lua só no
 * escuro (--stars), sol de latão no claro. O fundo (gradiente) fica no contêiner; aqui só o desenho.
 */
export function IlustracaoTipo({ tipo, className = "" }: { tipo: TipoImovel; className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={`absolute inset-0 size-full ${className}`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* céu: estrelas (só no tema escuro) e o astro em latão (lua no escuro, sol no claro) */}
      <g className="fill-luar" style={{ opacity: "calc(var(--stars) * 0.55)" }}>
        {ESTRELAS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
        ))}
      </g>
      {/* lua (escuro): disco de luar com halo; sol (claro): disco de latão. --stars é 1 no escuro e 0 no claro */}
      <g style={{ opacity: "var(--stars)" }}>
        <circle cx="322" cy="62" r="32" fill="#eaf0ff" fillOpacity="0.05" />
        <circle cx="322" cy="62" r="15" fill="#eaf0ff" fillOpacity="0.16" stroke="#eaf0ff" strokeOpacity="0.4" strokeWidth="1.5" />
        <circle cx="317" cy="58" r="2.6" fill="#eaf0ff" fillOpacity="0.14" />
        <circle cx="327" cy="67" r="1.8" fill="#eaf0ff" fillOpacity="0.12" />
      </g>
      <g style={{ opacity: "calc(1 - var(--stars))" }}>
        <circle cx="322" cy="62" r="30" className="fill-latao/[0.08]" />
        <circle cx="322" cy="62" r="15" className="fill-latao/30 stroke-latao/60" strokeWidth="1.5" />
      </g>

      {/* chão */}
      <path d="M28 214H372" className="stroke-nevoa/40" strokeWidth="1.5" />
      <path d="M60 226H148M250 226H340" className="stroke-nevoa/20" strokeWidth="1.5" strokeDasharray="2 7" />

      <g className="stroke-luar/45" strokeWidth="2">
        {DESENHOS[tipo] ?? DESENHOS.outro}
      </g>
    </svg>
  );
}

const ESTRELAS: readonly [number, number, number][] = [
  [58, 44, 1.3], [96, 84, 0.9], [138, 30, 1.1], [176, 62, 0.7], [252, 38, 0.9], [270, 96, 1.2],
  [370, 118, 0.9], [36, 122, 0.8], [214, 22, 1], [378, 30, 0.8], [118, 128, 0.7],
];

/** Classes reaproveitadas: parede (preenchimento leve), janela apagada e janela acesa. */
const PAREDE = "fill-luar/[0.045]";
const APAGADA = "fill-nevoa/15";
const ACESA = "fill-latao/60 stroke-latao/80";

function Janelas({ xs, ys, w, h, acesas }: { xs: number[]; ys: number[]; w: number; h: number; acesas: string[] }) {
  return (
    <>
      {ys.flatMap((y) =>
        xs.map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="1.5" strokeWidth="1.5" className={acesas.includes(`${x}-${y}`) ? ACESA : APAGADA} />
        )),
      )}
    </>
  );
}

const ESCALOPES = (() => {
  // toldo: 10 ondas de 14px, da direita para a esquerda
  let d = "M134 118H274V130";
  for (let x = 274; x > 134; x -= 14) d += `Q${x - 7} 139 ${x - 14} 130`;
  return `${d}Z`;
})();

const DESENHOS: Record<TipoImovel, ReactNode> = {
  apartamento: (
    <>
      <rect x="116" y="142" width="34" height="72" rx="3" className={PAREDE} />
      <Janelas xs={[125]} ys={[154, 170, 186]} w={16} h={9} acesas={["125-170"]} />
      <rect x="150" y="78" width="80" height="136" rx="3" className={PAREDE} />
      <path d="M190 78V60M183 66h14" />
      <Janelas xs={[161, 183, 205]} ys={[92, 113, 134, 155]} w={14} h={12} acesas={["183-113", "205-134", "161-155"]} />
      <rect x="181" y="182" width="18" height="32" rx="2" />
      <rect x="230" y="120" width="50" height="94" rx="3" className={PAREDE} />
      <Janelas xs={[240, 260]} ys={[133, 152, 171]} w={10} h={11} acesas={["260-152"]} />
    </>
  ),
  casa: (
    <>
      <circle cx="116" cy="170" r="21" className="fill-pos/[0.06]" />
      <path d="M116 191v23M116 200l-7-6M116 196l6-5" />
      <path d="M234 127.7V110h12v26.6" className={PAREDE} />
      <rect x="150" y="146" width="104" height="68" rx="2" className={PAREDE} />
      <path d="M140 151.5L202 105l62 46.5" />
      <circle cx="202" cy="132" r="7" strokeWidth="1.5" className={APAGADA} />
      <rect x="162" y="164" width="20" height="18" rx="1.5" strokeWidth="1.5" className={ACESA} />
      <rect x="222" y="164" width="20" height="18" rx="1.5" strokeWidth="1.5" className={APAGADA} />
      <path d="M232 164v18M222 173h20" strokeWidth="1.25" />
      <rect x="192" y="174" width="20" height="40" rx="2" />
      <circle cx="207" cy="195" r="1.3" className="fill-luar/50" stroke="none" />
      <path d="M266 214a11 11 0 0 1 22 0" className="fill-pos/[0.06]" />
    </>
  ),
  terreno: (
    <>
      <path d="M30 178Q110 138 190 168T372 160" className="stroke-nevoa/35" strokeWidth="1.5" />
      <path d="M112 212L160 160H280L300 212Z" className="fill-latao/[0.07]" strokeDasharray="7 6" />
      {(
        [
          [160, 160],
          [280, 160],
          [112, 212],
          [300, 212],
        ] as const
      ).map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <path d={`M${x} ${y}V${y - 24}`} />
          <path d={`M${x} ${y - 24}l15 5.5-15 5.5z`} strokeWidth="1.25" className="fill-latao/70 stroke-latao/80" />
        </g>
      ))}
      <path d="M186 192l3-7 3 7M224 178l3-7 3 7M250 200l3-7 3 7M206 204l3-6 3 6" strokeWidth="1.5" className="stroke-pos/50" />
    </>
  ),
  comercial: (
    <>
      <rect x="138" y="96" width="132" height="118" rx="2" className={PAREDE} />
      <rect x="138" y="96" width="132" height="22" className="fill-nevoa/12" strokeWidth="1.5" />
      <path d="M170 107h68" strokeWidth="3" className="stroke-latao/70" />
      <path d={ESCALOPES} className="fill-latao/15" strokeWidth="1.75" />
      <rect x="150" y="146" width="62" height="44" rx="2" strokeWidth="1.75" className="fill-latao/30 stroke-luar/45" />
      <path d="M181 146v44" strokeWidth="1.5" />
      <rect x="226" y="146" width="32" height="68" rx="2" />
      <path d="M232 180h5" />
      <path d="M150 202h62" strokeWidth="1.5" className="stroke-nevoa/40" />
    </>
  ),
  rural: (
    <>
      <path d="M14 214Q92 160 172 200T392 194" className="stroke-nevoa/35" strokeWidth="1.5" />
      <path d="M108 214v-20M130 214v-20M152 214v-20M174 214v-20M102 200h80M102 208h80" strokeWidth="1.75" />
      <path d="M206 214V166h76v48" className={PAREDE} />
      <path d="M200 168L214 142L244 127L274 142L288 168" />
      <rect x="238" y="148" width="12" height="12" rx="1" strokeWidth="1.5" className={ACESA} />
      <rect x="231" y="182" width="26" height="32" rx="1" />
      <path d="M231 182l26 32M257 182l-26 32" strokeWidth="1.5" />
      <path d="M294 214V142a12 12 0 0 1 24 0v72" className={PAREDE} />
      <path d="M294 162h24M294 188h24" strokeWidth="1.5" />
    </>
  ),
  outro: (
    <>
      <ellipse cx="200" cy="210" rx="76" ry="13" strokeDasharray="6 6" className="fill-latao/[0.06] stroke-nevoa/50" strokeWidth="1.5" />
      <path d="M200 206s-34-37-34-61a34 34 0 0 1 68 0c0 24-34 61-34 61z" className={PAREDE} />
      <circle cx="200" cy="145" r="12" strokeWidth="1.5" className={ACESA} />
    </>
  ),
};
