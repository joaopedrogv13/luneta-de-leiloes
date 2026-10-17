import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { paginaImovel } from "@/lib/catalogo/servidor";
import type { Conjunto, Plano } from "@/lib/catalogo/tipos";

/**
 * Carregamento do imóvel para o layout da rota, a página e o relatório: uma leitura por requisição (cache do React).
 * Fica fora de rota.tsx de propósito: o layout de /imovel/[id] vale também para /imovel/[id]/relatorio, e importar
 * rota.tsx (que importa a página inteira) punha o JavaScript da página do imóvel no relatório.
 */
export const carregarImovel = cache((conjunto: Conjunto, id: string, plano: Plano) => paginaImovel(conjunto, id, plano));

/** O id como veio na URL, decodificado (ou cru, se não der para decodificar). */
export function lerId(bruto: string) {
  try {
    return decodeURIComponent(bruto);
  } catch {
    return bruto;
  }
}

/**
 * Para o layout da rota: id inexistente dá 404 ANTES do esqueleto de carregamento (loading.tsx) começar a ser
 * enviado; depois disso o Next já mandou o status 200. Falha ao ler os dados não decide nada aqui: a página
 * tenta de novo e mostra o erro dela (error.tsx, com "Tentar de novo").
 */
export async function garantirImovel(conjunto: Conjunto, params: Promise<{ id: string }>) {
  const { id } = await params;
  let existe = true;
  try {
    existe = (await carregarImovel(conjunto, lerId(id), "luneta")) !== null;
  } catch {
    // a página mostra o erro
  }
  if (!existe) notFound();
}
