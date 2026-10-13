/**
 * Radar: DJEN / Comunica PJe (CNJ), editais de leilão judicial publicados na Plataforma
 * Nacional de Editais (meio=E).
 *
 * Fonte: API pública documentada (https://comunicaapi.pje.jus.br/swagger/index.html), sem login:
 *   GET https://comunicaapi.pje.jus.br/api/v1/comunicacao?meio=E&siglaTribunal=TJSP
 *       &dataDisponibilizacaoInicio=AAAA-MM-DD&dataDisponibilizacaoFim=AAAA-MM-DD
 *       &texto=leilão&pagina=1&itensPorPagina=100
 *   → {status: "success", message, count, items: [{id, data_disponibilizacao, siglaTribunal,
 *      tipoComunicacao, nomeOrgao, texto, numero_processo, meio, link, tipoDocumento, nomeClasse,
 *      ativo, status, motivo_cancelamento, data_cancelamento, numeroprocessocommascara,
 *      destinatarios[{polo, nome}], destinatarioadvogados[{advogado{nome, numero_oab}}]}]}
 * Parâmetros e limites: vbarcelosbt/API_DJEN (config.py e classe_tratar_pages/pesquisar.py:
 * itensPorPagina só 5 ou 100, teto de 10.000 resultados por consulta, limite por IP com
 * cabeçalho x-ratelimit-remaining e pedido de esperar 1 minuto depois de um 429, erro 500 para
 * data mal formatada). O filtro por texto livre (`texto`) vem do juscraper 0.4.0 (MIT,
 * aggregators/comunica_cnj). Versões antigas da API devolviam `itens` em vez de `items`.
 *
 * LGPD: o DJEN traz nomes de partes e advogados em campos próprios (`destinatarios`,
 * `destinatarioadvogados`) e no texto. Esses campos NUNCA são gravados: servem só para mascarar
 * os mesmos nomes dentro do texto antes do filtro e do resumo. Depois disso o texto ainda passa
 * pela máscara do núcleo (CPF, CNPJ, RG, e-mail, nomes após "executado", "exequente"...).
 *
 * Variáveis de ambiente: LUNETA_DJEN_TRIBUNAIS (siglas separadas por vírgula; vazio = todos),
 * LUNETA_DJEN_TERMOS (padrão "leilão, hasta pública") e a janela de config.ts. Com --uf, consulta
 * o TJ, os TRTs e o TRF daquela UF e descarta o que o texto ou o órgão põe em outra UF (o TRF1
 * cobre 13 UFs). Intimação da arrematação, homologação e "arrematado por Fulano" são
 * descartados (não anunciam leilão e trazem o nome de quem arrematou).
 *
 * Sem teste ao vivo (rede bloqueada). A fixture tem a estrutura real das amostras arquivadas
 * (scratchpad/djen/samples, respostas de 30/04/2026), com textos e nomes fictícios.
 * Não confirmado: se a busca `texto` ignora acento e se todo edital de leilão passa pela
 * Plataforma de Editais (meio=E).
 */
import type { Conector, EditalNormalizado, OpcoesColeta, Uf } from "../../../tipos.ts";
import { lerDataBR } from "../../../util/data.ts";
import { mascararDadosPessoais } from "../../../util/lgpd.ts";
import { capitalizarNome, colapsarEspacos, semAcento, semHtml } from "../../../util/texto.ts";
import { ehUf } from "../../../util/uf.ts";
import { comNovaTentativa, ehObjeto, esperarPadrao, exigirObjeto, lerJsonLocal, montarUrl, obterJson, texto, urlOuNulo, type Esperar } from "../comum.ts";
import { diasDaJanela, janelaDoAmbiente, listaDoAmbiente, robotsLigado, termosDoAmbiente, type Ambiente, type Janela } from "../config.ts";
import { analisarLeilaoImovel, motivoSemLeilaoFuturo } from "../filtro.ts";
import { extrairDataLeilao, extrairLocal, mascararNomesConhecidos, resumoRelevante, type Local } from "../texto.ts";

