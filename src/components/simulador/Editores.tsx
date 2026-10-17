"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { descricaoReferencia, mediaDe } from "@/components/catalogo/imovel/formato";
import { MODALIDADE_ROTULO } from "@/lib/catalogo/rotulos";
import type { Plano, ReferenciaM2 } from "@/lib/catalogo/tipos";
import { baseItbi, custoReforma, iptuMensal } from "@/lib/simulador/calculo";
import { completarModelo, type ResultadoCompleto } from "@/lib/simulador/completa";
import { CHAVES_EDITOR, confirmaDado, DESLIGAVEL, editorAjustado, type EditorLinha } from "@/lib/simulador/conta";
import { semAjuste, type EstadoSimulador } from "@/lib/simulador/estado";
import { area, capitalizar, juntar, meses, moeda, moedaCurta, moedaMes, moedaSinal, pct, porArea } from "@/lib/simulador/formato";
import { LIMITES, montarModelo, PADRAO, reformaPadrao, ROTULO_NIVEL, RE_ID_EXTRA, type Modelo } from "@/lib/simulador/premissas";
import { CENARIO_ROTULO, palavrasPreco } from "@/lib/simulador/textos";
import {
  NIVEIS_REFORMA,
  type Ajustes,
  type CustoExtra,
  type EntradaSimulador,
  type LinhaDesligavel,
  type ModoCustoExtra,
  type NivelReforma,
  type Premissas,
} from "@/lib/simulador/tipos";
import { EditorPersonalizado } from "./CartaoResposta";
import { Aviso, CampoNumero, Deslizante, IconeCadeado, IconeLixo, IconeMais, IconeVoltar, Interruptor, Segmentado } from "./controles";
import { Janela } from "./Janela";

/** Qual pop-up abrir: o de um tipo de despesa (ou de um custo criado), ou o de "adicionar custo". */
export type AlvoEditor = { editor: EditorLinha; extraId?: string } | { editor: "novo" };

const TITULO: Record<EditorLinha | "novo", string> = {
  venda: "Venda",
  corretagem: "Corretagem",
  ir: "Imposto de renda",
  lance: "Lance e pagamento",
  comissao: "Comissão do leiloeiro",
  itbi: "ITBI",
  registro: "Escritura e registro",
  reserva: "Reserva para imprevistos",
  reforma: "Reforma",
  condominio: "Condomínio",
  iptu: "IPTU",
  contas: "Contas e manutenção",
  desocupacao: "Desocupação",
  dividas: "Dívidas que passam ao comprador",
  aplicacao: "Comparar com uma aplicação",
  extra: "Custo criado por você",
  novo: "Adicionar custo",
};

const igual = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : JSON.stringify(a) === JSON.stringify(b);

const novoId = () => Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, "x") || "c1";

/**
 * Custo comum escolhido no "+ Adicionar custo": o pop-up daquele tipo abre com um valor sugerido (desocupação:
 * R$ 10 mil; condomínio: ligado) e a linha religada, se estava fora da conta. Abrir a linha pelo lápis não muda nada.
 */
function prepararPreset(editor: "desocupacao" | "dividas" | "condominio", estado: EstadoSimulador): EstadoSimulador {
  const a = estado.ajustes;
  const desligados = (a.desligados ?? []).filter((x) => x !== editor);
  const base: Ajustes = { ...a, desligados };
  if (!desligados.length) delete base.desligados;
  if (editor === "desocupacao") return { ...estado, ajustes: { ...base, desocupacao: a.desocupacao ?? PADRAO.desocupacao } };
  if (editor === "condominio") return { ...estado, ajustes: { ...base, emCondominio: true } };
  return { ...estado, ajustes: base };
}

/**
 * O pop-up de edição: um por tipo de despesa, completo para aquele tipo. Trabalha num rascunho do estado
 * inteiro: o rodapé mostra, ao vivo, o lucro e o lance máximo antes e depois, e nada muda até "Aplicar".
 * "Voltar ao padrão" tira os ajustes daquele tipo; "Incluir na conta" tira ou religa a linha.
 */
