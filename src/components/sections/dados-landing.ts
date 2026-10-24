/**
 * Os números das miniaturas da landing ("Decida com números" e "Nota de localização"), calculados no build com o código
 * de verdade, sem nada digitado à mão e sem JavaScript no navegador:
 * - o lance máximo e a matriz: o simulador (src/lib/simulador) com o estado inicial, sobre o exemplo fictício "alvo-sp",
 *   o mesmo que a demonstração (/assinante/imovel/ex-alvo-sp) mostra; a matriz na visão que a página abre, o lucro com o
 *   lance mínimo (rodada 5, decisão 6);
 * - a nota: a nota fictícia do mesmo exemplo (src/content/examples.ts), montada por localizacaoExemplo, com os pesos de
 *   PESOS_PADRAO (src/lib/catalogo/localizacao.ts);
 * - o ITBI: as cidades e o total de compras dos arquivos de base/saida/site/itbi.
 *
 * Sem "@/" (os testes rodam em Node): quem chama passa os exemplos (LISTINGS).
 */
import { converterExemplos, localizacaoDosExemplos } from "../../lib/catalogo/exemplos";
import { lerItbi } from "../../lib/catalogo/itbi";
import type { LocalizacaoImovel } from "../../lib/catalogo/tipos";
import { atingeMeta } from "../../lib/simulador/calculo";
import { simulacaoCompleta } from "../../lib/simulador/completa";
import { ESTADO_INICIAL } from "../../lib/simulador/estado";
import { CENARIO_ROTULO, metaComoObjetivo } from "../../lib/simulador/textos";
import type { CenarioFixo } from "../../lib/simulador/tipos";
import type { Listing } from "../../content/examples";

/** O exemplo das miniaturas (id em src/content/examples.ts; no catálogo, "ex-alvo-sp"). */
export const EXEMPLO_LANDING = "alvo-sp";

export interface CelulaMini {
  meses: number;
  /** lance máximo para a meta (null: nenhum lance atinge) */
  teto: number | null;
  /** o lance máximo fica acima do lance mínimo (há espaço para disputar) */
  atinge: boolean;
  /**
   * A visão que a tabela "Cenários e prazos" abre na página do imóvel desde a rodada 5 (decisão 6): o lucro com o lance
   * mínimo (o lance da pessoa, que começa no mínimo), depois do IR, e o retorno ao ano. Os mesmos números da página
   * /assinante/imovel/ex-alvo-sp#simulador.
   */
  lucro: number;
  roiAA: number;
  /** com o lance mínimo, o retorno atinge a meta (o ✓ da tabela da página) */
  atingeMeta: boolean;
  /** a célula do cartão (cenário e prazo do estado inicial) */
  escolhida: boolean;
}

export interface MiniSimulador {
  titulo: string;
  /** "Vila Mariana · São Paulo/SP" */
  lugar: string;
  /** "render 20% ao ano" */
  objetivo: string;
  meses: number;
  /** "base" */
  cenario: string;
  teto: number;
  lanceMinimo: number;
  /** teto − lance mínimo */
  folga: number;
  colunas: number[];
  linhas: { cenario: CenarioFixo; rotulo: string; celulas: CelulaMini[] }[];
}

function exemplo(listings: readonly Listing[]): Listing {
  const l = listings.find((x) => x.id === EXEMPLO_LANDING);
  if (!l) throw new Error(`landing: o exemplo ${EXEMPLO_LANDING} sumiu de src/content/examples.ts`);
  return l;
}

/** O cartão "Seu lance máximo" do exemplo, como o simulador da página do imóvel mostra ao abrir. */
export function miniSimulador(listings: readonly Listing[], agora: Date = new Date()): MiniSimulador {
  const l = exemplo(listings);
  const d = converterExemplos(listings, agora).find((x) => x.id === `ex-${EXEMPLO_LANDING}`)!;
  const r = simulacaoCompleta(d, ESTADO_INICIAL);
  if (r.semDisputa || r.teto === null || !r.tabela) throw new Error(`landing: o exemplo ${EXEMPLO_LANDING} precisa de um lance máximo`);
  const tabela = r.tabela;
  return {
    titulo: l.title,
    lugar: l.place,
    objetivo: metaComoObjetivo(r.meta),
    meses: r.celula.meses,
    cenario: CENARIO_ROTULO[r.celula.cenario].toLowerCase(),
    teto: r.teto,
    lanceMinimo: d.lance,
    folga: r.teto - d.lance,
    colunas: r.colunas,
    linhas: r.linhas
      .filter((c): c is CenarioFixo => c !== "personalizado")
      .map((c) => ({
        cenario: c,
        rotulo: CENARIO_ROTULO[c],
        celulas: tabela[r.linhas.indexOf(c)]!.map((cel) => ({
          meses: cel.meses,
          teto: cel.teto,
          atinge: cel.teto !== null && cel.teto >= d.lance,
          lucro: Math.round(cel.comMeuLance.lucro),
          roiAA: cel.comMeuLance.roiAA,
          atingeMeta: atingeMeta(cel.comMeuLance, r.meta),
          escolhida: c === r.celula.cenario && cel.meses === r.celula.meses,
        })),
      })),
  };
}

export interface MiniNota {
  /** "Vila Mariana · São Paulo/SP" */
  lugar: string;
  /** "São Paulo/SP" (a cidade da comparação) */
  cidade: string;
  loc: LocalizacaoImovel & { nota: number };
}

/** A nota fictícia do exemplo, exatamente a que a página do imóvel da demonstração mostra. */
export function miniNota(listings: readonly Listing[], agora: Date = new Date()): MiniNota {
  const l = exemplo(listings);
  const loc = localizacaoDosExemplos(listings, agora).get(`ex-${EXEMPLO_LANDING}`);
  if (!loc || loc.nota === null || !loc.referencia) throw new Error(`landing: o exemplo ${EXEMPLO_LANDING} precisa de uma nota de localização`);
  return { lugar: l.place, cidade: loc.referencia.nome, loc: { ...loc, nota: loc.nota } };
}

export interface ResumoItbi {
  /** da que tem mais compras para a que tem menos */
  cidades: { cidade: string; uf: string; transacoes: number }[];
  transacoes: number;
}

/** As cidades com o preço pago (ITBI) e o total de compras, lidos dos arquivos (sem `pasta`, os do instantâneo). */
export async function resumoItbi(pasta?: string): Promise<ResumoItbi> {
  const dados = await lerItbi(pasta);
  const cidades = [...dados.porCidade.values()]
    .map((a) => ({ cidade: a.cidade, uf: a.uf, transacoes: a.fonte.transacoes }))
    .sort((a, b) => b.transacoes - a.transacoes || a.cidade.localeCompare(b.cidade, "pt-BR"));
  return { cidades, transacoes: cidades.reduce((s, c) => s + c.transacoes, 0) };
}

const MIL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** "203 mil" (arredondado para baixo: nunca promete mais do que tem); abaixo de mil, o número. */
export function totalCurto(n: number): string {
  return n >= 1000 ? `${MIL.format(Math.floor(n / 1000))} mil` : MIL.format(n);
}

/** "a", "a e b", "a, b e c" */
export function juntar(itens: readonly string[]): string {
  return itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}
