/**
 * Conector da Leilões Judiciais & Extrajudiciais (www.leiloesjudiciais.com.br), pela API pública
 * documentada (MCP sobre JSON-RPC 2.0, POST /api/mcp/messages). Opção 1 do catálogo de fontes.
 * NÃO usa o endpoint interno /core/api/get-lotes (opção 2).
 *
 * Como coleta: a ferramenta `search_leiloes` exige `query` e devolve no máximo 10 lotes por
 * chamada, sem paginação. Por isso a coleta varre UF × termos ("apartamento", "casa",
 * "terreno"...) com categoria "imoveis", junta os lotes por `lote_id` e espera um intervalo entre
 * as chamadas. Com --detalhes, também chama `get_leilao_details` para cada lote novo e confere a
 * foto de capa por HEAD. A varredura NÃO cobre a fonte inteira (capacidades.listaCompleta =
 * false): nada é marcado como removido por não ter aparecido.
 *
 * Situação legal (registrar e rever antes de produção):
 * - robots.txt (sonda de 11/10/2026): "Allow: /api/mcp/messages", "Allow: /api/openapi.json" e
 *   "Content-Signal: ai-train=no, search=yes, ai-input=yes" (o cabeçalho content-signal repete).
 *   ai-train=no: estes dados não podem ser usados para treinar modelos.
 * - Termos de uso do site NÃO foram lidos (rede bloqueada). Pedir autorização por escrito antes
 *   de produção (catálogo §3.2). Direito de imagem das fotos não confirmado: guardamos só a URL.
 *
 * Entrada local (--arquivo/--fixture), sem rede, em qualquer destes formatos:
 * - fixture: {"coletado_em": "...", "respostas": [<resposta JSON-RPC>, ...]};
 * - uma resposta JSON-RPC (ou uma lista delas), como o `curl` devolve; linhas que não são JSON
 *   depois do objeto (ex.: "HTTP 200 application/json" das sondas) são ignoradas;
 * - o JSON de dentro de `content[0].text` ({"results": [...]} ou {"details": {...}}).
 * Os dois últimos não trazem a data de coleta: informe com LUNETA_LJ_COLETADO_EM, senão o arquivo
 * é recusado (a data de modificação do arquivo não vale como data de coleta).
 */
import type { Conector, OpcoesColeta, Uf } from "../../tipos.ts";
import { UFS } from "../../tipos.ts";
import { lerArquivoTexto } from "../../util/arquivo.ts";
import { ErroHttp } from "../../util/http.ts";
import { ErroMcp, conteudoDaFerramenta, criarClienteMcp, SITE_LJ, URL_MCP, type ClienteMcp, type FerramentaMcp } from "./mcp.ts";
import { idDoLote, normalizarLote, urlGrande } from "./normalizar.ts";
import type { LoteColetado, LoteLJ } from "./tipos.ts";

export const ID_LEILOES_JUDICIAIS = "leiloesjudiciais_api";

/**
 * Termos da varredura. Ampliar aumenta a cobertura e o número de chamadas (UFs × termos).
 * Sem acento: a sonda de 11/10/2026 mostrou que "imovel" (sem acento) acha lotes; se a busca
 * diferencia acento não foi confirmado.
 */
export const TERMOS_PADRAO: readonly string[] = [
  "apartamento", "casa", "terreno", "lote", "sala", "loja", "galpao", "predio", "imovel", "fazenda", "sitio",
  "chacara", "area", "vaga", "direitos",
];

/** Teto de resultados por busca observado na sonda (totalResults: 10 em todas as buscas). */
export const TETO_POR_BUSCA = 10;

export const AVISO_LEGAL =
  "Leilões Judiciais: robots.txt com Content-Signal ai-train=no (não treinar modelos com estes dados); termos de uso não lidos; pedir autorização antes de produção.";

