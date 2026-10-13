/**
 * Radar: Querido Diário (Open Knowledge Brasil), diários oficiais municipais.
 *
 * Fonte: API pública documentada (qd-api, MIT; api/api.py, rota GET /gazettes):
 *   GET https://api.queridodiario.ok.org.br/gazettes?querystring=...&published_since=AAAA-MM-DD
 *       &published_until=AAAA-MM-DD&excerpt_size=N&number_of_excerpts=N&size=N&offset=N
 *       &sort_by=descending_date[&territory_ids=IBGE7&territory_ids=...]
 *   → {total_gazettes, gazettes: [{territory_id, date, scraped_at, url, territory_name,
 *      state_code, excerpts[], edition, is_extra_edition, txt_url}]}
 * `querystring` usa a "simple query string" do OpenSearch: `+` = E, `|` = OU, aspas = frase.
 * A busca padrão é ("leilão" OU "leilao") E (um dos termos de imóvel). O OpenSearch não deixa
 * paginar além de 10.000 resultados; a coleta para antes e avisa.
 *
 * Cada diário que casa vira UM edital (id = território + data + arquivo), com os trechos
 * (excerpts) como resumo. O filtro local (filtro.ts) confirma que os trechos falam de leilão
 * de imóvel, já que a busca do OpenSearch casa palavras soltas. Trecho com marca de resultado
 * (resultado, homologação, "arrematado por Fulano", "sendo vencedor") sai antes do filtro e do
 * resumo: não anuncia leilão futuro e costuma trazer o nome de quem arrematou (LGPD).
 *
 * Variáveis de ambiente: LUNETA_QD_TERRITORIOS (códigos IBGE de 7 dígitos, separados por
 * vírgula; vazio = todos os municípios cobertos) e a janela de config.ts. Com --uf, só ficam os
 * diários daquela UF (filtro pelo state_code da resposta; a API não filtra por UF).
 *
 * Não é a fonte oficial: o Querido Diário raspa os diários das prefeituras e cobre só parte dos
 * municípios. Código MIT; licença dos dados citada como CC BY 4.0 por terceiro (mcp-brasil,
 * SOURCES.md §13.1), não confirmada: atribuir "Querido Diário – Open Knowledge Brasil".
 *
 * Sem teste ao vivo (rede bloqueada). A fixture segue o modelo GazetteItem/GazetteSearchResponse
 * da qd-api, com textos construídos e fictícios.
 */
import type { Conector, EditalNormalizado, OpcoesColeta } from "../../../tipos.ts";
import { lerDataBR } from "../../../util/data.ts";
import { hashEstavel } from "../../../util/hash.ts";
import { colapsarEspacos } from "../../../util/texto.ts";
import { normalizarUf } from "../../../util/uf.ts";
import { diaBr, ehObjeto, exigirObjeto, lerJsonLocal, montarUrl, obterJson, texto, urlOuNulo } from "../comum.ts";
import { janelaDoAmbiente, listaDoAmbiente, robotsLigado, type Ambiente, type Janela } from "../config.ts";
import { analisarLeilaoImovel, sinaisDeResultado, type AnaliseLeilaoImovel } from "../filtro.ts";
import { extrairDataLeilao, numeroDoAviso, resumoRelevante } from "../texto.ts";

export const URL_QUERIDO_DIARIO = "https://api.queridodiario.ok.org.br/gazettes";

/** Termos de imóvel da busca (o pedido do produto) e a montagem da querystring. */
export const TERMOS_IMOVEL_QD = [
  "imóvel", "imóveis", "terreno", "\"lote urbano\"", "edificação", "apartamento", "casa", "\"sala comercial\"",
  "galpão", "fazenda", "gleba", "área",
] as const;

export function montarQuerystring(termos: readonly string[] = TERMOS_IMOVEL_QD): string {
  return `(leilão | leilao) + (${termos.join(" | ")})`;
}

/** Limite do OpenSearch para from + size (max_result_window padrão). */
const JANELA_MAXIMA_OPENSEARCH = 10_000;