export const URL_DJEN = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
/** A API só aceita 5 ou 100 itens por página. */
const ITENS_POR_PAGINA = 100;
/** Teto de resultados por consulta. */
const TETO_DJEN = 10_000;
export const TERMOS_PADRAO_DJEN = ["leilão", "hasta pública"] as const;

// ---------------------------------------------------------------------------
// Tribunais e UFs
// ---------------------------------------------------------------------------

const TRT_UFS: Readonly<Record<string, readonly Uf[]>> = {
  TRT1: ["RJ"], TRT2: ["SP"], TRT3: ["MG"], TRT4: ["RS"], TRT5: ["BA"], TRT6: ["PE"], TRT7: ["CE"], TRT8: ["PA", "AP"],
  TRT9: ["PR"], TRT10: ["DF", "TO"], TRT11: ["AM", "RR"], TRT12: ["SC"], TRT13: ["PB"], TRT14: ["RO", "AC"], TRT15: ["SP"],
  TRT16: ["MA"], TRT17: ["ES"], TRT18: ["GO"], TRT19: ["AL"], TRT20: ["SE"], TRT21: ["RN"], TRT22: ["PI"], TRT23: ["MT"],
  TRT24: ["MS"],
};
const TRF_UFS: Readonly<Record<string, readonly Uf[]>> = {
  TRF1: ["AC", "AM", "AP", "BA", "DF", "GO", "MA", "MT", "PA", "PI", "RO", "RR", "TO"],
  TRF2: ["RJ", "ES"], TRF3: ["SP", "MS"], TRF4: ["RS", "SC", "PR"], TRF5: ["PE", "AL", "CE", "PB", "RN", "SE"], TRF6: ["MG"],
};

/** UFs da jurisdição de um tribunal ("TJSP" → [SP], "TRT8" → [PA, AP]); `null` se desconhecido. */
export function ufsDoTribunal(sigla: string | null | undefined): readonly Uf[] | null {
  if (!sigla) return null;
  const s = sigla.toUpperCase().replace(/\s+/g, "");
  if (s === "TJDFT") return ["DF"];
  const tj = /^TJ([A-Z]{2})$/.exec(s);
  if (tj?.[1] && ehUf(tj[1])) return [tj[1]];
  return TRT_UFS[s] ?? TRF_UFS[s] ?? null;
}

/** Tribunais com jurisdição numa UF: TJ, TRT(s) e TRF. */
export function tribunaisDaUf(uf: Uf): string[] {
  const lista = [uf === "DF" ? "TJDFT" : `TJ${uf}`];
  for (const [sigla, ufs] of Object.entries(TRT_UFS)) if (ufs.includes(uf)) lista.push(sigla);
  for (const [sigla, ufs] of Object.entries(TRF_UFS)) if (ufs.includes(uf)) lista.push(sigla);
  return lista;
}