export interface ConfigLeiloesJudiciais {
  /** Termos de busca (padrão TERMOS_PADRAO; a variável LUNETA_LJ_TERMOS="a,b,c" sobrepõe). */
  termos?: readonly string[];
  /** UFs varridas quando a coleta não pede uma (padrão: as 27). */
  ufs?: readonly Uf[];
  /** Intervalo mínimo entre chamadas de ferramenta, em ms (padrão 3000; o cliente HTTP já impõe 2 s por host). */
  intervaloMs?: number;
  /** Teto de chamadas de ferramenta por coleta (padrão 1000). */
  maxChamadas?: number;
  /** Falhas transitórias (rede, timeout, 5xx, erro interno JSON-RPC) toleradas antes de desistir: max(3, fração × chamadas previstas). Padrão 0,1. */
  fracaoFalhasToleradas?: number;
  /**
   * Data de coleta de um arquivo local que não a declara (padrão: variável LUNETA_LJ_COLETADO_EM).
   * Sem ela, arquivo sem "coletado_em" é recusado.
   */
  coletadoEm?: string;
  /** Para testes: relógio e espera. */
  agora?: () => number;
  esperar?: (ms: number) => Promise<void>;
  url?: string;
}

/** Campos de pessoa que nunca entram (LGPD): usuário, apelido, e-mail, documento, IP, telefone, lances. */
const CAMPO_PESSOAL = /^(?:(?:nm|id|nu|ds|vl)_)?(?:usuario|apelido|email|e_mail|cpf|cnpj|cpfcnpj|cpf_cnpj|ip|telefone|celular|arrematante|licitante)$|^lances?$/i;

/** Cópia do lote sem campos pessoais (nm_usuario, id_usuario, lances...). Não altera o original. */
export function semCamposPessoais(lote: Record<string, unknown>): LoteLJ {
  const copia: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(lote)) if (!CAMPO_PESSOAL.test(chave)) copia[chave] = valor;
  return copia as LoteLJ;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Lotes de uma carga de ferramenta: busca ({results}), detalhe ({found, details}) ou lote solto.
 * Busca vazia: a sonda nunca mostrou uma; aceitamos `totalResults: 0` com `results` vazio,
 * ausente ou null. Qualquer outro formato é erro (a coleta para sem gravar).
 */
export function lotesDaCarga(carga: unknown): LoteLJ[] {
  if (Array.isArray(carga)) return carga.filter(ehObjeto).map(semCamposPessoais);
  if (!ehObjeto(carga)) throw new ErroMcp("formato", "carga da ferramenta não é objeto JSON.");
  if (Array.isArray(carga.results)) return carga.results.filter(ehObjeto).map(semCamposPessoais);
  if ((carga.totalResults === 0 || carga.totalResults === "0") && (carga.results === undefined || carga.results === null)) return [];
  if ("details" in carga || "found" in carga) {
    const detalhe = carga.details;
    return carga.found !== false && ehObjeto(detalhe) && idDoLote(detalhe.lote_id) ? [semCamposPessoais(detalhe)] : [];
  }
  if (idDoLote(carga.lote_id)) return [semCamposPessoais(carga)];
  throw new ErroMcp("formato", `formato desconhecido (chaves: ${Object.keys(carga).slice(0, 8).join(", ")}).`);
}

/** Lê o conteúdo de um arquivo local: devolve as cargas e a data de coleta declarada. */
export function interpretarArquivo(texto: string): { cargas: unknown[]; coletadoEm: string | null } {
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    // Sondas guardadas com o status HTTP numa linha depois do JSON.
    const linhas = texto.split(/\r?\n/).filter((l) => l.trimStart().startsWith("{") || l.trimStart().startsWith("["));
    const objetos: unknown[] = [];
    for (const linha of linhas) {
      try {
        objetos.push(JSON.parse(linha));
      } catch {
        // linha que só começa com "{": ignora
      }
    }
    if (objetos.length === 0) throw new Error("arquivo não contém JSON (esperado: resposta JSON-RPC, fixture ou {results}).");
    valor = objetos.length === 1 ? objetos[0] : objetos;
  }
  let coletadoEm: string | null = null;
  let respostas: unknown[];
  if (ehObjeto(valor) && Array.isArray(valor.respostas)) {
    respostas = valor.respostas;
    coletadoEm = typeof valor.coletado_em === "string" ? valor.coletado_em : null;
  } else respostas = Array.isArray(valor) ? valor : [valor];

  const cargas = respostas.map((resposta, i) => {
    if (ehObjeto(resposta) && resposta.jsonrpc === "2.0") {
      if (ehObjeto(resposta.error)) {
        throw new ErroMcp("jsonrpc", `resposta ${i + 1} do arquivo é um erro JSON-RPC: ${String(resposta.error.message ?? resposta.error.code)}`);
      }
      return conteudoDaFerramenta(resposta.result, `resposta ${i + 1}`);
    }
    return resposta;
  });
  return { cargas, coletadoEm };
}

