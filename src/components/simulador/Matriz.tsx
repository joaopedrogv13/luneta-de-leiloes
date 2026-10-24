"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Popover } from "@/components/catalogo/ui/Popover";
import { atingeMeta, type CelulaMatriz } from "@/lib/simulador/calculo";
import type { ResultadoCompleto } from "@/lib/simulador/completa";
import { curto, meses, moeda, moedaCurta, moedaSinal, pct, porArea } from "@/lib/simulador/formato";
import { LIMITES, multiplicador, PADRAO } from "@/lib/simulador/premissas";
import { CENARIO_ROTULO, metaPorExtenso, palavrasPreco } from "@/lib/simulador/textos";
import type { Ajustes, Celula, Cenario, CenarioFixo, VendaPersonalizada } from "@/lib/simulador/tipos";
import { EditorPersonalizado } from "./CartaoResposta";
import { Aviso, CampoNumero, Chip, Deslizante, IconeAjuda, IconeLapis, IconeNao, IconeOk, IconeVoltar, Segmentado } from "./controles";
import type { Visao } from "./estado";

const CHAVE_CENARIO: Record<CenarioFixo, "cenarioConservador" | "cenarioBase" | "cenarioOtimista"> = {
  conservador: "cenarioConservador",
  base: "cenarioBase",
  otimista: "cenarioOtimista",
};

/**
 * O que uma célula quer dizer, em frase de leigo (a leitura embaixo da tabela e a dica no hover), e a versão curta
 * (só os números), usada quando a célula é a escolhida: o cartão de cima já disse a frase inteira.
 */
export function leituraCelula(r: ResultadoCompleto, cel: CelulaMatriz, visao: Visao): { titulo: string; texto: string; curta: string; tom: "ok" | "nao" | "neutro" } {
  const p = r.modelo.premissas;
  const lance = r.modelo.entrada.lance;
  const venda = (p.valorVenda ?? 0) * multiplicador(p, cel.cenario);
  const titulo = `${CENARIO_ROTULO[cel.cenario]} · ${meses(cel.meses)}`;
  const quando = `vendendo por ${moedaCurta(venda)} daqui a ${meses(cel.meses)}`;
  const objetivo = r.meta.tipo === "lucro" ? `ganhar ${moeda(r.meta.valor)}` : `render ${metaPorExtenso(r.meta)}`;
  if (visao === "teto" && r.semDisputa) {
    // venda direta: o preço não sobe; o que interessa é quanto de imprevisto cabe mantendo a meta
    const m = cel.margem ?? null;
    if (m === null) {
      return {
        titulo,
        texto: `Comprando por ${moeda(lance)} e ${quando}, nem sem imprevistos você consegue ${objetivo}.`,
        curta: "não atinge a meta, nem sem imprevistos",
        tom: "nao",
      };
    }
    return {
      titulo,
      texto: `Comprando por ${moeda(lance)} e ${quando}, você ainda consegue ${objetivo} mesmo com até ${moeda(m)} de custos imprevistos.`,
      curta: `margem de ${moeda(m)} para imprevistos`,
      tom: "ok",
    };
  }
  if (visao === "teto") {
    if (cel.teto === null) {
      return {
        titulo,
        texto: `Nenhum lance atinge ${metaPorExtenso(r.meta)} ${quando}: a venda não cobre os custos com esse retorno.`,
        curta: "nenhum lance atinge a meta",
        tom: "neutro",
      };
    }
    const folga = cel.teto - lance;
    return {
      titulo,
      texto:
        `${quando}, você pode dar até ${moeda(cel.teto)} de lance e ainda ${objetivo}. ` +
        (folga >= 0
          ? `Sobra ${moeda(folga)} acima do lance mínimo (${moeda(lance)}).`
          : `É menos que o lance mínimo (${moeda(lance)}): aqui, a meta não é atingida.`),
      curta: `lance máximo ${moeda(cel.teto)} · ${folga >= 0 ? `sobra ${moeda(folga)}` : `${moeda(-folga)} abaixo do lance mínimo`}`,
      tom: folga >= 0 ? "ok" : "nao",
    };
  }
  const s = cel.comMeuLance;
  const ok = atingeMeta(s, r.meta);
  const comQue = r.semDisputa ? `Comprando por ${moeda(s.lance)}` : `Com ${moeda(s.lance)} de lance`;
  return {
    titulo,
    texto: `${comQue}, ${quando}, você ${s.lucro >= 0 ? "lucra" : "perde"} ${moeda(Math.abs(Math.round(s.lucro)))} (${pct(s.roiAA)} ao ano). ${
      ok ? "Atinge" : "Não atinge"
    } a sua meta (${metaPorExtenso(r.meta)}).`,
    curta: `${s.lucro >= 0 ? "lucro" : "prejuízo"} de ${moeda(Math.abs(Math.round(s.lucro)))} · ${pct(s.roiAA)} ao ano · ${ok ? "atinge" : "não atinge"} a meta`,
    tom: ok ? "ok" : "nao",
  };
}

/**
 * Matriz cenários × prazos. Duas visões: o lucro e o retorno ao ano com o lance da pessoa (a principal, que abre
 * para quem nunca escolheu: VISAO_PADRAO em completa.ts) ou o lance máximo que atinge a meta em cada célula. A célula escolhida (botão com aria-pressed; setas movem a escolha) é a
 * mesma do cartão e do Detalhe. Embaixo, a leitura da célula (o que ela quer dizer, em frase), a legenda das
 * cores, a base dos % de venda e os prazos das colunas. O % de cada cenário se edita no próprio cabeçalho da
 * linha. "Como usar" abre a explicação completa.
 */
