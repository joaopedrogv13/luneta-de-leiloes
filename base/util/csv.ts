/**
 * Leitor de CSV (RFC 4180, com separador configurável). Aceita aspas com "" escapado,
 * quebras de linha dentro de aspas, CRLF e BOM. Não corta espaços: use `.trim()` nos campos
 * quando a fonte tiver espaços nas bordas (a Caixa tem).
 */

export interface OpcoesCsv {
  /** Padrão ";" (CSVs brasileiros). */
  separador?: string;
}

/** Converte o texto em linhas de campos. Linhas totalmente vazias são mantidas como [""]. */
export function lerCsv(texto: string, opcoes: OpcoesCsv = {}): string[][] {
  const separador = opcoes.separador ?? ";";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;
  let i = texto.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = texto.length;
  while (i < n) {
    const c = texto.charAt(i);
    if (entreAspas) {
      if (c === '"') {
        if (texto.charAt(i + 1) === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        entreAspas = false;
        i++;
        continue;
      }
      campo += c;
      i++;
      continue;
    }
    if (c === '"' && campo.trim() === "") {
      entreAspas = true;
      campo = "";
      i++;
      continue;
    }
    if (texto.startsWith(separador, i)) {
      linha.push(campo);
      campo = "";
      i += separador.length;
      continue;
    }
    if (c === "\r" || c === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
      i += c === "\r" && texto.charAt(i + 1) === "\n" ? 2 : 1;
      continue;
    }
    campo += c;
    i++;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

/**
 * Converte linhas em objetos usando um cabeçalho (nomes cortados nas bordas). Linhas vazias
 * são puladas. Campos a mais são ignorados; campos a menos viram "".
 */
export function linhasComoObjetos(cabecalho: string[], linhas: string[][]): Array<Record<string, string>> {
  const nomes = cabecalho.map((nome) => nome.trim());
  const saida: Array<Record<string, string>> = [];
  for (const linha of linhas) {
    if (linha.every((campo) => campo.trim() === "")) continue;
    const objeto: Record<string, string> = {};
    nomes.forEach((nome, i) => {
      objeto[nome] = linha[i] ?? "";
    });
    saida.push(objeto);
  }
  return saida;
}
