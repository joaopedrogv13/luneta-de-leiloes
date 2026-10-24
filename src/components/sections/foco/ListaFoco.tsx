"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { METRO_PERTO, tituloImovel, type ImovelFoco, type TipoFoco } from "@/lib/demo-foco/dados";
import { PRACA_ROTULO } from "@/lib/demo-foco/busca";
import { area, moedaCurta, numero } from "@/lib/catalogo/rotulos";
import { semMovimento } from "@/components/catalogo/ui/useAdiado";
import { LINHA_IMOVEL, LISTA, RODAPE_LISTA, SELOS_IMOVEL } from "./Casca";

const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
/** Mudanças mais próximas que isso (arrastar um cursor) não animam: a lista acompanha o dedo, sem tremer. */
const SEGUIDAS_MS = 160;

/**
 * Anima a lista quando os resultados mudam (FLIP): quem continua desliza da posição antiga para a nova, quem entra
 * aparece subindo de leve. Só transform e opacity (no compositor); com "reduzir movimento", nada anima.
 */
function useListaAnimada(dependencia: string) {
  const caixa = useRef<HTMLUListElement>(null);
  const posicoes = useRef(new Map<string, number>());
  const ultima = useRef(0);
  useLayoutEffect(() => {
    const ul = caixa.current;
    if (!ul) return;
    const agora = performance.now();
    const animar = !semMovimento() && agora - ultima.current > SEGUIDAS_MS && posicoes.current.size > 0;
    ultima.current = agora;
    const linhas = ul.querySelectorAll<HTMLElement>("[data-id]");
    const novas = new Map<string, number>();
    linhas.forEach((el) => novas.set(el.dataset.id!, el.offsetTop));
    // a parte visível da lista (ela pode rolar por dentro): só o que se vê anima
    const topo = ul.scrollTop - 120;
    const fundo = ul.scrollTop + Math.max(ul.clientHeight, window.innerHeight) + 120;
    let entrando = 0;
    linhas.forEach((el) => {
      for (const a of el.getAnimations()) a.cancel();
      if (!animar) return;
      const depois = novas.get(el.dataset.id!)!;
      if (depois < topo || depois > fundo) return;
      const antes = posicoes.current.get(el.dataset.id!);
      if (antes === undefined) {
        el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], {
          duration: 240,
          delay: Math.min(entrando++, 8) * 22,
          easing: EASE,
          fill: "backwards",
        });
      } else if (antes !== depois) {
        el.animate([{ transform: `translateY(${antes - depois}px)` }, { transform: "none" }], { duration: 280, easing: EASE });
      }
    });
    posicoes.current = novas;
  }, [dependencia]);
  return caixa;
}

/** Selo de um imóvel: 19 px de altura, com ou sem ícone (a moldura conta com isso; ver SELOS_IMOVEL). */
const SELO = "inline-flex h-[19px] items-center gap-1 rounded-full border px-2 text-[11px] leading-none font-medium whitespace-nowrap";

function IconeTipo({ tipo }: { tipo: TipoFoco }) {
  const caminhos: Record<TipoFoco, ReactNode> = {
    apartamento: (
      <>
        <rect x="6" y="3.5" width="12" height="17" rx="1.5" />
        <path d="M9.5 7.5h1M13.5 7.5h1M9.5 11h1M13.5 11h1M9.5 14.5h1M13.5 14.5h1M11 20.5v-3h2v3" />
      </>
    ),
    casa: (
      <>
        <path d="M4 11 12 4.5 20 11" />
        <path d="M6 9.5v10h12v-10" />
        <path d="M10 19.5v-5h4v5" />
      </>
    ),
    comercial: (
      <>
        <path d="M4.5 9.5 6 4.5h12l1.5 5" />
        <path d="M4.5 9.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5" />
        <path d="M6 12v7.5h12V12M10 19.5v-4h4v4" />
      </>
    ),
    terreno: (
      <>
        <path d="M3.5 18.5 9 9l4 6 2.5-3.5 5 7z" />
        <path d="M15.5 6.5a1.5 1.5 0 1 0 0-.01" />
      </>
    ),
  };
  return (
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-latao/25 bg-latao/[0.08] text-latao-texto max-sm:hidden">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {caminhos[tipo]}
      </svg>
    </span>
  );
}

