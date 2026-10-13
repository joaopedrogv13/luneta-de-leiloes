/**
 * Endereço em partes comparáveis: tipo e nome do logradouro, número e unidades (apartamento,
 * bloco, casa, lote, quadra...). Escrito para os formatos vistos nas fontes:
 *   Caixa:       "RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10"
 *                "AVENIDA DAS FLORES, N. SN, Apto 1007,  BL C"
 *                "QUADRA 10, N. SN, Apto 201, LT 25, CJ A, ST 05, RUA 1"   (endereço por quadra)
 *                "LT 02 QD 01, N. 53D, RUA CROACIA"                         (rua no fim)
 *                "RUA N-1, N. SN, LT 08, QD 44"                             (rua com designação "N-1")
 *   leiloeiro:   "Rua Frei Antônio de Guadalupe, nº 67, apto 21, Vila Prudente, São Paulo/SP"
 *                "Rua Doutor Melo Alves, nº 640, apartamento nº 91, Cerqueira César, São Paulo/SP"
 *                "Rua Dardanelos, 411 - Apto 162 - Alto da Lapa - São Paulo/SP"   (número sem "nº")
 *   sem vírgula: "Av Paulista 1000 ap 52 bl B"
 *   rodovia:     "RODOVIA BR-316 KM 42, N. S/N, LOTE 10 - RAMAL JOÃO NOVO"
 * O resultado é minúsculo, sem acento e com abreviações por extenso, para que duas fontes que
 * escrevem o mesmo endereço de jeitos diferentes cheguem às mesmas partes.
 *
 * Campos: vírgula, ponto e vírgula e hífen entre espaços separam campos. O logradouro termina na
 * primeira vírgula (ou no primeiro número/complemento); sem marcador de número, o número é o
 * primeiro campo só numérico depois do logradouro ("Rua X, 493, Vila Industrial"). Campos de
 * cidade ("São Paulo/SP", a cidade informada) e o bairro informado saem antes da análise.
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
 * seguidos de um valor ("LT 10", "BL C", "CASA II", "apartamento nº 91").
 */
const UNIDADES: Readonly<Record<string, string>> = {
  ap: "ap", apt: "ap", apto: "ap", aptos: "ap", apartamento: "ap",
  bl: "bl", blc: "bl", bloco: "bl", torre: "torre", tr: "torre",
  cs: "casa", casa: "casa", sobrado: "casa", sl: "sala", sala: "sala", lj: "loja", loja: "loja",
  box: "box", boxe: "box", vaga: "vaga", vg: "vaga", unidade: "unidade", und: "unidade", unid: "unidade", un: "unidade", uh: "unidade",
  lt: "lt", lte: "lt", lote: "lt", lts: "lt", lotes: "lt", lot: "lt",
  qd: "qd", qda: "qd", quadra: "qd", quarteirao: "qd",
  km: "km", cj: "conjunto", conj: "conjunto", conjunto: "conjunto",
  st: "setor", setor: "setor", area: "area", gleba: "gleba", ch: "chacara", chacara: "chacara",
  zn: "zona", zona: "zona", pav: "pav", pavimento: "pav",
};
const UNIDADES_CANONICAS = new Set(Object.values(UNIDADES));

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

/**
 * Partículas que as fontes incluem ou omitem no nome do logradouro e do bairro. "d" e "e" só são
 * partícula antes de outra palavra ("D'Ávila", "Santos e Silva"): sozinhas ou no fim ("RUA E",
 * "RUA PROJETADA D") são o próprio nome.
 */
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "d", "e"]);

/** Siglas das UFs (campo "São Paulo/SP" ou "SP" no fim do endereço é cidade, não complemento). */
const UFS = new Set([
  "ac", "al", "am", "ap", "ba", "ce", "df", "es", "go", "ma", "mg", "ms", "mt", "pa", "pb", "pe", "pi",
  "pr", "rj", "rn", "ro", "rr", "rs", "sc", "se", "sp", "to",
]);

/** Códigos de rodovia (BR e as UFs): seguidos de número, fazem parte do nome. */
const CODIGOS_RODOVIA = new Set(["br", ...UFS]);

const ROMANOS: Readonly<Record<string, string>> = {
  ii: "2", iii: "3", iv: "4", vi: "6", vii: "7", viii: "8", ix: "9", xi: "11", xii: "12", xiii: "13",
  xiv: "14", xv: "15", xvi: "16", xvii: "17", xviii: "18", xix: "19", xx: "20", xxi: "21", xxii: "22",
  xxiii: "23", xxiv: "24", xxv: "25",
};

/**
 * Nomes que não identificam a rua dentro da cidade: loteamentos repetem "Rua A", "Rua 10", "Rua
 * Oito", "Rua Projetada", "Avenida Principal", "Rua N-1"; cidades do entorno do DF usam "Quadra 10".
 */
const NOMES_GENERICOS = new RegExp(
  "^(?:[a-z](?: [a-z])*|[a-z]?\\d+[a-z]?(?: [a-z])?|[a-z] \\d+[a-z]?|qd \\w+(?: \\w+)?|projetada.*|principal|sem (?:denominacao|nome)|existente|particular|publica|interna|central|"
    + "um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)$",
);

/**
 * Fronteiras de campo entre as palavras: "," (vírgula, ponto e vírgula), "-" (hífen ou travessão
 * entre espaços) e "#" (onde estava a cidade: "..., Vila Prudente, São Paulo/SP").
 */
