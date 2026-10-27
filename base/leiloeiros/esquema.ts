/**
 * Validador pequeno de JSON Schema (draft 2020-12), só com as palavras que os esquemas de
 * base/leiloeiros usam. A base não tem dependências: o Ajv que existe em node_modules é o 6 (vem do
 * ESLint, não é dependência declarada) e não lê o draft 2020-12.
 *
 * Palavras aceitas: type, enum, const, required, properties, additionalProperties, propertyNames,
 * maxProperties, items, minItems, maxItems, pattern, minLength, maxLength, minimum, maximum,
 * format (date-time com fuso, date, uri http/https) e $ref local ("#/$defs/..."); as de anotação
 * (title, description, $id, $schema, $defs, $comment, examples, default) são ignoradas. Qualquer outra
 * palavra num esquema é erro de quem escreveu o esquema (o teste confere), para nada ser ignorado em
 * silêncio. Como no padrão, palavras de texto só valem para texto e as de número só para número.
 */
import { readFileSync } from "node:fs";
import { dataExiste } from "../util/data.ts";

export type Esquema = { readonly [chave: string]: unknown };

export interface ErroEsquema {
  /** Onde: "endereco.cep", "pracas[1].data"; "linha" para a raiz. */
  caminho: string;
  mensagem: string;
}

const VALIDACAO = new Set([
  "type", "enum", "const", "required", "properties", "additionalProperties", "propertyNames", "maxProperties", "items",
  "minItems", "maxItems", "pattern", "minLength", "maxLength", "minimum", "maximum", "format", "$ref",
]);
const ANOTACAO = new Set(["title", "description", "$id", "$schema", "$defs", "$comment", "examples", "default"]);
const FORMATOS = new Set(["date-time", "date", "uri"]);

const NOME_TIPO: Readonly<Record<string, string>> = {
  string: "texto",
  number: "número",
  integer: "inteiro",
  boolean: "true/false",
  object: "objeto",
  array: "lista",
  null: "null",
};

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function tipoDe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function confereTipo(v: unknown, tipo: string): boolean {
  switch (tipo) {
    case "null":
      return v === null;
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "integer":
      return typeof v === "number" && Number.isInteger(v);
    case "boolean":
      return typeof v === "boolean";
    case "object":
      return ehObjeto(v);
    case "array":
      return Array.isArray(v);
    default:
      return false;
  }
}

const RE_DATA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))$/;

/** ISO 8601 com fuso ("Z" ou "±HH:MM") e data que existe. */
export function ehDataHoraComFuso(valor: string): boolean {
  const m = RE_DATA_HORA.exec(valor);
  if (!m) return false;
  const [, a, me, d, h, mi, s, fh, fm] = m;
  if (!dataExiste(Number(a), Number(me), Number(d))) return false;
  if (Number(h) > 23 || Number(mi) > 59 || (s !== undefined && Number(s) > 59)) return false;
  if (fh !== undefined && (Number(fh) > 14 || Number(fm) > 59)) return false;
  return !Number.isNaN(new Date(valor).getTime());
}

