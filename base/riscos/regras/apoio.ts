/**
 * Ferramentas comuns das regras de risco: cláusulas, ressalvas, negação e montagem das
 * detecções. Tudo roda sobre o texto normalizado (minúsculas, sem acento, sem HTML) de
 * `evidencia.ts` e recorta a evidência do original já mascarado.
 *
 * Por que cláusulas: num edital, o sinal e o contrassinal costumam estar na mesma frase
 * ("débitos ... que se sub-rogarão no preço") e um sinal genérico do modelo de edital
 * ("eventuais débitos", "caso o imóvel esteja ocupado") não diz nada sobre o imóvel. Dividir o
 * texto em cláusulas permite exigir que o sinal e o objeto apareçam juntos e que o
 * contrassinal só anule o que está na mesma cláusula.
 */
import type { Confianca, ImovelGravado, ValorRisco } from "../../tipos.ts";
import { formatarMoedaBR, formatarNumeroBR } from "../../util/numero.ts";
import { trechoAoRedor, type TextoAnalise } from "../evidencia.ts";
import type { DeteccaoRegra, EntradaRegra } from "../motor.ts";
import type { SlugTag } from "../tags.ts";
import { CONFIG_RISCOS } from "./config.ts";

// ---------------------------------------------------------------------------
// Detecções
// ---------------------------------------------------------------------------

/** Origem usada quando a decisão vem da falta de informação. */
export const ORIGEM_AUSENCIA = "ausencia";

export function deteccao(
  tag: SlugTag,
  valor: ValorRisco,
  confianca: Confianca,
  origem: string,
  trecho: string | null,
  revisar = false,
): DeteccaoRegra {
  return { tag, valor, confianca, precisa_revisao: revisar, origem, trecho };
}

/** "Não sabemos": a fonte não informa ou o texto não traz sinal. Nunca afirma risco. */
export function desconhecido(tag: SlugTag, motivo: string, origem: string = ORIGEM_AUSENCIA): DeteccaoRegra {
  return deteccao(tag, "desconhecido", "media", origem, motivo, false);
}

const PESO: Readonly<Record<Confianca, number>> = { alta: 3, media: 2, baixa: 1 };

/** A maior de duas confianças. */
export function maiorConfianca(a: Confianca, b: Confianca): Confianca {
  return PESO[a] >= PESO[b] ? a : b;
}

/** O item de maior confiança de uma lista (o primeiro, em empate). */
export function maisForte<T extends { confianca: Confianca }>(lista: readonly T[]): T | undefined {
  let melhor: T | undefined;
  for (const item of lista) if (!melhor || PESO[item.confianca] > PESO[melhor.confianca]) melhor = item;
  return melhor;
}

// ---------------------------------------------------------------------------
// Fonte e imóvel
// ---------------------------------------------------------------------------

/** Imóvel da Caixa (pela fonte ou pelo comitente). */
export function ehCaixa(entrada: Pick<EntradaRegra, "imovel" | "fonte">): boolean {
  const id = entrada.fonte?.id ?? entrada.imovel.fonte_id;
  return CONFIG_RISCOS.fontesCaixa.includes(id) || /caixa econ[oô]mica federal/i.test(entrada.imovel.comitente ?? "");
}

/** Leilão SFI da Caixa (alienação fiduciária, Lei 9.514/97), pelo rótulo da modalidade. */
export function ehLeilaoSfi(imovel: Pick<ImovelGravado, "modalidade_fonte">): boolean {
  return /\bleil[aã]o\s+sfi\b|\bsfi\b/i.test(imovel.modalidade_fonte ?? "");
}

/** Quantos caracteres de texto livre (sem o título) a regra tem para ler. */
export function tamanhoDoTexto(textos: readonly TextoAnalise[]): number {
  return textos.filter((t) => t.origem !== "titulo").reduce((soma, t) => soma + t.original.length, 0);
}

/** Valor de `extras` como texto ou número, sem quebrar se a fonte não informar. */
export function extra(imovel: Pick<ImovelGravado, "extras">, chave: string): string | number | boolean | null {
  const valor = imovel.extras?.[chave];
  return valor === undefined ? null : valor;
}

