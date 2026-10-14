"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { BACK_TO_SITE } from "@/components/assinante/shared";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoMark } from "@/components/ui/Logo";
import type { Plano } from "@/lib/catalogo/tipos";
import { IconeAneis } from "./ui/icones";

const PLANOS: { id: Plano; rotulo: string }[] = [
  { id: "lente", rotulo: "Lente" },
  { id: "luneta", rotulo: "Luneta" },
];

/** Aviso acima do cabeçalho: texto completo (computador) e curto (celular). */
export interface FaixaAviso {
  completa: string;
  curta: string;
  /** nome da região para leitores de tela ("Aviso de prévia interna") */
  rotulo: string;
  /** discreta (sem o latão) e só no celular */
  discreta?: boolean;
}

/**
 * Onde a pessoa assina (os planos da landing). Os links para a landing não a pré-carregam (prefetch={false}):
 * ela é estática e abre rápido no clique, e o pré-carregamento baixava ~300 KB (dados, JS e CSS da landing)
 * em toda visita ao catálogo.
 */
const PLANOS_DO_SITE = "/#planos";

/**
 * Fixo só no computador com altura de sobra (≥ 801 px): numa tela de notebook mais baixa (1280×800, 1366×768)
 * ele rola com a página e só a barra de filtros fica fixa, para a lista ter a tela.
 */
const FIXO_NO_COMPUTADOR =
  "[@media(min-width:64rem)_and_(min-height:50.0625rem)]:sticky [@media(min-width:64rem)_and_(min-height:50.0625rem)]:top-0 [@media(min-width:64rem)_and_(min-height:50.0625rem)]:z-40";

/**
 * Cabeçalho do catálogo. No computador fica fixo no topo (com a barra de filtros logo abaixo e o mapa
 * ao lado da lista, tudo cabe na tela); no celular e em tela baixa rola com a página e só a barra de
 * filtros fica fixa.
 * - faixa de aviso (rola sempre): na /previa, a da prévia interna com as datas das fontes (latão); na
 *   /assinante, "exemplos fictícios", discreta e só no celular (no computador a linha sob o título já diz);
 * - logo com "voltar ao site" e o título da página (h1; no celular, só para leitores de tela);
 * - "Ver como: Lente | Luneta" (a troca recarrega a busca no plano escolhido);
 * - tema claro/escuro e o convite "Plano Luneta" (planos do site).
 */
export function Cabecalho({
  plano,
  onPlano,
  titulo,
  area,
  faixa,
  lunetaRef,
  cabecalhoRef,
}: {
  plano: Plano;
  onPlano: (p: Plano) => void;
  /** título da página (h1) */
  titulo: string;
  /** linha sob o título: "Prévia interna · dados reais", "Demonstração · exemplos fictícios" */
  area: string;
  /** o <header> (o app mede a altura dele para a barra de filtros parar logo abaixo) */
  cabecalhoRef?: RefObject<HTMLElement | null>;
  /** faixa de aviso acima do cabeçalho */
  faixa?: FaixaAviso | null;
  /** botão "Luneta" do seletor (recebe o foco depois de "Assinar Luneta" no aviso do Lente, que some) */
  lunetaRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <>
      {faixa && (
        <aside
          aria-label={faixa.rotulo}
          className={
            faixa.discreta
              ? "border-b border-nevoa/12 bg-tinta px-4 py-2 text-center text-[12.5px] leading-snug font-medium text-nevoa md:hidden"
              : "bg-latao px-4 py-2 text-center text-[12.5px] leading-snug font-semibold text-noite-fixa sm:px-6"
          }
        >
          <p className="mx-auto max-sm:hidden">{faixa.completa}</p>
          <p className="sm:hidden">{faixa.curta}</p>
        </aside>
      )}
      <header ref={cabecalhoRef} className={`border-b border-nevoa/12 bg-noite ${FIXO_NO_COMPUTADOR}`}>
        <div className="flex min-h-14 items-center gap-x-3 px-4 sm:min-h-16 sm:px-6 lg:px-8">
          <Link
            href={BACK_TO_SITE}
            prefetch={false}
            className="group -ml-1 inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-full pr-2 pl-1 no-underline"
          >
            {/* nome acessível = o texto visível ("Luneta", "voltar ao site") com o complemento só para leitores de tela */}
            <LogoMark />
            <span className="font-display text-[17px] leading-none font-bold tracking-[-0.01em] whitespace-nowrap text-luar">
              Luneta<span className="sr-only"> de Leilões:</span>
            </span>
            <span className="text-[13px] whitespace-nowrap text-nevoa transition-colors duration-150 group-hover:text-luar max-lg:sr-only">
              <span aria-hidden="true">← </span>voltar ao site
            </span>
          </Link>
          <span aria-hidden="true" className="hidden h-8 w-px shrink-0 bg-nevoa/20 md:block" />
          <div className="min-w-0 max-md:sr-only">
            <h1 className="truncate font-display text-[15px] leading-tight font-bold tracking-[-0.01em] text-luar">{titulo}</h1>
            <p className="truncate text-[12px] leading-tight text-nevoa">{area}</p>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div role="group" aria-label="Ver como" className="inline-flex items-center rounded-full border border-nevoa/25 bg-tinta p-1">
              <span aria-hidden="true" className="hidden pr-1.5 pl-2.5 text-[10px] leading-none font-semibold tracking-[0.12em] whitespace-nowrap text-nevoa uppercase lg:inline">
                Ver como
              </span>
              {PLANOS.map((p) => {
                const ativo = plano === p.id;
                return (
                  <button
                    key={p.id}
                    ref={p.id === "luneta" ? lunetaRef : undefined}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => !ativo && onPlano(p.id)}
                    className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-[background-color,color,scale] duration-200 ease-luneta active:scale-[0.96] motion-reduce:transition-none pointer-fine:min-h-8 ${
                      // ativo neutro (como as abas): o latão cheio fica só para o convite "Plano Luneta" ao lado
                      ativo ? "bg-luar text-noite" : "text-nevoa hover:text-luar"
                    }`}
                  >
                    {p.rotulo}
                  </button>
                );
              })}
            </div>
            <ThemeToggle />
            <Link
              href={PLANOS_DO_SITE}
              prefetch={false}
              className="btn-primary !min-h-11 !gap-2 !px-4 !text-[13.5px] max-sm:!hidden pointer-fine:!min-h-10"
            >
              <IconeAneis tamanho={14} />
              Plano Luneta
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
