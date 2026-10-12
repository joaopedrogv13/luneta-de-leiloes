/**
 * Entrada local: todo conector aceita --arquivo para rodar sem rede (fixtures e arquivos
 * baixados à mão). Também decodifica bytes em UTF-8 ou Windows-1252 (CP1252, o da Caixa).
 */
import { readFile } from "node:fs/promises";

export type Codificacao = "utf-8" | "windows-1252" | "auto";

/** Bytes 0x80–0x9F do Windows-1252 (onde ele difere do ISO-8859-1). */
const CP1252_80_9F: Readonly<Record<string, string>> = {
  "\x80": "€", "\x82": "‚", "\x83": "ƒ", "\x84": "„", "\x85": "…", "\x86": "†", "\x87": "‡", "\x88": "ˆ",
  "\x89": "‰", "\x8a": "Š", "\x8b": "‹", "\x8c": "Œ", "\x8e": "Ž", "\x91": "‘", "\x92": "’", "\x93": "“",
  "\x94": "”", "\x95": "•", "\x96": "–", "\x97": "—", "\x98": "˜", "\x99": "™", "\x9a": "š", "\x9b": "›",
  "\x9c": "œ", "\x9e": "ž", "\x9f": "Ÿ",
};

/**
 * Windows-1252 de verdade. O TextDecoder("windows-1252") do Node 22 decodifica como
 * ISO-8859-1 e devolve 0x80–0x9F como caracteres de controle (o "€", as aspas curvas, o
 * travessão e as reticências saem errados), então completamos com a tabela.
 */
function decodificarCp1252(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes).replace(/[\x80-\x9f]/g, (c) => CP1252_80_9F[c] ?? c);
}

/**
 * Decodifica bytes. Em "auto": usa UTF-8 se os bytes forem UTF-8 válido, senão Windows-1252.
 * (Um arquivo CP1252 com acento quase nunca é UTF-8 válido por acaso.)
 */
export function decodificar(bytes: Uint8Array, codificacao: Codificacao = "auto"): string {
  if (codificacao === "windows-1252") return decodificarCp1252(bytes);
  if (codificacao === "utf-8") return new TextDecoder("utf-8").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return decodificarCp1252(bytes);
  }
}

/** Lê um arquivo local como texto (BOM removido). */
export async function lerArquivoTexto(caminho: string, codificacao: Codificacao = "auto"): Promise<string> {
  const bytes = await readFile(caminho);
  const texto = decodificar(bytes, codificacao);
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** Lê e interpreta um JSON local. */
export async function lerArquivoJson<T = unknown>(caminho: string): Promise<T> {
  return JSON.parse(await lerArquivoTexto(caminho, "utf-8")) as T;
}