export function moeda(valor: number): string {
  return formatarMoedaBR(valor);
}

export function porcento(valor: number): string {
  return `${formatarNumeroBR(Math.round(valor * 10) / 10)}%`;
}

// ---------------------------------------------------------------------------
// Cláusulas
// ---------------------------------------------------------------------------

export interface Clausula {
  texto: TextoAnalise;
  /** Início e fim no texto (mesmos índices em `original` e `normalizado`). */
  inicio: number;
  fim: number;
  /** Texto normalizado só da cláusula. */
  n: string;
}

/** Palavras que, antes de um ponto, não fecham frase ("Art. 130", "Av. 9", "Proc. 1000"). */
const ABREVIACOES = new Set([
  "art", "arts", "av", "obs", "proc", "fls", "fl", "inc", "cf", "ex", "prov", "res", "pag", "pg", "apto", "apt",
  "lt", "qd", "cs", "bl", "cep", "dr", "dra", "sr", "sra", "srs", "srta", "exmo", "exma", "min", "tel", "id",
  "num", "matr", "insc", "cert", "par", "aux", "cia", "ltda", "vol", "liv", "prot", "reg", "esq", "jd", "pq",
]);

const MARCADOR_ITEM = /(?<=\s)(?:\d{1,2}|[a-h])\)\s/g;

