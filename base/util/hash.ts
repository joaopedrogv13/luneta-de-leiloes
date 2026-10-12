/**
 * Hashes estáveis para detectar mudança de conteúdo entre coletas.
 */
import { createHash } from "node:crypto";

/** SHA-256 em hexadecimal. */
export function hashTexto(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/**
 * JSON canônico: chaves em ordem alfabética, `undefined` omitido, números não finitos como null.
 * Dois objetos com o mesmo conteúdo geram a mesma string, em qualquer ordem de chaves.
 */
export function jsonCanonico(valor: unknown): string {
  return JSON.stringify(ordenar(valor));
}

function ordenar(valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map((item) => (item === undefined ? null : ordenar(item)));
  if (valor instanceof Date) return valor.toISOString();
  const saida: Record<string, unknown> = {};
  for (const chave of Object.keys(valor).sort()) {
    const item = (valor as Record<string, unknown>)[chave];
    if (item !== undefined) saida[chave] = ordenar(item);
  }
  return saida;
}

/** SHA-256 do JSON canônico de qualquer valor. */
export function hashEstavel(valor: unknown): string {
  return hashTexto(jsonCanonico(valor));
}
