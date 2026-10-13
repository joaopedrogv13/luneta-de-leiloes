/**
 * Normalização de nomes de lugar para casar a cidade escrita pela fonte com o município do IBGE.
 *
 * As fontes escrevem o mesmo município de vários jeitos: "SANT' ANA DO LIVRAMENTO" e
 * "Sant'Ana do Livramento", "MIRASSOL D'OESTE" e "Mirassol d'Oeste", "MOGI-MIRIM" e "Mogi Mirim",
 * "ASSU" e "Açu", "SANTA ISABEL DO PARA" e "Santa Izabel do Pará". Há três chaves, da mais estrita
 * para a mais solta, e uma distância de edição para erro de digitação. Quem usa (municipios.ts)
 * só aceita uma chave quando ela não é ambígua dentro da UF.
 */
import { colapsarEspacos, semAcento } from "../util/texto.ts";

/** Abreviações de nomes de lugar, palavra a palavra (depois de minúsculas e sem acento). */
const ABREVIACOES: Readonly<Record<string, string>> = {
  sta: "santa", sto: "santo", sr: "senhor", sra: "senhora", pres: "presidente", gov: "governador",
  dr: "doutor", mal: "marechal", cel: "coronel", gal: "general", eng: "engenheiro", prof: "professor",
  sen: "senador", dep: "deputado", cap: "capitao", ten: "tenente", pto: "porto", fco: "francisco",
};

/** Palavras que as fontes trocam entre si ("Barão de/do Monte Alto") e que a chave solta ignora. */
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "d"]);

/**
 * Chave estrita: sem acento, minúsculas, apóstrofo colado ("d'Oeste" → "doeste"), hífen e
 * pontuação viram espaço, abreviações por extenso, "D OESTE"/"DO OESTE"/"D'OESTE" iguais.
 *   "SANT' ANA DO LIVRAMENTO" → "sant ana do livramento"; "Mirassol d'Oeste" → "mirassol doeste"
 */
export function chaveNome(nome: string): string {
  const base = semAcento(nome)
    .toLowerCase()
    .replace(/['’‘`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ");
  const palavras = colapsarEspacos(base)
    .split(" ")
    .filter((p) => p !== "");
  const expandidas: string[] = [];
  palavras.forEach((p, i) => {
    const seguinte = palavras[i + 1];
    // "S JOSE DOS CAMPOS" → "sao jose dos campos" (só com palavra depois).
    if (p === "s" && seguinte !== undefined && seguinte.length > 2) expandidas.push("sao");
    // "N SRA", "N S", "NSA SRA" → "nossa senhora".
    else if ((p === "n" || p === "nsa") && (seguinte === "s" || seguinte === "sra" || seguinte === "senhora")) expandidas.push("nossa");
    else if (p === "s" && expandidas[expandidas.length - 1] === "nossa") expandidas.push("senhora");
    else expandidas.push(ABREVIACOES[p] ?? p);
  });
  return expandidas
    .join(" ")
    .replace(/\bd (?=[aeiou])/g, "d")
    .replace(/\bdo oeste\b/g, "doeste");
}

/** Chave solta: a estrita sem partículas (de, da, do...) e sem espaços. "Barão do Monte Alto" → "baraomontealto". */
export function chaveCompacta(nome: string): string {
  return chaveNome(nome)
    .split(" ")
    .filter((p) => !PARTICULAS.has(p))
    .join("");
}

/**
 * Chave fonética: a solta com as trocas de grafia comuns em nomes brasileiros (ç/ss/s/z, y/i,
 * th/t, ph/f, w/v, ge/je, ce/se, letras dobradas, "h" mudo no começo da palavra e, no fim da
 * palavra, "aes"/"ais" e "eia"/"ea").
 *   "Açu" e "ASSU" → "asu"; "Santa Izabel" e "Santa Isabel" → "santaisabel"; "Thomé" → "tome";
 *   "Herval d'Oeste" e "ERVAL D OESTE"; "Trajano de Moraes" e "TRAJANO DE MORAIS"; "Gouveia" e "GOUVEA"
 */
export function chaveFonetica(nome: string): string {
  const palavras = chaveNome(nome.replace(/[çÇ]/g, "s"))
    .split(" ")
    .map((p) => p.replace(/^h(?=[aeiou])/, "").replace(/aes$/, "ais").replace(/eia$/, "ea"))
    .join(" ");
  return chaveCompacta(palavras)
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/y/g, "i")
    .replace(/w/g, "v")
    .replace(/k/g, "c")
    .replace(/z/g, "s")
    .replace(/c(?=[ei])/g, "s")
    .replace(/g(?=[ei])/g, "j")
    .replace(/([a-z])\1+/g, "$1");
}

/**
 * Distância de edição (Damerau-Levenshtein restrita: inserção, remoção, troca e transposição de
 * vizinhas). Para quando passa de `maximo` e devolve `maximo + 1`.
 */
export function distanciaEdicao(a: string, b: string, maximo = Infinity): number {
  if (Math.abs(a.length - b.length) > maximo) return maximo + 1;
  const n = b.length;
  let antes = new Array<number>(n + 1).fill(0);
  let anterior = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = new Array<number>(n + 1).fill(0);
    atual[0] = i;
    let menorDaLinha = i;
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let valor = Math.min((anterior[j] ?? 0) + 1, (atual[j - 1] ?? 0) + 1, (anterior[j - 1] ?? 0) + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) valor = Math.min(valor, (antes[j - 2] ?? 0) + 1);
      atual[j] = valor;
      if (valor < menorDaLinha) menorDaLinha = valor;
    }
    if (menorDaLinha > maximo) return maximo + 1;
    antes = anterior;
    anterior = atual;
  }
  return anterior[n] ?? 0;
}

