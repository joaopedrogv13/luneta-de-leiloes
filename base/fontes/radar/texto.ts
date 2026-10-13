/**
 * Extração de campos a partir do texto dos avisos (data do leilão, cidade/UF, número do
 * aviso), resumo com os trechos que importam e máscara dos nomes que a própria fonte rotula
 * como partes (destinatários do DJEN). Funções puras, sem rede.
 */
import type { Uf } from "../../tipos.ts";
import { hojeBrasilia, instanteDe, lerDataHoraBR } from "../../util/data.ts";
import { MASCARA } from "../../util/lgpd.ts";
import { capitalizarNome, colapsarEspacos, dobrarCaixaEAcento, semAcento, truncar } from "../../util/texto.ts";
import { ehUf, normalizarUf } from "../../util/uf.ts";
import type { AnaliseLeilaoImovel } from "./filtro.ts";

// ---------------------------------------------------------------------------
// Data do leilão
// ---------------------------------------------------------------------------

/**
 * Gatilhos fortes: a data logo depois é a do leilão ("1º leilão: 10/11/2026", "praça única em",
 * "sessão pública", "abertura das propostas", "o leilão será realizado em").
 */
const GATILHO_FORTE = new RegExp(
  "\\b(?:(?:[123]\\s*(?:ª|º|°|a|o)?|primeir[oa]|segund[oa]|terceir[oa]|unic[oa])\\s+(?:leil(?:ao|oes)|pracas?|hastas?)" +
    "|(?:leil(?:ao|oes)|pracas?|hastas?)\\s+unic[oa]|sessao\\s+publica|sessao\\s+de\\s+(?:lances|disputa|leilao)" +
    "|abertura\\s+d[aoe]s?\\s+(?:sessao|lances|propostas|disputa|leilao)|inicio\\s+d[aoe]s?\\s+(?:disputa|lances|sessao|leilao)" +
    "|encerramento\\s+d[oa]s?\\s+(?:leilao|lances|disputa)|disputa\\s+de\\s+lances|data\\s+d[oae]s?\\s+(?:leilao|praca|hasta|sessao|disputa|abertura)" +
    "|realizar-se-(?:a|ao)|ser(?:a|ao)\\s+realizad[oa]s?" +
    "|(?:leil(?:ao|oes)|pracas?|hastas?)\\s+(?:(?:publico|judicial|eletronico|presencial|extrajudicial)\\s+)?(?:em|no\\s+dia|dia|marcad[oa]\\s+para|designad[oa]\\s+para|a\\s+realizar-se|sera|serao))\\b",
  "g",
);
/** Gatilho fraco: "leilão", "praça" ou "hasta" perto da data. */
const GATILHO_FRACO = /\b(?:leil(?:ao|oes)|pracas?|hastas?)\b/g;
/**
 * Contexto de data que não é a do leilão: disponibilidade do edital ("Edital: 09/10 das 8h"),
 * impugnação, esclarecimentos, entrega ou recebimento das propostas, cadastro, vistoria,
 * processo, publicação, despacho, lei, prazo, pagamento.
 */
const CONTEXTO_NEGATIVO =
  /\b(?:edital\s*:|edital\s+(?:disponivel|estara)|impugna\w*|esclarecimento\w*|(?:entrega|recebimento|envio|cadastramento)\s+d[aoe]s?\s+propostas?|cadastr\w*|credenciamento|habilitacao|vistoria\w*|visitac\w*|processo|autos|publicad[oa]s?|publicacao|despacho|decisao|sentenca|portaria|decreto|lei|resolucao|datad[oa]|assinad[oa]|expedid[oa]|lavrad[oa]|nascid[oa]|pagamento|vencimento|prazo)\b/g;
const DATA_NUMERICA = /(?<![\d/.])(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})(?![\d/])/g;
const DATA_EXTENSO = /(?<!\d)(\d{1,2})(?:º|°|o)?\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/g;
const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** Até quantos caracteres antes da data cada gatilho vale. */
const ALCANCE = { forte: 100, fraco: 160, negativo: 80 } as const;
/** "Vila Exemplo, 7 de outubro de 2026": data de assinatura, não do leilão. */
const LOCAL_E_DATA_ANTES = /\p{Lu}[\p{L}'’-]+(?:\s+(?:d[aeo]s?\s+)?\p{Lu}[\p{L}'’-]+)*\s*,\s*(?:em\s+)?$/u;