const VIRGULA = ",";
const TRACO = "-";
const CIDADE = "#";

function ehFronteira(token: string | undefined): boolean {
  return token === VIRGULA || token === TRACO || token === CIDADE;
}

export interface EnderecoPartes {
  /** Tipo do logradouro por extenso ("rua", "avenida"...), ou "" se o endereço não diz. */
  tipo: string;
  /** Nome do logradouro sem tipo e sem partículas: "frei antonio guadalupe", "17 novembro", "br 316", "qd 10", "n 1". */
  nome: string;
  /** Número da casa ("67", "53d"), "sn" se a fonte diz que não tem (ou "0"), ou null se não aparece. */
  numero: string | null;
  /** Unidades em ordem alfabética: ["ap 21", "bl b"], ["lt 10", "qd 272"]; valor solto vira "u 2". */
  unidades: string[];
  /** O texto fala em parte ou fração ("LT 02 PARTE"): o endereço não basta para separar imóveis. */
  fracao: boolean;
  /** O nome do logradouro é genérico ("Rua A", "Rua 10", "Rua Projetada", "Quadra 10") ou vazio. */
  generico: boolean;
  /**
   * Bairro escrito no próprio texto, normalizado: o que vem logo antes da cidade ("..., nº 67,
   * apto 21, Vila Prudente, São Paulo/SP" → "vila prudente"), senão o último campo só de palavras
   * depois do logradouro, ou "". Serve para a chave quando a fonte não informa o bairro à parte.
   */
  bairro: string;
}

/** O que a fonte já informa em outros campos: sai do texto do endereço quando aparece como campo. */
export interface ContextoEndereco {
  cidade?: string | null;
  uf?: string | null;
  bairro?: string | null;
}

function semZeros(token: string): string {
  return token.replace(/^0+(?=\d)/, "");
}

const NUMERO_CASA = /^\d+[a-z]?$/;

/** Valor de unidade num token só: "21", "38a", "b", "a1", "1c04", "ii". */
function ehValor(token: string | undefined): token is string {
  return token !== undefined && (/^\d+[a-z]?$/.test(token) || /^[a-z]$/.test(token) || /^[a-z]\d+$/.test(token) || /^\d+[a-z]\d+$/.test(token) || ROMANOS[token] !== undefined);
}

/**
 * "e"/"a" entre dois números ("LT 19 E 20", "LTS 12 A 14") ou "e" antes de outra rua ("nº 18 e
 * Rua Monte Alegre"): é conjunção, não letra do número ("LT 12-A RUA 03" é o lote 12-A).
 */
function ehConjuncao(token: string | undefined, depois: string | undefined): boolean {
  if (depois === undefined) return false;
  return ((token === "e" || token === "a") && /^\d/.test(depois)) || (token === "e" && TIPOS[depois] !== undefined);
}