function termosDaConfig(config: ConfigLeiloesJudiciais): readonly string[] {
  const ambiente = process.env.LUNETA_LJ_TERMOS;
  if (config.termos) return config.termos;
  if (ambiente) return ambiente.split(",").map((t) => t.trim()).filter(Boolean);
  return TERMOS_PADRAO;
}

/**
 * Falha que vale tentar a próxima busca: rede, timeout, HTTP 5xx depois das retentativas, erro
 * da própria ferramenta (isError) e erro JSON-RPC do servidor (-32603 "Internal error" e a faixa
 * -32000 a -32099, reservada a erros de implementação do servidor). Conta para o limite de falhas.
 * Parâmetro inválido (-32602), método inexistente (-32601) e resposta fora do formato não são
 * transitórios: a API mudou e a coleta para.
 */
export function ehTransitoria(erro: unknown): boolean {
  if (erro instanceof ErroHttp) return erro.motivo === "rede" || erro.motivo === "timeout" || (erro.motivo === "status" && (erro.status ?? 0) >= 500);
  if (!(erro instanceof ErroMcp)) return false;
  if (erro.tipo === "ferramenta") return true;
  const codigo = erro.codigo;
  return erro.tipo === "jsonrpc" && codigo !== null && (codigo === -32603 || (codigo <= -32000 && codigo >= -32099));
}

/** A ferramenta existe e ainda tem o parâmetro? `mudou` = existe, mas sem o parâmetro. */
function conferirFerramenta(ferramentas: readonly FerramentaMcp[], nome: string, parametro: string): "ok" | "ausente" | "mudou" {
  const f = ferramentas.find((t) => t.name === nome);
  if (!f) return "ausente";
  return f.inputSchema?.properties && !(parametro in f.inputSchema.properties) ? "mudou" : "ok";
}

/** Data de coleta de um arquivo local: ISO válida e não no futuro (com folga de 10 min para relógio). */
function dataDeColeta(valor: string, agora: number, deOnde: string): string {
  const t = Date.parse(valor);
  if (Number.isNaN(t)) throw new Error(`${deOnde}: data inválida (${JSON.stringify(valor)}); use ISO, ex.: 2026-10-11T01:35:00Z.`);
  if (t > agora + 10 * 60 * 1000) throw new Error(`${deOnde}: ${valor} está no futuro; um arquivo assim sobrescreveria coletas reais.`);
  return new Date(t).toISOString();
}

