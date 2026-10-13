/**
 * Endereço em partes comparáveis: tipo e nome do logradouro, número e unidades (apartamento,
 * bloco, casa, lote, quadra...). Escrito para os formatos vistos nas fontes:
 *   Caixa:       "RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10"
 *                "AVENIDA DAS FLORES, N. SN, Apto 1007,  BL C"
 *                "QUADRA 10, N. SN, Apto 201, LT 25, CJ A, ST 05, RUA 1"   (endereço por quadra)
 *                "LT 02 QD 01, N. 53D, RUA CROACIA"                         (rua no fim)
 *   leiloeiro:   "Rua Frei Antônio de Guadalupe, nº 67, apto 21"
 *   sem vírgula: "Av Paulista 1000 ap 52 bl B"
 *   rodovia:     "RODOVIA BR-316 KM 42, N. S/N, LOTE 10 - RAMAL JOÃO NOVO"
 * O resultado é minúsculo, sem acento e com abreviações por extenso, para que duas fontes que
 * escrevem o mesmo endereço de jeitos diferentes cheguem às mesmas partes.
 */
import { normalizarTexto } from "../util/texto.ts";

/** Tipos de logradouro por extenso, a partir das abreviações comuns. */
const TIPOS: Readonly<Record<string, string>> = {
  r: "rua", rua: "rua", av: "avenida", ave: "avenida", avda: "avenida", avenida: "avenida",
  al: "alameda", alameda: "alameda", tv: "travessa", trv: "travessa", trav: "travessa", travessa: "travessa",
  pc: "praca", pca: "praca", praca: "praca", est: "estrada", estr: "estrada", estrada: "estrada",
  rod: "rodovia", rodovia: "rodovia", lgo: "largo", largo: "largo", via: "via", viela: "viela", beco: "beco",
  ld: "ladeira", ladeira: "ladeira", servidao: "servidao", psg: "passagem", passagem: "passagem",
  acesso: "acesso", marginal: "marginal", contorno: "contorno", ramal: "ramal", linha: "linha", vereda: "vereda",
};

/** Títulos abreviados dentro do nome do logradouro. */
const TITULOS: Readonly<Record<string, string>> = {
  dr: "doutor", dra: "doutora", prof: "professor", profa: "professora", eng: "engenheiro", gal: "general",
  gen: "general", cel: "coronel", cap: "capitao", ten: "tenente", sgt: "sargento", mal: "marechal",
  alm: "almirante", brig: "brigadeiro", pres: "presidente", gov: "governador", sen: "senador",
  dep: "deputado", ver: "vereador", min: "ministro", des: "desembargador", pe: "padre", fr: "frei",
  sta: "santa", sto: "santo", sra: "senhora", visc: "visconde", vsc: "visconde", cmte: "comandante",
  maj: "major", comend: "comendador",
};

/**
 * Unidades e marcos que distinguem imóveis no mesmo logradouro, com o nome canônico. Só contam
 * seguidos de um valor ("LT 10", "BL C", "CASA II").
 */
const UNIDADES: Readonly<Record<string, string>> = {
  ap: "ap", apt: "ap", apto: "ap", aptos: "ap", apartamento: "ap",
  bl: "bl", blc: "bl", bloco: "bl", torre: "torre", tr: "torre",
  cs: "casa", casa: "casa", sobrado: "casa", sl: "sala", sala: "sala", lj: "loja", loja: "loja",
  box: "box", boxe: "box", vaga: "vaga", vg: "vaga", unidade: "unidade", und: "unidade", unid: "unidade", un: "unidade", uh: "unidade",
  lt: "lt", lte: "lt", lote: "lt", lts: "lt", lotes: "lt",
  qd: "qd", qda: "qd", quadra: "qd", quarteirao: "qd",
  km: "km", cj: "conjunto", conj: "conjunto", conjunto: "conjunto",
  st: "setor", setor: "setor", area: "area", gleba: "gleba", ch: "chacara", chacara: "chacara",
  zn: "zona", zona: "zona", pav: "pav", pavimento: "pav",
};

/** Unidades que, no começo do endereço, são o próprio sistema de endereçamento ("QUADRA 10, ..."). */
const ENDERECAMENTO = new Set(["qd", "conjunto", "setor", "chacara", "gleba", "zona", "area", "km"]);