const PARADAS_ORGAO = new Set(
  (
    "VARA VARAS CIVEL CIVEIS CRIMINAL CRIMINAIS TRABALHO JUIZADO JUIZADOS ESPECIAL ESPECIAIS FAZENDA PUBLICA PUBLICAS " +
    "FAMILIA SUCESSOES EXECUCOES EXECUCAO FISCAIS FISCAL REGISTROS PUBLICOS FALENCIAS RECUPERACAO RECUPERACOES JUDICIAL " +
    "JUDICIAIS INFANCIA JUVENTUDE ORFAOS ACIDENTES PRECATORIAS FEDERAL FEDERAIS REGIONAL COMARCA FORO FORUM TURMA TURMAS " +
    "CEJUSC GRAU NUCLEO CENTRAL UNICA UNIDADE SECRETARIA GABINETE CAMARA CAMARAS TRIBUNAL SECAO SUBSECAO DISTRITAL CAPITAL " +
    "MUNICIPAIS MUNICIPAL ESTADUAIS ESTADUAL AMBIENTAL ADJUNTO ADJUNTA EMPRESARIAL EMPRESARIAIS UNIFICADA UNIFICADAS " +
    "HASTA HASTAS RECURSAL RECURSAIS AUXILIAR CONCILIACAO MEDIACAO COMERCIAL TRIBUTARIA PREVIDENCIARIA AGRARIA BANCARIA " +
    "MILITAR ELEITORAL REGIAO CIRCUNSCRICAO JUDICIARIA PLANTAO DIGITAL VIRTUAL ESPECIALIZADA ESPECIALIZADO PRIVATIVA " +
    "CONSUMO CONSUMIDOR VIOLENCIA DOMESTICA MULHER IDOSO SAUDE INQUERITOS CARTAS ACERVO"
  ).split(" "),
);
const PARTICULAS = new Set(["de", "da", "do", "das", "dos"]);
/** Siglas do Judiciário que não são cidade ("SJMA", "SSJ", "TJMG", "TRT15", "CON2", "JEF"). */
const SIGLA_JUDICIARIA = /^(?:S?SJ[A-Z]{0,3}|TJ[A-Z]{0,4}|TRT\d*|TRF\d*|TRE[A-Z]{0,2}|JEF|JF|JECC?|JECRIM|CEJUSC\S*|CEJUS|NUPEMEC|CON\d*|VT|VF|STJ|STF|TST|TSE)$/;
/** Nome de pessoa no órgão ("Gabinete do Des. Fulano"): nada ali é cidade. */
const PESSOA_NO_ORGAO = /(?:^|\s)(?:gabinete|des\.?|desembargador[a]?|dr\.?|dra\.?|ju[íi]z[a]?|ministr[oa]|relator[a]?|conselheir[oa])(?=\s|$)/i;

