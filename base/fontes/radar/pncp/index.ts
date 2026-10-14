/**
 * Radar: PNCP (Portal Nacional de Contratações Públicas), editais de leilão de imóveis.
 *
 * Fonte: API de consulta documentada (OpenAPI em https://pncp.gov.br/api/consulta/v3/api-docs).
 * - GET /api/consulta/v1/contratacoes/publicacao?dataInicial=AAAAMMDD&dataFinal=AAAAMMDD
 *       &codigoModalidadeContratacao=N&pagina=P&tamanhoPagina=50[&uf=SP]
 *   contratações publicadas na janela (até 365 dias por consulta).
 * - GET /api/consulta/v1/contratacoes/proposta?dataFinal=AAAAMMDD&codigoModalidadeContratacao=N...
 *   contratações com recebimento de propostas em aberto (pega leilão publicado antes da janela).
 * - GET /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/arquivos (com --detalhes): arquivos do
 *   edital (edital, anexos), só para o que passou no filtro de imóvel. Vão no campo
 *   `documentos` do edital (coluna própria, migração 002), não no resumo: uma coleta sem
 *   --detalhes não apaga os arquivos já gravados.
 * Envelope das consultas: {data[], totalRegistros, totalPaginas, numeroPagina, paginasRestantes,
 * empty}; 204 = nada no período; 404 em /arquivos = lista vazia. O servidor trunca páginas sem
 * avisar, por isso a paginação vai até paginasRestantes = 0 (pncp-cli, pagination.py).
 *
 * Modalidades: 1 = "Leilão - Eletrônico" e 13 = "Leilão - Presencial" (pncp-cli constants.py e
 * pipeworx mcp-brazil-pncp index.ts). CONFLITO REGISTRADO: o pypncp (docs/resources/
 * contratacoes.md) diz 4 = Leilão, mas na tabela do PNCP 4 é "Concorrência - Eletrônica". Ficamos
 * com 1 e 13 e conferimos em toda coleta: se o PNCP devolver modalidade que não seja leilão para
 * esses códigos, a coleta para com erro e nada é gravado (confira /api/pncp/v1/modalidades).
 *
 * Grava na tabela `edital` (finalidade radar), nunca em `imovel`: o lote só aparece descrito no
 * PDF do edital. UF e cidade: primeiro as que o objeto cita ("situado no Município de
 * Recife/PE"); sem isso, a do órgão só quando ele é municipal (UF e cidade) ou estadual (só a
 * UF). Órgão federal sem local no texto fica sem UF: a sede do órgão não é o lugar do imóvel.
 * --uf filtra no servidor pela UF do ÓRGÃO; o que o texto põe em outra UF é descartado. Um
 * órgão federal de outra UF que venda imóvel na UF pedida só aparece na coleta sem --uf.
 *
 * Sem teste ao vivo (rede bloqueada neste ambiente). A fixture foi construída a partir do
 * esquema documentado (nomes de campo do pncp-cli, pipeworx, pypncp e da arquitetura da tabela
 * br_mgi_pncp.contratacao da Base dos Dados), com dados fictícios.
 */
import type { Conector, Documento, EditalNormalizado, OpcoesColeta, TipoDocumento, Uf } from "../../../tipos.ts";
import { lerDataBR, lerDataHoraBR } from "../../../util/data.ts";
import { formatarMoedaBR } from "../../../util/numero.ts";
import { colapsarEspacos, semAcento, truncar } from "../../../util/texto.ts";
import { normalizarUf } from "../../../util/uf.ts";
import {
  comNovaTentativa,
  ehObjeto,
  esperarPadrao,
  exigirObjeto,
  lerJsonLocal,
  montarUrl,
  numero,
  obterJson,
  texto,
  urlOuNulo,
  type Esperar,
} from "../comum.ts";
import { diaCompacto, janelaDoAmbiente, robotsLigado, somarDias, type Ambiente, type Janela } from "../config.ts";
import { analisarLeilaoImovel, type AnaliseLeilaoImovel } from "../filtro.ts";
import { extrairDataLeilao, extrairLocal, extrairSiteLeilao, type Local } from "../texto.ts";

export const BASE_PNCP = "https://pncp.gov.br";

/** Códigos de leilão na tabela de modalidades do PNCP (ver o conflito no topo do arquivo). */
export const MODALIDADES_LEILAO: Readonly<Record<number, string>> = {
  1: "Leilão - Eletrônico",
  13: "Leilão - Presencial",
};