/** Cria o conector (a configuração serve para testes e ajustes de ritmo). */
export function criarConectorLeiloesJudiciais(config: ConfigLeiloesJudiciais = {}): Conector<LoteColetado> {
  const agora = config.agora ?? Date.now;
  const esperar = config.esperar ?? ((ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms)));
  const intervaloMs = config.intervaloMs ?? 3000;
  const maxChamadas = config.maxChamadas ?? 1000;
  const fracaoFalhas = config.fracaoFalhasToleradas ?? 0.1;

  async function* doArquivo(op: OpcoesColeta, arquivo: string): AsyncGenerator<LoteColetado> {
    const { cargas, coletadoEm: declarado } = interpretarArquivo(await lerArquivoTexto(arquivo, "utf-8"));
    // Formato primeiro (erro mais útil), depois a data.
    const lotesPorCarga = cargas.map(lotesDaCarga);
    // A data de coleta decide o que já fechou e protege dados mais novos (o núcleo recusa um
    // arquivo mais antigo que o gravado). A data de modificação do arquivo NÃO serve: copiar ou
    // tocar uma resposta antiga a faria passar por nova. Sem data declarada, o arquivo é recusado.
    const explicita = config.coletadoEm ?? process.env.LUNETA_LJ_COLETADO_EM ?? null;
    let coletadoEm: string;
    if (declarado !== null) coletadoEm = dataDeColeta(declarado, agora(), `"coletado_em" de ${arquivo}`);
    else if (explicita) coletadoEm = dataDeColeta(explicita, agora(), "LUNETA_LJ_COLETADO_EM");
    else {
      throw new Error(
        `${arquivo} não declara quando a resposta foi coletada. Use o formato da fixture ({"coletado_em": "...", "respostas": [...]}) ` +
          `ou informe a data: LUNETA_LJ_COLETADO_EM=2026-10-11T01:35:00Z. A data de modificação do arquivo não é usada.`,
      );
    }
    op.informar({ origem: arquivo, geradoEm: coletadoEm });
    const vistos = new Set<string>();
    let entregues = 0;
    for (const lotes of lotesPorCarga) {
      for (const lote of lotes) {
        const id = idDoLote(lote.lote_id);
        if (id) {
          if (vistos.has(id)) continue;
          vistos.add(id);
        }
        yield { lote, coletado_em: coletadoEm, consulta: null };
        entregues++;
        if (op.limite && entregues >= op.limite) return;
      }
    }
  }

  async function* daRede(op: OpcoesColeta): AsyncGenerator<LoteColetado> {
    op.log(AVISO_LEGAL);
    // A "geração" de uma varredura é o seu início: um arquivo ou varredura mais antigos não sobrescrevem esta.
    const inicio = new Date(agora()).toISOString();
    const mcp: ClienteMcp = criarClienteMcp(op.http, { url: config.url ?? URL_MCP, sinal: op.sinal });
    const info = await mcp.inicializar();
    op.log(`MCP: ${info.nome ?? "servidor sem nome"} ${info.versao ?? ""}, protocolo ${info.protocolo ?? "?"}`);
    const ferramentas = await mcp.listarFerramentas();
    const busca = conferirFerramenta(ferramentas, "search_leiloes", "query");
    if (busca === "ausente") throw new ErroMcp("formato", "a API não oferece mais search_leiloes: revise o conector.");
    if (busca === "mudou") throw new ErroMcp("formato", `search_leiloes não tem mais o parâmetro "query": a API mudou, revise o conector.`);
    // get_leilao_details só importa com --detalhes; sem ela (ou com o parâmetro trocado), a
    // coleta segue só com a busca e avisa.
    let temDetalhe = false;
    if (op.detalhes) {
      const detalhe = conferirFerramenta(ferramentas, "get_leilao_details", "leilaoId");
      temDetalhe = detalhe === "ok";
      if (detalhe === "ausente") op.informar({ aviso: "get_leilao_details indisponível: coleta sem detalhes." });
      if (detalhe === "mudou") {
        op.informar({ aviso: `get_leilao_details não tem mais o parâmetro "leilaoId" (a API mudou, revise o conector): coleta sem detalhes.` });
      }
    }

    op.informar({ origem: URL_MCP, geradoEm: inicio });

    const ufs: readonly Uf[] = op.uf ? [op.uf] : (config.ufs ?? UFS);
    const termos = termosDaConfig(config);
    const previstas = ufs.length * termos.length;
    const maxFalhas = Math.max(3, Math.ceil(previstas * fracaoFalhas));
    let chamadas = 0;
    let falhas = 0;
    let seguidas = 0;
    let saturadas = 0;
    let buscas = 0;
    let ultima = Number.NEGATIVE_INFINITY;
    const vistos = new Set<string>();
    let entregues = 0;

    /** Chama uma ferramenta respeitando o intervalo; `undefined` = falha transitória tolerada. */
    const chamar = async (nome: string, argumentos: Record<string, unknown>, rotulo: string): Promise<unknown> => {
      if (chamadas >= maxChamadas) throw new Error(`teto de ${maxChamadas} chamadas atingido`);
      if (op.sinal?.aborted) throw new Error("Coleta cancelada.");
      // O intervalo conta do FIM da chamada anterior (inclui a espera do próprio cliente HTTP).
      const espera = ultima + intervaloMs - agora();
      if (espera > 0) await esperar(espera);
      chamadas++;
      try {
        const carga = await mcp.chamar(nome, argumentos);
        seguidas = 0;
        return carga;
      } catch (erro) {
        if (!ehTransitoria(erro)) throw erro;
        falhas++;
        seguidas++;
        const mensagem = (erro as Error).message;
        op.log(`${rotulo}: falha transitória (${mensagem})`);
        if (seguidas >= 3) throw new Error(`3 falhas seguidas na API (última: ${mensagem}); coleta interrompida sem gravar.`, { cause: erro });
        if (falhas > maxFalhas) throw new Error(`${falhas} falhas na API (limite ${maxFalhas}); coleta interrompida sem gravar.`, { cause: erro });
        op.informar({ aviso: `${rotulo}: ${mensagem}` });
        return undefined;
      } finally {
        ultima = agora();
      }
    };

    /** HEAD na capa grande (S3 da fonte). Se o robots do S3 não puder ser lido, desliga a verificação. */
    let verificarFotos = true;
    const verificarCapa = async (lote: LoteLJ): Promise<LoteColetado["capa"]> => {
      const primeira = Array.isArray(lote.fotos) ? lote.fotos.find((f) => ehObjeto(f)) : undefined;
      const url = primeira ? urlGrande(primeira) : null;
      if (!url) return null;
      try {
        return { url, status: await op.http.verificar(url, { sinal: op.sinal }), em: new Date(agora()).toISOString() };
      } catch (erro) {
        if (erro instanceof ErroHttp && erro.motivo === "cancelado") throw erro;
        verificarFotos = false;
        op.informar({ aviso: `Verificação de fotos desligada nesta coleta: ${(erro as Error).message}` });
        return null;
      }
    };

    varredura: for (const uf of ufs) {
      for (const termo of termos) {
        if (chamadas >= maxChamadas) {
          op.informar({ aviso: `Teto de ${maxChamadas} chamadas atingido; varredura incompleta.` });
          break varredura;
        }
        const rotulo = `${termo}@${uf}`;
        const carga = await chamar("search_leiloes", { query: termo, estado: uf, categoria: "imoveis" }, `busca ${rotulo}`);
        if (carga === undefined) continue;
        buscas++;
        const lotes = lotesDaCarga(carga);
        if (lotes.length >= TETO_POR_BUSCA) saturadas++;
        op.log(`busca ${rotulo}: ${lotes.length} lote(s)`);
        for (const encontrado of lotes) {
          const id = idDoLote(encontrado.lote_id);
          if (id) {
            if (vistos.has(id)) continue;
            vistos.add(id);
          }
          let lote = encontrado;
          let detalhado = false;
          let capa: LoteColetado["capa"] = null;
          if (op.detalhes && id) {
            if (temDetalhe && chamadas < maxChamadas) {
              const detalhe = await chamar("get_leilao_details", { leilaoId: id }, `detalhe ${id}`);
              let completo: LoteLJ | undefined;
              try {
                completo = detalhe === undefined ? undefined : lotesDaCarga(detalhe)[0];
              } catch (erro) {
                // O formato do detalhe não foi confirmado (sonda truncada): sem ele, segue a busca.
                op.informar({ aviso: `detalhe ${id} fora do formato esperado (${(erro as Error).message}); usei só a busca.` });
              }
              // A ferramenta aceita id de leilão ou de lote: só vale o detalhe do MESMO lote.
              if (completo && idDoLote(completo.lote_id) === id) {
                lote = mesclar(lote, completo);
                detalhado = true;
              }
            }
            capa = verificarFotos ? await verificarCapa(lote) : null;
          }
          yield { lote, coletado_em: new Date(agora()).toISOString(), consulta: rotulo, detalhado, capa };
          entregues++;
          if (op.limite && entregues >= op.limite) return;
        }
      }
    }
    if (buscas === 0) throw new Error("nenhuma busca respondeu; nada a gravar.");
    if (saturadas > 0) {
      op.informar({
        aviso: `${saturadas} de ${buscas} buscas vieram com ${TETO_POR_BUSCA} lotes (o teto da API): a varredura é parcial (${vistos.size} lotes distintos).`,
      });
    }
    if (falhas > 0) op.informar({ aviso: `${falhas} chamada(s) falharam e foram puladas.` });
  }

  return {
    id: ID_LEILOES_JUDICIAIS,
    nome: "Leilões Judiciais & Extrajudiciais (API MCP pública)",
    tipo: "agregador",
    acesso: "api_documentada",
    finalidade: "vitrine",
    url: SITE_LJ,
    capacidades: { fotos: true, documentos: true, ocupacao: false, listaCompleta: false },
    coletar(op) {
      return op.arquivo ? doArquivo(op, op.arquivo) : daRede(op);
    },
    normalizar: normalizarLote,
  };
}

/** Junta o detalhe ao lote da busca: vale o detalhe, menos campos vazios e listas vazias. */
export function mesclar(base: LoteLJ, detalhe: LoteLJ): LoteLJ {
  const saida: Record<string, unknown> = { ...base };
  for (const [chave, valor] of Object.entries(detalhe)) {
    if (valor === null || valor === undefined || valor === "") continue;
    const atual = saida[chave];
    if (Array.isArray(valor) && valor.length === 0 && Array.isArray(atual) && atual.length > 0) continue;
    saida[chave] = valor;
  }
  return saida as LoteLJ;
}

export const leiloesJudiciais: Conector<LoteColetado> = criarConectorLeiloesJudiciais();
