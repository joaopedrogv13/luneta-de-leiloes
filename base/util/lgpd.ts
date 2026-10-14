/**
 * Máscara de dados pessoais (LGPD) para textos que a base guarda: títulos, descrições,
 * resumos de edital e trechos de evidência das tags de risco.
 *
 * O que é mascarado:
 * - CPF, CNPJ, RG, e-mail e endereço IP → "[CPF]", "[CNPJ]", "[RG]", "[E-MAIL]", "[IP]";
 * - nomes de pessoas depois de papéis processuais e contratuais (executado, exequente,
 *   devedor, fiduciante, depositário, réu, autor, proprietário, cônjuge, "em face de",
 *   "Sr.", "Dra."...) e de frases de ocupação ("ocupado por", "na posse de", "locado para",
 *   "reside no imóvel", "moradora") → "[NOME]";
 * - nomes de licitante, arrematante, comprador e proponente, quando vêm depois de dois-pontos
 *   ("Arrematante: Fulano"); sem dois-pontos essas palavras são genéricas no edital;
 * - quem ganhou o leilão, mesmo sem dois-pontos, quando o nome tem duas palavras ou mais:
 *   "arrematado por", "adjudicado a", "adquirido por", "vencedor", "arrematante";
 * - partes no formato "FULANO DE TAL x BELTRANO" (título de processo).
 *
 * É heurística: prefere mascarar demais (um nome de empresa ou de rua perto de um papel)
 * a deixar passar um nome. Nunca confie nela para liberar um campo que a fonte rotula como
 * dado pessoal (ex.: nm_usuario): esses campos simplesmente não devem ser mapeados.
 * A função é idempotente: mascarar duas vezes dá o mesmo resultado.
 *
 * Posse (frases que as regras de risco recortam como evidência): nomes depois de papel e
 * vírgula ("a executada, Fulana de Tal"), de parentesco ("e sua irmã, Fulana"), de "Ocupação
 * Atual:", "moradia para", "ocupado pela", e antes de ", irmã do executado", ", ex-mutuário" ou
 * "e família ocupam o imóvel". `mascararNomesSoltos` é a máscara reforçada dos trechos de
 * posse: qualquer sequência de palavras com inicial maiúscula, sem depender de papel.
 */
import { semAcento, truncar } from "./texto.ts";

export const MASCARA = {
  nome: "[NOME]",
  cpf: "[CPF]",
  cnpj: "[CNPJ]",
  rg: "[RG]",
  email: "[E-MAIL]",
  ip: "[IP]",
} as const;

// ---------------------------------------------------------------------------
// Documentos, contatos e IP
// ---------------------------------------------------------------------------

const CPF_FORMATADO = /(?<![\d.])\d{3}\.\d{3}\.\d{3}\s?-\s?\d{2}(?!\d)/g;
const CNPJ_FORMATADO = /(?<!\d)\d{2}\.\d{3}\.\d{3}\s?\/\s?\d{4}\s?-\s?\d{2}(?!\d)/g;
/** Número depois do rótulo, mesmo com texto no meio: "CPF sob nº 12345678909". */
const CPF_ROTULADO = /(\bCPF(?:\/MF)?\b[^\d\n]{0,25}?)\d[\d.\s-]{9,13}\d(?!\d)/gi;
const CNPJ_ROTULADO = /(\bCNPJ(?:\/MF)?\b[^\d\n]{0,25}?)\d[\d.\s/-]{12,17}\d(?!\d)/gi;
const RG_ROTULADO = /(\b(?:RG|R\.G\.|C\.?I\.?|carteira de identidade)\b[^\d\n]{0,15}?)[\dXx][\d.\-\sXx/]{4,}[\dXx](?:\s*[-/]?\s*(?:SSP|SDS|DETRAN|IFP|PC)[\s/-]*[A-Z]{0,2}\b)?/gi;
/** 11 ou 14 dígitos soltos: só mascara se os dígitos verificadores baterem (CPF ou CNPJ válido). */
const DIGITOS_SOLTOS = /(?<![\d.,/-])(\d{14}|\d{11})(?![\d.,/-]?\d)/g;
const EMAIL = /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)+/gu;
const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.]|,\d)/g;

