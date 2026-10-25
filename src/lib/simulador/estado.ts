/**
 * Estado do simulador de um imóvel: o que a pessoa escolheu e ajustou, guardado no navegador (localStorage).
 * Puro (sem React, sem "@/"): a tela (src/components/simulador/estado.ts) e o relatório em PDF leem pelo
 * mesmo `interpretarEstado`.
 *
 * Chave:  "luneta:simulador:v2:<id do imóvel>"   (ex.: "luneta:simulador:v2:caixa-1444419640129")
 * Valor:  JSON
 *   {
 *     "v": 2,
 *     "meta":   { "tipo": "lucro" | "roi_periodo" | "roi_aa" | "roi_am", "valor": number },
 *               // lucro em R$; as outras em fração (0.2 = 20%): no total, ao ano ou ao mês
 *     "celula": { "cenario": "conservador" | "base" | "otimista" | "personalizado", "meses": number },
 *               // o cenário e o prazo de venda do cartão "Seu lance máximo" e da célula escolhida na matriz
 *     "visao":  "teto" | "lucro" | null,   // o que a matriz mostra; null = a pessoa nunca escolheu: vale o
 *                                          // padrão (VISAO_PADRAO em completa.ts: o lucro com o lance da pessoa;
 *                                          // até a rodada 4, o leilão abria no lance máximo)
 *     "meuLance": number | null,           // lance escolhido pela pessoa; null = o lance mínimo atual
 *     "lanceDetalhe": "meu" | "teto",      // o Detalhe usa o lance da pessoa (ou o mínimo) ou o lance máximo
 *     "ajustes": {                         // só o que a pessoa trocou; o resto é o padrão (premissas.ts)
 *       // números (frações para %, reais para valores):
 *       "area", "comissaoPct", "itbiPct", "registroPct", "registroMin", "reservaPct", "desocupacao", "dividas",
 *       "reformaUnitario", "condominio", "iptuPct", "iptuAnual" (R$/ano), "contas", "valorVenda" (R$, 100%),
 *       "cenarioConservador", "cenarioBase", "cenarioOtimista", "corretagemPct", "irPct", "aplicacaoAA",
 *       "entradaPct", "jurosAA", "prazoFinanciamento", "segurosMensal", "parcelasEntradaPct", "parcelasN",
 *       "parcelasCorrecaoAA", "mesesCondominio", "mesesIptu", "mesesContas" (meses de cada custo mensal),
 *       "comissaoValor", "itbiValor", "registroValor", "reservaValor", "corretagemValor" (R$ no lugar do %),
 *       // escolhas:
 *       "reformaNivel": "nenhuma" | "leve" | "media" | "pesada", "reformaModo": "m2" | "fixo",
 *       "itbiBase": "lance" | "avaliacao" | "maior", "baseVenda": "avaliacao" | "regiao",
 *       "emCondominio", "financiar", "parcelar", "irIsento": boolean,
 *       "prazos": [number, number, number, number],         // colunas da matriz, 3 a 60 meses
 *       "vendaPersonalizada": { "modo": "pct" | "valor", "valor": number },
 *       "custosExtras": [{ "id": "a1b2", "nome": "Laudo", "modo": "fixo" | "pct_lance" | "mensal", "valor": number }],
 *       "desligados": ["itbi", "reserva", "extra:a1b2", ...] // linhas tiradas da conta (o valor fica guardado)
 *     }
 *   }
 *
 * Tudo o que vem do navegador passa por `limparAjustes`/`limparMeta`: valor fora da faixa é descartado (vale
 * o padrão), nunca quebra a página. A versão 1 ("luneta:simulador:v1:<id>", com `celula.prazo` = índice da
 * coluna) é lida e convertida enquanto a v2 não existir.
 */
import { LIMITES, limparAjustes, limparMeta, META_PADRAO, PADRAO } from "./premissas";
import { TODOS_CENARIOS, type Ajustes, type Celula, type Meta } from "./tipos";

/** Matriz: lance máximo para a meta, ou lucro e ROI com o lance escolhido. */
export type Visao = "teto" | "lucro";
/** Com qual lance o Detalhe faz a conta. */
export type LanceDetalhe = "meu" | "teto";

