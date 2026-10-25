/**
 * A referência de preço do m² da região, escolhida UMA vez e usada igual em todo lugar: a frase da seção "Preço do
 * m² na região", a "Região" do simulador (valor de venda pela região) e a seção 05 do relatório em PDF. Mesma
 * fonte, mesmo recorte e mesma medida (a média aparada: sem os 10% mais baixos e os 10% mais altos).
 *
 * Funções puras, imports relativos (sem "@/"): os testes rodam em Node puro.
 */
import type { EscopoM2, ReferenciaM2 } from "./tipos";

/**
 * Média (R$/m²) de uma referência. Dados de antes do campo `media` (sem a chave) usam a mediana da avaliação, que
 * fica perto da média aparada; `null` = o recorte não tem valores suficientes.
 */
export const mediaReferencia = (r: Pick<ReferenciaM2, "media" | "avaliacaoM2">): number | null =>
  r.media === undefined ? (r.avaliacaoM2?.mediana ?? null) : r.media;

/** Fonte de uma referência (dados antigos sem o campo são de leilões). */
export const fonteReferencia = (r: Pick<ReferenciaM2, "fonte">): "leiloes" | "itbi" => r.fonte ?? "leiloes";

/** Os recortes, do mais local ao mais amplo (rodada 6: o raio de 1 km entre a rua e o bairro). */
export const ESCOPOS_M2: readonly EscopoM2[] = ["rua", "perto", "bairro", "cidade", "uf"];
const ORDEM: Record<EscopoM2, number> = { rua: 0, perto: 1, bairro: 2, cidade: 3, uf: 4 };

/**
 * O nome curto de cada recorte para rótulos ("rua", "até 1 km", "bairro", "cidade", "estado"): o mesmo na página,
 * no simulador ("R$ 3.960/m² · bairro, ITBI") e no relatório.
 */
export const NIVEL_CURTO: Record<EscopoM2, string> = { rua: "rua", perto: "até 1 km", bairro: "bairro", cidade: "cidade", uf: "estado" };

/** Recorte fraco para comparar: só a cidade ou o estado (o ideal é a mesma rua, o raio de 1 km ou o mesmo bairro). */
export const recorteFraco = (e: EscopoM2) => e === "cidade" || e === "uf";

/**
 * O "melhor recorte disponível" do aviso da rodada 6 (em destaque quando é a cidade ou o estado): o recorte que as
 * frases da seção usam, ou seja, o da referência principal (`referenciaPrincipal`) e, quando ela é o ITBI, o da segunda
 * linha (a média dos leilões, `referenciaLeiloes`); o mais local dos dois. Um recorte que só aparece na tabela, abaixo
 * do mínimo da frase (3 ou 4 imóveis na rua, menos de 10 compras do ITBI no bairro), não conta: com ele a frase continua
 * comparando com a cidade, e o aviso precisa estar em destaque (revisão da rodada 6: 353 imóveis da base real ficavam com
 * o aviso discreto e a frase na cidade). null sem referência com média.
 */
export function melhorRecorte(refs: readonly ReferenciaM2[]): EscopoM2 | null {
  const principal = referenciaPrincipal(refs);
  if (!principal) return null;
  const segunda = fonteReferencia(principal) === "itbi" ? referenciaLeiloes(refs) : null;
  return segunda && ORDEM[segunda.escopo] < ORDEM[principal.escopo] ? segunda.escopo : principal.escopo;
}

/**
 * Compras registradas (ITBI) que um recorte precisa ter para valer como a referência: na rua, no raio e no bairro, 10;
 * na cidade (e no estado), 30. Abaixo disso a média oscila demais (uma compra fora do padrão muda o veredito).
 */
export const MINIMO_ITBI: Record<EscopoM2, number> = { rua: 10, perto: 10, bairro: 10, cidade: 30, uf: 30 };

/** Imóveis em leilão que um recorte precisa ter para valer como a referência (o servidor já corta abaixo de 3 ou 5). */
export const MINIMO_LEILOES_REFERENCIA = 5;

/** As referências com média, de uma fonte, do recorte mais local ao mais amplo. */
function comMedia(refs: readonly ReferenciaM2[], fonte: "leiloes" | "itbi"): ReferenciaM2[] {
  return refs.filter((r) => fonteReferencia(r) === fonte && (mediaReferencia(r) ?? 0) > 0).sort((a, b) => ORDEM[a.escopo] - ORDEM[b.escopo]);
}

/**
 * A referência dos leilões: a média de avaliação mais local com pelo menos 5 imóveis (senão a mais local que tiver
 * média). null sem nenhuma.
 */
export function referenciaLeiloes(refs: readonly ReferenciaM2[]): ReferenciaM2 | null {
  const lista = comMedia(refs, "leiloes");
  return lista.find((r) => r.amostra >= MINIMO_LEILOES_REFERENCIA) ?? lista[0] ?? null;
}

/**
 * A referência principal da região. Primeiro o preço PAGO (ITBI) no recorte mais local com amostra suficiente
 * (`MINIMO_ITBI`): é preço de verdade, e não avaliação de leilão. Sem ITBI comparável (cidades sem o dado,
 * apartamentos de São Paulo, poucas compras), a média de avaliação dos imóveis em leilão (`referenciaLeiloes`);
 * sem leilões, o ITBI mais local que houver. null sem média nenhuma.
 */
export function referenciaPrincipal(refs: readonly ReferenciaM2[]): ReferenciaM2 | null {
  const itbi = comMedia(refs, "itbi");
  return itbi.find((r) => r.amostra >= MINIMO_ITBI[r.escopo]) ?? referenciaLeiloes(refs) ?? itbi[0] ?? null;
}