function digitoVerificador(digitos: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += Number(digitos.charAt(i)) * (pesos[i] ?? 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Confere os dígitos verificadores de um CPF (só dígitos). */
export function cpfValido(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return false;
  const d1 = digitoVerificador(digitos, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(digitos, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(digitos.charAt(9)) && d2 === Number(digitos.charAt(10));
}

/** Confere os dígitos verificadores de um CNPJ (só dígitos). */
export function cnpjValido(digitos: string): boolean {
  if (!/^\d{14}$/.test(digitos) || /^(\d)\1{13}$/.test(digitos)) return false;
  const d1 = digitoVerificador(digitos, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(digitos, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(digitos.charAt(12)) && d2 === Number(digitos.charAt(13));
}

/** Mascara CPF, CNPJ, RG, e-mail e IPv4. */
export function mascararDocumentos(texto: string): string {
  return texto
    .replace(EMAIL, MASCARA.email)
    .replace(CNPJ_FORMATADO, MASCARA.cnpj)
    .replace(CPF_FORMATADO, MASCARA.cpf)
    .replace(CNPJ_ROTULADO, (_, rotulo: string) => rotulo + MASCARA.cnpj)
    .replace(CPF_ROTULADO, (_, rotulo: string) => rotulo + MASCARA.cpf)
    .replace(RG_ROTULADO, (_, rotulo: string) => rotulo + MASCARA.rg)
    .replace(DIGITOS_SOLTOS, (digitos: string) =>
      digitos.length === 11 && cpfValido(digitos) ? MASCARA.cpf : digitos.length === 14 && cnpjValido(digitos) ? MASCARA.cnpj : digitos,
    )
    .replace(IPV4, (inteiro: string, ...octetos: string[]) =>
      octetos.slice(0, 4).every((o) => Number(o) <= 255) ? MASCARA.ip : inteiro,
    );
}

// ---------------------------------------------------------------------------
// Nomes
// ---------------------------------------------------------------------------

/** Papéis seguidos de nome, com ou sem dois-pontos. */
const PAPEIS = [
  "executad[oa]s?", "exequentes?", "devedor(?:a|es|as)?", "fiduciantes?", "deposit[áa]ri[oa]s?",
  "requerentes?", "requerid[oa]s?", "r[ée]us?", "r[ée]s", "autor(?:a|es|as)?", "credor(?:a|es|as)?",
  "copropriet[áa]ri[oa]s?", "propriet[áa]ri[oa]s?", "cond[ôo]min[oa]s?", "promitentes?(?:\\s+(?:comprador|vendedor)(?:a|es|as)?)?",
  "compromiss[áa]ri[oa]s?(?:\\s+comprador(?:a|es|as)?)?", "mutu[áa]ri[oa]s?", "inventariantes?",
  "herdeir[oa]s?", "c[ôo]njuges?", "meeir[oa]s?", "interessad[oa]s?", "avalistas?", "fiador(?:a|es|as)?",
  "s[óo]ci[oa]s?", "titular(?:es)?", "ocupantes?", "possuidor(?:a|es|as)?", "locat[áa]ri[oa]s?",
  "inquilin[oa]s?", "outorgantes?", "outorgad[oa]s?", "embargantes?", "embargad[oa]s?",
  "impugnantes?", "agravantes?", "agravad[oa]s?", "apelantes?", "apelad[oa]s?", "reclamantes?",
  "reclamad[oa]s?", "intimad[oa]s?", "citad[oa]s?",
  // Atos de matrícula (registro, averbação): quem recebe ou transmite direitos.
  "usufrutu[áa]ri[oa]s?", "nu-propriet[áa]ri[oa]s?", "adquirentes?", "transmitentes?", "doador(?:a|es|as)?",
  "donat[áa]ri[oa]s?", "cedentes?", "cession[áa]ri[oa]s?", "anuentes?",
  "em\\s+favor\\s+de", "a\\s+favor\\s+de", "em\\s+benef[íi]cio\\s+de",
  "em\\s+face\\s+de", "movid[oa]\\s+por", "propost[oa]\\s+por", "ajuizad[oa]\\s+por", "contra",
  "de\\s+propriedade\\s+de", "pertencente\\s+a", "em\\s+nome\\s+de", "titularidade\\s+d[aeo]s?",
  // Ocupação e posse (frases típicas de edital judicial, lidas pelas regras de Ocupado/Desocupado).
  "ocupad[oa]s?\\s+por", "na\\s+posse\\s+de", "em\\s+poder\\s+de", "locad[oa]s?\\s+(?:para|a|ao|[àá])",
  "resid(?:e|em)\\s+no\\s+im[óo]vel", "morador(?:a|es|as)?",
  // "Dr./Dra." ficam de fora como gatilho (aparecem em nome de rua: "Rua Dr. Arnaldo"); só
  // contam como prefixo depois de um papel ("Depositário: Dr. Fulano").
  "sr\\.?", "sra\\.?", "srs\\.?", "sras\\.?", "srta\\.?",
];

/** Papéis genéricos em edital: só mascaram quando vêm com dois-pontos ou travessão. */
const PAPEIS_COM_SEPARADOR = [
  "arrematantes?", "licitantes?", "compradore?s?", "compradoras?", "vendedore?s?", "vendedoras?",
  "proponentes?", "vencedor(?:a|es|as)?", "participantes?", "partes?", "advogad[oa]s?", "nome",
];

function regexPapeis(lista: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{M}])(?:${lista.join("|")})(?![\\p{L}\\p{M}])`, "giu");
}

/**
 * Quem ganhou o leilão, sem separador: "arrematado por FULANO", "adjudicado a BELTRANA",
 * "adquirido por", "sendo vencedor CICRANO", "ao arrematante FULANO". Como nos papéis
 * processuais, sem dois-pontos só mascara nome de duas palavras ou mais ("vencedor o licitante
 * que...", "arrematado pelo maior lance" e "o arrematante deverá" ficam como estão).
 */
const PAPEIS_RESULTADO = [
  "arrematad[oa]s?(?:\\s+em\\s+(?:leil[ãa]o|hasta\\s+p[úu]blica|pra[çc]a))?\\s+(?:por|pel[oa]s?)",
  "adjudicad[oa]s?\\s+(?:a|ao|aos|[àá]|[àá]s|em\\s+favor\\s+de|para|por|pel[oa]s?)",
  "adquirid[oa]s?\\s+(?:por|pel[oa]s?)",
  "vencedor(?:a|es|as)?", "arrematantes?", "adjudicat[áa]ri[oa]s?",
];

const RE_PAPEIS = regexPapeis(PAPEIS);
const RE_PAPEIS_SEPARADOR = regexPapeis(PAPEIS_COM_SEPARADOR);
const RE_PAPEIS_RESULTADO = regexPapeis(PAPEIS_RESULTADO);
/** Uma palavra que é ela mesma um papel ("EXECUTADOS") nunca conta como nome. */
const RE_PALAVRA_PAPEL = new RegExp(`^(?:${[...PAPEIS, ...PAPEIS_COM_SEPARADOR].join("|")})$`, "iu");

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "d'", "di", "del", "du", "van", "von", "y"]);

/** Palavras em maiúscula que não são nome (comuns em editais escritos em caixa alta). */
const NAO_NOMES = new Set(
  (
    "A O AS OS AO AOS E EM NO NA NOS NAS DE DA DO DAS DOS POR PELO PELA PELOS PELAS PARA COM SEM QUE SE " +
    "SUA SEU SUAS SEUS NAO SIM FICA FICAM FICARA FICARAO DEVE DEVEM DEVERA DEVERAO PODE PODEM PODERA PODERAO " +
    "SERA SERAO ESTA ESTAO ARCA ARCARA ARCARAO PAGA PAGARA RESPONSAVEL RESPONSAVEIS CONFORME TERMOS ART " +
    "ARTIGO LEI CPF CNPJ RG OAB PROCESSO AUTOS NUMERO OUTROS OUTRAS OUTRO OUTRA TODOS TODAS INTIMADO INTIMADA " +
    "INTIMADOS INTIMADAS INTIMACAO CITADO CITADA REPRESENTADO REPRESENTADA QUALIFICADO QUALIFICADA ACIMA " +
    "ABAIXO SUPRA INSCRITO INSCRITA PORTADOR PORTADORA BRASILEIRO BRASILEIRA BRASILEIROS CASADO CASADA " +
    "SOLTEIRO SOLTEIRA DIVORCIADO DIVORCIADA VIUVO VIUVA SEPARADO SEPARADA ACERCA SOBRE QUANTO COMO BEM BENS " +
    "IMOVEL IMOVEIS LOTE VALOR EDITAL LEILAO PRACA DATA NOME ATE APOS ANTES DURANTE MEDIANTE ATRAVES " +
    "CASO FIDUCIARIO FIDUCIARIA NOTIFICADO NOTIFICADA NOTIFICACAO CIENTE CIENTES VIA INFORMA INFORMADO " +
    "EVENTUAIS EVENTUAL TAMBEM AINDA JA HA " +
    // Valores de ocupação ("Ocupação: Desocupado", "Ocupação Atual: O próprio executado").
    "OCUPADO OCUPADA OCUPADOS OCUPADAS DESOCUPADO DESOCUPADA DESOCUPADOS DESOCUPADAS VAGO VAGA VAZIO VAZIA " +
    "LIVRE TERCEIRO TERCEIRA TERCEIROS TERCEIRAS INVASOR INVASORES INVADIDO INVADIDA LOCADO LOCADA ALUGADO " +
    "ALUGADA FAMILIA FAMILIARES PROPRIO PROPRIA PROPRIOS PROPRIAS DESCONHECIDO DESCONHECIDA DESCONHECIDOS " +
    "INFORMACAO INFORMACOES NENHUM NENHUMA OCUPACAO SITUACAO ATUAL ATUALMENTE RESIDENCIAL COMERCIAL CONSTA CONSTAM"
  ).split(" "),
);

const PALAVRA = /\p{L}[\p{L}\p{M}'’.-]*/uy;
const ESPACO_LINHA = /[ \t]+/y;
const VIRGULA = /[ \t]*,[ \t]*/y;
const SUFIXO_PLURAL = /(?:[ \t]*\((?:a|s|as|es|os|o|a\/s|s\/as)\))+/iuy;
const SEPARADOR = /[ \t]*[:–—=-][ \t]*\n?[ \t]*/uy;
const PREFIXOS = /(?:(?:o|a|os|as|de|da|do|das|dos|sr\.?|sra\.?|srs\.?|sras\.?|srta\.?|dr\.?|dra\.?|esp[óo]lio[ \t]+de|massa[ \t]+falida[ \t]+de)[ \t]+)*/iuy;
const LIGACAO = /(?:\.?[ \t]*[,;][ \t]*|[ \t]+(?:e|E)[ \t]+)/uy;
/** Sufixo de empresa colado ao nome ("FULANO DE TAL - ME", "XYZ LTDA."). */
const SUFIXO_EMPRESA = /[ \t]*(?:[-–][ \t]*)?(?:ME|EPP|EIRELI|MEI|LTDA\.?|S\/A|S\.A\.?)(?![\p{L}\d])/uy;
/**
 * Âncoras que vêm logo DEPOIS de um nome de pessoa: "FULANA DE TAL, CPF ...", "(RG ...)",
 * ", brasileira, casada". O nome antes delas é mascarado.
 */
const ANCORAS_APOS_NOME =
  /[ \t]*[,(–-]?[ \t]*(?:inscrit[oa]s?\s+no\s+|portador(?:a|es|as)?\s+d[oa]\s+)?(?:CPF|\[CPF\]|RG(?![\p{L}])|\[RG\]|brasileir[oa]s?|casad[oa]s?|solteir[oa]s?|divorciad[oa]s?|vi[úu]v[oa]s?|separad[oa]s?\s+judicialmente|nascid[oa]s?\s+em|filh[oa]\s+de)(?![\p{L}])/giu;
/**
 * Âncoras de posse depois do nome: parentesco depois de vírgula ("FULANA DE TAL, irmã do
 * executado"), "ex-mutuário" e verbo de ocupação ("Fulano de Tal e família ocupam o imóvel").
 */
const ANCORAS_POSSE =
  /[ \t]*,[ \t]*(?:irm[ãa](?:o|os|s)?|espos[oa]|marido|companheir[oa]|genitor(?:a)?|m[ãa]e|pai|sogr[oa]|genro|nora|cunhad[oa]|filh[oa]s?|net[oa]s?|sobrinh[oa]s?|ti[oa]s?|prim[oa]s?|enteado|enteada)[ \t]+d[oa]s?(?![\p{L}])|[ \t]*,[ \t]*ex-\p{L}+|[ \t]+(?:e[ \t]+(?:sua[ \t]+|seus?[ \t]+)?(?:fam[íi]lia|filh[oa]s|espos[oa]|marido|companheir[oa])[ \t]+)?(?:ocupa|ocupam|reside|residem|mora|moram|habita|habitam)[ \t]+(?:n?[oa][ \t]+)?(?:im[óo]vel|bem|local|casa|apartamento|unidade)(?![\p{L}])/giu;

/**
 * Mais frases de posse e de parentesco, com o nome logo depois: são as frases que as regras de
 * Ocupado/Desocupado recortam como evidência ("ocupado pela Fulana", "Ocupam o imóvel Fulano e
 * Beltrana", "servindo de moradia para Fulano", "e sua irmã, Fulana"). "Filho/neto/sobrinho"
 * ficam de fora como gatilho: também são sobrenome ("Antônio de Oliveira Filho").
 */
const GATILHOS_POSSE = [
  "ocupad[oa]s?\\s+pel[oa]s?", "ocupam?\\s+(?:o|a)\\s+(?:im[óo]vel|bem|unidade|apartamento|casa|local|resid[êe]ncia)",
  "resid(?:e|em)\\s+n[oa]\\s+(?:bem|unidade|apartamento|casa|local|resid[êe]ncia)",
  "moram?\\s+n[oa]\\s+(?:im[óo]vel|bem|unidade|apartamento|casa|local)", "habitad[oa]s?\\s+por", "utilizad[oa]s?\\s+por",
  "moradia\\s+(?:para|de|d[oa]s?)", "alugad[oa]s?\\s+(?:para|a|ao|[àá])", "cedid[oa]s?\\s+(?:para|a|ao|[àá])",
  "(?:de\\s+)?responsabilidade\\s+d[eoa]s?", "(?:movid|propost|ajuizad)[oa]s\\s+por",
  "irm[ãa](?:o|os|s)?", "espos[oa]s?", "marido", "companheir[oa]s?", "conviventes?", "genitor(?:a|es)?", "m[ãa]e",
  "pai", "sogr[oa]s?", "genro", "nora", "cunhad[oa]s?", "enteado", "enteada",
];
/** Rótulos de ocupação: o nome só conta depois de dois-pontos ("Ocupação Atual: Fulana"). */
const ROTULOS_POSSE = ["ocupa[çc][ãa]o(?:\\s+atual)?", "situa[çc][ãa]o\\s+(?:de|da)\\s+ocupa[çc][ãa]o"];
const RE_GATILHOS_POSSE = regexPapeis(GATILHOS_POSSE);
const RE_ROTULOS_POSSE = regexPapeis(ROTULOS_POSSE);
/** "Irmã", "Ocupação": palavra de gatilho nunca conta como nome. */
const RE_PALAVRA_POSSE = new RegExp(`^(?:${[...GATILHOS_POSSE, ...ROTULOS_POSSE].join("|")})$`, "iu");

type ClassePalavra = "nome" | "particula" | "outra";

function classificar(palavra: string): ClassePalavra {
  const semPonto = palavra.replace(/\.+$/, "");
  if (PARTICULAS.has(semPonto.toLowerCase())) return "particula";
  if (!/^\p{Lu}/u.test(semPonto)) return "outra";
  // "Ex-mutuário", "Ex-companheira": papel, não nome.
  if (/^ex-/iu.test(semPonto)) return "outra";
  if (semPonto.length < 2 && !palavra.endsWith(".")) return "outra";
  if (NAO_NOMES.has(semAcento(semPonto).toUpperCase())) return "outra";
  if (RE_PALAVRA_PAPEL.test(semPonto) || RE_PALAVRA_PAPEL.test(palavra)) return "outra";
  if (RE_PALAVRA_POSSE.test(semPonto)) return "outra";
  return "nome";
}

function casar(regex: RegExp, texto: string, pos: number): RegExpExecArray | null {
  regex.lastIndex = pos;
  return regex.exec(texto);
}

/** Fim do texto útil de uma palavra: tira o ponto final de frase ("Silva." → "Silva"). */
function fimDaPalavra(palavra: string, inicio: number): number {
  const semPonto = palavra.replace(/\.+$/, "");
  return inicio + (semPonto.length >= 2 ? semPonto.length : palavra.length);
}

interface Trecho {
  inicio: number;
  fim: number;
  palavras: number;
}

/** Sequência de palavras de nome a partir de `pos` ("João da Silva", "MARIA DE SOUZA"). */
function nomeAdiante(texto: string, pos: number): Trecho | null {
  let cursor = pos;
  let inicio = -1;
  let fim = -1;
  let palavras = 0;
  for (;;) {
    const achado = casar(PALAVRA, texto, cursor);
    if (!achado) break;
    const classe = classificar(achado[0]);
    if (classe === "outra") break;
    if (classe === "particula" && palavras === 0) break;
    const depois = achado.index + achado[0].length;
    if (classe === "nome") {
      if (inicio < 0) inicio = achado.index;
      fim = fimDaPalavra(achado[0], achado.index);
      palavras++;
      if (fim < depois) break;
    }
    const espaco = casar(ESPACO_LINHA, texto, depois);
    if (!espaco) break;
    cursor = depois + espaco[0].length;
  }
  return palavras > 0 ? { inicio, fim, palavras } : null;
}

/** Estende o fim do nome sobre um sufixo de empresa ("- ME", "LTDA."). */
function comSufixo(texto: string, trecho: Trecho): Trecho {
  const sufixo = casar(SUFIXO_EMPRESA, texto, trecho.fim);
  return sufixo ? { ...trecho, fim: trecho.fim + sufixo[0].length } : trecho;
}

/** Vários nomes ligados por vírgula, ponto e vírgula ou "e" ("JOSÉ SILVA - ME; MARIA SOUZA"). */
function nomesAdiante(texto: string, pos: number, minimo: number): Trecho | null {
  const primeiro = nomeAdiante(texto, pos);
  if (!primeiro || primeiro.palavras < minimo) return null;
  const total = comSufixo(texto, primeiro);
  for (;;) {
    const ligacao = casar(LIGACAO, texto, total.fim);
    if (!ligacao) break;
    const proximo = nomeAdiante(texto, total.fim + ligacao[0].length);
    if (!proximo || proximo.palavras < minimo) break;
    const estendido = comSufixo(texto, proximo);
    total.fim = estendido.fim;
    total.palavras += estendido.palavras;
  }
  return total;
}

/** Sequência de palavras de nome terminando em `fim` (para o lado esquerdo de "A x B"). */
function nomeAtras(texto: string, limite: number): Trecho | null {
  const fim = limite;
  let cursor = limite;
  let inicio = -1;
  let fimNome = -1;
  let palavras = 0;
  for (;;) {
    let fimPalavra = cursor;
    while (fimPalavra > 0 && /[ \t]/.test(texto.charAt(fimPalavra - 1))) fimPalavra--;
    if (fimPalavra === cursor && cursor !== fim) break;
    let comeco = fimPalavra;
    while (comeco > 0 && /[\p{L}\p{M}'’.-]/u.test(texto.charAt(comeco - 1))) comeco--;
    if (comeco === fimPalavra) break;
    const palavra = texto.slice(comeco, fimPalavra);
    if (!/^\p{L}/u.test(palavra)) break;
    // Palavra com ponto final fecha a frase anterior: o nome começa depois dela.
    if (cursor !== fim && /\p{L}{2}\.+$/u.test(palavra)) break;
    const classe = classificar(palavra);
    if (classe === "outra") break;
    if (classe === "nome") {
      if (fimNome < 0) fimNome = fimPalavra;
      inicio = comeco;
      palavras++;
    }
    cursor = comeco;
  }
  return palavras > 0 ? { inicio, fim: fimNome, palavras } : null;
}

const SEPARADOR_PARTES = /(?<=\p{L}[ \t]+)(?:x|X|vs\.?|VS\.?|versus|VERSUS)(?=[ \t]+\p{Lu})/gu;

/** Intervalos [inicio, fim) a mascarar como nome. */
function intervalosDeNome(texto: string): Array<[number, number]> {
  const intervalos: Array<[number, number]> = [];

  const aposPapel = (regex: RegExp, separadorObrigatorio: boolean): void => {
    regex.lastIndex = 0;
    for (const achado of texto.matchAll(regex)) {
      let pos = achado.index + achado[0].length;
      const plural = casar(SUFIXO_PLURAL, texto, pos);
      if (plural) pos += plural[0].length;
      const separador = casar(SEPARADOR, texto, pos);
      if (separador) pos += separador[0].length;
      else if (separadorObrigatorio) continue;
      else {
        // "a executada, Maria Silva Ramos": a vírgula também separa o papel do nome (com pelo
        // menos duas palavras de nome, como no espaço).
        const espaco = casar(VIRGULA, texto, pos) ?? casar(ESPACO_LINHA, texto, pos);
        if (!espaco) continue;
        pos += espaco[0].length;
      }
      const prefixos = casar(PREFIXOS, texto, pos);
      if (prefixos) pos += prefixos[0].length;
      const nomes = nomesAdiante(texto, pos, separador ? 1 : 2);
      if (nomes) intervalos.push([nomes.inicio, nomes.fim]);
    }
  };
  aposPapel(RE_PAPEIS, false);
  aposPapel(RE_PAPEIS_SEPARADOR, true);
  aposPapel(RE_PAPEIS_RESULTADO, false);

  // "FULANA DE TAL, CPF ..." / "BELTRANO, brasileiro, casado": o nome vem antes da âncora.
  for (const achado of texto.matchAll(ANCORAS_APOS_NOME)) {
    const nome = nomeAtras(texto, achado.index);
    if (nome && nome.palavras >= 2) intervalos.push([nome.inicio, nome.fim]);
  }

  for (const achado of texto.matchAll(SEPARADOR_PARTES)) {
    const esquerda = nomeAtras(texto, achado.index);
    let posDireita = achado.index + achado[0].length;
    const espaco = casar(ESPACO_LINHA, texto, posDireita);
    if (espaco) posDireita += espaco[0].length;
    const direita = nomeAdiante(texto, posDireita);
    if (esquerda && direita && esquerda.palavras >= 2 && direita.palavras >= 2) {
      intervalos.push([esquerda.inicio, esquerda.fim], [direita.inicio, direita.fim]);
    }
  }

  // Posse e parentesco: nome depois do gatilho ("ocupado pela Fulana", "Ocupação Atual: Fulana")
  // ou antes da âncora ("Fulana de Tal, irmã do executado", "Fulano e família ocupam o imóvel").
  aposPapel(RE_GATILHOS_POSSE, false);
  aposPapel(RE_ROTULOS_POSSE, true);
  for (const achado of texto.matchAll(ANCORAS_POSSE)) {
    // "... Ramos. Residem no imóvel": verbo no começo da frase não tem nome antes.
    if (/[.!?;:]$/.test(texto.slice(0, achado.index).trimEnd())) continue;
    const nome = nomeAtras(texto, achado.index);
    if (nome && nome.palavras >= 2) intervalos.push([nome.inicio, nome.fim]);
  }
  return intervalos;
}

function aplicarMascara(texto: string, intervalos: Array<[number, number]>, mascara: string): string {
  if (intervalos.length === 0) return texto;
  const ordenados = [...intervalos].sort((a, b) => a[0] - b[0]);
  let saida = "";
  let cursor = 0;
  for (const [inicio, fim] of ordenados) {
    if (fim <= cursor) continue;
    if (inicio >= cursor) {
      saida += texto.slice(cursor, inicio) + mascara;
    }
    cursor = Math.max(cursor, fim);
  }
  return saida + texto.slice(cursor);
}

/** Mascara nomes de pessoas em contexto de parte, papel ou tratamento. */
export function mascararNomes(texto: string): string {
  return aplicarMascara(texto, intervalosDeNome(texto), MASCARA.nome);
}

/** Mascara documentos, contatos, IP e nomes. Use em todo texto livre que vai para o banco. */
export function mascararDadosPessoais(texto: string): string {
  return mascararNomes(mascararDocumentos(texto));
}

/** Versão para trechos de evidência: mascara e corta em `maximo` caracteres (padrão 300). */
export function mascararTrecho(texto: string, maximo = 300): string {
  return truncar(mascararDadosPessoais(texto).replace(/\s+/g, " ").trim(), maximo);
}

/** `true` se o texto ainda tem algo com cara de CPF, CNPJ, e-mail ou IP (para testes e auditoria). */
export function temDocumentoPessoal(texto: string): boolean {
  return mascararDocumentos(texto) !== texto;
}

// ---------------------------------------------------------------------------
// Máscara reforçada (sem papel nem gatilho)
// ---------------------------------------------------------------------------

/**
 * Palavras com inicial maiúscula comuns em editais que não são nome de pessoa. Só a máscara
 * reforçada usa esta lista; nomes próprios de lugar (cidade, rua) ficam de fora de propósito:
 * mascarar um lugar a mais é melhor que deixar passar um nome.
 */
const PALAVRAS_COMUNS = new Set(
  (
    "RUA AVENIDA AV ALAMEDA TRAVESSA ESTRADA RODOVIA LARGO VILA JARDIM BAIRRO CENTRO PARQUE LOTEAMENTO " +
    "EDIFICIO ED CONDOMINIO CONJUNTO BLOCO TORRE QUADRA APARTAMENTO APTO CASA SALA LOJA TERRENO GALPAO " +
    "PREDIO UNIDADE MATRICULA CARTORIO REGISTRO REGISTROS OFICIAL OFICIALA JUSTICA JUIZ JUIZA JUIZO VARA " +
    "CIVEL CIVIL TRABALHO TRIBUNAL FORO COMARCA EXECUCAO CODIGO PROVIMENTO RESOLUCAO CONSOLIDACAO NORMAS " +
    "CORREGEDORIA DECRETO ESTADO MUNICIPIO PREFEITURA MUNICIPAL UNIAO FEDERAL ESTADUAL CAIXA ECONOMICA BANCO " +
    "RECEITA FAZENDA NACIONAL PUBLICA PUBLICO MINISTERIO LEILOEIRO LEILOEIRA HASTA CERTIDAO AUTO LAUDO " +
    "AVALIACAO DESCRICAO OBSERVACAO OBSERVACOES OBS ENDERECO LANCE MINIMO INICIAL JUDICIAL EXTRAJUDICIAL " +
    "UNIFICADO UNIFICADA PRIMEIRO SEGUNDO PRIMEIRA SEGUNDA CERTIFICOU CERTIFICA DR DRA SR SRA SRS SRTA"
  ).split(" "),
);

/** Tipos de logradouro: a sequência de nomes logo depois é nome de rua ("Rua Antonio Castelucci, 100"), não de pessoa. */
const LOGRADOUROS = new Set("RUA R AV AVENIDA ALAMEDA AL TRAVESSA TV TRAV ESTRADA ESTR RODOVIA ROD PRACA LARGO VIA VIELA BECO PASSAGEM LADEIRA".split(" "));
/** Títulos que aparecem entre o logradouro e o nome ("Rua Dr. Arnaldo", "Av. Pres. Vargas"): mantêm o logradouro valendo. */
const TITULOS_DE_RUA = new Set(
  "DR DRA PROF PROFA ENG ENGENHEIRO CEL CORONEL GAL GENERAL PE PADRE DOM SAO SANTA SANTO STA STO PRES PRESIDENTE GOV GOVERNADOR MAL MARECHAL ALM ALMIRANTE BRIG CAP CAPITAO TEN TENENTE SGT SARGENTO DEP DEPUTADO SEN SENADOR VER VEREADOR".split(
    " ",
  ),
);

function palavraDeNomeSolto(palavra: string): ClassePalavra {
  if (PARTICULAS.has(palavra.toLowerCase())) return "particula";
  // Inicial maiúscula e o resto com minúscula ("Maria", "D'Ávila"): caixa alta fica com os gatilhos.
  if (palavra.length < 2 || !/^\p{Lu}/u.test(palavra) || !/\p{Ll}/u.test(palavra)) return "outra";
  if (/^ex-/iu.test(palavra) || RE_PALAVRA_PAPEL.test(palavra) || RE_PALAVRA_POSSE.test(palavra)) return "outra";
  const chave = semAcento(palavra).toUpperCase();
  return NAO_NOMES.has(chave) || PALAVRAS_COMUNS.has(chave) ? "outra" : "nome";
}

/**
 * Máscara reforçada para trechos de evidência que falam de posse (onde moram os nomes de
 * ocupantes, executados e parentes): troca por [NOME] qualquer sequência de duas ou mais
 * palavras com inicial maiúscula ("José Carlos de Souza", "Maria Silva"), mesmo sem papel ou
 * gatilho antes. Palavras de edital ("Oficial de Justiça", "Leilão Judicial") ficam; nomes em
 * caixa alta dependem dos gatilhos de `mascararNomes`. Mascara demais (lugares, empresas) de
 * propósito. Idempotente.
 */
export function mascararNomesSoltos(texto: string): string {
  const intervalos: Array<[number, number]> = [];
  let inicio = -1;
  let fim = -1;
  let palavras = 0;
  let fimAnterior = -1;
  // depois de "Rua", "Av.", "Travessa"... (e de títulos como "Dr."), o nome que vem é de logradouro
  let aposLogradouro = false;
  let nomeDeRua = false;
  const fechar = (): void => {
    if (palavras >= 2 && !nomeDeRua) intervalos.push([inicio, fim]);
    inicio = -1;
    fim = -1;
    palavras = 0;
    nomeDeRua = false;
  };
  for (const achado of texto.matchAll(/\p{L}[\p{L}\p{M}'’-]*/gu)) {
    const comeco = achado.index;
    const entre = fimAnterior < 0 ? "" : texto.slice(fimAnterior, comeco);
    // Só espaço entre uma palavra e a seguinte: vírgula, ponto ou parêntese encerram o nome.
    if (fimAnterior < 0 || !/^[ \t]+$/.test(entre)) fechar();
    // vírgula, ponto e vírgula, parêntese ou quebra de linha encerram o logradouro ("Rua X, Maria Silva")
    if (/[,;()\n]/.test(entre)) aposLogradouro = false;
    fimAnterior = comeco + achado[0].length;
    const chave = semAcento(achado[0]).toUpperCase();
    const classe = palavraDeNomeSolto(achado[0]);
    if (classe === "nome") {
      if (inicio < 0) {
        inicio = comeco;
        nomeDeRua = aposLogradouro;
      }
      fim = fimAnterior;
      palavras++;
    } else if (classe === "outra" || palavras === 0) fechar();
    if (LOGRADOUROS.has(chave)) aposLogradouro = true;
    else if (classe === "nome" && nomeDeRua) aposLogradouro = true;
    else if (!TITULOS_DE_RUA.has(chave) && classe !== "particula") aposLogradouro = false;
  }
  fechar();
  return aplicarMascara(texto, intervalos, MASCARA.nome);
}
