"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useEstadoSimulador } from "@/components/simulador/estado";
import type { ReferenciaM2 } from "@/lib/catalogo/tipos";
import { atingeMeta, posicoesCascata } from "@/lib/simulador/calculo";
import { simulacaoCompleta, type ResultadoCompleto } from "@/lib/simulador/completa";
import { GRUPO_ROTULO, type GrupoConta } from "@/lib/simulador/conta";
import { area, juntar, meses, moeda, moedaCurta, moedaSinal, pct } from "@/lib/simulador/formato";
import { multiplicador } from "@/lib/simulador/premissas";
import { CENARIO_ROTULO, metaComoObjetivo, metaPorExtenso, notaIr, palavrasPreco, vendaDoCenario, vendaDoCenarioCurta } from "@/lib/simulador/textos";
import type { Cenario, EntradaSimulador } from "@/lib/simulador/tipos";
import type { Plano } from "@/lib/catalogo/tipos";
import { dataHoraExtensa, escolhaPorExtenso, nomesRetirados, premissasUsadas } from "./dados";
import { IconeAtencao, IconeInfo, IconeNao, IconeOk } from "./icones";
import { Marca, Secao } from "./partes";
import s from "./relatorio.module.css";

// ---------------------------------------------------------------------------
// O resultado, calculado uma vez para o relatório inteiro
// ---------------------------------------------------------------------------

const Contexto = createContext<{ r: ResultadoCompleto; plano: Plano } | null>(null);

/**
 * Lê os ajustes do simulador deste imóvel (o mesmo localStorage da página do imóvel: o relatório é do mesmo site)
 * e faz a conta com `simulacaoCompleta`, a mesma função da tela. No servidor e na primeira pintura valem os
 * padrões; logo depois da hidratação entram os ajustes salvos.
 */
export function ProvedorRelatorio({
  entrada,
  referencias,
  plano,
  children,
}: {
  entrada: EntradaSimulador;
  referencias: ReferenciaM2[];
  /** no Lente, as tags (dívidas, ocupação) não chegam: o relatório não pode dizer "nenhuma apontada" */
  plano: Plano;
  children: ReactNode;
}) {
  const [estado] = useEstadoSimulador(entrada.id);
  const r = useMemo(() => simulacaoCompleta(entrada, estado, referencias), [entrada, estado, referencias]);
  const valor = useMemo(() => ({ r, plano }), [r, plano]);
  // a simulação chega num pedaço de JavaScript à parte (SimulacaoAdiada.tsx): a impressão automática (?imprimir=1,
  // BarraRelatorio) espera este sinal para sair com os ajustes salvos
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.simulacaoPronta = "";
    return () => {
      delete html.dataset.simulacaoPronta;
    };
  }, []);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

function useRelatorio() {
  const v = useContext(Contexto);
  if (!v) throw new Error("useResultado fora do ProvedorRelatorio");
  return v;
}

function useResultado(): ResultadoCompleto {
  return useRelatorio().r;
}

// a hora em que o relatório foi aberto: marcada no navegador quando a página aparece (no servidor e na hidratação,
// nada: evita hora diferente entre os dois) e apagada quando ela sai, para valer a hora de cada visita
let abertoEm: number | null = null;
const ouvintesHora = new Set<() => void>();
const assinarHora = (f: () => void) => {
  ouvintesHora.add(f);
  return () => {
    ouvintesHora.delete(f);
  };
};
const lerHora = () => abertoEm;

/**
 * "17 de outubro de 2026, 15:32" (horário de Brasília), a hora em que o relatório foi gerado. As duas marcas (capa e
 * fontes) mostram a mesma hora; voltando ao relatório pelo navegador (sem recarregar), ele ganha a hora nova, e não a
 * da primeira visita (a simulação pode ter mudado nesse meio-tempo).
 */
/**
 * A data mais larga que o carimbo pode ter ("28 de fevereiro de 2026, 23:59"): com `reservar`, ela ocupa o mesmo lugar,
 * invisível, enquanto a hora ainda não chegou (no servidor e na hidratação). O cabeçalho da capa é alinhado à direita
 * e andava ~100 px quando a data aparecia (CLS; revisão final da rodada 4, UX-13).
 */
const MAIS_LARGA = `${dataHoraExtensa(Date.parse("2026-02-28T23:59:00-03:00"))} (horário de Brasília)`;

