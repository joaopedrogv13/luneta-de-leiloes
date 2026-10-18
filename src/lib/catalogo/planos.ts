/**
 * O que cada plano vê. Uma regra só para o servidor (o dado do Luneta não sai para o Lente) e para a tela (a chamada
 * do Luneta no lugar). Decisão da rodada 4: Lente = encontrar; Luneta = decidir.
 *
 * - Lente: busca com os 6 filtros prometidos na página de planos (estado, cidade, tipo, faixa de preço, deságio e
 *   data; ver FILTROS_LENTE), as ordens por preço, deságio, data, área, m² e recentes, fotos, vistas, mapa e a página
 *   do imóvel com os dados da fonte e os imóveis parecidos.
 * - Luneta: tudo, incluindo o que está em RECURSOS_LUNETA.
 *
 * Mínimo da frente A (rodada 4); a frente D completa (telas da trava e filtros avançados). Sem imports com "@/":
 * os testes rodam em Node puro.
 */
import { paraPlano } from "./consulta";
import type { Filtros, PaginaImovel, Plano, Recurso } from "./tipos";

export type { Recurso } from "./tipos";

/** Todos os recursos, na ordem em que a tela os cita. */
export const RECURSOS: readonly Recurso[] = ["tags", "selos", "favoritos", "simulador", "relatorio", "regiao", "portais", "localizacao", "filtrosAvancados"];

/**
 * Recursos do Luneta, com o texto curto da chamada (o Lente vê a chamada no lugar). Trocar um recurso de plano é
 * mudar esta constante.
 */
export const RECURSOS_LUNETA: Record<Recurso, { rotulo: string; chamada: string }> = {
  tags: { rotulo: "Tags de risco", chamada: "Ocupação, dívidas, ações e matrícula em cada leilão, com o trecho de onde veio cada alerta." },
  selos: { rotulo: "Selos", chamada: "Os imóveis que passam nos critérios da Luneta, de Promissor a Alvo." },
  favoritos: { rotulo: "Favoritos", chamada: "Marque os imóveis que você acompanha." },
  simulador: { rotulo: "Simulador de lance", chamada: "Até quanto vale dar de lance para a sua meta, com os custos do leilão e três cenários de venda." },
  relatorio: { rotulo: "Relatório em PDF", chamada: "O imóvel, a simulação e os alertas numa página A4 pronta para imprimir." },
  regiao: { rotulo: "Preço do m² na região", chamada: "A avaliação comparada com a rua, o bairro e a cidade e, em 5 capitais, com compras reais (ITBI)." },
  portais: { rotulo: "Buscas nos portais", chamada: "Anúncios parecidos na mesma rua, no bairro e na cidade, a um clique." },
  localizacao: { rotulo: "Nota de localização", chamada: "Uma nota de 0 a 100 para o entorno do imóvel, comparado com o resto da cidade, com cada parte explicada." },
  filtrosAvancados: { rotulo: "Filtros avançados", chamada: "Área, quartos, modalidade, ocupação, condições de pagamento, tags e nota de localização." },
};

/** Recursos que o Lente também vê (hoje nenhum dos de RECURSOS_LUNETA). */
const DO_LENTE: ReadonlySet<Recurso> = new Set<Recurso>([]);

/** O plano vê o recurso? Lente: só o que não é do Luneta; Luneta: tudo. */
export function pode(plano: Plano, recurso: Recurso): boolean {
  return plano === "luneta" || DO_LENTE.has(recurso);
}

/** O que o plano NÃO vê, na ordem de RECURSOS (PaginaImovel.travas). */
export function travasDo(plano: Plano): Recurso[] {
  return RECURSOS.filter((r) => !pode(plano, r));
}

/**
 * Os filtros do Lente: os 6 prometidos na página de planos (estado e cidade com o bairro, tipo, faixa de preço com a
 * avaliação, deságio e data), mais a busca por texto. O resto é "filtro avançado" (Luneta).
 */
export const FILTROS_LENTE: (keyof Filtros)[] = [
  "q", "uf", "cidade", "bairro", "tipo", "lanceMin", "lanceMax", "avaliacaoMin", "avaliacaoMax", "desagioMin", "desagioMax", "dataDe", "dataAte",
];

/**
 * A página do imóvel com o plano aplicado (o que o plano não vê não sai do servidor): no Lente, sem tags, selo,
 * explicação do selo e nota de localização (`localizacao: null`, `notaLocal: null`), sem o preço da região (leilões e
 * ITBI: `referencias: []`) e sem as buscas nos portais (`buscasExternas: []`). Ficam a cobertura de preços (de quais
 * cidades a Luneta tem o dado), os parecidos (com o plano aplicado) e o ponto no mapa. `travas` diz o que falta.
 */
export function aplicarPlanoPagina(p: PaginaImovel, plano: Plano): PaginaImovel {
  const lente = plano === "lente";
  return {
    ...p,
    imovel: lente ? { ...p.imovel, tags: [], selo: 0, porQueSelo: "", notaLocal: null } : p.imovel,
    vizinhanca: {
      ...p.vizinhanca,
      referencias: pode(plano, "regiao") ? p.vizinhanca.referencias : [],
      buscasExternas: pode(plano, "portais") ? p.vizinhanca.buscasExternas : [],
      parecidos: p.vizinhanca.parecidos.map((x) => paraPlano(x, plano)),
    },
    localizacao: pode(plano, "localizacao") ? p.localizacao : null,
    travas: travasDo(plano),
  };
}
