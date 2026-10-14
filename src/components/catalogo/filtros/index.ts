/**
 * Filtros e ordenação do catálogo. O app liga assim:
 *
 *   <BarraFiltros filtros facetas total carregando plano selosDesligados ordem onOrdem
 *                 onChange={(f) => ...} onUpsell={(opener) => ...} contar={(f, sinal) => ...} consultar={...} />
 *
 * `BarraFiltros` já inclui o painel "Todos os filtros"; `PainelFiltros`, `PilulasFiltros` e
 * `OrdenarPor` também ficam disponíveis soltos.
 */
export { BarraFiltros, TotalResultados } from "./BarraFiltros";
export { PainelFiltros, SECOES } from "./PainelFiltros";
export { PilulasFiltros } from "./PilulasFiltros";
export { OrdenarPor, SELOS_EM_ANALISE } from "./OrdenarPor";
export { BuscaLocal } from "./BuscaLocal";
export type { Consulta, PropsFiltros, SecaoFiltro } from "./tipos";
