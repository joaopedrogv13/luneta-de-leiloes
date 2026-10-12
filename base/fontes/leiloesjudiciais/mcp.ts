/**
 * Cliente MCP (JSON-RPC 2.0 sobre HTTP) da API pública da Leilões Judiciais.
 *
 * Documentação da própria fonte (GET /api/openapi.json, sonda de 11/10/2026): "API pública para
 * consulta e busca de lotes de leilões no Brasil. Acesso público, sem autenticação"; o endpoint
 * POST /api/mcp/messages aceita initialize, tools/list e tools/call e é "a via recomendada" para
 * integração programática. O robots.txt libera explicitamente /api/mcp/messages.
 *
 * Toda requisição passa pelo cliente HTTP educado do núcleo (User-Agent identificado, robots,
 * timeout, retentativas, intervalo por host, limite de tamanho). A resposta é validada antes de
 * ser usada: tem de ser JSON-RPC 2.0 com o mesmo id (uma página de desafio do Cloudflare ou HTML
 * de erro vira erro de conteúdo e a coleta para sem gravar nada).
 *
 * Formato da resposta de tools/call: `result.content[0].text` é um JSON dentro de uma string,
 * então o parse é feito duas vezes. Aceitamos também resposta em SSE (text/event-stream), que o
 * transporte "Streamable HTTP" do MCP permite, embora a sonda só tenha visto application/json.
 */
import { ErroHttp, type ClienteHttp } from "../../util/http.ts";

export const SITE_LJ = "https://www.leiloesjudiciais.com.br";
export const URL_MCP = `${SITE_LJ}/api/mcp/messages`;
/** Versão do protocolo que a fonte anunciou no initialize da sonda de 11/10/2026. */
export const VERSAO_PROTOCOLO = "2025-03-26";

export type TipoErroMcp = "jsonrpc" | "ferramenta" | "formato";

/** Erro do protocolo: JSON-RPC com `error`, ferramenta com `isError` ou resposta fora do formato. */
export class ErroMcp extends Error {
  readonly tipo: TipoErroMcp;
  /** Código JSON-RPC (ex.: -32602 = parâmetros inválidos), quando houver. */
  readonly codigo: number | null;

  constructor(tipo: TipoErroMcp, mensagem: string, codigo: number | null = null) {
    super(mensagem);
    this.name = "ErroMcp";
    this.tipo = tipo;
    this.codigo = codigo;
  }
}

export interface InfoServidor {
  nome: string | null;
  versao: string | null;
  protocolo: string | null;
}

export interface FerramentaMcp {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, unknown>; required?: string[] };
}

export interface ClienteMcp {
  inicializar(): Promise<InfoServidor>;
  listarFerramentas(): Promise<FerramentaMcp[]>;
  /** tools/call; devolve o JSON que vem dentro de `result.content[0].text`, já interpretado. */
  chamar(nome: string, argumentos: Record<string, unknown>): Promise<unknown>;
}

export interface OpcoesClienteMcp {
  url?: string;
  sinal?: AbortSignal;
}

interface MensagemRpc {
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
  error?: { code?: unknown; message?: unknown } | null;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Mensagens JSON de um corpo SSE ("data: {...}" por evento, eventos separados por linha em branco). */
function mensagensSse(texto: string): unknown[] {
  const mensagens: unknown[] = [];
  for (const evento of texto.split(/\r?\n\r?\n/)) {
    const dados = evento
      .split(/\r?\n/)
      .filter((linha) => linha.startsWith("data:"))
      .map((linha) => linha.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!dados.trim()) continue;
    try {
      mensagens.push(JSON.parse(dados));
    } catch {
      // evento que não é JSON (comentário, ping): ignora
    }
  }
  return mensagens;
}

/**
 * Acha a mensagem JSON-RPC 2.0 com o `id` pedido num corpo JSON (objeto ou lote) ou SSE.
 * Devolve `null` se não houver (corpo HTML, JSON de outro formato, id diferente).
 */
export function acharRespostaRpc(corpo: string, tipoConteudo: string | null, id: number): MensagemRpc | null {
  let candidatos: unknown[];
  if (/text\/event-stream/i.test(tipoConteudo ?? "") || /^\s*(event|data|id|retry):/m.test(corpo.slice(0, 200))) {
    candidatos = mensagensSse(corpo);
  } else {
    try {
      const valor: unknown = JSON.parse(corpo);
      candidatos = Array.isArray(valor) ? valor : [valor];
    } catch {
      return null;
    }
  }
  for (const c of candidatos) {
    if (ehObjeto(c) && c.jsonrpc === "2.0" && c.id === id && ("result" in c || "error" in c)) return c as MensagemRpc;
  }
  return null;
}

/**
 * Interpreta o `result` de um tools/call: `content[0].text` com JSON dentro. Lança ErroMcp
 * "ferramenta" se `isError` vier marcado e "formato" se o conteúdo não for o esperado.
 */
export function conteudoDaFerramenta(resultado: unknown, nome = "ferramenta"): unknown {
  if (!ehObjeto(resultado)) throw new ErroMcp("formato", `${nome}: result ausente ou fora do formato.`);
  const conteudo = resultado.content;
  const primeiro = Array.isArray(conteudo) ? conteudo.find((c) => ehObjeto(c) && c.type === "text") : undefined;
  const texto = ehObjeto(primeiro) && typeof primeiro.text === "string" ? primeiro.text : null;
  if (resultado.isError === true) {
    throw new ErroMcp("ferramenta", `${nome} devolveu erro: ${(texto ?? "sem mensagem").slice(0, 200)}`);
  }
  if (texto === null) throw new ErroMcp("formato", `${nome}: result.content[0].text ausente.`);
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new ErroMcp("formato", `${nome}: content[0].text não é JSON (começa com ${JSON.stringify(texto.slice(0, 60))}).`);
  }
}

