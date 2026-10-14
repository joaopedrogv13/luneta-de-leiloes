/**
 * Endereços da API do catálogo (GET /api/catalogo) e as chaves de cache do app. Funções puras (testadas
 * em consultas.test.ts): a página e a API usam o mesmo formato de URL (src/lib/catalogo/url.ts).
 *
 * - Lista: filtros + ordem + página + plano, SEM o mapa (`mapa=0`): o mapa do Brasil inteiro é ~85% da
 *   resposta e não muda com a página nem com a ordem.
 * - Mapa: só filtros + plano (`porPagina=1`, com o mapa): trocar de página ou de ordem não o pede de novo.
 * - Contagem (painel "Todos os filtros", sugestões do estado vazio): `porPagina=1&mapa=0`.
 * Imports relativos (sem "@/"): o teste roda em Node puro.
 */
import { filtrosEfetivos, limparVazios } from "../../../lib/catalogo/filtros-rotulos";
import { type Conjunto, type Filtros, type Ordem, type Plano } from "../../../lib/catalogo/tipos";
import { escreverBusca, type EstadoBusca, type Vista } from "../../../lib/catalogo/url";

export const API_CATALOGO = "/api/catalogo";

/** O que define uma página de resultados. */
export interface PedidoLista {
  filtros: Filtros;
  ordem: Ordem;
  pagina: number;
  plano: Plano;
}

/** Filtros em forma canônica (listas ordenadas, sem vazios): a mesma busca dá a mesma chave de cache. */
export function canonico(f: Filtros): Filtros {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(limparVazios(f))) {
    saida[k] = Array.isArray(v) ? [...v].sort((a, b) => String(a).localeCompare(String(b))) : v;
  }
  return saida as Filtros;
}

const comoTexto = (p: URLSearchParams) => p.toString();

/** Consulta da lista (sem o mapa). Também é a chave do cache da lista. */
export function consultaLista(conjunto: Conjunto, p: PedidoLista): string {
  const q = escreverBusca({ conjunto, filtros: canonico(p.filtros), ordem: p.ordem, pagina: p.pagina, plano: p.plano });
  q.set("mapa", "0");
  return comoTexto(q);
}

/**
 * Chave do mapa: só o que muda os pontos (filtros que valem neste plano). Trocar de Luneta para Lente sem
 * filtro de tag não pede o mapa de novo.
 */
export function chaveMapa(conjunto: Conjunto, filtros: Filtros, plano: Plano, selosDesligados: boolean): string {
  // os pontos não têm tag nem selo: o plano só muda o mapa pelos filtros que deixam de valer no Lente
  const valendo = filtrosEfetivos(canonico(filtros), plano, selosDesligados);
  return comoTexto(escreverBusca({ conjunto, filtros: valendo }));
}

/** Consulta do mapa: a mesma busca com uma página de 1 item e sem facetas (o que importa é `mapa`). */
export function consultaMapa(conjunto: Conjunto, filtros: Filtros, plano: Plano): string {
  const q = escreverBusca({ conjunto, filtros: canonico(filtros), plano });
  q.set("porPagina", "1");
  q.set("facetas", "0");
  return comoTexto(q);
}

/** Consulta de contagem e facetas de um rascunho (sem mapa, uma página de 1 item; a ordem não importa). */
export function consultaContagem(conjunto: Conjunto, filtros: Filtros, plano: Plano): string {
  const q = escreverBusca({ conjunto, filtros: canonico(filtros), plano });
  q.set("porPagina", "1");
  q.set("mapa", "0");
  return comoTexto(q);
}

export const urlApi = (consulta: string) => `${API_CATALOGO}?${consulta}`;

/**
 * Endereço da página (o que vai na barra do navegador e no "Voltar à busca" da página do imóvel). A vista e o
 * mapa só entram quando a pessoa os escolheu (pela URL ou nos botões); o padrão de cada aparelho fica de fora.
 */
export function enderecoPagina(
  caminho: string,
  e: { filtros: Filtros; ordem: Ordem; pagina: number; plano: Plano; vista: Vista | null; mapa: boolean | null },
): string {
  // escreverBusca já omite a ordem padrão, a página 1 e o plano Luneta
  const q = escreverBusca(e).toString();
  return q ? `${caminho}?${q}` : caminho;
}

/**
 * Chave do estado inteiro de uma URL (busca, vista e mapa), em forma canônica. A página manda a da URL que
 * o servidor leu; o app, ao montar, compara com a URL atual: ao voltar pelo navegador, o Next pode devolver
 * a página antiga (do cache dele) com a URL nova, e então o app segue a URL.
 */
export function chaveDoEstado(e: EstadoBusca): string {
  return escreverBusca({ ...e, filtros: canonico(e.filtros) }).toString();
}