export function CarimboData({ reservar = false }: { reservar?: boolean }) {
  const t = useSyncExternalStore(assinarHora, lerHora, () => null);
  useEffect(() => {
    if (abertoEm === null) {
      abertoEm = Date.now();
      ouvintesHora.forEach((f) => f());
    }
    return () => {
      abertoEm = null;
    };
  }, []);
  const texto = t === null ? "\u00a0" : `${dataHoraExtensa(t)} (horário de Brasília)`;
  if (!reservar) return <>{texto}</>;
  return (
    <span style={{ display: "inline-grid" }}>
      <span aria-hidden="true" style={{ gridArea: "1 / 1", visibility: "hidden" }}>
        {MAIS_LARGA}
      </span>
      <span style={{ gridArea: "1 / 1" }}>{texto}</span>
    </span>
  );
}

/** Texto curto do lance usado na conta detalhada. */
function qualLance(r: ResultadoCompleto) {
  const q = r.detalhe?.qualLance;
  if (r.semDisputa) return q === "minimo" ? "preço pedido" : "o preço que você informou";
  return q === "minimo" ? "lance mínimo atual" : q === "teto" ? "seu lance máximo para a meta" : "seu lance";
}

function rotuloCenario(r: ResultadoCompleto, c: Cenario) {
  const p = r.modelo.premissas;
  if (c === "personalizado" && p.vendaPersonalizada?.modo === "valor") return moedaCurta(p.vendaPersonalizada.valor);
  return `${pct(multiplicador(p, c), 0)} · ${moedaCurta((p.valorVenda ?? 0) * multiplicador(p, c))}`;
}

// ---------------------------------------------------------------------------
// 02 Resultado da simulação
// ---------------------------------------------------------------------------