/** Confere um nome candidato a cidade: sem número, sigla, UF ou palavra de órgão. */
function cidadeCandidata(nome: string): string | null {
  const palavras = nome.split(/\s+/).filter((p) => p !== "");
  if (palavras.length === 0) return null;
  for (const palavra of palavras) {
    if (PARTICULAS.has(palavra.toLowerCase())) continue;
    const chave = semAcento(palavra).toUpperCase().replace(/[.'’]/g, "");
    if (/\d/.test(palavra) || !/^\p{Lu}/u.test(palavra) || ehUf(palavra) || SIGLA_JUDICIARIA.test(palavra) || PARADAS_ORGAO.has(chave)) return null;
  }
  const cidade = palavras.join(" ");
  return cidade.length >= 3 ? capitalizarNome(cidade) : null;
}

/**
 * Cidade a partir do nome do órgão, só nos formatos conhecidos:
 * - "Vara Cível de Quedas do Iguaçu", "1ª Vara do Trabalho de Palmas - TO" (cidade depois de
 *   "de/da/do", no fim do nome);
 * - "Cacoal - 3ª Vara Cível", "Ji-Paraná - 3ª Vara Cível" (cidade antes de " - nª Vara");
 * - "CON2 - Jundiaí" (cidade depois de " - ", no fim).
 * Recusa siglas ("SJMA", "TJMG"), UF solta ("7ª Vara Federal RN" dá só a UF), adjetivos
 * ("Fiscais Municipais", "Cível e Ambiental", "Empresarial") e nome de pessoa ("Gabinete do Des.").
 */
export function cidadeDoOrgao(nomeOrgao: string | null): { cidade: string | null; uf: Uf | null } {
  if (!nomeOrgao) return { cidade: null, uf: null };
  let nome = colapsarEspacos(nomeOrgao);
  let uf: Uf | null = null;
  const sufixo = /(?:\s*[-–]\s*|\s+)(\p{Lu}{2})$/u.exec(nome);
  if (sufixo?.[1] && ehUf(sufixo[1])) {
    uf = sufixo[1];
    nome = nome.slice(0, sufixo.index);
  }
  const prefixo = /^(\p{L}[\p{L}'’.]*(?:[- ]\p{L}[\p{L}'’.]*)*)\s+[-–]\s+\d/u.exec(nome);
  const doPrefixo = prefixo?.[1] ? cidadeCandidata(prefixo[1]) : null;
  if (doPrefixo) return { cidade: doPrefixo, uf };
  const final = /\s+[-–]\s+(\p{Lu}[\p{L}'’]*(?:\s+(?:d[aeo]s?\s+)?\p{Lu}[\p{L}'’]*)*)$/u.exec(nome);
  const doFinal = final?.[1] ? cidadeCandidata(final[1]) : null;
  if (doFinal) return { cidade: doFinal, uf };
  if (PESSOA_NO_ORGAO.test(nome)) return { cidade: null, uf };

  const palavras = nome.split(/\s+/);
  const coletadas: string[] = [];
  for (let i = palavras.length - 1; i >= 0; i--) {
    const palavra = palavras[i] ?? "";
    if (PARTICULAS.has(palavra.toLowerCase())) {
      coletadas.unshift(palavra);
      continue;
    }
    const chave = semAcento(palavra).toUpperCase();
    if (/\d/.test(palavra) || !/^\p{Lu}/u.test(palavra) || PARADAS_ORGAO.has(chave) || SIGLA_JUDICIARIA.test(palavra)) break;
    coletadas.unshift(palavra);
  }
  // A cidade precisa vir depois de "de/da/do" ("Vara Cível de X"); sem isso é adjetivo do órgão.
  let depoisDeParticula = false;
  while (coletadas.length > 0 && PARTICULAS.has((coletadas[0] ?? "").toLowerCase())) {
    coletadas.shift();
    depoisDeParticula = true;
  }
  if (!depoisDeParticula || coletadas.length === 0) return { cidade: null, uf };
  // "Feira de Santana-BA": a UF colada por hífen vira a UF.
  const ultima = coletadas[coletadas.length - 1] ?? "";
  const colada = /^(.+?)[-–](\p{Lu}{2})$/u.exec(ultima);
  if (colada?.[1] && colada[2] && ehUf(colada[2])) {
    coletadas[coletadas.length - 1] = colada[1];
    uf = uf ?? colada[2];
  }
  return { cidade: cidadeCandidata(coletadas.join(" ")), uf };
}

// ---------------------------------------------------------------------------
// Tipos brutos
// ---------------------------------------------------------------------------

export interface ComunicacaoDjen {
  id?: number | string;
  data_disponibilizacao?: string;
  datadisponibilizacao?: string;
  siglaTribunal?: string;
  tipoComunicacao?: string;
  nomeOrgao?: string;
  texto?: string;
  numero_processo?: string;
  numeroprocessocommascara?: string;
  meio?: string;
  link?: string;
  tipoDocumento?: string;
  nomeClasse?: string;
  ativo?: boolean;
  status?: string;
  motivo_cancelamento?: string | null;
  data_cancelamento?: string | null;
  /** Partes: só para mascarar o texto. Nunca gravar. */
  destinatarios?: Array<{ nome?: string; polo?: string }>;
  /** Advogados: só para mascarar o texto. Nunca gravar. */
  destinatarioadvogados?: Array<{ advogado?: { nome?: string } }>;
}

interface RespostaDjen {
  status?: string;
  message?: string;
  count?: number;
  items?: ComunicacaoDjen[];
  itens?: ComunicacaoDjen[];
}