// ---------------------------------------------------------------------------
// Tipos brutos (só os campos usados; a API devolve mais)
// ---------------------------------------------------------------------------

export interface ContratacaoPncp {
  numeroControlePNCP?: string;
  anoCompra?: number;
  sequencialCompra?: number;
  numeroCompra?: string;
  processo?: string | null;
  objetoCompra?: string;
  informacaoComplementar?: string | null;
  modalidadeId?: number;
  modalidadeNome?: string;
  modoDisputaNome?: string | null;
  situacaoCompraNome?: string | null;
  /** esferaId: F federal, E estadual, M municipal, D distrital, N não se aplica. */
  orgaoEntidade?: { cnpj?: string; razaoSocial?: string; esferaId?: string; poderId?: string } | null;
  unidadeOrgao?: { ufSigla?: string; ufNome?: string; municipioNome?: string; codigoIbge?: string; nomeUnidade?: string; codigoUnidade?: string } | null;
  dataPublicacaoPncp?: string | null;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  dataAtualizacaoGlobal?: string | null;
  valorTotalEstimado?: number | null;
  valorTotalHomologado?: number | null;
  linkSistemaOrigem?: string | null;
  amparoLegal?: { codigo?: number; nome?: string; descricao?: string } | null;
}

/** Item de /arquivos. */
export interface ArquivoPncp {
  sequencialDocumento?: number;
  titulo?: string | null;
  tipoDocumentoId?: number;
  tipoDocumentoNome?: string | null;
  url?: string | null;
  uri?: string | null;
  dataPublicacaoPncp?: string | null;
  statusAtivo?: boolean;
}

export interface PaginaPncp {
  data: ContratacaoPncp[];
  totalRegistros?: number;
  totalPaginas?: number;
  numeroPagina?: number;
  paginasRestantes?: number;
  empty?: boolean;
}

export interface BrutoPncp {
  contratacao: ContratacaoPncp;
  /** Arquivos do edital (só com --detalhes); `null` = não consultados. */
  arquivos: ArquivoPncp[] | null;
  /** De onde veio: consulta por publicação, propostas abertas ou arquivo local. */
  consulta: "publicacao" | "proposta" | "arquivo";
}