export function ResultadoSimulacao() {
  const r = useResultado();
  const { modelo, meta, celula, teto, semDividas } = r;
  const p = modelo.premissas;
  const e = modelo.entrada;

  if (!r.tabela || !r.detalhe || !r.comLanceMinimo) {
    return (
      <Secao numero="01" titulo="Resultado da simulação" id="resultado">
        <div className={s.resultado}>
          <div className={s.resultadoTopo}>
            <div>
              <p className={s.rotuloPequeno}>{r.semDisputa ? "Lucro pelo preço pedido" : "Lance máximo para a sua meta"}</p>
              <p className={s.tetoNenhum}>Falta o valor de venda</p>
              <p className={s.tetoFrase}>
                A fonte não informa a avaliação deste imóvel e não há referência de preço da região (ou falta a área). Sem um valor de venda não dá para
                calcular o retorno: informe por quanto acha que vende, no simulador da página do imóvel, e gere o relatório de novo.
              </p>
            </div>
            <dl className={s.escolha}>
              <div>
                <dt>{r.semDisputa ? "Preço pedido" : "Lance mínimo hoje"}</dt>
                <dd>{moeda(e.lance)}</dd>
              </div>
              <div>
                <dt>Meta</dt>
                <dd>{metaPorExtenso(meta)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Secao>
    );
  }

  const d = r.detalhe;
  const sim = d.sim;
  const venda = (p.valorVenda ?? 0) * multiplicador(p, celula.cenario);
  const folga = teto !== null ? teto - e.lance : null;
  const fin = sim.financiamento;
  const diferenca = Math.round(sim.lucro) - Math.round(sim.rendimentoAplicacao);
  const cenarioTexto = CENARIO_ROTULO[celula.cenario].toLowerCase();
  // "por R$ 300.000 (valor que você definiu)", e não "(R$ 300.000, valor que você definiu)" (a mesma frase da tela)
  const deOndeVenda = vendaDoCenarioCurta(modelo, celula.cenario);
  const fixo = r.semDisputa;
  const pal = palavrasPreco(e);
  const comPreco = r.comLanceMinimo;
  const atinge = atingeMeta(comPreco, meta);

  return (
    <Secao numero="01" titulo="Resultado da simulação" id="resultado">
      <div className={s.resultado}>
        <div className={s.resultadoTopo}>
          {fixo ? (
            // venda direta: preço fixo, sem disputa. A capa responde "vale a pena comprar por este preço?": o lucro pelo
            // preço pedido, se atinge a meta e a margem de segurança (nada de "lance máximo" nem "sobra até o teto")
            <div>
              <p className={s.rotuloPequeno}>{comPreco.lucro >= 0 ? "Lucro pelo preço pedido" : "Prejuízo pelo preço pedido"}</p>
              <p className={`${s.teto} ${comPreco.lucro < 0 ? s.negativo : ""}`}>{moeda(Math.abs(Math.round(comPreco.lucro)))}</p>
              <p className={s.tetoFrase}>
                Em <span className={s.forte}>{meses(celula.meses)}</span> ({pct(comPreco.roiAA)} ao ano), comprando por {moeda(e.lance)} e vendendo por{" "}
                {moeda(venda)} ({deOndeVenda}), no cenário {cenarioTexto}; {notaIr(p, true)}.
              </p>
              <p className={s.folga}>
                {atinge ? <IconeOk className={s.pos} /> : <IconeNao className={s.grave} />}
                <span>
                  {atinge ? "Atinge" : "Não atinge"} a sua meta (<span className={s.forte}>{metaPorExtenso(meta)}</span>).{" "}
                  {r.margem !== null ? (
                    <>
                      Margem de segurança: cabem mais <span className={s.forte}>{moeda(r.margem)}</span> de custos imprevistos e você ainda consegue{" "}
                      {metaComoObjetivo(meta)}
                      {semDividas ? " (sem as dívidas apontadas)" : ""}.
                    </>
                  ) : (
                    <>Mesmo sem imprevistos, a conta não chega à meta: tente outro prazo ou cenário.</>
                  )}
                </span>
              </p>
              {semDividas && (
                <p className={s.selosResultado}>
                  <Marca tom="alerta">Sem as dívidas apontadas</Marca>
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className={s.rotuloPequeno}>Lance máximo para a sua meta</p>
              {teto === null ? <p className={s.tetoNenhum}>Nenhum lance atinge a meta</p> : <p className={s.teto}>{moeda(teto)}</p>}
              <p className={s.tetoFrase}>
                Para <span className={s.forte}>{metaComoObjetivo(meta)}</span> vendendo em <span className={s.forte}>{meses(celula.meses)}</span> por{" "}
                {moeda(venda)} ({deOndeVenda}), no cenário {cenarioTexto}.
              </p>
              <p className={s.folga}>
                {folga === null ? (
                  <>
                    <IconeAtencao className={s.aten} />
                    <span>
                      Lance mínimo hoje: <span className={s.forte}>{moeda(e.lance)}</span>. Com essas premissas, nem o lance zero atinge a meta: tente outra meta,
                      prazo ou cenário.
                    </span>
                  </>
                ) : folga >= 0 ? (
                  <>
                    <IconeOk className={s.pos} />
                    <span>
                      Lance mínimo hoje: <span className={s.forte}>{moeda(e.lance)}</span>. Sobra <span className={s.forte}>{moeda(folga)}</span> até o seu teto
                      {semDividas ? " (sem as dívidas apontadas)" : ""}.
                    </span>
                  </>
                ) : (
                  <>
                    <IconeNao className={s.grave} />
                    <span>
                      Lance mínimo hoje: <span className={s.forte}>{moeda(e.lance)}</span>, <span className={s.forte}>{moeda(-folga)}</span> acima do seu teto:
                      pelo lance mínimo, a meta não é atingida.
                    </span>
                  </>
                )}
              </p>
              {semDividas && (
                <p className={s.selosResultado}>
                  <Marca tom="alerta">Sem as dívidas apontadas</Marca>
                </p>
              )}
            </div>
          )}
          <dl className={s.escolha}>
            <div>
              <dt>Meta</dt>
              <dd>{metaPorExtenso(meta)}</dd>
            </div>
            <div>
              <dt>Cenário de venda</dt>
              <dd>
                {CENARIO_ROTULO[celula.cenario]} · {vendaDoCenario(modelo, celula.cenario)}
              </dd>
            </div>
            {fixo && (
              <div>
                <dt>Preço pedido</dt>
                <dd>{moeda(e.lance)} (venda direta, sem disputa)</dd>
              </div>
            )}
            <div>
              <dt>Prazo de venda</dt>
              <dd>{meses(celula.meses)}</dd>
            </div>
            <div>
              <dt>Pagamento</dt>
              <dd>
                {fin
                  ? fin.tipo === "banco"
                    ? `financiado (entrada de ${moeda(fin.entrada)})`
                    : `parcelado na fonte (entrada de ${moeda(fin.entrada)})`
                  : "à vista"}
              </dd>
            </div>
            <div>
              <dt>Premissas</dt>
              <dd>
                {r.ajustes > 0 ? `${r.ajustes} ${r.ajustes === 1 ? "ajuste seu" : "ajustes seus"} (marcados nas tabelas)` : "padrão da Luneta (conservadoras)"}
              </dd>
            </div>
          </dl>
        </div>

        <p className={s.comLance}>
          Com o {pal.lance} de <span className={s.forte}>{moeda(sim.lance)}</span> ({qualLance(r)}), {escolhaPorExtenso(r)}:
        </p>
        <dl className={s.kpis}>
          <div className={s.kpi}>
            <dt>{sim.lucro >= 0 ? "Lucro total" : "Prejuízo total"}</dt>
            <dd className={sim.lucro < 0 ? s.negativo : undefined}>{moedaSinal(sim.lucro)}</dd>
            <dd className={s.kpiNota}>
              em {meses(sim.meses)}, {notaIr(p)}
            </dd>
          </div>
          <div className={s.kpi}>
            <dt>Lucro anualizado</dt>
            <dd className={sim.lucroAno < 0 ? s.negativo : undefined}>
              {moedaSinal(sim.lucroAno)}
              <small>/ano</small>
            </dd>
            {/* o R$/ano é média simples e o % ao ano, juros compostos: dividir um pelo outro não dá o % */}
            <dd className={s.kpiNota}>
              {sim.meses === 12 ? "igual ao total (12 meses)" : `média: lucro ÷ ${sim.meses} × 12`} · {pct(sim.roiAA)} ao ano em juros compostos
              {meta.tipo === "roi_aa" ? ` · meta ${pct(meta.valor)}` : ""}
            </dd>
          </div>
          <div className={s.kpi}>
            <dt>Retorno no período</dt>
            <dd className={sim.roi < 0 ? s.negativo : undefined}>{pct(sim.roi)}</dd>
            <dd className={s.kpiNota}>
              {pct(sim.roiAM, 2)} ao mês
              {meta.tipo === "roi_periodo" ? ` · meta ${pct(meta.valor)}` : meta.tipo === "roi_am" ? ` · meta ${pct(meta.valor, 2)}` : ""}
            </dd>
          </div>
          <div className={s.kpi}>
            <dt>Dinheiro necessário</dt>
            <dd>{moeda(sim.capital)}</dd>
            <dd className={s.kpiNota}>{fin ? "entrada, parcelas e custos" : `${pal.lance} e custos`}</dd>
          </div>
        </dl>
        {p.aplicacaoAA > 0 && (
          <p className={s.aplicacao}>
            Uma aplicação a {pct(p.aplicacaoAA)} ao ano renderia {moeda(sim.rendimentoAplicacao)} com o mesmo dinheiro no mesmo prazo:{" "}
            <span className={s.forte}>
              o imóvel rende {moeda(Math.abs(diferenca))} {diferenca >= 0 ? "a mais" : "a menos"}.
            </span>
          </p>
        )}
        <AntesDeDecidir r={r} />
      </div>
    </Secao>
  );
}

/** O que pesa na conta e precisa ser conferido: área estimada, dívidas sem valor, ocupação, linhas tiradas, lance fora do normal. */
function AntesDeDecidir({ r }: { r: ResultadoCompleto }) {
  const m = r.modelo;
  const p = m.premissas;
  const e = m.entrada;
  const itens: { chave: string; texto: string }[] = [];
  if (p.areaEstimada && (p.reformaModo === "m2" || p.condominio > 0))
    itens.push({
      chave: "area",
      texto: `A fonte não informa a ${m.perfil.rotuloArea}: as contas usam ${area(p.area)}, um tamanho típico. Confira no edital ou na matrícula.`,
    });
  if (r.semDividas)
    itens.push({
      chave: "dividas",
      texto: `A análise aponta ${juntar(m.dividasApontadas)}, e o valor não entrou na conta. Confira no edital quanto passa ao comprador.`,
    });
  if (m.ocupado && p.desocupacao > 0 && !p.desligados.includes("desocupacao"))
    itens.push({ chave: "ocupado", texto: `Imóvel ocupado: a conta inclui ${moeda(p.desocupacao)} para a desocupação, que pode levar meses.` });
  if (e.avaliacao !== null && e.avaliacao > 0 && e.lance > 3 * e.avaliacao)
    itens.push({
      chave: "fora",
      texto: "O lance mínimo passa de 3 vezes a avaliação: quase sempre é erro no anúncio (preço, área ou lote com vários imóveis). Confira no site da fonte.",
    });
  const retirados = nomesRetirados(p);
  if (retirados.length) itens.push({ chave: "retirados", texto: `Você tirou da conta: ${juntar(retirados)}.` });
  if (itens.length === 0) return null;
  return (
    <div className={s.atencao}>
      <p className={s.rotuloPequeno}>Antes de decidir</p>
      <ul>
        {itens.map((i) => (
          <li key={i.chave}>
            <IconeAtencao className={s.aten} />
            <span>{i.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 03 Cenários e prazos
// ---------------------------------------------------------------------------

export function MatrizRelatorio() {
  const r = useResultado();
  if (!r.tabela) {
    return (
      <Secao numero="02" titulo="Cenários e prazos" id="cenarios">
        <p className={s.p}>Sem um valor de venda, não há tabela de cenários. Informe a venda no simulador da página do imóvel.</p>
      </Secao>
    );
  }
  const { colunas, linhas, tabela, celula, meta } = r;
  const lance = r.modelo.entrada.lance;
  const fixo = r.semDisputa;
  const p = r.modelo.premissas;
  const escolhida = (c: Cenario, m: number) => c === celula.cenario && m === celula.meses;
  const cabeca = (
    <thead>
      <tr>
        <th scope="col">Cenário de venda</th>
        {colunas.map((m) => (
          <th key={m} scope="col" className={m === celula.meses ? s.colEscolhida : undefined}>
            {meses(m)}
            {m === r.colunaExtra && <small>seu prazo</small>}
          </th>
        ))}
      </tr>
    </thead>
  );
  const cabecaLinha = (c: Cenario) => (
    <th scope="row" className={s.cabecaCenario}>
      {CENARIO_ROTULO[c]}
      <small>{rotuloCenario(r, c)}</small>
    </th>
  );
  const dica = <p className={s.dicaRolagem}>Arraste a tabela para o lado para ver todos os prazos.</p>;

  // leilão: o lance máximo que atinge a meta em cada célula, comparado com o lance mínimo de hoje
  const tabelaTeto = (
    <>
      <div className={s.inteira}>
        <p className={s.tituloTabela} aria-hidden="true">
          Lance máximo para {metaComoObjetivo(meta)} <span>· comparado com o lance mínimo de hoje ({moeda(lance)})</span>
        </p>
        <div className={s.rolagem} tabIndex={0} role="region" aria-label="Lance máximo por cenário e prazo (tabela; role para o lado para ver todos os prazos)">
          <table className={`${s.tabela} ${s.matriz}`}>
            <caption className="sr-only">
              Lance máximo para {metaComoObjetivo(meta)}, comparado com o lance mínimo de hoje ({moeda(lance)})
            </caption>
            {cabeca}
            <tbody>
              {linhas.map((c, k) => (
                <tr key={c}>
                  {cabecaLinha(c)}
                  {tabela[k]!.map((cel) => {
                    const folga = cel.teto === null ? null : cel.teto - lance;
                    const ok = folga !== null && folga >= 0;
                    const classes = [escolhida(c, cel.meses) ? s.escolhida : "", ok ? "" : s.naoAtinge].filter(Boolean).join(" ") || undefined;
                    return (
                      <td key={cel.meses} className={classes} data-prazo={meses(cel.meses)}>
                        <strong>{cel.teto === null ? "nenhum" : moeda(cel.teto)}</strong>
                        <span>
                          {ok ? <IconeOk className={s.pos} /> : <IconeNao className={s.grave} />}
                          {folga === null ? "não atinge" : ok ? `sobra ${moedaCurta(folga)}` : `faltam ${moedaCurta(-folga)}`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dica}
      </div>
      <p className={s.legenda}>
        <span>
          <IconeOk className={s.pos} /> dá para cobrir o lance mínimo e atingir a meta
        </span>
        <span>
          <IconeNao className={s.grave} /> o lance mínimo já passa do teto (ou nenhum lance atinge)
        </span>
        <span>
          <i className={s.quadradoEscolhido} aria-hidden="true" /> sua escolha
        </span>
      </p>
    </>
  );

  // venda direta: o preço não sobe; a outra tabela é a margem para custos imprevistos mantendo a meta
  const tabelaMargem = (
    <>
      <div className={s.inteira}>
        <p className={s.tituloTabela} aria-hidden="true">
          Margem para custos imprevistos <span>· comprando por {moeda(lance)} e mantendo a meta ({metaPorExtenso(meta)})</span>
        </p>
        <div className={s.rolagem} tabIndex={0} role="region" aria-label="Margem para imprevistos por cenário e prazo (tabela; role para o lado para ver todos os prazos)">
          <table className={`${s.tabela} ${s.matriz}`}>
            <caption className="sr-only">
              Margem para custos imprevistos, comprando por {moeda(lance)} e mantendo a meta ({metaPorExtenso(meta)})
            </caption>
            {cabeca}
            <tbody>
              {linhas.map((c, k) => (
                <tr key={c}>
                  {cabecaLinha(c)}
                  {tabela[k]!.map((cel) => {
                    const m = cel.margem ?? null;
                    const classes = [escolhida(c, cel.meses) ? s.escolhida : "", m !== null ? "" : s.naoAtinge].filter(Boolean).join(" ") || undefined;
                    return (
                      <td key={cel.meses} className={classes} data-prazo={meses(cel.meses)}>
                        <strong>{m === null ? "nenhuma" : moeda(m)}</strong>
                        <span>
                          {m !== null ? <IconeOk className={s.pos} /> : <IconeNao className={s.grave} />}
                          {m !== null ? "de folga" : "não atinge"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dica}
      </div>
      <p className={s.legenda}>
        <span>
          <IconeOk className={s.pos} /> atinge a meta; o número é quanto de custo imprevisto ainda cabe
        </span>
        <span>
          <IconeNao className={s.grave} /> não atinge a meta, nem sem imprevistos
        </span>
        <span>
          <i className={s.quadradoEscolhido} aria-hidden="true" /> sua escolha
        </span>
      </p>
    </>
  );

  const doLance = fixo
    ? r.meuLance === lance
      ? "o preço pedido"
      : "o preço que você informou"
    : r.meuLance === lance
      ? "o lance mínimo de hoje"
      : "o seu lance";
  const tabelaLucro = (
    <>
      <div className={s.inteira}>
        <p className={s.tituloTabela} aria-hidden="true">
          Lucro e retorno ao ano {fixo ? "comprando por" : "com o lance de"} {moeda(r.meuLance)} <span>· {doLance}</span>
        </p>
        <div className={s.rolagem} tabIndex={0} role="region" aria-label="Lucro e retorno por cenário e prazo (tabela; role para o lado para ver todos os prazos)">
          <table className={`${s.tabela} ${s.matriz}`}>
            <caption className="sr-only">
              Lucro e retorno ao ano {fixo ? "comprando por" : "com o lance de"} {moeda(r.meuLance)} ({doLance})
            </caption>
            {cabeca}
            <tbody>
              {linhas.map((c, k) => (
                <tr key={c}>
                  {cabecaLinha(c)}
                  {tabela[k]!.map((cel) => {
                    const sim = cel.comMeuLance;
                    const ok = atingeMeta(sim, meta);
                    const classes = [escolhida(c, cel.meses) ? s.escolhida : "", ok ? "" : s.naoAtinge].filter(Boolean).join(" ") || undefined;
                    return (
                      <td key={cel.meses} className={classes} data-prazo={meses(cel.meses)}>
                        <strong className={sim.lucro < 0 ? s.negativo : undefined}>{moedaSinal(sim.lucro)}</strong>
                        <span>
                          {ok ? <IconeOk className={s.pos} /> : <IconeNao className={s.grave} />}
                          {pct(sim.roiAA, 0)} ao ano
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dica}
      </div>
      <p className={s.legenda}>
        <span>
          <IconeOk className={s.pos} /> atinge a meta ({metaPorExtenso(meta)})
        </span>
        <span>
          <IconeNao className={s.grave} /> não atinge
        </span>
        <span>
          Lucro {notaIr(p, true)}; retorno ao ano por juros compostos.
        </span>
      </p>
    </>
  );

  return (
    <Secao
      numero="02"
      titulo="Cenários e prazos"
      id="cenarios"
      descricao={
        <>
          Cada linha é um cenário de venda (por quanto você vende) e cada coluna, em quanto tempo vende. Os percentuais são sobre o valor de referência para a
          venda ({moeda(p.valorVenda ?? 0)}). A célula marcada é a do resultado da capa.
          {fixo ? " Venda direta: o preço é fixo (sem disputa), então a tabela mostra o lucro por esse preço e quanto de imprevisto ainda cabe." : ""}
        </>
      }
    >
      {fixo ? tabelaLucro : tabelaTeto}
      <div style={{ marginTop: "1.6em" }}>{fixo ? tabelaMargem : tabelaLucro}</div>
    </Secao>
  );
}

// ---------------------------------------------------------------------------
// 04 Detalhamento de custos
// ---------------------------------------------------------------------------

const GRUPOS: GrupoConta[] = ["venda", "compra", "depois", "mensal"];

export function CustosRelatorio() {
  const r = useResultado();
  const d = r.detalhe;
  if (!d) {
    return (
      <Secao numero="03" titulo="Detalhamento de custos" id="custos">
        <p className={s.p}>Sem um valor de venda, não há conta para detalhar.</p>
      </Secao>
    );
  }
  const sim = d.sim;
  const p = r.modelo.premissas;
  const fin = sim.financiamento;
  const pos = posicoesCascata(d.etapas);
  const valores = pos.flatMap((x) => [x.de, x.ate, 0]);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min || 1;
  const ajustadas = d.conta.filter((l) => l.ajustada).length;

  return (
    <Secao
      numero="03"
      titulo="Detalhamento de custos"
      id="custos"
      descricao={
        <>
          Com o {palavrasPreco(r.modelo.entrada).lance} de <span className={s.forte}>{moeda(sim.lance)}</span> ({qualLance(r)}), {escolhaPorExtenso(r)}. Todas
          as linhas da conta, com o cálculo
          de cada uma{ajustadas > 0 ? "; as que você mudou estão marcadas" : ""}.
        </>
      }
    >
      <p className={s.subtitulo}>Da venda ao {sim.lucro >= 0 ? "lucro" : "prejuízo"}</p>
      <div className={s.cascata} role="list">
        {pos.map(({ etapa, de, ate }) => {
          const esquerda = ((Math.min(de, ate) - min) / faixa) * 100;
          const largura = (Math.abs(ate - de) / faixa) * 100;
          const tipo = etapa.chave === "venda" ? "venda" : etapa.total ? (etapa.valor >= 0 ? "lucro" : "prejuizo") : "custo";
          return (
            <div key={etapa.chave} role="listitem" className={s.cascataLinha} data-total={etapa.total ? "" : undefined}>
              <span className={s.cascataRotulo}>{etapa.rotulo}</span>
              <span className={s.cascataTrilho} aria-hidden="true">
                <span className={s.cascataBarra} data-tipo={tipo} style={{ left: `${esquerda}%`, width: `${largura}%` }} />
              </span>
              <span className={s.cascataValor}>
                {moedaSinal(etapa.valor)}
                {sim.venda > 0 && etapa.chave !== "venda" ? <small className={s.cascataPct}> · {pct(Math.abs(etapa.valor) / sim.venda, 0)}</small> : null}
              </span>
            </div>
          );
        })}
      </div>
      <p className={s.pequeno}>Cada barra parte de onde a anterior terminou; o percentual é sobre o valor da venda.</p>

      <p className={s.subtitulo}>A conta, linha a linha</p>
      <table className={s.conta}>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className={s.calculo}>
              Como foi calculado
            </th>
            <th scope="col" className={s.marcaCol}>
              <span className="sr-only">Mudou?</span>
            </th>
            <th scope="col" className={s.valor}>
              Valor
            </th>
          </tr>
        </thead>
        {GRUPOS.map((g) => {
          const linhas = d.conta.filter((l) => l.grupo === g);
          if (!linhas.length) return null;
          const subtotal = linhas.reduce((t, l) => t + l.valor, 0);
          return (
            <tbody key={g}>
              <tr className={s.grupo}>
                <th scope="colgroup" colSpan={3}>
                  {GRUPO_ROTULO[g]}
                  {g === "mensal" ? ` · ${meses(sim.meses)}` : ""}
                </th>
                <td className={s.valor}>{g === "venda" ? `fica ${moedaSinal(subtotal)}` : moedaSinal(subtotal)}</td>
              </tr>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <th scope="row" className={s.item}>
                    {l.rotulo}
                    <span className={s.formulaMovel}>
                      {l.formula}
                      {/* o custo criado já diz "(custo criado por você)" na fórmula */}
                      {l.ajustada && l.editor !== "extra" && <> · ajustado</>}
                    </span>
                  </th>
                  <td className={s.calculo}>{l.formula}</td>
                  <td className={s.marcaCol}>{l.ajustada && <Marca>{l.editor === "extra" ? "Criado por você" : "Ajustado"}</Marca>}</td>
                  <td className={s.valor}>{moedaSinal(l.valor)}</td>
                </tr>
              ))}
            </tbody>
          );
        })}
        <tbody>
          {(
            [
              {
                rotulo: sim.lucro >= 0 ? "Lucro total" : "Prejuízo total",
                detalhe: `venda menos todos os custos, ${notaIr(p, true)}`,
                valor: moedaSinal(sim.lucro),
                forte: true,
                negativo: sim.lucro < 0,
              },
              {
                rotulo: "Lucro anualizado",
                detalhe:
                  sim.meses === 12
                    ? `venda em 12 meses: igual ao lucro total (${pct(sim.roiAA)} ao ano)`
                    : `média por ano: lucro total × 12 ÷ ${sim.meses} meses; ${pct(sim.roiAA)} ao ano, por juros compostos`,
                valor: `${moedaSinal(sim.lucroAno)}/ano`,
                negativo: sim.lucroAno < 0,
              },
              {
                rotulo: "Dinheiro investido",
                detalhe: fin
                  ? "entrada + parcelas pagas + custos (sem o saldo quitado na venda)"
                  : `${palavrasPreco(r.modelo.entrada).lance} + custos de compra, regularização, reforma e meses`,
                valor: moeda(sim.capital),
              },
              { rotulo: "Retorno no período", detalhe: `lucro ÷ dinheiro investido (${pct(sim.roiAM, 2)} ao mês)`, valor: pct(sim.roi), negativo: sim.roi < 0 },
            ] as { rotulo: string; detalhe: string; valor: string; forte?: boolean; negativo?: boolean }[]
          ).map((t) => (
            <tr key={t.rotulo} className={`${s.total} ${t.forte ? s.totalForte : ""}`}>
              <th scope="row" className={s.item}>
                {t.rotulo}
                <span className={s.formulaMovel}>{t.detalhe}</span>
              </th>
              <td className={s.calculo}>{t.detalhe}</td>
              <td className={s.marcaCol} />
              <td className={`${s.valor} ${t.negativo ? s.negativo : ""}`}>{t.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {d.retiradas.length > 0 && (
        <div className={s.fora}>
          <p className={s.forte}>Fora da conta: você tirou {d.retiradas.length === 1 ? "esta linha" : `estas ${d.retiradas.length} linhas`}</p>
          <ul>
            {d.retiradas.map((l) => (
              <li key={l.id}>
                <span>
                  <s>{l.rotulo}</s> <Marca tom="neutra">Retirado</Marca>
                </span>
                <span>seria {moedaSinal(l.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fin && (
        <p className={s.aplicacao} style={{ margin: "1em 0 0" }}>
          <span className={s.forte}>{fin.tipo === "banco" ? "Financiamento (tabela SAC). " : "Parcelamento da fonte. "}</span>
          {fin.tipo === "banco"
            ? `Entrada de ${moeda(fin.entrada)} e ${moeda(fin.financiado)} financiados a ${pct(p.jurosAA)} ao ano (${pct(fin.taxaMensal, 2)} ao mês). Primeira parcela: ${moeda(fin.primeiraParcela)}. Até a venda: ${fin.parcelasPagas} parcelas, ${moeda(fin.totalParcelas)} pagos (${moeda(fin.jurosPagos)} de juros). Saldo quitado com a venda: ${moeda(fin.saldoDevedor)}.`
            : `Entrada de ${moeda(fin.entrada)} e ${moeda(fin.financiado)} em ${fin.prazo} parcelas mensais corrigidas a ${pct(p.parcelasCorrecaoAA)} ao ano (estimativa do índice). Primeira parcela: ${moeda(fin.primeiraParcela)}. Até a venda: ${fin.parcelasPagas} parcelas, ${moeda(fin.totalParcelas)} pagos. Saldo quitado com a venda, já corrigido: ${moeda(fin.saldoDevedor)}.`}
        </p>
      )}
    </Secao>
  );
}

// ---------------------------------------------------------------------------
// 05 Premissas usadas
// ---------------------------------------------------------------------------

export function PremissasRelatorio() {
  const { r, plano } = useRelatorio();
  const grupos = premissasUsadas(r, plano);
  const comPadrao = grupos.some((g) => g.linhas.some((l) => l.padrao !== null || l.criada || l.retirada));
  return (
    <Secao
      numero="04"
      titulo="Premissas usadas"
      id="premissas"
      descricao={
        comPadrao ? (
          <>Os padrões da Luneta são conservadores e genéricos (não são de nenhuma cidade). Onde você mudou alguma coisa, o padrão aparece ao lado.</>
        ) : (
          <>Todas as premissas estão no padrão da Luneta: conservadoras e genéricas (não são de nenhuma cidade). Confira os custos locais.</>
        )
      }
    >
      <table className={`${s.tabela} ${s.premissas}`}>
        <thead>
          <tr>
            <th scope="col" style={{ width: "28%" }}>
              Premissa
            </th>
            <th scope="col">Valor usado</th>
            {comPadrao && <th scope="col">Padrão da Luneta</th>}
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={g.titulo}>
            <tr className={s.grupo}>
              <th scope="colgroup" colSpan={comPadrao ? 3 : 2}>
                {g.titulo}
              </th>
            </tr>
            {g.linhas.map((l) => (
              <tr key={l.rotulo}>
                <th scope="row">{l.rotulo}</th>
                <td>
                  {l.valor} {l.criada ? <Marca>Criado por você</Marca> : l.padrao !== null ? <Marca>Ajustado</Marca> : null}{" "}
                  {l.retirada && <Marca tom="neutra">Retirado da conta</Marca>}
                </td>
                {comPadrao && <td className={s.padrao}>{l.criada ? "não existe no padrão" : (l.padrao ?? "—")}</td>}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <p className={s.pequeno}>
        <IconeInfo className={`${s.iconeLinha} ${s.info}`} /> Custos e impostos variam por cidade e por edital: confira o ITBI e o registro na prefeitura e no
        cartório, a comissão e as dívidas no edital, e o imposto de renda com um contador.
      </p>
    </Secao>
  );
}