function fimDeFrase(original: string, i: number): boolean {
  const c = original.charAt(i);
  if (c === ";" || c === "!" || c === "?") return true;
  if (c !== ".") return false;
  if (original.charAt(i + 1) !== " ") return false;
  const proximo = original.charAt(i + 2);
  if (!/[\p{Lu}("“]/u.test(proximo) && !/\d/.test(proximo)) return false;
  // Palavra antes do ponto.
  let a = i;
  while (a > 0 && /[\p{L}\p{M}\dº°ª]/u.test(original.charAt(a - 1))) a--;
  const palavra = original.slice(a, i).toLowerCase();
  if (palavra === "") return /[)"”'%]/.test(original.charAt(i - 1));
  if (ABREVIACOES.has(palavra)) return false;
  // Letra solta ou sigla curta ("S.A.", "n.", "m2.") não fecha frase.
  if (/^\p{L}{1,2}$/u.test(palavra)) return false;
  // Número seguido de número ("1. 2") também não.
  if (/^\d+$/.test(palavra) && /\d/.test(proximo)) return false;
  return true;
}

/** Divide um texto em cláusulas: frases, itens "1)", "a)" e trechos separados por ";". */
export function clausulas(texto: TextoAnalise): Clausula[] {
  const { original, normalizado } = texto;
  const cortes = new Set<number>([0, original.length]);
  for (let i = 0; i < original.length; i++) if (fimDeFrase(original, i)) cortes.add(i + 1);
  for (const m of normalizado.matchAll(MARCADOR_ITEM)) cortes.add(m.index);
  const ordenados = [...cortes].sort((a, b) => a - b);
  const saida: Clausula[] = [];
  for (let k = 0; k < ordenados.length - 1; k++) {
    let inicio = ordenados[k] ?? 0;
    let fim = ordenados[k + 1] ?? original.length;
    while (inicio < fim && /\s/.test(original.charAt(inicio))) inicio++;
    while (fim > inicio && /\s/.test(original.charAt(fim - 1))) fim--;
    if (fim > inicio) saida.push({ texto, inicio, fim, n: normalizado.slice(inicio, fim) });
  }
  return saida;
}

const CACHE_CLAUSULAS = new WeakMap<readonly TextoAnalise[], Clausula[]>();

/** Cláusulas de todos os textos. Guardadas por lista: as regras de um imóvel recebem a mesma. */
export function clausulasDe(textos: readonly TextoAnalise[]): Clausula[] {
  const guardadas = CACHE_CLAUSULAS.get(textos);
  if (guardadas) return guardadas;
  const lista = textos.flatMap(clausulas);
  CACHE_CLAUSULAS.set(textos, lista);
  return lista;
}

export interface Achado {
  clausula: Clausula;
  texto: TextoAnalise;
  /** Posição no texto inteiro. */
  inicio: number;
  fim: number;
  /** Normalizado da cláusula antes e depois do achado. */
  antes: string;
  depois: string;
  /** Texto achado (normalizado). */
  casado: string;
  grupos: ReadonlyArray<string | undefined>;
}

function global(regex: RegExp): RegExp {
  return new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
}

/** Todas as ocorrências do regex (minúsculo, sem acento) dentro de cada cláusula. */
export function achados(lista: readonly Clausula[], regex: RegExp): Achado[] {
  const g = global(regex);
  const saida: Achado[] = [];
  for (const cl of lista) {
    for (const m of cl.n.matchAll(g)) {
      if (m[0].length === 0) break;
      saida.push({
        clausula: cl,
        texto: cl.texto,
        inicio: cl.inicio + m.index,
        fim: cl.inicio + m.index + m[0].length,
        antes: cl.n.slice(0, m.index),
        depois: cl.n.slice(m.index + m[0].length),
        casado: m[0],
        grupos: [...m],
      });
    }
  }
  return saida;
}

/** Recorte mascarado do original em volta do achado. */
export function trechoDe(a: Pick<Achado, "texto" | "inicio" | "fim">, margem = 100): string {
  return trechoAoRedor(a.texto, a.inicio, a.fim, margem);
}

/** Recorte da cláusula inteira (até ~360 caracteres), centrado no achado se for longa. */
export function trechoDaClausula(a: Pick<Achado, "clausula" | "inicio" | "fim">): string {
  const cl = a.clausula;
  if (cl.fim - cl.inicio <= 360) return trechoAoRedor(cl.texto, cl.inicio, cl.fim, 0);
  return trechoAoRedor(cl.texto, a.inicio, a.fim, 150);
}

/**
 * Palavras que fazem de uma menção um texto genérico do modelo de edital ("eventuais
 * débitos", "caso o imóvel esteja ocupado", "ficam intimados ... credores com penhora
 * anteriormente averbada"), e não uma informação sobre este imóvel.
 */
export const RESSALVAS =
  /\b(?:eventua(?:l|is)|eventualmente|caso|se houver(?:em)?|havendo|existindo|porventura|nas? hipoteses?|em caso de|no caso de|quando (?:for o caso|houver)|se for o caso|ainda que|acerca d[aeo]s?|nos processos em que|em que constar|deverao ser levantad\w*|cabendo aos interessados|se existirem|caso existam|qualquer|quaisquer|possive(?:l|is))\b/;

/** O trecho logo antes do achado (na mesma cláusula) tem ressalva? */
export function ressalvado(a: Pick<Achado, "antes">, janela = 70, regex: RegExp = RESSALVAS): boolean {
  return regex.test(a.antes.slice(-janela));
}

/** Ressalva logo DEPOIS do achado ("foro e laudêmio, quando for o caso"). */
export function ressalvadoDepois(a: Pick<Achado, "depois">, janela = 40): boolean {
  return /^[^;.]*?\b(?:quando for o caso|se houver|se for o caso|caso (?:exista|existam|haja|seja)|se existir(?:em)?|eventua(?:l|is))\b/.test(a.depois.slice(0, janela));
}

/**
 * Cláusula-modelo de intimação ("ficam intimados ... o credor com penhora anteriormente
 * averbada, o titular de usufruto, enfiteuse..."): lista papéis possíveis, não fatos do imóvel.
 */
export function clausulaDeIntimacao(cl: Pick<Clausula, "n">): boolean {
  return /\bintimad[oa]s?\b|\bintimac(?:ao|oes)\b|\bficam? (?:desde ja )?cientes?\b|\bcientificad[oa]s?\b/.test(cl.n);
}

/** O trecho logo antes do achado nega o que vem depois ("não está ocupado", "sem indisponibilidade")? */
export function negado(a: Pick<Achado, "antes">, janela = 30): boolean {
  return /\b(?:nao|sem|nem|inexist\w*|nenhum\w*|nada consta)\b[^,;:]*$/.test(a.antes.slice(-janela));
}

/** A cláusula contém o regex? */
export function contem(cl: Pick<Clausula, "n">, regex: RegExp): boolean {
  return regex.test(cl.n);
}