export interface ConfigPncp {
  /** Códigos de modalidade consultados (padrão 1 e 13). */
  modalidades?: readonly number[];
  /** Janela de publicação (padrão: LUNETA_RADAR_DESDE/ATE, ver config.ts). */
  janela?: Janela;
  /** Também consulta /proposta (leilões com propostas em aberto). Padrão true. */
  incluirAbertas?: boolean;
  /** /proposta: dataFinal = fim da janela + N dias. Padrão 120. */
  diasPropostaAdiante?: number;
  /** 10 a 50 (limite da API). Padrão 50. */
  tamanhoPagina?: number;
  /** Trava por consulta; acima disso a coleta avisa que pode estar incompleta. Padrão 200. */
  maxPaginas?: number;
  agora?: () => Date;
  ambiente?: Ambiente;
  esperar?: Esperar;
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/** "07424905000138-1-000212/2026" → {cnpj, ano, sequencial}. `null` se o formato não bater. */
export function partesDoControle(controle: unknown): { cnpj: string; ano: number; sequencial: number } | null {
  if (typeof controle !== "string") return null;
  const m = /^(\d{14})-\d+-(\d+)\/(\d{4})(?:-\d+)?$/.exec(controle.trim());
  if (!m) return null;
  return { cnpj: m[1] ?? "", ano: Number(m[3]), sequencial: Number(m[2]) };
}

/** Página pública do edital no portal. */
export function linkDoEdital(controle: string): string | null {
  const p = partesDoControle(controle);
  return p ? `${BASE_PNCP}/app/editais/${p.cnpj}/${p.ano}/${p.sequencial}` : null;
}

function textoDaContratacao(c: ContratacaoPncp): string {
  return [texto(c.objetoCompra), texto(c.informacaoComplementar)].filter((t): t is string => t !== null).join("\n");
}

function analisar(c: ContratacaoPncp): AnaliseLeilaoImovel {
  return analisarLeilaoImovel(textoDaContratacao(c), { leilaoGarantido: true });
}

/** Esfera do órgão: o campo esferaId, ou a razão social quando ele falta. */
function esferaDoOrgao(c: ContratacaoPncp): "F" | "E" | "M" | "D" | null {
  const id = texto(c.orgaoEntidade?.esferaId)?.toUpperCase();
  if (id === "F" || id === "E" || id === "M" || id === "D") return id;
  if (id === "N") return null;
  const nome = semAcento(texto(c.orgaoEntidade?.razaoSocial) ?? "").toUpperCase();
  if (/\b(?:MUNICIPIO|MUNICIPAL|PREFEITURA)\b/.test(nome)) return "M";
  if (/\bDISTRITO FEDERAL\b/.test(nome)) return "D";
  if (/\b(?:ESTADO|ESTADUAL)\b/.test(nome)) return "E";
  if (/\b(?:UNIAO|FEDERAL|MINISTERIO|NACIONAL)\b/.test(nome)) return "F";
  return null;
}

/**
 * Onde fica o imóvel: o local citado no objeto ou na informação complementar; sem isso, o
 * município do órgão municipal (ou distrital) e só a UF do órgão estadual. Federal ou esfera
 * desconhecida sem local no texto: nulos.
 */
export function localDoEdital(c: ContratacaoPncp): Local {
  const doTexto = extrairLocal(textoDaContratacao(c));
  const esfera = esferaDoOrgao(c);
  const ufOrgao = normalizarUf(c.unidadeOrgao?.ufSigla);
  const cidadeOrgao = texto(c.unidadeOrgao?.municipioNome);
  if (doTexto.uf || doTexto.cidade) {
    // Cidade sem UF no texto: a UF do órgão municipal ou estadual vale (vende o que é seu).
    const uf = doTexto.uf ?? (esfera === "M" || esfera === "E" || esfera === "D" ? ufOrgao : null);
    return { uf, cidade: doTexto.cidade };
  }
  if (esfera === "M" || esfera === "D") return { uf: ufOrgao, cidade: cidadeOrgao };
  if (esfera === "E") return { uf: ufOrgao, cidade: null };
  return { uf: null, cidade: null };
}

/** Com --uf: o texto põe o imóvel em outra UF? UF desconhecida passa. */
function foraDaUfPedida(c: ContratacaoPncp, uf: Uf): boolean {
  const local = localDoEdital(c);
  return local.uf !== null && local.uf !== uf;
}

function tipoDoArquivo(a: ArquivoPncp): TipoDocumento {
  const tipo = semAcento(texto(a.tipoDocumentoNome) ?? "").toLowerCase();
  const titulo = semAcento(texto(a.titulo) ?? "").toLowerCase();
  if (/\bedital\b/.test(tipo) || /^edital\b/.test(titulo)) return "edital";
  if (/\bmatricula\b/.test(titulo)) return "matricula";
  if (/\blaudo\b/.test(titulo)) return "laudo";
  if (/\bavaliacao\b/.test(titulo)) return "avaliacao";
  return "outro";
}

/** Arquivos ativos de /arquivos como documentos do edital; `null` = não consultados. */
export function documentosDoPncp(arquivos: readonly ArquivoPncp[] | null): Documento[] | null {
  if (arquivos === null) return null;
  const documentos: Documento[] = [];
  for (const a of arquivos) {
    if (!ehObjeto(a) || a.statusAtivo === false) continue;
    const url = urlOuNulo(a.url ?? a.uri);
    if (!url) continue;
    documentos.push({
      tipo: tipoDoArquivo(a),
      titulo: texto(a.titulo) ?? texto(a.tipoDocumentoNome) ?? `Documento ${a.sequencialDocumento ?? ""}`.trim(),
      url,
      publicado_em: lerDataBR(texto(a.dataPublicacaoPncp)),
    });
    if (documentos.length >= 20) break;
  }
  return documentos;
}

function validarPagina(dados: unknown): string | null {
  if (!ehObjeto(dados) || !Array.isArray(dados.data)) return "envelope sem a lista `data` (formato da API mudou?)";
  if (!dados.data.every((item) => ehObjeto(item))) return "itens de `data` não são objetos";
  return null;
}

/**
 * Confere se o registro é mesmo de leilão. Protege contra a tabela de modalidades errada (o
 * conflito 1/13 × 4): melhor parar a coleta do que gravar pregão como leilão.
 */
function conferirModalidade(c: ContratacaoPncp, pedida: number | null): void {
  const nome = texto(c.modalidadeNome);
  const id = numero(c.modalidadeId);
  const ehLeilao = nome === null || /leil/i.test(semAcento(nome));
  if (!ehLeilao || (pedida !== null && id !== null && id !== pedida)) {
    throw new Error(
      `PNCP devolveu a modalidade ${id ?? "?"} (${nome ?? "sem nome"}) na consulta do código ${pedida ?? "?"}. ` +
        `A tabela de modalidades mudou? Confira ${BASE_PNCP}/api/pncp/v1/modalidades. Nada foi gravado.`,
    );
  }
}

function dataHora(valor: unknown): string | null {
  return lerDataHoraBR(texto(valor));
}

function formatarDataHora(valor: unknown): string | null {
  const t = texto(valor);
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(t);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}h${m[5]}` : ""}`;
}