function Linha({ i, aceso, onDestaque }: { i: ImovelFoco; aceso: boolean; onDestaque: (uf: string | null) => void }) {
  const metroPerto = i.metro !== null && i.metro <= METRO_PERTO;
  return (
    <li
      data-id={i.id}
      onPointerEnter={(e) => e.pointerType === "mouse" && onDestaque(i.uf)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onDestaque(null)}
      className={`${LINHA_IMOVEL} transition-colors duration-150 ${aceso ? "bg-latao/[0.07]" : ""}`}
    >
      {aceso && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-latao" />}
      <IconeTipo tipo={i.tipo} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] leading-snug font-semibold text-luar">{tituloImovel(i)}</p>
        <p className="mt-0.5 truncate text-[13px] leading-snug text-nevoa">
          <span className="text-luar/85 tabular-nums">{area(i.area)}</span> · {i.bairro} · {i.cidade}/{i.uf}
        </p>
        <p className={SELOS_IMOVEL}>
          {/* a praça em neutro (o latão e o amarelo de "Ocupado" ficariam parecidos); a 2ª, em destaque */}
          <span className={`${SELO} ${i.praca === "2" ? "border-nevoa/45 font-semibold text-luar" : "border-nevoa/25 text-nevoa"}`}>{PRACA_ROTULO[i.praca]}</span>
          {i.ocupacao === "desocupado" && <span className={`${SELO} border-pos/40 text-pos`}>Desocupado</span>}
          {i.ocupacao === "ocupado" && <span className={`${SELO} border-aten/45 text-aten`}>Ocupado</span>}
          {metroPerto && (
            <span className={`${SELO} border-nevoa/25 text-luar`}>
              <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 text-latao-texto" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <rect x="2.5" y="1.5" width="7" height="7" rx="2" />
                <path d="M4 10.5 3 11.5M8 10.5l1 1M2.5 5.5h7" />
              </svg>
              Metrô a {numero(i.metro!)} m
            </span>
          )}
          {i.nota !== null && <span className={`${SELO} border-nevoa/25 text-nevoa`}>Nota {i.nota}</span>}
          {i.financiamento && <span className={`${SELO} border-nevoa/25 text-nevoa max-sm:hidden`}>Financiamento</span>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-xl leading-none font-bold tracking-[-0.02em] text-luar tabular-nums">−{i.desagio}%</p>
        <p className="mt-1.5 text-[13px] leading-none font-semibold text-luar tabular-nums">{moedaCurta(i.lance)}</p>
        <p className="mt-1 text-[11px] leading-none text-nevoa tabular-nums">
          <span className="sr-only">avaliação </span>
          <span aria-hidden="true">aval. </span>
          {moedaCurta(i.avaliacao)}
        </p>
      </div>
    </li>
  );
}

/**
 * A lista de resultados da demonstração: título, bairro e cidade, selos (praça, ocupação, metrô, nota) e, à direita,
 * o deságio, o lance e a avaliação. Passar o mouse acende o estado do imóvel no mapinha; um estado aceso no mapinha
 * acende os imóveis dele aqui.
 */
export function ListaFoco({
  itens,
  limite,
  destaque,
  onDestaque,
  rodape,
  vazio,
  rolaPorDentro,
}: {
  itens: readonly ImovelFoco[];
  /** quantos mostrar (o resto vem com "Mostrar mais") */
  limite: number;
  destaque: string | null;
  onDestaque: (uf: string | null) => void;
  rodape?: ReactNode;
  vazio: ReactNode;
  /** computador: a lista rola dentro do quadro (e entra na ordem do Tab, para rolar pelo teclado) */
  rolaPorDentro: boolean;
}) {
  const mostrados = itens.slice(0, limite);
  // anima quando muda quem está na lista ou a ordem (passar o mouse, que só acende, não conta)
  const caixa = useListaAnimada(mostrados.map((i) => i.id).join(","));
  return (
    <ul
      ref={caixa}
      aria-label="Resultados da demonstração"
      tabIndex={rolaPorDentro ? 0 : undefined}
      className={`${LISTA} outline-none focus-visible:ring-2 focus-visible:ring-latao-texto focus-visible:ring-inset`}
    >
      {mostrados.map((i) => (
        <Linha key={i.id} i={i} aceso={destaque === i.uf} onDestaque={onDestaque} />
      ))}
      {!itens.length && <li className="px-4 py-8 sm:px-5">{vazio}</li>}
      {rodape && <li className={RODAPE_LISTA}>{rodape}</li>}
    </ul>
  );
}
