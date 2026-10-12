/**
 * Registro de conectores. A CLI (`coletar <fonte>`) procura aqui pelo `id`.
 *
 * Um conector por pasta, base/fontes/<id>/index.ts, exportando um `Conector` (base/tipos.ts).
 * Para registrar: descomente (ou acrescente) o import e inclua na lista. Um import por linha,
 * em ordem alfabética de id, para evitar conflito entre quem mexe aqui em paralelo.
 *
 * Fontes previstas (catálogo de fontes, §2, com as correções da crítica):
 * - vitrine: caixa_csv, leiloesjudiciais_api
 * - radar de editais: pncp, djen, dou_inlabs, querido_diario
 * - condicional (só com autorização): suporteleiloes_api, datajud
 */
import type { Conector } from "../tipos.ts";

// Vitrine (imóveis)
import { caixaCsv } from "./caixa/index.ts";                              // Caixa: Lista de Imóveis (CSV oficial)
import { leiloesJudiciais } from "./leiloesjudiciais/index.ts";        // Leilões Judiciais (API/MCP pública), id leiloesjudiciais_api

// Radar de editais (base/fontes/radar/README.md)
import { djen } from "./radar/djen/index.ts";                              // DJEN / Comunica PJe (meio=E)
import { douInlabs } from "./radar/dou_inlabs/index.ts";                   // DOU seção 3 via INLABS
import { pncp } from "./radar/pncp/index.ts";                              // PNCP, modalidades 1 e 13 (leilão)
import { queridoDiario } from "./radar/querido_diario/index.ts";           // Querido Diário (OKBR)

export const CONECTORES: readonly Conector[] = [
  caixaCsv,
  djen,
  douInlabs,
  leiloesJudiciais,
  pncp,
  queridoDiario,
];

/** Conector pelo id, ou undefined. */
export function obterConector(id: string, conectores: readonly Conector[] = CONECTORES): Conector | undefined {
  return conectores.find((c) => c.id === id);
}

/** Confere ids repetidos e campos obrigatórios; devolve a lista de problemas. */
export function conferirRegistro(conectores: readonly Conector[] = CONECTORES): string[] {
  const problemas: string[] = [];
  const vistos = new Set<string>();
  for (const c of conectores) {
    if (!/^[a-z0-9_]+$/.test(c.id)) problemas.push(`id inválido (use minúsculas, números e _): ${c.id}`);
    if (vistos.has(c.id)) problemas.push(`id repetido: ${c.id}`);
    vistos.add(c.id);
    if (!c.nome) problemas.push(`${c.id}: sem nome`);
    if (typeof c.coletar !== "function" || typeof c.normalizar !== "function") problemas.push(`${c.id}: falta coletar/normalizar`);
  }
  return problemas;
}