// ---------------------------------------------------------------------------
// Entrada local (fixture)
// ---------------------------------------------------------------------------

/**
 * Aceita: um envelope de página ({data: [...]}), uma lista de envelopes, uma lista de
 * contratações, ou {paginas: [envelopes], arquivos: {numeroControlePNCP: [arquivos]}}.
 */
function interpretarFixture(dados: unknown, arquivo: string): { paginas: PaginaPncp[]; arquivos: Record<string, ArquivoPncp[]> } {
  const recusar = (motivo: string): never => {
    throw new Error(`Fixture do PNCP em formato desconhecido (${arquivo}): ${motivo}`);
  };
  let paginas: unknown[] = [];
  let arquivos: Record<string, ArquivoPncp[]> = {};
  if (Array.isArray(dados)) {
    paginas = dados.every((d) => ehObjeto(d) && "numeroControlePNCP" in d) ? [{ data: dados }] : dados;
  } else if (ehObjeto(dados) && Array.isArray(dados.paginas)) {
    paginas = dados.paginas;
    if (dados.arquivos !== undefined) {
      if (!ehObjeto(dados.arquivos)) recusar("`arquivos` deve ser um objeto {numeroControlePNCP: [...]}");
      arquivos = dados.arquivos as Record<string, ArquivoPncp[]>;
    }
  } else if (ehObjeto(dados)) paginas = [dados];
  else recusar("esperava objeto ou lista");
  for (const pagina of paginas) {
    const recusa = validarPagina(pagina);
    if (recusa) recusar(recusa);
  }
  return { paginas: paginas as PaginaPncp[], arquivos };
}

// ---------------------------------------------------------------------------
// Conector
// ---------------------------------------------------------------------------