export function ehUrlHttp(valor: string): boolean {
  try {
    const url = new URL(valor);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

function confereFormato(valor: string, formato: string): string | null {
  if (formato === "date-time") return ehDataHoraComFuso(valor) ? null : "data e hora fora do padrão: use ISO 8601 com fuso, ex.: 2026-11-10T14:00:00-03:00";
  if (formato === "date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
    return m && dataExiste(Number(m[1]), Number(m[2]), Number(m[3])) ? null : "data fora do padrão AAAA-MM-DD";
  }
  if (formato === "uri") return ehUrlHttp(valor) ? null : "URL inválida (use o endereço completo, com http:// ou https://)";
  return null;
}

function mostrar(v: unknown): string {
  const texto = JSON.stringify(v) ?? String(v);
  return texto.length > 60 ? `${texto.slice(0, 57)}...` : texto;
}

function juntar(caminho: string, chave: string | number): string {
  if (typeof chave === "number") return `${caminho}[${chave}]`;
  return caminho === "" ? chave : `${caminho}.${chave}`;
}

function resolver(ref: string, raiz: Esquema): Esquema {
  const m = /^#\/\$defs\/([A-Za-z0-9_-]+)$/.exec(ref);
  const defs = raiz.$defs;
  const alvo = m && ehObjeto(defs) ? defs[m[1]!] : undefined;
  if (!ehObjeto(alvo)) throw new Error(`$ref não encontrado no esquema: ${ref}`);
  return alvo;
}

/** Problemas de `valor` contra `esquema`; lista vazia = válido. */
export function validarEsquema(valor: unknown, esquema: Esquema, raiz: Esquema = esquema, caminho = ""): ErroEsquema[] {
  const erros: ErroEsquema[] = [];
  const erro = (mensagem: string, onde = caminho): void => {
    erros.push({ caminho: onde || "linha", mensagem });
  };

  if (typeof esquema.$ref === "string") {
    // Em 2020-12 o $ref convive com outras palavras: valida as duas partes.
    erros.push(...validarEsquema(valor, resolver(esquema.$ref, raiz), raiz, caminho));
  }

  if (esquema.type !== undefined) {
    const tipos = Array.isArray(esquema.type) ? (esquema.type as string[]) : [esquema.type as string];
    if (!tipos.some((t) => confereTipo(valor, t))) {
      erro(`tipo errado: esperado ${tipos.map((t) => NOME_TIPO[t] ?? t).join(" ou ")}, veio ${NOME_TIPO[tipoDe(valor)] ?? tipoDe(valor)} (${mostrar(valor)})`);
      return erros;
    }
  }
  if (esquema.const !== undefined && valor !== esquema.const) {
    erro(`deve ser ${mostrar(esquema.const)}, veio ${mostrar(valor)}`);
    return erros;
  }
  if (Array.isArray(esquema.enum) && !esquema.enum.includes(valor as never)) {
    const aceitos = esquema.enum.map((v) => (v === null ? "null" : String(v))).join(", ");
    erro(`valor fora da lista: ${mostrar(valor)} (aceitos: ${aceitos})`);
    return erros;
  }

  if (typeof valor === "string") {
    const tamanho = [...valor].length;
    if (typeof esquema.minLength === "number" && tamanho < esquema.minLength) erro(`texto curto demais (${tamanho}; mínimo ${esquema.minLength})`);
    if (typeof esquema.maxLength === "number" && tamanho > esquema.maxLength) erro(`texto longo demais (${tamanho} caracteres; máximo ${esquema.maxLength})`);
    if (typeof esquema.pattern === "string" && !new RegExp(esquema.pattern, "u").test(valor)) erro(`fora do padrão ${esquema.pattern}: ${mostrar(valor)}`);
    if (typeof esquema.format === "string") {
      const problema = confereFormato(valor, esquema.format);
      if (problema) erro(`${problema}; veio ${mostrar(valor)}`);
    }
  }

  if (typeof valor === "number") {
    if (typeof esquema.minimum === "number" && valor < esquema.minimum) erro(`menor que o mínimo ${esquema.minimum}: ${valor}`);
    if (typeof esquema.maximum === "number" && valor > esquema.maximum) erro(`maior que o máximo ${esquema.maximum}: ${valor}`);
  }

  if (Array.isArray(valor)) {
    if (typeof esquema.minItems === "number" && valor.length < esquema.minItems) erro(`lista com menos de ${esquema.minItems} item(ns)`);
    if (typeof esquema.maxItems === "number" && valor.length > esquema.maxItems) erro(`lista com mais de ${esquema.maxItems} itens (${valor.length})`);
    if (ehObjeto(esquema.items)) {
      const itens = esquema.items;
      valor.forEach((item, i) => erros.push(...validarEsquema(item, itens, raiz, juntar(caminho, i))));
    }
  }

  if (ehObjeto(valor)) {
    const propriedades = ehObjeto(esquema.properties) ? esquema.properties : {};
    if (Array.isArray(esquema.required)) {
      for (const chave of esquema.required as string[]) {
        if (valor[chave] === undefined) erro("obrigatório (mande null se a fonte não informa)", juntar(caminho, chave));
      }
    }
    const chaves = Object.keys(valor);
    if (typeof esquema.maxProperties === "number" && chaves.length > esquema.maxProperties) erro(`campos demais (${chaves.length}; máximo ${esquema.maxProperties})`);
    for (const chave of chaves) {
      const onde = juntar(caminho, chave);
      if (ehObjeto(esquema.propertyNames)) {
        for (const e of validarEsquema(chave, esquema.propertyNames, raiz, onde)) erro(`nome de campo inválido: ${e.mensagem}`, onde);
      }
      const sub = propriedades[chave];
      if (ehObjeto(sub)) erros.push(...validarEsquema(valor[chave], sub, raiz, onde));
      else if (esquema.additionalProperties === false) erro("campo desconhecido (confira o nome no contrato)", onde);
      else if (ehObjeto(esquema.additionalProperties)) erros.push(...validarEsquema(valor[chave], esquema.additionalProperties, raiz, onde));
    }
  }
  return erros;
}

/** Palavras de um esquema que este validador não conhece (devem ser nenhuma). */
export function palavrasNaoSuportadas(esquema: unknown, caminho = ""): string[] {
  if (!ehObjeto(esquema)) return [];
  const achadas: string[] = [];
  for (const [chave, valor] of Object.entries(esquema)) {
    const onde = caminho ? `${caminho}.${chave}` : chave;
    if (!VALIDACAO.has(chave) && !ANOTACAO.has(chave)) achadas.push(onde);
    if (chave === "format" && typeof valor === "string" && !FORMATOS.has(valor)) achadas.push(`${onde}=${valor}`);
    if (chave === "properties" || chave === "$defs") {
      if (ehObjeto(valor)) for (const [nome, sub] of Object.entries(valor)) achadas.push(...palavrasNaoSuportadas(sub, `${onde}.${nome}`));
    } else if (chave === "items" || chave === "additionalProperties" || chave === "propertyNames") {
      achadas.push(...palavrasNaoSuportadas(valor, onde));
    }
  }
  return achadas;
}

export type NomeEsquema = "imovel" | "coleta" | "relatorio-leiloeiros";

const cache = new Map<NomeEsquema, Esquema>();

/** Esquema da pasta base/leiloeiros (lido uma vez por processo). */
export function carregarEsquema(nome: NomeEsquema): Esquema {
  let esquema = cache.get(nome);
  if (!esquema) {
    esquema = JSON.parse(readFileSync(new URL(`./${nome}.schema.json`, import.meta.url), "utf8")) as Esquema;
    cache.set(nome, esquema);
  }
  return esquema;
}