export interface ConfigDjen {
  janela?: Janela;
  /** Siglas dos tribunais (padrão LUNETA_DJEN_TRIBUNAIS; vazio = todos). */
  tribunais?: readonly string[];
  /** Termos do filtro `texto` da API (padrão LUNETA_DJEN_TERMOS ou "leilão" e "hasta pública"). */
  termos?: readonly string[];
  /** Trava de páginas por consulta (100 páginas = teto de 10.000 da API). */
  maxPaginas?: number;
  /** Pausa quando a janela de requisições do IP acaba (x-ratelimit-remaining <= 1). Padrão 60 s. */
  pausaLimiteMs?: number;
  agora?: () => Date;
  ambiente?: Ambiente;
  esperar?: Esperar;
}

function itensDe(dados: RespostaDjen): ComunicacaoDjen[] {
  return dados.items ?? dados.itens ?? [];
}

function validarResposta(dados: unknown): string | null {
  if (!ehObjeto(dados)) return "resposta não é objeto";
  if (typeof dados.status === "string" && dados.status !== "success") return `status "${dados.status}": ${String(dados.message ?? "")}`.trim();
  const itens = dados.items ?? dados.itens;
  if (!Array.isArray(itens)) return "sem a lista `items`";
  if (!itens.every((i) => ehObjeto(i))) return "itens não são objetos";
  return null;
}

/** Nomes que a própria fonte rotula como partes e advogados (para mascarar o texto). */
export function nomesRotulados(c: ComunicacaoDjen): string[] {
  const nomes: string[] = [];
  for (const d of Array.isArray(c.destinatarios) ? c.destinatarios : []) if (typeof d?.nome === "string") nomes.push(d.nome);
  for (const a of Array.isArray(c.destinatarioadvogados) ? c.destinatarioadvogados : []) {
    if (typeof a?.advogado?.nome === "string") nomes.push(a.advogado.nome);
  }
  return nomes;
}

/** Texto da comunicação sem HTML e já mascarado (nomes rotulados + máscara do núcleo). */
export function textoMascarado(c: ComunicacaoDjen): string {
  return mascararDadosPessoais(mascararNomesConhecidos(semHtml(c.texto ?? ""), nomesRotulados(c)));
}

/**
 * UF e cidade do edital: a UF do tribunal quando ele tem uma só; senão a do texto ou a do
 * órgão (dentro da jurisdição). A cidade vem do texto ou do nome do órgão.
 */
export function localDaComunicacao(c: ComunicacaoDjen, texto: string = textoMascarado(c)): Local {
  const ufsTribunal = ufsDoTribunal(typeof c.siglaTribunal === "string" ? c.siglaTribunal : null);
  const doTexto = extrairLocal(texto, ufsTribunal ?? undefined);
  const doOrgao = cidadeDoOrgao(typeof c.nomeOrgao === "string" ? c.nomeOrgao : null);
  const ufOrgao = doOrgao.uf && (!ufsTribunal || ufsTribunal.includes(doOrgao.uf)) ? doOrgao.uf : null;
  const uf = ufsTribunal?.length === 1 ? (ufsTribunal[0] ?? null) : (doTexto.uf ?? ufOrgao);
  return { uf, cidade: doTexto.cidade ?? doOrgao.cidade };
}

/** Com --uf: a comunicação é de outra UF? UF desconhecida passa (não dá para saber). */
function foraDaUfPedida(c: ComunicacaoDjen, uf: Uf): boolean {
  const local = localDaComunicacao(c);
  return local.uf !== null && local.uf !== uf;
}

// ---------------------------------------------------------------------------
// Conector
// ---------------------------------------------------------------------------

