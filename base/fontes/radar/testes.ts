/**
 * Apoio aos testes do radar (não é teste): cliente HTTP com respostas falsas, gravador de ZIP
 * e caminho das fixtures. Nada aqui acessa a rede.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { criarClienteHttp, type ClienteHttp } from "../../util/http.ts";

export const DIR_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export type Rota = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

export interface HttpFalso {
  http: ClienteHttp;
  /** URLs pedidas, em ordem (com método). */
  pedidos: Array<{ metodo: string; url: URL; cabecalhos: Record<string, string> }>;
}

/**
 * Cliente HTTP do núcleo com `fetch` falso: cada pedido vai para `rota`. Sem espera entre
 * pedidos nem entre tentativas. robots.txt fica LIGADO no cliente: se um conector esquecer
 * de dispensar robots numa API documentada, o pedido de /robots.txt aparece em `pedidos`.
 */
export function httpFalso(rota: Rota): HttpFalso {
  const pedidos: HttpFalso["pedidos"] = [];
  const http = criarClienteHttp({
    tentativas: 2,
    esperaBaseMs: 0,
    intervaloMinimoMs: 0,
    esperar: async () => undefined,
    fetch: async (entrada, init) => {
      const url = new URL(String(entrada));
      const cabecalhos = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
      pedidos.push({ metodo: init?.method ?? "GET", url, cabecalhos });
      return rota(url, init);
    },
  });
  return { http, pedidos };
}

export function respostaJson(dados: unknown, status = 200, cabecalhos: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", ...cabecalhos } });
}

export function respostaVazia(status: number): Response {
  return new Response(null, { status });
}

export function respostaBytes(bytes: Uint8Array, status = 200, tipo = "application/zip"): Response {
  return new Response(new Uint8Array(bytes), { status, headers: { "content-type": tipo } });
}

/** ZIP mínimo em memória (deflate por padrão), para testar o leitor e o conector do DOU. */
export function criarZip(arquivos: ReadonlyArray<{ nome: string; dados: Uint8Array | string; metodo?: 0 | 8 }>): Uint8Array {
  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let deslocamento = 0;
  for (const arquivo of arquivos) {
    const dados = typeof arquivo.dados === "string" ? new TextEncoder().encode(arquivo.dados) : arquivo.dados;
    const metodo = arquivo.metodo ?? 8;
    const compactado = metodo === 8 ? new Uint8Array(deflateRawSync(dados)) : dados;
    const nome = new TextEncoder().encode(arquivo.nome);
    const crc = crc32(dados) >>> 0;

    const local = new Uint8Array(30 + nome.length + compactado.length);
    const vl = new DataView(local.buffer);
    vl.setUint32(0, 0x04034b50, true);
    vl.setUint16(4, 20, true);
    vl.setUint16(6, 0x800, true);
    vl.setUint16(8, metodo, true);
    vl.setUint16(12, 0x21, true);
    vl.setUint32(14, crc, true);
    vl.setUint32(18, compactado.length, true);
    vl.setUint32(22, dados.length, true);
    vl.setUint16(26, nome.length, true);
    local.set(nome, 30);
    local.set(compactado, 30 + nome.length);
    locais.push(local);

    const central = new Uint8Array(46 + nome.length);
    const vc = new DataView(central.buffer);
    vc.setUint32(0, 0x02014b50, true);
    vc.setUint16(4, 20, true);
    vc.setUint16(6, 20, true);
    vc.setUint16(8, 0x800, true);
    vc.setUint16(10, metodo, true);
    vc.setUint16(14, 0x21, true);
    vc.setUint32(16, crc, true);
    vc.setUint32(20, compactado.length, true);
    vc.setUint32(24, dados.length, true);
    vc.setUint16(28, nome.length, true);
    vc.setUint32(42, deslocamento, true);
    central.set(nome, 46);
    centrais.push(central);
    deslocamento += local.length;
  }
  const tamanhoCentral = centrais.reduce((soma, c) => soma + c.length, 0);
  const fim = new Uint8Array(22);
  const vf = new DataView(fim.buffer);
  vf.setUint32(0, 0x06054b50, true);
  vf.setUint16(8, arquivos.length, true);
  vf.setUint16(10, arquivos.length, true);
  vf.setUint32(12, tamanhoCentral, true);
  vf.setUint32(16, deslocamento, true);
  const partes = [...locais, ...centrais, fim];
  const saida = new Uint8Array(partes.reduce((soma, p) => soma + p.length, 0));
  let posicao = 0;
  for (const parte of partes) {
    saida.set(parte, posicao);
    posicao += parte.length;
  }
  return saida;
}

/** Registra mensagens de log/informar para conferir nos testes. */
export function coletorDeLog(): { mensagens: string[]; log: (m: string) => void } {
  const mensagens: string[] = [];
  return { mensagens, log: (m) => mensagens.push(m) };
}