export function EditorCusto({
  alvo: alvoInicial,
  estado,
  atual,
  entrada,
  referencias,
  plano,
  aoPedirLuneta,
  aoAplicar,
  aoFechar,
  fallbackFocus,
}: {
  alvo: AlvoEditor;
  estado: EstadoSimulador;
  /** o resultado de agora (o "antes" da prévia) */
  atual: ResultadoCompleto;
  entrada: EntradaSimulador;
  referencias?: readonly ReferenciaM2[];
  plano: Plano;
  aoPedirLuneta?: () => void;
  aoAplicar: (novo: EstadoSimulador) => void;
  aoFechar: () => void;
  fallbackFocus?: () => HTMLElement | null;
}) {
  const [alvo, setAlvo] = useState<AlvoEditor>(alvoInicial);
  const [rascunho, setRascunho] = useState<EstadoSimulador>(estado);
  // custo novo (no "+ Adicionar" e na edição de um criado)
  const extraOriginal = alvo.editor === "extra" ? estado.ajustes.custosExtras?.find((x) => x.id === alvo.extraId) : undefined;
  const [extra, setExtra] = useState<CustoExtra>(() => extraOriginal ?? { id: novoId(), nome: "", modo: "fixo", valor: 0 });

  const ajustesComExtra = useMemo(() => {
    if (alvo.editor !== "novo" && alvo.editor !== "extra") return rascunho.ajustes;
    const atuais = rascunho.ajustes.custosExtras ?? [];
    const lista = atuais.filter((x) => x.id !== extra.id);
    const valido = extra.nome.trim() && extra.valor > 0;
    if (!valido) return { ...rascunho.ajustes, custosExtras: lista };
    const novo = { ...extra, nome: extra.nome.trim() };
    // editando um custo que já existe, ele fica no mesmo lugar da lista
    const custosExtras = atuais.some((x) => x.id === extra.id) ? atuais.map((x) => (x.id === extra.id ? novo : x)) : [...lista, novo].slice(0, 30);
    return { ...rascunho.ajustes, custosExtras };
  }, [alvo.editor, rascunho.ajustes, extra]);
  const estadoFinal = useMemo(() => {
    const a = { ...ajustesComExtra };
    if (a.custosExtras && a.custosExtras.length === 0) delete a.custosExtras;
    if (a.desligados && a.desligados.length === 0) delete a.desligados;
    return { ...rascunho, ajustes: a };
  }, [rascunho, ajustesComExtra]);
  const modelo = useMemo(() => montarModelo(entrada, estadoFinal.ajustes, referencias), [entrada, estadoFinal.ajustes, referencias]);
  const previa = useMemo(() => completarModelo(modelo, estadoFinal), [modelo, estadoFinal]);
  const d = modelo.padrao;

  const definir = <K extends keyof Ajustes>(k: K, v: Ajustes[K]) =>
    setRascunho((e) => {
      const comoPadrao = igual(v, d[k as keyof Premissas]) && !confirmaDado(modelo, k);
      return { ...e, ajustes: comoPadrao ? semAjuste(e.ajustes, k) : { ...e.ajustes, [k]: v } };
    });
  const tirar = (...ks: (keyof Ajustes)[]) => setRascunho((e) => ({ ...e, ajustes: semAjuste(e.ajustes, ...ks) }));
  const mudarEstado = (f: (e: EstadoSimulador) => EstadoSimulador) => setRascunho(f);

  const editor = alvo.editor;
  const desligavel: LinhaDesligavel | null =
    editor === "extra" ? `extra:${extra.id}` : editor !== "novo" ? (DESLIGAVEL[editor] ?? null) : null;
  const naConta = desligavel === null || !(rascunho.ajustes.desligados ?? []).includes(desligavel);
  const alternarConta = (incluir: boolean) =>
    setRascunho((e) => {
      const lista = (e.ajustes.desligados ?? []).filter((x) => x !== desligavel);
      const desligados = incluir ? lista : [...lista, desligavel!];
      const a: Ajustes = { ...e.ajustes, desligados };
      if (desligados.length === 0) delete a.desligados;
      return { ...e, ajustes: a };
    });

  const podeRestaurar =
    editor !== "novo" && editor !== "extra" && (editorAjustado(modelo, editor) || !naConta || (editor === "lance" && (rascunho.meuLance !== null || rascunho.lanceDetalhe !== "meu")));
  const restaurar = () =>
    setRascunho((e) => {
      if (editor === "novo" || editor === "extra") return e;
      let a = semAjuste(e.ajustes, ...CHAVES_EDITOR[editor]);
      const linha = DESLIGAVEL[editor];
      if (linha && a.desligados) {
        const desligados = a.desligados.filter((x) => x !== linha);
        a = desligados.length ? { ...a, desligados } : semAjuste(a, "desligados");
      }
      return editor === "lance" ? { ...e, ajustes: a, meuLance: null, lanceDetalhe: "meu" } : { ...e, ajustes: a };
    });

  const excluirExtra = () => {
    const lista = (estado.ajustes.custosExtras ?? []).filter((x) => x.id !== extra.id);
    const desligados = (estado.ajustes.desligados ?? []).filter((x) => x !== `extra:${extra.id}`);
    const a: Ajustes = { ...estado.ajustes, custosExtras: lista, desligados };
    if (!lista.length) delete a.custosExtras;
    if (!desligados.length) delete a.desligados;
    aoAplicar({ ...estado, ajustes: a });
    aoFechar();
  };

  // custo novo ou criado: precisa de nome e valor (apagar o nome de um custo criado não pode excluí-lo calado;
  // para isso há "Excluir este custo")
  const novoValido = (editor !== "novo" && editor !== "extra") || (extra.nome.trim().length > 0 && extra.valor > 0);
  const fixo = previa.semDisputa;
  const titulo =
    editor === "reforma"
      ? modelo.perfil.rotuloReforma
      : editor === "iptu"
        ? modelo.perfil.rotuloImposto
        : editor === "extra"
          ? extra.nome || TITULO.extra
          : editor === "lance" && fixo
            ? "Preço e pagamento"
            : TITULO[editor];

  const antes = atual.detalhe?.sim ?? null;
  const depois = previa.detalhe?.sim ?? null;

  return (
    <Janela
      titulo={titulo}
      sobretitulo={editor === "novo" ? "Detalhe da conta" : editor === "venda" || editor === "lance" || editor === "aplicacao" ? "Ajustar premissa" : "Ajustar custo"}
      onFechar={aoFechar}
      fallbackFocus={fallbackFocus}
      rodape={
        <div className="flex flex-col gap-3">
          {antes && depois && (
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] leading-snug" aria-live="polite">
              <span>
                <span className="text-nevoa">Lucro total: </span>
                <Mudanca antes={antes.lucro} depois={depois.lucro} />
              </span>
              {fixo ? (
                // venda direta: o preço não sobe; o que muda é a folga para imprevistos
                <span>
                  <span className="text-nevoa">Margem de segurança: </span>
                  {atual.margem === null && previa.margem === null ? (
                    <span className="font-semibold">nenhuma</span>
                  ) : (
                    <Mudanca antes={atual.margem} depois={previa.margem} vazio="nenhuma" />
                  )}
                </span>
              ) : (
                <span>
                  <span className="text-nevoa">Seu lance máximo: </span>
                  {atual.teto === null && previa.teto === null ? (
                    <span className="font-semibold">nenhum</span>
                  ) : (
                    <Mudanca antes={atual.teto} depois={previa.teto} />
                  )}
                </span>
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {podeRestaurar && (
                <button type="button" onClick={restaurar} className={BOTAO_LINK}>
                  <IconeVoltar />
                  Voltar ao padrão
                </button>
              )}
              {editor === "extra" && extraOriginal && (
                <button type="button" onClick={excluirExtra} className={`${BOTAO_LINK} text-grave-texto!`}>
                  <IconeLixo />
                  Excluir este custo
                </button>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={aoFechar} className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-[14px] font-medium text-luar hover:bg-nevoa/10 pointer-fine:min-h-10">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!novoValido}
                onClick={() => {
                  aoAplicar(estadoFinal);
                  aoFechar();
                }}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-latao px-5 text-[14px] font-semibold text-noite-fixa transition-opacity disabled:cursor-not-allowed disabled:opacity-45 pointer-fine:min-h-10"
              >
                {editor === "novo" ? "Adicionar" : "Aplicar"}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {desligavel !== null && (
          <div className="rounded-2xl border border-nevoa/20 bg-noite/50 px-4 py-3">
            <Interruptor
              id="sim-editor-na-conta"
              ligado={naConta}
              rotulo="Incluir na conta"
              descricao={naConta ? "Desligue para tirar esta linha da conta (o valor fica guardado para religar)." : "Esta linha está fora da conta. Ligue para religar."}
              aoMudar={alternarConta}
            />
          </div>
        )}
        <div className={naConta ? "" : "pointer-events-none opacity-50"} inert={!naConta}>
          {editor === "venda" && <EdVenda m={modelo} r={previa} rascunho={rascunho} definir={definir} tirar={tirar} mudarEstado={mudarEstado} />}
          {editor === "corretagem" && (
            <PctOuValor
              m={modelo}
              kValor="corretagemValor"
              valorAtual={modelo.premissas.corretagemPct * (previa.detalhe?.sim.venda ?? 0)}
              nome="sim-ed-corretagem-modo"
              legenda="Como informar a corretagem"
              rotuloValor="Corretagem, em reais"
              ajudaValor="O valor combinado com a imobiliária. Vale para todos os cenários de venda e continua abatendo do imposto de renda."
              definir={definir}
              tirar={tirar}
            >
              <CampoPct
                k="corretagemPct"
                m={modelo}
                rotulo="Corretagem na venda"
                definir={definir}
                tirar={tirar}
                deslizante={[0, 8, 0.5]}
                ajuda="Comissão da imobiliária que vende o imóvel (em geral 5% a 6% do valor de venda). Zere se for vender por conta própria."
              />
            </PctOuValor>
          )}
          {editor === "ir" && <EdIr m={modelo} r={previa} definir={definir} tirar={tirar} />}
          {editor === "lance" && <EdLance m={modelo} r={previa} rascunho={rascunho} definir={definir} tirar={tirar} mudarEstado={mudarEstado} />}
          {editor === "comissao" && <EdComissao m={modelo} r={previa} definir={definir} tirar={tirar} />}
          {editor === "itbi" && <EdItbi m={modelo} r={previa} definir={definir} tirar={tirar} />}
          {editor === "registro" && <EdRegistro m={modelo} r={previa} definir={definir} tirar={tirar} />}
          {editor === "reserva" && (
            <PctOuValor
              m={modelo}
              kValor="reservaValor"
              valorAtual={modelo.premissas.reservaPct * lanceDaConta(modelo, previa)}
              nome="sim-ed-reserva-modo"
              legenda="Como informar a reserva"
              rotuloValor="Reserva, em reais"
              ajudaValor="Uma folga fixa para o que só aparece depois da compra (laudos, taxas, reparos escondidos)."
              definir={definir}
              tirar={tirar}
            >
              <CampoPct
                k="reservaPct"
                m={modelo}
                rotulo="Reserva, em % do lance"
                definir={definir}
                tirar={tirar}
                deslizante={[0, 15, 1]}
                ajuda="Folga para o que só aparece depois da compra: laudos, taxas, reparos escondidos. Padrão: 5% do lance."
              />
            </PctOuValor>
          )}
          {editor === "reforma" && <EdReforma m={modelo} definir={definir} tirar={tirar} mudarEstado={mudarEstado} />}
          {editor === "condominio" && <EdCondominio m={modelo} r={previa} definir={definir} tirar={tirar} mudarEstado={mudarEstado} />}
          {editor === "iptu" && <EdIptu m={modelo} r={previa} definir={definir} tirar={tirar} />}
          {editor === "contas" && (
            <div className="flex flex-col gap-5">
              <CampoValor
                k="contas"
                m={modelo}
                rotulo="Por mês"
                unidade="mes"
                definir={definir}
                tirar={tirar}
                passo={10}
                ajuda="Luz, água, gás, limpeza e pequenos reparos enquanto o imóvel fica vazio."
              />
              <Meses k="mesesContas" m={modelo} r={previa} definir={definir} tirar={tirar} />
            </div>
          )}
          {editor === "desocupacao" && <EdDesocupacao m={modelo} definir={definir} tirar={tirar} />}
          {editor === "dividas" && <EdDividas m={modelo} plano={plano} aoPedirLuneta={aoPedirLuneta} definir={definir} tirar={tirar} />}
          {editor === "aplicacao" && (
            <CampoPct
              k="aplicacaoAA"
              m={modelo}
              rotulo="Rendimento líquido ao ano"
              unidade="aa"
              definir={definir}
              tirar={tirar}
              deslizante={[0, 20, 0.5]}
              ajuda="Premissa para comparar: quanto o mesmo dinheiro renderia numa aplicação (um CDB, o Tesouro), já sem o imposto. Zere para esconder a comparação."
            />
          )}
          {(editor === "extra" || editor === "novo") && (
            <EdExtra
              novo={editor === "novo"}
              extra={extra}
              setExtra={setExtra}
              m={modelo}
              presets={editor === "novo" ? atual.adicionaveis : []}
              aoEscolherPreset={(ed) => {
                setAlvo({ editor: ed });
                setRascunho((e) => prepararPreset(ed, e));
              }}
              meses={previa.celula.meses}
            />
          )}
        </div>
      </div>
    </Janela>
  );
}

const BOTAO_LINK =
  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-9";

function Mudanca({ antes, depois, vazio = "nenhum" }: { antes: number | null; depois: number | null; vazio?: string }) {
  const a = antes === null ? null : Math.round(antes);
  const b = depois === null ? null : Math.round(depois);
  if (a === b) return <span className="font-semibold tabular-nums">{b === null ? vazio : moedaSinal(b)}</span>;
  const diff = a !== null && b !== null ? b - a : null;
  return (
    <span className="tabular-nums">
      <span className="text-nevoa line-through decoration-nevoa/60">{a === null ? vazio : moedaSinal(a)}</span>
      <span aria-hidden="true" className="text-nevoa">
        {" "}
        →{" "}
      </span>
      <span className="sr-only"> passa a </span>
      <strong className="font-semibold">{b === null ? vazio : moedaSinal(b)}</strong>
      {diff !== null && <span className={`ml-1 text-[12px] ${diff < 0 ? "text-grave-texto" : "text-pos"}`}>({moedaSinal(diff, true)})</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Campos comuns
// ---------------------------------------------------------------------------

type Definir = <K extends keyof Ajustes>(k: K, v: Ajustes[K]) => void;
type Tirar = (...ks: (keyof Ajustes)[]) => void;
type ChaveNumero = { [K in keyof Ajustes]-?: NonNullable<Ajustes[K]> extends number ? K : never }[keyof Ajustes];

function Rotulo({ htmlFor, children, padrao, ajustado, aoRestaurar }: { htmlFor?: string; children: ReactNode; padrao?: string; ajustado?: boolean; aoRestaurar?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-[14px] font-semibold">
        {children}
        {ajustado && <span className="rounded-full bg-latao/15 px-2 py-0.5 text-[11px] font-semibold text-latao-texto">ajustado</span>}
      </label>
      {ajustado && aoRestaurar && (
        <button type="button" onClick={aoRestaurar} className="-my-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-latao-texto underline-offset-4 hover:underline pointer-fine:min-h-8">
          <IconeVoltar />
          padrão{padrao ? ` (${padrao})` : ""}
        </button>
      )}
    </div>
  );
}

function Ajuda({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-2 text-[12.5px] leading-relaxed text-nevoa">
      {children}
    </p>
  );
}

/** Campo de % de uma premissa (com deslizante opcional). */
function CampoPct({
  k,
  m,
  rotulo,
  ajuda,
  definir,
  tirar,
  deslizante,
  unidade = "pct",
  casas = 1,
}: {
  k: ChaveNumero;
  m: Modelo;
  rotulo: string;
  ajuda: ReactNode;
  definir: Definir;
  tirar: Tirar;
  deslizante?: [number, number, number];
  unidade?: "pct" | "aa";
  casas?: number;
}) {
  const id = useId();
  const v = m.premissas[k as keyof Premissas] as number;
  const dv = m.padrao[k as keyof Premissas] as number;
  const lim = (LIMITES as Record<string, readonly [number, number]>)[k] ?? [0, 1];
  const para = (n: number) => Math.round(n * 1e6) / 1e4;
  const de = (n: number) => Math.round(n * 1e4) / 1e6;
  const ajustado = m.ajustes[k] !== undefined && !igual(m.ajustes[k], dv);
  return (
    <div>
      <Rotulo htmlFor={id} ajustado={ajustado} padrao={pct(dv, casas as 1)} aoRestaurar={() => tirar(k)}>
        {rotulo}
      </Rotulo>
      <div className="mt-2.5 flex items-center gap-4">
        <CampoNumero
          id={id}
          valor={para(v)}
          casas={casas}
          min={para(lim[0])}
          max={para(lim[1])}
          passo={0.5}
          sufixo={unidade === "aa" ? "% a.a." : "%"}
          descritoPor={`${id}-ajuda`}
          aoMudar={(n) => definir(k, de(n) as never)}
          aoEsvaziar={() => tirar(k)}
          className="w-32 shrink-0"
        />
        {deslizante && (
          <Deslizante
            valor={para(v)}
            min={deslizante[0]}
            max={deslizante[1]}
            passo={deslizante[2]}
            ariaLabel={`${rotulo}: ajuste rápido`}
            textoValor={pct(v)}
            aoMudar={(n) => definir(k, de(n) as never)}
          />
        )}
      </div>
      <Ajuda id={`${id}-ajuda`}>{ajuda}</Ajuda>
    </div>
  );
}

/** Campo de valor em reais de uma premissa (R$, R$/mês ou R$/ano). */
function CampoValor({
  k,
  m,
  rotulo,
  ajuda,
  definir,
  tirar,
  unidade = "moeda",
  passo = 1000,
  valor,
  padraoTexto,
  aviso,
}: {
  k: ChaveNumero;
  m: Modelo;
  rotulo: string;
  ajuda?: ReactNode;
  definir: Definir;
  tirar: Tirar;
  unidade?: "moeda" | "mes" | "ano";
  passo?: number;
  /** o valor mostrado, quando não é a própria premissa */
  valor?: number | null;
  padraoTexto?: string;
  aviso?: ReactNode;
}) {
  const id = useId();
  const v = valor !== undefined ? valor : (m.premissas[k as keyof Premissas] as number | null);
  const dv = m.padrao[k as keyof Premissas] as number | null;
  const lim = (LIMITES as Record<string, readonly [number, number]>)[k] ?? [0, 1e12];
  const ajustado = m.ajustes[k] !== undefined && (!igual(m.ajustes[k], dv) || confirmaDado(m, k));
  return (
    <div>
      <Rotulo htmlFor={id} ajustado={ajustado} padrao={padraoTexto ?? (dv === null ? undefined : moeda(dv))} aoRestaurar={() => tirar(k)}>
        {rotulo}
      </Rotulo>
      <CampoNumero
        id={id}
        valor={v}
        prefixo="R$"
        sufixo={unidade === "mes" ? "/mês" : unidade === "ano" ? "/ano" : undefined}
        min={lim[0]}
        max={lim[1]}
        passo={passo}
        descritoPor={ajuda ? `${id}-ajuda` : undefined}
        aoMudar={(n) => definir(k, n as never)}
        aoEsvaziar={() => tirar(k)}
        className="mt-2.5 w-full max-w-64"
      />
      {aviso && <div className="mt-2.5">{aviso}</div>}
      {ajuda && <Ajuda id={`${id}-ajuda`}>{ajuda}</Ajuda>}
    </div>
  );
}

/** Quantos meses um custo mensal corre: até vender (o prazo da célula) ou outro número. */
function Meses({ k, m, r, definir, tirar }: { k: "mesesCondominio" | "mesesIptu" | "mesesContas"; m: Modelo; r: ResultadoCompleto; definir: Definir; tirar: Tirar }) {
  const id = useId();
  const v = m.premissas[k];
  const prazo = r.celula.meses;
  return (
    <div>
      <p className="text-[14px] font-semibold">Por quantos meses</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <Segmentado<"prazo" | "outro">
          nome={`${id}-meses`}
          legenda="Por quantos meses"
          valor={v === null ? "prazo" : "outro"}
          tamanho="sm"
          className="w-full sm:w-80"
          aoMudar={(x) => (x === "prazo" ? tirar(k) : definir(k, Math.min(prazo, LIMITES.mesesCusto[1])))}
          opcoes={[
            { valor: "prazo", rotulo: "Até vender", detalhe: meses(prazo) },
            { valor: "outro", rotulo: "Outro número" },
          ]}
        />
        {v !== null && (
          <CampoNumero
            valor={v}
            min={LIMITES.mesesCusto[0]}
            max={LIMITES.mesesCusto[1]}
            passo={1}
            sufixo="meses"
            ariaLabel="Número de meses"
            aoMudar={(n) => definir(k, Math.round(n))}
            className="w-32"
          />
        )}
      </div>
      <Ajuda>
        Normalmente o custo corre da compra até a venda. Use um número menor se, por exemplo, alguém assumir o custo antes (um inquilino). Se passar
        do prazo de venda, vale o prazo: depois da venda, o custo é do comprador.
      </Ajuda>
    </div>
  );
}

/** O lance (ou preço) da conta do Detalhe: o valor dos custos em % que a pessoa troca por reais parte dele. */
function lanceDaConta(m: Modelo, r: ResultadoCompleto) {
  return r.detalhe?.sim.lance ?? m.entrada.lance;
}

/**
 * "Como informar: em % | valor em R$" de um custo: pela fórmula (o % de sempre) ou pelo valor que a pessoa já sabe
 * (a guia do ITBI, o orçamento do cartório, o combinado com a imobiliária). Ao trocar para reais, o campo já vem
 * com o valor de hoje; voltar ao % apaga o valor informado.
 */
function PctOuValor({
  m,
  kValor,
  valorAtual,
  nome,
  legenda,
  rotuloValor,
  ajudaValor,
  definir,
  tirar,
  children,
}: {
  m: Modelo;
  kValor: "comissaoValor" | "itbiValor" | "registroValor" | "reservaValor" | "corretagemValor";
  /** o valor de hoje pela fórmula (o ponto de partida em reais) */
  valorAtual: number;
  nome: string;
  legenda: string;
  rotuloValor: string;
  ajudaValor: ReactNode;
  definir: Definir;
  tirar: Tirar;
  /** os campos do modo % */
  children: ReactNode;
}) {
  const emReais = m.premissas[kValor] !== null;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[14px] font-semibold">Como informar</p>
        <Segmentado<"pct" | "valor">
          className="mt-2.5 sm:max-w-sm"
          nome={nome}
          legenda={legenda}
          valor={emReais ? "valor" : "pct"}
          tamanho="sm"
          aoMudar={(v) => (v === "pct" ? tirar(kValor) : definir(kValor, Math.max(0, Math.round(valorAtual))))}
          opcoes={[
            { valor: "pct", rotulo: "Em %", detalhe: "estimativa" },
            { valor: "valor", rotulo: "Valor em R$", detalhe: "se você já sabe" },
          ]}
        />
      </div>
      {emReais ? (
        <CampoValor k={kValor} m={m} rotulo={rotuloValor} padraoTexto="em %" passo={100} definir={definir} tirar={tirar} ajuda={ajudaValor} />
      ) : (
        children
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Um editor por tipo
// ---------------------------------------------------------------------------

function EdVenda({
  m,
  r,
  rascunho,
  definir,
  tirar,
  mudarEstado,
}: {
  m: Modelo;
  r: ResultadoCompleto;
  rascunho: EstadoSimulador;
  definir: Definir;
  tirar: Tirar;
  mudarEstado: (f: (e: EstadoSimulador) => EstadoSimulador) => void;
}) {
  const p = m.premissas;
  const e = m.entrada;
  const o = m.opcoesVenda;
  const idInformado = useId();
  const [informado, setInformado] = useState<number | null>(p.baseVenda === "informado" ? p.valorVenda : null);
  const escolherBase = (b: "avaliacao" | "regiao" | "informado") => {
    if (b === "informado") {
      const v = informado ?? p.valorVenda ?? o.avaliacao ?? o.regiao?.valor ?? null;
      if (v !== null) {
        setInformado(v);
        definir("valorVenda", v);
      } else document.getElementById(idInformado)?.focus();
      return;
    }
    const padrao = o.avaliacao !== null ? "avaliacao" : "regiao";
    mudarEstado((x) => {
      const a = semAjuste(x.ajustes, "valorVenda", "baseVenda");
      return { ...x, ajustes: b === padrao ? a : { ...a, baseVenda: b } };
    });
  };
  const ref = m.referencia;
  const vendaM2 = p.valorVenda !== null && !p.areaEstimada && p.area > 0 ? p.valorVenda / p.area : null;
  // a mesma referência e a mesma medida (a média) da seção "Preço do m² na região"
  const mediaRef = ref ? mediaDe(ref) : null;

  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="text-[14px] font-semibold">Valor de referência da venda (100%)</legend>
        <p className="mt-0.5 text-[12.5px] text-nevoa">Os cenários são % deste valor. A avaliação do leilão não é preço de mercado: compare com anúncios parecidos.</p>
        <div className="mt-3 flex flex-col gap-2">
          <OpcaoRadio
            nome="sim-ed-base"
            ativo={p.baseVenda === "avaliacao"}
            desabilitado={o.avaliacao === null}
            aoEscolher={() => escolherBase("avaliacao")}
            titulo="Avaliação da fonte"
            detalhe={o.avaliacao !== null ? moeda(o.avaliacao) : "a fonte não informa"}
          />
          <OpcaoRadio
            nome="sim-ed-base"
            ativo={p.baseVenda === "regiao"}
            desabilitado={!o.regiao}
            aoEscolher={() => escolherBase("regiao")}
            titulo="Referência da região"
            detalhe={
              o.regiao
                ? `${porArea(o.regiao.m2, e.tipo)} × ${area(o.regiao.area)} = ${moeda(o.regiao.valor)} (${descricaoReferencia(o.regiao.referencia)})`
                : o.regiaoSemArea
                  ? "informe a área abaixo para usar"
                  : "sem referência da região para este tipo"
            }
          />
          <OpcaoRadio nome="sim-ed-base" ativo={p.baseVenda === "informado"} aoEscolher={() => escolherBase("informado")} titulo="Um valor que você informa" detalhe="por exemplo, de anúncios parecidos">
            <CampoNumero
              id={idInformado}
              valor={informado}
              prefixo="R$"
              min={LIMITES.valorVenda[0]}
              max={LIMITES.valorVenda[1]}
              passo={1000}
              placeholder="valor de venda"
              ariaLabel="Valor de venda que você informa"
              aoMudar={(n) => {
                setInformado(n);
                definir("valorVenda", n);
              }}
              aoEsvaziar={() => {
                setInformado(null);
                tirar("valorVenda");
              }}
              className="mt-2 w-full max-w-60"
            />
          </OpcaoRadio>
        </div>
        {vendaM2 !== null && (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-nevoa">
            Venda de 100% = <span className="font-semibold text-luar tabular-nums">{porArea(vendaM2, e.tipo)}</span>
            {mediaRef !== null && ref
              ? `. Referência da região, ${descricaoReferencia(ref)}: ${porArea(mediaRef, e.tipo)}, ${
                  Math.abs(vendaM2 / mediaRef - 1) < 0.03 ? "praticamente igual" : `${pct(Math.abs(vendaM2 / mediaRef - 1), 0)} ${vendaM2 > mediaRef ? "acima" : "abaixo"}`
                }.`
              : "."}
          </p>
        )}
      </fieldset>

      {/* a área entra na venda pela região, no R$/m² da comparação e no condomínio por m² */}
      <CampoArea m={m} definir={definir} tirar={tirar} />

      <fieldset>
        <legend className="text-[14px] font-semibold">% de venda em cada cenário</legend>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {(
            [
              ["conservador", "cenarioConservador"],
              ["base", "cenarioBase"],
              ["otimista", "cenarioOtimista"],
            ] as const
          ).map(([c, k]) => (
            <div key={k} className="min-w-0">
              <label htmlFor={`sim-ed-${k}`} className={`mb-1 block text-[12.5px] ${r.celula.cenario === c ? "font-semibold text-latao-texto" : "text-nevoa"}`}>
                {CENARIO_ROTULO[c]}
                {r.celula.cenario === c ? " · neste detalhe" : ""}
              </label>
              <CampoNumero
                id={`sim-ed-${k}`}
                valor={Math.round(p[k] * 1000) / 10}
                casas={1}
                min={10}
                max={300}
                passo={5}
                sufixo="%"
                aoMudar={(n) => definir(k, Math.round(n * 10) / 1000)}
                aoEsvaziar={() => tirar(k)}
                className="w-full"
              />
              <p className="mt-1 text-[11.5px] text-nevoa tabular-nums">{moedaCurta((p.valorVenda ?? 0) * p[k])}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          {p.vendaPersonalizada ? (
            <div>
              <p className={`text-[12.5px] ${r.celula.cenario === "personalizado" ? "font-semibold text-latao-texto" : "text-nevoa"}`}>
                Personalizado{r.celula.cenario === "personalizado" ? " · neste detalhe" : ""}
              </p>
              <EditorPersonalizado vp={p.vendaPersonalizada} referencia={p.valorVenda ?? 0} aoMudar={(v) => definir("vendaPersonalizada", v)} className="mt-1.5" />
              <button type="button" onClick={() => mudarEstado((x) => ({ ...x, ajustes: semAjuste(x.ajustes, "vendaPersonalizada"), celula: x.celula.cenario === "personalizado" ? { ...x.celula, cenario: "base" } : x.celula }))} className={`${BOTAO_LINK} mt-1 text-grave-texto!`}>
                Remover o cenário personalizado
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                definir("vendaPersonalizada", { modo: "valor", valor: Math.round((p.valorVenda ?? 0) / 1000) * 1000 || 1 });
                mudarEstado((x) => ({ ...x, celula: { ...x.celula, cenario: "personalizado" } }));
              }}
              className={BOTAO_LINK}
            >
              <IconeMais />
              Criar um cenário personalizado (em R$ ou %)
            </button>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[14px] font-semibold">Em quantos meses você vende</legend>
        <div className="mt-2.5 flex items-center gap-3">
          <CampoNumero
            valor={rascunho.celula.meses}
            min={LIMITES.prazo[0]}
            max={LIMITES.prazo[1]}
            passo={1}
            sufixo="meses"
            ariaLabel="Prazo de venda em meses"
            aoMudar={(n) => mudarEstado((x) => ({ ...x, celula: { ...x.celula, meses: Math.round(n) } }))}
            className="w-36"
          />
          <span className="text-[12.5px] text-nevoa">de 3 a 60 meses</span>
        </div>
      </fieldset>
    </div>
  );
}

function OpcaoRadio({
  nome,
  ativo,
  desabilitado,
  aoEscolher,
  titulo,
  detalhe,
  children,
}: {
  nome: string;
  ativo: boolean;
  desabilitado?: boolean;
  aoEscolher: () => void;
  titulo: string;
  detalhe?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border px-3.5 py-2.5 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-latao-texto ${
        ativo ? "border-latao bg-latao/12" : desabilitado ? "border-nevoa/15 opacity-60" : "border-nevoa/25 hover:border-nevoa/55"
      }`}
    >
      <label className={`flex items-start gap-3 ${desabilitado ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input type="radio" name={nome} checked={ativo} disabled={desabilitado} onChange={aoEscolher} className="mt-1 size-4 shrink-0 accent-[#c9a24d]" />
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold">{titulo}</span>
          {detalhe && <span className="mt-0.5 block text-[12.5px] leading-snug text-nevoa">{detalhe}</span>}
        </span>
      </label>
      {children && <div className="pl-7">{children}</div>}
    </div>
  );
}

function CampoArea({ m, definir, tirar }: { m: Modelo; definir: Definir; tirar: Tirar }) {
  const id = useId();
  const p = m.premissas;
  const rotulo = capitalizar(m.perfil.rotuloArea);
  const ajustado = m.ajustes.area !== undefined;
  return (
    <div>
      <Rotulo htmlFor={id} ajustado={ajustado} padrao={m.padrao.areaEstimada ? "não informada" : area(m.padrao.area)} aoRestaurar={() => tirar("area")}>
        {rotulo}
      </Rotulo>
      <CampoNumero
        id={id}
        valor={p.areaEstimada ? null : p.area}
        casas={2}
        sufixo="m²"
        min={LIMITES.area[0]}
        max={LIMITES.area[1]}
        passo={1}
        placeholder={p.areaEstimada ? `típica: ${area(p.area)}` : undefined}
        descritoPor={`${id}-ajuda`}
        aoMudar={(n) => definir("area", n)}
        aoEsvaziar={() => tirar("area")}
        className="mt-2.5 w-full max-w-48"
      />
      <Ajuda id={`${id}-ajuda`}>
        {p.areaEstimada
          ? `A fonte não informa a ${m.perfil.rotuloArea}. Usamos ${area(p.area)}, um tamanho típico, até você informar.`
          : ajustado
            ? "Área informada por você."
            : "Informada pela fonte. Corrija se a matrícula ou o edital disserem outra."}
      </Ajuda>
    </div>
  );
}

function EdIr({ m, definir, tirar }: { m: Modelo; r: ResultadoCompleto; definir: Definir; tirar: Tirar }) {
  const p = m.premissas;
  return (
    <div className="flex flex-col gap-5">
      <CampoPct
        k="irPct"
        m={m}
        rotulo="Alíquota sobre o ganho de capital"
        definir={definir}
        tirar={tirar}
        deslizante={[0, 34, 0.5]}
        ajuda="Pessoa física: 15% sobre o ganho (venda − corretagem − lance − comissão − ITBI − registro − reforma), só se houver ganho. Simplificação: não considera fatores de redução nem lucro presumido (empresa)."
      />
      <div className="rounded-2xl border border-nevoa/20 px-4 py-3">
        <Interruptor
          id="sim-ed-ir-isento"
          ligado={p.irIsento}
          rotulo="Tenho direito à isenção"
          descricao={
            <>
              A lei isenta, entre outros casos: a venda do único imóvel por até R$ 440 mil, sem outra venda nos últimos 5 anos; e o dinheiro usado para
              comprar outro imóvel residencial em até 180 dias. Confira com um contador.
            </>
          }
          aoMudar={(v) => (v ? definir("irIsento", true) : tirar("irIsento"))}
        />
      </div>
    </div>
  );
}

function EdComissao({ m, r, definir, tirar }: { m: Modelo; r: ResultadoCompleto; definir: Definir; tirar: Tirar }) {
  const e = m.entrada;
  const modalidade = e.modalidadeFonte ?? MODALIDADE_ROTULO[e.modalidade];
  const ajuda =
    m.padrao.comissaoPct === 0
      ? `“${modalidade}”: sem leiloeiro, normalmente sem comissão. Confira no edital.`
      : e.modalidade === "leilao" || e.judicial
        ? "Leilão com leiloeiro (como o “Leilão SFI” da Caixa e os judiciais): em geral 5% do lance, pagos à parte. Confira no edital."
        : "A fonte não deixa claro se há leiloeiro: por segurança, contamos 5% do lance. Confira no edital.";
  return (
    <PctOuValor
      m={m}
      kValor="comissaoValor"
      valorAtual={m.premissas.comissaoPct * lanceDaConta(m, r)}
      nome="sim-ed-comissao-modo"
      legenda="Como informar a comissão"
      rotuloValor="Comissão, em reais"
      ajudaValor="O valor que o edital ou o leiloeiro informa. Continua abatendo do imposto de renda."
      definir={definir}
      tirar={tirar}
    >
      <CampoPct k="comissaoPct" m={m} rotulo="Comissão, em % do lance" definir={definir} tirar={tirar} deslizante={[0, 10, 0.5]} ajuda={ajuda} />
    </PctOuValor>
  );
}

function EdItbi({ m, r, definir, tirar }: { m: Modelo; r: ResultadoCompleto; definir: Definir; tirar: Tirar }) {
  const p = m.premissas;
  const e = m.entrada;
  const temAv = e.avaliacao !== null && e.avaliacao > 0;
  return (
    <PctOuValor
      m={m}
      kValor="itbiValor"
      valorAtual={p.itbiPct * baseItbi(m, p, lanceDaConta(m, r))}
      nome="sim-ed-itbi-modo"
      legenda="Como informar o ITBI"
      rotuloValor="ITBI, em reais"
      ajudaValor={`O valor da guia do ITBI (a prefeitura de ${e.cidade} calcula pela inscrição do imóvel). Entra na conta como está e continua abatendo do imposto de renda.`}
      definir={definir}
      tirar={tirar}
    >
      <div className="flex flex-col gap-5">
        <CampoPct
          k="itbiPct"
          m={m}
          rotulo="Alíquota"
          definir={definir}
          tirar={tirar}
          deslizante={[0, 5, 0.5]}
          ajuda={`Imposto da prefeitura na transferência. A alíquota (em geral 2% a 3%) varia por município: confira com a prefeitura de ${e.cidade}.`}
        />
        <div>
          <p className="text-[14px] font-semibold">Sobre qual valor</p>
          <Segmentado<"lance" | "avaliacao" | "maior">
            className="mt-2.5"
            nome="sim-ed-itbi-base"
            legenda="Base de cálculo do ITBI"
            valor={p.itbiBase}
            tamanho="sm"
            aoMudar={(v) => (v === "lance" ? tirar("itbiBase") : definir("itbiBase", v))}
            opcoes={[
              { valor: "lance", rotulo: "Lance" },
              ...(temAv
                ? [
                    { valor: "avaliacao" as const, rotulo: "Avaliação", detalhe: moedaCurta(e.avaliacao!) },
                    { valor: "maior" as const, rotulo: "O maior dos dois" },
                  ]
                : []),
            ]}
          />
          <Ajuda>
            Muitas prefeituras cobram sobre o maior valor entre o preço pago e o valor venal (de referência) do imóvel; outras aceitam o valor do
            leilão (há decisões do STJ a favor do valor da arrematação). {temAv ? "" : "Sem avaliação na fonte, a base é o lance."}
          </Ajuda>
        </div>
      </div>
    </PctOuValor>
  );
}

function EdRegistro({ m, r, definir, tirar }: { m: Modelo; r: ResultadoCompleto; definir: Definir; tirar: Tirar }) {
  const p = m.premissas;
  return (
    <PctOuValor
      m={m}
      kValor="registroValor"
      valorAtual={Math.max(p.registroPct * lanceDaConta(m, r), p.registroMin)}
      nome="sim-ed-registro-modo"
      legenda="Como informar a escritura e o registro"
      rotuloValor="Escritura e registro, em reais"
      ajudaValor="O orçamento do cartório (escritura, quando há, e registro na matrícula). Continua abatendo do imposto de renda."
      definir={definir}
      tirar={tirar}
    >
      <div className="flex flex-col gap-5">
        <CampoPct k="registroPct" m={m} rotulo="% do lance" definir={definir} tirar={tirar} ajuda="Cartório: escritura (quando há) e registro na matrícula." />
        <CampoValor k="registroMin" m={m} rotulo="Mínimo" passo={500} definir={definir} tirar={tirar} ajuda={`Usamos o maior entre ${pct(p.registroPct)} do lance e este mínimo.`} />
      </div>
    </PctOuValor>
  );
}

function EdReforma({ m, definir, tirar, mudarEstado }: { m: Modelo; definir: Definir; tirar: Tirar; mudarEstado: (f: (e: EstadoSimulador) => EstadoSimulador) => void }) {
  const p = m.premissas;
  const perfil = m.perfil;
  const construido = perfil.modoReforma === "m2";
  const custo = custoReforma(p);
  const idUnit = useId();
  const nomeReforma = perfil.rotuloReforma.toLowerCase();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[14px] font-semibold">Nível</p>
        <Segmentado<NivelReforma>
          className="mt-2.5"
          nome="sim-ed-reforma-nivel"
          legenda={`Nível de ${nomeReforma}`}
          valor={p.reformaNivel}
          aoMudar={(n) =>
            mudarEstado((x) => {
              const a = semAjuste(x.ajustes, "reformaUnitario", "reformaNivel");
              return { ...x, ajustes: n === PADRAO.reformaNivel ? a : { ...a, reformaNivel: n } };
            })
          }
          opcoes={NIVEIS_REFORMA.map((n) => ({
            valor: n,
            rotulo: ROTULO_NIVEL[n],
            detalhe: p.reformaModo === "m2" ? `${moeda(reformaPadrao(perfil, n, "m2", p.area))}/m²` : moedaCurta(reformaPadrao(perfil, n, "fixo", p.area)),
          }))}
        />
        <p className="mt-2 text-[13px] text-nevoa">
          {ROTULO_NIVEL[p.reformaNivel]}: {perfil.descricaoNivel[p.reformaNivel]}.
        </p>
      </div>
      {construido && (
        <div>
          <p className="text-[14px] font-semibold">Como calcular</p>
          <Segmentado<"m2" | "fixo">
            className="mt-2.5 sm:max-w-sm"
            nome="sim-ed-reforma-modo"
            legenda="Como calcular a reforma"
            valor={p.reformaModo}
            tamanho="sm"
            aoMudar={(v) =>
              mudarEstado((x) => {
                const a = semAjuste(x.ajustes, "reformaUnitario", "reformaModo");
                return { ...x, ajustes: v === perfil.modoReforma ? a : { ...a, reformaModo: v } };
              })
            }
            opcoes={[
              { valor: "m2", rotulo: "Por m²" },
              { valor: "fixo", rotulo: "Valor total", detalhe: "um orçamento" },
            ]}
          />
        </div>
      )}
      <div>
        <Rotulo htmlFor={idUnit} ajustado={m.ajustes.reformaUnitario !== undefined} aoRestaurar={() => tirar("reformaUnitario")} padrao={p.reformaModo === "m2" ? `${moeda(m.padrao.reformaUnitario)}/m²` : moeda(m.padrao.reformaUnitario)}>
          {p.reformaModo === "m2" ? "Custo por m²" : "Valor total"}
        </Rotulo>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <CampoNumero
            id={idUnit}
            valor={p.reformaUnitario}
            prefixo="R$"
            sufixo={p.reformaModo === "m2" ? "/m²" : undefined}
            min={0}
            max={LIMITES.reformaUnitario[1]}
            passo={p.reformaModo === "m2" ? 50 : 500}
            aoMudar={(n) => definir("reformaUnitario", n)}
            aoEsvaziar={() => tirar("reformaUnitario")}
            className="w-full max-w-56"
          />
          {p.reformaModo === "m2" && (
            <p className="text-[14px] tabular-nums">
              × {area(p.area)} = <strong className="font-semibold">{moeda(custo)}</strong>
            </p>
          )}
        </div>
        <Ajuda>
          {perfil.notaReforma ? `${perfil.notaReforma} ` : ""}
          {construido
            ? "Valores genéricos: peça orçamento depois da visita (muitos imóveis de leilão não podem ser visitados antes da compra)."
            : perfil.tipo === "terreno"
              ? "Valor para deixar o lote pronto para vender: limpeza, cercamento ou muro."
              : "Valor para cercas, acesso e reparos das benfeitorias."}
        </Ajuda>
      </div>
      {p.reformaModo === "m2" && <CampoArea m={m} definir={definir} tirar={tirar} />}
    </div>
  );
}

function EdCondominio({
  m,
  r,
  definir,
  tirar,
  mudarEstado,
}: {
  m: Modelo;
  r: ResultadoCompleto;
  definir: Definir;
  tirar: Tirar;
  mudarEstado: (f: (e: EstadoSimulador) => EstadoSimulador) => void;
}) {
  const p = m.premissas;
  const perfil = m.perfil;
  const tem = perfil.condominioPadrao || p.emCondominio;
  return (
    <div className="flex flex-col gap-5">
      {perfil.opcaoCondominio && (
        <div className="rounded-2xl border border-nevoa/20 px-4 py-3">
          <Interruptor
            id="sim-ed-em-condominio"
            ligado={p.emCondominio}
            rotulo={perfil.opcaoCondominio}
            descricao={<>Liga a taxa de condomínio (estimada em {moeda(perfil.condominioM2, perfil.condominioM2 < 1)}/m² ao mês).</>}
            aoMudar={(v) =>
              mudarEstado((x) => {
                const a = semAjuste(x.ajustes, "condominio", "emCondominio");
                return { ...x, ajustes: v === m.padrao.emCondominio ? a : { ...a, emCondominio: v } };
              })
            }
          />
        </div>
      )}
      {tem ? (
        <>
          <CampoValor
            k="condominio"
            m={m}
            rotulo="Taxa por mês"
            unidade="mes"
            passo={50}
            definir={definir}
            tirar={tirar}
            ajuda={
              <>
                Estimativa: {moeda(perfil.condominioM2, perfil.condominioM2 < 1)} por m² ao mês
                {perfil.condominioMin > 0 ? `, mínimo ${moeda(perfil.condominioMin)}` : ""}
                {p.areaEstimada ? ` (com a área típica de ${area(p.area)})` : ""}. O valor certo está no edital ou com a administradora.
              </>
            }
          />
          <Meses k="mesesCondominio" m={m} r={r} definir={definir} tirar={tirar} />
        </>
      ) : (
        <Aviso tom="info">Sem condomínio. Ligue a opção acima se o imóvel estiver num condomínio.</Aviso>
      )}
    </div>
  );
}

function EdIptu({ m, r, definir, tirar }: { m: Modelo; r: ResultadoCompleto; definir: Definir; tirar: Tirar }) {
  const p = m.premissas;
  const e = m.entrada;
  const rot = m.perfil.rotuloImposto;
  const mensal = iptuMensal(m, p, e.lance);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[14px] font-semibold">Como informar</p>
        <Segmentado<"pct" | "valor">
          className="mt-2.5 sm:max-w-sm"
          nome="sim-ed-iptu-modo"
          legenda={`Como informar o ${rot}`}
          valor={p.iptuAnual === null ? "pct" : "valor"}
          tamanho="sm"
          aoMudar={(v) => (v === "pct" ? tirar("iptuAnual") : definir("iptuAnual", Math.round(mensal * 12)))}
          opcoes={[
            { valor: "pct", rotulo: "% ao ano", detalhe: "estimativa" },
            { valor: "valor", rotulo: "R$ por ano", detalhe: "do carnê" },
          ]}
        />
      </div>
      {p.iptuAnual === null ? (
        <CampoPct
          k="iptuPct"
          m={m}
          rotulo={`${rot}, em % ao ano`}
          unidade="aa"
          casas={2}
          definir={definir}
          tirar={tirar}
          ajuda={
            <>
              {pct(p.iptuPct, 2)} ao ano {e.avaliacao ? "do valor de avaliação" : "do lance mínimo (a fonte não dá a avaliação)"} ={" "}
              <strong className="font-semibold text-luar">{moedaMes(mensal)} por mês</strong>.{" "}
              {rot === "ITR" ? "O ITR é federal e costuma ser baixo." : "Varia muito por cidade: o carnê do IPTU dá o valor certo."}
            </>
          }
        />
      ) : (
        <CampoValor
          k="iptuAnual"
          m={m}
          rotulo={`${rot} por ano`}
          unidade="ano"
          passo={100}
          padraoTexto="% ao ano"
          definir={definir}
          tirar={tirar}
          ajuda={
            <>
              = <strong className="font-semibold text-luar">{moedaMes(mensal)} por mês</strong>. Use o valor do carnê (a prefeitura informa pelo número
              de inscrição do imóvel).
            </>
          }
        />
      )}
      <Meses k="mesesIptu" m={m} r={r} definir={definir} tirar={tirar} />
    </div>
  );
}

function EdDesocupacao({ m, definir, tirar }: { m: Modelo; definir: Definir; tirar: Tirar }) {
  const e = m.entrada;
  const ajuda =
    e.ocupacao === "ocupado"
      ? "A fonte informa que o imóvel está ocupado. O valor cobre um acordo com quem mora (ajuda de mudança) ou a ação na Justiça (advogado e custas)."
      : m.ocupado
        ? "A análise do edital indica que o imóvel está ocupado. O valor cobre um acordo com quem mora ou a ação na Justiça."
        : e.ocupacao === "desocupado"
          ? "A fonte informa que o imóvel está desocupado: confirme na visita e no edital antes de contar com isso."
          : "A fonte não informa a ocupação. Se você souber que está ocupado, inclua aqui um valor para o acordo ou a ação na Justiça.";
  return (
    <CampoValor
      k="desocupacao"
      m={m}
      rotulo="Valor"
      definir={definir}
      tirar={tirar}
      ajuda={ajuda}
      aviso={<Aviso tom="info">Desocupar pode levar meses. Se o imóvel estiver ocupado, use um prazo de venda maior (18 ou 24 meses).</Aviso>}
    />
  );
}

function EdDividas({ m, plano, aoPedirLuneta, definir, tirar }: { m: Modelo; plano: Plano; aoPedirLuneta?: () => void; definir: Definir; tirar: Tirar }) {
  const p = m.premissas;
  return (
    <CampoValor
      k="dividas"
      m={m}
      rotulo="Valor das dívidas"
      definir={definir}
      tirar={tirar}
      ajuda="Condomínio, IPTU e outras dívidas que o edital manda o comprador pagar. Muda caso a caso: confira no edital, com a administradora ou com a prefeitura."
      aviso={
        m.dividasApontadas.length > 0 ? (
          m.ajustes.dividas === undefined ? (
            <Aviso>
              A análise aponta <strong className="font-semibold">{juntar(m.dividasApontadas)}</strong>. Informe o valor que passa a você; se não houver,
              informe 0.
            </Aviso>
          ) : (
            <Aviso tom="info">
              A análise aponta {juntar(m.dividasApontadas)}: você informou {moeda(p.dividas)}.
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
        ) : null
      }
    />
  );
}

function EdLance({
  m,
  r,
  rascunho,
  definir,
  tirar,
  mudarEstado,
}: {
  m: Modelo;
  r: ResultadoCompleto;
  rascunho: EstadoSimulador;
  definir: Definir;
  tirar: Tirar;
  mudarEstado: (f: (e: EstadoSimulador) => EstadoSimulador) => void;
}) {
  const p = m.premissas;
  const e = m.entrada;
  const lance = e.lance;
  const pal = palavrasPreco(e);
  const qual: "minimo" | "teto" | "outro" = !pal.fixo && rascunho.lanceDetalhe === "teto" && r.teto !== null ? "teto" : rascunho.meuLance === null ? "minimo" : "outro";
  const [outro, setOutro] = useState<number | null>(rascunho.meuLance);
  const sim = r.detalhe?.sim ?? null;
  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="text-[14px] font-semibold">Qual {pal.lance} usar na conta</legend>
        {pal.fixo && <p className="mt-0.5 text-[12.5px] text-nevoa">Na venda direta o preço é fixo: não há disputa, então ele não sobe. Outro valor serve só para comparar.</p>}
        <div className="mt-2.5 flex flex-col gap-2">
          <OpcaoRadio
            nome="sim-ed-lance"
            ativo={qual === "minimo"}
            aoEscolher={() => mudarEstado((x) => ({ ...x, meuLance: null, lanceDetalhe: "meu" }))}
            titulo={pal.fixo ? "Preço pedido" : "Lance mínimo atual"}
            detalhe={moeda(lance)}
          />
          {!pal.fixo && (
            <OpcaoRadio
              nome="sim-ed-lance"
              ativo={qual === "teto"}
              desabilitado={r.teto === null}
              aoEscolher={() => mudarEstado((x) => ({ ...x, lanceDetalhe: "teto" }))}
              titulo="Seu lance máximo para a meta"
              detalhe={r.teto !== null ? moeda(r.teto) : "nenhum lance atinge a meta"}
            />
          )}
          <OpcaoRadio
            nome="sim-ed-lance"
            ativo={qual === "outro"}
            aoEscolher={() => mudarEstado((x) => ({ ...x, meuLance: outro ?? Math.round(lance), lanceDetalhe: "meu" }))}
            titulo="Outro valor"
            detalhe={pal.fixo ? "para comparar; vale também para a tabela, na visão “Lucro pelo preço”" : "vale também para a tabela, na visão “Lucro com meu lance”"}
          >
            <CampoNumero
              valor={qual === "outro" ? rascunho.meuLance : outro}
              prefixo="R$"
              min={0}
              max={1e10}
              passo={1000}
              placeholder={pal.fixo ? "outro preço" : "seu lance"}
              ariaLabel={pal.fixo ? "Outro preço, para comparar" : "Outro valor de lance"}
              aoMudar={(n) => {
                setOutro(n);
                mudarEstado((x) => ({ ...x, meuLance: n, lanceDetalhe: "meu" }));
              }}
              className="mt-2 w-full max-w-60"
            />
          </OpcaoRadio>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[14px] font-semibold">Como você paga</legend>
        {m.podeFinanciar || m.podeParcelar ? (
          <>
            <Segmentado<"vista" | "banco" | "fonte">
              className="mt-2.5"
              nome="sim-ed-forma"
              legenda={`Como você paga o ${pal.lance}`}
              valor={p.parcelar ? "fonte" : p.financiar ? "banco" : "vista"}
              aoMudar={(v) =>
                mudarEstado((x) => {
                  const y = semAjuste(x.ajustes, "financiar", "parcelar");
                  return { ...x, ajustes: v === "fonte" ? { ...y, parcelar: true } : v === "banco" ? { ...y, financiar: true } : y };
                })
              }
              opcoes={[
                { valor: "vista", rotulo: "À vista" },
                ...(m.podeParcelar ? [{ valor: "fonte" as const, rotulo: "Parcelamento", detalhe: "da fonte" }] : []),
                ...(m.podeFinanciar ? [{ valor: "banco" as const, rotulo: "Financiamento", detalhe: "banco (SAC)" }] : []),
              ]}
            />
            <Ajuda>
              {m.podeParcelar
                ? "A fonte oferece parcelamento: no leilão judicial, em geral pelo menos 25% de entrada e o resto em até 30 parcelas mensais corrigidas por um índice (art. 895 do CPC), com o próprio imóvel como garantia. À vista é o mais conservador."
                : "A fonte indica que este imóvel aceita financiamento. A prazo, a conta usa entrada + parcelas, e o saldo é quitado com o dinheiro da venda."}
            </Ajuda>
            {p.parcelar && (
              <div className="mt-4 flex flex-col gap-5 rounded-2xl border border-nevoa/15 p-4">
                <CampoPct k="parcelasEntradaPct" m={m} rotulo="Entrada" definir={definir} tirar={tirar} deslizante={[5, 100, 5]} casas={0} ajuda={e.condicoesPagamento ? "O padrão vem das condições informadas pela fonte." : "O mínimo da lei é 25%; o edital pode pedir mais."} />
                <CampoNumeroSimples k="parcelasN" m={m} rotulo="Número de parcelas" sufixo="parcelas" definir={definir} tirar={tirar} ajuda={e.condicoesPagamento ? "O padrão vem das condições da fonte." : "A lei permite até 30."} />
                <CampoPct k="parcelasCorrecaoAA" m={m} rotulo="Correção das parcelas ao ano" unidade="aa" casas={2} definir={definir} tirar={tirar} deslizante={[0, 15, 0.5]} ajuda="Estimativa do índice que corrige as parcelas (o edital diz qual: em geral o IPCA, perto de 4,5% ao ano). Juros, se houver, entram aqui." />
                {sim?.financiamento?.tipo === "fonte" && (
                  <p className="rounded-xl bg-noite/60 px-3 py-2.5 text-[13px] leading-relaxed text-nevoa">
                    Entrada de <strong className="font-semibold text-luar">{moeda(sim.financiamento.entrada)}</strong> e primeira parcela de{" "}
                    <strong className="font-semibold text-luar">{moeda(sim.financiamento.primeiraParcela)}</strong>; em {meses(sim.meses)},{" "}
                    {sim.financiamento.parcelasPagas} parcelas pagas e {moeda(sim.financiamento.saldoDevedor)} quitados na venda.
                  </p>
                )}
              </div>
            )}
            {p.financiar && (
              <div className="mt-4 flex flex-col gap-5 rounded-2xl border border-nevoa/15 p-4">
                <CampoPct k="entradaPct" m={m} rotulo="Entrada" definir={definir} tirar={tirar} deslizante={[5, 100, 5]} casas={0} ajuda="Parte do lance paga com dinheiro próprio. O banco define o mínimo." />
                <CampoPct k="jurosAA" m={m} rotulo="Juros ao ano" unidade="aa" casas={2} definir={definir} tirar={tirar} deslizante={[0, 20, 0.25]} ajuda="Taxa efetiva ao ano (padrão 11,5%). Consulte a taxa do seu banco." />
                <CampoNumeroSimples k="prazoFinanciamento" m={m} rotulo="Prazo do financiamento" sufixo="meses" passo={12} definir={definir} tirar={tirar} ajuda="Prazo total. As parcelas correm até a venda; o que falta pagar sai do dinheiro da venda." />
                <CampoValor k="segurosMensal" m={m} rotulo="Seguros e tarifa do banco" unidade="mes" passo={10} definir={definir} tirar={tirar} ajuda="Seguros obrigatórios (morte e invalidez, danos ao imóvel) e tarifa mensal: estimativa. Variam com a idade e o banco." />
                {sim?.financiamento?.tipo === "banco" && (
                  <p className="rounded-xl bg-noite/60 px-3 py-2.5 text-[13px] leading-relaxed text-nevoa">
                    Primeira parcela de <strong className="font-semibold text-luar">{moeda(sim.financiamento.primeiraParcela)}</strong>; em {meses(sim.meses)},{" "}
                    {moeda(sim.financiamento.jurosPagos)} de juros e saldo de {moeda(sim.financiamento.saldoDevedor)} quitado na venda.
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <Aviso tom="info" className="mt-2.5">
            {e.financiamento === false
              ? "A fonte não indica financiamento para este imóvel: a simulação é à vista."
              : "A fonte não informa se este imóvel aceita financiamento: a simulação é à vista."}
          </Aviso>
        )}
        {e.condicoesPagamento && (
          <Aviso tom="info" className="mt-3">
            <span className="font-semibold">Condições informadas pela fonte:</span> “{e.condicoesPagamento.trim().replace(/[.;\s]+$/, "")}”. Confira no edital.
          </Aviso>
        )}
      </fieldset>
    </div>
  );
}

function CampoNumeroSimples({
  k,
  m,
  rotulo,
  sufixo,
  passo = 1,
  ajuda,
  definir,
  tirar,
}: {
  k: "parcelasN" | "prazoFinanciamento";
  m: Modelo;
  rotulo: string;
  sufixo: string;
  passo?: number;
  ajuda: string;
  definir: Definir;
  tirar: Tirar;
}) {
  const id = useId();
  const lim = LIMITES[k];
  return (
    <div>
      <Rotulo htmlFor={id} ajustado={m.ajustes[k] !== undefined && m.ajustes[k] !== m.padrao[k]} padrao={`${m.padrao[k]} ${sufixo}`} aoRestaurar={() => tirar(k)}>
        {rotulo}
      </Rotulo>
      <CampoNumero id={id} valor={m.premissas[k]} min={lim[0]} max={lim[1]} passo={passo} sufixo={sufixo} descritoPor={`${id}-ajuda`} aoMudar={(n) => definir(k, Math.round(n))} aoEsvaziar={() => tirar(k)} className="mt-2.5 w-44" />
      <Ajuda id={`${id}-ajuda`}>{ajuda}</Ajuda>
    </div>
  );
}

const MODO_EXTRA: { valor: ModoCustoExtra; rotulo: string; detalhe: string }[] = [
  { valor: "fixo", rotulo: "Valor fixo", detalhe: "uma vez" },
  { valor: "pct_lance", rotulo: "% do lance", detalhe: "sobe com o lance" },
  { valor: "mensal", rotulo: "Por mês", detalhe: "até vender" },
];

function EdExtra({
  novo,
  extra,
  setExtra,
  m,
  presets,
  aoEscolherPreset,
  meses: prazo,
}: {
  novo: boolean;
  extra: CustoExtra;
  setExtra: (f: (x: CustoExtra) => CustoExtra) => void;
  m: Modelo;
  presets: ResultadoCompleto["adicionaveis"];
  aoEscolherPreset: (ed: "desocupacao" | "dividas" | "condominio") => void;
  meses: number;
}) {
  const idNome = useId();
  const idValor = useId();
  const L = m.entrada.lance;
  const nomeValido = RE_ID_EXTRA.test(extra.id);
  return (
    <div className="flex flex-col gap-6">
      {novo && presets.length > 0 && (
        <div>
          <p className="text-[14px] font-semibold">Custos comuns que não estão na conta</p>
          <div className="mt-2.5 flex flex-col gap-2">
            {presets.map((a) => (
              <button
                key={a.editor}
                type="button"
                onClick={() => aoEscolherPreset(a.editor)}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-nevoa/25 px-3.5 py-2.5 text-left transition-colors hover:border-latao hover:bg-latao/8"
              >
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-latao/60 text-latao-texto">
                  <IconeMais />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{a.rotulo}</span>
                  <span className="block text-[12.5px] leading-snug text-nevoa">{a.descricao}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-5 text-[14px] font-semibold">Ou crie um custo seu</p>
        </div>
      )}
      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor={idNome} className="text-[14px] font-semibold">
            Nome do custo
          </label>
          <input
            id={idNome}
            type="text"
            maxLength={60}
            value={extra.nome}
            placeholder="ex.: laudo de vistoria, assessoria jurídica, mudança"
            onChange={(e) => setExtra((x) => ({ ...x, nome: e.target.value }))}
            // 16 px no toque: o Safari do iPhone não amplia a página ao focar
            className="mt-2.5 h-11 w-full rounded-xl border border-nevoa/30 bg-noite px-3 text-base text-luar outline-none placeholder:text-nevoa/70 hover:border-nevoa/50 focus:border-latao-texto focus:ring-2 focus:ring-latao/35 pointer-fine:h-10 pointer-fine:text-[15px]"
          />
        </div>
        <div>
          <p className="text-[14px] font-semibold">Como cobrar</p>
          <Segmentado<ModoCustoExtra>
            className="mt-2.5"
            nome="sim-ed-extra-modo"
            legenda="Como cobrar o custo"
            valor={extra.modo}
            tamanho="sm"
            aoMudar={(modo) => setExtra((x) => ({ ...x, modo, valor: modo === "pct_lance" ? (x.modo === "pct_lance" ? x.valor : 0.01) : x.modo === "pct_lance" ? 0 : x.valor }))}
            opcoes={MODO_EXTRA}
          />
        </div>
        <div>
          <label htmlFor={idValor} className="text-[14px] font-semibold">
            {extra.modo === "pct_lance" ? "Percentual do lance" : extra.modo === "mensal" ? "Valor por mês" : "Valor"}
          </label>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            {extra.modo === "pct_lance" ? (
              <CampoNumero
                id={idValor}
                valor={Math.round(extra.valor * 1e6) / 1e4}
                casas={2}
                sufixo="%"
                min={0}
                max={100}
                passo={0.5}
                aoMudar={(n) => setExtra((x) => ({ ...x, valor: Math.round(n * 1e4) / 1e6 }))}
                className="w-32"
              />
            ) : (
              <CampoNumero
                id={idValor}
                valor={extra.valor || null}
                prefixo="R$"
                sufixo={extra.modo === "mensal" ? "/mês" : undefined}
                min={0}
                max={extra.modo === "mensal" ? LIMITES.extraMensal[1] : LIMITES.extraFixo[1]}
                passo={extra.modo === "mensal" ? 10 : 100}
                placeholder="0"
                aoMudar={(n) => setExtra((x) => ({ ...x, valor: n }))}
                className="w-full max-w-56"
              />
            )}
            <span className="text-[12.5px] text-nevoa tabular-nums">
              {extra.modo === "pct_lance" && extra.valor > 0 ? `= ${moeda(extra.valor * L)} com o ${palavrasPreco(m.entrada).minimo}` : extra.modo === "mensal" && extra.valor > 0 ? `= ${moeda(extra.valor * prazo)} em ${meses(prazo)}` : ""}
            </span>
          </div>
        </div>
        {!nomeValido && <Aviso>Não deu para criar o custo. Feche e tente de novo.</Aviso>}
        <p className="text-[12.5px] leading-relaxed text-nevoa">
          O custo entra na conta, no dinheiro investido e no lance máximo. Por segurança, não abate o imposto de renda (só os custos com nota, como a
          reforma, costumam abater).
        </p>
      </div>
    </div>
  );
}