/** Ligam valores da mesma unidade: "LT 19 E 20", "LTS 01 A 10", "LOTES 01 AO 20". */
const CONJUNCOES = new Set(["e", "a", "ao"]);

/** Marcadores de número ("N.", "nº", "número"). */
const MARCADORES_NUMERO = new Set(["n", "no", "num", "numero", "nro", "nr"]);

/** Palavras que indicam fração do lote ou do imóvel: vários anúncios podem ter o mesmo endereço. */
const FRACAO = new Set(["parte", "partes", "fracao", "fracoes", "parcela", "remanescente", "quinhao"]);

/** Posição no lote que distingue casas no mesmo número (só depois do logradouro). */
const POSICOES = new Set(["fundos", "frente"]);

/** Partículas que as fontes incluem ou omitem no nome do logradouro e do bairro. */
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "d", "e"]);

/** Códigos de rodovia (BR, SP, PE...): seguidos de número, fazem parte do nome. */
const CODIGOS_RODOVIA = new Set([
  "br", "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt", "pa", "pb", "pe", "pi",
  "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to",
]);

const ROMANOS: Readonly<Record<string, string>> = {
  ii: "2", iii: "3", iv: "4", vi: "6", vii: "7", viii: "8", ix: "9", xi: "11", xii: "12", xiii: "13",
  xiv: "14", xv: "15", xvi: "16", xvii: "17", xviii: "18", xix: "19", xx: "20", xxi: "21", xxii: "22",
  xxiii: "23", xxiv: "24", xxv: "25",
};

/**
 * Nomes que não identificam a rua dentro da cidade: loteamentos repetem "Rua A", "Rua 10", "Rua
 * Oito", "Rua Projetada", "Avenida Principal"; cidades do entorno do DF usam "Quadra 10".
 */
const NOMES_GENERICOS = new RegExp(
  "^(?:[a-z]|[a-z]?\\d+[a-z]?|[a-z] \\d+[a-z]?|qd \\w+|projetada.*|principal|sem (?:denominacao|nome)|existente|particular|publica|interna|central|"
    + "um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)$",
);

export interface EnderecoPartes {
  /** Tipo do logradouro por extenso ("rua", "avenida"...), ou "" se o endereço não diz. */
  tipo: string;
  /** Nome do logradouro sem tipo e sem partículas: "frei antonio guadalupe", "17 novembro", "br 316", "qd 10". */
  nome: string;
  /** Número da casa ("67", "53d"), "sn" se a fonte diz que não tem (ou "0"), ou null se não aparece. */
  numero: string | null;
  /** Unidades em ordem alfabética: ["ap 21", "bl b"], ["lt 10", "qd 272"]; valor solto vira "u 2". */
  unidades: string[];
  /** O texto fala em parte ou fração ("LT 02 PARTE"): o endereço não basta para separar imóveis. */
  fracao: boolean;
  /** O nome do logradouro é genérico ("Rua A", "Rua 10", "Rua Projetada", "Quadra 10"). */
  generico: boolean;
}

function semZeros(token: string): string {
  return token.replace(/^0+(?=\d)/, "");
}

const NUMERO_CASA = /^\d+[a-z]?$/;

/** Valor de unidade num token só: "21", "38a", "b", "a1", "1c04", "ii". */
function ehValor(token: string | undefined): token is string {
  return token !== undefined && (/^\d+[a-z]?$/.test(token) || /^[a-z]$/.test(token) || /^[a-z]\d+$/.test(token) || /^\d+[a-z]\d+$/.test(token) || ROMANOS[token] !== undefined);
}

