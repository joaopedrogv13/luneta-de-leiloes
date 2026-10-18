/**
 * Cliente HTTP "educado" para os conectores. Toda requisição de coleta passa por aqui:
 * - User-Agent identificado ("LunetaDeLeiloes/0.1 (+contato)"; troque com LUNETA_USER_AGENT);
 * - timeout por tentativa e cancelamento externo;
 * - retentativas com espera exponencial (rede, timeout, 408/425/429/5xx), respeitando Retry-After;
 * - intervalo mínimo entre requisições ao mesmo host (Crawl-delay do robots.txt alonga);
 * - checagem de robots.txt (RFC 9309) antes de cada URL;
 * - limite de tamanho da resposta e validação do conteúdo antes de devolver.
 *
 * Não envia cookies nem credenciais e não tenta contornar anti-robô: se a fonte devolver
 * desafio ou bloqueio, a validação falha e a coleta para sem gravar nada.
 */
import { decodificar, type Codificacao } from "./arquivo.ts";
import { analisarRobots, grupoPara, robotsPermite, type GrupoRobots } from "./robots.ts";

export const USER_AGENT_PADRAO = "LunetaDeLeiloes/0.1 (+contato)";
/** Nome do robô para casar com grupos "User-agent:" do robots.txt. */
export const TOKEN_ROBOTS = "LunetaDeLeiloes";

const STATUS_RETENTAVEIS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface ConfigHttp {
  userAgent?: string;
  /** Tempo máximo de cada tentativa, incluindo a leitura do corpo. Padrão 30 s. */
  timeoutMs?: number;
  /** Total de tentativas por requisição (1 = sem retentativa). Padrão 3. */
  tentativas?: number;
  /** Espera antes da 2ª tentativa; dobra a cada nova tentativa. Padrão 2 s. */
  esperaBaseMs?: number;
  /** Teto de espera entre tentativas, inclusive vindo de Retry-After. Padrão 60 s. */
  esperaMaxMs?: number;
  /** Intervalo mínimo entre inícios de requisição ao mesmo host. Padrão 2 s. */
  intervaloMinimoMs?: number;
  /** Consultar robots.txt antes de cada URL. Padrão true. */
  respeitarRobots?: boolean;
  /** Tamanho máximo do corpo. Padrão 100 MiB. */
  tamanhoMaximoBytes?: number;
  /** Para testes: implementação de fetch, relógio e espera. */
  fetch?: typeof fetch;
  agora?: () => number;
  esperar?: (ms: number) => Promise<void>;
  log?: (mensagem: string) => void;
}

export interface OpcoesRequisicao {
  metodo?: "GET" | "POST" | "HEAD";
  cabecalhos?: Record<string, string>;
  corpo?: string;
  /** Decodificação do corpo. "auto" (padrão) usa o charset do Content-Type e cai para UTF-8/CP1252. */
  codificacao?: Codificacao;
  /** Sobrepõe a configuração do cliente (ex.: false para API documentada fora do escopo de robots). */
  respeitarRobots?: boolean;
  /** Status aceitos como sucesso. Padrão: 200 a 299. */
  aceitarStatus?: (status: number) => boolean;
  /** Validação do conteúdo: devolva o motivo da recusa, ou null se estiver bom. Recusa não é retentada. */
  validar?: (resposta: RespostaHttp) => string | null;
  /** Tempo máximo desta requisição, por tentativa e com o corpo (ex.: arquivo grande). Padrão: o do cliente. */
  timeoutMs?: number;
  sinal?: AbortSignal;
}

export interface RespostaHttp {
  /** URL final, depois de redirecionamentos. */
  url: string;
  status: number;
  cabecalhos: Headers;
  bytes: Uint8Array;
  texto: string;
  tentativas: number;
}

export type MotivoErroHttp = "rede" | "timeout" | "status" | "robots" | "conteudo" | "tamanho" | "cancelado" | "url";

export class ErroHttp extends Error {
  readonly motivo: MotivoErroHttp;
  readonly url: string;
  readonly status: number | null;
  readonly tentativas: number;

  constructor(motivo: MotivoErroHttp, url: string, mensagem: string, status: number | null = null, tentativas = 0) {
    super(mensagem);
    this.name = "ErroHttp";
    this.motivo = motivo;
    this.url = url;
    this.status = status;
    this.tentativas = tentativas;
  }
}

