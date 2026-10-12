/**
 * Extração de campos a partir do texto dos avisos (data do leilão, cidade/UF, número do
 * aviso), resumo com os trechos que importam e máscara dos nomes que a própria fonte rotula
 * como partes (destinatários do DJEN). Funções puras, sem rede.
 */
import type { Uf } from "../../tipos.ts";
import { instanteDe, lerDataHoraBR } from "../../util/data.ts";
import { MASCARA } from "../../util/lgpd.ts";
import { capitalizarNome, colapsarEspacos, dobrarCaixaEAcento, semAcento, truncar } from "../../util/texto.ts";
import { ehUf, normalizarUf } from "../../util/uf.ts";
import type { AnaliseLeilaoImovel } from "./filtro.ts";

// ---------------------------------------------------------------------------
// Data do leilão
// ---------------------------------------------------------------------------

/** Palavras depois das quais vem a data do leilão ("1º leilão: 10/11/2026 às 10h"). */
const GATILHO_DATA = /\b(?:leil(?:ao|oes)|pracas?|hasta|sessao\s+publica|abertura\s+d[aoe]s?\s+(?:sessao|lances|propostas|disputa)|realizar-se-a|sera\s+realizad[oa])\b/g;
const DATA_NUMERICA = /(?<![\d/.])(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?![\d/])/g;
const DATA_EXTENSO = /(?<!\d)(\d{1,2})(?:º|°|o)?\s+de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4}/g;
/** Quantos caracteres depois do gatilho a data pode estar. */
const ALCANCE_DATA = 160;

/**
 * Data do leilão citada no texto: a mais próxima a partir da publicação, entre as datas que
 * aparecem logo depois de "leilão", "praça", "hasta", "sessão pública"... Devolve
 * "AAAA-MM-DD" ou, se houver hora, ISO em UTC (horário de Brasília convertido). `null` se
 * não achar data confiável. Datas antes da publicação (ex.: a do despacho) são ignoradas.
 */
export function extrairDataLeilao(texto: string, publicadoEm?: string | null): string | null {
  const dobrado = dobrarCaixaEAcento(texto);
  const minimo = publicadoEm ? instanteDe(publicadoEm.slice(0, 10)) : null;
  // instanteDe de um dia vale 23:59 daquele dia; o leilão pode ser no mesmo dia da publicação.
  const piso = minimo === null ? null : minimo - 86_400_000;
  let melhor: { valor: string; instante: number } | null = null;
  GATILHO_DATA.lastIndex = 0;
  for (const gatilho of dobrado.matchAll(GATILHO_DATA)) {
    const inicioJanela = gatilho.index + gatilho[0].length;
    const janela = dobrado.slice(inicioJanela, inicioJanela + ALCANCE_DATA);
    const achados = [...janela.matchAll(DATA_NUMERICA), ...janela.matchAll(DATA_EXTENSO)];
    for (const achado of achados) {
      const posicao = inicioJanela + achado.index;
      // "20/11/2026, às 10h": o leitor do núcleo aceita um separador só entre data e hora.
      const valor = lerDataHoraBR(texto.slice(posicao, posicao + 45).replace(/,\s*(?=(?:às|as|a partir das)\s)/i, " "));
      if (!valor) continue;
      const instante = instanteDe(valor);
      if (instante === null || (piso !== null && instante <= piso)) continue;
      if (!melhor || instante < melhor.instante) melhor = { valor, instante };
    }
  }
  return melhor?.valor ?? null;
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
    "ZONA EM NA NO NOS NAS PARA POR COM SOB ART LEI MATRICULA CRI DOS DAS ENDERECO SEDE"
  ).split(" "),
);
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "d'"]);

/** Nome de cidade logo antes de `fim` (posição do "/UF"), andando para trás. */
function cidadeAntes(texto: string, fim: number): string | null {
  const antes = texto.slice(Math.max(0, fim - 80), fim);
  const palavras = antes.split(/\s+/).filter((p) => p !== "");
  const nome: string[] = [];
  for (let i = palavras.length - 1; i >= 0 && nome.length < 6; i--) {
    const palavra = palavras[i] ?? "";
    if (/[,;:()–—.]$/.test(palavra) && nome.length > 0) break;
    const limpa = palavra.replace(/^[,;:()–—"'“”-]+|[,;:()–—"'“”.-]+$/g, "");
    if (limpa === "" || /\d/.test(limpa)) break;
    const chave = semAcento(limpa).toUpperCase();
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
 * 3. "Estado de São Paulo" (só a UF).
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

  if (!uf) {
    ESTADO_DE.lastIndex = 0;
    for (const achado of dobrado.matchAll(ESTADO_DE)) {
      const nome = achado[1] ?? "";
      const palavras = nome.split(/\s+/);
      for (let n = palavras.length; n >= 1; n--) {
        const candidata = normalizarUf(palavras.slice(0, n).join(" "));
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
