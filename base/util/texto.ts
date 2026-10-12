/**
 * Limpeza e normalização de texto: HTML, entidades, acentos, espaços, slugs e nomes próprios.
 */

const ENTIDADES: Readonly<Record<string, string>> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ordm: "º", ordf: "ª", deg: "°",
  sup2: "²", sup3: "³", middot: "·", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", euro: "€", sect: "§", rsaquo: "›",
  lsaquo: "‹", copy: "©", reg: "®", trade: "™", times: "×", divide: "÷", frac12: "½", frac14: "¼",
  frac34: "¾", aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É", iacute: "í", Iacute: "Í",
  oacute: "ó", Oacute: "Ó", uacute: "ú", Uacute: "Ú", agrave: "à", Agrave: "À", acirc: "â",
  Acirc: "Â", ecirc: "ê", Ecirc: "Ê", ocirc: "ô", Ocirc: "Ô", atilde: "ã", Atilde: "Ã",
  otilde: "õ", Otilde: "Õ", ccedil: "ç", Ccedil: "Ç", uuml: "ü", Uuml: "Ü",
};

/** Decodifica entidades HTML nomeadas comuns e numéricas (&#231; &#xE7;). */
export function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (inteiro, corpo: string) => {
    if (corpo[0] === "#") {
      const hex = corpo[1] === "x" || corpo[1] === "X";
      const codigo = Number.parseInt(corpo.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(codigo) || codigo <= 0 || codigo > 0x10ffff) return inteiro;
      return String.fromCodePoint(codigo);
    }
    return ENTIDADES[corpo] ?? inteiro;
  });
}

/**
 * Remove HTML e devolve texto legível: blocos viram quebra de linha, scripts, estilos e
 * comentários somem (inclusive o que estiver escondido em comentário), entidades são
 * decodificadas e espaços repetidos colapsados. Mantém maiúsculas e acentos.
 */
export function semHtml(texto: string): string {
  const semBlocosOcultos = texto
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const comQuebras = semBlocosOcultos
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|ul|ol|table|section|article)\s*>/gi, "\n")
    // Tags de formatação somem sem deixar espaço ("<b>NOME</b>," → "NOME,").
    .replace(/<\/?(b|i|u|em|strong|span|font|a|small|sup|sub|mark|abbr)\b[^>]*>/gi, "")
    .replace(/<[^>]*>/g, " ");
  return decodificarEntidades(comQuebras)
    .replace(/ /g, " ")
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ *\n[ \n]*/g, "\n")
    .trim();
}

/** Remove acentos e diacríticos ("São João" → "Sao Joao"). */
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
}

/** Colapsa espaços e quebras de linha num espaço só e corta as bordas. */
export function colapsarEspacos(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/**
 * Forma canônica para busca e regras: sem HTML, minúsculas, sem acento, espaços colapsados.
 * Ex.: "<b>Imóvel OCUPADO</b>&nbsp;" → "imovel ocupado".
 */
export function normalizarTexto(texto: string): string {
  return colapsarEspacos(semAcento(semHtml(texto)).toLowerCase());
}

/**
 * Minúsculas e sem acento, caractere a caractere, preservando o comprimento. Os índices de
 * uma busca no resultado valem no texto de entrada, o que permite recortar a evidência
 * original (com acentos) a partir de um regex rodado no texto normalizado.
 */
export function dobrarCaixaEAcento(texto: string): string {
  let saida = "";
  for (let i = 0; i < texto.length; i++) {
    const unidade = texto.charAt(i);
    const dobrada = unidade.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    saida += dobrada.length === 1 ? dobrada : unidade;
  }
  return saida;
}

/** Texto limpo ou `null` se vazio (ou só espaços). Aceita qualquer valor. */
export function textoOuNulo(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = colapsarEspacos(String(valor));
  return texto === "" ? null : texto;
}

/** Slug ASCII com hífens: "São José dos Campos" → "sao-jose-dos-campos". */
export function slug(texto: string): string {
  return semAcento(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "a", "o", "d'"]);
const SIGLAS = new Set(["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "BR", "SFI", "CEP"]);

/**
 * Capitaliza nomes de lugar escritos em caixa alta: "SÃO JOSÉ DOS CAMPOS" → "São José dos Campos".
 * Mantém siglas (UF, algarismos romanos) e deixa partículas em minúsculas, menos a primeira.
 */
export function capitalizarNome(texto: string): string {
  const palavras = colapsarEspacos(texto).split(" ");
  return palavras
    .map((palavra, i) => {
      if (palavra === "") return palavra;
      if (SIGLAS.has(palavra.toUpperCase()) && palavra === palavra.toUpperCase()) return palavra;
      const minuscula = palavra.toLocaleLowerCase("pt-BR");
      if (i > 0 && PARTICULAS.has(minuscula)) return minuscula;
      return minuscula.replace(/(^|[-'’(/])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase("pt-BR"));
    })
    .join(" ");
}

/** Corta em `maximo` caracteres, sem quebrar palavra quando der, e acrescenta "…". */
export function truncar(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto;
  const corte = texto.slice(0, Math.max(0, maximo - 1));
  const ultimoEspaco = corte.lastIndexOf(" ");
  const base = ultimoEspaco > maximo * 0.6 ? corte.slice(0, ultimoEspaco) : corte;
  return base.trimEnd() + "…";
}