export function criarConectorDjen(config: ConfigDjen = {}): Conector<ComunicacaoDjen> {
  const agora = config.agora ?? (() => new Date());
  const esperar = config.esperar ?? esperarPadrao;

  async function* daRede(op: OpcoesColeta): AsyncGenerator<ComunicacaoDjen> {
    const ambiente = config.ambiente ?? process.env;
    const janela = config.janela ?? janelaDoAmbiente(agora(), ambiente);
    const tribunais: Array<string | null> = [
      ...(config.tribunais ?? (op.uf ? tribunaisDaUf(op.uf) : listaDoAmbiente(ambiente.LUNETA_DJEN_TRIBUNAIS))),
    ].map((t) => t.toUpperCase());
    if (tribunais.length === 0) tribunais.push(null);
    const termosAmbiente = termosDoAmbiente(ambiente.LUNETA_DJEN_TERMOS);
    const termos = config.termos ?? (termosAmbiente.length > 0 ? termosAmbiente : TERMOS_PADRAO_DJEN);
    const maxPaginas = Math.min(config.maxPaginas ?? 100, TETO_DJEN / ITENS_POR_PAGINA);
    op.informar({
      origem: `${URL_DJEN} (meio=E; ${tribunais.every((t) => t === null) ? "todos os tribunais" : tribunais.join(", ")}; termos: ${termos.join(", ")}; ${janela.desde} a ${janela.ate})`,
    });
    const vistos = new Set<string>();
    let entregues = 0;
    let foraDaUf = 0;
    // Um dia por consulta: mantém cada consulta longe do teto de 10.000 resultados.
    for (const dia of diasDaJanela(janela)) {
      for (const tribunal of tribunais) {
        for (const termo of termos) {
          for (let pagina = 1; pagina <= maxPaginas; pagina++) {
            const url = montarUrl(URL_DJEN, {
              meio: "E",
              siglaTribunal: tribunal,
              texto: termo,
              dataDisponibilizacaoInicio: dia,
              dataDisponibilizacaoFim: dia,
              pagina,
              itensPorPagina: ITENS_POR_PAGINA,
            });
            const resposta = await comNovaTentativa(
              () => obterJson<RespostaDjen>(op.http, url, { sinal: op.sinal, respeitarRobots: robotsLigado(ambiente), validar: validarResposta }),
              { status: [429], vezes: 2, esperaMs: 60_000, esperar, log: op.log, sinal: op.sinal },
            );
            const dados = resposta.dados;
            if (!dados) break;
            const itens = itensDe(dados);
            if (pagina === 1 && typeof dados.count === "number" && dados.count >= TETO_DJEN) {
              op.informar({ aviso: `DJEN ${dia} ${tribunal ?? "todos"} "${termo}": ${dados.count} resultados, no teto da API; consulte por tribunal.` });
            }
            for (const item of itens) {
              const id = texto(item.id);
              if (id && vistos.has(id)) continue;
              if (id) vistos.add(id);
              // Com --uf, o tribunal pode cobrir várias UFs (o TRF1 cobre 13): fica só o que é da
              // UF pedida ou não diz a UF.
              if (op.uf && foraDaUfPedida(item, op.uf)) {
                foraDaUf++;
                continue;
              }
              entregues++;
              yield item;
            }
            const restantes = Number(resposta.cabecalhos.get("x-ratelimit-remaining"));
            if (resposta.cabecalhos.has("x-ratelimit-remaining") && Number.isFinite(restantes) && restantes <= 1) {
              op.log(`DJEN: janela de requisições do IP no fim; aguardando ${Math.round((config.pausaLimiteMs ?? 60_000) / 1000)} s.`);
              await esperar(config.pausaLimiteMs ?? 60_000);
            }
            if (itens.length < ITENS_POR_PAGINA) break;
            if (pagina === maxPaginas) op.informar({ aviso: `DJEN ${dia} "${termo}": parou na trava de ${maxPaginas} páginas.` });
          }
        }
      }
    }
    if (foraDaUf > 0) op.informar({ aviso: `DJEN: ${foraDaUf} comunicação(ões) de outra UF ignorada(s) (tribunal com várias UFs).` });
    // Todas as consultas responderam e nada veio: janela vazia, não falha.
    if (entregues === 0) op.informar({ vazioLegitimo: true });
  }

  async function* daArquivo(op: OpcoesColeta, arquivo: string): AsyncGenerator<ComunicacaoDjen> {
    op.informar({ origem: arquivo });
    const tribunais = op.uf ? new Set(tribunaisDaUf(op.uf)) : null;
    let entregues = 0;
    for (const doc of await lerJsonLocal(arquivo)) {
      const respostas = Array.isArray(doc.dados) ? doc.dados : [doc.dados];
      for (const resposta of respostas) {
        const recusa = validarResposta(resposta);
        if (recusa) throw new Error(`Arquivo do DJEN fora do formato da API (${doc.arquivo}): ${recusa}`);
        for (const item of itensDe(resposta as RespostaDjen)) {
          if (op.uf && (!tribunais?.has(String(item.siglaTribunal ?? "").toUpperCase()) || foraDaUfPedida(item, op.uf))) continue;
          entregues++;
          yield item;
        }
      }
    }
    if (entregues === 0) op.informar({ vazioLegitimo: true });
  }

  return {
    id: "djen",
    nome: "DJEN / Comunica PJe – Plataforma Nacional de Editais (leilões)",
    tipo: "judicial",
    acesso: "api_documentada",
    finalidade: "radar",
    url: "https://comunica.pje.jus.br",
    capacidades: { fotos: false, documentos: true, ocupacao: false, listaCompleta: false },

    coletar(op) {
      return op.arquivo ? daArquivo(op, op.arquivo) : daRede(op);
    },

    normalizar(c): EditalNormalizado | null {
      exigirObjeto(c, "comunicação não é objeto");
      const id = texto(c.id);
      if (!id) throw new Error("comunicação sem id");
      // Comunicação cancelada não anuncia leilão.
      if (c.ativo === false || texto(c.data_cancelamento) || texto(c.motivo_cancelamento)) return null;

      const analise = analisarLeilaoImovel(textoMascarado(c));
      if (!analise.aceito) return null;
      const publicado = lerDataBR(texto(c.data_disponibilizacao)) ?? lerDataBR(texto(c.datadisponibilizacao));
      const dataLeilao = extrairDataLeilao(analise.texto, publicado, agora());
      // Intimação da arrematação, homologação, "arrematado por Fulano": não anuncia leilão futuro.
      // A busca roda no texto sem máscara (só para decidir; nada dele é gravado).
      if (motivoSemLeilaoFuturo(null, { texto: semHtml(c.texto ?? ""), dataLeilao })) return null;

      const sigla = texto(c.siglaTribunal)?.toUpperCase() ?? null;
      const orgaoNome = texto(c.nomeOrgao);
      const { uf, cidade } = localDaComunicacao(c, analise.texto);
      const processo = texto(c.numeroprocessocommascara) ?? texto(c.numero_processo);
      const url =
        urlOuNulo(c.link) ??
        montarUrl(URL_DJEN, {
          numeroProcesso: texto(c.numero_processo),
          siglaTribunal: sigla,
          dataDisponibilizacaoInicio: publicado,
          dataDisponibilizacaoFim: publicado,
        });
      const titulo = `Edital de leilão judicial – ${orgaoNome ?? "órgão não informado"}${sigla ? ` (${sigla})` : ""}${processo ? ` – Proc. ${processo}` : ""}`;
      const cabecalho = [
        processo ? `Processo ${processo}` : null,
        texto(c.nomeClasse) ? `classe ${capitalizarNome(texto(c.nomeClasse) ?? "")}` : null,
        texto(c.tipoDocumento) ? `documento: ${texto(c.tipoDocumento)}` : null,
      ].filter((t): t is string => t !== null);

      return {
        registro: "edital",
        id_na_fonte: id,
        titulo,
        orgao: [orgaoNome, sigla].filter((t): t is string => t !== null).join(" – ") || null,
        uf,
        cidade,
        publicado_em: publicado,
        data_leilao: dataLeilao,
        url,
        resumo: `${cabecalho.length > 0 ? cabecalho.join("; ") + ".\n" : ""}${resumoRelevante(analise)}`,
      };
    },
  };
}

export const djen = criarConectorDjen();
