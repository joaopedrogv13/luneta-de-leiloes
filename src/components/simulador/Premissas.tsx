"use client";

import { useState, type ReactNode } from "react";
import { MODALIDADE_ROTULO, numero, TIPO_PLURAL } from "@/lib/catalogo/rotulos";
import type { Plano } from "@/lib/catalogo/tipos";
import { custoReforma, iptuMensal } from "@/lib/simulador/calculo";
import { LIMITES, PADRAO, ROTULO_NIVEL, type Modelo } from "@/lib/simulador/premissas";
import { NIVEIS_REFORMA, type Ajustes, type NivelReforma, type Premissas as TPremissas, type Simulacao } from "@/lib/simulador/tipos";
import { Aviso, Campo, CampoNumero, Deslizante, focar, IconeCadeado, IconeSeta, IconeVoltar, Interruptor, Segmentado } from "./controles";
import { semAjuste } from "./estado";
import { area, juntar, meses, moeda, moedaCurta, moedaMes, pct, porArea } from "./formato";

type Chave = keyof Ajustes;
type ChaveNumero = { [K in Chave]: Ajustes[K] extends number | null | undefined ? K : never }[Chave];

type Unidade = "moeda" | "moedaMes" | "moedaM2" | "pct" | "pctAA" | "m2" | "meses" | "parcelas";

const ehPct = (u: Unidade) => u === "pct" || u === "pctAA";
const igual = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : Array.isArray(a) && Array.isArray(b) ? a.join() === b.join() : a === b;

function textoValor(v: number | null, u: Unidade): string {
  if (v === null) return "não informado";
  switch (u) {
    case "moeda":
      return moeda(v);
    case "moedaMes":
      return `${moeda(v)}/mês`;
    case "moedaM2":
      return `${moeda(v)}/m²`;
    case "pct":
      return pct(v);
    case "pctAA":
      return `${pct(v, 1)} a.a.`;
    case "m2":
      return area(v);
    case "meses":
      return meses(v);
    case "parcelas":
      return `${v} ${v === 1 ? "parcela" : "parcelas"}`;
  }
}

const ADORNO: Record<Unidade, { prefixo?: string; sufixo?: string }> = {
  moeda: { prefixo: "R$" },
  moedaMes: { prefixo: "R$", sufixo: "/mês" },
  moedaM2: { prefixo: "R$", sufixo: "/m²" },
  pct: { sufixo: "%" },
  pctAA: { sufixo: "% a.a." },
  m2: { sufixo: "m²" },
  meses: { sufixo: "meses" },
  parcelas: { sufixo: "parcelas" },
};

/**
 * Ajustes que valem mesmo iguais ao padrão, porque confirmam um dado: a área quando a fonte não informa (o
 * padrão é só um tamanho típico) e as dívidas quando a análise aponta alguma (informar R$ 0 é "conferi no
 * edital e não há").
 */
function confirmaDado(modelo: Modelo, k: Chave): boolean {
  return (k === "area" && modelo.padrao.areaEstimada) || (k === "dividas" && modelo.dividasApontadas.length > 0);
}

/** Quantas premissas a pessoa mudou (diferentes do padrão, ou confirmadas). */
export function contarAjustes(modelo: Modelo): number {
  const { ajustes, padrao } = modelo;
  return (Object.keys(ajustes) as Chave[]).filter((k) => !igual(ajustes[k], padrao[k as keyof TPremissas]) || confirmaDado(modelo, k)).length;
}

/**
 * "Ajustar premissas": grupos recolhíveis (Compra, Regularização e reforma, Enquanto não vende, Venda e
 * impostos, Pagamento), cada campo com rótulo, unidade, ajuda curta e "voltar ao padrão". Só aparecem os
 * campos que valem para o tipo do imóvel.
 */
