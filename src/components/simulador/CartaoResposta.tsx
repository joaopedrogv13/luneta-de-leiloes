"use client";

import { useRef, useState } from "react";
import { useMidia } from "@/components/catalogo/app/hooks";
import { atingeMeta } from "@/lib/simulador/calculo";
import type { ResultadoCompleto } from "@/lib/simulador/completa";
import { juntar, meses, moeda, moedaCurta, moedaCurtaSinal, moedaSinal, pct, redondo } from "@/lib/simulador/formato";
import { LIMITES, multiplicador } from "@/lib/simulador/premissas";
import { CENARIO_ROTULO, converterMeta, metaComoObjetivo, metaPorExtenso, PERIODO_META, vendaDoCenarioCurta } from "@/lib/simulador/textos";
import { TODOS_CENARIOS, type Celula, type Cenario, type Meta, type TipoMeta, type VendaPersonalizada } from "@/lib/simulador/tipos";
import { CampoNumero, CampoPedido, Chip, FOCO_RESULTADO, IconeAtencao, IconeInfo, IconeLapis, IconeOk, Segmentado } from "./controles";
import { Janela } from "./Janela";

export { CENARIO_ROTULO };

/** Atalhos de prazo de venda (meses). */
const PRAZOS_RAPIDOS = [3, 6, 9, 12, 18, 24, 36];

type Modo = "dinheiro" | "pct";
type Periodo = Exclude<TipoMeta, "lucro">;

const igualMeta = (a: Meta, b: Meta) => a.tipo === b.tipo && Math.abs(a.valor - b.valor) < 1e-9;

/** Celular (abaixo de md): as três perguntas viram linhas compactas que abrem uma folha com os atalhos. */
const CONSULTA_CELULAR = "(max-width: 767.98px)";

/**
 * Cartão "Seu lance máximo": a resposta grande ("Dê no máximo R$ X") e, em frases curtas, só o que importa
 * (lance mínimo × teto, o resultado pelo lance mínimo e o dinheiro necessário). Embaixo, a meta escolhida do
 * jeito mais fácil: quanto quer ganhar em reais ou quanto quer render em % (no total, ao ano ou ao mês), com
 * atalhos prontos; em quanto tempo vende; e por quanto vende (cenário). Quando a análise aponta dívidas que
 * passam ao comprador e a pessoa ainda não disse quanto são, o número sai marcado "sem as dívidas" e o pedido
 * do valor fica ali mesmo. Na venda direta (preço fixo, sem disputa), a resposta se inverte: o número grande é o
 * lucro pelo preço pedido, com o veredito da meta e a margem de segurança (quanto de custo imprevisto ainda cabe).
 */