/** Cliente MCP por cima do cliente HTTP educado do núcleo. */
export function criarClienteMcp(http: ClienteHttp, opcoes: OpcoesClienteMcp = {}): ClienteMcp {
  const url = opcoes.url ?? URL_MCP;
  let proximoId = 1;
  let sessao: string | null = null;

  async function rpc(metodo: string, parametros: Record<string, unknown>): Promise<{ resultado: unknown; cabecalhos: Headers }> {
    const id = proximoId++;
    let mensagem: MensagemRpc | null = null;
    const cabecalhos: Record<string, string> = {
      "content-type": "application/json",
      // O transporte Streamable HTTP do MCP pede que o cliente aceite os dois formatos.
      accept: "application/json, text/event-stream",
    };
    if (sessao) cabecalhos["mcp-session-id"] = sessao;
    const resposta = await http.requisitar(url, {
      metodo: "POST",
      corpo: JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params: parametros }),
      cabecalhos,
      codificacao: "utf-8",
      sinal: opcoes.sinal,
      validar: (r) => {
        mensagem = acharRespostaRpc(r.texto, r.cabecalhos.get("content-type"), id);
        if (mensagem) return null;
        const tipo = r.cabecalhos.get("content-type") ?? "sem content-type";
        return `resposta não é JSON-RPC 2.0 com id ${id} (${tipo}; começa com ${JSON.stringify(r.texto.slice(0, 80))}). Página de bloqueio ou formato novo?`;
      },
    });
    const m = mensagem as MensagemRpc | null;
    if (!m) throw new ErroHttp("conteudo", url, "resposta JSON-RPC ausente", resposta.status, resposta.tentativas);
    if (m.error) {
      const codigo = typeof m.error.code === "number" ? m.error.code : null;
      const texto = typeof m.error.message === "string" ? m.error.message : "erro sem mensagem";
      throw new ErroMcp("jsonrpc", `${metodo}: erro JSON-RPC ${codigo ?? "?"}: ${texto.slice(0, 200)}`, codigo);
    }
    return { resultado: m.result, cabecalhos: resposta.cabecalhos };
  }

  return {
    async inicializar() {
      const { resultado, cabecalhos } = await rpc("initialize", {
        protocolVersion: VERSAO_PROTOCOLO,
        capabilities: {},
        clientInfo: { name: "LunetaDeLeiloes", version: "0.1" },
      });
      // Sessão é opcional no MCP; a sonda não mostrou o cabeçalho, mas, se vier, mandamos de volta.
      sessao = cabecalhos.get("mcp-session-id");
      if (!ehObjeto(resultado)) throw new ErroMcp("formato", "initialize: result ausente.");
      const servidor = ehObjeto(resultado.serverInfo) ? resultado.serverInfo : {};
      return {
        nome: typeof servidor.name === "string" ? servidor.name : null,
        versao: typeof servidor.version === "string" ? servidor.version : null,
        protocolo: typeof resultado.protocolVersion === "string" ? resultado.protocolVersion : null,
      };
    },
    async listarFerramentas() {
      const { resultado } = await rpc("tools/list", {});
      if (!ehObjeto(resultado) || !Array.isArray(resultado.tools)) throw new ErroMcp("formato", "tools/list: lista de ferramentas ausente.");
      return resultado.tools.filter((t): t is FerramentaMcp => ehObjeto(t) && typeof t.name === "string");
    },
    async chamar(nome, argumentos) {
      const { resultado } = await rpc("tools/call", { name: nome, arguments: argumentos });
      return conteudoDaFerramenta(resultado, nome);
    },
  };
}