/** Texto normalizado em palavras: sem CEP, "s/n" → "sn", "1.000" → "1000", "LT24" → "lt 24". */
function palavras(endereco: string): string[] {
  const texto = normalizarTexto(endereco)
    .replace(/\bcep:?\s*\d{5}-?\d{3}\b/g, " ")
    .replace(/\b\d{5}-\d{3}\b/g, " ")
    .replace(/\bs\s*[/.]\s*n(?:o|º|°|\.)?(?=$|[^a-z0-9])/g, " sn ")
    .replace(/\bsem\s+n(?:umero|º|o)?\b/g, " sn ")
    .replace(/(\d)\.(?=\d{3}\b)/g, "$1")
    .replace(/[º°ª]/g, " ")
    // "QDF" → "qd f" (mas "qda" e "lts" são abreviações de quadra e lotes).
    .replace(/\b(qd|lt)([b-rt-z])\b/g, "$1 $2");
  const saida: string[] = [];
  const rotulo = (p: string | undefined): boolean => p !== undefined && (UNIDADES[p] !== undefined || MARCADORES_NUMERO.has(p));
  for (const token of texto.split(/[^a-z0-9]+/)) {
    if (token === "") continue;
    // Rótulo colado no valor ("lt24", "apto101", "n567", "km42") ou valor colado no rótulo
    // seguinte ("LT 21QD 12" → "21" "qd").
    const antes = /^([a-z]+)(\d+[a-z]?)$/.exec(token);
    const depois = /^(\d+)([a-z]{2,})$/.exec(token);
    if (antes && rotulo(antes[1])) saida.push(antes[1] ?? "", antes[2] ?? "");
    else if (depois && rotulo(depois[2])) saida.push(depois[1] ?? "", depois[2] ?? "");
    else saida.push(token);
  }
  // "QUADRA QUADRA 49" → "quadra 49" (palavra repetida em sequência; números e letras soltas ficam: "LTS 4 4", "R R 14").
  return saida.filter((t, i) => !(t === saida[i - 1] && /^[a-z]{2,}$/.test(t)));
}

/**
 * Valor de uma unidade a partir de `i`: "21", "38a" (de "38 a"), "a1" (de "a 1"), "ii" → "2".
 * Não junta "e"/"a" seguidos de número ("LT 19 E 20", "LT 12 A 14": são dois lotes).
 * Devolve [valor, tokens usados].
 */
function valorDaUnidade(tokens: readonly string[], i: number): [string, number] | null {
  const a = tokens[i];
  if (!ehValor(a)) return null;
  const b = tokens[i + 1];
  const depois = tokens[i + 2];
  // "QUADRA, N. SN": o "n" é o marcador de número, não o valor da quadra.
  if (MARCADORES_NUMERO.has(a) && (b === "sn" || NUMERO_CASA.test(b ?? ""))) return null;
  if (/^\d+$/.test(a)) {
    const conjuncao = (b === "e" || b === "a") && depois !== undefined && /^\d/.test(depois);
    if (b !== undefined && /^[a-z]$/.test(b) && !conjuncao && !UNIDADES[b] && !MARCADORES_NUMERO.has(b)) return [semZeros(a) + b, 2];
    return [semZeros(a), 1];
  }
  if (/^[a-z]$/.test(a) && !MARCADORES_NUMERO.has(a) && b !== undefined && /^\d+$/.test(b)) return [a + semZeros(b), 2];
  return [ROMANOS[a] ?? semZeros(a), 1];
}

/** O token em `i` abre a parte de número/unidades do endereço? */
function abreComplemento(tokens: readonly string[], i: number): boolean {
  const t = tokens[i] as string;
  const seguinte = tokens[i + 1];
  if (MARCADORES_NUMERO.has(t)) return seguinte === "sn" || (seguinte !== undefined && NUMERO_CASA.test(seguinte));
  if (t === "sn" || FRACAO.has(t)) return true;
  // "10 FUNDOS": a posição só conta logo depois de um número.
  if (POSICOES.has(t)) return /^\d/.test(tokens[i - 1] ?? "");
  return UNIDADES[t] !== undefined && valorDaUnidade(tokens, i + 1) !== null;
}

/** Nome do logradouro comparável: títulos por extenso, sem partículas, romanos em arábicos, sem zeros à esquerda. */
function normalizarNome(tokens: readonly string[]): string {
  return tokens
    .map((t, i) => {
      // "PE-060" é rodovia, não "padre".
      if (CODIGOS_RODOVIA.has(t) && /^\d+$/.test(tokens[i + 1] ?? "")) return t;
      if (t.length >= 2 && UNIDADES[t]) return UNIDADES[t];
      return TITULOS[t] ?? t;
    })
    .filter((t) => !PARTICULAS.has(t))
    .map((t) => ROMANOS[t] ?? semZeros(t))
    .filter((t, i, todos) => t !== todos[i - 1]) // "QUADRA QUADRA 56" → "qd 56"
    .join(" ");
}

