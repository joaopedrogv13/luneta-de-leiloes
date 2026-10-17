/**
 * A referência de preço do m² da região, escolhida UMA vez e usada igual em todo lugar: a frase da seção "Preço do
 * m² na região", a "Região" do simulador (valor de venda pela região) e a seção 05 do relatório em PDF. Mesma
 * fonte, mesmo recorte e mesma medida (a média aparada: sem os 10% mais baixos e os 10% mais altos).
 *
 * Funções puras, imports relativos (sem "@/"): os testes rodam em Node puro.
 */
import type { ReferenciaM2 } from "./tipos";

/**
 * Média (R$/m²) de uma referência. Dados de antes do campo `media` (sem a chave) usam a mediana da avaliação, que
 * fica perto da média aparada; `null` = o recorte não tem valores suficientes.
 */
export const mediaReferencia = (r: Pick<ReferenciaM2, "media" | "avaliacaoM2">): number | null =>
  r.media === undefined ? (r.avaliacaoM2?.mediana ?? null) : r.media;

/** Fonte de uma referência (dados antigos sem o campo são de leilões). */
export const fonteReferencia = (r: Pick<ReferenciaM2, "fonte">): "leiloes" | "itbi" => r.fonte ?? "leiloes";

const ORDEM: Record<ReferenciaM2["escopo"], number> = { rua: 0, bairro: 1, cidade: 2, uf: 3 };

/**
 * Compras registradas (ITBI) que um recorte precisa ter para valer como a referência: na rua e no bairro, 10; na
 * cidade (e no estado), 30. Abaixo disso a média oscila demais (uma compra fora do padrão muda o veredito).
 */
export const MINIMO_ITBI: Record<ReferenciaM2["escopo"], number> = { rua: 10, bairro: 10, cidade: 30, uf: 30 };

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
