"use client";

import { useEffect, useRef } from "react";
import { pilulas, removerFiltro, type GrupoFiltro, type NomesDasFacetas } from "@/lib/catalogo/filtros-rotulos";
import type { Filtros } from "@/lib/catalogo/tipos";
import { IconeX } from "../ui/icones";

/**
 * Linha dos filtros ativos: cada pílula remove o seu (estados e cidades em cascata) e "Limpar tudo"
 * zera. Depois de remover, o foco vai para a pílula seguinte (ou para "Limpar tudo"), para quem usa
 * teclado não cair no começo da página. No celular a linha rola de lado; no computador quebra.
 * `ocultarNoComputador`: grupos cujas pílulas somem a partir de md (o botão rápido deles já mostra o
 * filtro e tem o × para limpar); "Limpar tudo" aparece no computador com qualquer filtro ativo.
 */
export function PilulasFiltros({
  filtros,
  facetas,
  onChange,
  rolavel = false,
  className = "",
  aoEsvaziar,
  ocultarNoComputador,
}: {
  filtros: Filtros;
  /** nomes de fontes e tags (opcional) */
  facetas?: NomesDasFacetas;
  onChange: (f: Filtros) => void;
  /** no celular, uma linha que rola de lado (no computador, quebra) */
  rolavel?: boolean;
  className?: string;
  /** para onde vai o foco quando não sobra pílula (ex.: o campo de busca) */
  aoEsvaziar?: () => void;
  /** grupos que não viram pílula no computador (a partir de md) */
  ocultarNoComputador?: ReadonlySet<GrupoFiltro>;
}) {
  const lista = useRef<HTMLUListElement>(null);
  const itens = pilulas(filtros, facetas);
  const chave = itens.map((p) => p.id).join("\n");

  // Foco depois de remover: espera as pílulas novas chegarem (o pai pode aplicar os filtros depois de
  // um quadro, numa transição ou depois da URL) e só então foca a que ficou no lugar da removida.
  const focoPendente = useRef<{ indice: number; chaveAntes: string; em: number } | null>(null);
  const ultimoAoEsvaziar = useRef(aoEsvaziar);
  useEffect(() => {
    ultimoAoEsvaziar.current = aoEsvaziar;
  });
  useEffect(() => {
    const p = focoPendente.current;
    if (!p || p.chaveAntes === chave) return;
    focoPendente.current = null;
    // o pai demorou demais (ou ignorou a remoção): não rouba o foco de onde a pessoa já está
    if (performance.now() - p.em > 3000) return;
    // só as que estão à vista (no computador, as dos botões rápidos ficam escondidas)
    const botoes = Array.from(lista.current?.querySelectorAll<HTMLButtonElement>("[data-pilula]") ?? []).filter((b) => b.getClientRects().length > 0);
    const alvo = botoes.length ? botoes[Math.min(p.indice, botoes.length - 1)] : null;
    if (alvo) alvo.focus();
    else ultimoAoEsvaziar.current?.();
  }, [chave]);

  if (!itens.length) return null;

  // `em`: a hora do clique (event.timeStamp, a mesma régua de performance.now())
  const remover = (novo: Filtros, indice: number, em: number) => {
    focoPendente.current = { indice, chaveAntes: chave, em };
    onChange(novo);
  };

  return (
    <ul
      ref={lista}
      aria-label="Filtros ativos"
      className={`flex items-center gap-2 ${rolavel ? "-mx-4 snap-x scroll-px-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden" : "flex-wrap"} ${className}`}
    >
      {itens.map((p, i) => (
        <li key={p.id} className={`shrink-0 snap-start ${ocultarNoComputador?.has(p.grupo) ? "md:hidden" : ""}`}>
          <button
            type="button"
            data-pilula
            aria-label={`Remover filtro: ${p.rotulo}`}
            title="Remover filtro"
            onClick={(e) => remover(removerFiltro(filtros, p.grupo, p.valor), i, e.timeStamp)}
            className="group/p inline-flex min-h-11 max-w-[280px] cursor-pointer items-center gap-1.5 rounded-full border border-latao/45 bg-latao/12 pr-2 pl-3.5 text-[13px] leading-none font-medium text-luar transition-[background-color,border-color,scale,opacity] duration-150 ease-luneta starting:scale-95 starting:opacity-0 hover:border-latao hover:bg-latao/20 active:scale-[0.97] motion-reduce:transition-none pointer-fine:min-h-8"
          >
            <span className="truncate tabular-nums">{p.rotulo}</span>
            <span
              aria-hidden="true"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-latao-texto transition-colors group-hover/p:bg-latao group-hover/p:text-noite-fixa"
            >
              <IconeX tamanho={11} />
            </span>
          </button>
        </li>
      ))}
      {itens.length > 0 && (
        <li className={`shrink-0 snap-start ${itens.length === 1 ? "max-md:hidden" : ""}`}>
          <button
            type="button"
            onClick={(e) => remover({}, 0, e.timeStamp)}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-[13px] font-semibold whitespace-nowrap text-latao-texto underline-offset-4 transition-colors hover:underline pointer-fine:min-h-8"
          >
            Limpar tudo
          </button>
        </li>
      )}
    </ul>
  );
}