/** Texto comparável de um campo: minúsculas, sem acento, só letras e números separados por espaço. */
function textoComparavel(texto: string): string {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Campo de lugar: "uf" ("São Paulo/SP", "Recife (PE)", "SP"), "nome_cidade" (igual à cidade
 * informada) ou "bairro" (igual ao bairro informado; só com palavra, nunca "02" ou "LT 5").
 */
function campoDeLugar(campo: string, cidade: string, bairro: string): "uf" | "nome_cidade" | "bairro" | null {
  const uf = /(?:\/\s*|\(\s*)([a-z]{2})\s*\)?$/.exec(campo);
  if (uf && UFS.has(uf[1] ?? "")) return "uf";
  const comparavel = textoComparavel(campo);
  if (UFS.has(comparavel)) return "uf";
  if (cidade !== "" && comparavel === cidade) return "nome_cidade";
  return bairro !== "" && /[a-z]{3}/.test(comparavel) && normalizarBairro(campo) === bairro ? "bairro" : null;
}

/** Palavras de um campo: "s/n" → "sn", "LT24" → "lt 24", "21QD" → "21 qd". */
function palavrasDoCampo(campo: string): string[] {
  const saida: string[] = [];
  const rotulo = (p: string | undefined): boolean => p !== undefined && (UNIDADES[p] !== undefined || MARCADORES_NUMERO.has(p));
  for (const token of campo.split(/[^a-z0-9]+/)) {
    if (token === "") continue;
    // Rótulo colado no valor ("lt24", "apto101", "n567", "km42") ou valor colado no rótulo
    // seguinte ("LT 21QD 12" → "21" "qd").
    const antes = /^([a-z]+)(\d+[a-z]?)$/.exec(token);
    const depois = /^(\d+)([a-z]{2,})$/.exec(token);
    if (antes && rotulo(antes[1])) saida.push(antes[1] ?? "", antes[2] ?? "");
    else if (depois && rotulo(depois[2])) saida.push(depois[1] ?? "", depois[2] ?? "");
    else saida.push(token);
  }
  return saida;
}

/**
 * Texto normalizado em palavras, com as fronteiras de campo como tokens "," e "-": sem CEP,
 * "s/n" → "sn", "1.000" → "1000", "LT24" → "lt 24". Campos de cidade e o bairro informado saem
 * (menos o primeiro campo, que é sempre o logradouro).
 */
function palavras(endereco: string, contexto: ContextoEndereco = {}): string[] {
  const texto = normalizarTexto(endereco)
    .replace(/\bcep:?\s*\d{2}\.?\d{3}-?\d{3}\b/g, " ")
    .replace(/\b\d{5}-\d{3}\b/g, " ")
    .replace(/\bs\s*[/.]\s*n(?:o|º|°|\.)?(?=$|[^a-z0-9])/g, " sn ")
    .replace(/\bsem\s+n(?:umero|º|o)?\b/g, " sn ")
    .replace(/(\d)\.(?=\d{3}\b)/g, "$1")
    .replace(/[º°ª]/g, " ")
    // "LT 26-A", "N. 75-E": a letra presa ao número por hífen é do número ("26a"); "N-1" e "BR-316" ficam.
    .replace(/(^|[^a-z0-9-])(\d+)-([a-z])\b/g, "$1$2$3")
    // "QDF" → "qd f" (mas "qda" e "lts" são abreviações de quadra e lotes).
    .replace(/\b(qd|lt)([b-rt-z])\b/g, "$1 $2");
  const cidade = contexto.cidade ? textoComparavel(contexto.cidade) : "";
  const bairro = contexto.bairro ? normalizarBairro(contexto.bairro) : "";

  // Campos e o separador antes de cada um (o split guarda os separadores nas posições ímpares;
  // entre dois campos vale o mais forte: ", ," e ", -" contam como vírgula).
  const pedacos = texto.split(/(\s*[,;]\s*|\s+[-–—]\s+)/);
  const campos: Array<{ texto: string; separador: string | null }> = [];
  let pendente: string | null = null;
  for (let i = 0; i < pedacos.length; i += 2) {
    if (i > 0 && pendente !== VIRGULA) pendente = /[,;]/.test(pedacos[i - 1] ?? "") ? VIRGULA : TRACO;
    const campo = (pedacos[i] ?? "").trim();
    if (campo === "") continue;
    campos.push({ texto: campo, separador: campos.length > 0 ? pendente : null });
    pendente = null;
  }
  const lugares = campos.map((c, k) => (k === 0 ? null : campoDeLugar(c.texto, cidade, bairro)));
  // O nome da cidade só é a cidade se vier por último ou antes da UF ("São Paulo, SP"); antes de
  // "Cha de Alegria/PE" ele é o bairro de mesmo nome.
  lugares.forEach((l, k) => {
    const proximo = campos[k + 1];
    if (l === "nome_cidade" && proximo && !(lugares[k + 1] === "uf" && UFS.has(textoComparavel(proximo.texto)))) lugares[k] = null;
  });
  // Bairro informado escrito com hífen ("Cidade Jardins - Etapa B") ocupa vários campos.
  if (bairro !== "") {
    for (let k = 1; k < campos.length; k++) {
      for (let n = 2; n <= 3 && k + n <= campos.length; n++) {
        const grupo = campos.slice(k, k + n);
        if (grupo.slice(1).some((c) => c.separador !== TRACO)) break;
        if (normalizarBairro(grupo.map((c) => c.texto).join(" ")) === bairro) for (let j = k; j < k + n; j++) lugares[j] = "bairro";
      }
    }
  }

  const saida: string[] = [];
  // Fronteira pendente até o próximo campo; a mais forte vence (cidade > vírgula > hífen).
  let fronteira: string | null = null;
  const forca = (f: string | null): number => (f === CIDADE ? 3 : f === VIRGULA ? 2 : f === TRACO ? 1 : 0);
  const marcar = (f: string): void => {
    if (saida.length > 0 && forca(f) > forca(fronteira)) fronteira = f;
  };
  for (const [k, campo] of campos.entries()) {
    if (campo.separador) marcar(campo.separador);
    const lugar = lugares[k];
    if (lugar === "uf" || lugar === "nome_cidade") marcar(CIDADE);
    if (lugar !== null) continue;
    const tokens = palavrasDoCampo(campo.texto);
    if (tokens.length === 0) continue;
    // "BLOCO - A", "CASA - A", "LT 422 - A QD HI": o hífen entre o rótulo e o valor, ou entre o
    // número e a letra dele, não separa campos.
    const anterior = saida[saida.length - 1] ?? "";
    const letraDoNumero = /^\d+$/.test(anterior) && /^[a-z]$/.test(tokens[0] ?? "") && (tokens.length === 1 || UNIDADES[tokens[1] ?? ""] !== undefined);
    const juntar = fronteira === TRACO && ((UNIDADES[anterior] !== undefined && ehValor(tokens[0])) || letraDoNumero);
    if (saida.length > 0 && !juntar) saida.push(fronteira ?? VIRGULA);
    saida.push(...tokens);
    fronteira = null;
  }
  if (fronteira === CIDADE) saida.push(CIDADE);
  // "QUADRA QUADRA 49" → "quadra 49" (palavra repetida em sequência; números e letras soltas ficam: "LTS 4 4", "R R 14").
  return saida.filter((t, i) => !(t === saida[i - 1] && /^[a-z]{2,}$/.test(t)));
}

/**
 * Marcador em `i` que faz parte da designação do rótulo anterior, não o número da casa:
 * "LOTE Nº 5", "apartamento nº 91" (logo depois de unidade) e "RUA Nº 06", "RUA N-1" (logo depois
 * do tipo, no começo do logradouro).
 */
function marcadorDeRotulo(tokens: readonly string[], i: number): boolean {
  const anterior = tokens[i - 1];
  if (anterior === undefined || !MARCADORES_NUMERO.has(tokens[i] ?? "") || !/^\d/.test(tokens[i + 1] ?? "")) return false;
  if (UNIDADES[anterior] !== undefined) return true;
  const antesDoTipo = tokens[i - 2];
  return TIPOS[anterior] !== undefined && (antesDoTipo === undefined || ehFronteira(antesDoTipo));
}

/**
 * Valor de uma unidade a partir de `i`: "21", "38a" (de "38 a"), "a1" (de "a 1"), "ii" → "2";
 * pula o marcador logo depois do rótulo ("apartamento nº 91", "LOTE N.17").
 * Não junta "e"/"a" seguidos de número ("LT 19 E 20", "LT 12 A 14": são dois lotes).
 * Devolve [valor, tokens usados].
 */
function valorDaUnidade(tokens: readonly string[], i: number): [string, number] | null {
  // O marcador seguido de algarismo é só o "nº" ("lote nº 11A3"); o valor nunca é o próprio "n".
  if (MARCADORES_NUMERO.has(tokens[i] ?? "") && /^\d/.test(tokens[i + 1] ?? "")) {
    const valor = valorDaUnidade(tokens, i + 1);
    return valor ? [valor[0], valor[1] + 1] : null;
  }
  const a = tokens[i];
  if (!ehValor(a)) return null;
  const b = tokens[i + 1];
  // "QUADRA N SN": o "n" é o marcador do número da casa, não o valor da quadra.
  if (MARCADORES_NUMERO.has(a) && b === "sn") return null;
  if (/^\d+$/.test(a)) {
    if (b !== undefined && /^[a-z]$/.test(b) && !ehConjuncao(b, tokens[i + 2]) && !UNIDADES[b] && !MARCADORES_NUMERO.has(b)) return [semZeros(a) + b, 2];
    return [semZeros(a), 1];
  }
  if (/^[a-z]$/.test(a) && !MARCADORES_NUMERO.has(a) && b !== undefined && NUMERO_CASA.test(b)) return [a + semZeros(b), 2];
  return [ROMANOS[a] ?? semZeros(a), 1];
}

/** O token em `i` abre a parte de número/unidades do endereço? */
function abreComplemento(tokens: readonly string[], i: number): boolean {
  const t = tokens[i];
  if (t === undefined || ehFronteira(t)) return false;
  const seguinte = tokens[i + 1];
  if (MARCADORES_NUMERO.has(t)) {
    if (marcadorDeRotulo(tokens, i)) return false;
    return seguinte === "sn" || NUMERO_CASA.test(seguinte ?? "");
  }
  if (t === "sn" || FRACAO.has(t)) return true;
  // "10 FUNDOS": a posição só conta logo depois de um número.
  if (POSICOES.has(t)) return /^\d/.test(tokens[i - 1] ?? "");
  return UNIDADES[t] !== undefined && valorDaUnidade(tokens, i + 1) !== null;
}

/** "d"/"e" é partícula só antes de outra palavra ("D'Ávila", "Santos e Silva"). */
function ehParticula(token: string, seguinte: string | undefined): boolean {
  if (!PARTICULAS.has(token)) return false;
  return (token !== "d" && token !== "e") || /^[a-z]{2,}/.test(seguinte ?? "");
}

/** Nome do logradouro comparável: títulos por extenso, sem partículas, romanos em arábicos, sem zeros à esquerda. */
function normalizarNome(tokens: readonly string[]): string {
  const mapeados = tokens.map((t, i) => {
    // "PE-060" é rodovia, não "padre".
    if (CODIGOS_RODOVIA.has(t) && /^\d+$/.test(tokens[i + 1] ?? "")) return t;
    if (t.length >= 2 && UNIDADES[t]) return UNIDADES[t];
    return TITULOS[t] ?? t;
  });
  return mapeados
    .filter((t, i) => !ehParticula(t, mapeados[i + 1]))
    // "QUADRA Nº 5" = "QUADRA 5": o marcador depois da unidade não faz parte do nome.
    .filter((t, i, todos) => !(MARCADORES_NUMERO.has(t) && UNIDADES_CANONICAS.has(todos[i - 1] ?? "") && /^\d/.test(todos[i + 1] ?? "")))
    .map((t) => ROMANOS[t] ?? semZeros(t))
    .filter((t, i, todos) => t !== todos[i - 1]) // "QUADRA QUADRA 56" → "qd 56"
    .join(" ");
}

/**
 * Número da casa a partir de `i` ("N. 221-B" → "221b"; "nº 18 e Rua..." → "18"; "N. 540, A" →
 * "540a": letra sozinha no campo seguinte é a letra do número). Devolve [número, tokens usados].
 */
function numeroAposMarcador(resto: readonly string[], i: number): [string, number] {
  const valor = resto[i] as string;
  if (valor === "sn") return ["sn", 1];
  // "N. O-271", "N. T 08": letra e número.
  if (/^[a-z]$/.test(valor) && !MARCADORES_NUMERO.has(valor) && /^\d+$/.test(resto[i + 1] ?? "")) return [valor + semZeros(resto[i + 1] as string), 2];
  if (!/^\d+$/.test(valor)) return [semZeros(valor), 1];
  const letraNoCampo = (j: number): boolean => {
    const letra = resto[j];
    return letra !== undefined && /^[a-z]$/.test(letra) && !MARCADORES_NUMERO.has(letra) && !ehConjuncao(letra, resto[j + 1]);
  };
  if (letraNoCampo(i + 1)) return [semZeros(valor) + resto[i + 1], 2];
  const depoisDaLetra = resto[i + 3];
  if (ehFronteira(resto[i + 1]) && letraNoCampo(i + 2) && (depoisDaLetra === undefined || ehFronteira(depoisDaLetra) || UNIDADES[depoisDaLetra] !== undefined)) {
    return [semZeros(valor) + resto[i + 2], 3];
  }
  return [semZeros(valor), 1];
}

/**
 * Marcador de número da casa em `i` ("N. 124", "nº 67", "N. SN"; "N. A185" no começo do campo),
 * fora de designação de rótulo ("LOTE Nº 5", "RUA Nº 06").
 */
function ehMarcadorDeNumero(tokens: readonly string[], i: number): boolean {
  const t = tokens[i] ?? "";
  const seguinte = tokens[i + 1] ?? "";
  if (!MARCADORES_NUMERO.has(t) || marcadorDeRotulo(tokens, i)) return false;
  if (seguinte === "sn" || NUMERO_CASA.test(seguinte)) return true;
  // No começo do campo ("N. A185", "N. 540A2", "N. O-271"), o que vier com algarismo é o número.
  const comecoDoCampo = i === 0 || ehFronteira(tokens[i - 1]);
  const letraENumero = /^[a-z]$/.test(seguinte) && !MARCADORES_NUMERO.has(seguinte) && /^\d+$/.test(tokens[i + 2] ?? "");
  return comecoDoCampo && (/^[a-z]?\d+[a-z0-9]*$/.test(seguinte) || letraENumero);
}

/** Palavra que não é rótulo, valor nem ligação: nome de bairro, de condomínio, "andar"... (3 letras ou mais: "CA B", "SS-35" ficam de fora). */
function ehPalavraLivre(token: string): boolean {
  return /^[a-z]{3,}$/.test(token) && UNIDADES[token] === undefined && TIPOS[token] === undefined && !MARCADORES_NUMERO.has(token)
    && !FRACAO.has(token) && !POSICOES.has(token) && !CONJUNCOES.has(token) && !PARTICULAS.has(token) && ROMANOS[token] === undefined && token !== "sn";
}

interface Campo {
  inicio: number;
  fim: number;
  tokens: string[];
}

/** Campos de `tokens` (entre fronteiras), com as posições. */
function camposDe(tokens: readonly string[]): Campo[] {
  const campos: Campo[] = [];
  let inicio = 0;
  for (let i = 0; i <= tokens.length; i++) {
    if (i < tokens.length && !ehFronteira(tokens[i])) continue;
    if (i > inicio) campos.push({ inicio, fim: i, tokens: tokens.slice(inicio, i) });
    inicio = i + 1;
  }
  return campos;
}

/** O campo tem rótulo de unidade com valor ("LT 5", "apartamento nº 91")? */
function temUnidadeComValor(tokens: readonly string[]): boolean {
  return tokens.some((t, i) => UNIDADES[t] !== undefined && valorDaUnidade(tokens, i + 1) !== null);
}

/** Palavras que abrem nome de bairro ou loteamento ("Jardim América II", "Parque Humaitá III", "Conjunto Habitacional X 2"). */
const CABECAS_DE_BAIRRO = new Set([
  "jardim", "jd", "jdm", "vila", "vl", "parque", "pq", "prq", "bairro", "loteamento", "lot", "nucleo", "nuc", "cidade", "cid",
  "conjunto", "cj", "conj", "setor", "recanto", "portal", "morada", "chacaras", "vale", "povoado", "distrito",
]);

/** Campo sem número com marcador, "s/n", fração, tipo de rua no começo nem unidade com valor ("N Sra das Graças" passa). */
function campoSemComplemento(tokens: readonly string[]): boolean {
  const marcadorComNumero = tokens.some((t, i) => MARCADORES_NUMERO.has(t) && /^\d/.test(tokens[i + 1] ?? ""));
  return !marcadorComNumero && !tokens.some((t) => FRACAO.has(t) || t === "sn") && TIPOS[tokens[0] ?? ""] === undefined && !temUnidadeComValor(tokens);
}

/**
 * Nome de bairro ou loteamento escrito no complemento: começa por "Jardim", "Vila", "Parque"...
 * seguido de nome ("Jardim América II", "JD IRACEMA 1"). O valor solto dele faz parte do nome e
 * não é unidade. "VILA A" e "VL 14" (sem nome) não contam: podem ser a casa da vila.
 */
function campoDeBairro(tokens: readonly string[]): boolean {
  return CABECAS_DE_BAIRRO.has(tokens[0] ?? "") && tokens.slice(1).some(ehPalavraLivre) && campoSemComplemento(tokens);
}

/** Candidato a bairro do texto: campo de bairro, ou campo só de palavras ("Vila Prudente", "Alto da Lapa", "Centro"). */
function campoBairroDoTexto(tokens: readonly string[]): boolean {
  return campoDeBairro(tokens) || (tokens.some(ehPalavraLivre) && !tokens.some((t) => /\d/.test(t)) && campoSemComplemento(tokens));
}

/**
 * Em `j` começa a continuação de uma lista de números ("03 E 04", "03, 05 E 18")? Sem "e" no
 * fim, só depois de rótulo no plural ("LTS 42, 43, 44"): "LT 10, 02" pode ser lote e casa.
 */
function listaDeLotes(tokens: readonly string[], j: number, plural: boolean): boolean {
  let conjuncao = false;
  for (let k = j; k < tokens.length; k++) {
    const t = tokens[k] as string;
    if (/^\d+[a-z]?$/.test(t) || t === VIRGULA || t === TRACO) continue;
    if (CONJUNCOES.has(t) && /^\d/.test(tokens[k + 1] ?? "")) {
      conjuncao = true;
      continue;
    }
    break;
  }
  return (conjuncao || plural) && /^\d/.test(tokens[j] ?? "");
}

/**
 * Bairro escrito logo antes da cidade ("..., apto 21, Vila Prudente, São Paulo/SP"; "411 - Apto 162
 * - Alto da Lapa - São Paulo/SP"; "..., Jardim das Alterosas - 2a Seção, Betim/MG"): os campos sem
 * complemento antes da cidade, até a vírgula (ou, no formato só com hífens, até o primeiro campo
 * de número ou unidade). Um valor solto só entra no fim, preso por hífen a um nome ("Chácara Saia
 * Velha - B"): "725 - 02 - Centro" mantém o "02" como unidade.
 */
function bairroAntesDaCidade(tokens: readonly string[], campos: readonly Campo[], bairroInformado: boolean): Campo[] {
  const iCidade = tokens.indexOf(CIDADE);
  if (iCidade < 0) return [];
  const antes = campos.filter((c) => c.fim <= iCidade && c.inicio > 0);
  // Com valor ("Jardim América II", "Parque da Barragem Setor 11"), só se começar como nome de
  // bairro; ou, quando a fonte não informa o bairro à parte, qualquer campo sem complemento
  // ("João Paulo II"). Com o bairro informado, "Terreno 03" e "Tipo B" antes da cidade são do imóvel.
  const ehBairro = (c: Campo): boolean => {
    const t = c.tokens;
    if (bairroInformado) return campoSemComplemento(t) && !t.some((x) => ehValor(x) && !PARTICULAS.has(x));
    const cabeca = CABECAS_DE_BAIRRO.has(t[0] ?? "") && t.slice(1).some(ehPalavraLivre);
    return (cabeca && !t.some((x, i) => FRACAO.has(x) || x === "sn" || (MARCADORES_NUMERO.has(x) && /^\d/.test(t[i + 1] ?? "")))) || campoSemComplemento(t);
  };
  const temPalavra = (c: Campo | undefined): boolean => c !== undefined && c.tokens.some(ehPalavraLivre) && ehBairro(c);
  const aceitos: Campo[] = [];
  for (let k = antes.length - 1; k >= 0; k--) {
    const campo = antes[k] as Campo;
    if (!ehBairro(campo)) break;
    const presoPorTraco = tokens[campo.inicio - 1] === TRACO;
    if (!temPalavra(campo) && (aceitos.length > 0 || !presoPorTraco || !temPalavra(antes[k - 1]))) break;
    aceitos.unshift(campo);
    // Só atravessa o hífen quando o campo aceito é o fim de um nome com hífen ("Etapa B", "2a
    // Seção", "B"); "Apto 307 - Tipo B - Tomba" para em "Tomba", e "Tipo B" continua unidade.
    if (!presoPorTraco || !campo.tokens.some((t) => ehValor(t) && !PARTICULAS.has(t))) break;
  }
  return aceitos.some(temPalavra) ? aceitos : [];
}

/** O campo que começa em `i` abre o complemento (número, unidade, "s/n")? Para fechar o logradouro no hífen ("Rua X - 411"). */
function abreCampo(tokens: readonly string[], i: number): boolean {
  return abreComplemento(tokens, i) || NUMERO_CASA.test(tokens[i] ?? "");
}

/**
 * Separa o endereço em partes comparáveis. Nunca lança; o que não aparece fica vazio. O
 * `contexto` (cidade, UF e bairro que a fonte informa em outros campos) serve para tirar esses
 * campos do texto ("..., Vila Industrial, Presidente Prudente/SP").
 */
export function analisarEndereco(endereco: string, contexto: ContextoEndereco = {}): EnderecoPartes {
  const tokens = palavras(endereco, contexto);
  // O logradouro vai até a primeira vírgula, o primeiro marcador de número, "sn", unidade com
  // valor ou fração. O hífen entre espaços só o fecha quando o campo seguinte já é número ou
  // complemento ("Rua X - 411"; "BR 101 - SUL" e "RUA X - RUA INTERNA 02" continuam).
  // "PB - 356" é a rodovia PB-356, não a "PB" número 356; "RUA PROJETADA - 03, N. 4671" é a
  // Projetada 03 (o número da casa vem adiante, com marcador).
  const numeroAdiante = (i: number): boolean =>
    tokens.some((t, j) => j > i && (t === "sn" || ehMarcadorDeNumero(tokens, j) || (tokens[j - 1] === VIRGULA && NUMERO_CASA.test(t))));
  const fechaNoTraco = (i: number): boolean =>
    abreCampo(tokens, i + 1) && !CODIGOS_RODOVIA.has(tokens[i - 1] ?? "") && !(i === 1 && TIPOS[tokens[0] ?? ""] !== undefined)
    && (abreComplemento(tokens, i + 1) || !numeroAdiante(i + 1));
  let corte = tokens.findIndex((t, i) => i > 0 && (t === VIRGULA || t === CIDADE || (t === TRACO && fechaNoTraco(i)) || abreComplemento(tokens, i)));
  if (corte < 0) corte = tokens.length;
  let regiao = tokens.slice(0, corte).filter((t) => t !== TRACO);
  let resto = tokens.slice(corte);

  // Começa por unidade ("LT 02 QD 01, N. 53D, RUA CROACIA"): é tudo complemento, e a rua, se
  // houver, vem depois de uma palavra de tipo.
  const unidadeInicial = UNIDADES[regiao[0] ?? ""];
  if (unidadeInicial && !ENDERECAMENTO.has(unidadeInicial) && valorDaUnidade(tokens, 1) !== null) {
    resto = tokens;
    regiao = [];
    const inicioRua = resto.findIndex((t, i) => TIPOS[t] !== undefined && !ehFronteira(resto[i + 1]) && resto[i + 1] !== undefined && !abreComplemento(resto, i + 1));
    if (inicioRua >= 0) {
      let fim = resto.findIndex((t, i) => i > inicioRua && (ehFronteira(t) || abreComplemento(resto, i)));
      if (fim < 0) fim = resto.length;
      regiao = resto.slice(inicioRua, fim);
      resto = [...resto.slice(0, inicioRua), VIRGULA, ...resto.slice(fim)];
    }
  }

  const tipo = TIPOS[regiao[0] ?? ""] ?? "";
  const nomeTokens = tipo ? regiao.slice(1) : [...regiao];
  // Tipo repetido por extenso: "R. RUA JONAS", "RUA RUA 12" (mas "R. R 14" é a rua R 14).
  while (tipo && (nomeTokens[0] ?? "").length >= 3 && TIPOS[nomeTokens[0] ?? ""] === tipo && nomeTokens.length > 1) nomeTokens.shift();

  // Número, nesta ordem: (1) marcador no primeiro campo do complemento ("N. 124", "nº 67",
  // "s/n"); (2) sem marcador ali, o campo logo depois do logradouro que começa por número ("Rua X,
  // 493, Vila Industrial"; "411 - Apto 162"; "100 apto 2"); (3) marcador mais adiante; (4) sem
  // marcador nenhum, um campo adiante que é só número ("Rua X, Apto 2, 100"); (5) o número no fim
  // do logradouro ("Av Paulista 1000"). Assim "Rua X, 482, Antiga Rua Y nº 65" fica com 482.
  let numero: string | null = null;
  const consumidos = new Set<number>();
  const campos = camposDe(resto);
  const consumir = (de: number, ate: number): void => {
    for (let j = de; j < ate; j++) consumidos.add(j);
  };
  // "Apto SN" é o apartamento sem número, não a casa sem número.
  const snDaCasa = (i: number): boolean => resto[i] === "sn" && UNIDADES[resto[i - 1] ?? ""] === undefined;
  const primeiro = campos[0];
  const depoisDoLogradouro = primeiro !== undefined && primeiro.inicio > 0 && ehFronteira(resto[primeiro.inicio - 1]);
  for (let i = primeiro?.inicio ?? 0; primeiro && i < primeiro.fim && numero === null; i++) {
    if (snDaCasa(i)) {
      numero = "sn";
      consumir(i, i + 1);
    } else if (ehMarcadorDeNumero(resto, i)) {
      const [valor, usados] = numeroAposMarcador(resto, i + 1);
      numero = valor;
      consumir(i, i + 1 + usados);
    }
  }
  if (numero === null && primeiro && depoisDoLogradouro && /^\d+[a-z0-9]*$/.test(resto[primeiro.inicio] ?? "")) {
    const i = primeiro.inicio;
    const [valor, usados] = numeroAposMarcador(resto, i);
    const depois = resto[i + usados];
    // Seguido de nada, de unidade com valor, de posição, de outro número ("185-3") ou de "e Rua
    // ..." ("18 e Rua Y"); "1º PAVIMENTO" (unidade sem valor) não é número.
    if (depois === undefined || ehFronteira(depois) || abreComplemento(resto, i + usados) || /^\d/.test(depois) || ehConjuncao(depois, resto[i + usados + 1])) {
      numero = valor;
      consumir(i, i + usados);
    }
  }
  const temMarcador = resto.some((_, i) => snDaCasa(i) || ehMarcadorDeNumero(resto, i));
  // "N. LT 20", "N. .": a fonte tem o campo do número logo depois do logradouro, mas sem número.
  const campoDeNumeroVazio = depoisDoLogradouro && MARCADORES_NUMERO.has(resto[primeiro.inicio] ?? "") && !ehMarcadorDeNumero(resto, primeiro.inicio);
  if (numero === null && !temMarcador && !campoDeNumeroVazio) {
    for (const campo of campos.slice(1)) {
      const i = campo.inicio;
      if (!NUMERO_CASA.test(resto[i] ?? "")) continue;
      const [valor, usados] = numeroAposMarcador(resto, i);
      if (i + usados < campo.fim) continue;
      numero = valor;
      consumir(i, i + usados);
      break;
    }
    if (numero === null) {
      // Número no fim do logradouro, se sobrar nome e não for rodovia ("BR 316") nem designação
      // sem tipo de rua ("QR 01", "SQN 210", do DF), com marcador ("RUA N-1") ou letra ("AVENIDA T 4").
      const ultimo = nomeTokens[nomeTokens.length - 1];
      const penultimo = nomeTokens[nomeTokens.length - 2];
      const designacao = (tipo === "" && nomeTokens.length === 2 && ((penultimo ?? "").length <= 4 || UNIDADES[penultimo ?? ""] !== undefined))
        || MARCADORES_NUMERO.has(penultimo ?? "") || (nomeTokens.length === 2 && /^[a-z]$/.test(penultimo ?? ""));
      if (ultimo !== undefined && NUMERO_CASA.test(ultimo) && nomeTokens.length >= 2 && !designacao && !(penultimo !== undefined && CODIGOS_RODOVIA.has(penultimo))) {
        numero = semZeros(ultimo);
        nomeTokens.pop();
      }
    }
  }

  // Bairro escrito no texto ("..., apto 21, Vila Prudente, São Paulo/SP"): o valor solto de
  // "Jardim América II" não é unidade, e o último campo assim é o bairro do texto.
  const deNome = new Set<number>();
  let bairro = "";
  for (const campo of campos) {
    if (campo.inicio === 0) continue; // continuação do campo do logradouro, ou unidades do começo
    if (campoDeBairro(campo.tokens)) for (let j = campo.inicio; j < campo.fim; j++) deNome.add(j);
    if (campoBairroDoTexto(campo.tokens)) bairro = normalizarBairro(campo.tokens.join(" "));
  }
  const antesDaCidade = bairroAntesDaCidade(resto, campos, Boolean(contexto.bairro?.trim()));
  if (antesDaCidade.length > 0) {
    for (const campo of antesDaCidade) for (let j = campo.inicio; j < campo.fim; j++) deNome.add(j);
    bairro = normalizarBairro(antesDaCidade.flatMap((c) => c.tokens).join(" "));
  }

  const unidades = new Set<string>();
  let fracao = false;
  for (let i = 0; i < resto.length; i++) {
    // Número já lido e campos de bairro ("Parque da Barragem Setor 11") não dão unidade.
    if (consumidos.has(i) || deNome.has(i)) continue;
    const t = resto[i] as string;
    const seguinte = resto[i + 1];
    if (ehFronteira(t)) continue;
    if (ehMarcadorDeNumero(resto, i)) {
      const [valor, usados] = numeroAposMarcador(resto, i + 1);
      numero ??= valor;
      i += usados;
    } else if (t === "sn") {
      if (snDaCasa(i)) numero ??= "sn";
    } else if (FRACAO.has(t)) {
      fracao = true;
    } else if (POSICOES.has(t)) {
      unidades.add(t);
    } else if (TIPOS[t] && seguinte !== undefined && !ehFronteira(seguinte) && !abreComplemento(resto, i + 1)) {
      // Rua citada no complemento ("QUADRA 10, ..., RUA 1", "nº 18 e Rua Monte Alegre nº 270"): não
      // distingue o imóvel; pula até o próximo complemento ou o fim do campo.
      while (i + 1 < resto.length && !ehFronteira(resto[i + 1]) && !abreComplemento(resto, i + 1)) i++;
    } else if (UNIDADES[t]) {
      const valor = valorDaUnidade(resto, i + 1);
      if (!valor) continue;
      unidades.add(`${UNIDADES[t]} ${valor[0]}`);
      i += valor[1];
      // "LT 19 E 20", "LTS 01 A 10", "LOTES 01 AO 20", "LTS 4 5 13": mais valores da mesma unidade.
      if (!/^\d/.test(valor[0])) continue;
      for (;;) {
        // "LT 02, 03 E 04", "LOTES 15, 16, 17": a lista de lotes continua depois da vírgula.
        const continuaNaVirgula = UNIDADES[t] === "lt" && (resto[i + 1] === VIRGULA || resto[i + 1] === TRACO) && listaDeLotes(resto, i + 2, t === "lts" || t === "lotes");
        const ligacao = CONJUNCOES.has(resto[i + 1] ?? "") || continuaNaVirgula ? 1 : 0;
        // Número solto só continua lista de lotes ("LTS 4 5 13"); "Apto 102, 1 PAV" não é o apto 1.
        if (ligacao === 0 && UNIDADES[t] !== "lt") break;
        if (!/^\d+[a-z]?$/.test(resto[i + 1 + ligacao] ?? "")) break;
        const outro = valorDaUnidade(resto, i + 1 + ligacao);
        if (!outro) break;
        unidades.add(`${UNIDADES[t]} ${outro[0]}`);
        i += ligacao + outro[1];
      }
    } else if (ehValor(t) && !PARTICULAS.has(t) && !MARCADORES_NUMERO.has(t)) {
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
  return { tipo, nome, numero, unidades: [...unidades].sort(), fracao, generico: nome === "" || NOMES_GENERICOS.test(nome), bairro };
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
 * partículas e com romanos em arábicos. "JD. AMÉRICA II" → "jardim america 2"; "BAIRRO COHAB" →
 * "cohab"; "SETOR D" → "setor d" (letra no fim é nome, não partícula).
 */
export function normalizarBairro(bairro: string | null | undefined): string {
  if (!bairro) return "";
  const tokens = normalizarTexto(bairro)
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== "");
  if (tokens[0] === "bairro" && tokens.length > 1) tokens.shift();
  const mapeados = tokens.map((t) => BAIRRO[t] ?? t);
  return mapeados
    .filter((t, i) => !ehParticula(t, mapeados[i + 1]))
    .map((t) => ROMANOS[t] ?? semZeros(t))
    .filter((t, i, todos) => !(t === todos[i - 1] && /^[a-z]{2,}$/.test(t))) // "CHACARAS DE INOA (INOA)"
    .join(" ");
}
