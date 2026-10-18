"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BOTAO_ROTULO, GRUPOS_DO_BOTAO, filtrosEfetivos, removerGrupos, resumoBotao, type BotaoRapido, type GrupoFiltro } from "@/lib/catalogo/filtros-rotulos";
import { numero } from "@/lib/catalogo/rotulos";
import type { Facetas, Filtros, Ordem } from "@/lib/catalogo/tipos";
import { contarFiltros } from "@/lib/catalogo/url";
import { CHIP, CHIP_OFF, CHIP_ON, EYEBROW } from "../ui/estilos";
import { Girando, IconeAjustes, IconeSeta, IconeX } from "../ui/icones";
import { Popover } from "../ui/Popover";
import { semMovimento } from "../ui/useAdiado";
import { BuscaLocal } from "./BuscaLocal";
import { Campo, ControleBairros, ControleCidades, ControleEstados, ControleFaixa, ControleMinimo, ControleTipo, textoImoveis, type PropsControle } from "./controles";
import { OrdenarPor } from "./OrdenarPor";
import { PainelFiltros } from "./PainelFiltros";
import { PilulasFiltros } from "./PilulasFiltros";
import type { PropsFiltros, SecaoFiltro } from "./tipos";
import { useAplicador } from "./useAplicador";

const RAPIDOS: readonly BotaoRapido[] = ["uf", "cidade", "tipo", "preco", "desagio", "quartos"];

const LARGURA: Record<BotaoRapido, number> = { uf: 360, cidade: 380, tipo: 400, preco: 440, desagio: 420, quartos: 360 };

const DICA: Record<BotaoRapido, string> = {
  uf: "Escolha um ou vários estados.",
  cidade: "Escolha uma ou várias cidades; depois, se quiser, os bairros.",
  tipo: "Escolha um ou vários tipos.",
  preco: "Lance mínimo pedido na praça atual.",
  desagio: "Desconto do lance sobre a avaliação. À esquerda da marca “avaliação”, o lance passa dela.",
  quartos: "Pelo menos. Anúncios que não informam ficam de fora.",
};

