"use client";

import { cascata, posicoesCascata, type Etapa } from "@/lib/simulador/calculo";
import { multiplicador, type Modelo } from "@/lib/simulador/premissas";
import type { Meta, Simulacao } from "@/lib/simulador/tipos";
import { CENARIO_ROTULO, baseDaVenda } from "./CartaoResposta";
import { IconeSeta, Segmentado } from "./controles";
import { area, meses, moeda, moedaMes, moedaSinal, pct } from "./formato";

export type BaseDetalhe = "meu" | "teto";

/**
 * Detalhamento da célula escolhida: números-resumo, comparação com a aplicação, a cascata da venda ao
 * lucro (barras SVG) e a conta completa, linha a linha.
 */
export function Detalhe({
  modelo,
  sim,
  meta,
  base,
  teto,
  meuLance,
  aoMudarBase,
}: {
  modelo: Modelo;
  sim: Simulacao;
  meta: Meta;
  base: BaseDetalhe;
  teto: number | null;
  meuLance: number;
  aoMudarBase: (b: BaseDetalhe) => void;
}) {
  const p = modelo.premissas;
  const etapas = cascata(sim, modelo.perfil.rotuloReforma);
  // a diferença sai dos dois números já arredondados que a frase mostra (senão "R$ 277.638 − R$ 138.819" dava
  // "R$ 138.820 a mais")
  const diferenca = Math.round(sim.lucro) - Math.round(sim.rendimentoAplicacao);
  const fin = sim.financiamento;
  const ehLanceMinimo = Math.round(sim.lance) === Math.round(modelo.entrada.lance);
  const ehTeto = teto !== null && Math.round(sim.lance) === Math.round(teto);
  const qualLance = ehLanceMinimo ? "lance mínimo atual" : ehTeto ? "lance máximo para a meta" : "seu lance";

  return (
    <section
      aria-labelledby="sim-detalhe-titulo"
      className="rounded-3xl border border-nevoa/20 bg-tinta p-4 sm:p-6 in-data-[theme=light]:shadow-[0_1px_2px_rgba(15,24,48,.05)]"
    >
      <p className="text-[12px] font-semibold tracking-[0.12em] text-nevoa uppercase">
        Detalhe · cenário {CENARIO_ROTULO[sim.cenario].toLowerCase()}, venda em {meses(sim.meses)}
      </p>
      <h3 id="sim-detalhe-titulo" className="mt-1.5 font-display text-[19px] leading-tight font-bold tracking-[-0.01em] sm:text-[21px]">
        Com o lance de {moeda(sim.lance)} <span className="font-sans text-[14px] font-medium tracking-normal text-nevoa sm:text-[15px]">({qualLance})</span>
      </h3>

      {teto !== null && Math.round(teto) !== Math.round(meuLance) ? (
        <Segmentado
          className="mt-3"
          nome="sim-detalhe-base"
          legenda="Detalhar com qual lance"
          valor={base}
          aoMudar={aoMudarBase}
          tamanho="sm"
          opcoes={[
            { valor: "meu", rotulo: Math.round(meuLance) === Math.round(modelo.entrada.lance) ? "Lance mínimo" : "Meu lance", detalhe: moeda(meuLance) },
            { valor: "teto", rotulo: "Lance máximo", detalhe: moeda(teto) },
          ]}
        />
      ) : teto !== null && Math.round(teto) === Math.round(meuLance) ? (
        <p className="mt-1.5 text-[13px] text-nevoa">Este lance é também o lance máximo para a meta.</p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Destaque rotulo={sim.lucro >= 0 ? "Lucro líquido" : "Prejuízo"} valor={moedaSinal(sim.lucro)} tom={sim.lucro < 0 ? "grave" : "forte"} />
        <Destaque
          rotulo="Retorno ao ano"
          valor={pct(sim.roiAA)}
          tom={sim.roiAA < 0 ? "grave" : undefined}
          nota={meta.tipo === "roi_aa" ? `meta ${pct(meta.valor)}` : undefined}
        />
        <Destaque
          rotulo={`Retorno em ${meses(sim.meses)}`}
          valor={pct(sim.roi)}
          tom={sim.roi < 0 ? "grave" : undefined}
          nota={meta.tipo === "roi_periodo" ? `meta ${pct(meta.valor)}` : undefined}
        />
        <Destaque rotulo="Dinheiro investido" valor={moeda(sim.capital)} nota={fin ? "entrada, parcelas e custos" : "lance e custos"} />
      </dl>

      {p.aplicacaoAA > 0 && (
        <p className="mt-3 rounded-xl bg-noite/60 px-3 py-2.5 text-[13px] leading-relaxed">
          <span className="text-nevoa">
            Uma aplicação a {pct(p.aplicacaoAA)} ao ano <span className="whitespace-nowrap">(premissa)</span> renderia {moeda(sim.rendimentoAplicacao)} com o
            mesmo dinheiro no mesmo prazo:{" "}
          </span>
          <strong className="font-semibold">
            o imóvel rende {moeda(Math.abs(diferenca))} {diferenca >= 0 ? "a mais" : "a menos"}.
          </strong>
        </p>
      )}

      <h4 className="mt-6 text-[14px] font-semibold">Da venda ao {sim.lucro >= 0 ? "lucro" : "prejuízo"}</h4>
      <p className="mt-0.5 text-[12.5px] text-nevoa">Cada barra parte de onde a anterior terminou; o percentual é sobre o valor da venda.</p>
      <Cascata etapas={etapas} venda={sim.venda} />

      {fin?.tipo === "banco" && (
        <div className="mt-4 rounded-xl border border-nevoa/15 px-3 py-2.5 text-[13px] leading-relaxed">
          <p className="font-semibold">Financiamento (tabela SAC)</p>
          <p className="mt-1 text-nevoa">
            Entrada de {moeda(fin.entrada)} e {moeda(fin.financiado)} financiados a {pct(p.jurosAA)} ao ano (
            {(fin.taxaMensal * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% ao mês). Primeira parcela: {moeda(fin.primeiraParcela)}. Até a
            venda: {fin.parcelasPagas} parcelas, {moeda(fin.totalParcelas)} pagos ({moeda(fin.jurosPagos)} de juros). Saldo quitado com a venda:{" "}
            {moeda(fin.saldoDevedor)}.
          </p>
        </div>
      )}
      {fin?.tipo === "fonte" && (
        <div className="mt-4 rounded-xl border border-nevoa/15 px-3 py-2.5 text-[13px] leading-relaxed">
          <p className="font-semibold">Parcelamento da fonte</p>
          <p className="mt-1 text-nevoa">
            Entrada de {moeda(fin.entrada)} e {moeda(fin.financiado)} em {fin.prazo} parcelas mensais corrigidas a {pct(p.parcelasCorrecaoAA)} ao ano
            (estimativa do índice). Primeira parcela: {moeda(fin.primeiraParcela)}. Até a venda: {fin.parcelasPagas} parcelas, {moeda(fin.totalParcelas)}{" "}
            pagos. Saldo quitado com a venda, já corrigido: {moeda(fin.saldoDevedor)}. Correção total: {moeda(fin.jurosPagos)}.
          </p>
        </div>
      )}

      <ContaCompleta modelo={modelo} sim={sim} />
    </section>
  );
}

function Destaque({ rotulo, valor, tom, nota }: { rotulo: string; valor: string; tom?: "grave" | "forte"; nota?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-nevoa/15 bg-noite/50 px-3 py-3">
      <dt className="text-[12px] leading-tight text-nevoa">{rotulo}</dt>
      <dd
        className={`mt-1.5 font-display text-[20px] leading-none font-bold tracking-[-0.02em] sm:text-[22px] ${
          tom === "grave" ? "text-grave-texto" : tom === "forte" ? "text-luar" : ""
        }`}
      >
        {valor}
      </dd>
      {nota && <dd className="mt-1.5 text-[11.5px] leading-tight text-nevoa">{nota}</dd>}
    </div>
  );
}

/**
 * Cascata horizontal feita à mão: uma linha por etapa (rótulo e valor em texto, à esquerda) e a barra
 * flutuante em SVG (posições em %, então acompanha a largura sem distorcer os cantos). Linhas pontilhadas
 * ligam o fim de uma barra ao começo da seguinte. As cores só reforçam: o texto diz tudo.
 */
function Cascata({ etapas, venda }: { etapas: Etapa[]; venda: number }) {
  const barras = posicoesCascata(etapas).map(({ etapa, de, ate }) => ({ e: etapa, de, ate }));
  const min = Math.min(0, ...barras.map((b) => Math.min(b.de, b.ate)));
  const max = Math.max(1, ...barras.map((b) => Math.max(b.de, b.ate)));
  const x = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <ol className="mt-3">
      {barras.map(({ e, de, ate }, i) => {
        const esq = Math.min(x(de), x(ate));
        const larg = Math.max(0.4, Math.abs(x(ate) - x(de)));
        const fill = e.chave === "venda" ? "fill-latao" : e.total ? (e.valor >= 0 ? "fill-pos" : "fill-grave") : "fill-nevoa/45";
        const proximo = barras[i + 1];
        return (
          <li
            key={e.chave}
            className={`grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[12.5rem_minmax(0,1fr)] ${e.total ? "mt-1 border-t border-nevoa/20" : ""}`}
          >
            <div className="py-1.5">
              <p className={`text-[13px] leading-tight ${e.total ? "font-bold" : "font-medium"}`}>{e.rotulo}</p>
              <p
                className={`mt-0.5 text-[12px] leading-tight tabular-nums ${e.total ? (e.valor < 0 ? "font-semibold text-grave-texto" : "font-semibold") : "text-nevoa"}`}
              >
                {e.chave === "venda" ? moeda(e.valor) : moedaSinal(e.valor)}
                <span className="text-nevoa"> · {pct(Math.abs(e.valor) / (venda || 1), 0)}</span>
              </p>
            </div>
            <div className="relative min-h-10">
              <svg aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
                {min < 0 && <line x1={`${x(0)}%`} x2={`${x(0)}%`} y1="0" y2="100%" className="stroke-nevoa/40" strokeWidth="1" />}
                {i > 0 && !e.total && (
                  <line x1={`${x(de)}%`} x2={`${x(de)}%`} y1="0" y2="50%" className="stroke-nevoa/50" strokeWidth="1" strokeDasharray="2 3" />
                )}
                {i > 0 && e.total && (
                  <line x1={`${x(ate)}%`} x2={`${x(ate)}%`} y1="0" y2="50%" className="stroke-nevoa/50" strokeWidth="1" strokeDasharray="2 3" />
                )}
                {proximo && !proximo.e.total && (
                  <line x1={`${x(ate)}%`} x2={`${x(ate)}%`} y1="50%" y2="100%" className="stroke-nevoa/50" strokeWidth="1" strokeDasharray="2 3" />
                )}
                {proximo?.e.total && (
                  <line x1={`${x(ate)}%`} x2={`${x(ate)}%`} y1="50%" y2="100%" className="stroke-nevoa/50" strokeWidth="1" strokeDasharray="2 3" />
                )}
                <rect x={`${esq}%`} width={`${larg}%`} y="50%" height="16" transform="translate(0 -8)" rx="4" className={fill} />
              </svg>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A conta inteira, item por item, com a fórmula de cada um. */
function ContaCompleta({ modelo, sim }: { modelo: Modelo; sim: Simulacao }) {
  const p = modelo.premissas;
  const fin = sim.financiamento;
  const m = sim.meses;
  const linhas: { rotulo: string; formula: string; valor: number; forte?: boolean }[] = [
    {
      rotulo: "Venda",
      formula: `${pct(multiplicador(p, sim.cenario), 0)} ${baseDaVenda(modelo)} (${moeda(p.valorVenda ?? 0)})`,
      valor: sim.venda,
      forte: true,
    },
    { rotulo: "Corretagem", formula: `${pct(p.corretagemPct)} da venda`, valor: -sim.corretagem },
    {
      rotulo: "Imposto de renda",
      formula:
        sim.ganhoCapital > 0 ? `${pct(p.irPct)} do ganho de capital (${moeda(sim.ganhoCapital)})` : `sem ganho de capital (${moedaSinal(sim.ganhoCapital)})`,
      valor: -sim.ir,
    },
    {
      rotulo: "Lance",
      formula: fin ? `entrada ${moeda(fin.entrada)} + ${fin.tipo === "fonte" ? "parcelado" : "financiado"} ${moeda(fin.financiado)}` : "pago à vista",
      valor: -sim.lance,
    },
    ...(fin?.tipo === "banco"
      ? [{ rotulo: "Juros do financiamento", formula: `${fin.parcelasPagas} parcelas SAC a ${pct(p.jurosAA)} ao ano`, valor: -fin.jurosPagos }]
      : fin?.tipo === "fonte"
        ? [
            {
              rotulo: "Correção das parcelas",
              formula: `${fin.parcelasPagas} de ${fin.prazo} parcelas e o saldo, corrigidos a ${pct(p.parcelasCorrecaoAA)} ao ano`,
              valor: -fin.jurosPagos,
            },
          ]
        : []),
    { rotulo: "Comissão do leiloeiro", formula: `${pct(p.comissaoPct)} do lance`, valor: -sim.comissao },
    { rotulo: "ITBI", formula: `${pct(p.itbiPct)} do lance`, valor: -sim.itbi },
    { rotulo: "Escritura e registro", formula: `maior entre ${pct(p.registroPct)} do lance e ${moeda(p.registroMin)}`, valor: -sim.registro },
    { rotulo: "Reserva para imprevistos", formula: `${pct(p.reservaPct)} do lance`, valor: -sim.reserva },
    { rotulo: "Desocupação", formula: "valor fixo", valor: -sim.desocupacao },
    { rotulo: "Dívidas que passam ao comprador", formula: "valor fixo", valor: -sim.dividas },
    {
      rotulo: modelo.perfil.rotuloReforma,
      formula: modelo.perfil.modoReforma === "m2" ? `${moeda(p.reformaUnitario)}/m² × ${area(p.area)}${p.areaEstimada ? " (área típica)" : ""}` : "valor fixo",
      valor: -sim.reforma,
    },
    ...(sim.mensal.condominio > 0
      ? [{ rotulo: "Condomínio", formula: `${moedaMes(sim.mensal.condominio)} × ${meses(m)}`, valor: -sim.mensal.condominio * m }]
      : []),
    {
      rotulo: modelo.perfil.rotuloImposto,
      formula: `${moedaMes(sim.mensal.iptu)} × ${meses(m)} (${pct(p.iptuPct, 1)} ao ano ${modelo.entrada.avaliacao ? "da avaliação" : "do lance"})`,
      valor: -sim.mensal.iptu * m,
    },
    { rotulo: "Contas e manutenção", formula: `${moedaMes(sim.mensal.contas)} × ${meses(m)}`, valor: -sim.mensal.contas * m },
    ...(fin && sim.mensal.seguros > 0
      ? [
          {
            rotulo: "Seguros e tarifa do banco",
            formula: `${moedaMes(sim.mensal.seguros)} × ${meses(fin.parcelasPagas)}`,
            valor: -sim.mensal.seguros * fin.parcelasPagas,
          },
        ]
      : []),
  ];

  return (
    <details className="group mt-5 rounded-2xl border border-nevoa/15">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-2 text-[14px] font-semibold sm:px-4 [&::-webkit-details-marker]:hidden">
        Ver a conta completa
        <IconeSeta className="text-nevoa transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="px-3 pb-3 sm:px-4">
        <table className="w-full text-[13px] leading-snug">
          <caption className="sr-only">Conta completa da simulação</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas
              .filter((l) => l.forte || Math.abs(l.valor) >= 0.5)
              .map((l) => (
                <tr key={l.rotulo} className="border-t border-nevoa/10 first:border-t-0">
                  <th scope="row" className="py-2 pr-3 text-left align-top font-normal">
                    <span className={l.forte ? "font-semibold" : "font-medium"}>{l.rotulo}</span>
                    <span className="block text-[12px] text-nevoa">{l.formula}</span>
                  </th>
                  <td className={`py-2 text-right align-top whitespace-nowrap tabular-nums ${l.forte ? "font-semibold" : ""}`}>
                    {l.forte ? moeda(l.valor) : moedaSinal(l.valor)}
                  </td>
                </tr>
              ))}
            <tr className="border-t-2 border-nevoa/30">
              <th scope="row" className="py-2.5 pr-3 text-left font-bold">
                {sim.lucro >= 0 ? "Lucro líquido" : "Prejuízo"}
              </th>
              <td className={`py-2.5 text-right font-bold whitespace-nowrap tabular-nums ${sim.lucro < 0 ? "text-grave-texto" : ""}`}>
                {moedaSinal(sim.lucro)}
              </td>
            </tr>
            <tr className="border-t border-nevoa/10">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                <span className="font-medium">Dinheiro investido</span>
                <span className="block text-[12px] text-nevoa">
                  {fin ? "entrada + parcelas pagas + custos (sem o saldo quitado na venda)" : "lance + custos de compra, regularização, reforma e meses"}
                </span>
              </th>
              <td className="py-2 text-right align-top whitespace-nowrap tabular-nums">{moeda(sim.capital)}</td>
            </tr>
            <tr className="border-t border-nevoa/10">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                <span className="font-medium">Retorno</span>
                <span className="block text-[12px] text-nevoa">lucro ÷ dinheiro investido; ao ano: (1 + retorno)^(12 ÷ {m}) − 1</span>
              </th>
              <td className="py-2 text-right align-top whitespace-nowrap tabular-nums">
                {pct(sim.roi)}
                <span className="block text-[12px] text-nevoa">{pct(sim.roiAA)} ao ano</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}
