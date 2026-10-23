"use client";

import { useEffect, useRef, useState } from "react";
import { BRAZIL_PATH } from "@/lib/brazil";
import { CENTRO_UF, type ImovelFoco } from "@/lib/demo-foco/dados";
import { UF_NOME } from "@/lib/catalogo/rotulos";

/** Diâmetro da bolha (unidades do viewBox 400×400) para n imóveis: a área cresce com n, sem a de SP engolir as outras. */
export const diametroBolha = (n: number) => 11 + 2.2 * Math.sqrt(n);

const UFS = Object.keys(CENTRO_UF);

/**
 * O mapinha da demonstração: uma bolha por estado com quantos imóveis da lista estão nele (cresce, encolhe e apaga
 * na hora, com transição). Passar o mouse num imóvel da lista acende o estado dele; passar o mouse numa bolha acende
 * os imóveis dela na lista; clicar escolhe (ou tira) o estado no filtro. Com o mesmo filtro no controle "Estado",
 * pelo teclado; o mapa em si é uma imagem com a contagem por estado para leitores de tela.
 */
export function MapaFoco({
  itens,
  ufsEscolhidas,
  destaque,
  onDestaque,
  onAlternarUf,
  className = "",
}: {
  itens: readonly ImovelFoco[];
  ufsEscolhidas: readonly string[];
  destaque: string | null;
  onDestaque: (uf: string | null) => void;
  onAlternarUf: (uf: string) => void;
  className?: string;
}) {
  const [sobre, setSobre] = useState<string | null>(null);
  // mapa pequeno (celular): as bolhas e os números crescem um pouco no viewBox, para continuarem legíveis na tela
  const svg = useRef<SVGSVGElement>(null);
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const medir = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const pxPorUnidade = Math.max(0.1, Math.min(w, h) / 400);
      setEscala(Math.min(1.5, Math.max(1, 0.95 / pxPorUnidade)));
    };
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const porUf = new Map<string, number>();
  for (const i of itens) porUf.set(i.uf, (porUf.get(i.uf) ?? 0) + 1);
  const ranking = [...porUf].sort((a, b) => b[1] - a[1]);
  const descricao = itens.length
    ? `Mapa do Brasil: ${itens.length} ${itens.length === 1 ? "imóvel" : "imóveis"} em ${porUf.size} ${porUf.size === 1 ? "estado" : "estados"}. ${ranking
        .slice(0, 6)
        .map(([uf, n]) => `${UF_NOME[uf] ?? uf}: ${n}`)
        .join("; ")}${ranking.length > 6 ? "; e outros" : ""}.`
    : "Mapa do Brasil: nenhum imóvel com esses filtros.";
  // o de maior deságio (a lista pode estar em outra ordem)
  let melhor: ImovelFoco | undefined;
  for (const i of itens) if (!melhor || i.desagio > melhor.desagio) melhor = i;
  const aceso = sobre ?? destaque;
  const nSobre = sobre ? (porUf.get(sobre) ?? 0) : 0;

  return (
    <div className={`relative overflow-hidden bg-noite ${className}`}>
      <div aria-hidden="true" className="grid-lines absolute inset-0 opacity-70" />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(70%_60%_at_60%_45%,rgba(201,162,77,.10),transparent_70%)]" />
      <svg ref={svg} viewBox="0 0 400 400" role="img" aria-label={descricao} className="absolute inset-0 m-auto block size-full max-h-full px-3 pt-10 pb-3 sm:px-5 sm:pt-11 sm:pb-4 lg:p-5">
        <path d={BRAZIL_PATH} className="fill-tinta stroke-latao" strokeWidth={1.2} strokeLinejoin="round" style={{ fillOpacity: 0.9 }} />
        {UFS.map((uf) => {
          const [x, y] = CENTRO_UF[uf];
          const n = porUf.get(uf) ?? 0;
          const escolhida = ufsEscolhidas.includes(uf);
          const d = (n > 0 ? diametroBolha(n) : 5) * escala;
          const luz = aceso === uf;
          return (
            <g
              key={uf}
              transform={`translate(${x} ${y})`}
              className="cursor-pointer"
              onPointerEnter={(e) => {
                if (e.pointerType !== "mouse") return;
                setSobre(uf);
                onDestaque(uf);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== "mouse") return;
                setSobre(null);
                onDestaque(null);
              }}
              onClick={() => onAlternarUf(uf)}
            >
              <title>{`${UF_NOME[uf] ?? uf}: ${n} ${n === 1 ? "imóvel" : "imóveis"}${escolhida ? " (no filtro)" : ""}`}</title>
              {/* área de toque maior que a bolha */}
              <circle r={14 * escala} fill="transparent" />
              {/* anel: estado aceso pela lista ou escolhido no filtro */}
              <circle
                r={1}
                className={`fill-none transition-[transform,opacity] duration-300 ease-luneta [transform-box:fill-box] [transform-origin:center] motion-reduce:transition-none ${luz ? "stroke-luar" : "stroke-latao"}`}
                vectorEffect="non-scaling-stroke"
                strokeWidth={luz ? 2 : 1.5}
                style={{ transform: `scale(${d / 2 + (luz ? 4.5 : 3)})`, opacity: luz || escolhida ? 1 : 0 }}
              />
              {/* contorno na cor do país: bolhas vizinhas não se fundem quando encostam */}
              <circle
                r={1}
                className={`stroke-tinta transition-[transform,fill,opacity] duration-300 ease-luneta [transform-box:fill-box] [transform-origin:center] motion-reduce:transition-none ${n > 0 ? "fill-latao" : "fill-nevoa"}`}
                vectorEffect="non-scaling-stroke"
                strokeWidth={n > 0 ? 1.5 : 0}
                style={{ transform: `scale(${d / 2})`, opacity: n > 0 ? 1 : 0.45 }}
              />
              {n > 0 && (
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  className="pointer-events-none fill-noite-fixa font-display font-bold tabular-nums"
                  style={{ fontSize: (n >= 100 ? 7 : n >= 10 ? 8.5 : 9) * escala }}
                >
                  {n}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <p aria-hidden="true" className="pointer-events-none absolute top-3 left-3 rounded-full border border-nevoa/20 bg-tinta/85 px-2.5 py-1 text-[11px] font-medium text-nevoa backdrop-blur-sm sm:top-4 sm:left-4">
        {sobre ? (
          <span className="text-luar">
            {UF_NOME[sobre] ?? sobre}: <strong className="font-semibold tabular-nums">{nSobre}</strong> {nSobre === 1 ? "imóvel" : "imóveis"} ·{" "}
            {ufsEscolhidas.includes(sobre) ? "clique para tirar" : "clique para filtrar"}
          </span>
        ) : (
          <>Por estado · toque para filtrar</>
        )}
      </p>

      {/* só no computador, onde sobra espaço embaixo do mapa (no celular e no tablet ele cobriria o Sul; o maior deságio
          também é o primeiro da lista na ordem padrão) */}
      <p className="absolute bottom-4 left-4 flex max-w-[calc(100%-32px)] min-w-0 items-center gap-2 rounded-xl border border-latao/35 bg-tinta/90 px-3 py-2 text-xs text-luar backdrop-blur-sm max-lg:hidden">
        {melhor ? (
          <>
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-pos" />
            <span className="min-w-0 truncate">
              Maior deságio da lista: {melhor.bairro}, {melhor.cidade}/{melhor.uf} ·{" "}
              <strong className="font-semibold tabular-nums">−{melhor.desagio}%</strong>
            </span>
          </>
        ) : (
          <span className="text-nevoa">Nenhum imóvel com esses filtros.</span>
        )}
      </p>
    </div>
  );
}
