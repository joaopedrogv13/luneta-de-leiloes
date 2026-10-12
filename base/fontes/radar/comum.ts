/**
 * Ajudas de rede e de entrada local compartilhadas pelos conectores do radar.
 *
 * Toda requisição passa pelo cliente educado do núcleo (util/http.ts: User-Agent identificado,
 * timeout, retentativas com Retry-After, intervalo por host, limite de tamanho). Aqui só se
 * acrescenta o que é comum às APIs JSON do radar: 204/404 como "página vazia", JSON validado
 * antes de seguir e uma retentativa extra, com espera longa, para status que a fonte documenta
 * como passageiros (429 do DJEN pede 1 minuto; 400 esporádico do PNCP some na repetição).
 *
 * As quatro fontes do radar são APIs documentadas (PNCP, Comunica PJe, Querido Diário) ou o
 * serviço oficial de download do DOU (INLABS, com scripts de automação publicados pela
 * Imprensa Nacional). robots.txt (RFC 9309) rege rastreadores de páginas, não clientes de API
 * documentada, por isso os conectores passam `respeitarRobots: false`, como prevê
 * util/http.ts. LUNETA_RADAR_ROBOTS=1 liga a checagem mesmo assim (config.ts). Páginas HTML de
 * terceiros nunca são buscadas por aqui.
 */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { lerArquivoTexto } from "../../util/arquivo.ts";
import { ErroHttp, type ClienteHttp } from "../../util/http.ts";

export type Esperar = (ms: number) => Promise<void>;

export const esperarPadrao: Esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

export interface RespostaJson<T> {
  status: number;
  /** `null` para 204, corpo vazio ou 404 aceito como coleção vazia. */
  dados: T | null;
  cabecalhos: Headers;
}

export interface OpcoesJson {
  sinal?: AbortSignal;
  cabecalhos?: Record<string, string>;
  /** Padrão false: APIs documentadas (ver o topo do arquivo). */
  respeitarRobots?: boolean;
  /** Trata 404 como coleção vazia (o PNCP responde 404 para lista sem itens). */
  aceitar404?: boolean;
  /** Validação do JSON já interpretado: devolva o motivo da recusa ou null. */
  validar?: (dados: unknown) => string | null;
}

/** GET de JSON pelo cliente educado, com validação do conteúdo antes de devolver. */
export async function obterJson<T>(http: ClienteHttp, url: string, opcoes: OpcoesJson = {}): Promise<RespostaJson<T>> {
  const resposta = await http.requisitar(url, {
    cabecalhos: { accept: "application/json", ...opcoes.cabecalhos },
    respeitarRobots: opcoes.respeitarRobots ?? false,
    sinal: opcoes.sinal,
    codificacao: "utf-8",
    aceitarStatus: (s) => (s >= 200 && s < 300) || (opcoes.aceitar404 === true && s === 404),
  });
  if (resposta.status === 204 || resposta.status === 404 || resposta.texto.trim() === "") {
    return { status: resposta.status, dados: null, cabecalhos: resposta.cabecalhos };
  }
  let dados: unknown;
  try {
    dados = JSON.parse(resposta.texto);
  } catch {
    throw new ErroHttp(
      "conteudo",
      url,
      `Resposta não é JSON em ${url} (começa com ${JSON.stringify(resposta.texto.slice(0, 80))}). Página de bloqueio ou manutenção?`,
      resposta.status,
      resposta.tentativas,
    );
  }
  const recusa = opcoes.validar?.(dados) ?? null;
  if (recusa) throw new ErroHttp("conteudo", url, `Conteúdo recusado em ${url}: ${recusa}`, resposta.status, resposta.tentativas);
  return { status: resposta.status, dados: dados as T, cabecalhos: resposta.cabecalhos };
}

export interface RegraNovaTentativa {
  /** Status HTTP que valem nova tentativa (além das que o cliente já fez). */
  status: readonly number[];
  /** Tentativas extras. */
  vezes: number;
  esperaMs: number;
  esperar: Esperar;
  log?: (mensagem: string) => void;
  sinal?: AbortSignal;
}

/** Repete `fn` quando ela falha com um dos status da regra, esperando entre as tentativas. */
export async function comNovaTentativa<T>(fn: () => Promise<T>, regra: RegraNovaTentativa): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await fn();
    } catch (erro) {
      const repetivel = erro instanceof ErroHttp && erro.motivo === "status" && erro.status !== null && regra.status.includes(erro.status);
      if (!repetivel || tentativa >= regra.vezes || regra.sinal?.aborted) throw erro;
      regra.log?.(`${erro.message}; nova tentativa em ${Math.round(regra.esperaMs / 1000)} s`);
      await regra.esperar(regra.esperaMs);
    }
  }
}

/** Monta URL com querystring; ignora valores vazios e repete a chave para listas. */
export function montarUrl(base: string, parametros: Record<string, string | number | readonly (string | number)[] | null | undefined>): string {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor === null || valor === undefined || valor === "") continue;
    if (Array.isArray(valor)) for (const item of valor) busca.append(chave, String(item));
    else busca.append(chave, String(valor));
  }
  const qs = busca.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Lê entrada local para teste sem rede: um arquivo JSON ou uma pasta de arquivos .json (em
 * ordem de nome). Devolve um documento por arquivo.
 */
export async function lerJsonLocal(caminho: string): Promise<Array<{ arquivo: string; dados: unknown }>> {
  const info = await stat(caminho);
  const arquivos = info.isDirectory()
    ? (await readdir(caminho)).filter((nome) => nome.toLowerCase().endsWith(".json")).sort().map((nome) => join(caminho, nome))
    : [caminho];
  if (arquivos.length === 0) throw new Error(`Nenhum arquivo .json em ${caminho}.`);
  const saida: Array<{ arquivo: string; dados: unknown }> = [];
  for (const arquivo of arquivos) {
    const texto = await lerArquivoTexto(arquivo, "utf-8");
    try {
      saida.push({ arquivo, dados: JSON.parse(texto) });
    } catch (erro) {
      throw new Error(`JSON inválido em ${arquivo}: ${(erro as Error).message}`);
    }
  }
  return saida;
}

/** Objeto simples (não lista, não null)? */
export function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/** Lança erro se o registro bruto não for um objeto (sem estreitar o tipo de quem chama). */
export function exigirObjeto(valor: unknown, mensagem: string): void {
  if (!ehObjeto(valor)) throw new Error(mensagem);
}

/** Texto de um campo, ou null. */
export function texto(valor: unknown): string | null {
  if (typeof valor === "string") return valor.trim() === "" ? null : valor;
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return null;
}

/** Número de um campo (aceita número ou texto numérico com ponto decimal), ou null. */
export function numero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string" && /^-?\d+(?:\.\d+)?$/.test(valor.trim())) return Number(valor);
  return null;
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" (para títulos). */
export function diaBr(dia: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}

/** URL http(s) válida, ou null. */
export function urlOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  try {
    const url = new URL(valor.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
