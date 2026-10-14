/**
 * Endereços das páginas do catálogo, iguais na lista, no mapa e na página do imóvel.
 * /previa (dados reais, interna) e /assinante (demonstração com exemplos fictícios).
 */
import type { Conjunto, Plano } from "./tipos";

/** Página da lista de cada conjunto. */
export const ROTA_LISTA: Record<Conjunto, string> = { previa: "/previa", exemplos: "/assinante" };

/** Página de um imóvel, preservando o plano Lente (`?plano=lente`). */
export function rotaImovel(conjunto: Conjunto, id: string, plano: Plano = "luneta") {
  const base = `${ROTA_LISTA[conjunto]}/imovel/${encodeURIComponent(id)}`;
  return plano === "lente" ? `${base}?plano=lente` : base;
}

/** Chave do sessionStorage com a última busca (caminho + query), para o "Voltar à busca" da página do imóvel. */
export const chaveUltimaBusca = (conjunto: Conjunto) => `luneta-ultima-busca:${conjunto}`;

/** Chave do localStorage com os favoritos (lista de ids em JSON), por conjunto. */
export const chaveFavoritos = (conjunto: Conjunto) => `luneta-favoritos:${conjunto}`;
