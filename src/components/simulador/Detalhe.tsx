"use client";

import { useState, type ReactNode } from "react";
import { posicoesCascata, type Etapa } from "@/lib/simulador/calculo";
import type { ResultadoCompleto } from "@/lib/simulador/completa";
import { GRUPO_ROTULO, type GrupoConta, type LinhaConta } from "@/lib/simulador/conta";
import type { EstadoSimulador } from "@/lib/simulador/estado";
import { meses, moeda, moedaSinal, pct } from "@/lib/simulador/formato";
import { LIMITES, multiplicador, PADRAO } from "@/lib/simulador/premissas";
import { CENARIO_ROTULO, notaIr, palavrasPreco } from "@/lib/simulador/textos";
import { TODOS_CENARIOS, type Ajustes, type CenarioFixo, type LinhaDesligavel } from "@/lib/simulador/tipos";
import { BotaoEditar, CampoNumero, focar, IconeLapis, IconeMais, IconeOlhoFechado, IconeVoltar, Segmentado } from "./controles";
import type { AbaSimulador } from "./AbasSimulador";
import type { AlvoEditor } from "./Editores";

const CHAVE_CENARIO: Record<CenarioFixo, "cenarioConservador" | "cenarioBase" | "cenarioOtimista"> = {
  conservador: "cenarioConservador",
  base: "cenarioBase",
  otimista: "cenarioOtimista",
};

export const ID_DETALHE = "sim-detalhe-titulo";

/**
 * Detalhe da célula escolhida, o lugar único de ajuste: no topo, cenário, % da venda, prazo e lance editáveis;
 * os números-resumo (lucro total e anualizado); a comparação com uma aplicação; a cascata da venda ao lucro; e
 * a conta linha a linha. A conta abre limpa (rodada 5, decisão 7): os controles de edição ficam atrás do botão
 * "Editar a conta" (com ajustes salvos, "Conta ajustada · ver ajustes"). Aberta, cada linha tem um lápis discreto
 * que abre o pop-up daquele tipo de despesa; dá para tirar e religar linhas, criar custos ("+ Adicionar custo") e
 * restaurar tudo.
 * Até lg, as abas do simulador escolhem a parte: "Conta" (os ajustes, os números e a conta linha a linha) ou
 * "Gráfico" (a cascata); no computador, tudo aparece.
 */