export function CartaoResposta({
  r,
  aoMudarMeta,
  aoMudarCelula,
  aoDefinirPersonalizado,
  aoInformarDividas,
}: {
  r: ResultadoCompleto;
  aoMudarMeta: (m: Meta) => void;
  aoMudarCelula: (c: Celula) => void;
  aoDefinirPersonalizado: (v: VendaPersonalizada) => void;
  /** a pessoa informou o valor das dívidas apontadas (0 = conferiu e não há) */
  aoInformarDividas: (valor: number) => void;
}) {
  const { modelo, meta, celula, teto, semDividas } = r;
  const p = modelo.premissas;
  const lance = modelo.entrada.lance;
  const sim = r.comLanceMinimo!;
  const venda = (p.valorVenda ?? 0) * multiplicador(p, celula.cenario);
  const folga = teto !== null ? teto - lance : null;
  // celular: as perguntas viram linhas que abrem uma folha (os controles existem num lugar só de cada vez)
  const celular = useMidia(CONSULTA_CELULAR, false);

  const cenarioTexto = celula.cenario === "personalizado" ? "personalizado" : CENARIO_ROTULO[celula.cenario].toLowerCase();
  const fixo = r.semDisputa;
  const atinge = atingeMeta(sim, meta);
  const resumo = fixo
    ? `Comprando por ${moeda(lance)} e vendendo em ${meses(celula.meses)} no cenário ${cenarioTexto}: ${sim.lucro >= 0 ? "lucro" : "prejuízo"} de ${moeda(Math.abs(Math.round(sim.lucro)))} (${pct(sim.roiAA)} ao ano). ` +
      (r.margem !== null
        ? `Atinge a meta de ${metaComoObjetivo(meta)}, com margem de ${moeda(r.margem)} para custos imprevistos.`
        : `Não atinge a meta de ${metaComoObjetivo(meta)}.`) +
      (semDividas ? " Sem contar as dívidas apontadas." : "")
    : teto === null
      ? `Nenhum lance atinge a meta de ${metaComoObjetivo(meta)} vendendo em ${meses(celula.meses)} no cenário ${cenarioTexto}.`
      : `Dê no máximo ${moeda(teto)} para ${metaComoObjetivo(meta)} vendendo em ${meses(celula.meses)} no cenário ${cenarioTexto}. ` +
        (folga! >= 0 ? `Sobra ${moeda(folga!)} entre o lance mínimo e o seu teto.` : `O lance mínimo passa ${moeda(-folga!)} do seu teto.`) +
        (semDividas ? " Sem contar as dívidas apontadas." : "");

  return (
    // overflow-clip (e não hidden): corta o brilho do canto sem virar área de rolagem, e a resposta pode colar (sticky)
    <div className="@container relative overflow-clip rounded-3xl border border-latao/45 bg-tinta in-data-[theme=light]:shadow-[0_1px_2px_rgba(15,24,48,.05),0_12px_32px_rgba(15,24,48,.07)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-[radial-gradient(closest-side,rgba(201,162,77,.18),transparent)]"
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {resumo}
      </p>

      {/* Cartão largo (resumo da direita recolhido, 1.024 px ou mais de cartão): as perguntas à esquerda e a resposta
          colada à direita, à vista enquanto a pessoa mexe (antes, os controles se espalhavam por 1.200 px e a
          resposta ficava longe). A coluna da resposta vira o contêiner das medidas de dentro dela. */}
      <div className="@5xl:grid @5xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* ------------------------------------------------------------------ a resposta */}
        <div className="relative p-5 sm:p-7 @5xl:sticky @5xl:top-[136px] @5xl:col-start-2 @5xl:row-start-1 @5xl:self-start @5xl:[container-type:inline-size]">
          {fixo ? (
            <RespostaPrecoFixo r={r} venda={venda} atinge={atinge} />
          ) : (
            <div className="grid gap-x-8 gap-y-5 @2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] @2xl:items-end">
              <div className="min-w-0">
                <p id={FOCO_RESULTADO} tabIndex={-1} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 outline-none">
                  <span className="text-[13px] font-semibold tracking-[0.12em] text-nevoa uppercase">Seu lance máximo</span>
                  {semDividas && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-aten/55 bg-aten/12 px-2 py-0.5 text-[11.5px] leading-tight font-semibold text-luar">
                      <IconeAtencao className="size-3 text-aten" />
                      sem as dívidas
                    </span>
                  )}
                </p>
                {teto === null ? (
                  <p className="mt-3 font-display text-[28px] leading-[1.05] font-bold tracking-[-0.02em] text-nevoa sm:text-[34px]">Nenhum lance atinge a meta</p>
                ) : (
                  <>
                    <p className="mt-3 text-[15px] font-medium text-nevoa">Dê no máximo</p>
                    <p
                      className="mt-1 font-display leading-none font-bold tracking-[-0.035em] tabular-nums [--max:46px] sm:[--max:60px]"
                      // o número encolhe para caber na largura do cartão ("R$ 17.638.267" num celular de 320 px)
                      style={{ fontSize: `min(var(--max), ${(100 / (moeda(teto).length * 0.6)).toFixed(2)}cqi)` }}
                    >
                      {moeda(teto)}
                    </p>
                  </>
                )}
                <p className="mt-3 text-[14px] leading-relaxed text-nevoa">
                  para <strong className="font-semibold text-luar">{metaComoObjetivo(meta)}</strong> vendendo em{" "}
                  <strong className="font-semibold text-luar">{meses(celula.meses)}</strong>, por {moeda(venda)} ({vendaDoCenarioCurta(modelo, celula.cenario)}).
                </p>
              </div>

              <ul className="flex min-w-0 flex-col gap-2.5 text-[14px] leading-snug @2xl:rounded-2xl @2xl:border @2xl:border-nevoa/15 @2xl:bg-noite/50 @2xl:p-4">
                <li className="flex gap-2.5">
                  {teto === null ? (
                    <>
                      <IconeAtencao className="mt-0.5 text-aten" />
                      <span>
                        Lance mínimo hoje: <strong className="font-semibold tabular-nums">{moeda(lance)}</strong>
                        <span className="text-nevoa"> · tente uma meta menor, outro prazo ou outro cenário</span>
                      </span>
                    </>
                  ) : folga! >= 0 ? (
                    <>
                      {semDividas ? <IconeInfo className="mt-0.5 text-nevoa" /> : <IconeOk className="mt-1 size-3.5 text-pos" />}
                      <span>
                        Lance mínimo hoje: <strong className="font-semibold tabular-nums">{moeda(lance)}</strong>
                        <span className="text-nevoa"> · </span>
                        sobra <strong className="font-semibold tabular-nums">{moeda(folga!)}</strong> até o seu teto
                        {semDividas && <span className="text-nevoa"> (sem as dívidas)</span>}
                      </span>
                    </>
                  ) : (
                    <>
                      <IconeAtencao className="mt-0.5 text-aten" />
                      <span>
                        Lance mínimo hoje: <strong className="font-semibold tabular-nums">{moeda(lance)}</strong>
                        <span className="text-nevoa"> · </span>
                        <strong className="font-semibold tabular-nums">{moeda(-folga!)}</strong> acima do seu teto: não atinge a meta
                      </span>
                    </>
                  )}
                </li>
                <li className="flex gap-2.5">
                  <Ponto />
                  <span>
                    Pelo lance mínimo:{" "}
                    <strong className={`font-semibold tabular-nums ${sim.lucro < 0 ? "text-grave-texto" : ""}`}>
                      {sim.lucro >= 0 ? "lucro" : "prejuízo"} de {moedaCurtaSinal(Math.abs(sim.lucro))}
                    </strong>{" "}
                    em {meses(celula.meses)} <span className="whitespace-nowrap text-nevoa tabular-nums">({pct(sim.roiAA, 0)} ao ano)</span>
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Ponto />
                  <span>
                    Dinheiro que você precisa: <strong className="font-semibold tabular-nums">{moedaCurta(sim.capital)}</strong>
                    {sim.financiamento && <span className="text-nevoa"> (entrada, parcelas e custos)</span>}
                  </span>
                </li>
              </ul>
            </div>
          )}

          {!fixo && <Regua lance={lance} teto={teto} pendente={semDividas} />}

          {semDividas && (
            <div className={`rounded-2xl border border-aten/45 bg-aten/10 p-3.5 sm:p-4 ${fixo ? "mt-5" : "mt-1"}`}>
              <p className="flex gap-2.5 text-sm leading-relaxed sm:text-[13.5px]">
                <IconeAtencao className="mt-0.5 text-aten" />
                <span>
                  <strong className="font-semibold">Falta o valor das dívidas.</strong> A análise aponta {juntar(modelo.dividasApontadas)}. Informe quanto passa a
                  você (está no edital); se não houver, informe 0.
                </span>
              </p>
              <CampoPedido
                placeholder="valor das dívidas"
                prefixo="R$"
                min={0}
                max={LIMITES.dividas[1]}
                ariaLabel="Valor das dívidas que passam ao comprador"
                aoConfirmar={aoInformarDividas}
                className="mt-3 pl-[26px]"
                larguraCampo="w-full sm:w-52"
              />
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ a meta */}
        <div className="relative border-t border-nevoa/15 bg-noite/35 p-5 sm:px-7 sm:py-6 max-md:px-4 max-md:py-4 @5xl:col-start-1 @5xl:row-start-1 @5xl:border-t-0 @5xl:border-r">
          <PerguntasCompactas r={r} aoMudarMeta={aoMudarMeta} aoMudarCelula={aoMudarCelula} aoDefinirPersonalizado={aoDefinirPersonalizado} className="md:hidden" />
          {/* computador e tablet (e o HTML do servidor, escondido no celular): as perguntas abertas */}
          {!celular && (
            <div className="max-md:hidden">
              <div className="grid gap-6 @3xl:grid-cols-2 @3xl:gap-x-8">
                <EscolhaMeta r={r} aoMudarMeta={aoMudarMeta} className="@3xl:col-span-2" />
                <EscolhaPrazo meses={celula.meses} aoMudar={(m) => aoMudarCelula({ ...celula, meses: m })} />
                <EscolhaCenario r={r} aoMudar={(c) => aoMudarCelula({ ...celula, cenario: c })} aoDefinirPersonalizado={aoDefinirPersonalizado} />
              </div>

              {/* no tablet estreito a resposta já saiu da tela: repete aqui, curta */}
              <p className="mt-5 flex items-baseline justify-between gap-3 rounded-2xl border border-latao/40 bg-tinta px-4 py-3 @2xl:hidden" aria-hidden="true">
                <span className="text-[13px] text-nevoa">{fixo ? (sim.lucro >= 0 ? "Lucro pelo preço pedido" : "Prejuízo pelo preço pedido") : "Seu lance máximo"}</span>
                <span className={`font-display text-[20px] font-bold tabular-nums ${fixo && sim.lucro < 0 ? "text-grave-texto" : ""}`}>
                  {fixo ? moedaSinal(sim.lucro) : teto === null ? "nenhum" : moeda(teto)}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A resposta em uma linha (o rodapé das folhas do celular): "Seu lance máximo: R$ X" ou o lucro pelo preço pedido. */
function RespostaCurta({ r }: { r: ResultadoCompleto }) {
  const sim = r.comLanceMinimo!;
  const fixo = r.semDisputa;
  return (
    <p className="min-w-0 flex-1" aria-live="polite">
      <span className="block text-[12px] leading-tight text-nevoa">{fixo ? (sim.lucro >= 0 ? "Lucro pelo preço pedido" : "Prejuízo pelo preço pedido") : "Seu lance máximo"}</span>
      <span className={`block font-display text-[19px] leading-tight font-bold tabular-nums ${fixo && sim.lucro < 0 ? "text-grave-texto" : ""}`}>
        {fixo ? moedaSinal(sim.lucro) : r.teto === null ? "nenhum lance atinge" : moeda(r.teto)}
      </span>
    </p>
  );
}

type Pergunta = "meta" | "prazo" | "cenario";

/**
 * Celular: "Quanto quer ganhar? 20% ao ano ✎", "Em quanto tempo vende? 12 meses ✎" e "Por quanto vende? Base ✎".
 * Cada linha abre uma folha (Janela) com os mesmos controles do computador (9 metas, 8 prazos, 4 cenários) e, no
 * rodapé, a resposta atualizada na hora e "Pronto". Abertas no cartão, as três perguntas ocupavam ~2 telas.
 */
function PerguntasCompactas({
  r,
  aoMudarMeta,
  aoMudarCelula,
  aoDefinirPersonalizado,
  className = "",
}: {
  r: ResultadoCompleto;
  aoMudarMeta: (m: Meta) => void;
  aoMudarCelula: (c: Celula) => void;
  aoDefinirPersonalizado: (v: VendaPersonalizada) => void;
  className?: string;
}) {
  const [aberta, setAberta] = useState<Pergunta | null>(null);
  const { meta, celula, modelo } = r;
  const p = modelo.premissas;
  const ref = p.valorVenda ?? 0;
  const vp = p.vendaPersonalizada;
  const cenario =
    celula.cenario === "personalizado" && vp
      ? `${CENARIO_ROTULO.personalizado} · ${vp.modo === "valor" ? moedaCurta(vp.valor) : pct(vp.valor, 0)}`
      : `${CENARIO_ROTULO[celula.cenario]} · ${pct(multiplicador(p, celula.cenario), 0)} · ${moedaCurta(ref * multiplicador(p, celula.cenario))}`;
  const linhas: { id: Pergunta; pergunta: string; valor: string }[] = [
    { id: "meta", pergunta: "Quanto você quer ganhar?", valor: metaPorExtenso(meta) },
    { id: "prazo", pergunta: "Em quanto tempo você vende?", valor: meses(celula.meses) },
    { id: "cenario", pergunta: "Por quanto você vende?", valor: cenario },
  ];
  const titulo = linhas.find((l) => l.id === aberta)?.pergunta ?? "";
  return (
    <div className={className}>
      <ul className="flex flex-col gap-2">
        {linhas.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setAberta(l.id)}
              className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-nevoa/20 bg-tinta px-4 py-2.5 text-left transition-colors duration-150 hover:border-latao active:bg-latao/[0.06]"
            >
              <span className="min-w-0">
                <span className="block text-[13px] leading-tight text-nevoa">{l.pergunta}</span>{" "}
                <span className="mt-1 block text-[16px] leading-tight font-semibold text-luar tabular-nums">{l.valor}</span>
              </span>
              <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-nevoa/30 text-latao-texto">
                <IconeLapis className="size-3.5" />
              </span>
              <span className="sr-only">: alterar</span>
            </button>
          </li>
        ))}
      </ul>
      {aberta && (
        <Janela
          titulo={titulo}
          sobretitulo="Simulador"
          onFechar={() => setAberta(null)}
          rodape={
            <div className="flex items-center gap-3">
              <RespostaCurta r={r} />
              <button type="button" onClick={() => setAberta(null)} className="btn-primary min-h-11! shrink-0 px-6!">
                Pronto
              </button>
            </div>
          }
        >
          {aberta === "meta" && <EscolhaMeta r={r} aoMudarMeta={aoMudarMeta} semLegenda />}
          {aberta === "prazo" && <EscolhaPrazo meses={celula.meses} aoMudar={(m) => aoMudarCelula({ ...celula, meses: m })} semLegenda />}
          {aberta === "cenario" && (
            <EscolhaCenario r={r} aoMudar={(c) => aoMudarCelula({ ...celula, cenario: c })} aoDefinirPersonalizado={aoDefinirPersonalizado} semLegenda />
          )}
        </Janela>
      )}
    </div>
  );
}

/** "Quanto você quer ganhar?": em reais ou em % (no total, ao ano, ao mês), com atalhos prontos. */
function EscolhaMeta({
  r,
  aoMudarMeta,
  className = "",
  semLegenda = false,
}: {
  r: ResultadoCompleto;
  aoMudarMeta: (m: Meta) => void;
  className?: string;
  /** na folha do celular o título já pergunta */
  semLegenda?: boolean;
}) {
  const { modelo, meta, celula } = r;
  const p = modelo.premissas;
  const referencia = p.valorVenda ?? modelo.entrada.lance;
  // a última meta de cada modo volta quando a pessoa alterna entre "em dinheiro" e "em %"
  const ultimo = useRef<{ dinheiro: Meta | null; pct: Meta | null }>({ dinheiro: null, pct: null });
  const modo: Modo = meta.tipo === "lucro" ? "dinheiro" : "pct";
  const trocarModo = (m: Modo) => {
    if (m === modo) return;
    ultimo.current[modo] = meta;
    aoMudarMeta(ultimo.current[m] ?? (m === "dinheiro" ? { tipo: "lucro", valor: Math.max(5_000, redondo(referencia * 0.2)) } : { tipo: "roi_aa", valor: 0.2 }));
  };

  const lucro1 = Math.max(1_000, redondo(referencia * 0.1));
  const lucro2 = Math.max(2_000, redondo(referencia * 0.2));
  const atalhos: { rotulo: string; detalhe?: string; meta: Meta }[] = [
    ...(p.aplicacaoAA > 0 ? [{ rotulo: "Empatar com a aplicação", detalhe: `${pct(p.aplicacaoAA)} ao ano`, meta: { tipo: "roi_aa" as const, valor: p.aplicacaoAA } }] : []),
    { rotulo: "15% ao ano", meta: { tipo: "roi_aa", valor: 0.15 } },
    { rotulo: "20% ao ano", meta: { tipo: "roi_aa", valor: 0.2 } },
    { rotulo: "1% ao mês", meta: { tipo: "roi_am", valor: 0.01 } },
    { rotulo: "50% no total", meta: { tipo: "roi_periodo", valor: 0.5 } },
    { rotulo: `Lucro de ${moedaCurta(lucro1)}`, meta: { tipo: "lucro", valor: lucro1 } },
    ...(lucro2 !== lucro1 ? [{ rotulo: `Lucro de ${moedaCurta(lucro2)}`, meta: { tipo: "lucro" as const, valor: lucro2 } }] : []),
  ];

  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className={semLegenda ? "sr-only" : "text-[15px] font-semibold"}>Quanto você quer ganhar?</legend>
      <div className="mt-3 flex flex-col gap-3 @lg:flex-row @lg:items-center">
        <Segmentado<Modo>
          nome="sim-meta-modo"
          legenda="Como medir a meta"
          valor={modo}
          aoMudar={trocarModo}
          tamanho="sm"
          className="@lg:w-72 @lg:shrink-0"
          opcoes={[
            { valor: "dinheiro", rotulo: "Quero ganhar R$" },
            { valor: "pct", rotulo: "Quero render %" },
          ]}
        />
        {modo === "dinheiro" ? (
          <div className="flex items-center gap-2.5">
            <CampoNumero
              id="sim-meta-valor"
              valor={meta.valor}
              prefixo="R$"
              min={0}
              max={LIMITES.metaLucro[1]}
              passo={1000}
              ariaLabel="Lucro que você quer, em reais"
              aoMudar={(n) => aoMudarMeta({ tipo: "lucro", valor: n })}
              className="w-44"
            />
            <span className="text-[14px] text-nevoa">de lucro</span>
          </div>
        ) : (
          // cresce até o fim da linha: preso na largura mínima, o seletor quebrava "no total" e "ao mês" em duas linhas
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <CampoNumero
              id="sim-meta-valor"
              valor={Math.round(meta.valor * 10_000) / 100}
              casas={2}
              sufixo="%"
              min={0}
              max={1000}
              passo={meta.tipo === "roi_am" ? 0.1 : 1}
              ariaLabel={`Rendimento que você quer, em % ${PERIODO_META[meta.tipo as Periodo]}`}
              aoMudar={(n) => aoMudarMeta({ tipo: meta.tipo, valor: n / 100 })}
              className="w-24"
            />
            <Segmentado<Periodo>
              nome="sim-meta-periodo"
              legenda="Período do rendimento"
              valor={meta.tipo as Periodo}
              aoMudar={(per) => aoMudarMeta(converterMeta(meta, per, celula.meses))}
              tamanho="sm"
              className="min-w-[12rem] flex-1"
              opcoes={[
                { valor: "roi_periodo", rotulo: <span className="whitespace-nowrap">no total</span> },
                { valor: "roi_aa", rotulo: <span className="whitespace-nowrap">ao ano</span> },
                { valor: "roi_am", rotulo: <span className="whitespace-nowrap">ao mês</span> },
              ]}
            />
          </div>
        )}
      </div>
      {modo === "pct" && (
        <p className="mt-2 text-sm leading-relaxed text-nevoa sm:text-[12.5px]">
          {meta.tipo === "roi_periodo"
            ? `“No total”: o quanto o dinheiro cresce do lance até a venda, em ${meses(celula.meses)}.`
            : meta.tipo === "roi_aa"
              ? "“Ao ano”: para comparar com uma aplicação (a poupança, um CDB). Trocar o período converte o número para o mesmo rendimento."
              : "“Ao mês”: o rendimento equivalente por mês, com juros compostos."}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Metas prontas">
        {atalhos.map((a) => (
          <Chip key={a.rotulo} ativo={igualMeta(meta, a.meta)} detalhe={a.detalhe} onClick={() => aoMudarMeta(a.meta)}>
            {a.rotulo}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Venda direta (preço fixo, sem disputa): "Vale a pena comprar por R$ X?". O número grande é o lucro (ou o
 * prejuízo) pelo preço pedido; ao lado, se atinge a meta, a margem de segurança (o custo imprevisto que ainda
 * cabe mantendo a meta) e o dinheiro necessário. Nada de "lance máximo" nem "sobra até o teto": o preço não sobe.
 */
function RespostaPrecoFixo({ r, venda, atinge }: { r: ResultadoCompleto; venda: number; atinge: boolean }) {
  const { modelo, meta, celula, semDividas, margem } = r;
  const sim = r.comLanceMinimo!;
  const preco = modelo.entrada.lance;
  const lucro = Math.round(sim.lucro);
  return (
    <div className="grid gap-x-8 gap-y-5 @2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] @2xl:items-end">
      <div className="min-w-0">
        <p id={FOCO_RESULTADO} tabIndex={-1} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 outline-none">
          <span className="text-[13px] font-semibold tracking-[0.12em] text-nevoa uppercase">Comprando pelo preço pedido</span>
          {semDividas && (
            <span className="inline-flex items-center gap-1 rounded-full border border-aten/55 bg-aten/12 px-2 py-0.5 text-[11.5px] leading-tight font-semibold text-luar">
              <IconeAtencao className="size-3 text-aten" />
              sem as dívidas
            </span>
          )}
        </p>
        <p className="mt-3 text-[15px] font-medium text-nevoa">{lucro >= 0 ? "Lucro de" : "Prejuízo de"}</p>
        <p
          className={`mt-1 font-display leading-none font-bold tracking-[-0.035em] tabular-nums [--max:46px] sm:[--max:60px] ${lucro < 0 ? "text-grave-texto" : ""}`}
          // o número encolhe para caber na largura do cartão (como o lance máximo)
          style={{ fontSize: `min(var(--max), ${(100 / (moeda(Math.abs(lucro)).length * 0.6)).toFixed(2)}cqi)` }}
        >
          {moeda(Math.abs(lucro))}
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-nevoa">
          em <strong className="font-semibold text-luar">{meses(celula.meses)}</strong>
          <span className="whitespace-nowrap">
            {" "}
            · <strong className={`font-semibold tabular-nums ${sim.roiAA < 0 ? "text-grave-texto" : "text-luar"}`}>{pct(sim.roiAA)} ao ano</strong>
          </span>
          , comprando por {moeda(preco)} e vendendo por {moeda(venda)} ({vendaDoCenarioCurta(modelo, celula.cenario)}).
        </p>
      </div>

      <ul className="flex min-w-0 flex-col gap-2.5 text-[14px] leading-snug @2xl:rounded-2xl @2xl:border @2xl:border-nevoa/15 @2xl:bg-noite/50 @2xl:p-4">
        <li className="flex gap-2.5">
          {atinge ? (
            semDividas ? (
              <IconeInfo className="mt-0.5 text-nevoa" />
            ) : (
              <IconeOk className="mt-1 size-3.5 text-pos" />
            )
          ) : (
            <IconeAtencao className="mt-0.5 text-aten" />
          )}
          <span>
            {atinge ? "Atinge" : "Não atinge"} a sua meta: <strong className="font-semibold">{metaPorExtenso(meta)}</strong>
            {semDividas && atinge && <span className="text-nevoa"> (sem as dívidas)</span>}
            {!atinge && <span className="text-nevoa"> · tente outro prazo ou cenário, ou uma meta menor</span>}
          </span>
        </li>
        <li className="flex gap-2.5">
          <Ponto />
          <span>
            {margem !== null ? (
              <>
                Margem de segurança: <strong className="font-semibold tabular-nums">{moeda(margem)}</strong>
                <span className="text-nevoa">
                  {" "}
                  · com custos imprevistos até esse valor (reforma maior, dívida, outro gasto), você ainda consegue {metaComoObjetivo(meta)}
                </span>
              </>
            ) : (
              <>
                Margem de segurança: <strong className="font-semibold">nenhuma</strong>
                <span className="text-nevoa"> · mesmo sem imprevistos, a conta não chega à meta</span>
              </>
            )}
          </span>
        </li>
        <li className="flex gap-2.5">
          <Ponto />
          <span>
            Dinheiro que você precisa: <strong className="font-semibold tabular-nums">{moedaCurta(sim.capital)}</strong>
            {sim.financiamento && <span className="text-nevoa"> (entrada, parcelas e custos)</span>}
          </span>
        </li>
      </ul>
    </div>
  );
}

function Ponto() {
  return <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-nevoa/60 mx-[3px]" />;
}

/** "Em quanto tempo você vende?": atalhos de 3 a 36 meses e "outro" (3 a 60). */
function EscolhaPrazo({ meses: m, aoMudar, semLegenda = false }: { meses: number; aoMudar: (m: number) => void; semLegenda?: boolean }) {
  const [outroAberto, setOutroAberto] = useState(false);
  const outro = outroAberto || !PRAZOS_RAPIDOS.includes(m);
  return (
    <fieldset className="min-w-0">
      <legend className={semLegenda ? "sr-only" : "text-[15px] font-semibold"}>Em quanto tempo você vende?</legend>
      <p className="mt-0.5 text-sm text-nevoa sm:text-[12.5px]">Meses da compra até a venda. Imóvel ocupado ou com reforma costuma levar mais.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRAZOS_RAPIDOS.map((n) => (
          <Chip
            key={n}
            ativo={!outro && m === n}
            ariaLabel={meses(n)}
            onClick={() => {
              setOutroAberto(false);
              aoMudar(n);
            }}
          >
            {n}
            <span className="sr-only"> meses</span>
          </Chip>
        ))}
        <Chip
          ativo={outro}
          onClick={() => {
            setOutroAberto(true);
            // o campo aparece agora: o foco vai para ele, com o número selecionado (digitar já troca o prazo)
            requestAnimationFrame(() => {
              const campo = document.getElementById("sim-prazo-outro");
              if (campo instanceof HTMLInputElement) {
                campo.focus();
                campo.select();
              }
            });
          }}
        >
          Outro
        </Chip>
        {outro && (
          <CampoNumero
            id="sim-prazo-outro"
            valor={m}
            min={LIMITES.prazo[0]}
            max={LIMITES.prazo[1]}
            passo={1}
            sufixo="meses"
            ariaLabel="Prazo de venda em meses (3 a 60)"
            aoMudar={(n) => aoMudar(Math.round(n))}
            className="w-32"
          />
        )}
      </div>
    </fieldset>
  );
}

/** "Por quanto você vende?": os três cenários e o personalizado (R$ ou % do valor de referência). */
function EscolhaCenario({
  r,
  aoMudar,
  aoDefinirPersonalizado,
  semLegenda = false,
}: {
  r: ResultadoCompleto;
  aoMudar: (c: Cenario) => void;
  aoDefinirPersonalizado: (v: VendaPersonalizada) => void;
  semLegenda?: boolean;
}) {
  const { modelo, celula } = r;
  const p = modelo.premissas;
  const ref = p.valorVenda ?? 0;
  const vp = p.vendaPersonalizada;
  const escolher = (c: Cenario) => {
    if (c === "personalizado" && !vp) aoDefinirPersonalizado({ modo: "valor", valor: Math.round(ref / 1000) * 1000 || ref });
    aoMudar(c);
  };
  return (
    <fieldset className="min-w-0">
      <legend className={semLegenda ? "sr-only" : "text-[15px] font-semibold"}>Por quanto você vende?</legend>
      <p className="mt-0.5 text-sm text-nevoa sm:text-[12.5px]">
        Cenários sobre {modelo.origemVenda.tipo === "referencia" ? "a referência da região" : modelo.origemVenda.tipo === "avaliacao" ? "a avaliação" : "o valor que você informou"} (
        {moeda(ref)}).
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {TODOS_CENARIOS.map((c) => {
          const ativo = celula.cenario === c;
          const definido = c !== "personalizado" || !!vp;
          return (
            <label
              key={c}
              className={`relative flex min-h-14 cursor-pointer flex-col justify-center rounded-2xl border px-3 py-2 transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-latao-texto motion-reduce:transition-none ${
                ativo ? "border-latao bg-latao/15" : "border-nevoa/25 hover:border-nevoa/55"
              }`}
            >
              <input
                type="radio"
                name="sim-cenario-cartao"
                value={c}
                checked={ativo}
                onChange={() => escolher(c)}
                className="absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-2xl opacity-0"
              />
              <span className="flex items-center gap-1.5 text-[14px] leading-tight font-semibold">
                {ativo && <IconeOk className="text-latao-texto" />}
                {CENARIO_ROTULO[c]}
              </span>
              <span className="mt-0.5 text-[12px] leading-tight text-nevoa tabular-nums">
                {definido ? `${pct(multiplicador(p, c), 0)} · ${moedaCurta(ref * multiplicador(p, c))}` : "você define o valor"}
              </span>
            </label>
          );
        })}
      </div>
      {celula.cenario === "personalizado" && vp && <EditorPersonalizado vp={vp} referencia={ref} aoMudar={aoDefinirPersonalizado} />}
    </fieldset>
  );
}

/** Venda do cenário personalizado: em reais ou em % do valor de referência. */
export function EditorPersonalizado({
  vp,
  referencia,
  aoMudar,
  className = "mt-3",
}: {
  vp: VendaPersonalizada;
  referencia: number;
  aoMudar: (v: VendaPersonalizada) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2.5 rounded-2xl border border-nevoa/20 bg-tinta p-3 ${className}`}>
      <span className="text-[13.5px] font-medium">Vender por</span>
      <Segmentado<"valor" | "pct">
        nome="sim-personalizado-modo"
        legenda="Valor de venda personalizado em reais ou em %"
        valor={vp.modo}
        tamanho="sm"
        className="w-28"
        aoMudar={(m) => {
          if (m === vp.modo || !(referencia > 0)) return;
          aoMudar(m === "pct" ? { modo: "pct", valor: Math.round((vp.valor / referencia) * 1000) / 1000 } : { modo: "valor", valor: Math.round(vp.valor * referencia) });
        }}
        opcoes={[
          { valor: "valor", rotulo: "R$" },
          { valor: "pct", rotulo: "%" },
        ]}
      />
      {vp.modo === "valor" ? (
        <CampoNumero
          valor={vp.valor}
          prefixo="R$"
          min={LIMITES.valorVenda[0]}
          max={LIMITES.valorVenda[1]}
          passo={1000}
          ariaLabel="Valor de venda do cenário personalizado, em reais"
          aoMudar={(n) => aoMudar({ modo: "valor", valor: n })}
          className="w-44"
        />
      ) : (
        <CampoNumero
          valor={Math.round(vp.valor * 1000) / 10}
          casas={1}
          sufixo="%"
          min={LIMITES.vendaPersonalizadaPct[0] * 100}
          max={LIMITES.vendaPersonalizadaPct[1] * 100}
          passo={5}
          ariaLabel="Valor de venda do cenário personalizado, em % do valor de referência"
          aoMudar={(n) => aoMudar({ modo: "pct", valor: Math.round(n * 10) / 1000 })}
          className="w-28"
        />
      )}
      <span className="text-[12.5px] text-nevoa tabular-nums">
        {vp.modo === "valor" && referencia > 0 ? `= ${pct(vp.valor / referencia, 0)} da referência` : vp.modo === "pct" ? `= ${moeda(vp.valor * referencia)}` : ""}
      </span>
    </div>
  );
}

/** Régua 0 → lance máximo, com o lance mínimo marcado: a folga (ou o excesso) aparece entre os dois. Só visual (o texto ao lado diz o mesmo). */
function Regua({ lance, teto, pendente }: { lance: number; teto: number | null; pendente: boolean }) {
  const max = Math.max(lance, teto ?? 0) * 1.15 || 1;
  const pos = (v: number) => Math.min(100, Math.max(0, (v / max) * 100));
  const alinhar = (p: number) => (p > 72 ? "-translate-x-full text-right" : p < 18 ? "" : "-translate-x-1/2 text-center");
  const pl = pos(lance);
  const pt = teto !== null ? pos(teto) : null;
  // rótulos que ficariam um em cima do outro: o do lance mínimo desce, o do teto sobe (já é assim) e nada se cruza
  return (
    <div aria-hidden="true" className="relative mt-9 mb-7 select-none">
      {pt !== null && (
        <div className={`absolute bottom-full mb-2 text-[11.5px] leading-tight whitespace-nowrap ${alinhar(pt)}`} style={{ left: `${pt}%` }}>
          <span className="font-semibold text-latao-texto">Seu teto</span> <span className="tabular-nums">{moedaCurta(teto!)}</span>
        </div>
      )}
      <div className="relative h-2.5 rounded-full bg-nevoa/20">
        {pt !== null && <div className="absolute inset-y-0 left-0 rounded-full bg-latao/30" style={{ width: `${pt}%` }} />}
        {/* a folga só fica verde quando a conta está completa (com dívidas apontadas sem valor, fica neutra) */}
        {pt !== null && lance <= teto! && (
          <div className={`absolute inset-y-0 rounded-r-full ${pendente ? "bg-nevoa/45" : "bg-pos/60"}`} style={{ left: `${pl}%`, width: `${pt - pl}%` }} />
        )}
        {pt !== null && lance > teto! && (
          <div
            className="absolute inset-y-0 rounded-r-full bg-[repeating-linear-gradient(135deg,var(--grave)_0_3px,transparent_3px_6px)] opacity-80"
            style={{ left: `${pt}%`, width: `${pl - pt}%` }}
          />
        )}
        {pt !== null && <div className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-latao" style={{ left: `${pt}%` }} />}
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-tinta bg-luar shadow-[0_0_0_1px_rgba(var(--fog-rgb),.5)]"
          style={{ left: `${pl}%` }}
        />
      </div>
      <div className={`absolute top-full mt-2 text-[11.5px] leading-tight whitespace-nowrap ${alinhar(pl)}`} style={{ left: `${pl}%` }}>
        <span className="font-semibold">Lance mínimo</span> <span className="text-nevoa tabular-nums">{moedaCurta(lance)}</span>
      </div>
    </div>
  );
}