/** Número da casa depois do marcador em `i` ("N. 221-B" → "221b"). Devolve [número, tokens usados]. */
function numeroAposMarcador(resto: readonly string[], i: number): [string, number] {
  const valor = resto[i] as string;
  if (valor === "sn") return ["sn", 1];
  const letra = resto[i + 1];
  const conjuncao = (letra === "e" || letra === "a") && /^\d/.test(resto[i + 2] ?? "");
  if (/^\d+$/.test(valor) && letra !== undefined && /^[a-z]$/.test(letra) && !MARCADORES_NUMERO.has(letra) && !conjuncao) {
    return [semZeros(valor) + letra, 2];
  }
  return [semZeros(valor), 1];
}

/** Separa o endereço em partes comparáveis. Nunca lança; o que não aparece fica vazio. */
export function analisarEndereco(endereco: string): EnderecoPartes {
  const tokens = palavras(endereco);
  // O logradouro vai até o primeiro marcador de número, "sn", unidade com valor ou fração.
  let corte = tokens.findIndex((_, i) => i > 0 && abreComplemento(tokens, i));
  if (corte < 0) corte = tokens.length;
  let regiao = tokens.slice(0, corte);
  let resto = tokens.slice(corte);

  // Começa por unidade ("LT 02 QD 01, N. 53D, RUA CROACIA"): é tudo complemento, e a rua, se
  // houver, vem depois de uma palavra de tipo.
  const unidadeInicial = UNIDADES[regiao[0] ?? ""];
  if (unidadeInicial && !ENDERECAMENTO.has(unidadeInicial) && valorDaUnidade(tokens, 1) !== null) {
    resto = tokens;
    regiao = [];
    const inicioRua = resto.findIndex((t, i) => TIPOS[t] !== undefined && resto[i + 1] !== undefined && !abreComplemento(resto, i + 1));
    if (inicioRua >= 0) {
      let fim = resto.findIndex((_, i) => i > inicioRua && abreComplemento(resto, i));
      if (fim < 0) fim = resto.length;
      regiao = resto.slice(inicioRua, fim);
      resto = [...resto.slice(0, inicioRua), ...resto.slice(fim)];
    }
  }

  const tipo = TIPOS[regiao[0] ?? ""] ?? "";
  const nomeTokens = tipo ? regiao.slice(1) : [...regiao];
  // Tipo repetido por extenso: "R. RUA JONAS", "RUA RUA 12" (mas "R. R 14" é a rua R 14).
  while (tipo && (nomeTokens[0] ?? "").length >= 3 && TIPOS[nomeTokens[0] ?? ""] === tipo && nomeTokens.length > 1) nomeTokens.shift();

  // Número com marcador ("N. 124") vence o número no fim do logradouro ("RUA SDO 01, N. 124").
  let numero: string | null = null;
  const marcador = resto.findIndex((t, i) => (MARCADORES_NUMERO.has(t) && (resto[i + 1] === "sn" || NUMERO_CASA.test(resto[i + 1] ?? ""))) || t === "sn");
  if (marcador < 0) {
    // Sem marcador: número no fim do logradouro ("Av Paulista 1000"), se sobrar nome e não for
    // rodovia ("BR 316") nem designação sem tipo de rua ("QR 01", "SQN 210", do DF).
    const ultimo = nomeTokens[nomeTokens.length - 1];
    const penultimo = nomeTokens[nomeTokens.length - 2];
    const designacao = tipo === "" && nomeTokens.length === 2 && ((penultimo ?? "").length <= 4 || UNIDADES[penultimo ?? ""] !== undefined);
    if (ultimo !== undefined && NUMERO_CASA.test(ultimo) && nomeTokens.length >= 2 && !designacao && !(penultimo !== undefined && CODIGOS_RODOVIA.has(penultimo))) {
      numero = semZeros(ultimo);
      nomeTokens.pop();
    }
  }

  const unidades = new Set<string>();
  let fracao = false;
  for (let i = 0; i < resto.length; i++) {
    const t = resto[i] as string;
    const seguinte = resto[i + 1];
    if (MARCADORES_NUMERO.has(t) && (seguinte === "sn" || NUMERO_CASA.test(seguinte ?? ""))) {
      const [valor, usados] = numeroAposMarcador(resto, i + 1);
      numero ??= valor;
      i += usados;
    } else if (t === "sn") {
      numero ??= "sn";
    } else if (FRACAO.has(t)) {
      fracao = true;
    } else if (POSICOES.has(t)) {
      unidades.add(t);
    } else if (TIPOS[t] && seguinte !== undefined && !abreComplemento(resto, i + 1)) {
      // Rua citada no complemento ("QUADRA 10, ..., RUA 1"): não distingue o imóvel; pula até o próximo complemento.
      while (i + 1 < resto.length && !abreComplemento(resto, i + 1)) i++;
    } else if (UNIDADES[t]) {
      const valor = valorDaUnidade(resto, i + 1);
      if (!valor) continue;
      unidades.add(`${UNIDADES[t]} ${valor[0]}`);
      i += valor[1];
      // "LT 19 E 20", "LTS 01 A 10", "LOTES 01 AO 20", "LTS 4 5 13": mais valores da mesma unidade.
      if (!/^\d/.test(valor[0])) continue;
      for (;;) {
        const ligacao = CONJUNCOES.has(resto[i + 1] ?? "") ? 1 : 0;
        // Número solto só continua lista de lotes ("LTS 4 5 13"); "Apto 102, 1 PAV" não é o apto 1.
        if (ligacao === 0 && UNIDADES[t] !== "lt") break;
        if (!/^\d+[a-z]?$/.test(resto[i + 1 + ligacao] ?? "")) break;
        const outro = valorDaUnidade(resto, i + 1 + ligacao);
        if (!outro) break;
        unidades.add(`${UNIDADES[t]} ${outro[0]}`);
        i += ligacao + outro[1];
      }
    } else if (ehValor(t) && !PARTICULAS.has(t)) {
      // Valor solto depois do logradouro ("N. 725, 02"): identifica a unidade, mesmo sem dizer qual.
      unidades.add(`u ${ROMANOS[t] ?? semZeros(t)}`);
    }
  }
  if (numero === "0") numero = "sn";

  let nome = normalizarNome(nomeTokens);
  // Sem rua, a quadra é o endereço ("LOTE 02, N. SN, QD 16" = "QUADRA 16, N. SN, LOTE 02").
  const quadras = [...unidades].filter((u) => u.startsWith("qd "));
  if (tipo === "" && nome === "" && quadras.length === 1 && quadras[0]) {
    nome = quadras[0];
    unidades.delete(quadras[0]);
  }
  return { tipo, nome, numero, unidades: [...unidades].sort(), fracao, generico: nome === "" || NOMES_GENERICOS.test(nome) };
}