export function Detalhe({
  r,
  aoEditar,
  atualizar,
  aba = "conta",
}: {
  r: ResultadoCompleto;
  aoEditar: (alvo: AlvoEditor, quem: HTMLElement | null) => void;
  atualizar: (mudar: (e: EstadoSimulador) => EstadoSimulador) => void;
  /** a aba aberta no celular e no tablet */
  aba?: AbaSimulador;
}) {
  const d = r.detalhe!;
  const sim = d.sim;
  const p = r.modelo.premissas;
  const fin = sim.financiamento;
  const [desfazer, setDesfazer] = useState<EstadoSimulador["ajustes"] | null>(null);
  // a conta abre limpa; "Editar a conta" mostra os lápis, o "Adicionar custo", o que está fora da conta e o
  // "Restaurar tudo". Fica aberta enquanto a pessoa estiver na página (o pop-up de um lápis devolve o foco a ele).
  const [editando, setEditando] = useState(false);
  const ajustada = r.ajustes > 0;
  // a diferença sai dos dois números já arredondados que a frase mostra
  const diferenca = Math.round(sim.lucro) - Math.round(sim.rendimentoAplicacao);
  const pal = palavrasPreco(r.modelo.entrada);
  const fixo = pal.fixo;
  const qual = d.qualLance === "minimo" ? (fixo ? "preço pedido" : "lance mínimo atual") : d.qualLance === "teto" ? "seu lance máximo para a meta" : fixo ? "seu preço" : "seu lance";
  const editar = (alvo: AlvoEditor) => (ev: { currentTarget: HTMLElement }) => aoEditar(alvo, ev.currentTarget);

  const religar = (linha: LinhaDesligavel) =>
    atualizar((e) => {
      const desligados = (e.ajustes.desligados ?? []).filter((x) => x !== linha);
      const a: Ajustes = { ...e.ajustes, desligados };
      if (!desligados.length) delete a.desligados;
      return { ...e, ajustes: a };
    });

  const grupos: GrupoConta[] = ["venda", "compra", "depois", "mensal"];
  // até lg, cada aba mostra a sua parte
  const soConta = aba === "grafico" ? "max-lg:hidden" : "";
  const soGrafico = aba === "grafico" ? "" : "max-lg:hidden";

  return (
    <section
      aria-labelledby={ID_DETALHE}
      className="rounded-3xl border border-nevoa/20 bg-tinta p-4 sm:p-6 in-data-[theme=light]:shadow-[0_1px_2px_rgba(15,24,48,.05)]"
    >
      <div className="min-w-0">
        <p className="text-[12px] font-semibold tracking-[0.12em] text-nevoa uppercase">
          Detalhe · cenário {CENARIO_ROTULO[sim.cenario].toLowerCase()}, venda em {meses(sim.meses)}
        </p>
        <h3 id={ID_DETALHE} tabIndex={-1} className="mt-1.5 font-display text-[19px] leading-tight font-bold tracking-[-0.01em] outline-none sm:text-[21px]">
          Com o {pal.lance} de {moeda(sim.lance)} <span className="font-sans text-[14px] font-medium tracking-normal text-nevoa sm:text-[15px]">({qual})</span>
        </h3>
      </div>

      {/* ------------------------------------------------------------ cenário, % da venda, prazo e lance */}
      <div className={soConta}>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-nevoa/15 bg-noite/50 p-3 sm:grid-cols-[1.1fr_1fr_0.9fr] sm:p-4">
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <label htmlFor="sim-det-cenario" className="mb-1 block text-[12px] font-medium text-nevoa">
              Cenário de venda
            </label>
            <select
              id="sim-det-cenario"
              value={sim.cenario}
              onChange={(e) => {
                const c = e.target.value as (typeof TODOS_CENARIOS)[number];
                atualizar((x) => {
                  if (c === "personalizado" && !x.ajustes.vendaPersonalizada) {
                    const v = Math.round((p.valorVenda ?? 0) / 1000) * 1000 || 1;
                    return { ...x, ajustes: { ...x.ajustes, vendaPersonalizada: { modo: "valor", valor: v } }, celula: { ...x.celula, cenario: c } };
                  }
                  return { ...x, celula: { ...x.celula, cenario: c } };
                });
              }}
              // 16 px no toque: o Safari do iPhone não amplia a página ao focar
              className="h-11 w-full cursor-pointer rounded-xl border border-nevoa/30 bg-noite px-3 text-base font-medium text-luar hover:border-nevoa/50 focus-visible:border-latao-texto pointer-fine:h-10 pointer-fine:text-[15px]"
            >
              {TODOS_CENARIOS.map((c) => (
                <option key={c} value={c} className="bg-tinta">
                  {CENARIO_ROTULO[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="sim-det-venda" className="mb-1 block text-[12px] font-medium text-nevoa">
              {sim.cenario === "personalizado" && p.vendaPersonalizada?.modo === "valor" ? "Valor da venda" : "% da venda"}
            </label>
            <PctVenda r={r} atualizar={atualizar} />
            <p className="mt-1 text-[11.5px] leading-tight text-nevoa tabular-nums">= {moeda(sim.venda)}</p>
          </div>
          <div className="min-w-0">
            <label htmlFor="sim-det-prazo" className="mb-1 block text-[12px] font-medium text-nevoa">
              Prazo de venda
            </label>
            <CampoNumero
              id="sim-det-prazo"
              valor={sim.meses}
              min={LIMITES.prazo[0]}
              max={LIMITES.prazo[1]}
              passo={1}
              sufixo="meses"
              aoMudar={(n) => atualizar((x) => ({ ...x, celula: { ...x.celula, meses: Math.round(n) } }))}
              className="w-full"
            />
            <p className="mt-1 text-[11.5px] leading-tight text-nevoa">3 a 60 meses</p>
          </div>
          <div className="col-span-2 min-w-0 sm:col-span-3">
            <p aria-hidden="true" className="mb-1 text-[12px] font-medium text-nevoa">{pal.Lance} usado na conta</p>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              {fixo && d.qualLance === "minimo" ? (
                // venda direta: só há o preço pedido (o preço não sobe); outro valor, para comparar, pelo lápis ao lado
                <p className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border border-nevoa/25 bg-noite px-3.5 text-[13px] pointer-fine:min-h-9">
                  <span className="font-semibold">Preço pedido</span>
                  <span className="font-semibold tabular-nums">{moeda(r.modelo.entrada.lance)}</span>
                </p>
              ) : (
                <Segmentado<"minimo" | "teto" | "meu">
                  nome="sim-det-lance"
                  legenda={`${pal.Lance} usado na conta`}
                  legendaVisivel={false}
                  valor={d.qualLance}
                  tamanho="sm"
                  className="w-full min-w-0 flex-1"
                  aoMudar={(v) => {
                    if (v === "meu") return;
                    atualizar((x) => (v === "teto" ? { ...x, lanceDetalhe: "teto" } : { ...x, meuLance: null, lanceDetalhe: "meu" }));
                  }}
                  opcoes={[
                    { valor: "minimo", rotulo: pal.Minimo, detalhe: moeda(r.modelo.entrada.lance) },
                    ...(!fixo && r.teto !== null ? [{ valor: "teto" as const, rotulo: "Seu teto", detalhe: moeda(r.teto) }] : []),
                    ...(d.qualLance === "meu" ? [{ valor: "meu" as const, rotulo: fixo ? "Seu preço" : "Seu lance", detalhe: moeda(sim.lance) }] : []),
                  ]}
                />
              )}
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={editar({ editor: "lance" })}
                className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 self-start rounded-full px-2 text-[12.5px] font-semibold text-latao-texto underline-offset-4 hover:underline sm:self-auto pointer-fine:min-h-9"
              >
                <IconeLapis className="size-3" />
                outro {pal.lance} e forma de pagamento
              </button>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------ números-resumo */}
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Destaque
            rotulo={sim.lucro >= 0 ? "Lucro total" : "Prejuízo total"}
            valor={moedaSinal(sim.lucro)}
            tom={sim.lucro < 0 ? "grave" : "forte"}
            nota={`em ${meses(sim.meses)}, ${notaIr(p)}`}
          />
          {/* o R$/ano é a média simples (lucro ÷ meses × 12) e o % ao ano conta juros compostos: dividir um pelo outro
              não dá o %, então a nota diz como cada um foi feito */}
          <Destaque
            rotulo="Lucro anualizado"
            valor={`${moedaSinal(sim.lucroAno)}`}
            sufixo="/ano"
            tom={sim.lucroAno < 0 ? "grave" : undefined}
            nota={
              <>
                <span className="block">{sim.meses === 12 ? "venda em 12 meses: igual ao total" : `média: lucro ÷ ${sim.meses} × 12`}</span>
                <span className="mt-0.5 block">
                  <strong className={`font-semibold ${sim.roiAA < 0 ? "text-grave-texto" : "text-luar"}`}>{pct(sim.roiAA)} ao ano</strong> em juros compostos
                  {r.meta.tipo === "roi_aa" ? ` · meta ${pct(r.meta.valor)}` : ""}
                </span>
              </>
            }
          />
          <Destaque
            rotulo={`Retorno em ${meses(sim.meses)}`}
            valor={pct(sim.roi)}
            tom={sim.roi < 0 ? "grave" : undefined}
            nota={`${pct(sim.roiAM, 2)} ao mês${r.meta.tipo === "roi_periodo" ? ` · meta ${pct(r.meta.valor)}` : ""}`}
          />
          <Destaque rotulo="Dinheiro investido" valor={moeda(sim.capital)} nota={fin ? "entrada, parcelas e custos" : `${pal.lance} e custos`} />
        </dl>

        {p.aplicacaoAA > 0 ? (
          <div className="group mt-3 flex items-start gap-2 rounded-xl bg-noite/60 py-2.5 pr-1.5 pl-3 text-sm leading-relaxed sm:text-[13px]">
            <p className="min-w-0 flex-1">
              <span className="text-nevoa">
                Uma aplicação a {pct(p.aplicacaoAA)} ao ano renderia {moeda(sim.rendimentoAplicacao)} com o mesmo dinheiro no mesmo prazo:{" "}
              </span>
              <strong className="font-semibold">
                o imóvel rende {moeda(Math.abs(diferenca))} {diferenca >= 0 ? "a mais" : "a menos"}.
              </strong>
            </p>
            <BotaoEditar rotulo="Editar a aplicação de comparação" onClick={editar({ editor: "aplicacao" })} destaque={p.aplicacaoAA !== PADRAO.aplicacaoAA} sempreVisivel={p.aplicacaoAA !== PADRAO.aplicacaoAA} />
          </div>
        ) : (
          <button type="button" onClick={editar({ editor: "aplicacao" })} className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-[12.5px] font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8">
            <IconeMais />
            Comparar com uma aplicação
          </button>
        )}

      </div>

      {/* ------------------------------------------------------------ cascata */}
      <div className={soGrafico}>
        <h4 className="mt-6 text-[14px] font-semibold max-lg:text-[16px]">Da venda ao {sim.lucro >= 0 ? "lucro" : "prejuízo"}</h4>
        <p className="mt-0.5 text-sm text-nevoa sm:text-[12.5px]">Cada barra parte de onde a anterior terminou; o percentual é sobre o valor da venda.</p>
        <Cascata etapas={d.etapas} venda={sim.venda} />
      </div>

      {/* ------------------------------------------------------------ a conta, linha a linha */}
      <div className={soConta}>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h4 id="sim-conta-titulo" className="text-[16px] font-semibold">
            A conta, linha a linha
          </h4>
          <BotaoEditarConta editando={editando} ajustada={ajustada} aoAlternar={() => setEditando((v) => !v)} />
        </div>
        {editando && (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-sm text-nevoa sm:text-[12.5px]">
              <span className="pointer-fine:hidden">Toque no lápis de uma linha para ajustar aquele custo.</span>
              <span className="hidden pointer-fine:inline">Clique no lápis de uma linha para ajustar aquele custo.</span>
            </p>
            <button
              id="sim-restaurar-tudo"
              type="button"
              disabled={r.ajustes === 0}
              onClick={() => {
                setDesfazer(r.estado.ajustes);
                atualizar((e) => ({ ...e, ajustes: {} }));
                requestAnimationFrame(() => focar("sim-desfazer"));
              }}
              className="-my-1 inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 px-1 text-[12.5px] font-semibold text-latao-texto underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-nevoa disabled:no-underline pointer-fine:min-h-8"
            >
              <IconeVoltar />
              Restaurar tudo{r.ajustes > 0 ? ` (${r.ajustes})` : ""}
            </button>
          </div>
        )}
        <p role="status" className="mt-1 text-[13px] empty:hidden">
          {/* some quando a pessoa volta a ajustar (ou fecha a edição): desfazer, aí, apagaria o que ela acabou de fazer */}
          {editando && desfazer && r.ajustes === 0 && (
            <>
              Tudo de volta ao padrão.{" "}
              <button
                id="sim-desfazer"
                type="button"
                onClick={() => {
                  const anterior = desfazer;
                  setDesfazer(null);
                  atualizar((e) => ({ ...e, ajustes: anterior }));
                  requestAnimationFrame(() => focar("sim-restaurar-tudo"));
                }}
                className="-my-2 inline-flex min-h-11 cursor-pointer items-center font-semibold text-latao-texto underline underline-offset-4 pointer-fine:min-h-8"
              >
                Desfazer
              </button>
            </>
          )}
        </p>
        <div id="sim-conta" className="mt-2 rounded-2xl border border-nevoa/15">
          {grupos.map((g) => {
            const linhas = d.conta.filter((l) => l.grupo === g);
            if (!linhas.length) return null;
            const subtotal = linhas.reduce((t, l) => t + l.valor, 0);
            return (
              <section key={g} aria-label={GRUPO_ROTULO[g]} className="border-t border-nevoa/15 first:border-t-0">
                {/* o subtotal fica na mesma coluna dos valores das linhas (à esquerda do lápis) */}
                <div
                  className={`flex items-baseline justify-between gap-3 bg-noite/40 py-2 pl-3 sm:pl-4 first:rounded-t-2xl ${
                    editando ? "pr-[58px] pointer-fine:pr-[46px]" : "pr-3 sm:pr-4"
                  }`}
                >
                  <h5 className="text-[12px] font-semibold tracking-[0.1em] text-nevoa uppercase">
                    {GRUPO_ROTULO[g]}
                    {g === "mensal" ? ` · ${meses(sim.meses)}` : ""}
                  </h5>
                  <span className="text-[12.5px] font-semibold text-nevoa tabular-nums">{g === "venda" ? `fica ${moedaSinal(subtotal)}` : moedaSinal(subtotal)}</span>
                </div>
                <ul>
                  {linhas.map((l) => (
                    <LinhaDaConta
                      key={l.id}
                      l={l}
                      onEditar={editando ? editar(l.editor === "extra" ? { editor: "extra", extraId: l.extraId } : { editor: l.editor }) : null}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
          <dl className="border-t-2 border-nevoa/30">
            <Total
              comLapis={editando}
              rotulo={sim.lucro >= 0 ? "Lucro total" : "Prejuízo total"}
              detalhe={`venda menos todos os custos, ${notaIr(p)}`}
              valor={moedaSinal(sim.lucro)}
              forte
              grave={sim.lucro < 0}
            />
            <Total
              comLapis={editando}
              rotulo="Lucro anualizado"
              detalhe={sim.meses === 12 ? "venda em 12 meses: igual ao lucro total" : `média por ano: lucro total × 12 ÷ ${sim.meses} meses; o % ao ano conta juros compostos`}
              valor={`${moedaSinal(sim.lucroAno)}/ano`}
              extra={`${pct(sim.roiAA)} ao ano`}
            />
            <Total
              comLapis={editando}
              rotulo="Dinheiro investido"
              detalhe={fin ? "entrada + parcelas pagas + custos (sem o saldo quitado na venda)" : `${pal.lance} + custos de compra, regularização, reforma e meses`}
              valor={moeda(sim.capital)}
            />
            <Total comLapis={editando} rotulo="Retorno no período" detalhe="lucro ÷ dinheiro investido" valor={pct(sim.roi)} />
          </dl>
        </div>

        {/* fechada: uma linha discreta diz que há custos fora da conta (a lista e o "Religar" ficam na edição) */}
        {!editando && d.retiradas.length > 0 && (
          <p className="mt-2 flex items-start gap-2 px-1 text-sm leading-relaxed text-nevoa sm:text-[12.5px]">
            <IconeOlhoFechado className="mt-0.5 shrink-0 text-nevoa" />
            <span>
              {d.retiradas.length === 1 ? "1 custo fora da conta" : `${d.retiradas.length} custos fora da conta`}:{" "}
              {d.retiradas.map((l) => l.rotulo.toLowerCase()).join(", ")}.
            </span>
          </p>
        )}

        {editando && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={editar({ editor: "novo" })}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-dashed border-latao/60 px-4 text-[13.5px] font-semibold text-latao-texto transition-colors hover:border-latao hover:bg-latao/10 pointer-fine:min-h-10"
              >
                <IconeMais />
                Adicionar custo
              </button>
              {r.adicionaveis.length > 0 && (
                <p className="text-sm text-nevoa sm:text-[12.5px]">Ex.: {r.adicionaveis.map((a) => a.rotulo.toLowerCase()).join(", ")}, ou um custo seu.</p>
              )}
            </div>

            {d.retiradas.length > 0 && (
              <div className="mt-4 rounded-2xl border border-dashed border-nevoa/30 p-3 sm:p-4">
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  <IconeOlhoFechado className="text-nevoa" />
                  Fora da conta ({d.retiradas.length})
                </p>
                <ul className="mt-1.5">
                  {d.retiradas.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-nevoa/10 py-2 first:border-t-0">
                      <span className="min-w-0 text-[13.5px]">
                        <span className="text-nevoa line-through decoration-nevoa/50">{l.rotulo}</span>{" "}
                        <span className="text-[12.5px] text-nevoa tabular-nums">(seria {moedaSinal(l.valor)})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => religar(l.desligavel!)}
                        className="-my-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-[12.5px] font-semibold text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8"
                      >
                        <IconeVoltar />
                        Religar<span className="sr-only"> {l.rotulo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {fin && (
          <div className="mt-4 rounded-xl border border-nevoa/15 px-3 py-2.5 text-sm leading-relaxed sm:text-[13px]">
            <p className="font-semibold">{fin.tipo === "banco" ? "Financiamento (tabela SAC)" : "Parcelamento da fonte"}</p>
            <p className="mt-1 text-nevoa">
              {fin.tipo === "banco" ? (
                <>
                  Entrada de {moeda(fin.entrada)} e {moeda(fin.financiado)} financiados a {pct(p.jurosAA)} ao ano ({pct(fin.taxaMensal, 2)} ao mês). Primeira
                  parcela: {moeda(fin.primeiraParcela)}. Até a venda: {fin.parcelasPagas} parcelas, {moeda(fin.totalParcelas)} pagos ({moeda(fin.jurosPagos)} de
                  juros). Saldo quitado com a venda: {moeda(fin.saldoDevedor)}.
                </>
              ) : (
                <>
                  Entrada de {moeda(fin.entrada)} e {moeda(fin.financiado)} em {fin.prazo} parcelas mensais corrigidas a {pct(p.parcelasCorrecaoAA)} ao ano
                  (estimativa do índice). Primeira parcela: {moeda(fin.primeiraParcela)}. Até a venda: {fin.parcelasPagas} parcelas, {moeda(fin.totalParcelas)}{" "}
                  pagos. Saldo quitado com a venda, já corrigido: {moeda(fin.saldoDevedor)}.
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * O botão discreto que abre e fecha a edição da conta. Fechada: "Editar a conta" ou, com ajustes salvos, "Conta
 * ajustada · ver ajustes" (o ponto de latão avisa que a conta não é a padrão). Aberta: "Concluir". O mesmo botão nos
 * três estados: o foco fica nele ao abrir e ao fechar.
 */
function BotaoEditarConta({ editando, ajustada, aoAlternar }: { editando: boolean; ajustada: boolean; aoAlternar: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={editando}
      aria-controls="sim-conta"
      onClick={aoAlternar}
      className={`-my-1 inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors duration-150 motion-reduce:transition-none pointer-fine:min-h-9 ${
        editando ? "border-latao/60 bg-latao/12 text-latao-texto hover:bg-latao/20" : "border-nevoa/30 text-luar hover:border-latao hover:bg-latao/10"
      }`}
    >
      {editando ? (
        <>
          <IconeConcluir />
          Concluir<span className="sr-only"> a edição da conta</span>
        </>
      ) : ajustada ? (
        <>
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-latao" />
          Conta ajustada
          <span aria-hidden="true" className="text-nevoa">
            ·
          </span>
          <span className="text-latao-texto">ver ajustes</span>
        </>
      ) : (
        <>
          <IconeLapis className="size-3 text-latao-texto" />
          Editar a conta
        </>
      )}
    </button>
  );
}

function IconeConcluir() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/** "% da venda" do cenário escolhido (ou o valor, no personalizado em reais), editável no topo do Detalhe. */
function PctVenda({ r, atualizar }: { r: ResultadoCompleto; atualizar: (mudar: (e: EstadoSimulador) => EstadoSimulador) => void }) {
  const p = r.modelo.premissas;
  const c = r.celula.cenario;
  if (c === "personalizado") {
    const vp = p.vendaPersonalizada!;
    return vp.modo === "valor" ? (
      <CampoNumero
        id="sim-det-venda"
        valor={vp.valor}
        prefixo="R$"
        min={LIMITES.valorVenda[0]}
        max={LIMITES.valorVenda[1]}
        passo={1000}
        aoMudar={(n) => atualizar((x) => ({ ...x, ajustes: { ...x.ajustes, vendaPersonalizada: { modo: "valor", valor: n } } }))}
        className="w-full"
      />
    ) : (
      <CampoNumero
        id="sim-det-venda"
        valor={Math.round(vp.valor * 1000) / 10}
        casas={1}
        sufixo="%"
        min={LIMITES.vendaPersonalizadaPct[0] * 100}
        max={LIMITES.vendaPersonalizadaPct[1] * 100}
        passo={5}
        aoMudar={(n) => atualizar((x) => ({ ...x, ajustes: { ...x.ajustes, vendaPersonalizada: { modo: "pct", valor: Math.round(n * 10) / 1000 } } }))}
        className="w-full"
      />
    );
  }
  const k = CHAVE_CENARIO[c];
  return (
    <CampoNumero
      id="sim-det-venda"
      valor={Math.round(multiplicador(p, c) * 1000) / 10}
      casas={1}
      sufixo="%"
      min={LIMITES.cenarioBase[0] * 100}
      max={LIMITES.cenarioBase[1] * 100}
      passo={5}
      aoMudar={(n) =>
        atualizar((x) => {
          const v = Math.round(n * 10) / 1000;
          const a = { ...x.ajustes };
          if (Math.abs(v - PADRAO[k]) < 1e-9) delete a[k];
          else a[k] = v;
          return { ...x, ajustes: a };
        })
      }
      className="w-full"
    />
  );
}

/** Uma linha da conta. Sem `onEditar` (a conta fechada), sem o lápis: só o rótulo, a fórmula e o valor. */
function LinhaDaConta({ l, onEditar }: { l: LinhaConta; onEditar: ((ev: { currentTarget: HTMLElement }) => void) | null }) {
  const positivo = l.valor > 0 && l.id === "venda";
  return (
    <li
      className={`group flex items-center gap-2 border-t border-nevoa/10 py-2.5 pl-3 transition-colors first:border-t-0 sm:pl-4 ${
        onEditar ? "pr-1.5 hover:bg-nevoa/[0.04]" : "pr-3 sm:pr-4"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] leading-snug font-medium">
          {l.rotulo}
          {l.ajustada && (
            <span className="rounded-full bg-latao/15 px-1.5 py-px text-[10.5px] font-semibold text-latao-texto">{l.editor === "extra" ? "seu custo" : "ajustado"}</span>
          )}
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-nevoa sm:text-[12.5px]">{l.formula}</p>
      </div>
      <p className={`shrink-0 text-right text-[14px] font-semibold whitespace-nowrap tabular-nums ${positivo ? "" : l.valor === 0 ? "text-nevoa" : ""}`}>
        {positivo ? moeda(l.valor) : moedaSinal(l.valor)}
      </p>
      {onEditar && <BotaoEditar rotulo={`Editar ${l.rotulo.toLowerCase()}`} onClick={onEditar} sempreVisivel={l.ajustada} destaque={l.ajustada} />}
    </li>
  );
}

function Total({
  rotulo,
  detalhe,
  valor,
  extra,
  forte,
  grave,
  comLapis,
}: {
  rotulo: string;
  detalhe?: string;
  valor: string;
  extra?: string;
  forte?: boolean;
  grave?: boolean;
  /** a conta aberta para edição: o valor fica na coluna dos valores das linhas (à esquerda dos lápis) */
  comLapis: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 border-t border-nevoa/10 py-2.5 pl-3 first:border-t-0 sm:pl-4 ${
        comLapis ? "pr-[58px] pointer-fine:pr-[46px]" : "pr-3 sm:pr-4"
      }`}
    >
      <dt className="min-w-0">
        <span className={forte ? "text-[15px] font-bold" : "text-[14px] font-medium"}>{rotulo}</span>
        {detalhe && <span className="block text-[13px] leading-snug text-nevoa sm:text-[12px]">{detalhe}</span>}
      </dt>
      <dd className={`shrink-0 text-right whitespace-nowrap tabular-nums ${forte ? "text-[16px] font-bold" : "text-[14px] font-semibold"} ${grave ? "text-grave-texto" : ""}`}>
        {valor}
        {extra && <span className="block text-[12px] font-medium text-nevoa">{extra}</span>}
      </dd>
    </div>
  );
}

function Destaque({ rotulo, valor, sufixo, tom, nota }: { rotulo: string; valor: string; sufixo?: string; tom?: "grave" | "forte"; nota?: ReactNode }) {
  // valores de 7 dígitos ("R$ 1.743.472") não cabiam no cartão de 360 px: o número encolhe com a largura do cartão
  // (até 19/21 px) e, se for longo, o sufixo ("/ano") desce para a linha de baixo
  const longo = valor.length > 10;
  return (
    <div className="@container min-w-0 rounded-2xl border border-nevoa/15 bg-noite/50 px-3 py-3">
      <dt className="text-[12px] leading-tight text-nevoa">{rotulo}</dt>
      <dd
        className={`mt-1.5 font-display leading-none font-bold tracking-[-0.02em] tabular-nums [--max:19px] sm:[--max:21px] ${
          tom === "grave" ? "text-grave-texto" : tom === "forte" ? "text-luar" : ""
        }`}
        style={{ fontSize: `min(var(--max), ${(100 / (valor.length * 0.62)).toFixed(2)}cqi)` }}
      >
        {valor}
        {sufixo && <span className={`font-sans text-[12px] font-medium tracking-normal text-nevoa ${longo ? "mt-1 block" : ""}`}>{sufixo}</span>}
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
                {proximo && (
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