export function Matriz({
  r,
  visao,
  aoSelecionar,
  aoMudarVisao,
  aoMudarMeuLance,
  aoAjustar,
  aoComoUsar,
  aoEditarVenda,
}: {
  r: ResultadoCompleto;
  visao: Visao;
  aoSelecionar: (c: Celula) => void;
  aoMudarVisao: (v: Visao) => void;
  aoMudarMeuLance: (n: number | null) => void;
  aoAjustar: (mudar: (a: Ajustes) => Ajustes) => void;
  aoComoUsar: () => void;
  /** abre o pop-up da venda (valor informado, área) */
  aoEditarVenda: () => void;
}) {
  const { modelo, tabela, colunas, linhas, celula, meuLance } = r;
  const celulas = tabela!;
  const p = modelo.premissas;
  const lance = modelo.entrada.lance;
  const meuLanceAjustado = r.estado.meuLance !== null;
  // venda direta: preço fixo; a tabela abre no lucro pelo preço e a outra visão é a margem para imprevistos
  const fixo = r.semDisputa;
  const pal = palavrasPreco(modelo.entrada);
  const ref = useRef<HTMLTableElement>(null);
  const [sobre, setSobre] = useState<{ r: number; c: number } | null>(null);
  const vendaMax = (p.valorVenda ?? lance) * Math.max(p.cenarioOtimista, 1);
  const lanceSliderMax = Math.max(Math.round((lance * 1.6) / 1000) * 1000, Math.round(vendaMax / 1000) * 1000, 10_000);
  const muitas = colunas.length > 4;

  const ri = linhas.indexOf(celula.cenario);
  const ci = colunas.indexOf(celula.meses);
  const lida = sobre ?? { r: ri, c: ci };
  const leitura = celulas[lida.r]?.[lida.c] ? leituraCelula(r, celulas[lida.r][lida.c], visao) : null;

  const mover = (e: KeyboardEvent<HTMLButtonElement>, rr: number, c: number) => {
    let nr = rr;
    let nc = c;
    if (e.key === "ArrowRight") nc = Math.min(colunas.length - 1, c + 1);
    else if (e.key === "ArrowLeft") nc = Math.max(0, c - 1);
    else if (e.key === "ArrowDown") nr = Math.min(linhas.length - 1, rr + 1);
    else if (e.key === "ArrowUp") nr = Math.max(0, rr - 1);
    else if (e.key === "Home") nc = 0;
    else if (e.key === "End") nc = colunas.length - 1;
    else return;
    e.preventDefault();
    aoSelecionar({ cenario: linhas[nr], meses: colunas[nc] });
    setSobre(null);
    ref.current?.querySelector<HTMLButtonElement>(`[data-celula="${nr}-${nc}"]`)?.focus();
  };

  const definirPct = (c: CenarioFixo, fracao: number) => {
    const k = CHAVE_CENARIO[c];
    aoAjustar((a) => {
      const novo = { ...a };
      if (Math.abs(fracao - PADRAO[k]) < 1e-9) delete novo[k];
      else novo[k] = fracao;
      return novo;
    });
  };

  return (
    <section
      aria-labelledby="sim-matriz-titulo"
      className="rounded-3xl border border-nevoa/20 bg-tinta p-3 sm:p-6 in-data-[theme=light]:shadow-[0_1px_2px_rgba(15,24,48,.05)]"
    >
      <div className="flex items-start justify-between gap-3 px-1 pt-1 sm:px-0 sm:pt-0">
        <div className="min-w-0 pt-1.5">
          <h3 id="sim-matriz-titulo" className="font-display text-[19px] leading-tight font-bold tracking-[-0.01em] sm:text-[21px]">
            Cenários e prazos
          </h3>
        </div>
        <button
          type="button"
          onClick={aoComoUsar}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-nevoa/30 px-3.5 text-[13px] font-semibold transition-colors hover:border-latao hover:bg-latao/10 pointer-fine:min-h-9"
        >
          <IconeAjuda className="text-latao-texto" />
          Como usar
        </button>
      </div>

      <p className="mt-1 px-1 text-sm leading-relaxed text-nevoa sm:px-0 sm:text-[13.5px]">
        {visao === "teto" && fixo ? (
          <>
            Quanto de custo imprevisto ainda cabe, comprando por <strong className="font-semibold text-luar">{moeda(lance)}</strong>, para{" "}
            {r.meta.tipo === "lucro" ? "ganhar" : "render"} <strong className="font-semibold text-luar">{metaPorExtenso(r.meta)}</strong> em cada
            combinação: <span className="whitespace-nowrap">linhas = por quanto você vende,</span> colunas = em quantos meses.
          </>
        ) : visao === "teto" ? (
          <>
            O lance máximo para {r.meta.tipo === "lucro" ? "ganhar" : "render"} <strong className="font-semibold text-luar">{metaPorExtenso(r.meta)}</strong> em
            cada combinação: <span className="whitespace-nowrap">linhas = por quanto você vende,</span> colunas = em quantos meses.
          </>
        ) : (
          <>
            Quanto você ganha {fixo ? "comprando por" : "com o lance de"} <strong className="font-semibold text-luar">{moeda(meuLance)}</strong> em cada
            combinação:{" "}
            <span className="whitespace-nowrap">linhas = por quanto você vende,</span> colunas = em quantos meses.
          </>
        )}
      </p>
      <Segmentado
        className="mt-4 max-w-[560px]"
        nome="sim-visao"
        legenda="O que mostrar na tabela"
        valor={visao}
        aoMudar={aoMudarVisao}
        tamanho="sm"
        opcoes={
          fixo
            ? [
                { valor: "lucro", rotulo: "Lucro pelo preço" },
                {
                  valor: "teto",
                  rotulo: (
                    <>
                      Margem<span className="hidden sm:inline"> para imprevistos</span>
                    </>
                  ),
                },
              ]
            : [
                // rodada 5 (decisão 6): o lucro com o lance da pessoa é a visão principal (vem primeiro e abre por
                // padrão); o lance máximo para a meta fica a um toque
                {
                  valor: "lucro",
                  rotulo: (
                    <>
                      Lucro com <span className="hidden sm:inline">o </span>meu lance
                    </>
                  ),
                },
                {
                  valor: "teto",
                  rotulo: (
                    <>
                      Lance máximo<span className="hidden sm:inline"> para a meta</span>
                    </>
                  ),
                },
              ]
        }
      />

      {visao === "lucro" && (
        <div className="mt-3 rounded-2xl border border-nevoa/15 bg-noite/60 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <label htmlFor="sim-meu-lance" className="text-[14px] font-semibold">
              {fixo ? "Preço que você paga" : "Meu lance"}
            </label>
            {meuLanceAjustado && (
              <button
                type="button"
                onClick={() => aoMudarMeuLance(null)}
                className="-my-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-[12.5px] font-medium text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
              >
                <IconeVoltar />
                usar o {pal.minimo} ({moeda(lance)})
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <CampoNumero
              id="sim-meu-lance"
              valor={meuLance}
              prefixo="R$"
              passo={1000}
              min={0}
              max={1e10}
              aoMudar={(n) => aoMudarMeuLance(n === lance ? null : n)}
              aoEsvaziar={() => aoMudarMeuLance(null)}
              descritoPor="sim-meu-lance-ajuda"
              className="w-full sm:w-48 sm:shrink-0"
            />
            <Deslizante
              valor={meuLance}
              min={0}
              max={lanceSliderMax}
              passo={1000}
              ariaLabel={fixo ? "Preço que você paga" : "Meu lance"}
              textoValor={moeda(meuLance)}
              aoMudar={(n) => aoMudarMeuLance(n === lance ? null : n)}
            />
          </div>
          <p id="sim-meu-lance-ajuda" className="mt-1 text-sm leading-relaxed text-nevoa sm:text-[12.5px]">
            {fixo
              ? `Na venda direta o preço é fixo (${moeda(lance)}): mude só para comparar. O valor vale para toda a tabela e para o Detalhe.`
              : `Lance mínimo atual: ${moeda(lance)}. O lance que você digitar vale para toda a tabela e para o Detalhe.`}
          </p>
          {meuLance < lance && (
            <Aviso className="mt-2">
              {fixo
                ? `Abaixo do preço pedido (${moeda(lance)}): na venda direta, a fonte não aceita proposta menor. Serve só para comparar.`
                : `Abaixo do lance mínimo atual (${moeda(lance)}): a fonte não aceita este lance. Serve só para comparar (numa praça seguinte, o mínimo pode cair).`}
            </Aviso>
          )}
        </div>
      )}

      {/* celular: um prazo por vez, com linhas largas (4 colunas de ~58 px deixavam o % em 10,5 px) */}
      <MatrizCelular r={r} visao={visao} linhas={linhas} colunas={colunas} ri={ri} ci={ci} aoSelecionar={aoSelecionar} definirPct={definirPct} aoAjustar={aoAjustar} />

      <div className="mt-4 -mx-1 max-sm:hidden sm:mx-0" onMouseLeave={() => setSobre(null)}>
        <table ref={ref} className="w-full table-fixed border-separate border-spacing-1">
          <caption className="sr-only">
            {visao === "teto"
              ? fixo
                ? `Margem para custos imprevistos mantendo ${metaPorExtenso(r.meta)}, comprando por ${moeda(lance)}, por cenário de venda (linhas) e prazo de venda (colunas).`
                : `Lance máximo para ${metaPorExtenso(r.meta)}, por cenário de venda (linhas) e prazo de venda (colunas).`
              : `Lucro e retorno ao ano ${fixo ? "comprando por" : "com um lance de"} ${moeda(meuLance)}, por cenário de venda (linhas) e prazo de venda (colunas).`}{" "}
            Use as setas para trocar de célula.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="w-[5.6rem] px-1 pb-1 text-left align-bottom text-[11px] leading-tight font-medium text-nevoa max-[359px]:w-[4.6rem] sm:w-44 sm:text-[12px]"
              >
                <span className="sm:hidden">{visao === "teto" ? (fixo ? "margem em R$" : "lance máx. em R$") : "lucro em R$ e % ao ano"}</span>
                <span className="hidden sm:inline">Venda ↓ · em quantos meses →</span>
              </th>
              {colunas.map((m, i) => {
                const extra = r.colunaExtra === m;
                const escolhida = i === ci;
                return (
                  // no celular, número e "meses" em duas linhas em todas as colunas (o cabeçalho fica alinhado)
                  <th
                    key={m}
                    scope="col"
                    className={`pb-1 text-center align-bottom text-[12px] leading-tight font-semibold whitespace-nowrap sm:text-[13px] ${escolhida ? "text-latao-texto" : ""}`}
                  >
                    <span className="block sm:inline">{m}</span>
                    <span className={`block text-[11px] font-normal sm:inline sm:text-[13px] ${escolhida ? "" : "text-nevoa"}`}>
                      <span className="hidden sm:inline"> </span>
                      {m === 1 ? "mês" : "meses"}
                    </span>
                    {extra && <span className="mt-0.5 block text-[10px] font-semibold tracking-wide text-latao-texto uppercase sm:text-[10.5px]">seu prazo</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {celulas.map((linha, rr) => {
              const cenario = linhas[rr];
              const mult = multiplicador(p, cenario);
              return (
                <tr key={cenario}>
                  <th scope="row" className="px-1 text-left align-middle">
                    <span className={`block text-[12px] leading-tight font-semibold sm:text-[14px] ${rr === ri ? "text-latao-texto" : ""}`}>
                      {cenario === "conservador" ? (
                        <>
                          {/* abaixo de 360 px, "Conservador" não cabe na coluna: "Conserv." à vista, o nome inteiro para o leitor de tela */}
                          <span className="max-[359px]:sr-only">Conservador</span>
                          <span aria-hidden="true" className="hidden max-[359px]:inline">
                            Conserv.
                          </span>
                        </>
                      ) : cenario === "personalizado" ? (
                        "Persona­lizado"
                      ) : (
                        CENARIO_ROTULO[cenario]
                      )}
                    </span>
                    <EditarPctCenario r={r} cenario={cenario} aoDefinirPct={definirPct} aoAjustar={aoAjustar} />
                    <span className="mt-0.5 hidden text-[12px] leading-tight text-nevoa tabular-nums sm:block">{moedaCurta((p.valorVenda ?? 0) * mult)}</span>
                  </th>
                  {linha.map((cel, c) => (
                    <td key={c} className="relative p-0">
                      <BotaoCelula
                        r={r}
                        cel={cel}
                        rr={rr}
                        c={c}
                        visao={visao}
                        muitas={muitas}
                        selecionada={rr === ri && c === ci}
                        aoSelecionar={() => aoSelecionar({ cenario, meses: colunas[c] })}
                        aoTeclar={(e) => mover(e, rr, c)}
                        aoSobre={(v) => setSobre(v ? { r: rr, c } : null)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* o leitor de tela ouve a leitura da célula escolhida quando ela muda (passar o mouse não fala) */}
      {celulas[ri]?.[ci] && (
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {(() => {
            const l = leituraCelula(r, celulas[ri][ci], visao);
            return `${l.titulo}: ${l.texto}`;
          })()}
        </p>
      )}
      {/* a leitura da célula: o que ela quer dizer (a escolhida, ou a que está sob o mouse ou o foco) */}
      {leitura && (
        <div
          className={`mt-3 flex gap-2.5 rounded-2xl border px-3.5 py-3 text-sm leading-relaxed sm:px-4 sm:text-[13.5px] ${
            leitura.tom === "ok" ? "border-pos/30 bg-pos/[0.06]" : leitura.tom === "nao" ? "border-grave/30 bg-grave/[0.06]" : "border-nevoa/20 bg-noite/50"
          }`}
        >
          {leitura.tom === "ok" ? (
            <IconeOk className="mt-1 size-3.5 text-pos" />
          ) : leitura.tom === "nao" ? (
            <IconeNao className="mt-1 size-3.5 text-grave-texto" />
          ) : (
            <span aria-hidden="true" className="mt-0.5 w-3.5 shrink-0 text-center font-bold text-nevoa">
              —
            </span>
          )}
          {/* a escolhida é a mesma do cartão de cima, que já disse a frase inteira: aqui, só os números */}
          <p>
            <strong className="font-semibold">{leitura.titulo}</strong>
            {sobre === null ? (
              <>
                <span className="text-nevoa"> · a célula do cartão acima</span>: {leitura.curta}.
              </>
            ) : (
              <>: {leitura.texto}</>
            )}
          </p>
        </div>
      )}

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-[13px] leading-relaxed text-nevoa sm:px-0 sm:text-[12.5px]">
        {visao === "teto" && fixo ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded border border-pos/40 bg-pos/10">
                <IconeOk className="size-2.5 text-pos" />
              </span>
              atinge a meta; o número é a folga para imprevistos
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded border border-nevoa/25 bg-noite">
                <IconeNao className="size-2.5 text-grave-texto" />
              </span>
              não atinge a meta, nem sem imprevistos
            </span>
          </>
        ) : visao === "teto" ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded border border-pos/40 bg-pos/10">
                <IconeOk className="size-2.5 text-pos" />
              </span>
              dá para cobrir o lance mínimo e atingir a meta
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded border border-nevoa/25 bg-noite">
                <IconeNao className="size-2.5 text-grave-texto" />
              </span>
              o lance mínimo já passa do teto
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded border border-nevoa/25 bg-noite text-[10px]">
                —
              </span>
              nenhum lance atinge
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded border border-pos/40 bg-pos/10">
                <IconeOk className="size-2.5 text-pos" />
              </span>
              atinge a sua meta ({metaPorExtenso(r.meta)})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded border border-nevoa/25 bg-noite">
                <IconeNao className="size-2.5 text-grave-texto" />
              </span>
              não atinge
            </span>
          </>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-4 rounded border-2 border-latao-texto bg-latao/15" />
          escolhida (a mesma do cartão)
        </span>
      </p>

      <div className="mt-4 flex flex-col gap-3 border-t border-nevoa/15 px-1 pt-4 sm:px-0">
        <BaseDaVenda r={r} aoAjustar={aoAjustar} aoEditarVenda={aoEditarVenda} />
        <PrazosDasColunas r={r} aoAjustar={aoAjustar} />
      </div>
    </section>
  );
}

/** O % de venda de um cenário, editável no cabeçalho da linha (pop-up com o campo). */
function EditarPctCenario({
  r,
  cenario,
  aoDefinirPct,
  aoAjustar,
}: {
  r: ResultadoCompleto;
  cenario: Cenario;
  aoDefinirPct: (c: CenarioFixo, fracao: number) => void;
  aoAjustar: (mudar: (a: Ajustes) => Ajustes) => void;
}) {
  const p = r.modelo.premissas;
  const mult = multiplicador(p, cenario);
  const base = r.modelo.origemVenda.tipo === "referencia" ? "da referência da região" : r.modelo.origemVenda.tipo === "avaliacao" ? "da avaliação" : "do valor informado";
  const fixo = cenario === "personalizado" ? null : cenario;
  const padrao = fixo ? PADRAO[CHAVE_CENARIO[fixo]] : null;
  const ajustado = fixo ? Math.abs(mult - padrao!) > 1e-9 : true;
  return (
    <Popover
      rotulo={`% de venda do cenário ${CENARIO_ROTULO[cenario].toLowerCase()}`}
      largura={320}
      gatilho={{
        conteudo: (
          <>
            <span className="tabular-nums">{cenario === "personalizado" && p.vendaPersonalizada?.modo === "valor" ? curto(p.vendaPersonalizada.valor) : pct(mult, 0)}</span>
            <IconeLapis className="size-3 text-nevoa" />
          </>
        ),
        ariaLabel: `Editar o % de venda do cenário ${CENARIO_ROTULO[cenario].toLowerCase()} (${pct(mult, 0)} ${base})`,
        // 32 px de altura à vista; no toque, a área de toque cresce para 44 px (o mesmo truque do (i) do glossário)
        className: `relative mt-1 inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg border px-2 text-[11.5px] leading-none tabular-nums transition-colors before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] hover:border-latao hover:bg-latao/10 sm:text-[12.5px] pointer-fine:px-1.5 pointer-fine:before:hidden ${
          ajustado ? "border-latao/60 bg-latao/10 font-semibold text-latao-texto" : "border-nevoa/30 text-luar"
        }`,
      }}
    >
      {({ fechar }) => (
        <div className="p-4">
          <p className="text-[14px] font-semibold">Cenário {CENARIO_ROTULO[cenario].toLowerCase()}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-nevoa">
            Por quanto você vende, em % {base} ({moeda(p.valorVenda ?? 0)}).
          </p>
          {/* a base dos % à vista e trocável ali mesmo (avaliação ou referência de R$/m² da região) */}
          {opcoesDaBase(r).length > 1 && (
            <Segmentado<BaseVendaOpcao>
              className="mt-3"
              nome={`sim-base-pop-${cenario}`}
              legenda="Os % são sobre"
              valor={p.baseVenda}
              tamanho="sm"
              aoMudar={(v) => mudarBase(r, v, aoAjustar)}
              opcoes={opcoesDaBase(r)}
            />
          )}
          {fixo ? (
            <div className="mt-3 flex items-center gap-3">
              <CampoNumero
                valor={Math.round(mult * 1000) / 10}
                casas={1}
                sufixo="%"
                min={LIMITES.cenarioBase[0] * 100}
                max={LIMITES.cenarioBase[1] * 100}
                passo={5}
                ariaLabel={`% de venda do cenário ${CENARIO_ROTULO[cenario].toLowerCase()}`}
                aoMudar={(n) => aoDefinirPct(fixo, Math.round(n * 10) / 1000)}
                className="w-28"
              />
              <span className="text-[13px] text-nevoa tabular-nums">= {moeda((p.valorVenda ?? 0) * mult)}</span>
            </div>
          ) : (
            p.vendaPersonalizada && (
              <EditorPersonalizado
                vp={p.vendaPersonalizada}
                referencia={p.valorVenda ?? 0}
                aoMudar={(v: VendaPersonalizada) => aoAjustar((a) => ({ ...a, vendaPersonalizada: v }))}
              />
            )
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {fixo && ajustado ? (
              <button
                type="button"
                onClick={() => aoDefinirPct(fixo, padrao!)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
              >
                <IconeVoltar />
                voltar ao padrão ({pct(padrao!, 0)})
              </button>
            ) : cenario === "personalizado" ? (
              <button
                type="button"
                onClick={() => {
                  aoAjustar((a) => {
                    const novo = { ...a };
                    delete novo.vendaPersonalizada;
                    return novo;
                  });
                  fechar();
                }}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-grave-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
              >
                Remover o cenário personalizado
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={fechar} className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-latao px-4 text-[13.5px] font-semibold text-noite-fixa pointer-fine:min-h-9">
              Pronto
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

type BaseVendaOpcao = "avaliacao" | "regiao" | "informado";

/** As bases possíveis para os % de venda deste imóvel (a avaliação, a referência da região e o valor informado). */
function opcoesDaBase(r: ResultadoCompleto): { valor: BaseVendaOpcao; rotulo: string; detalhe: string }[] {
  const { modelo } = r;
  const o = modelo.opcoesVenda;
  const opcoes: { valor: BaseVendaOpcao; rotulo: string; detalhe: string }[] = [];
  if (o.avaliacao !== null) opcoes.push({ valor: "avaliacao", rotulo: "Avaliação", detalhe: moedaCurta(o.avaliacao) });
  // o recorte e a fonte à vista: o mesmo número da seção "Preço do m² na região" ("R$ 3.960/m² · bairro, ITBI")
  if (o.regiao) {
    const ref = o.regiao.referencia;
    const onde = { rua: "rua", bairro: "bairro", cidade: "cidade", uf: "estado" }[ref.escopo];
    opcoes.push({ valor: "regiao", rotulo: "Região", detalhe: `${porArea(o.regiao.m2, modelo.entrada.tipo)} · ${onde}${ref.fonte === "itbi" ? ", ITBI" : ""}` });
  }
  if (modelo.premissas.baseVenda === "informado") opcoes.push({ valor: "informado", rotulo: "Seu valor", detalhe: moedaCurta(modelo.premissas.valorVenda ?? 0) });
  return opcoes;
}

/** Troca a base dos % de venda (o valor informado só se troca pelo pop-up da venda). */
function mudarBase(r: ResultadoCompleto, v: BaseVendaOpcao, aoAjustar: (mudar: (a: Ajustes) => Ajustes) => void) {
  if (v === "informado") return;
  const padrao = r.modelo.opcoesVenda.avaliacao !== null ? "avaliacao" : "regiao";
  aoAjustar((a) => {
    const novo = { ...a };
    delete novo.valorVenda;
    if (v === padrao) delete novo.baseVenda;
    else novo.baseVenda = v;
    return novo;
  });
}

/** A base dos % de venda: avaliação, referência da região ou o valor que a pessoa informou (escolha visível). */
function BaseDaVenda({ r, aoAjustar, aoEditarVenda }: { r: ResultadoCompleto; aoAjustar: (mudar: (a: Ajustes) => Ajustes) => void; aoEditarVenda: () => void }) {
  const { modelo } = r;
  const o = modelo.opcoesVenda;
  const atual = modelo.premissas.baseVenda;
  const opcoes = opcoesDaBase(r);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <p className="text-[13px] font-semibold sm:w-44 sm:shrink-0">Os % de venda são sobre</p>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {opcoes.length > 1 ? (
          <Segmentado<BaseVendaOpcao>
            nome="sim-base-venda"
            legenda="Base dos % de venda"
            valor={atual}
            tamanho="sm"
            className="min-w-0 flex-1 sm:max-w-md"
            aoMudar={(v) => mudarBase(r, v, aoAjustar)}
            opcoes={opcoes}
          />
        ) : (
          <span className="text-[13px] text-nevoa">
            {opcoes[0]?.rotulo === "Avaliação" ? `a avaliação da fonte (${moeda(o.avaliacao ?? 0)})` : opcoes[0]?.rotulo === "Região" ? "a referência da região" : "o valor que você informou"}
            {o.regiaoSemArea ? " · para usar a referência da região, informe a área" : !o.regiao ? " · sem referência da região para este tipo" : ""}
          </span>
        )}
        <button
          type="button"
          onClick={aoEditarVenda}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-[12.5px] font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
        >
          <IconeLapis className="size-3" />
          informar outro valor
        </button>
      </div>
    </div>
  );
}

/** Os 4 prazos das colunas da tabela (3 a 60 meses), editáveis num pop-up. */
function PrazosDasColunas({ r, aoAjustar }: { r: ResultadoCompleto; aoAjustar: (mudar: (a: Ajustes) => Ajustes) => void }) {
  const p = r.modelo.premissas;
  const ajustado = p.prazos.join() !== PADRAO.prazos.join();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <p className="text-[13px] font-semibold sm:w-44 sm:shrink-0">Colunas da tabela</p>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-nevoa">
        <span className="tabular-nums">{[...new Set(p.prazos)].sort((x, y) => x - y).join(", ")} meses</span>
        {r.colunaExtra !== null && <span>+ o seu prazo ({meses(r.colunaExtra)})</span>}
        <Popover
          rotulo="Prazos das colunas da tabela"
          largura={340}
          gatilho={{
            conteudo: (
              <>
                <IconeLapis className="size-3" />
                trocar
              </>
            ),
            ariaLabel: "Trocar os prazos das colunas da tabela",
            className:
              "inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-[12.5px] font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8",
          }}
        >
          {({ fechar }) => (
            <div className="p-4">
              <p className="text-[14px] font-semibold">Prazos das colunas</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-nevoa">Em quantos meses depois da compra você vende (3 a 60).</p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {p.prazos.map((m, i) => (
                  <CampoNumero
                    key={i}
                    valor={m}
                    min={LIMITES.prazo[0]}
                    max={LIMITES.prazo[1]}
                    passo={1}
                    ariaLabel={`Coluna ${i + 1}, em meses`}
                    aoMudar={(n) => {
                      const novos = [...p.prazos];
                      novos[i] = Math.round(n);
                      aoAjustar((a) => {
                        const novo = { ...a };
                        if (novos.join() === PADRAO.prazos.join()) delete novo.prazos;
                        else novo.prazos = novos;
                        return novo;
                      });
                    }}
                    className="w-full"
                  />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                {ajustado ? (
                  <button
                    type="button"
                    onClick={() =>
                      aoAjustar((a) => {
                        const novo = { ...a };
                        delete novo.prazos;
                        return novo;
                      })
                    }
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
                  >
                    <IconeVoltar />
                    voltar ao padrão (6, 12, 18, 24)
                  </button>
                ) : (
                  <span />
                )}
                <button type="button" onClick={fechar} className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-latao px-4 text-[13.5px] font-semibold text-noite-fixa pointer-fine:min-h-9">
                  Pronto
                </button>
              </div>
            </div>
          )}
        </Popover>
      </div>
    </div>
  );
}

function BotaoCelula({
  r,
  cel,
  rr,
  c,
  visao,
  muitas,
  selecionada,
  aoSelecionar,
  aoTeclar,
  aoSobre,
}: {
  r: ResultadoCompleto;
  cel: CelulaMatriz;
  rr: number;
  c: number;
  visao: Visao;
  muitas: boolean;
  selecionada: boolean;
  aoSelecionar: () => void;
  aoTeclar: (e: KeyboardEvent<HTMLButtonElement>) => void;
  aoSobre: (v: boolean) => void;
}) {
  const { principal, secundario, ok, contexto } = conteudoCelula(r, cel, visao);
  const dica = leituraCelula(r, cel, visao);

  return (
    <>
      <button
        type="button"
        data-celula={`${rr}-${c}`}
        aria-pressed={selecionada}
        tabIndex={selecionada ? 0 : -1}
        onClick={aoSelecionar}
        onKeyDown={aoTeclar}
        onMouseEnter={() => aoSobre(true)}
        onFocus={() => aoSobre(true)}
        onBlur={() => aoSobre(false)}
        className={`peer relative flex min-h-16 w-full cursor-pointer flex-col items-center justify-center rounded-xl border px-0.5 py-2 text-center transition-[background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none sm:min-h-[4.5rem] ${
          selecionada
            ? // no claro, o latão de texto (bronze) dá 3:1 contra o branco; o latão de superfície ficaria em 2,3:1
              "border-latao-texto bg-latao/15 shadow-[inset_0_0_0_1px_var(--latao-texto)]"
            : ok
              ? "border-pos/25 bg-pos/[0.07] hover:border-pos/55"
              : "border-nevoa/15 bg-noite/60 hover:border-nevoa/45"
        }`}
      >
        {selecionada && <span aria-hidden="true" className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-latao-texto" />}
        <span
          className={`font-display leading-none font-bold tracking-[-0.01em] tabular-nums max-[359px]:text-[12px] ${muitas ? "text-[12.5px]" : "text-[14px]"} ${
            // "R$ 17.638.267" não cabe a 17 px na coluna de ~135 px do desktop
            principal.longo.length > 11 || muitas ? "sm:text-[15px]" : "sm:text-[17px]"
          } ${principal.grave ? "text-grave-texto" : ""}`}
        >
          <span className="sm:hidden">
            {principal.moeda && <span className="sr-only">R$ </span>}
            {principal.curto === "—" ? <span aria-hidden="true">—</span> : principal.curto}
          </span>
          <span className="hidden sm:inline">{principal.longo === "—" ? <span aria-hidden="true">—</span> : principal.longo}</span>
        </span>
        {secundario && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] leading-none whitespace-nowrap text-nevoa tabular-nums sm:text-[12px]">
            {ok === true && <IconeOk className="size-2.5 text-pos sm:size-3" />}
            {ok === false && <IconeNao className="size-2.5 text-grave-texto sm:size-3" />}
            {/* com a coluna extra (5 colunas), a célula fica estreita: só a forma curta. No celular, a folga em reais
                não cabe ao lado do lance: fica só o ✓/✕ (a folga da célula escolhida aparece na leitura, logo abaixo) */}
            <span className={visao === "teto" ? (muitas ? "hidden sm:inline" : "hidden") : muitas ? "" : "sm:hidden"}>{secundario.curto}</span>
            {!muitas && <span className="hidden sm:inline">{secundario.longo}</span>}
          </span>
        )}
        <span className="sr-only">
          {contexto}
          {selecionada ? " (escolhida)" : ""}
        </span>
      </button>
      {/* dica no hover (só mouse): o que a célula quer dizer, em frase */}
      <span
        aria-hidden="true"
        // só a partir de 640 px (numa janela estreita com mouse, a dica de 256 px passava da borda e criava rolagem para o
        // lado); nas duas últimas colunas, ancorada pela direita
        className={`pointer-events-none absolute bottom-full z-20 mb-2 hidden w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-nevoa/25 bg-tinta px-3 py-2 text-left text-[12px] leading-snug text-luar opacity-0 shadow-[0_12px_32px_rgba(7,11,22,.35)] transition-opacity delay-0 duration-150 peer-hover:opacity-100 peer-hover:delay-300 motion-reduce:transition-none sm:pointer-fine:block ${
          c === 0 ? "left-0" : c >= r.colunas.length - 2 ? "right-0" : "left-1/2 -translate-x-1/2"
        }`}
      >
        <strong className="font-semibold">{dica.titulo}:</strong> {dica.texto}
      </span>
    </>
  );
}

/** Conteúdo de uma célula: o número principal, o secundário, se atinge a meta e a frase para o leitor de tela. */
function conteudoCelula(r: ResultadoCompleto, cel: CelulaMatriz, visao: Visao) {
  const lance = r.modelo.entrada.lance;
  const quando = `${CENARIO_ROTULO[cel.cenario].toLowerCase()}, venda em ${meses(cel.meses)}`;
  // O nome acessível é o próprio texto visível (o que um comando de voz enxerga: "clicar R$ 96 mil"), seguido do
  // contexto só para o leitor de tela. Sem aria-label, que trocava o texto visível por outra frase (WCAG 2.5.3).
  let principal: { curto: string; longo: string; grave?: boolean; moeda: boolean };
  let secundario: { curto: string; longo: string } | null;
  let ok: boolean | null;
  let contexto: string;

  if (visao === "teto" && r.semDisputa) {
    // venda direta: a margem para imprevistos pelo preço pedido (o preço não sobe: "lance máximo" não quer dizer nada)
    const m = cel.margem ?? null;
    ok = m !== null;
    if (m === null) {
      principal = { curto: "—", longo: "—", moeda: false };
      secundario = { curto: "não atinge", longo: "não atinge" };
      contexto = `: não atinge a meta no cenário ${quando}, nem sem imprevistos`;
    } else {
      principal = { curto: curto(m), longo: moeda(m), moeda: true };
      secundario = { curto: "de folga", longo: "de folga" };
      contexto = `: margem de ${moeda(m)} para custos imprevistos no cenário ${quando}, mantendo a meta`;
    }
  } else if (visao === "teto") {
    if (cel.teto === null) {
      principal = { curto: "—", longo: "—", moeda: false };
      secundario = { curto: "sem teto", longo: "nenhum lance" };
      ok = null;
      contexto = `: nenhum lance atinge a meta no cenário ${quando}`;
    } else {
      // a folga em reais entre o lance mínimo e o teto ("sobra R$ 104 mil"), como no cartão: mais direto que
      // "+414% vs. mínimo", que o dono achou difícil de ler
      const folga = cel.teto - lance;
      ok = cel.teto >= lance;
      principal = { curto: curto(cel.teto), longo: moeda(cel.teto), moeda: true };
      const igual = lance > 0 ? Math.abs(folga / lance) < 0.0005 : folga === 0;
      secundario = igual
        ? { curto: "≈ mín.", longo: "≈ lance mínimo" }
        : ok
          ? { curto: `+${curto(folga)}`, longo: `sobra ${moedaCurta(folga)}` }
          : { curto: `−${curto(-folga)}`, longo: `faltam ${moedaCurta(-folga)}` };
      contexto = `: lance máximo no cenário ${quando}; ${
        igual ? "praticamente igual ao lance mínimo" : ok ? `sobra ${moeda(folga)} acima do lance mínimo` : `fica ${moeda(-folga)} abaixo do lance mínimo`
      }`;
    }
  } else {
    const s = cel.comMeuLance;
    ok = atingeMeta(s, r.meta);
    principal = { curto: curto(s.lucro), longo: moedaSinal(s.lucro), grave: s.lucro < 0, moeda: true };
    // no celular a célula tem ~60 px: só o %, e o cabeçalho da tabela diz "lucro em R$ e % ao ano"
    secundario = { curto: pct(s.roiAA, 0), longo: `${pct(s.roiAA)} ao ano` };
    contexto = `: ${s.lucro >= 0 ? "lucro" : "prejuízo"} e retorno ao ano no cenário ${quando}; ${ok ? "atinge" : "não atinge"} a meta`;
  }
  return { principal, secundario, ok, contexto };
}

/**
 * Celular (abaixo de sm): a tabela vira um prazo por vez. Em cima, os prazos (6 · 12 · 18 · 24 · o seu); embaixo,
 * uma linha larga por cenário, com o % editável, o número principal em 16 px, o secundário (folga ou % ao ano) e
 * ✓/✕. Trocar o prazo só muda o que se vê; tocar numa linha escolhe a célula (a mesma do cartão e do Detalhe).
 */
function MatrizCelular({
  r,
  visao,
  linhas,
  colunas,
  ri,
  ci,
  aoSelecionar,
  definirPct,
  aoAjustar,
}: {
  r: ResultadoCompleto;
  visao: Visao;
  linhas: Cenario[];
  colunas: number[];
  ri: number;
  ci: number;
  aoSelecionar: (c: Celula) => void;
  definirPct: (c: CenarioFixo, fracao: number) => void;
  aoAjustar: (mudar: (a: Ajustes) => Ajustes) => void;
}) {
  // o prazo à vista: o da célula escolhida, até a pessoa trocar aqui (e de novo quando a escolhida muda de prazo)
  const [vendo, setVendo] = useState<{ base: number; meses: number } | null>(null);
  const mesesVistos = vendo && vendo.base === colunas[ci] && colunas.includes(vendo.meses) ? vendo.meses : colunas[ci];
  const c = Math.max(0, colunas.indexOf(mesesVistos));
  const celulas = r.tabela!;
  return (
    <div className="mt-4 sm:hidden">
      <p id="sim-matriz-prazo" className="px-1 text-[13px] font-medium text-nevoa">
        Vendendo em quantos meses
      </p>
      <div role="group" aria-labelledby="sim-matriz-prazo" className="mt-2 flex flex-wrap gap-1.5 px-1">
        {colunas.map((m) => (
          <Chip key={m} ativo={m === mesesVistos} onClick={() => setVendo({ base: colunas[ci], meses: m })} ariaLabel={`${meses(m)}${r.colunaExtra === m ? " (o seu prazo)" : ""}`}>
            {m}
            {r.colunaExtra === m && <span className="font-normal text-nevoa"> · seu</span>}
          </Chip>
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-2" aria-label={`Cenários, vendendo em ${meses(mesesVistos)}`}>
        {celulas.map((linha, rr) => {
          const cel = linha[c];
          if (!cel) return null;
          const cenario = linhas[rr];
          const sel = rr === ri && c === ci;
          const { principal, secundario, ok, contexto } = conteudoCelula(r, cel, visao);
          return (
            <li key={cenario} className="flex items-stretch gap-2">
              <div className="flex w-[6.5rem] shrink-0 flex-col justify-center px-1">
                <span className={`text-[14px] leading-tight font-semibold ${rr === ri ? "text-latao-texto" : ""}`}>{CENARIO_ROTULO[cenario]}</span>
                <span>
                  <EditarPctCenario r={r} cenario={cenario} aoDefinirPct={definirPct} aoAjustar={aoAjustar} />
                </span>
              </div>
              <button
                type="button"
                aria-pressed={sel}
                onClick={() => aoSelecionar({ cenario, meses: mesesVistos })}
                className={`relative flex min-h-16 min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-[background-color,border-color] duration-150 motion-reduce:transition-none ${
                  sel ? "border-latao-texto bg-latao/15 shadow-[inset_0_0_0_1px_var(--latao-texto)]" : ok ? "border-pos/25 bg-pos/[0.07]" : "border-nevoa/15 bg-noite/60"
                }`}
              >
                <span className="min-w-0">
                  <span className={`block font-display text-[16px] leading-tight font-bold tabular-nums ${principal.grave ? "text-grave-texto" : ""}`}>
                    {principal.longo === "—" ? <span aria-hidden="true">—</span> : principal.longo}
                  </span>
                  {secundario && <span className="mt-1 block text-[13px] leading-tight text-nevoa tabular-nums">{secundario.longo}</span>}
                </span>
                <span aria-hidden="true" className="flex shrink-0 items-center">
                  {ok === true && <IconeOk className="size-3.5 text-pos" />}
                  {ok === false && <IconeNao className="size-3.5 text-grave-texto" />}
                </span>
                <span className="sr-only">
                  {contexto}
                  {sel ? " (escolhida)" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
