/**
 * Chaves de deduplicação: o mesmo imóvel aparece no portal do banco, no do leiloeiro e em
 * agregadores. A base guarda duas chaves por imóvel e o site agrupa por elas:
 * - por matrícula + cartório (forte): "mat:sp:sao-paulo:6:147300";
 * - por endereço normalizado + cidade + UF (fraca): "end:ac:cruzeiro-do-sul:rua do purus sn qd 272 lt 10".
 * `chave_dedup` usa a de matrícula quando existe e a de endereço quando não.
 */
import { normalizarTexto, slug } from "./texto.ts";

/** Abreviações e sinônimos comuns em endereços de leilão, aplicados palavra a palavra. */
const SINONIMOS: Readonly<Record<string, string>> = {
  r: "rua", av: "avenida", ave: "avenida", avda: "avenida", al: "alameda", tv: "travessa", trav: "travessa",
  pc: "praca", pca: "praca", est: "estrada", estr: "estrada", rod: "rodovia", lgo: "largo",
  vl: "vila", jd: "jardim", jdm: "jardim", pq: "parque", res: "residencial", cond: "condominio",
  qd: "qd", qda: "qd", quadra: "qd", q: "qd", quarteirao: "qd",
  lt: "lt", lote: "lt", lts: "lt", lotes: "lt",
  ap: "ap", apto: "ap", apt: "ap", apartamento: "ap",
  bl: "bl", bloco: "bl", blc: "bl",
  cs: "casa", sl: "sala", lj: "loja", cj: "conjunto", conj: "conjunto",
  sn: "sn",
  dr: "doutor", prof: "professor", eng: "engenheiro", gal: "general", cel: "coronel", sta: "santa", sto: "santo",
  pres: "presidente", mal: "marechal", cap: "capitao", ten: "tenente", padre: "padre", pe: "padre",
};

/** Palavras que não ajudam a distinguir endereços. */
const DESCARTAR = new Set(["n", "no", "nº", "num", "numero", "nro", "de", "da", "do", "das", "dos"]);

/**
 * Endereço comparável: sem acento, minúsculo, sem pontuação, com abreviações padronizadas,
 * sem CEP e sem "nº". Mantém números de casa, lote, quadra, bloco e apartamento, porque
 * apartamentos diferentes no mesmo prédio são imóveis diferentes.
 *
 *   "RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10" → "rua purus sn qd 272 lt 10"
 */
export function normalizarEndereco(endereco: string): string {
  const texto = normalizarTexto(endereco)
    .replace(/\bcep:?\s*\d{5}-?\d{3}\b/g, " ")
    .replace(/\bs\s*\/\s*n(?:o|º)?\b/g, " sn ")
    .replace(/(\d)\.(?=\d{3}\b)/g, "$1")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ");
  return texto
    .split(" ")
    .filter((p) => p !== "")
    .map((p) => SINONIMOS[p] ?? p)
    .filter((p) => !DESCARTAR.has(p))
    .map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p))
    .join(" ");
}

/** Matrícula só com dígitos e sem zeros à esquerda ("147.300" → "147300"); `null` se não houver número. */
export function normalizarMatricula(matricula: string): string | null {
  const primeira = /\d[\d.\s-]*/.exec(matricula);
  if (!primeira) return null;
  const digitos = primeira[0].replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digitos === "" || digitos === "0" ? null : digitos;
}

/**
 * Identifica o cartório pelo número do ofício ("6º Cartório de Registro de Imóveis",
 * "Ofício: 01", "2º RI") ou "u" quando o texto não traz número (cartório único da comarca).
 */
export function normalizarCartorio(cartorio: string | null | undefined): string {
  if (!cartorio) return "u";
  const texto = normalizarTexto(cartorio);
  const numero = /(\d{1,2})\s*(?:º|o|ª|a)?\s*(?:oficio|cartorio|ri\b|cri\b|registro|serventia|circunscricao|zona)/.exec(texto)
    ?? /(?:oficio|cartorio|registro|cri|ri)\D{0,30}?(\d{1,2})(?!\d)/.exec(texto)
    ?? /^\s*(\d{1,2})\s*$/.exec(texto);
  return numero?.[1] ? String(Number(numero[1])) : "u";
}

export interface DadosChave {
  uf: string;
  cidade: string;
  endereco?: string | null;
  matricula?: string | null;
  cartorio?: string | null;
}

/** Chave forte por matrícula; `null` sem matrícula. */
export function chaveMatricula(dados: DadosChave): string | null {
  if (!dados.matricula) return null;
  const matricula = normalizarMatricula(dados.matricula);
  if (!matricula) return null;
  return `mat:${dados.uf.toLowerCase()}:${slug(dados.cidade)}:${normalizarCartorio(dados.cartorio)}:${matricula}`;
}

/** Chave fraca por endereço; `null` se o endereço for curto demais para distinguir imóveis. */
export function chaveEndereco(dados: DadosChave): string | null {
  if (!dados.endereco) return null;
  const endereco = normalizarEndereco(dados.endereco);
  if (endereco.length < 6 || !/[a-z]{3}/.test(endereco)) return null;
  return `end:${dados.uf.toLowerCase()}:${slug(dados.cidade)}:${endereco}`;
}

/** A melhor chave disponível: matrícula, senão endereço. */
export function chaveDedup(dados: DadosChave): string | null {
  return chaveMatricula(dados) ?? chaveEndereco(dados);
}
