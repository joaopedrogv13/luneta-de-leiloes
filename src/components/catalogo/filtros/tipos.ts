import type { Facetas, Filtros, Ordem, Plano } from "@/lib/catalogo/tipos";

/** Resposta de uma contagem com facetas (o painel mostra cidades, bairros e contagens do rascunho). */
export interface Consulta {
  total: number;
  facetas: Facetas;
}

/**
 * Props comuns da barra de filtros e do painel "Todos os filtros". O app guarda os filtros (na URL) e
 * busca na API; estes componentes só desenham e devolvem o objeto Filtros inteiro novo em `onChange`.
 */
export interface PropsFiltros {
  /** filtros aplicados */
  filtros: Filtros;
  /** facetas da busca aplicada (contagens das opções, histogramas) */
  facetas: Facetas;
  /** imóveis com os filtros aplicados */
  total: number;
  /** a lista está sendo buscada de novo (contagem esmaecida, girando) */
  carregando: boolean;
  plano: Plano;
  /** selos desligados neste conjunto (prévia: critérios pendentes) */
  selosDesligados: boolean;
  ordem: Ordem;
  onOrdem: (o: Ordem) => void;
  /** recebe o objeto Filtros inteiro novo (nunca o mesmo objeto alterado) */
  onChange: (f: Filtros) => void;
  /** recurso travado no plano Lente: abre o modal de upgrade; `opener` recebe o foco de volta */
  onUpsell: (opener: HTMLElement) => void;
  /** quantos imóveis um rascunho de filtros daria (o painel chama com espera de 250 ms e cancela a anterior) */
  contar: (f: Filtros, sinal?: AbortSignal) => Promise<number>;
  /**
   * Opcional e recomendado: total e facetas de um rascunho (a mesma API, com porPagina mínimo). Com ela,
   * o painel mostra as cidades dos estados recém-escolhidos e os bairros das cidades recém-escolhidas
   * antes de aplicar; sem ela, usa `contar` e as facetas aplicadas.
   */
  consultar?: (f: Filtros, sinal?: AbortSignal) => Promise<Consulta>;
}

/** Seções do painel "Todos os filtros". */
export type SecaoFiltro = "local" | "tipo" | "valores" | "caracteristicas" | "leilao" | "condicoes" | "riscos" | "selo" | "foto";