export interface EstadoSimulador {
  ajustes: Ajustes;
  meta: Meta;
  celula: Celula;
  /** o que a matriz mostra; null = a pessoa nunca escolheu (vale o padrão, resolvido em `completarModelo`) */
  visao: Visao | null;
  /** lance escolhido pela pessoa; null = o lance mínimo atual */
  meuLance: number | null;
  lanceDetalhe: LanceDetalhe;
}

export const ESTADO_INICIAL: EstadoSimulador = {
  ajustes: {},
  meta: META_PADRAO,
  celula: { cenario: "base", meses: 12 },
  visao: null,
  meuLance: null,
  lanceDetalhe: "meu",
};

export const PREFIXO_ESTADO = "luneta:simulador:v2:";
export const PREFIXO_ESTADO_V1 = "luneta:simulador:v1:";

/** Chave do localStorage do simulador de um imóvel. */
export function chaveEstado(id: string): string {
  return PREFIXO_ESTADO + id;
}

/** Prazo de venda aceito (inteiro, 3 a 60 meses). */
export function prazoValido(m: unknown): m is number {
  return Number.isInteger(m) && (m as number) >= LIMITES.prazo[0] && (m as number) <= LIMITES.prazo[1];
}

/**
 * Lê o JSON guardado (v2, ou v1 quando `versao1`) e devolve um estado válido. Nunca lança: o que não der para
 * ler volta ao estado inicial.
 */
export function interpretarEstado(bruto: string | null, versao1 = false): EstadoSimulador {
  if (!bruto) return ESTADO_INICIAL;
  try {
    const o = JSON.parse(bruto) as Record<string, unknown>;
    if (!o || typeof o !== "object") return ESTADO_INICIAL;
    const ajustes = limparAjustes(o.ajustes);
    const c = (o.celula ?? {}) as Record<string, unknown>;
    const cenario = TODOS_CENARIOS.includes(c.cenario as Celula["cenario"]) ? (c.cenario as Celula["cenario"]) : ESTADO_INICIAL.celula.cenario;
    let meses = ESTADO_INICIAL.celula.meses;
    if (prazoValido(c.meses)) meses = c.meses;
    else if (versao1 && Number.isInteger(c.prazo)) {
      // v1: índice da coluna da matriz
      const prazos = ajustes.prazos ?? PADRAO.prazos;
      const m = prazos[c.prazo as number];
      if (prazoValido(m)) meses = m;
    }
    const meuLance = typeof o.meuLance === "number" && Number.isFinite(o.meuLance) && o.meuLance >= 0 && o.meuLance < 1e11 ? o.meuLance : null;
    return {
      ajustes,
      meta: limparMeta(o.meta),
      celula: { cenario, meses },
      visao: o.visao === "lucro" || o.visao === "teto" ? o.visao : null,
      meuLance,
      lanceDetalhe: o.lanceDetalhe === "teto" ? "teto" : "meu",
    };
  } catch {
    return ESTADO_INICIAL;
  }
}

/**
 * O estado ao abrir a conta linha a linha por um "Editar custos ↓" (revisão da rodada 6): a conta passa a usar o
 * mesmo lance da conta "lance + custos = total" ao lado do link, o lance máximo no cartão e o seu lance no "Meu
 * lance". Assim a pessoa vê, linha a linha, os mesmos custos que acabou de ler (antes, o cartão dizia "R$ 60.352 de
 * custos" e a conta aberta mostrava os do lance mínimo). Sem lance máximo (nenhum lance atinge a meta), ou já com o
 * mesmo lance, devolve o próprio estado (nada a gravar).
 */
export function lanceDaContaPeloLink(e: EstadoSimulador, lance: LanceDetalhe, temTeto: boolean): EstadoSimulador {
  if (e.lanceDetalhe === lance || (lance === "teto" && !temTeto)) return e;
  return { ...e, lanceDetalhe: lance };
}

/** O texto que vai para o localStorage. */
export function serializarEstado(e: EstadoSimulador): string {
  return JSON.stringify({ v: 2, ...e });
}

/** Tira chaves dos ajustes (voltam ao padrão). */
export function semAjuste(a: Ajustes, ...chaves: (keyof Ajustes)[]): Ajustes {
  const novo = { ...a };
  for (const k of chaves) delete novo[k];
  return novo;
}
