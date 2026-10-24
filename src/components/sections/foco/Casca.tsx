/**
 * A casca da demonstração "Ajuste o foco": o quadro, o cabeçalho (selo, busca, botões rápidos), a linha do total e a
 * área da lista e do mapa. É a MESMA para a moldura (o que aparece antes de o código da demonstração chegar, no
 * pacote inicial da landing) e para a demonstração pronta: as duas têm exatamente a mesma altura na primeira pintura,
 * e a troca não empurra a página (a volta da demonstração para a apresentação, "Voltar à apresentação", e os links
 * internos #planos dependem disso). Leve: sem dados nem lógica de filtro (estes vêm sob demanda).
 */
import type { ReactNode } from "react";
import { CHIP, CHIP_OFF } from "@/components/catalogo/ui/estilos";
export { TOTAL_FICTICIOS } from "@/lib/demo-foco/total";

/** Linha de um imóvel (lista e moldura). */
export const LINHA_IMOVEL = "relative flex items-start gap-3 border-b border-nevoa/12 px-4 py-3.5 sm:px-5";
/**
 * Os selos de um imóvel. Abaixo de md (a lista cresce com a página), sempre a altura de duas linhas de selos (2 × 19 px
 * + 6 px): todas as linhas têm a mesma altura e a moldura acerta a da lista pronta.
 */
export const SELOS_IMOVEL = "mt-2 flex min-h-[44px] flex-wrap content-start gap-1.5 md:min-h-0";
/** O rodapé da lista ("Mostrar mais") e o botão dele. */
export const RODAPE_LISTA = "px-4 py-4 sm:px-5";
export const BOTAO_MAIS = "btn-ghost w-full !min-h-11 text-sm";
/** O mapinha: em cima da lista, com altura fixa, até 1024 px; dali para cima, à direita, com a altura da área. */
export const MAPA = "h-[280px] border-b border-nevoa/15 sm:h-[340px] lg:order-2 lg:h-full lg:border-b-0 lg:border-l";
/** A lista: cresce com a página no celular; do tablet para cima, rola dentro do quadro. */
export const LISTA = "relative min-h-0 overflow-x-hidden md:h-[480px] md:overflow-y-auto lg:h-full";
/** Quantas linhas a lista mostra de cara no celular (o resto, com "Mostrar mais"). */
export const LOTE_CELULAR = 6;
/**
 * O seletor de ordem (o da demonstração e a imitação da moldura). Largura fixa: a de um <select> é a da opção mais
 * longa, e a moldura não tem as opções; com a mesma largura, a linha do total quebra igual nas duas.
 */
export const ORDENAR =
  "h-11 w-[244px] max-w-full cursor-pointer appearance-none truncate rounded-full border border-nevoa/30 bg-noite/40 pr-9 pl-3.5 text-[13.5px] font-medium text-luar transition-colors outline-none hover:border-nevoa/60 focus-visible:border-latao-texto focus-visible:ring-2 focus-visible:ring-latao-texto/60 pointer-fine:h-9";
/** O texto de exemplo da busca: curto no celular, com exemplo do 768 px para cima. */
export const PLACEHOLDER_BUSCA = ["Cidade ou bairro", "Cidade, bairro ou tipo: “Tatuapé 2 quartos”"] as const;
/** O botão "Filtros" / "Todos os filtros". */
export const BOTAO_FILTROS = `${CHIP} shrink-0 gap-2 lg:ml-auto`;
/** Botão rápido sem filtro (a moldura usa este; a demonstração troca pelo estado). */
export const BOTAO_RAPIDO = `${CHIP} ${CHIP_OFF} shrink-0 gap-1.5 pr-3 pointer-fine:pr-2.5`;

export interface TextosCasca {
  selo: string;
  subtitulo: string;
  luneta: string;
  lunetaAjuda: string;
}

