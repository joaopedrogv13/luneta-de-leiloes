/**
 * Estação de metrô, trem ou VLT perto do imóvel (rodada 5, decisão 11): a tag positiva "Metrô a 450 m" (e "Trem a…",
 * "VLT a…"), o filtro "Metrô a até 1 km" e a frase "Estação de metrô Botafogo a 450 m" da seção de localização.
 *
 * O dado vem de base/fontes/localizacao/estacoes.py: as colunas `metro_m`, `trem_m` e `vlt_m` (com o nome da estação) do
 * localizacao-osm.json.gz, do OpenStreetMap (ODbL). Só há distância para imóvel com endereço no número ou na rua, em
 * linha reta a partir do ponto do endereço. A tag é calculada no servidor ao montar o resumo e o detalhe
 * (src/lib/catalogo/conjuntos.ts) e é do plano Luneta, como as outras tags (no Lente, `paraPlano` tira todas).
 *
 * "Cidade grande" sai naturalmente: só há metrô, trem de passageiros e VLT nelas.
 *
 * Puro (sem "@/", sem Node): os testes rodam em Node e a tela (filtros, página, PDF) importa daqui.
 */
import type { Confianca, PrecisaoLocal, TagDetalhe, TagResumo } from "./tipos";

export type ModoEstacao = "metro" | "trem" | "vlt";
export const MODOS_ESTACAO: readonly ModoEstacao[] = ["metro", "trem", "vlt"];

/** Abaixo disto (m), a estação vira tag e entra no filtro. */
export const LIMITE_TAG_M = 1000;

export const SLUG_ESTACAO: Record<ModoEstacao, string> = { metro: "metro-perto", trem: "trem-perto", vlt: "vlt-perto" };
const MODO_DO_SLUG = new Map(MODOS_ESTACAO.map((m) => [SLUG_ESTACAO[m], m]));

/** "Metrô", "Trem", "VLT" (o começo da tag) */
export const ROTULO_MODO: Record<ModoEstacao, string> = { metro: "Metrô", trem: "Trem", vlt: "VLT" };

/** O rótulo fixo de cada tag (filtros de tags, facetas, explicação): a tag de cada imóvel diz a distância. */
export const ROTULO_TAG_ESTACAO: Record<ModoEstacao, string> = {
  metro: "Metrô a até 1 km",
  trem: "Trem a até 1 km",
  vlt: "VLT a até 1 km",
};

/** O rótulo do filtro avançado (e da pílula do filtro ativo). */
export const ROTULO_FILTRO_METRO = "Metrô a até 1 km";

export interface EstacaoPerto {
  modo: ModoEstacao;
  /** distância em linha reta (m, de 10 em 10) do ponto do endereço */
  distanciaM: number;
  /** o nome da estação no OSM, sem o "Estação" na frente; null quando o OSM não traz */
  nome: string | null;
  /** metrô: a estação mais perto é de monotrilho (as linhas 15 e 17 do Metrô de São Paulo) */
  monotrilho?: boolean;
}

export function eTagEstacao(slug: string): boolean {
  return MODO_DO_SLUG.has(slug);
}

export function modoDoSlug(slug: string): ModoEstacao | null {
  return MODO_DO_SLUG.get(slug) ?? null;
}

/** "450 m" (abaixo de 1 km, de 10 em 10 m); "1,2 km" acima. */
export function distanciaCurta(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(Math.round(m / 100) / 10).toLocaleString("pt-BR")} km`;
}

/** "Metrô a 450 m" */
export function rotuloTagEstacao(e: Pick<EstacaoPerto, "modo" | "distanciaM">): string {
  return `${ROTULO_MODO[e.modo]} a ${distanciaCurta(e.distanciaM)}`;
}

/** "estação de metrô", "estação de monotrilho", "estação de trem", "estação de VLT" */
export function tipoEstacao(e: Pick<EstacaoPerto, "modo" | "monotrilho">): string {
  if (e.modo === "metro") return e.monotrilho ? "estação de monotrilho" : "estação de metrô";
  return e.modo === "trem" ? "estação de trem" : "estação de VLT";
}

/** "Estação de metrô Botafogo a 450 m"; sem nome no OSM, "Estação de metrô a 450 m". */
export function fraseEstacao(e: EstacaoPerto): string {
  const tipo = tipoEstacao(e);
  return `${tipo.charAt(0).toUpperCase()}${tipo.slice(1)}${e.nome ? ` ${e.nome}` : ""} a ${distanciaCurta(e.distanciaM)}`;
}

/** As estações que viram tag (abaixo de 1 km), na ordem metrô, trem, VLT. */
export function estacoesComTag(lista: readonly EstacaoPerto[]): EstacaoPerto[] {
  return MODOS_ESTACAO.flatMap((m) => lista.filter((e) => e.modo === m && e.distanciaM < LIMITE_TAG_M).slice(0, 1));
}

/** As tags do resumo (lista, cartões, filtros): positivas, confirmadas (o cálculo é direto, não uma leitura do edital). */
export function tagsDeEstacoes(lista: readonly EstacaoPerto[]): TagResumo[] {
  return estacoesComTag(lista).map((e) => ({ slug: SLUG_ESTACAO[e.modo], rotulo: rotuloTagEstacao(e), severidade: "positivo" as const, emRevisao: false }));
}

/**
 * A tag com a evidência (página do imóvel e pop-up): a confiança é alta no número e média na rua (o ponto é o meio da
 * rua, com algumas centenas de metros de incerteza); a evidência diz a estação, a distância, a regra e a fonte.
 */
export function tagDetalheEstacao(e: EstacaoPerto, precisao: PrecisaoLocal | null, dadosOsmDe: string | null): TagDetalhe {
  const confianca: Confianca = precisao === "numero" ? "alta" : "media";
  const ponto = precisao === "numero" ? "do ponto do endereço (no número)" : "do ponto do endereço (o meio da rua: o imóvel pode estar algumas centenas de metros adiante)";
  const data = dadosOsmDe && /^\d{4}-\d{2}-\d{2}/.test(dadosOsmDe) ? `, dados de ${dadosOsmDe.slice(8, 10)}/${dadosOsmDe.slice(5, 7)}/${dadosOsmDe.slice(0, 4)}` : "";
  return {
    slug: SLUG_ESTACAO[e.modo],
    rotulo: rotuloTagEstacao(e),
    severidade: "positivo",
    emRevisao: false,
    confianca,
    origem: "osm",
    evidencia: `${fraseEstacao(e)}, em linha reta ${ponto}. Fonte: OpenStreetMap (© contribuidores do OpenStreetMap, ODbL${data}).`,
  };
}

/** O imóvel tem a tag "Metrô a até 1 km"? (o filtro avançado) */
export function temMetroPerto(tags: readonly Pick<TagResumo, "slug">[]): boolean {
  return tags.some((t) => t.slug === SLUG_ESTACAO.metro);
}