export function Premissas({
  modelo,
  sim,
  plano,
  aoAjustar,
  aoRestaurarTudo,
  aoPedirLuneta,
}: {
  modelo: Modelo;
  /** simulação de referência (lance mínimo, célula escolhida), para os subtotais */
  sim: Simulacao | null;
  plano: Plano;
  aoAjustar: (mudar: (a: Ajustes) => Ajustes) => void;
  aoRestaurarTudo: () => void;
  aoPedirLuneta?: () => void;
}) {
  const { premissas: p, padrao: d, ajustes: a, perfil, entrada: e } = modelo;
  const [desfazer, setDesfazer] = useState<Ajustes | null>(null);
  const total = contarAjustes(modelo);

  /** Grava um ajuste; igual ao padrão = tira o ajuste (o padrão volta a acompanhar as outras premissas). */
  const definir = <K extends Chave>(k: K, v: Ajustes[K]) => {
    setDesfazer(null);
    // área típica e dívidas apontadas: informar o mesmo número do padrão ainda vale como "a pessoa confirmou"
    const comoPadrao = igual(v, d[k as keyof TPremissas]) && !confirmaDado(modelo, k);
    aoAjustar((x) => (comoPadrao ? semAjuste(x, k) : { ...x, [k]: v }));
  };
  const restaurar = (...ks: Chave[]) => {
    setDesfazer(null);
    aoAjustar((x) => semAjuste(x, ...ks));
  };
  const mudou = (...ks: Chave[]) => ks.some((k) => a[k] !== undefined && (!igual(a[k], d[k as keyof TPremissas]) || confirmaDado(modelo, k)));
  const nAjustes = (...ks: Chave[]) => ks.filter((k) => mudou(k)).length;

  /** Campo numérico padrão de uma premissa (com controle deslizante opcional). */
  const campo = (
    k: ChaveNumero,
    rotulo: ReactNode,
    unidade: Unidade,
    ajuda: ReactNode,
    extra: {
      deslizante?: [number, number, number];
      casas?: number;
      passo?: number;
      aviso?: ReactNode;
      largura?: string;
      /** o que mostrar no campo, quando não é a premissa (ex.: área estimada fica vazia) */
      valor?: number | null;
      placeholder?: string;
    } = {},
  ) => {
    const pc = ehPct(unidade);
    const v = extra.valor !== undefined ? extra.valor : (p[k] as number | null);
    const para = (n: number) => (pc ? Math.round(n * 1e6) / 1e4 : n);
    const de = (n: number) => (pc ? Math.round(n * 1e4) / 1e6 : n);
    const lim = (LIMITES as Record<string, readonly [number, number]>)[k] ?? [0, 1e12];
    const id = `sim-${k}`;
    return (
      <Campo
        id={id}
        rotulo={rotulo}
        ajuda={ajuda}
        alterado={mudou(k)}
        padrao={textoValor(d[k] as number | null, unidade)}
        aoRestaurar={() => restaurar(k)}
        aviso={extra.aviso}
      >
        <div className="flex items-center gap-4">
          <CampoNumero
            id={id}
            valor={v === null ? null : para(v)}
            casas={extra.casas ?? (pc ? 1 : 0)}
            min={para(lim[0])}
            max={para(lim[1])}
            passo={extra.passo ?? (pc ? 0.5 : unidade === "meses" || unidade === "parcelas" ? 1 : 100)}
            {...ADORNO[unidade]}
            descritoPor={`${id}-ajuda`}
            placeholder={extra.placeholder}
            aoMudar={(n) => definir(k, de(n))}
            aoEsvaziar={() => restaurar(k)}
            className={`shrink-0 ${extra.largura ?? (pc ? "w-28 sm:w-32" : "w-full max-w-60 sm:w-48")}`}
          />
          {extra.deslizante && v !== null && (
            <Deslizante
              valor={para(v)}
              min={extra.deslizante[0]}
              max={extra.deslizante[1]}
              passo={extra.deslizante[2]}
              ariaLabel={`${typeof rotulo === "string" ? rotulo : k}: ajuste rápido`}
              textoValor={textoValor(v, unidade)}
              aoMudar={(n) => definir(k, de(n))}
            />
          )}
        </div>
      </Campo>
    );
  };

  // ------------------------------------------------------------------ textos que dependem do imóvel
  const modalidade = e.modalidadeFonte ?? MODALIDADE_ROTULO[e.modalidade];
  const ajudaComissao =
    d.comissaoPct === 0 ? (
      <>“{modalidade}”: sem leiloeiro, normalmente sem comissão. Confira no edital.</>
    ) : e.modalidade === "leilao" || e.judicial ? (
      <>Leilão com leiloeiro (como o “Leilão SFI” da Caixa e os judiciais): em geral 5% do lance, pagos à parte. Confira no edital.</>
    ) : (
      <>A fonte não deixa claro se há leiloeiro: por segurança, contamos 5% do lance. Confira no edital.</>
    );

  const ajudaDesocupacao =
    e.ocupacao === "desocupado" ? (
      <>A fonte informa que o imóvel está desocupado. Confirme na visita e no edital.</>
    ) : e.ocupacao === "ocupado" ? (
      <>A fonte informa que o imóvel está ocupado. Reservamos {moeda(PADRAO.desocupacao)} para a desocupação (acordo ou ação na Justiça).</>
    ) : (
      <>
        A fonte não informa a ocupação: por segurança, reservamos {moeda(PADRAO.desocupacao)} para a desocupação (acordo ou ação na Justiça).
        {e.tags.some((t) => t.slug === "desocupado") && " A análise automática indica desocupado; confirme antes de zerar."}
      </>
    );

  const avisoOcupacao =
    e.ocupacao !== "desocupado" && p.desocupacao > 0 ? (
      <Aviso tom="info">Desocupar pode levar meses. Se o imóvel estiver ocupado, olhe as colunas de 18 e 24 meses da matriz.</Aviso>
    ) : null;

  const subtotalCompra = sim ? sim.aquisicao : null;
  const custoMensal = p.condominio + iptuMensal(modelo, p, e.lance) + p.contas;
  const reforma = custoReforma(modelo, p);
  const temCondominio = perfil.condominioPadrao || p.emCondominio;
  const rotuloArea = perfil.rotuloArea.charAt(0).toUpperCase() + perfil.rotuloArea.slice(1);

  // Venda: R$/m² e comparação com a região
  const ref = modelo.referencia;
  const vendaM2 = p.valorVenda !== null && !p.areaEstimada && p.area > 0 ? p.valorVenda / p.area : null;
  const medianaRef = ref?.avaliacaoM2?.mediana ?? null;
  const origem = modelo.origemVenda;

  const ajudaVenda =
    origem.tipo === "avaliacao" ? (
      <>Avaliação informada pela fonte: {moeda(origem.avaliacao)}. A avaliação do leilão não é preço de mercado: compare com anúncios parecidos.</>
    ) : origem.tipo === "referencia" ? (
      <>
        A fonte não informa a avaliação. Usamos a mediana de avaliação de {TIPO_PLURAL[e.tipo].toLowerCase()} em {origem.referencia.nome} (
        {porArea(origem.m2, e.tipo)}, {origem.referencia.amostra} imóveis) × {area(origem.area)}. É avaliação de outros imóveis em leilão, não preço de mercado.
      </>
    ) : origem.tipo === "ajuste" ? (
      <>Valor informado por você. {d.valorVenda !== null ? <>Padrão: {moeda(d.valorVenda)}.</> : null}</>
    ) : (
      <>
        Sem avaliação da fonte{origem.motivo === "sem-area" ? " e sem a área" : " e sem referência da região"}: informe por quanto você acha que vende (veja
        anúncios parecidos).
      </>
    );

  return (
    <section aria-labelledby="sim-premissas-titulo" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-1">
        <div className="min-w-0">
          <h3 id="sim-premissas-titulo" className="font-display text-[19px] leading-tight font-bold tracking-[-0.01em] sm:text-[21px]">
            Ajustar premissas
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-nevoa">Os padrões são conservadores e genéricos. Troque pelo que você souber deste imóvel.</p>
        </div>
        <button
          id="sim-restaurar-tudo"
          type="button"
          disabled={total === 0}
          onClick={() => {
            setDesfazer(a);
            aoRestaurarTudo();
            // o botão fica desabilitado (e perde o foco): o teclado segue no "Desfazer"
            requestAnimationFrame(() => focar("sim-desfazer"));
          }}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-nevoa/35 px-4 text-[13.5px] font-medium transition-colors hover:border-latao disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-nevoa/35 pointer-fine:min-h-9"
        >
          <IconeVoltar />
          Restaurar tudo{total > 0 ? ` (${total})` : ""}
        </button>
      </div>
      <p role="status" className="px-1 text-[13px] empty:hidden">
        {desfazer && (
          <>
            Premissas de volta ao padrão.{" "}
            <button
              id="sim-desfazer"
              type="button"
              onClick={() => {
                const anterior = desfazer;
                setDesfazer(null);
                aoAjustar(() => anterior);
                requestAnimationFrame(() => focar("sim-restaurar-tudo"));
              }}
              className="-my-2 inline-flex min-h-11 cursor-pointer items-center font-semibold text-latao-texto underline underline-offset-4 pointer-fine:min-h-8"
            >
              Desfazer
            </button>
          </>
        )}
      </p>

      {/* ------------------------------------------------------------ Compra */}
      <Grupo
        titulo="Compra"
        resumo={`Comissão ${pct(p.comissaoPct)} · ITBI ${pct(p.itbiPct)} · registro ${pct(p.registroPct)} (mín. ${moedaCurta(p.registroMin)}) · reserva ${pct(p.reservaPct)}`}
        ajustes={nAjustes("comissaoPct", "itbiPct", "registroPct", "registroMin", "reservaPct")}
      >
        {campo("comissaoPct", "Comissão do leiloeiro", "pct", ajudaComissao, { deslizante: [0, 10, 0.5] })}
        {campo(
          "itbiPct",
          "ITBI",
          "pct",
          <>
            Imposto da prefeitura na transferência. A alíquota (em geral 2% a 3%) e a base de cálculo variam por município: confira com a prefeitura de{" "}
            {e.cidade}.
          </>,
          {
            deslizante: [0, 5, 0.5],
          },
        )}
        <Campo
          id="sim-registro"
          grupo
          rotulo="Escritura e registro"
          alterado={mudou("registroPct", "registroMin")}
          padrao={`${pct(d.registroPct)}, mín. ${moeda(d.registroMin)}`}
          aoRestaurar={() => restaurar("registroPct", "registroMin")}
          ajuda={
            <>
              Cartório: escritura (quando há) e registro na matrícula. Usamos {pct(p.registroPct)} do lance, com mínimo de {moeda(p.registroMin)}.
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="min-w-0">
              <label htmlFor="sim-registroPct" className="mb-1 block text-[12px] text-nevoa">
                % do lance
              </label>
              <CampoNumero
                id="sim-registroPct"
                valor={Math.round(p.registroPct * 1e6) / 1e4}
                casas={1}
                min={0}
                max={10}
                passo={0.5}
                sufixo="%"
                descritoPor="sim-registro-ajuda"
                aoMudar={(n) => definir("registroPct", Math.round(n * 1e4) / 1e6)}
                aoEsvaziar={() => restaurar("registroPct")}
                className="w-full"
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="sim-registroMin" className="mb-1 block text-[12px] text-nevoa">
                Mínimo
              </label>
              <CampoNumero
                id="sim-registroMin"
                valor={p.registroMin}
                prefixo="R$"
                min={0}
                max={LIMITES.registroMin[1]}
                passo={500}
                descritoPor="sim-registro-ajuda"
                aoMudar={(n) => definir("registroMin", n)}
                aoEsvaziar={() => restaurar("registroMin")}
                className="w-full"
              />
            </div>
          </div>
        </Campo>
        {campo(
          "reservaPct",
          "Reserva para imprevistos",
          "pct",
          <>Folga para o que só aparece depois da compra (laudos, taxas, reparos escondidos). Padrão: 5% do lance.</>,
          {
            deslizante: [0, 15, 1],
          },
        )}
        {subtotalCompra !== null && (
          <Subtotal>
            Com o lance mínimo: <strong className="font-semibold text-luar">{moeda(subtotalCompra)}</strong> em custos de compra (
            {pct(subtotalCompra / (e.lance || 1), 0)} do lance).
          </Subtotal>
        )}
      </Grupo>

      {/* ------------------------------------------------------------ Regularização e reforma */}
      <Grupo
        titulo="Regularização e reforma"
        resumo={`Desocupação ${moedaCurta(p.desocupacao)}${p.dividas > 0 ? ` · dívidas ${moedaCurta(p.dividas)}` : ""} · ${perfil.rotuloReforma.toLowerCase()} ${ROTULO_NIVEL[p.reformaNivel].toLowerCase()} ${moedaCurta(reforma)}`}
        ajustes={nAjustes("area", "desocupacao", "dividas", "reformaNivel", "reformaUnitario")}
        alerta={modelo.dividasApontadas.length > 0 && a.dividas === undefined ? "dívida apontada" : undefined}
      >
        {campo(
          "area",
          rotuloArea,
          "m2",
          p.areaEstimada ? (
            <>A fonte não informa a área. Usamos {area(d.area)}, um tamanho típico, até você informar (vale para reforma e condomínio).</>
          ) : a.area !== undefined ? (
            <>Área informada por você.{!d.areaEstimada && <> Pela fonte: {area(d.area)}.</>}</>
          ) : (
            <>Informada pela fonte. Corrija se a matrícula ou o edital disserem outra.</>
          ),
          { passo: 1, casas: 2, valor: p.areaEstimada ? null : p.area, placeholder: p.areaEstimada ? `típico: ${numero(d.area)}` : undefined },
        )}
        {campo("desocupacao", "Desocupação", "moeda", ajudaDesocupacao, { passo: 1000, aviso: avisoOcupacao })}
        {campo(
          "dividas",
          "Dívidas que passam ao comprador",
          "moeda",
          <>Condomínio, IPTU e outras dívidas que o edital manda o comprador pagar. Muda caso a caso: confira no edital.</>,
          {
            passo: 1000,
            aviso:
              modelo.dividasApontadas.length > 0 ? (
                a.dividas === undefined ? (
                  <Aviso>
                    A análise aponta <strong className="font-semibold">{juntar(modelo.dividasApontadas)}</strong>. Informe o valor que passa a você (no
                    edital, com a administradora ou com a prefeitura); se não houver, informe 0.
                  </Aviso>
                ) : (
                  <Aviso tom="info">
                    A análise aponta {juntar(modelo.dividasApontadas)}: você informou {moeda(p.dividas)}.
                  </Aviso>
                )
              ) : plano === "lente" ? (
                <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-nevoa">
                  <IconeCadeado className="mt-0.5" />
                  <span>
                    No plano Luneta, as tags de risco avisam aqui quando o edital fala em condomínio ou IPTU atrasados.{" "}
                    {aoPedirLuneta && (
                      <button type="button" onClick={aoPedirLuneta} className="cursor-pointer font-semibold text-latao-texto underline underline-offset-4">
                        Conhecer a Luneta
                      </button>
                    )}
                  </span>
                </p>
              ) : null,
          },
        )}
        <Campo
          id="sim-reforma"
          grupo
          rotulo={perfil.rotuloReforma}
          alterado={mudou("reformaNivel", "reformaUnitario")}
          padrao={`${ROTULO_NIVEL[d.reformaNivel].toLowerCase()}`}
          aoRestaurar={() => restaurar("reformaNivel", "reformaUnitario")}
          ajuda={
            perfil.modoReforma === "m2" ? (
              <>
                {perfil.notaReforma ? `${perfil.notaReforma} ` : ""}Custo por m² da {perfil.rotuloArea}. Valores genéricos: peça orçamento depois da visita
                (muitos imóveis de leilão não podem ser visitados antes da compra).
              </>
            ) : perfil.tipo === "terreno" ? (
              <>Valor fixo para deixar o lote pronto para vender: limpeza, cercamento ou muro.</>
            ) : (
              <>Valor fixo para cercas, acesso e reparos das benfeitorias.</>
            )
          }
          aviso={
            perfil.modoReforma === "m2" && p.areaEstimada ? (
              <Aviso tom="info">
                Sem a área, usamos {area(p.area)} típicos: {moeda(reforma)} (valor fixo). Informe a área acima para calcular pelo tamanho real.
              </Aviso>
            ) : null
          }
        >
          <Segmentado<NivelReforma>
            nome="sim-reforma-nivel"
            legenda={`Nível de ${perfil.rotuloReforma.toLowerCase()}`}
            valor={p.reformaNivel}
            aoMudar={(n) => {
              setDesfazer(null);
              aoAjustar((x) => {
                const y = semAjuste(x, "reformaUnitario", "reformaNivel");
                return n === d.reformaNivel ? y : { ...y, reformaNivel: n };
              });
            }}
            opcoes={NIVEIS_REFORMA.map((n) => ({
              valor: n,
              rotulo: ROTULO_NIVEL[n],
              detalhe: moeda(perfil.reforma[n]),
            }))}
          />
          <p className="mt-2 text-[13px] text-nevoa">
            {ROTULO_NIVEL[p.reformaNivel]}: {perfil.descricaoNivel[p.reformaNivel]}
            {perfil.modoReforma === "m2" ? " (valores por m²)" : ""}.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <label htmlFor="sim-reformaUnitario" className="sr-only">
              {perfil.modoReforma === "m2" ? "Custo por m²" : "Valor"}
            </label>
            <CampoNumero
              id="sim-reformaUnitario"
              valor={p.reformaUnitario}
              prefixo="R$"
              sufixo={perfil.modoReforma === "m2" ? "/m²" : undefined}
              min={0}
              max={LIMITES.reformaUnitario[1]}
              passo={perfil.modoReforma === "m2" ? 50 : 500}
              descritoPor="sim-reforma-ajuda"
              aoMudar={(n) => definir("reformaUnitario", n)}
              aoEsvaziar={() => restaurar("reformaUnitario")}
              className="w-full max-w-60 sm:w-48"
            />
            {perfil.modoReforma === "m2" && (
              <p className="text-[14px] tabular-nums">
                × {area(p.area)} = <strong className="font-semibold">{moeda(reforma)}</strong>
              </p>
            )}
          </div>
        </Campo>
      </Grupo>

      {/* ------------------------------------------------------------ Enquanto não vende */}
      <Grupo
        titulo="Enquanto não vende"
        resumo={`${moedaMes(custoMensal)} por mês (${[temCondominio ? "condomínio" : null, perfil.rotuloImposto, "contas"].filter(Boolean).join(", ")}) · prazos ${p.prazos.join(", ")} meses`}
        ajustes={nAjustes("emCondominio", "condominio", "iptuPct", "contas", "prazos")}
      >
        {perfil.opcaoCondominio && (
          <div className="border-t border-nevoa/15 py-4 first:border-t-0 first:pt-1">
            <Interruptor
              id="sim-emCondominio"
              ligado={p.emCondominio}
              rotulo={perfil.opcaoCondominio}
              descricao={<>Liga a taxa de condomínio (estimada em {moeda(perfil.condominioM2, perfil.condominioM2 < 1)}/m² ao mês).</>}
              aoMudar={(v) => {
                setDesfazer(null);
                aoAjustar((x) => {
                  const y = semAjuste(x, "condominio", "emCondominio");
                  // igual ao de saída (sala comercial já vem ligada): volta a seguir o padrão
                  return v === d.emCondominio ? y : { ...y, emCondominio: v };
                });
              }}
            />
          </div>
        )}
        {temCondominio &&
          campo(
            "condominio",
            "Condomínio",
            "moedaMes",
            <>
              Estimativa: {moeda(perfil.condominioM2, perfil.condominioM2 < 1)} por m² ao mês
              {perfil.condominioMin > 0 ? `, mínimo ${moeda(perfil.condominioMin)}` : ""}
              {p.areaEstimada ? ` (com a área típica de ${area(p.area)})` : ""}. O valor certo está no edital ou com a administradora.
            </>,
            { passo: 50 },
          )}
        {campo(
          "iptuPct",
          `${perfil.rotuloImposto} ao ano`,
          "pctAA",
          <>
            {pct(p.iptuPct, 1)} ao ano {e.avaliacao ? "do valor de avaliação" : "do lance mínimo (a fonte não dá a avaliação)"} ={" "}
            <strong className="font-semibold text-luar">{moedaMes(iptuMensal(modelo, p, e.lance))} por mês</strong>.{" "}
            {perfil.rotuloImposto === "ITR"
              ? "O ITR é federal e costuma ser baixo; confira o valor na declaração do imóvel."
              : "Varia muito por cidade: o carnê do IPTU dá o valor certo."}
          </>,
          { casas: 2, passo: 0.1, largura: "w-36" },
        )}
        {campo("contas", "Contas e manutenção", "moedaMes", <>Luz, água, gás e pequenos reparos enquanto o imóvel fica vazio.</>, { passo: 10 })}
        <Campo
          id="sim-prazos"
          grupo
          rotulo="Prazos de venda (colunas da matriz)"
          alterado={mudou("prazos")}
          padrao={d.prazos.join(", ")}
          aoRestaurar={() => restaurar("prazos")}
          ajuda={<>Em quantos meses depois da compra você vende (de 3 a 60). Imóvel ocupado ou com reforma costuma levar mais.</>}
        >
          <div className="grid grid-cols-4 gap-2 sm:max-w-md">
            {p.prazos.map((m, i) => (
              <div key={i} className="min-w-0">
                <label htmlFor={`sim-prazo-${i}`} className="mb-1 block text-[12px] text-nevoa">
                  Coluna {i + 1}
                </label>
                <CampoNumero
                  id={`sim-prazo-${i}`}
                  valor={m}
                  min={LIMITES.prazo[0]}
                  max={LIMITES.prazo[1]}
                  passo={1}
                  sufixo="m"
                  descritoPor="sim-prazos-ajuda"
                  aoMudar={(n) => {
                    const novos = [...p.prazos];
                    novos[i] = Math.round(n);
                    definir("prazos", novos);
                  }}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </Campo>
        <Subtotal>
          Total: <strong className="font-semibold text-luar">{moedaMes(custoMensal)} por mês</strong>, ou {moeda(Math.round(custoMensal * 12))} em 12
          meses
          {e.avaliacao ? "" : " (com o lance mínimo)"}.
        </Subtotal>
      </Grupo>

      {/* ------------------------------------------------------------ Venda e impostos */}
      <Grupo
        titulo="Venda e impostos"
        resumo={`Venda ${p.valorVenda !== null ? moedaCurta(p.valorVenda) : "não informada"} · corretagem ${pct(p.corretagemPct)} · IR ${pct(p.irPct)}`}
        ajustes={nAjustes("valorVenda", "cenarioConservador", "cenarioBase", "cenarioOtimista", "corretagemPct", "irPct", "aplicacaoAA")}
      >
        {campo("valorVenda", "Valor de venda (cenário base, 100%)", "moeda", ajudaVenda, {
          passo: 1000,
          aviso:
            vendaM2 !== null ? (
              <p className="text-[13px] leading-relaxed">
                <span className="font-semibold tabular-nums">{porArea(vendaM2, e.tipo)}</span>
                {medianaRef !== null && ref ? (
                  <span className="text-nevoa">
                    {" "}
                    · em {ref.nome}, a avaliação mediana de {TIPO_PLURAL[e.tipo].toLowerCase()} é {porArea(medianaRef, e.tipo)} (metade entre{" "}
                    {porArea(ref.avaliacaoM2!.p25, e.tipo)} e {porArea(ref.avaliacaoM2!.p75, e.tipo)}, {ref.amostra} imóveis):{" "}
                    {Math.abs(vendaM2 / medianaRef - 1) < 0.03
                      ? "praticamente igual."
                      : `${pct(Math.abs(vendaM2 / medianaRef - 1), 0)} ${vendaM2 > medianaRef ? "acima" : "abaixo"}.`}
                  </span>
                ) : (
                  <span className="text-nevoa"> · sem referência da região para comparar.</span>
                )}
              </p>
            ) : null,
        })}
        <Campo
          id="sim-cenarios"
          grupo
          rotulo="Cenários de venda"
          alterado={mudou("cenarioConservador", "cenarioBase", "cenarioOtimista")}
          padrao="90%, 100%, 110%"
          aoRestaurar={() => restaurar("cenarioConservador", "cenarioBase", "cenarioOtimista")}
          ajuda={<>Quanto do valor de venda você recebe em cada linha da matriz.</>}
        >
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            {(
              [
                ["cenarioConservador", "Conservador"],
                ["cenarioBase", "Base"],
                ["cenarioOtimista", "Otimista"],
              ] as const
            ).map(([k, r]) => (
              <div key={k} className="min-w-0">
                <label htmlFor={`sim-${k}`} className="mb-1 block text-[12px] text-nevoa">
                  {r}
                </label>
                <CampoNumero
                  id={`sim-${k}`}
                  valor={Math.round(p[k] * 1000) / 10}
                  casas={1}
                  min={10}
                  max={300}
                  passo={5}
                  sufixo="%"
                  descritoPor="sim-cenarios-ajuda"
                  aoMudar={(n) => definir(k, Math.round(n * 10) / 1000)}
                  aoEsvaziar={() => restaurar(k)}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </Campo>
        {campo("corretagemPct", "Corretagem na venda", "pct", <>Comissão da imobiliária (em geral 5% a 6%). Zere se for vender por conta própria.</>, {
          deslizante: [0, 8, 0.5],
        })}
        {campo(
          "irPct",
          "Imposto de renda sobre o ganho",
          "pct",
          <>
            Pessoa física: 15% sobre o ganho de capital (venda − corretagem − lance − comissão − ITBI − registro − reforma), só se houver ganho. Simplificação:
            não considera fatores de redução, isenções nem lucro presumido.
          </>,
          { deslizante: [0, 34, 0.5] },
        )}
        {campo(
          "aplicacaoAA",
          "Comparar com uma aplicação",
          "pctAA",
          <>Premissa: rendimento líquido ao ano de uma aplicação, só para comparar com o imóvel no detalhe da célula. Zere para esconder a comparação.</>,
          { deslizante: [0, 20, 0.5], largura: "w-32 sm:w-36" },
        )}
      </Grupo>

      {/* ------------------------------------------------------------ Pagamento */}
      <Grupo
        titulo="Pagamento"
        resumo={
          p.parcelar
            ? `Parcelamento da fonte: entrada ${pct(p.parcelasEntradaPct, 0)} e ${p.parcelasN} parcelas corrigidas (${pct(p.parcelasCorrecaoAA)} a.a.)`
            : p.financiar
              ? `Financiado: entrada ${pct(p.entradaPct, 0)}, juros ${pct(p.jurosAA)} a.a., ${p.prazoFinanciamento} meses`
              : modelo.podeParcelar
                ? "À vista · a fonte oferece parcelamento"
                : modelo.podeFinanciar
                  ? "À vista · a fonte aceita financiamento"
                  : "À vista"
        }
        ajustes={nAjustes("financiar", "entradaPct", "jurosAA", "prazoFinanciamento", "segurosMensal", "parcelar", "parcelasEntradaPct", "parcelasN", "parcelasCorrecaoAA")}
      >
        {modelo.podeFinanciar || modelo.podeParcelar ? (
          <>
            <Campo
              id="sim-forma"
              grupo
              rotulo="Como você paga o lance"
              alterado={mudou("financiar", "parcelar")}
              padrao="à vista"
              aoRestaurar={() => restaurar("financiar", "parcelar")}
              ajuda={
                modelo.podeParcelar ? (
                  <>
                    A fonte oferece parcelamento: no leilão judicial, em geral pelo menos 25% de entrada e o resto em até 30 parcelas mensais corrigidas por
                    um índice (art. 895 do CPC), com o próprio imóvel como garantia. O padrão é à vista, o mais conservador.
                  </>
                ) : (
                  <>A fonte indica que este imóvel aceita financiamento. A prazo, a conta usa entrada + parcelas, e o saldo é quitado com a venda.</>
                )
              }
            >
              <Segmentado<"vista" | "banco" | "fonte">
                nome="sim-forma-pagamento"
                legenda="Como você paga o lance"
                valor={p.parcelar ? "fonte" : p.financiar ? "banco" : "vista"}
                aoMudar={(v) => {
                  setDesfazer(null);
                  aoAjustar((x) => {
                    const y = semAjuste(x, "financiar", "parcelar");
                    return v === "fonte" ? { ...y, parcelar: true } : v === "banco" ? { ...y, financiar: true } : y;
                  });
                }}
                opcoes={[
                  { valor: "vista", rotulo: "À vista" },
                  ...(modelo.podeParcelar ? [{ valor: "fonte" as const, rotulo: "Parcelamento", detalhe: "da fonte" }] : []),
                  ...(modelo.podeFinanciar ? [{ valor: "banco" as const, rotulo: "Financiamento", detalhe: "banco (SAC)" }] : []),
                ]}
              />
            </Campo>
            {p.parcelar && (
              <div>
                {campo(
                  "parcelasEntradaPct",
                  "Entrada",
                  "pct",
                  <>
                    Parte do lance paga à vista.{" "}
                    {e.condicoesPagamento ? "O padrão vem das condições informadas pela fonte." : "O mínimo da lei é 25%; o edital pode pedir mais."}
                  </>,
                  { deslizante: [5, 100, 5], casas: 0, passo: 5 },
                )}
                {campo(
                  "parcelasN",
                  "Número de parcelas",
                  "parcelas",
                  <>Parcelas mensais do restante. {e.condicoesPagamento ? "O padrão vem das condições da fonte." : "A lei permite até 30."}</>,
                  { passo: 1, largura: "w-36" },
                )}
                {campo(
                  "parcelasCorrecaoAA",
                  "Correção das parcelas ao ano",
                  "pctAA",
                  <>Estimativa do índice que corrige as parcelas (o edital diz qual: em geral o IPCA, perto de 4,5% ao ano). Juros, se houver, entram aqui.</>,
                  { deslizante: [0, 15, 0.5], casas: 2, passo: 0.5, largura: "w-32 sm:w-36" },
                )}
                {sim?.financiamento?.tipo === "fonte" && (
                  <Subtotal>
                    Com o lance mínimo: entrada de <strong className="font-semibold text-luar">{moeda(sim.financiamento.entrada)}</strong> e primeira parcela de{" "}
                    <strong className="font-semibold text-luar">{moeda(sim.financiamento.primeiraParcela)}</strong>; em {meses(sim.meses)},{" "}
                    {sim.financiamento.parcelasPagas} parcelas pagas e {moeda(sim.financiamento.saldoDevedor)} quitados na venda (
                    {moeda(sim.financiamento.jurosPagos)} de correção).
                  </Subtotal>
                )}
              </div>
            )}
            {p.financiar && (
              <div>
                {campo("entradaPct", "Entrada", "pct", <>Parte do lance paga com dinheiro próprio. O banco define o mínimo.</>, {
                  deslizante: [5, 100, 5],
                  casas: 0,
                  passo: 5,
                })}
                {campo("jurosAA", "Juros ao ano", "pctAA", <>Premissa: taxa efetiva ao ano (padrão 11,5%). Consulte a taxa do seu banco.</>, {
                  deslizante: [0, 20, 0.25],
                  casas: 2,
                  passo: 0.25,
                  largura: "w-32 sm:w-36",
                })}
                {campo(
                  "prazoFinanciamento",
                  "Prazo do financiamento",
                  "meses",
                  <>Prazo total. As parcelas correm até a venda; o que falta pagar sai do dinheiro da venda.</>,
                  {
                    passo: 12,
                  },
                )}
                {campo(
                  "segurosMensal",
                  "Seguros e tarifa do banco",
                  "moedaMes",
                  <>Seguros obrigatórios (morte e invalidez, danos ao imóvel) e tarifa mensal: estimativa. Variam com a idade e o banco.</>,
                  { passo: 10 },
                )}
                {sim?.financiamento?.tipo === "banco" && (
                  <Subtotal>
                    Com o lance mínimo: primeira parcela de <strong className="font-semibold text-luar">{moeda(sim.financiamento.primeiraParcela)}</strong>; em{" "}
                    {meses(sim.meses)}, {moeda(sim.financiamento.jurosPagos)} de juros e saldo de {moeda(sim.financiamento.saldoDevedor)} quitado na venda.
                  </Subtotal>
                )}
              </div>
            )}
          </>
        ) : (
          <Aviso tom="info">
            {e.financiamento === false
              ? "A fonte não indica financiamento para este imóvel: a simulação é à vista."
              : "A fonte não informa se este imóvel aceita financiamento: a simulação é à vista."}
          </Aviso>
        )}
        {e.condicoesPagamento ? (
          <Aviso tom="info" className="mt-3">
            <span className="font-semibold">Condições informadas pela fonte:</span> “{e.condicoesPagamento.trim().replace(/[.;\s]+$/, "")}”.{" "}
            {p.parcelar ? "A simulação usa essas condições; confira no edital." : modelo.podeParcelar ? "Escolha “Parcelamento” acima para simular com elas." : "Confira no edital."}
          </Aviso>
        ) : null}
      </Grupo>
    </section>
  );
}

function Subtotal({ children }: { children: ReactNode }) {
  return <p className="mt-1 rounded-xl bg-noite/60 px-3 py-2.5 text-[13px] leading-relaxed text-nevoa">{children}</p>;
}

/** Grupo recolhível (details/summary nativo: teclado e leitor de tela de graça). */
function Grupo({ titulo, resumo, ajustes, alerta, children }: { titulo: string; resumo: string; ajustes: number; alerta?: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-nevoa/20 bg-tinta open:border-nevoa/30 in-data-[theme=light]:shadow-[0_1px_2px_rgba(15,24,48,.05)]">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-[16px] leading-tight font-bold">{titulo}</span>
            {ajustes > 0 && (
              <span className="rounded-full bg-latao/15 px-2 py-0.5 text-[11px] font-semibold text-latao-texto">
                {ajustes} {ajustes === 1 ? "ajuste" : "ajustes"}
              </span>
            )}
            {alerta && <span className="rounded-full border border-aten/50 bg-aten/10 px-2 py-0.5 text-[11px] font-semibold text-aten">{alerta}</span>}
          </span>
          <span className="mt-1 block text-[12.5px] leading-snug text-nevoa group-open:hidden">{resumo}</span>
        </span>
        <IconeSeta className="text-nevoa transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </details>
  );
}