export function CascaFoco({
  textos,
  total,
  busca,
  botaoFiltros,
  rapidosLente,
  rapidosLuneta,
  contagem,
  limpar,
  ordenar,
  mapa,
  lista,
  rodape,
  inerte = false,
}: {
  textos: TextosCasca;
  /** quantos imóveis fictícios há (o selo) */
  total: number;
  busca: ReactNode;
  botaoFiltros: ReactNode;
  rapidosLente: ReactNode;
  rapidosLuneta: ReactNode;
  contagem: ReactNode;
  limpar?: ReactNode;
  ordenar: ReactNode;
  mapa: ReactNode;
  lista: ReactNode;
  /** depois do quadro (a folha de filtros, avisos para leitores de tela) */
  rodape?: ReactNode;
  /** moldura: sem foco nem leitor de tela (quem lê ouve o aviso de carregamento) */
  inerte?: boolean;
}) {
  return (
    <div
      aria-hidden={inerte || undefined}
      inert={inerte}
      className="mt-10 rounded-3xl border border-nevoa/15 bg-tinta shadow-[0_24px_70px_rgba(7,11,22,.12)] sm:mt-16"
    >
      {/* ---- cabeçalho: selo de demonstração, busca, filtros ---- */}
      <div className="flex flex-col gap-3 border-b border-nevoa/15 p-4 sm:gap-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="inline-flex items-center gap-2 rounded-full border border-latao/40 bg-latao/10 px-3 py-1.5 text-xs leading-none font-semibold text-latao-texto">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-latao motion-safe:animate-pulse" />
            {textos.selo} · {total} imóveis fictícios
          </p>
          <p className="text-[13px] leading-snug text-nevoa">{textos.subtitulo}</p>
        </div>

        <div className="flex items-center gap-2">
          {busca}
          {botaoFiltros}
        </div>

        {/* celular: uma linha que rola de lado (o fim esmaece); computador: quebra em duas, Lente e Luneta */}
        <div
          role="group"
          aria-label="Filtros rápidos"
          className="-mx-4 flex snap-x scroll-px-4 items-center gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)] [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden"
        >
          {rapidosLente}
          <div
            role="group"
            aria-label={`Filtros do plano ${textos.luneta} (funcionam nesta demonstração)`}
            className="flex shrink-0 snap-start items-center gap-2 rounded-[26px] border border-dashed border-latao/45 bg-latao/[0.04] p-1 pl-3"
          >
            <span aria-hidden="true" title={textos.lunetaAjuda} className="text-[10px] leading-none font-semibold tracking-[0.14em] text-latao-texto uppercase">
              {textos.luneta}
            </span>
            {rapidosLuneta}
          </div>
        </div>
      </div>

      {/* ---- total, limpar, ordem ---- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-nevoa/15 px-4 py-3 sm:px-6">
        <p className="flex items-baseline gap-2">{contagem}</p>
        {limpar}
        <label className="ml-auto flex items-center gap-2 text-[13px] text-nevoa">
          <span className="max-sm:sr-only">Ordenar</span>
          <span className="relative">{ordenar}</span>
        </label>
      </div>

      {/* ---- resultado: mapinha (em cima no celular e no tablet, à direita no computador) e lista ---- */}
      <div className="grid overflow-hidden rounded-b-3xl lg:h-[600px] lg:grid-cols-[minmax(0,1fr)_minmax(300px,40%)]">
        {mapa}
        {lista}
      </div>
      {rodape}
    </div>
  );
}

/** O número grande do total e o "de 150 imóveis fictícios". */
export function Contagem({ mostrado, total }: { mostrado: string; total: number }) {
  return (
    <>
      <span aria-hidden="true" className="font-display text-[28px] leading-none font-bold tracking-[-0.03em] text-luar tabular-nums">
        {mostrado}
      </span>
      <span aria-hidden="true" className="text-[13px] text-nevoa">
        de {total}
        <span className="max-sm:hidden"> imóveis fictícios</span>
      </span>
    </>
  );
}