/** A contagem "corre" até o número novo em 300 ms (instantânea com "reduzir movimento"). */
function useContagemAnimada(valor: number, ms = 300) {
  const [mostrado, setMostrado] = useState(valor);
  const atual = useRef(valor);
  useEffect(() => {
    const de = atual.current;
    if (de === valor) return;
    const t0 = performance.now();
    const instantaneo = semMovimento();
    let raf = 0;
    const passo = (t: number) => {
      const p = instantaneo ? 1 : Math.min(1, (t - t0) / ms);
      const v = Math.round(de + (valor - de) * (1 - Math.pow(1 - p, 3)));
      atual.current = v;
      setMostrado(v);
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor, ms]);
  return mostrado;
}

/**
 * Total de resultados: o número anima, o leitor de tela ouve o valor final (aria-live). `anunciar={false}`
 * quando quem usa já tem o aviso ao vivo num lugar fixo (a barra troca o total de linha ao compactar, e uma
 * região ao vivo que remonta perde o anúncio).
 */
export function TotalResultados({ total, carregando, className = "", anunciar = true }: { total: number; carregando: boolean; className?: string; anunciar?: boolean }) {
  const mostrado = useContagemAnimada(total);
  return (
    <p className={`flex items-center gap-1.5 text-sm whitespace-nowrap text-nevoa ${className}`}>
      <span aria-hidden="true" className={`font-display text-lg leading-none font-bold text-luar tabular-nums transition-opacity duration-150 ${carregando ? "opacity-55" : ""}`}>
        {numero(mostrado)}
      </span>
      <span aria-hidden="true">{total === 1 ? "imóvel" : "imóveis"}</span>
      {carregando && <Girando tamanho={13} className="text-nevoa" />}
      {anunciar && <AnuncioTotal total={total} carregando={carregando} />}
    </p>
  );
}

function AnuncioTotal({ total, carregando }: { total: number; carregando: boolean }) {
  return (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {carregando ? "" : `${textoImoveis(total)} com os filtros atuais`}
    </span>
  );
}

/**
 * Ordens que não mudariam nada nesta busca (na prévia, todos os imóveis da Caixa foram coletados no mesmo dia
 * e só 5 de 21 mil informam a data da praça: "Mais recentes" e "Praça mais próxima" davam a lista de "Maior
 * deságio"). Elas aparecem desabilitadas, com o porquê.
 */
function ordensSemEfeito(facetas: Facetas, total: number): Partial<Record<Ordem, string>> {
  const saida: Partial<Record<Ordem, string>> = {};
  if (total < 2) return saida;
  if (facetas.coletaUnica) saida.recentes = "Todos os imóveis desta busca foram coletados no mesmo dia";
  const comData = facetas.comData;
  if (comData !== undefined && comData < Math.max(2, total * 0.05)) {
    saida.data = comData === 0 ? "Nenhum imóvel desta busca informa a data da praça" : `Só ${numero(comData)} ${comData === 1 ? "imóvel informa" : "imóveis informam"} a data da praça`;
  }
  return saida;
}

/** Botões rápidos que só cabem a partir de xl (1280 px): de 1024 a 1279 ficam em "Todos os filtros". */
const SO_NO_LARGO: ReadonlySet<BotaoRapido> = new Set(["desagio", "quartos"]);
/** Grupos que já têm botão rápido (no computador, a pílula deles repetiria o que o botão já diz). */
const GRUPOS_COM_BOTAO: ReadonlySet<GrupoFiltro> = new Set(RAPIDOS.filter((b) => !SO_NO_LARGO.has(b)).flatMap((b) => GRUPOS_DO_BOTAO[b]));
/** Grupos cujo botão rápido só aparece a partir de xl: a pílula some só lá. */
const GRUPOS_COM_BOTAO_LARGO: ReadonlySet<GrupoFiltro> = new Set(RAPIDOS.filter((b) => SO_NO_LARGO.has(b)).flatMap((b) => GRUPOS_DO_BOTAO[b]));

/**
 * Barra de filtros (embaixo do cabeçalho do app):
 * - computador (lg, 1024 px ou mais): busca, botões rápidos (Estado, Cidade, Tipo, Preço; Deságio e Quartos a
 *   partir de xl) que abrem um pop-up e aplicam na hora (faixas com espera de 300 ms) e mostram o filtro
 *   escolhido (com um × para limpar sem abrir), "Todos os filtros (N)" que abre o painel, tudo numa linha;
 *   abaixo, o total à esquerda, as pílulas só dos filtros que não têm botão (financiamento, modalidade,
 *   tags...) e, à direita, "Ordenar" e a vista.
 * - celular e tablet em pé: busca + "Filtros (N)" (+ a vista, no celular) numa linha; o total, "Ordenar" (e a
 *   vista, no tablet) na outra; as pílulas (todas) rolam de lado numa terceira, com o fim esmaecido.
 * - `compacta` (barra colada no topo de tablet ou de notebook baixo) e tela baixa (celular deitado, sempre):
 *   uma linha só, com a busca, o total, "Ordenar" e "Filtros (N)", para a lista ficar com a tela.
 */
export function BarraFiltros({
  acoes,
  acoesBusca,
  compacta = false,
  onAplicarPainel,
  ...props
}: PropsFiltros & {
  /** o painel "Todos os filtros" aplicado ("Mostrar N imóveis"); padrão: `onChange` */
  onAplicarPainel?: (f: Filtros) => void;
  className?: string;
  /** controles do app no fim da linha do total e de "Ordenar" (ex.: o seletor Lista | Cards | Mapa) */
  acoes?: ReactNode;
  /** uma linha só (barra colada em tela pequena) */
  compacta?: boolean;
  /** celular: controle no fim da linha da busca (o seletor de vista, que não cabia na linha do total em 360 px) */
  acoesBusca?: ReactNode;
}) {
  const { filtros, facetas, total, carregando, plano, selosDesligados, ordem, onOrdem, onChange, onUpsell, className = "" } = props;
  const { aplicar, descarregar } = useAplicador(filtros, onChange, 300);
  const [painel, setPainel] = useState<{ aberto: boolean; secao?: SecaoFiltro }>({ aberto: false });
  const botaoTodos = useRef<HTMLButtonElement>(null);
  const abridor = useRef<HTMLElement | null>(null);
  const busca = useRef<HTMLInputElement>(null);
  // pílulas e contagem só do que vale de fato neste plano (o servidor ignora o resto)
  const valendo = filtrosEfetivos(filtros, plano, selosDesligados);
  const ativos = contarFiltros(valendo);

  const abrirPainel = (opener: HTMLElement | null, secao?: SecaoFiltro) => {
    descarregar();
    abridor.current = opener;
    setPainel({ aberto: true, secao });
  };

  const controle: PropsControle = { f: filtros, facetas, aplicar };
  const indisponiveis = ordensSemEfeito(facetas, total);
  const ordenar = (classe: string) => (
    <OrdenarPor
      ordem={ordem}
      onOrdem={onOrdem}
      plano={plano}
      selosDesligados={selosDesligados}
      onUpsell={onUpsell}
      compacto={compacta}
      indisponiveis={indisponiveis}
      className={classe}
    />
  );

  return (
    <div className={`flex flex-col gap-2.5 sm:gap-3 ${className}`}>
      {/* o total ao vivo para leitores de tela fica sempre aqui (o visível muda de linha ao compactar) */}
      <AnuncioTotal total={total} carregando={carregando} />
      <div className={`flex items-center gap-2 ${compacta ? "" : "lg:flex-wrap"}`}>
        <BuscaLocal
          filtros={filtros}
          facetas={facetas}
          onChange={onChange}
          consultar={props.consultar}
          campoRef={busca}
          className={`min-w-0 flex-1 ${compacta ? "" : "lg:w-[280px] lg:flex-none xl:w-[340px]"}`}
        />

        {/* Linha estável: a busca, os rápidos ocupando o meio e quebrando DENTRO do próprio grupo, e "Todos os
            filtros" sempre no fim da linha. Quando um rápido cresce ("Preço" vira "R$ 100 mil a 350 mil"), os
            outros não pulam de linha nem levam o pop-up aberto junto. Abaixo de lg (tablet em pé) e em tela baixa
            não cabem: ficam em "Filtros", que abre o painel. */}
        <div role="group" aria-label="Filtros rápidos" className={compacta ? "hidden" : "hidden min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex baixa:hidden"}>
          {RAPIDOS.map((b) => (
            <FiltroRapido
              key={b}
              botao={b}
              className={SO_NO_LARGO.has(b) ? "max-xl:hidden" : ""}
              resumo={resumoBotao(filtros, b)}
              total={total}
              carregando={carregando}
              onFechou={descarregar}
              onLimpar={() => aplicar(`limpar-${b}`, (x) => removerGrupos(x, GRUPOS_DO_BOTAO[b]))}
              // o pop-up já devolveu o foco ao gatilho "Preço": ao fechar a folha, o foco volta para ele
              onMais={b === "preco" ? () => abrirPainel(document.activeElement instanceof HTMLButtonElement ? document.activeElement : botaoTodos.current, "valores") : undefined}
            >
              {b === "uf" && <ControleEstados {...controle} focarBusca alturaLista="max-h-[min(46vh,320px)] min-h-[120px]" />}
              {b === "cidade" && <AbasLocal controle={controle} carregando={carregando} />}
              {b === "tipo" && <ControleTipo {...controle} />}
              {b === "preco" && <ControleFaixa {...controle} grupo="lance" adiar rotuloVisivel={false} />}
              {b === "desagio" && <ControleFaixa {...controle} grupo="desagio" adiar rotuloVisivel={false} />}
              {b === "quartos" && (
                <div className="flex flex-col gap-5">
                  <Campo rotulo="Quartos">
                    <ControleMinimo {...controle} grupo="quartos" />
                  </Campo>
                  <Campo rotulo="Vagas de garagem">
                    <ControleMinimo {...controle} grupo="vagas" />
                  </Campo>
                </div>
              )}
            </FiltroRapido>
          ))}
        </div>

        {/* compacta (colada) ou tela baixa: o total e "Ordenar" sobem para esta linha (em tela baixa, o total só
            quando cabe: de 820 px de largura para cima) */}
        <div className={compacta ? "contents" : "hidden baixa:contents"}>
          <TotalResultados total={total} carregando={carregando} anunciar={false} className={compacta ? "max-lg:hidden" : "max-[819.98px]:hidden"} />
          {ordenar("shrink-0")}
        </div>

        <button
          ref={botaoTodos}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={painel.aberto}
          onClick={(e) => abrirPainel(e.currentTarget)}
          className={`${CHIP} ${ativos ? CHIP_ON : CHIP_OFF} shrink-0 gap-2 max-md:min-h-12 max-md:px-4`}
        >
          <IconeAjustes tamanho={17} />
          <span className={compacta ? "" : "lg:hidden baixa:inline"}>Filtros</span>
          <span className={compacta ? "hidden" : "max-lg:hidden baixa:hidden"}>Todos os filtros</span>{" "}
          {ativos > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-latao px-1.5 text-[11px] font-bold text-noite-fixa tabular-nums">
              {ativos}
              <span className="sr-only"> {ativos === 1 ? "ativo" : "ativos"}</span>
            </span>
          )}
        </button>
        {acoesBusca && !compacta && <div className="flex shrink-0 sm:hidden baixa:hidden">{acoesBusca}</div>}
        {/* tela baixa (celular deitado, janela baixa ou com zoom): a linha de baixo some, então a vista e o mapa
            vêm para cá (sem eles, não havia como trocar de vista nem abrir o mapa de 640 px de largura para cima) */}
        {acoes && !compacta && <div className="hidden shrink-0 baixa:flex">{acoes}</div>}
      </div>

      {!compacta && (
        // celular e tablet: total, "Ordenar" (e a vista) em cima, as pílulas rolando de lado embaixo; computador:
        // o total à esquerda (a âncora da busca), as pílulas logo depois e "Ordenar" + vista à direita. Tela baixa:
        // o total, "Ordenar" e a vista já estão na linha de cima; aqui ficam só as pílulas, e só com filtro ativo
        // (sem elas, a pessoa não via quais filtros valiam nem tirava um com um toque)
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4 ${ativos > 0 ? "" : "baixa:hidden"}`}>
          <TotalResultados total={total} carregando={carregando} anunciar={false} className="order-1 baixa:hidden" />
          <PilulasFiltros
            filtros={valendo}
            facetas={facetas}
            onChange={onChange}
            rolavel
            ocultarNoComputador={GRUPOS_COM_BOTAO}
            ocultarNoLargo={GRUPOS_COM_BOTAO_LARGO}
            aoEsvaziar={() => busca.current?.focus()}
            className="order-4 w-full lg:order-2 lg:w-auto lg:min-w-0 lg:flex-1"
          />
          {ordenar("order-2 ml-auto lg:order-3 baixa:hidden")}
          {acoes && <div className={`order-3 flex shrink-0 empty:hidden lg:order-4 baixa:hidden ${acoesBusca ? "max-sm:hidden" : ""}`}>{acoes}</div>}
        </div>
      )}

      <PainelFiltros
        {...props}
        // "Mostrar N imóveis" pode ter tratamento próprio (o app cria uma entrada no histórico)
        onChange={onAplicarPainel ?? onChange}
        aberto={painel.aberto}
        secaoInicial={painel.secao}
        onFechar={() => setPainel({ aberto: false })}
        openerRef={abridor}
      />
    </div>
  );
}

/** Botão rápido + pop-up com o controle, "Limpar", a contagem e "Pronto". */
function FiltroRapido({
  botao,
  resumo,
  total,
  carregando,
  onFechou,
  onLimpar,
  onMais,
  className = "",
  children,
}: {
  botao: BotaoRapido;
  className?: string;
  resumo: string | null;
  total: number;
  carregando: boolean;
  onFechou: () => void;
  onLimpar: () => void;
  onMais?: () => void;
  children: ReactNode;
}) {
  const ativo = resumo !== null;
  const nome = BOTAO_ROTULO[botao];
  // listas com busca focam o campo; os demais, o painel
  const focaBusca = botao === "uf" || botao === "cidade";
  return (
    <span className={`relative inline-flex ${className}`}>
    <Popover
      rotulo={nome}
      largura={LARGURA[botao]}
      focarAoAbrir={!focaBusca}
      onAbertoChange={(a) => {
        if (!a) onFechou();
      }}
      gatilho={{
        ariaLabel: ativo ? `${nome}: ${resumo}` : undefined,
        // ativo: o × (botão ao lado, por cima do fim do chip) limpa sem abrir o pop-up
        className: (a) => `${CHIP} ${ativo ? CHIP_ON : CHIP_OFF} gap-1.5 ${ativo ? "pr-12 pointer-fine:pr-9" : "pr-3 pointer-fine:pr-2.5"} ${a ? "shadow-[0_0_0_3px_rgba(201,162,77,.22)]" : ""}`,
        conteudo: (a) => (
          <>
            <span className="max-w-[190px] truncate tabular-nums">{resumo ?? nome}</span>
            {!ativo && <IconeSeta className={`text-nevoa transition-transform duration-150 motion-reduce:transition-none ${a ? "rotate-180" : ""}`} />}
          </>
        ),
      }}
    >
      {({ fechar }) => (
        <div className="flex flex-col">
          <div className="flex flex-col gap-4 p-4 pb-5">
            <div className="flex flex-col gap-1">
              <p className={EYEBROW}>{nome}</p>
              <p className="text-[13px] leading-snug text-nevoa">{DICA[botao]}</p>
            </div>
            {children}
            {onMais && (
              <button
                type="button"
                onClick={() => {
                  fechar();
                  onMais();
                }}
                className="-mb-1 inline-flex min-h-11 cursor-pointer items-center self-start rounded-lg text-[13px] font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
              >
                Avaliação, deságio e R$/m² em Todos os filtros →
              </button>
            )}
          </div>
          <div className="sticky bottom-0 flex items-center gap-3 border-t border-nevoa/15 bg-tinta px-4 py-3">
            <button
              type="button"
              disabled={!ativo}
              onClick={onLimpar}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-1 text-[13px] font-semibold text-luar underline-offset-4 hover:underline disabled:cursor-default disabled:text-nevoa/55 disabled:no-underline pointer-fine:min-h-9"
            >
              Limpar
            </button>
            <span className="ml-auto flex items-center gap-1.5 text-[13px] text-nevoa tabular-nums">
              {carregando && <Girando tamanho={12} />}
              <span className={carregando ? "opacity-60" : ""}>{textoImoveis(total)}</span>
            </span>
            <button type="button" onClick={fechar} className="btn-primary min-h-11 px-5 text-sm pointer-fine:min-h-9">
              Pronto
            </button>
          </div>
        </div>
      )}
    </Popover>
      {ativo && (
        <button
          type="button"
          aria-label={`Limpar ${nome.toLowerCase()}: ${resumo}`}
          title={`Limpar ${nome.toLowerCase()}`}
          onClick={onLimpar}
          className="absolute top-1/2 right-0.5 inline-flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-latao-texto transition-colors duration-150 hover:bg-latao hover:text-noite-fixa pointer-fine:right-1 pointer-fine:size-7"
        >
          <IconeX tamanho={12} />
        </button>
      )}
    </span>
  );
}

/** Pop-up "Cidade": cidades e, depois de escolher alguma, os bairros (abas: setas trocam, como no sistema). */
function AbasLocal({ controle, carregando }: { controle: PropsControle; carregando: boolean }) {
  const uid = useId();
  const [aba, setAba] = useState<"cidade" | "bairro">("cidade");
  const nCidades = controle.f.cidade?.length ?? 0;
  const nBairros = controle.f.bairro?.length ?? 0;
  const ABAS = ["cidade", "bairro"] as const;
  const trocar = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const nova = e.key === "Home" ? "cidade" : e.key === "End" ? "bairro" : aba === "cidade" ? "bairro" : "cidade";
    setAba(nova);
    document.getElementById(`${uid}-aba-${nova}`)?.focus();
  };
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Cidades ou bairros" className="grid grid-cols-2 rounded-full border border-nevoa/25 bg-noite/40 p-1">
        {ABAS.map((a) => {
          const on = aba === a;
          const n = a === "cidade" ? nCidades : nBairros;
          return (
            <button
              key={a}
              id={`${uid}-aba-${a}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${uid}-painel`}
              tabIndex={on ? 0 : -1}
              onClick={() => setAba(a)}
              onKeyDown={trocar}
              className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-[background-color,color] duration-150 pointer-fine:min-h-8 ${
                on ? "bg-luar text-noite" : "text-nevoa hover:text-luar"
              }`}
            >
              {a === "cidade" ? "Cidades" : "Bairros"}
              {n > 0 && (
                <span className={`text-[11px] font-semibold tabular-nums ${on ? "text-noite/70" : "text-latao-texto"}`}>
                  {n}
                  <span className="sr-only"> {a === "cidade" ? (n === 1 ? "escolhida" : "escolhidas") : n === 1 ? "escolhido" : "escolhidos"}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div id={`${uid}-painel`} role="tabpanel" aria-labelledby={`${uid}-aba-${aba}`}>
        {aba === "cidade" ? (
          <ControleCidades {...controle} focarBusca alturaLista="max-h-[min(42vh,300px)] min-h-[120px]" vazio={carregando ? "Buscando as cidades…" : undefined} />
        ) : (
          <ControleBairros
            {...controle}
            focarBusca
            alturaLista="max-h-[min(42vh,300px)] min-h-[120px]"
            // aqui a escolha já vale: sem bairro na lista, ou a busca ainda está vindo ou a fonte não informa
            semBairros={carregando ? "Buscando os bairros…" : "A fonte não informa o bairro dos imóveis destas cidades."}
          />
        )}
      </div>
    </div>
  );
}