export interface ClienteHttp {
  readonly userAgent: string;
  requisitar(url: string, opcoes?: OpcoesRequisicao): Promise<RespostaHttp>;
  /** GET e devolve o texto. */
  texto(url: string, opcoes?: OpcoesRequisicao): Promise<string>;
  /** GET (ou POST com `corpo`) e interpreta JSON; erro de sintaxe vira ErroHttp "conteudo". */
  json<T = unknown>(url: string, opcoes?: OpcoesRequisicao): Promise<T>;
  /** O robots.txt do host permite esta URL? */
  permitido(url: string): Promise<boolean>;
  /**
   * HEAD para conferir se a URL responde (ex.: foto montada por padrão). Devolve o status, ou
   * null em erro de rede. Não lança por status 4xx/5xx.
   */
  verificar(url: string, opcoes?: Pick<OpcoesRequisicao, "respeitarRobots" | "sinal">): Promise<number | null>;
}

type EstadoRobots = { tipo: "regras"; grupo: GrupoRobots } | { tipo: "tudo" } | { tipo: "nada"; motivo: string };

function esperarPadrao(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Retry-After em segundos ou data HTTP; `null` se ausente ou inválido. */
export function lerRetryAfter(valor: string | null, agora: number): number | null {
  if (!valor) return null;
  const texto = valor.trim();
  if (/^\d+$/.test(texto)) return Number(texto) * 1000;
  const data = Date.parse(texto);
  return Number.isNaN(data) ? null : Math.max(0, data - agora);
}

function codificacaoDoCabecalho(tipo: string | null): Codificacao {
  const charset = /charset\s*=\s*"?([\w-]+)/i.exec(tipo ?? "")?.[1]?.toLowerCase();
  if (!charset) return "auto";
  if (["iso-8859-1", "latin1", "latin-1", "windows-1252", "cp1252", "us-ascii"].includes(charset)) return "windows-1252";
  if (charset === "utf-8" || charset === "utf8") return "utf-8";
  return "auto";
}

/**
 * O motivo de baixo do "fetch failed" (o fetch do Node esconde em `cause`): " (ENOTFOUND)", " (ECONNREFUSED)",
 * " (UNABLE_TO_VERIFY_LEAF_SIGNATURE)"... Sem ele, falta de internet e certificado não reconhecido parecem iguais.
 */
export function causaDoErro(erro: unknown): string {
  const causa = (erro as { cause?: unknown } | null)?.cause as { code?: unknown; message?: unknown } | undefined;
  if (!causa) return "";
  if (typeof causa.code === "string" && causa.code) return ` (${causa.code})`;
  return typeof causa.message === "string" && causa.message ? ` (${causa.message.slice(0, 120)})` : "";
}

async function lerCorpo(resposta: Response, maximo: number, url: string): Promise<Uint8Array> {
  const declarado = Number(resposta.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > maximo) {
    await resposta.body?.cancel().catch(() => undefined);
    throw new ErroHttp("tamanho", url, `Resposta de ${declarado} bytes passa do limite de ${maximo}.`, resposta.status);
  }
  if (!resposta.body) return new Uint8Array(0);
  const leitor = resposta.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximo) {
      await leitor.cancel().catch(() => undefined);
      throw new ErroHttp("tamanho", url, `Resposta passou do limite de ${maximo} bytes.`, resposta.status);
    }
    partes.push(value);
  }
  const saida = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    saida.set(parte, posicao);
    posicao += parte.byteLength;
  }
  return saida;
}