export interface DiarioQd {
  territory_id?: string;
  date?: string;
  scraped_at?: string;
  url?: string;
  territory_name?: string;
  state_code?: string;
  excerpts?: string[];
  edition?: string | null;
  is_extra_edition?: boolean | null;
  txt_url?: string | null;
}

export interface RespostaQd {
  total_gazettes: number;
  gazettes: DiarioQd[];
}

export interface ConfigQueridoDiario {
  janela?: Janela;
  /** Códigos IBGE (7 dígitos). Padrão: LUNETA_QD_TERRITORIOS, ou todos. */
  territorios?: readonly string[];
  querystring?: string;
  /** Resultados por página. Padrão 50. */
  tamanhoPagina?: number;
  /** Trava de resultados por execução. Padrão 2.000. */
  maxResultados?: number;
  /** Tamanho de cada trecho devolvido. Padrão 1.500. */
  tamanhoTrecho?: number;
  /** Trechos por diário. Padrão 3. */
  trechosPorDiario?: number;
  agora?: () => Date;
  ambiente?: Ambiente;
}

function validarResposta(dados: unknown): string | null {
  if (!ehObjeto(dados)) return "resposta não é objeto";
  if (typeof dados.total_gazettes !== "number") return "sem total_gazettes";
  if (!Array.isArray(dados.gazettes) || !dados.gazettes.every((g) => ehObjeto(g))) return "gazettes não é lista de objetos";
  return null;
}

/**
 * Trechos que podem anunciar leilão futuro: os de resultado (homologação, "arrematado por",
 * "sendo vencedor") saem aqui, antes do filtro e do resumo.
 */
export function trechosSemResultado(diario: DiarioQd): string[] {
  return (Array.isArray(diario.excerpts) ? diario.excerpts : [])
    .filter((t): t is string => typeof t === "string" && t.trim() !== "")
    .filter((t) => sinaisDeResultado(t).length === 0);
}

function analisar(diario: DiarioQd): AnaliseLeilaoImovel | null {
  const trechos = trechosSemResultado(diario);
  return trechos.length > 0 ? analisarLeilaoImovel(trechos.join("\n…\n")) : null;
}

/** Nome do arquivo na URL, sem extensão (o QD usa o checksum do arquivo como nome). */
function nomeDoArquivo(url: string): string {
  try {
    const caminho = new URL(url).pathname;
    const nome = caminho.slice(caminho.lastIndexOf("/") + 1).replace(/\.[a-z0-9]+$/i, "");
    return nome || hashEstavel(url).slice(0, 16);
  } catch {
    return hashEstavel(url).slice(0, 16);
  }
}

