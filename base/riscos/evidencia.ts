/**
 * Ferramentas para quem escreve regras de risco: textos prontos para regex e recorte de
 * evidência. As regras (base/riscos/regras/) importam daqui, não do motor, para não criar
 * dependência circular.
 *
 * Toda regra roda sobre `normalizado` (minúsculas, sem acento, sem HTML, espaços simples) e
 * recorta a evidência de `original`, que tem o MESMO comprimento: o índice de uma busca no
 * normalizado vale no original.
 */
import type { ImovelGravado } from "../tipos.ts";
import { mascararDadosPessoais, mascararTrecho } from "../util/lgpd.ts";
import { colapsarEspacos, dobrarCaixaEAcento, semHtml } from "../util/texto.ts";

export interface TextoAnalise {
  /** De onde veio: "titulo", "descricao" ou a origem de um texto extra ("ficha", "edital"...). */
  origem: string;
  /** Texto limpo e mascarado, com acentos e maiúsculas (para mostrar como evidência). */
  original: string;
  /** Minúsculas e sem acento, com o mesmo comprimento de `original` (para os regex). */
  normalizado: string;
}

export interface Ocorrencia {
  texto: TextoAnalise;
  inicio: number;
  fim: number;
  /** Recorte do original ao redor da ocorrência, já mascarado. */
  trecho: string;
}

/** Prepara um texto para análise: tira HTML, mascara dados pessoais e normaliza. */
export function criarTextoAnalise(origem: string, texto: string): TextoAnalise {
  const original = colapsarEspacos(mascararDadosPessoais(semHtml(texto)).normalize("NFC"));
  return { origem, original, normalizado: dobrarCaixaEAcento(original) };
}

/** Título, descrição e textos extras do imóvel, nessa ordem (vazios ficam de fora). */
export function textosDoImovel(imovel: Pick<ImovelGravado, "titulo" | "descricao" | "textos">): TextoAnalise[] {
  const lista: TextoAnalise[] = [criarTextoAnalise("titulo", imovel.titulo)];
  if (imovel.descricao) lista.push(criarTextoAnalise("descricao", imovel.descricao));
  for (const extra of imovel.textos ?? []) lista.push(criarTextoAnalise(extra.origem, extra.texto));
  return lista.filter((t) => t.original !== "");
}

/**
 * Recorta o original em volta de [inicio, fim), com `margem` caracteres de cada lado,
 * sem cortar palavras, e marca cortes com "…". O resultado sai mascarado.
 */
export function trechoAoRedor(texto: TextoAnalise, inicio: number, fim: number, margem = 80): string {
  const original = texto.original;
  let a = Math.max(0, inicio - margem);
  let b = Math.min(original.length, fim + margem);
  if (a > 0) {
    const espaco = original.indexOf(" ", a);
    if (espaco !== -1 && espaco < inicio) a = espaco + 1;
  }
  if (b < original.length) {
    const espaco = original.lastIndexOf(" ", b);
    if (espaco > fim) b = espaco;
  }
  const recorte = (a > 0 ? "…" : "") + original.slice(a, b).trim() + (b < original.length ? "…" : "");
  return mascararTrecho(recorte, 2 * margem + (fim - inicio) + 10);
}

/**
 * Todas as ocorrências de `regex` (aplicado ao texto normalizado) nos textos dados.
 * O regex deve ser escrito em minúsculas e sem acento: /\bdesocupad[oa]\b/.
 */
export function buscar(textos: readonly TextoAnalise[], regex: RegExp, margem = 80): Ocorrencia[] {
  const global = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  const saida: Ocorrencia[] = [];
  for (const texto of textos) {
    for (const achado of texto.normalizado.matchAll(global)) {
      const inicio = achado.index;
      const fim = inicio + achado[0].length;
      saida.push({ texto, inicio, fim, trecho: trechoAoRedor(texto, inicio, fim, margem) });
      if (achado[0].length === 0) break;
    }
  }
  return saida;
}

/** A primeira ocorrência de `regex`, ou null. */
export function buscarPrimeira(textos: readonly TextoAnalise[], regex: RegExp, margem = 80): Ocorrencia | null {
  return buscar(textos, regex, margem)[0] ?? null;
}