export function criarClienteHttp(config: ConfigHttp = {}): ClienteHttp {
  const userAgent = config.userAgent ?? process.env.LUNETA_USER_AGENT ?? USER_AGENT_PADRAO;
  const timeoutMs = config.timeoutMs ?? 30_000;
  const tentativas = Math.max(1, config.tentativas ?? 3);
  const esperaBaseMs = config.esperaBaseMs ?? 2_000;
  const esperaMaxMs = config.esperaMaxMs ?? 60_000;
  const intervaloMinimoMs = config.intervaloMinimoMs ?? 2_000;
  const respeitarRobotsPadrao = config.respeitarRobots ?? true;
  const tamanhoMaximo = config.tamanhoMaximoBytes ?? 100 * 1024 * 1024;
  const fazerFetch = config.fetch ?? fetch;
  const agora = config.agora ?? Date.now;
  const esperar = config.esperar ?? esperarPadrao;
  const log = config.log ?? (() => undefined);

  const filas = new Map<string, Promise<void>>();
  const proximaVez = new Map<string, number>();
  const intervaloDoHost = new Map<string, number>();
  const robotsPorOrigem = new Map<string, Promise<EstadoRobots>>();

  /** Espera a vez do host, respeitando o intervalo mínimo entre inícios de requisição. */
  async function vez(host: string): Promise<void> {
    const anterior = filas.get(host) ?? Promise.resolve();
    let liberar: () => void = () => undefined;
    const minha = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    const fila = anterior.then(() => minha);
    filas.set(host, fila);
    await anterior;
    try {
      const espera = (proximaVez.get(host) ?? 0) - agora();
      if (espera > 0) await esperar(espera);
      proximaVez.set(host, agora() + (intervaloDoHost.get(host) ?? intervaloMinimoMs));
    } finally {
      liberar();
      if (filas.get(host) === fila) filas.delete(host);
    }
  }

  function esperaDaTentativa(tentativa: number, retryAfter: number | null): number {
    if (retryAfter !== null) return Math.min(esperaMaxMs, retryAfter);
    const base = esperaBaseMs * 2 ** (tentativa - 1);
    return Math.min(esperaMaxMs, Math.round(base * (0.8 + Math.random() * 0.4)));
  }

  /** Uma requisição com retentativas, sem checar robots. */
  async function bruta(url: string, opcoes: OpcoesRequisicao): Promise<RespostaHttp> {
    const alvo = new URL(url);
    const metodo = opcoes.metodo ?? (opcoes.corpo !== undefined ? "POST" : "GET");
    const aceitar = opcoes.aceitarStatus ?? ((s: number) => s >= 200 && s < 300);
    const limiteMs = opcoes.timeoutMs !== undefined && opcoes.timeoutMs > 0 ? opcoes.timeoutMs : timeoutMs;
    const cabecalhos: Record<string, string> = {
      "user-agent": userAgent,
      accept: "*/*",
      "accept-language": "pt-BR,pt;q=0.9",
      ...Object.fromEntries(Object.entries(opcoes.cabecalhos ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
    };
    let ultimoErro: ErroHttp | null = null;
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      if (opcoes.sinal?.aborted) throw new ErroHttp("cancelado", url, "Coleta cancelada.", null, tentativa - 1);
      await vez(alvo.host);
      const inicio = agora();
      // Temporizador próprio (não o AbortSignal.timeout, que não segura o processo vivo).
      const limite = new AbortController();
      const temporizador = setTimeout(() => limite.abort(), limiteMs);
      const sinal = opcoes.sinal ? AbortSignal.any([limite.signal, opcoes.sinal]) : limite.signal;
      let retryAfter: number | null = null;
      try {
        const resposta = await fazerFetch(url, {
          method: metodo,
          headers: cabecalhos,
          body: opcoes.corpo,
          signal: sinal,
          redirect: "follow",
          credentials: "omit",
        });
        const status = resposta.status;
        if (STATUS_RETENTAVEIS.has(status) && tentativa < tentativas) {
          retryAfter = lerRetryAfter(resposta.headers.get("retry-after"), agora());
          await resposta.body?.cancel().catch(() => undefined);
          log(`${metodo} ${url} → HTTP ${status}; nova tentativa`);
          ultimoErro = new ErroHttp("status", url, `HTTP ${status}`, status, tentativa);
          await esperar(esperaDaTentativa(tentativa, retryAfter));
          continue;
        }
        if (!aceitar(status)) {
          await resposta.body?.cancel().catch(() => undefined);
          throw new ErroHttp("status", url, `HTTP ${status} em ${url}`, status, tentativa);
        }
        const bytes = metodo === "HEAD" ? new Uint8Array(0) : await lerCorpo(resposta, tamanhoMaximo, url);
        const codificacao = opcoes.codificacao && opcoes.codificacao !== "auto"
          ? opcoes.codificacao
          : codificacaoDoCabecalho(resposta.headers.get("content-type"));
        const saida: RespostaHttp = {
          url: resposta.url || url,
          status,
          cabecalhos: resposta.headers,
          bytes,
          texto: decodificar(bytes, codificacao),
          tentativas: tentativa,
        };
        log(`${metodo} ${url} → HTTP ${status}, ${bytes.byteLength} bytes, ${agora() - inicio} ms`);
        const recusa = opcoes.validar?.(saida) ?? null;
        if (recusa) throw new ErroHttp("conteudo", url, `Conteúdo recusado em ${url}: ${recusa}`, status, tentativa);
        return saida;
      } catch (erro) {
        if (erro instanceof ErroHttp) throw erro;
        if (opcoes.sinal?.aborted) throw new ErroHttp("cancelado", url, "Coleta cancelada.", null, tentativa);
        const timeout = limite.signal.aborted;
        const descricao = timeout ? `tempo esgotado (${limiteMs} ms)` : `falha de rede: ${(erro as Error).message}${causaDoErro(erro)}`;
        ultimoErro = new ErroHttp(timeout ? "timeout" : "rede", url, `${descricao} em ${url}`, null, tentativa);
        log(`${metodo} ${url} → ${descricao}`);
        if (tentativa < tentativas) await esperar(esperaDaTentativa(tentativa, null));
      } finally {
        clearTimeout(temporizador);
      }
    }
    throw ultimoErro ?? new ErroHttp("rede", url, `Falha em ${url}`, null, tentativas);
  }

  async function carregarRobots(origem: string): Promise<EstadoRobots> {
    const url = `${origem}/robots.txt`;
    try {
      const resposta = await bruta(url, {
        aceitarStatus: () => true,
        codificacao: "utf-8",
        cabecalhos: { accept: "text/plain,*/*;q=0.5" },
      });
      if (resposta.status >= 200 && resposta.status < 300) {
        const robots = analisarRobots(resposta.texto.slice(0, 512 * 1024));
        const grupo = grupoPara(robots, TOKEN_ROBOTS);
        if (grupo.crawlDelay !== null) {
          const host = new URL(origem).host;
          intervaloDoHost.set(host, Math.max(intervaloMinimoMs, Math.min(grupo.crawlDelay, 120) * 1000));
        }
        return { tipo: "regras", grupo };
      }
      if (resposta.status >= 400 && resposta.status < 500) return { tipo: "tudo" };
      return { tipo: "nada", motivo: `robots.txt respondeu HTTP ${resposta.status}` };
    } catch (erro) {
      return { tipo: "nada", motivo: `robots.txt inacessível (${(erro as Error).message})` };
    }
  }

  async function estadoRobots(url: string): Promise<EstadoRobots> {
    const origem = new URL(url).origin;
    let estado = robotsPorOrigem.get(origem);
    if (!estado) {
      estado = carregarRobots(origem);
      robotsPorOrigem.set(origem, estado);
    }
    return estado;
  }

  async function permitido(url: string): Promise<boolean> {
    const estado = await estadoRobots(url);
    if (estado.tipo === "tudo") return true;
    if (estado.tipo === "nada") return false;
    const alvo = new URL(url);
    return robotsPermite(estado.grupo, alvo.pathname + alvo.search);
  }

  function validarUrl(url: string): void {
    let alvo: URL;
    try {
      alvo = new URL(url);
    } catch {
      throw new ErroHttp("url", url, `URL inválida: ${url}`);
    }
    if (alvo.protocol !== "https:" && alvo.protocol !== "http:") throw new ErroHttp("url", url, `Protocolo não suportado: ${url}`);
  }

  async function requisitar(url: string, opcoes: OpcoesRequisicao = {}): Promise<RespostaHttp> {
    validarUrl(url);
    if (opcoes.respeitarRobots ?? respeitarRobotsPadrao) {
      const estado = await estadoRobots(url);
      if (estado.tipo === "nada") {
        throw new ErroHttp("robots", url, `Coleta bloqueada por precaução: ${estado.motivo} (RFC 9309: na dúvida, não acessar).`);
      }
      if (!(await permitido(url))) throw new ErroHttp("robots", url, `robots.txt não permite ${url}`);
    }
    return bruta(url, opcoes);
  }

  return {
    userAgent,
    requisitar,
    permitido,
    async texto(url, opcoes = {}) {
      return (await requisitar(url, opcoes)).texto;
    },
    async json<T = unknown>(url: string, opcoes: OpcoesRequisicao = {}): Promise<T> {
      const resposta = await requisitar(url, {
        ...opcoes,
        cabecalhos: { accept: "application/json", ...(opcoes.corpo !== undefined ? { "content-type": "application/json" } : {}), ...opcoes.cabecalhos },
      });
      try {
        return JSON.parse(resposta.texto) as T;
      } catch {
        throw new ErroHttp("conteudo", url, `JSON inválido em ${url} (começa com ${JSON.stringify(resposta.texto.slice(0, 60))})`, resposta.status, resposta.tentativas);
      }
    },
    async verificar(url, opcoes = {}) {
      try {
        const resposta = await requisitar(url, { ...opcoes, metodo: "HEAD", aceitarStatus: () => true });
        return resposta.status;
      } catch (erro) {
        if (erro instanceof ErroHttp && (erro.motivo === "robots" || erro.motivo === "cancelado")) throw erro;
        return null;
      }
    },
  };
}