export function criarConectorQueridoDiario(config: ConfigQueridoDiario = {}): Conector<DiarioQd> {
  const agora = config.agora ?? (() => new Date());

  async function* daRede(op: OpcoesColeta): AsyncGenerator<DiarioQd> {
    const ambiente = config.ambiente ?? process.env;
    const janela = config.janela ?? janelaDoAmbiente(agora(), ambiente);
    const territorios = config.territorios ?? listaDoAmbiente(ambiente.LUNETA_QD_TERRITORIOS);
    const invalidos = territorios.filter((t) => !/^\d{7}$/.test(t));
    if (invalidos.length > 0) throw new Error(`Código IBGE inválido em LUNETA_QD_TERRITORIOS (use 7 dígitos): ${invalidos.join(", ")}`);
    const tamanho = Math.max(1, Math.min(100, config.tamanhoPagina ?? 50));
    const maxResultados = Math.min(config.maxResultados ?? 2_000, JANELA_MAXIMA_OPENSEARCH);
    const querystring = config.querystring ?? montarQuerystring();
    op.informar({ origem: `${URL_QUERIDO_DIARIO} (${querystring}; ${janela.desde} a ${janela.ate}${territorios.length ? `; ${territorios.length} município(s)` : ""})` });

    let total: number | null = null;
    let entregues = 0;
    for (let offset = 0; ; offset += tamanho) {
      if (offset + tamanho > maxResultados) {
        op.informar({ aviso: `Querido Diário: parou em ${offset} de ${total ?? "?"} diários (trava de ${maxResultados}); estreite a janela ou os municípios.` });
        break;
      }
      const url = montarUrl(URL_QUERIDO_DIARIO, {
        querystring,
        published_since: janela.desde,
        published_until: janela.ate,
        territory_ids: territorios,
        excerpt_size: config.tamanhoTrecho ?? 1_500,
        number_of_excerpts: config.trechosPorDiario ?? 3,
        size: tamanho,
        offset,
        sort_by: "descending_date",
      });
      const { dados } = await obterJson<RespostaQd>(op.http, url, { sinal: op.sinal, respeitarRobots: robotsLigado(ambiente), validar: validarResposta });
      if (!dados) break;
      if (total === null) {
        total = dados.total_gazettes;
        op.informar({ totalNaFonte: total });
      }
      for (const diario of dados.gazettes) {
        if (op.uf && normalizarUf(diario.state_code) !== op.uf) continue;
        entregues++;
        yield diario;
      }
      if (dados.gazettes.length < tamanho || offset + tamanho >= dados.total_gazettes) break;
    }
    // Todas as respostas conferidas e nenhum diário na janela (ou na UF): consulta válida e vazia.
    if (entregues === 0) op.informar({ vazioLegitimo: true });
  }

  async function* daArquivo(op: OpcoesColeta, arquivo: string): AsyncGenerator<DiarioQd> {
    op.informar({ origem: arquivo });
    let entregues = 0;
    for (const doc of await lerJsonLocal(arquivo)) {
      const respostas = Array.isArray(doc.dados) ? doc.dados : [doc.dados];
      for (const resposta of respostas) {
        const recusa = validarResposta(resposta);
        if (recusa) throw new Error(`Arquivo do Querido Diário fora do formato da API (${doc.arquivo}): ${recusa}`);
        for (const diario of (resposta as RespostaQd).gazettes) {
          if (op.uf && normalizarUf(diario.state_code) !== op.uf) continue;
          entregues++;
          yield diario;
        }
      }
    }
    if (entregues === 0) op.informar({ vazioLegitimo: true });
  }

  return {
    id: "querido_diario",
    nome: "Querido Diário (OKBR) – diários oficiais municipais",
    tipo: "agregador",
    // API documentada, mas de terceiro (a OKBR raspa os diários): ver o topo do arquivo.
    acesso: "api_documentada",
    finalidade: "radar",
    url: "https://queridodiario.ok.org.br",
    capacidades: { fotos: false, documentos: true, ocupacao: false, listaCompleta: false },

    coletar(op) {
      return op.arquivo ? daArquivo(op, op.arquivo) : daRede(op);
    },

    normalizar(diario): EditalNormalizado | null {
      exigirObjeto(diario, "diário não é objeto");
      const url = urlOuNulo(diario.url);
      const territorio = texto(diario.territory_id);
      const data = lerDataBR(texto(diario.date));
      if (!url || !territorio || !data) throw new Error(`diário sem url, território ou data: ${JSON.stringify(diario).slice(0, 120)}`);
      const analise = analisar(diario);
      if (!analise?.aceito) return null;

      const cidade = texto(diario.territory_name);
      const uf = normalizarUf(diario.state_code);
      const edicao = texto(diario.edition);
      const numero = numeroDoAviso(analise.texto);
      const local = cidade ? `${cidade}${uf ? `/${uf}` : ""}` : `município ${territorio}`;
      const titulo =
        `${numero ? `Edital de leilão ${numero}` : "Leilão de imóvel"} – Diário oficial de ${local}, ${diaBr(data)}` +
        `${edicao ? ` (edição ${edicao}${diario.is_extra_edition ? ", extra" : ""})` : diario.is_extra_edition ? " (edição extra)" : ""}`;

      return {
        registro: "edital",
        id_na_fonte: `${territorio}/${data}/${nomeDoArquivo(url)}`,
        titulo,
        orgao: cidade ? `Município de ${cidade}${uf ? `/${uf}` : ""}` : null,
        uf,
        cidade,
        publicado_em: data,
        data_leilao: extrairDataLeilao(analise.texto, data, agora()),
        url,
        resumo: colapsarEspacos(resumoRelevante(analise)) + "\nFonte: Querido Diário – Open Knowledge Brasil.",
      };
    },
  };
}

export const queridoDiario = criarConectorQueridoDiario();
