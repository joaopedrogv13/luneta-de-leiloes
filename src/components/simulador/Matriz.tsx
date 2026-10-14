"use client";

import { useRef, type KeyboardEvent } from "react";
import { atingeMeta, type CelulaMatriz } from "@/lib/simulador/calculo";
import { multiplicador, type Modelo } from "@/lib/simulador/premissas";
import { CENARIOS, type Celula, type Meta } from "@/lib/simulador/tipos";
import { baseDaVenda, CENARIO_ROTULO, metaPorExtenso } from "./CartaoResposta";
import { Aviso, CampoNumero, Deslizante, IconeNao, IconeOk, IconeVoltar, Segmentado } from "./controles";
import type { Visao } from "./estado";
import { curto, meses, moeda, moedaSinal, pct } from "./formato";

/**
 * Matriz cenários × prazos. Duas visões: o lance máximo que atinge a meta em cada célula, ou o lucro e o
 * retorno ao ano com o lance da pessoa. A célula escolhida (botão com aria-pressed; setas movem a escolha)
 * alimenta o cartão-resposta e o detalhamento.
 */
export function Matriz({
  modelo,
  celulas,
  meta,
  visao,
  meuLance,
  meuLanceAjustado,
  selecionada,
  aoSelecionar,
  aoMudarVisao,
  aoMudarMeuLance,
}: {
  modelo: Modelo;
  celulas: CelulaMatriz[][];
  meta: Meta;
  visao: Visao;
  meuLance: number;
  meuLanceAjustado: boolean;
  selecionada: Celula;
  aoSelecionar: (c: Celula) => void;
  aoMudarVisao: (v: Visao) => void;
  aoMudarMeuLance: (n: number | null) => void;
}) {
  const p = modelo.premissas;
  const lance = modelo.entrada.lance;
  const tabela = useRef<HTMLTableElement>(null);
  const vendaMax = (p.valorVenda ?? lance) * Math.max(p.cenarioOtimista, 1);
  const lanceSliderMax = Math.max(Math.round((lance * 1.6) / 1000) * 1000, Math.round(vendaMax / 1000) * 1000, 10_000);

  const mover = (e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) => {
    const linhas = celulas.length;
    const colunas = celulas[0].length;
    let nr = r;
    let nc = c;
    if (e.key === "ArrowRight") nc = Math.min(colunas - 1, c + 1);
    else if (e.key === "ArrowLeft") nc = Math.max(0, c - 1);
    else if (e.key === "ArrowDown") nr = Math.min(linhas - 1, r + 1);
    else if (e.key === "ArrowUp") nr = Math.max(0, r - 1);
    else if (e.key === "Home") nc = 0;
    else if (e.key === "End") nc = colunas - 1;
    else return;
    e.preventDefault();
    aoSelecionar({ cenario: CENARIOS[nr], prazo: nc });
    tabela.current?.querySelector<HTMLButtonElement>(`[data-celula="${nr}-${nc}"]`)?.focus();
  };

  return (
    <section
      aria-labelledby="sim-matriz-titulo"
      className="rounded-3xl border border-nevoa/20 bg-tinta p-3 sm:p-6 in-data-[theme=light]:shadow-[0_1px_2px_rgba(15,24,48,.05)]"
    >
      <div className="px-1 pt-1 sm:px-0 sm:pt-0">
        <h3 id="sim-matriz-titulo" className="font-display text-[19px] leading-tight font-bold tracking-[-0.01em] sm:text-[21px]">
          Cenários e prazos
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-nevoa">
          Cada linha é um preço de venda; cada coluna, quando você vende. Toque numa célula para ver a conta.
        </p>
      </div>

      <Segmentado
        className="mt-4"
        nome="sim-visao"
        legenda="O que mostrar na matriz"
        valor={visao}
        aoMudar={aoMudarVisao}
        tamanho="sm"
        opcoes={[
          {
            valor: "teto",
            rotulo: (
              <>
                Lance máximo<span className="hidden sm:inline"> para a meta</span>
              </>
            ),
          },
          {
            valor: "lucro",
            rotulo: (
              <>
                Lucro com <span className="hidden sm:inline">o </span>meu lance
              </>
            ),
          },
        ]}
      />

      {visao === "lucro" && (
        <div className="mt-3 rounded-2xl border border-nevoa/15 bg-noite/60 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <label htmlFor="sim-meu-lance" className="text-[14px] font-semibold">
              Meu lance
            </label>
            {meuLanceAjustado && (
              <button
                type="button"
                onClick={() => aoMudarMeuLance(null)}
                className="-my-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-[12.5px] font-medium text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
              >
                <IconeVoltar />
                usar o lance mínimo ({moeda(lance)})
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
              ariaLabel="Meu lance"
              textoValor={moeda(meuLance)}
              aoMudar={(n) => aoMudarMeuLance(n === lance ? null : n)}
            />
          </div>
          <p id="sim-meu-lance-ajuda" className="mt-1 text-[12.5px] leading-relaxed text-nevoa">
            Lance mínimo atual: {moeda(lance)}. O lance que você digitar vale para toda a matriz.
          </p>
          {meuLance < lance && (
            <Aviso className="mt-2">
              Abaixo do lance mínimo atual ({moeda(lance)}): a fonte não aceita este lance. Serve só para comparar (numa praça seguinte, o mínimo pode
              cair).
            </Aviso>
          )}
        </div>
      )}

      <div className="mt-4 -mx-1 sm:mx-0">
        <table ref={tabela} className="w-full table-fixed border-separate border-spacing-1">
          <caption className="sr-only">
            {visao === "teto"
              ? `Lance máximo para ${metaPorExtenso(meta)}, por cenário de venda (linhas) e prazo de venda (colunas).`
              : `Lucro e retorno ao ano com um lance de ${moeda(meuLance)}, por cenário de venda (linhas) e prazo de venda (colunas).`}{" "}
            Use as setas para trocar de célula.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-[5.2rem] max-[359px]:w-[4.4rem] px-1 pb-1 text-left align-bottom text-[11px] leading-tight font-medium text-nevoa sm:w-40 sm:text-[12px]">
                <span className="sm:hidden">{visao === "teto" ? "em R$" : "lucro em R$ e % ao ano"}</span>
                <span className="hidden sm:inline">Venda em →</span>
              </th>
              {p.prazos.map((m, i) => (
                // no celular, número e "meses" em duas linhas em todas as colunas (antes "6 meses" cabia numa linha e
                // "12 meses" quebrava, desalinhando o cabeçalho)
                <th key={i} scope="col" className="pb-1 text-center align-bottom text-[12px] leading-tight font-semibold whitespace-nowrap sm:text-[13px]">
                  <span className="block sm:inline">{m}</span>
                  <span className="block text-[11px] font-normal text-nevoa sm:inline sm:text-[13px]">
                    <span className="hidden sm:inline"> </span>
                    {m === 1 ? "mês" : "meses"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {celulas.map((linha, r) => {
              const cenario = CENARIOS[r];
              const mult = multiplicador(p, cenario);
              return (
                <tr key={cenario}>
                  <th scope="row" className="px-1 text-left align-middle">
                    {/* abaixo de 360 px, "Conservador" não cabe na coluna: "Conserv." à vista, o nome inteiro para o leitor de tela */}
                    <span className="block text-[12px] leading-tight font-semibold sm:text-[14px]">
                      <span className={cenario === "conservador" ? "max-[359px]:sr-only" : ""}>{CENARIO_ROTULO[cenario]}</span>
                      {cenario === "conservador" && (
                        <span aria-hidden="true" className="hidden max-[359px]:inline">
                          Conserv.
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-tight text-nevoa tabular-nums sm:text-[12px]">
                      venda {pct(mult, 0)}
                      <span className="hidden sm:inline"> · {curto((p.valorVenda ?? 0) * mult)}</span>
                    </span>
                  </th>
                  {linha.map((cel, c) => (
                    <td key={c} className="p-0">
                      <BotaoCelula
                        cel={cel}
                        r={r}
                        c={c}
                        visao={visao}
                        meta={meta}
                        lance={lance}
                        selecionada={selecionada.cenario === cenario && selecionada.prazo === c}
                        aoSelecionar={() => aoSelecionar({ cenario, prazo: c })}
                        aoTeclar={(e) => mover(e, r, c)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] leading-relaxed text-nevoa sm:px-0">
        {visao === "teto" ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <IconeOk className="text-pos" /> lance máximo acima do lance mínimo (com a folga)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconeNao className="text-grave-texto" /> lance máximo abaixo do lance mínimo
            </span>
            <span>— nenhum lance atinge a meta</span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <IconeOk className="text-pos" /> atinge sua meta ({metaPorExtenso(meta)})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconeNao className="text-grave-texto" /> não atinge
            </span>
          </>
        )}
      </p>
      <p className="mt-1 px-1 text-[12px] leading-relaxed text-nevoa sm:px-0">
        Venda em % {baseDaVenda(modelo)} ({moeda(p.valorVenda ?? 0)}). Meta: {metaPorExtenso(meta)}.
      </p>
    </section>
  );
}

function BotaoCelula({
  cel,
  r,
  c,
  visao,
  meta,
  lance,
  selecionada,
  aoSelecionar,
  aoTeclar,
}: {
  cel: CelulaMatriz;
  r: number;
  c: number;
  visao: Visao;
  meta: Meta;
  lance: number;
  selecionada: boolean;
  aoSelecionar: () => void;
  aoTeclar: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const quando = `${CENARIO_ROTULO[cel.cenario].toLowerCase()}, venda em ${meses(cel.meses)}`;
  // O nome acessível é o próprio texto visível (o que um comando de voz enxerga: "clicar R$ 96 mil"), seguido do
  // contexto só para o leitor de tela. Sem aria-label, que trocava o texto visível por outra frase (WCAG 2.5.3).
  let principal: { curto: string; longo: string; grave?: boolean; moeda: boolean };
  let secundario: { curto: string; longo: string } | null;
  let ok: boolean | null;
  let contexto: string;

  if (visao === "teto") {
    if (cel.teto === null) {
      principal = { curto: "—", longo: "—", moeda: false };
      secundario = { curto: "sem teto", longo: "nenhum lance" };
      ok = null;
      contexto = `: nenhum lance atinge a meta no cenário ${quando}`;
    } else {
      const folga = lance > 0 ? cel.teto / lance - 1 : 0;
      ok = cel.teto >= lance;
      principal = { curto: curto(cel.teto), longo: moeda(cel.teto), moeda: true };
      // perto de zero, "−0%" não diz nada (e vinha com ×): uma casa decimal, ou "≈" quando é praticamente igual
      const igual = Math.abs(folga) < 0.0005;
      const f = igual ? "≈" : `${folga > 0 ? "+" : ""}${pct(folga, Math.abs(folga) < 0.01 ? 1 : 0)}`;
      secundario = igual ? { curto: "≈ mín.", longo: "≈ lance mínimo" } : { curto: f, longo: `${f} vs. mínimo` };
      contexto = `: lance máximo no cenário ${quando}, ${igual ? "praticamente igual ao" : ok ? "acima do" : "abaixo do"} lance mínimo`;
    }
  } else {
    const s = cel.comMeuLance;
    ok = atingeMeta(s, meta);
    principal = { curto: curto(s.lucro), longo: moedaSinal(s.lucro), grave: s.lucro < 0, moeda: true };
    // no celular a célula tem ~60 px: só o %, e o cabeçalho da tabela diz "lucro em R$ e % ao ano"
    secundario = { curto: pct(s.roiAA, 0), longo: `${pct(s.roiAA)} ao ano` };
    contexto = `: ${s.lucro >= 0 ? "lucro" : "prejuízo"} e retorno ao ano no cenário ${quando}; ${ok ? "atinge" : "não atinge"} a meta`;
  }

  return (
    <button
      type="button"
      data-celula={`${r}-${c}`}
      aria-pressed={selecionada}
      tabIndex={selecionada ? 0 : -1}
      onClick={aoSelecionar}
      onKeyDown={aoTeclar}
      className={`flex min-h-16 w-full cursor-pointer flex-col items-center justify-center rounded-xl border px-0.5 py-2 text-center transition-[background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none sm:min-h-[4.5rem] ${
        selecionada
          ? // no claro, o latão de texto (bronze) dá 3:1 contra o branco; o latão de superfície ficaria em 2,3:1
            "border-latao-texto bg-latao/15 shadow-[inset_0_0_0_1px_var(--latao-texto)]"
          : ok
            ? "border-pos/25 bg-pos/[0.07] hover:border-pos/55"
            : "border-nevoa/15 bg-noite/60 hover:border-nevoa/45"
      }`}
    >
      <span
        className={`font-display text-[14px] leading-none max-[359px]:text-[12px] font-bold tracking-[-0.01em] tabular-nums ${
          // "R$ 17.638.267" não cabe a 17 px na coluna de ~135 px do desktop
          principal.longo.length > 11 ? "sm:text-[15px]" : "sm:text-[17px]"
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
          <span className="sm:hidden">{secundario.curto}</span>
          <span className="hidden sm:inline">{secundario.longo}</span>
        </span>
      )}
      <span className="sr-only">{contexto}</span>
    </button>
  );
}