type Classe = "forte" | "fraco" | "negativo";

/** Gatilho mais próximo antes de `pos` (o mais perto vence; empate: negativo, forte, fraco). */
function classeDaData(dobrado: string, pos: number): Classe | null {
  let melhor: { fim: number; classe: Classe } | null = null;
  const peso: Record<Classe, number> = { negativo: 3, forte: 2, fraco: 1 };
  const trecho = dobrado.slice(Math.max(0, pos - ALCANCE.fraco), pos);
  const deslocamento = pos - trecho.length;
  for (const [classe, regex] of [["forte", GATILHO_FORTE], ["fraco", GATILHO_FRACO], ["negativo", CONTEXTO_NEGATIVO]] as const) {
    regex.lastIndex = 0;
    for (const m of trecho.matchAll(regex)) {
      const fim = deslocamento + m.index + m[0].length;
      if (pos - fim > ALCANCE[classe]) continue;
      if (!melhor || fim > melhor.fim || (fim === melhor.fim && peso[classe] > peso[melhor.classe])) melhor = { fim, classe };
    }
  }
  return melhor?.classe ?? null;
}

/** Lê a data (e a hora, se vier logo depois) na posição dada do texto original. */
function lerDataNaPosicao(texto: string, dobrado: string, pos: number): string | null {
  const extenso = new RegExp(DATA_EXTENSO.source, "y");
  extenso.lastIndex = pos;
  const m = extenso.exec(dobrado);
  if (!m) {
    // "20/11/2026, às 10h": o leitor do núcleo aceita um separador só entre data e hora.
    return lerDataHoraBR(texto.slice(pos, pos + 45).replace(/,\s*(?=(?:às|as|a partir das)\s)/i, " "));
  }
  const dia = Number(m[1]);
  const mes = MESES.indexOf(m[2] ?? "") + 1;
  const base = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${m[3]}`;
  const hora = /^\s*,?\s*(?:às|as|a partir das)\s*(\d{1,2})\s*(?:h|:|horas?)\s*(\d{2})?/i.exec(texto.slice(pos + m[0].length, pos + m[0].length + 30));
  return lerDataHoraBR(hora ? `${base} ${hora[1]}:${hora[2] ?? "00"}` : base);
}

/**
 * Data do leilão citada no texto. Cada data vale pelo gatilho mais próximo antes dela:
 * - forte ("1º leilão:", "praça única", "sessão pública", "abertura das propostas", "o leilão
 *   será realizado em") e fraco ("leilão", "praça", "hasta" a até 160 caracteres);
 * - negativo ("Edital:", "impugnações até", "entrega das propostas a partir de", "processo
 *   ... de", "publicado em", "despacho de"): a data é descartada.
 * Entre as datas de gatilho forte, fica a mais cedo; sem nenhuma, a mais cedo de gatilho fraco.
 * Datas antes da publicação (ou, sem publicação, antes de `agora`) são ignoradas, assim como
 * "Cidade, 7 de outubro de 2026" (assinatura). Aceita ano com 2 dígitos ("12/11/26"). Devolve
 * "AAAA-MM-DD" ou, com hora, ISO em UTC (horário de Brasília convertido); `null` sem data confiável.
 */
export function extrairDataLeilao(texto: string, publicadoEm?: string | null, agora?: Date): string | null {
  const dobrado = dobrarCaixaEAcento(texto);
  const referencia = publicadoEm ? publicadoEm.slice(0, 10) : agora ? hojeBrasilia(agora) : null;
  const minimo = referencia ? instanteDe(referencia) : null;
  // instanteDe de um dia vale 23:59 daquele dia; o leilão pode ser no mesmo dia da publicação.
  const piso = minimo === null ? null : minimo - 86_400_000;
  const melhores: Partial<Record<"forte" | "fraco", { valor: string; instante: number }>> = {};
  DATA_NUMERICA.lastIndex = 0;
  DATA_EXTENSO.lastIndex = 0;
  const posicoes = [...dobrado.matchAll(DATA_NUMERICA), ...dobrado.matchAll(DATA_EXTENSO)].map((m) => m.index);
  for (const pos of posicoes) {
    const classe = classeDaData(dobrado, pos);
    if (classe === null || classe === "negativo") continue;
    if (classe === "fraco" && LOCAL_E_DATA_ANTES.test(texto.slice(Math.max(0, pos - 60), pos))) continue;
    const valor = lerDataNaPosicao(texto, dobrado, pos);
    if (!valor) continue;
    const instante = instanteDe(valor);
    if (instante === null || (piso !== null && instante <= piso)) continue;
    const atual = melhores[classe];
    if (!atual || instante < atual.instante) melhores[classe] = { valor, instante };
  }
  return (melhores.forte ?? melhores.fraco)?.valor ?? null;
}

// ---------------------------------------------------------------------------
// Cidade e UF
// ---------------------------------------------------------------------------

export interface Local {
  uf: Uf | null;
  cidade: string | null;
}

/** Palavras que encerram a busca do nome da cidade para trás ("REGISTRO DE IMÓVEIS DE SÃO PAULO/SP"). */
const PARADAS = new Set(
  (
    "IMOVEIS IMOVEL REGISTRO CARTORIO OFICIO OFICIAL COMARCA MUNICIPIO CIDADE FORO VARA VT TRT TRF TJ JUIZO " +
    "LEILAO EDITAL PROC PROCESSO SITUADO SITUADA SITUADOS LOCALIZADO LOCALIZADA LOCALIZADOS RUA AVENIDA AV " +
    "BAIRRO DISTRITO SUBDISTRITO ESTADO CEP OAB CRECI JUCESP JUCERJA JUCEMG JUCEPAR SSP CPF CNPJ RG LOTE QUADRA " +
    "ZONA EM NA NO NOS NAS PARA POR COM SOB ART LEI MATRICULA CRI DOS DAS ENDERECO SEDE REGIAO ALAMEDA TRAVESSA " +
    "ESTRADA RODOVIA LARGO"
  ).split(" "),
);
/** Logradouro: o nome antes de "/UF" é rua, não cidade ("com sede na Av. Paulista/SP"). */
const LOGRADOUROS = new Set(["RUA", "R", "AV", "AVENIDA", "ALAMEDA", "AL", "TRAVESSA", "TV", "ESTRADA", "ROD", "RODOVIA", "PRACA", "LARGO", "VIA", "BECO", "VIELA"]);
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "d'"]);

/** Nome de cidade logo antes de `fim` (posição do "/UF"), andando para trás. */
function cidadeAntes(texto: string, fim: number): string | null {
  const antes = texto.slice(Math.max(0, fim - 80), fim);
  const palavras = antes.split(/\s+/).filter((p) => p !== "");
  const nome: string[] = [];
  for (let i = palavras.length - 1; i >= 0 && nome.length < 6; i--) {
    const palavra = palavras[i] ?? "";
    const limpa = palavra.replace(/^[,;:()–—"'“”-]+|[,;:()–—"'“”.-]+$/g, "");
    const chave = semAcento(limpa).toUpperCase();
    // Nome de rua ("Av. Paulista/SP", "Rua Bahia/SP"): não é cidade.
    if (nome.length > 0 && LOGRADOUROS.has(chave)) return null;
    if (/[,;:()–—.]$/.test(palavra) && nome.length > 0) break;
    if (limpa === "" || /\d/.test(limpa)) break;
    if (PARTICULAS.has(limpa.toLowerCase())) {
      nome.unshift(limpa);
      continue;
    }
    if (PARADAS.has(chave) || !/^\p{Lu}/u.test(limpa)) break;
    nome.unshift(limpa);
    if (/^[,;:(–—]/.test(palavra)) break;
  }
  while (nome.length > 0 && PARTICULAS.has((nome[0] ?? "").toLowerCase())) nome.shift();
  if (nome.length === 0) return null;
  const cidade = nome.join(" ");
  return cidade.length >= 3 ? capitalizarNome(cidade) : null;
}

const MUNICIPIO_DE = /\b(?:municipio|cidade|comarca|foro)\s+d[eo]\s+/g;
const CIDADE_BARRA_UF = /\s*[/-]\s*(\p{Lu}{2})(?![\p{L}\d])/gu;
const ESTADO_DE = /\bestado\s+d[aeo]\s+([a-z]+(?:\s+(?:d[aeo]s?\s+)?[a-z]+){0,3})/g;
const EM_ESTADO = /\b(?:em|no|na)\s+([a-z]+(?:\s+(?:d[aeo]s?\s+)?[a-z]+){0,3})/g;

/**
 * Nome que segue "Município de" até um separador ("Quedas do Iguaçu/PR", "Campinas, SP").
 * Um estado colado por hífen ("QUEDAS DO IGUAÇU-PARANÁ") vira a UF.
 */
function nomeAdiante(texto: string, inicio: number): { nome: string; fim: number; uf: Uf | null } | null {
  const trecho = texto.slice(inicio, inicio + 60);
  const m = /^((?:\p{Lu}[\p{L}'’-]*|d[aeo]s?)(?:\s+(?:\p{Lu}[\p{L}'’-]*|d[aeo]s?)){0,5})/u.exec(trecho);
  if (!m?.[1]) return null;
  const palavras = m[1].split(/\s+/);
  while (palavras.length > 0 && PARTICULAS.has((palavras[palavras.length - 1] ?? "").toLowerCase())) palavras.pop();
  let nome = palavras.join(" ");
  if (nome.length < 3 || PARADAS.has(semAcento(palavras[0] ?? "").toUpperCase())) return null;
  const fim = inicio + nome.length;
  let uf: Uf | null = null;
  const hifen = nome.lastIndexOf("-");
  if (hifen > 0) {
    const estado = normalizarUf(nome.slice(hifen + 1));
    if (estado) {
      uf = estado;
      nome = nome.slice(0, hifen);
    }
  }
  return { nome: capitalizarNome(nome), fim, uf };
}

/**
 * Cidade e UF citadas no texto, por ordem de confiança:
 * 1. "Município/Comarca/Cidade de X" (seguido ou não de "/UF");
 * 2. "X/UF" ou "X - UF" (ex.: "São Caetano do Sul/SP");
 * 3. "Estado de São Paulo", "em Minas Gerais", "no Distrito Federal" (só a UF).
 * `ufsPermitidas` restringe a UF (ex.: as UFs da região de um TRT).
 */
export function extrairLocal(texto: string, ufsPermitidas?: readonly Uf[]): Local {
  const permitida = (uf: Uf | null): boolean => uf !== null && (!ufsPermitidas || ufsPermitidas.includes(uf));
  const dobrado = dobrarCaixaEAcento(texto);
  let cidade: string | null = null;
  let uf: Uf | null = null;

  MUNICIPIO_DE.lastIndex = 0;
  for (const achado of dobrado.matchAll(MUNICIPIO_DE)) {
    const nome = nomeAdiante(texto, achado.index + achado[0].length);
    if (!nome) continue;
    const depois = /^\s*(?:[/-]|,|\(|–)\s*(\p{Lu}{2})(?![\p{L}\d])/u.exec(texto.slice(nome.fim, nome.fim + 8));
    const ufDepois = nome.uf ?? (depois?.[1] && ehUf(depois[1]) ? depois[1] : null);
    if (ufDepois && !permitida(ufDepois)) continue;
    cidade = nome.nome;
    uf = ufDepois;
    break;
  }

  if (!uf) {
    CIDADE_BARRA_UF.lastIndex = 0;
    for (const achado of texto.matchAll(CIDADE_BARRA_UF)) {
      const sigla = achado[1] ?? "";
      if (!ehUf(sigla) || !permitida(sigla)) continue;
      const nome = cidadeAntes(texto, achado.index);
      if (!nome) continue;
      if (cidade && semAcento(cidade).toLowerCase() !== semAcento(nome).toLowerCase()) continue;
      cidade = nome;
      uf = sigla;
      break;
    }
  }

  // "Estado de São Paulo"; depois "em Minas Gerais", "no Distrito Federal" (nome inteiro do
  // estado; "para" sozinho é preposição, não Pará).
  for (const regex of [ESTADO_DE, EM_ESTADO]) {
    if (uf) break;
    regex.lastIndex = 0;
    for (const achado of dobrado.matchAll(regex)) {
      const palavras = (achado[1] ?? "").split(/\s+/);
      for (let n = palavras.length; n >= 1; n--) {
        const nome = palavras.slice(0, n).join(" ");
        const candidata = regex === EM_ESTADO && nome === "para" ? null : normalizarUf(nome);
        if (candidata && permitida(candidata)) {
          uf = candidata;
          break;
        }
      }
      if (uf) break;
    }
  }
  return { uf, cidade };
}

// ---------------------------------------------------------------------------
// Número do aviso e resumo
// ---------------------------------------------------------------------------

/** "Edital de Leilão nº 003/2026" → "nº 003/2026"; `null` se não houver número. */
export function numeroDoAviso(texto: string): string | null {
  const dobrado = dobrarCaixaEAcento(texto.slice(0, 3000));
  const m = /\b(?:edital|aviso)\s+(?:de\s+)?(?:licitacao\s+)?(?:\w+\s+){0,3}?(?:leilao|hasta\s+publica|praca)(?:\s+(?:publico|eletronico|presencial|judicial|extrajudicial|online|on-line))*\s*(?:n[º°o]?\.?|numero)\s*(\d{1,6}(?:[./-]\d{2,4})?)/.exec(dobrado);
  return m?.[1] ? `nº ${m[1]}` : null;
}

/**
 * Resumo do aviso com o começo do texto e os trechos em volta do primeiro sinal de leilão e
 * do primeiro sinal de imóvel. O núcleo ainda mascara dados pessoais e corta em 2.000.
 */
export function resumoRelevante(analise: AnaliseLeilaoImovel, maximo = 1800): string {
  const texto = analise.texto;
  const marcos = [analise.leilao[0], analise.imovelForte[0] ?? analise.imovelFraco[0]].filter((s) => s !== undefined);
  const janelas: Array<[number, number]> = [[0, Math.min(texto.length, 300)]];
  for (const marco of marcos) janelas.push([Math.max(0, marco.inicio - 250), Math.min(texto.length, marco.inicio + 650)]);
  janelas.sort((a, b) => a[0] - b[0]);
  const unidas: Array<[number, number]> = [];
  for (const janela of janelas) {
    const ultima = unidas[unidas.length - 1];
    if (ultima && janela[0] <= ultima[1] + 40) ultima[1] = Math.max(ultima[1], janela[1]);
    else unidas.push([janela[0], janela[1]]);
  }
  const partes = unidas.map(([a, b]) => colapsarEspacos(texto.slice(a, b)));
  const resumo = partes.join(" … ") + (unidas[unidas.length - 1]?.[1] === texto.length ? "" : " …");
  return truncar(resumo, maximo);
}

// ---------------------------------------------------------------------------
// Nomes que a fonte rotula como partes
// ---------------------------------------------------------------------------

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Troca por "[NOME]" toda ocorrência dos nomes dados (ex.: `destinatarios[].nome` do DJEN),
 * sem diferenciar maiúsculas e acentos. Ignora nomes de uma palavra só (evita mascarar
 * "BANCO" ou "UNIÃO" no texto inteiro) e números soltos antes do nome ("50.229.022 FULANO").
 */
export function mascararNomesConhecidos(texto: string, nomes: Iterable<string>): string {
  const dobrado = dobrarCaixaEAcento(texto);
  const intervalos: Array<[number, number]> = [];
  for (const bruto of nomes) {
    const nome = colapsarEspacos(bruto).replace(/^[\d./-]+\s+/, "");
    const palavras = nome.split(" ").filter((p) => p !== "");
    if (palavras.length < 2 || nome.length < 6) continue;
    const padrao = palavras.map((p) => escaparRegex(dobrarCaixaEAcento(p))).join("\\s+");
    const regex = new RegExp(`(?<![\\p{L}\\d])${padrao}(?![\\p{L}\\d])`, "gu");
    for (const achado of dobrado.matchAll(regex)) intervalos.push([achado.index, achado.index + achado[0].length]);
  }
  if (intervalos.length === 0) return texto;
  intervalos.sort((a, b) => a[0] - b[0]);
  let saida = "";
  let cursor = 0;
  for (const [inicio, fim] of intervalos) {
    if (fim <= cursor) continue;
    if (inicio >= cursor) saida += texto.slice(cursor, inicio) + MASCARA.nome;
    cursor = Math.max(cursor, fim);
  }
  return saida + texto.slice(cursor);
}
