/**
 * Fotos da Caixa: só a URL na fonte, nunca baixada nem re-hospedada.
 *
 * Padrão: https://venda-imoveis.caixa.gov.br/fotos/F{id13}{slot}.jpg, com a capa no slot 21
 * (confirmado nas duas fichas reais, de 2023 e 2026, e por dois projetos abertos). A ficha de
 * 2023 também tem o slot 22, então outros slots existem às vezes; quantos, não se sabe.
 *
 * Sem rede, a capa entra como "padrao_url" e não verificada (ok = null). Com a verificação
 * ligada, um HEAD por slot (21, 22, ...) até o primeiro que não existir; a capa ausente fica
 * registrada com ok = false, para a regra de "Sem fotos" poder afirmar a ausência.
 */
import type { Foto } from "../../tipos.ts";
import { ErroHttp, type ClienteHttp } from "../../util/http.ts";
import type { FotoVerificada } from "./cache.ts";
import { BASE_CAIXA } from "./ficha.ts";

export const SLOT_CAPA = 21;

export function urlFoto(id13: string, slot: number = SLOT_CAPA): string {
  return `${BASE_CAIXA}/fotos/F${id13}${slot}.jpg`;
}

/** A capa montada pelo padrão, ainda não verificada. */
export function capaPadrao(id13: string): Foto {
  return { url: urlFoto(id13), ordem: 0, origem: "padrao_url", verificada_em: null, ok: null };
}

export type ResultadoVerificacao =
  | { tipo: "ok"; fotos: FotoVerificada[] }
  /** A fonte bloqueou (anti-robô, robots.txt, 403/429): pare de verificar nesta coleta. */
  | { tipo: "bloqueio"; motivo: string }
  /** Falha passageira (rede, 5xx): tente de novo noutra coleta. */
  | { tipo: "falha"; motivo: string };

/**
 * HEAD nos slots a partir do 21 até o primeiro ausente (no máximo `maxSlots`). Não lança,
 * a não ser por cancelamento.
 */
export async function verificarFotos(
  http: ClienteHttp,
  id13: string,
  opcoes: { maxSlots?: number; agora?: () => Date; sinal?: AbortSignal } = {},
): Promise<ResultadoVerificacao> {
  const maxSlots = opcoes.maxSlots ?? 8;
  const agora = opcoes.agora ?? (() => new Date());
  const fotos: FotoVerificada[] = [];
  for (let i = 0; i < maxSlots; i++) {
    const url = urlFoto(id13, SLOT_CAPA + i);
    let status: number;
    let tipo: string;
    try {
      const resposta = await http.requisitar(url, {
        metodo: "HEAD",
        aceitarStatus: () => true,
        cabecalhos: { accept: "image/*,*/*;q=0.5" },
        sinal: opcoes.sinal,
      });
      status = resposta.status;
      tipo = (resposta.cabecalhos.get("content-type") ?? "").toLowerCase();
    } catch (erro) {
      if (erro instanceof ErroHttp && erro.motivo === "cancelado") throw erro;
      if (erro instanceof ErroHttp && erro.motivo === "robots") return { tipo: "bloqueio", motivo: erro.message };
      return { tipo: "falha", motivo: (erro as Error).message };
    }
    if (status === 403 || status === 429) return { tipo: "bloqueio", motivo: `HTTP ${status} em ${url}` };
    if (status >= 500) return { tipo: "falha", motivo: `HTTP ${status} em ${url}` };
    const quando = agora().toISOString();
    if (status >= 200 && status < 300) {
      // 200 com HTML é página de desafio, não foto.
      if (tipo.includes("text/html")) return { tipo: "bloqueio", motivo: `HTML no lugar da foto em ${url} (desafio anti-robô?)` };
      fotos.push({ url, ordem: i, status, ok: true, verificada_em: quando });
      continue;
    }
    // Só 404/410 provam que o slot não existe (405 seria HEAD recusado, não foto ausente).
    if (status !== 404 && status !== 410) return { tipo: "falha", motivo: `HTTP ${status} em ${url}` };
    if (i === 0) fotos.push({ url, ordem: 0, status, ok: false, verificada_em: quando });
    break;
  }
  return { tipo: "ok", fotos };
}

/** Converte as fotos verificadas no formato do núcleo. */
export function fotosVerificadas(lista: readonly FotoVerificada[]): Foto[] {
  return lista.map((f) => ({ url: f.url, ordem: f.ordem, origem: "padrao_url", verificada_em: f.verificada_em, ok: f.ok }));
}

/** Fotos listadas pela ficha (a página mostra a galeria; não houve HEAD). */
export function fotosDaFicha(urls: readonly string[]): Foto[] {
  return urls.map((url, ordem) => ({ url, ordem, origem: "ficha", verificada_em: null, ok: null }));
}
