/**
 * Textos da vitrine da demonstração (/assinante), num lugar só: a lista, o rodapé da lista, a página de cada imóvel da
 * vitrine, a faixa e o cabeçalho usam as mesmas frases (e os testes as conferem). Sem imports com "@/".
 */
import { numero, plural } from "./rotulos";

/** "Você está vendo 10 de 21.230 imóveis reais da base." */
export function fraseVitrine(mostrados: number, totalBase: number): string {
  return `Você está vendo ${numero(mostrados)} de ${plural(totalBase, "imóvel real", "imóveis reais")} da base.`;
}

/** O convite, igual em todo lugar. */
export const CTA_VITRINE = "Para ver todos, com filtros, mapa e alertas, assine.";

/** Botão do convite: os planos da landing. */
export const BOTAO_VITRINE = "Ver os planos";

/**
 * Com filtros: quantos da vitrine passam e quantos a base inteira tem. "Com estes filtros: 2 dos 10 aqui e 1.234 na base
 * completa." (nenhum aqui: "nenhum dos 10 aqui").
 */
export function fraseFiltrosVitrine(aqui: number, mostrados: number, naBase: number): string {
  const daqui = aqui === 0 ? `nenhum dos ${numero(mostrados)} aqui` : `${numero(aqui)} dos ${numero(mostrados)} aqui`;
  return `Com estes filtros: ${daqui} e ${plural(naBase, "imóvel", "imóveis")} na base completa.`;
}

/** Como os imóveis da vitrine foram escolhidos (src/lib/catalogo/vitrine.ts), em linguagem simples. */
export const COMO_ESCOLHEMOS: readonly string[] = [
  "Maior deságio (de 35% a 75%), com a avaliação coerente com a da cidade.",
  "Nota de localização de 70 para cima, com o endereço achado no número ou na rua.",
  "Cidades com 300 mil moradores ou mais, com foto e sem alerta grave.",
  "Preço claro (venda direta, venda online ou licitação) e praça ainda por vir.",
  "Variedade: um imóvel por cidade, no máximo dois por estado.",
];

/** Faixa do topo (aviso de demonstração). */
export function faixaVitrine(mostrados: number): { completa: string; curta: string } {
  return {
    completa: `Demonstração · ${plural(mostrados, "imóvel real", "imóveis reais")} da base, escolhidos pelo deságio e pela localização · sem login`,
    curta: `Demonstração · ${plural(mostrados, "imóvel real", "imóveis reais")} · sem login`,
  };
}

/** Linha sob o título da lista. */
export function areaVitrine(mostrados: number, totalBase: number): string {
  return `Área do assinante · vitrine com ${numero(mostrados)} de ${plural(totalBase, "imóvel real", "imóveis reais")}`;
}

/** Bloco à parte com os exemplos fictícios. */
export const EXEMPLOS_TITULO = "Exemplos fictícios (para ver os selos)";
export const EXEMPLOS_TEXTO =
  "Os selos da base real ainda estão em análise. Estes exemplos foram inventados para mostrar como selos e tags aparecem; as fotos são ilustrativas, de imóveis reais parecidos.";

/** Página de um imóvel da vitrine. */
export function fraseImovelVitrine(mostrados: number, totalBase: number): string {
  return `Este é um dos ${numero(mostrados)} imóveis reais da vitrine, de ${plural(totalBase, "imóvel", "imóveis")} na base.`;
}

/** Parecidos fora da vitrine (a vizinhança limita a 6: com 6, "pelo menos 6"). */
export function fraseParecidosFora(n: number, maximo: number): string {
  const quantos = n >= maximo ? `pelo menos ${numero(n)} imóveis parecidos` : plural(n, "imóvel parecido", "imóveis parecidos");
  return `Na base completa há ${quantos} com este, fora da vitrine.`;
}