export function criarConectorPncp(config: ConfigPncp = {}): Conector<BrutoPncp> {
  const agora = config.agora ?? (() => new Date());
  const esperar = config.esperar ?? esperarPadrao;

  async function buscarArquivos(op: OpcoesColeta, c: ContratacaoPncp, robots: boolean): Promise<ArquivoPncp[]> {
    const p = partesDoControle(c.numeroControlePNCP);
    if (!p) return [];
    const url = `${BASE_PNCP}/api/pncp/v1/orgaos/${p.cnpj}/compras/${p.ano}/${p.sequencial}/arquivos`;
    const resposta = await comNovaTentativa(
      () =>
        obterJson<unknown[]>(op.http, url, {
          sinal: op.sinal,
          respeitarRobots: robots,
          aceitar404: true,
          validar: (d) => (Array.isArray(d) && d.every((x) => ehObjeto(x)) ? null : "lista de arquivos não é uma lista de objetos"),
        }),
      { status: [400], vezes: 1, esperaMs: 5_000, esperar, log: op.log, sinal: op.sinal },
    );
    return (resposta.dados ?? []) as ArquivoPncp[];
  }

  async function* daRede(op: OpcoesColeta): AsyncGenerator<BrutoPncp> {
    const modalidades = config.modalidades ?? Object.keys(MODALIDADES_LEILAO).map(Number);
    const ambiente = config.ambiente ?? process.env;
    const janela = config.janela ?? janelaDoAmbiente(agora(), ambiente);
    const robots = robotsLigado(ambiente);
    const tamanho = Math.min(50, Math.max(10, config.tamanhoPagina ?? 50));
    const maxPaginas = config.maxPaginas ?? 200;
    const consultas: Array<BrutoPncp["consulta"]> = config.incluirAbertas === false ? ["publicacao"] : ["publicacao", "proposta"];
    op.informar({
      origem: `${BASE_PNCP}/api/consulta/v1/contratacoes (modalidades ${modalidades.join(", ")}; publicação de ${janela.desde} a ${janela.ate}${consultas.includes("proposta") ? "; propostas em aberto" : ""})`,
    });
    const vistos = new Set<string>();
    let total = 0;
    let entregues = 0;
    let foraDaUf = 0;
    for (const modalidade of modalidades) {
      for (const consulta of consultas) {
        for (let pagina = 1; ; pagina++) {
          if (pagina > maxPaginas) {
            op.informar({ aviso: `PNCP ${consulta}, modalidade ${modalidade}: parou na trava de ${maxPaginas} páginas; resultado pode estar incompleto.` });
            break;
          }
          const parametros =
            consulta === "publicacao"
              ? { dataInicial: diaCompacto(janela.desde), dataFinal: diaCompacto(janela.ate) }
              : { dataFinal: diaCompacto(somarDias(janela.ate, config.diasPropostaAdiante ?? 120)) };
          const url = montarUrl(`${BASE_PNCP}/api/consulta/v1/contratacoes/${consulta}`, {
            ...parametros,
            codigoModalidadeContratacao: modalidade,
            uf: op.uf,
            pagina,
            tamanhoPagina: tamanho,
          });
          // O PNCP às vezes responde 400 "For input string" numa página e acerta na repetição.
          const { dados } = await comNovaTentativa(
            () => obterJson<PaginaPncp>(op.http, url, { sinal: op.sinal, respeitarRobots: robots, validar: validarPagina }),
            { status: [400], vezes: 1, esperaMs: 5_000, esperar, log: op.log, sinal: op.sinal },
          );
          if (!dados) break;
          if (pagina === 1 && typeof dados.totalRegistros === "number") total += dados.totalRegistros;
          for (const c of dados.data) {
            conferirModalidade(c, modalidade);
            const controle = texto(c.numeroControlePNCP);
            if (controle && vistos.has(controle)) continue;
            if (controle) vistos.add(controle);
            // O servidor filtra pela UF do órgão; o texto pode pôr o imóvel em outra UF.
            if (op.uf && foraDaUfPedida(c, op.uf)) {
              foraDaUf++;
              continue;
            }
            const arquivos = op.detalhes && analisar(c).aceito ? await buscarArquivos(op, c, robots) : null;
            entregues++;
            yield { contratacao: c, arquivos, consulta };
          }
          const restantes = typeof dados.paginasRestantes === "number" ? dados.paginasRestantes : null;
          const ultimaPelaConta = typeof dados.totalPaginas === "number" && pagina >= dados.totalPaginas;
          if (dados.data.length === 0 || restantes === 0 || ultimaPelaConta || (restantes === null && dados.data.length < tamanho)) break;
        }
      }
    }
    op.informar({ totalNaFonte: total });
    if (foraDaUf > 0) op.informar({ aviso: `PNCP: ${foraDaUf} edital(is) com imóvel em outra UF ignorado(s).` });
    // Todas as consultas responderam (204 ou páginas vazias): janela sem leilão, não falha.
    if (entregues === 0) op.informar({ vazioLegitimo: true });
  }

  async function* daFixture(op: OpcoesColeta, arquivo: string): AsyncGenerator<BrutoPncp> {
    op.informar({ origem: arquivo });
    let entregues = 0;
    for (const doc of await lerJsonLocal(arquivo)) {
      const { paginas, arquivos } = interpretarFixture(doc.dados, doc.arquivo);
      for (const pagina of paginas) {
        for (const c of pagina.data) {
          // Como na rede: UF do órgão (filtro do servidor) e, depois, a do texto.
          if (op.uf && (normalizarUf(c.unidadeOrgao?.ufSigla) !== op.uf || foraDaUfPedida(c, op.uf))) continue;
          conferirModalidade(c, null);
          const controle = texto(c.numeroControlePNCP) ?? "";
          entregues++;
          yield { contratacao: c, arquivos: op.detalhes ? (arquivos[controle] ?? []) : null, consulta: "arquivo" };
        }
      }
    }
    if (entregues === 0) op.informar({ vazioLegitimo: true });
  }

  return {
    id: "pncp",
    nome: "PNCP – Portal Nacional de Contratações Públicas (leilões)",
    tipo: "governo",
    acesso: "api_documentada",
    finalidade: "radar",
    url: "https://pncp.gov.br/app/editais",
    capacidades: { fotos: false, documentos: true, ocupacao: false, listaCompleta: false },

    coletar(op) {
      return op.arquivo ? daFixture(op, op.arquivo) : daRede(op);
    },

    normalizar(bruto): EditalNormalizado | null {
      const c = bruto.contratacao;
      exigirObjeto(c, "registro sem contratação");
      const controle = texto(c.numeroControlePNCP);
      const url = controle ? linkDoEdital(controle) : null;
      if (!controle || !url) throw new Error(`numeroControlePNCP ausente ou fora do padrão CNPJ-TIPO-SEQ/ANO: ${String(c.numeroControlePNCP)}`);

      const analise = analisar(c);
      if (!analise.aceito) return null;

      const objeto = colapsarEspacos(texto(c.objetoCompra) ?? "");
      const orgaoNome = texto(c.orgaoEntidade?.razaoSocial);
      const unidade = texto(c.unidadeOrgao?.nomeUnidade);
      const mesmo = (a: string, b: string): boolean => semAcento(a).toLowerCase() === semAcento(b).toLowerCase();
      const orgao = [orgaoNome, unidade && !(orgaoNome && mesmo(orgaoNome, unidade)) ? unidade : null].filter((t): t is string => Boolean(t)).join(" – ") || null;
      const publicado = lerDataBR(texto(c.dataPublicacaoPncp));
      const abertura = dataHora(c.dataAberturaProposta);
      const encerramento = dataHora(c.dataEncerramentoProposta);

      const numeroCompra = texto(c.numeroCompra);
      const ano = numero(c.anoCompra);
      const modalidade = texto(c.modalidadeNome) ?? "Leilão";
      const numeroTexto = numeroCompra ? ` nº ${numeroCompra}${ano && !numeroCompra.includes("/") ? `/${ano}` : ""}` : "";
      const titulo = `${modalidade}${numeroTexto} – ${orgaoNome ?? "órgão não informado"}: ${truncar(objeto || "objeto não informado", 180)}`;

      const linhas: string[] = [truncar(objeto, 900)];
      const situacao = texto(c.situacaoCompraNome);
      if (situacao) linhas.push(`Situação no PNCP: ${situacao}.`);
      const de = formatarDataHora(c.dataAberturaProposta);
      const ate = formatarDataHora(c.dataEncerramentoProposta);
      if (de || ate) linhas.push(`Propostas${de ? ` de ${de}` : ""}${ate ? ` até ${ate}` : ""} (horário de Brasília).`);
      const valor = numero(c.valorTotalEstimado);
      if (valor !== null && valor > 0) linhas.push(`Valor total estimado: ${formatarMoedaBR(valor)}.`);
      const processo = texto(c.processo);
      if (processo) linhas.push(`Processo: ${processo}.`);
      const amparo = texto(c.amparoLegal?.nome);
      if (amparo) linhas.push(`Amparo legal: ${amparo}.`);
      const origem = urlOuNulo(c.linkSistemaOrigem);
      if (origem) linhas.push(`Sistema de origem: ${origem}`);
      const complemento = texto(c.informacaoComplementar);
      if (complemento) linhas.push(truncar(colapsarEspacos(complemento), 600));

      const local = localDoEdital(c);
      return {
        registro: "edital",
        id_na_fonte: controle,
        titulo,
        orgao,
        uf: local.uf,
        cidade: local.cidade,
        publicado_em: publicado,
        // Leilão eletrônico: a disputa abre quando o recebimento de propostas encerra.
        data_leilao: encerramento ?? abertura ?? extrairDataLeilao(analise.texto, publicado, agora()),
        url,
        // o sistema onde a disputa corre (linkSistemaOrigem); sem ele, o site citado no objeto ou no complemento
        site_leilao: origem ?? extrairSiteLeilao(analise.texto),
        resumo: linhas.join("\n"),
        // null (sem --detalhes): o núcleo mantém os arquivos já gravados.
        documentos: documentosDoPncp(bruto.arquivos),
      };
    },
  };
}

/** Instância registrada em base/fontes/index.ts (configuração pelo ambiente). */
export const pncp = criarConectorPncp();
