/**
 * Casos compartilhados entre as regras da Luneta em TypeScript e a tradução em Python do exportador do PBCV
 * (regras_luneta.py): a mesma entrada tem de dar a mesma saída dos dois lados. As saídas no JSON são as do
 * TypeScript; pbcv.test.ts confere o TypeScript e testar.py confere o Python.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { campoSemPessoa } from "../../fontes/leiloesjudiciais/normalizar.ts";
import { inferirTipoImovel } from "../../util/classificar.ts";
import { mascararDadosPessoais, mascararDocumentos, mascararNomes } from "../../util/lgpd.ts";

export const ARQUIVO_CASOS = new URL("./casos-compartilhados.json", import.meta.url);

export const FUNCOES = {
  mascararDadosPessoais,
  mascararDocumentos,
  mascararNomes,
  campoSemPessoa: (t: string) => campoSemPessoa(t),
  inferirTipoImovel: (t: string) => inferirTipoImovel(t),
} as const satisfies Record<string, (t: string) => string | null>;

export type NomeFuncao = keyof typeof FUNCOES;

export interface Caso {
  funcao: NomeFuncao;
  entrada: string;
  saida: string | null;
}

export interface ArquivoCasos {
  sobre: string;
  casos: Caso[];
}

export function lerCasos(): ArquivoCasos {
  return JSON.parse(readFileSync(ARQUIVO_CASOS, "utf8")) as ArquivoCasos;
}

/** Refaz as saídas pelo TypeScript (depois de uma mudança de propósito na máscara). */
export function regravarCasos(): number {
  const arquivo = lerCasos();
  for (const caso of arquivo.casos) caso.saida = FUNCOES[caso.funcao](caso.entrada);
  writeFileSync(ARQUIVO_CASOS, JSON.stringify(arquivo, null, 1) + "\n");
  return arquivo.casos.length;
}