/** Logradouro comparável (tipo + nome): "rua frei antonio guadalupe". */
export function logradouroComparavel(partes: Pick<EnderecoPartes, "tipo" | "nome">): string {
  return [partes.tipo, partes.nome].filter((p) => p !== "").join(" ");
}

/**
 * Quanto o endereço distingue um imóvel: 1 pelo número de verdade (não "sn") e 1 por unidade.
 * "Rua X, 10" → 1; "Rua X, s/n, lote 10, quadra 272" → 2; "Rua X, 10, ap 21, bl B" → 3.
 */
export function especificidade(partes: Pick<EnderecoPartes, "numero" | "unidades">): number {
  return (partes.numero !== null && partes.numero !== "sn" ? 1 : 0) + partes.unidades.length;
}

/** Abreviações de bairro. */
const BAIRRO: Readonly<Record<string, string>> = {
  jd: "jardim", jdm: "jardim", vl: "vila", pq: "parque", prq: "parque", res: "residencial", resid: "residencial",
  cj: "conjunto", conj: "conjunto", cjto: "conjunto", lot: "loteamento", nuc: "nucleo", st: "setor", set: "setor",
  ch: "chacara", chac: "chacara", chacaras: "chacara", cond: "condominio", hab: "habitacional", sta: "santa",
  sto: "santo", cid: "cidade", bal: "balneario", faz: "fazenda", sit: "sitio", pov: "povoado", dist: "distrito",
};

/**
 * Bairro comparável: sem acento, abreviações por extenso, sem "bairro" no começo, sem
 * partículas e com romanos em arábicos. "JD. AMÉRICA II" → "jardim america 2"; "BAIRRO COHAB" → "cohab".
 */
export function normalizarBairro(bairro: string | null | undefined): string {
  if (!bairro) return "";
  const tokens = normalizarTexto(bairro)
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== "");
  if (tokens[0] === "bairro" && tokens.length > 1) tokens.shift();
  return tokens
    .map((t) => BAIRRO[t] ?? t)
    .filter((t) => !PARTICULAS.has(t))
    .map((t) => ROMANOS[t] ?? semZeros(t))
    .join(" ");
}
