"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BOTAO_ROTULO, GRUPOS_DO_BOTAO, filtrosEfetivos, removerGrupos, resumoBotao, type BotaoRapido } from "@/lib/catalogo/filtros-rotulos";
import { numero } from "@/lib/catalogo/rotulos";
import { contarFiltros } from "@/lib/catalogo/url";
import { CHIP, CHIP_OFF, CHIP_ON, EYEBROW } from "../ui/estilos";
import { Girando, IconeAjustes, IconeSeta } from "../ui/icones";
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
  desagio: "Quanto o lance está abaixo da avaliação.",
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

/** Total de resultados: o número anima, o leitor de tela ouve o valor final (aria-live). */
export function TotalResultados({ total, carregando, className = "" }: { total: number; carregando: boolean; className?: string }) {
  const mostrado = useContagemAnimada(total);
  return (
    <p className={`flex items-center gap-1.5 text-sm whitespace-nowrap text-nevoa ${className}`}>
      <span aria-hidden="true" className={`font-display text-lg leading-none font-bold text-luar tabular-nums transition-opacity duration-150 ${carregando ? "opacity-55" : ""}`}>
        {numero(mostrado)}
      </span>
      <span aria-hidden="true">{total === 1 ? "imóvel" : "imóveis"}</span>
      {carregando && <Girando tamanho={13} className="text-nevoa" />}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {carregando ? "" : `${textoImoveis(total)} com os filtros atuais`}
      </span>
    </p>
  );
}

/**
 * Barra de filtros (embaixo do cabeçalho do app):
 * - computador: busca com sugestões, botões rápidos (Estado, Cidade, Tipo, Preço, Deságio, Quartos) que
 *   abrem um pop-up e aplicam na hora (faixas com espera de 300 ms), "Todos os filtros (N)" que abre o
 *   painel; abaixo, as pílulas dos filtros ativos e, à direita, o total e "Ordenar".
 * - celular: busca + "Filtros (N)" + total e ordenar; as pílulas rolam de lado; tudo o mais no painel.
 */
export function BarraFiltros(props: PropsFiltros & { className?: string }) {
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

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-2 md:flex-wrap">
        <BuscaLocal
          filtros={filtros}
          facetas={facetas}
          onChange={onChange}
          campoRef={busca}
          className="min-w-0 flex-1 md:basis-full xl:w-[340px] xl:flex-none xl:basis-auto"
        />

        {/* Linha estável: a busca (sozinha na linha até telas largas), os rápidos ocupando o meio e quebrando
            DENTRO do próprio grupo, e "Todos os filtros" sempre no fim da linha. Quando um rápido cresce
            ("Preço" vira "R$ 100 mil a 350 mil"), os outros não pulam de linha nem levam o pop-up aberto junto. */}
        <div role="group" aria-label="Filtros rápidos" className="hidden min-w-0 flex-1 flex-wrap items-center gap-2 md:flex">
          {RAPIDOS.map((b) => (
            <FiltroRapido
              key={b}
              botao={b}
              resumo={resumoBotao(filtros, b)}
              total={total}
              carregando={carregando}
              onFechou={descarregar}
              onLimpar={() => aplicar(`limpar-${b}`, (x) => removerGrupos(x, GRUPOS_DO_BOTAO[b]))}
              // o pop-up já devolveu o foco ao gatilho "Preço": ao fechar a folha, o foco volta para ele
              onMais={b === "preco" ? () => abrirPainel(document.activeElement instanceof HTMLButtonElement ? document.activeElement : botaoTodos.current, "valores") : undefined}
            >
              {b === "uf" && <ControleEstados {...controle} focarBusca alturaLista="max-h-[min(46vh,320px)]" />}
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

        <button
          ref={botaoTodos}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={painel.aberto}
          onClick={(e) => abrirPainel(e.currentTarget)}
          className={`${CHIP} ${ativos ? CHIP_ON : CHIP_OFF} shrink-0 gap-2 max-md:min-h-12 max-md:px-4`}
        >
          <IconeAjustes tamanho={17} />
          <span className="md:hidden">Filtros</span>
          <span className="max-md:hidden">Todos os filtros</span>{" "}
          {ativos > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-latao px-1.5 text-[11px] font-bold text-noite-fixa tabular-nums">
              {ativos}
              <span className="sr-only"> {ativos === 1 ? "ativo" : "ativos"}</span>
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PilulasFiltros
          filtros={valendo}
          facetas={facetas}
          onChange={onChange}
          rolavel
          aoEsvaziar={() => busca.current?.focus()}
          className="order-3 w-full md:order-1 md:w-auto md:min-w-0 md:flex-1"
        />
        <TotalResultados total={total} carregando={carregando} className="order-1 md:order-2 md:ml-auto" />
        <OrdenarPor
          ordem={ordem}
          onOrdem={onOrdem}
          plano={plano}
          selosDesligados={selosDesligados}
          onUpsell={onUpsell}
          className="order-2 ml-auto md:order-3 md:ml-0"
        />
      </div>

      <PainelFiltros
        {...props}
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
  children,
}: {
  botao: BotaoRapido;
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
    <Popover
      rotulo={nome}
      largura={LARGURA[botao]}
      focarAoAbrir={!focaBusca}
      onAbertoChange={(a) => {
        if (!a) onFechou();
      }}
      gatilho={{
        ariaLabel: ativo ? `${nome}: ${resumo}` : undefined,
        className: (a) => `${CHIP} ${ativo ? CHIP_ON : CHIP_OFF} gap-1.5 pr-3 pointer-fine:pr-2.5 ${a ? "shadow-[0_0_0_3px_rgba(201,162,77,.22)]" : ""}`,
        conteudo: (a) => (
          <>
            <span className="max-w-[190px] truncate tabular-nums">{resumo ?? nome}</span>
            <IconeSeta className={`transition-transform duration-150 motion-reduce:transition-none ${ativo ? "text-latao-texto" : "text-nevoa"} ${a ? "rotate-180" : ""}`} />
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
          <ControleCidades {...controle} focarBusca alturaLista="max-h-[min(42vh,300px)]" vazio={carregando ? "Buscando as cidades…" : undefined} />
        ) : (
          <ControleBairros
            {...controle}
            focarBusca
            alturaLista="max-h-[min(42vh,300px)]"
            // aqui a escolha já vale: sem bairro na lista, ou a busca ainda está vindo ou a fonte não informa
            semBairros={carregando ? "Buscando os bairros…" : "A fonte não informa o bairro dos imóveis destas cidades."}
          />
        )}
      </div>
    </div>
  );
}
