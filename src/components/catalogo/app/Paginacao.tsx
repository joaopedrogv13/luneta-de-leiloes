"use client";

import type { MouseEvent, ReactNode } from "react";
import { numero } from "@/lib/catalogo/rotulos";
import { faixaDaPagina, paginasVisiveis, type ItemPagina } from "./paginas";

const BOTAO =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-sm font-medium tabular-nums transition-[background-color,border-color,color] duration-150 ease-luneta motion-reduce:transition-none";

/** Clique comum vira troca de página no app; com Ctrl/⌘/Shift ou o botão do meio, o link abre como link. */
function cliqueSimples(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function LinkPagina({
  pagina,
  href,
  onIr,
  atual = false,
  rotulo,
  className = "",
  children,
}: {
  pagina: number;
  href: string;
  onIr: (p: number) => void;
  atual?: boolean;
  rotulo?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={atual ? "page" : undefined}
      aria-label={rotulo}
      onClick={(e) => {
        if (!cliqueSimples(e)) return;
        e.preventDefault();
        if (!atual) onIr(pagina);
      }}
      className={`${BOTAO} ${
        atual ? "bg-latao font-semibold text-noite-fixa" : "border border-transparent text-luar hover:border-nevoa/35 hover:bg-nevoa/[0.07]"
      } ${className}`}
    >
      {children}
    </a>
  );
}

function Itens({ itens, atual, hrefDe, onIr }: { itens: ItemPagina[]; atual: number; hrefDe: (p: number) => string; onIr: (p: number) => void }) {
  return (
    <>
      {itens.map((x, i) =>
        x === "…" ? (
          <li key={`r${i}`} aria-hidden="true" className="inline-flex min-w-6 justify-center text-sm text-nevoa">
            …
          </li>
        ) : (
          <li key={x}>
            <LinkPagina pagina={x} href={hrefDe(x)} onIr={onIr} atual={x === atual} rotulo={x === atual ? `Página ${x}, atual` : `Página ${x}`}>
              {numero(x)}
            </LinkPagina>
          </li>
        ),
      )}
    </>
  );
}

const Seta = ({ para }: { para: "esq" | "dir" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {para === "esq" ? <path d="M10 3.5 5.5 8l4.5 4.5" /> : <path d="M6 3.5 10.5 8 6 12.5" />}
  </svg>
);

/**
 * Paginação numerada no fim da lista: "Anterior 1 2 3 … 52 Próxima" (no celular, setas e menos números).
 * São links de verdade (abrem em outra aba com Ctrl/⌘); o clique comum troca a página no app e leva ao
 * topo da lista. Embaixo, "Mostrando 25–48 de 1.234" e "Ir para o topo da lista".
 */
export function Paginacao({
  pagina,
  totalPaginas,
  porPagina,
  total,
  hrefDe,
  onIr,
  onTopo,
  substantivo = ["imóvel", "imóveis"],
}: {
  pagina: number;
  totalPaginas: number;
  porPagina: number;
  total: number;
  /** endereço de cada página (o mesmo da barra do navegador, com `pagina=`) */
  hrefDe: (p: number) => string;
  onIr: (p: number) => void;
  onTopo: () => void;
  substantivo?: [string, string];
}) {
  const { de, ate } = faixaDaPagina(pagina, porPagina, total);
  const anterior = pagina > 1 ? pagina - 1 : null;
  const proxima = pagina < totalPaginas ? pagina + 1 : null;
  const desativado = `${BOTAO} cursor-default border border-nevoa/15 text-nevoa/45`;

  return (
    <div className="mt-10 flex flex-col items-center gap-4">
      {totalPaginas > 1 && (
        <nav aria-label="Páginas de resultados" className="flex items-center gap-1.5 sm:gap-2">
          {anterior ? (
            <LinkPagina pagina={anterior} href={hrefDe(anterior)} onIr={onIr} rotulo="Página anterior" className="!border-nevoa/30 gap-1.5 px-3 sm:px-4">
              <Seta para="esq" />
              <span className="max-sm:hidden">Anterior</span>
            </LinkPagina>
          ) : (
            <button type="button" disabled aria-label="Página anterior" className={`${desativado} gap-1.5 px-3 sm:px-4`}>
              <Seta para="esq" />
              <span className="max-sm:hidden">Anterior</span>
            </button>
          )}

          {/* computador: vizinhas de cada lado; celular: só a atual entre reticências (cabe em 360 px) */}
          <ol className="flex items-center gap-1 max-sm:hidden">
            <Itens itens={paginasVisiveis(pagina, totalPaginas, 1)} atual={pagina} hrefDe={hrefDe} onIr={onIr} />
          </ol>
          <ol className="flex items-center gap-0.5 sm:hidden">
            <Itens itens={paginasVisiveis(pagina, totalPaginas, 0)} atual={pagina} hrefDe={hrefDe} onIr={onIr} />
          </ol>

          {proxima ? (
            <LinkPagina pagina={proxima} href={hrefDe(proxima)} onIr={onIr} rotulo="Próxima página" className="!border-nevoa/30 gap-1.5 px-3 sm:px-4">
              <span className="max-sm:hidden">Próxima</span>
              <Seta para="dir" />
            </LinkPagina>
          ) : (
            <button type="button" disabled aria-label="Próxima página" className={`${desativado} gap-1.5 px-3 sm:px-4`}>
              <span className="max-sm:hidden">Próxima</span>
              <Seta para="dir" />
            </button>
          )}
        </nav>
      )}
      <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] text-nevoa">
        {total > 0 && (
          <span className="tabular-nums">
            Mostrando {numero(de)}–{numero(ate)} de {numero(total)} {total === 1 ? substantivo[0] : substantivo[1]}
          </span>
        )}
        <button
          type="button"
          onClick={onTopo}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-1 font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
        >
          <span aria-hidden="true">↑</span>
          Ir para o topo da lista
        </button>
      </p>
    </div>
  );
}