const SIGLAS_UF = "AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO";

/**
 * Tira da cidade o que não é nome: UF no fim ("São Paulo/SP", "SAO PAULO - SP", "Recife (PE)"),
 * prefixos ("Município de", "Comarca de", "Cidade de") e espaços sobrando. Devolve também a UF
 * encontrada no texto, se houver.
 */
export function limparCidade(cidade: string, uf?: string | null): { nome: string; ufNoTexto: string | null } {
  let nome = colapsarEspacos(cidade);
  let ufNoTexto: string | null = null;
  const sufixo = new RegExp(`\\s*(?:[/,\\-–]\\s*|\\(\\s*)(${SIGLAS_UF})\\s*\\)?\\s*$`, "i").exec(nome);
  if (sufixo && sufixo.index > 0) {
    ufNoTexto = (sufixo[1] ?? "").toUpperCase();
    nome = nome.slice(0, sufixo.index);
  }
  // "NITEROI RJ": a UF informada no fim, só com espaço (nenhum município termina com a sigla da UF).
  const ufInformada = (uf ?? "").trim().toUpperCase();
  if (!ufNoTexto && /^[A-Z]{2}$/.test(ufInformada)) {
    const espaco = new RegExp(`\\s+${ufInformada}$`, "i").exec(nome);
    if (espaco && espaco.index > 0) {
      ufNoTexto = ufInformada;
      nome = nome.slice(0, espaco.index);
    }
  }
  nome = nome
    .replace(/^(?:munic[ií]pio|comarca|cidade)\s+(?:de|da|do)\s+/i, "")
    // "SAO PAULO (CAPITAL)", "SÃO PAULO - CAPITAL"
    .replace(/\s*(?:\(\s*capital\s*\)|[-–]\s*capital)\s*$/i, "");
  return { nome: colapsarEspacos(nome), ufNoTexto };
}

/**
 * Leituras possíveis de abreviações ambíguas: "S J DOS CAMPOS" → "sao jose dos campos" e "sao joao
 * dos campos". Quem usa só aceita se uma única leitura casar.
 */
export function leiturasAbreviadas(chave: string): string[] {
  if (!/\b(?:sao|s) j\b/.test(chave)) return [];
  return ["jose", "joao"].map((nome) => chave.replace(/\b(?:sao|s) j\b/g, `sao ${nome}`));
}
