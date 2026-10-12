/**
 * Classificação de tipo de imóvel e de modalidade a partir do texto da fonte. Os conectores
 * podem usar estas funções para que todas as fontes caiam nos mesmos valores.
 */
import type { Modalidade, TipoImovel } from "../tipos.ts";
import { normalizarTexto } from "./texto.ts";

const REGRAS_TIPO: ReadonlyArray<readonly [RegExp, TipoImovel]> = [
  [/\b(vaga|box|boxe|garagem)\b/, "vaga"],
  [/\b(apartamento|apto|flat|cobertura|kitnet|kitinete|kitchenette|loft|studio|duplex|triplex)\b/, "apartamento"],
  [/\b(imovel rural|rural|fazenda|sitio|chacara|gleba(?! urbana)|haras|granja)\b/, "rural"],
  [/\b(sala|loja|galpao|armazem|deposito|predio|edificio|comercial|escritorio|hotel|pousada|posto|industria|industrial|barracao)\b/, "comercial"],
  [/\b(casa|sobrado|residencia|moradia|bangalo|geminada)\b/, "casa"],
  [/\b(terreno|lote|gleba urbana|quinhao)\b/, "terreno"],
];

function tipoMaisCedo(texto: string): TipoImovel | null {
  let melhor: { pos: number; tipo: TipoImovel } | null = null;
  for (const [regex, tipo] of REGRAS_TIPO) {
    const achado = regex.exec(texto);
    if (achado && (melhor === null || achado.index < melhor.pos)) melhor = { pos: achado.index, tipo };
  }
  return melhor?.tipo ?? null;
}

/**
 * Tipo do imóvel pela palavra de tipo que aparece primeiro no texto. Passe o título ou o
 * rótulo de tipo da fonte, não a descrição inteira.
 * "Apartamento, 50 m²" → apartamento; "Casa com garagem" → casa; "Sobrado" → casa;
 * "Gleba" → rural; "Gleba Urbana" → terreno; "Galpão" → comercial; "Outros" → outro.
 * Testa primeiro o trecho antes da primeira vírgula ou ponto e depois o texto todo.
 */
export function inferirTipoImovel(texto: string | null | undefined): TipoImovel {
  if (!texto) return "outro";
  const normal = normalizarTexto(texto);
  const inicio = normal.split(/[,;:–(]|\.\s/)[0] ?? normal;
  return tipoMaisCedo(inicio) ?? tipoMaisCedo(normal) ?? "outro";
}

export interface ModalidadeClassificada {
  modalidade: Modalidade;
  /** `true` judicial, `false` extrajudicial, `null` quando o texto não diz. */
  judicial: boolean | null;
}

/**
 * Modalidade pelo rótulo da fonte.
 * "Leilão SFI - Edital Único" → leilao (extrajudicial); "Venda Direta Online" → venda_direta;
 * "Venda Online" → venda_online; "Licitação Aberta" → licitacao_aberta;
 * "Leilão Judicial" / "Hasta pública" / "Praça" → leilao (judicial).
 */
export function classificarModalidade(texto: string | null | undefined): ModalidadeClassificada {
  if (!texto) return { modalidade: "outro", judicial: null };
  const t = normalizarTexto(texto);
  const extrajudicial = /\b(extrajudicial|sfi|alienacao fiduciaria|lei 9\.?514|fiduciari)/.test(t);
  const judicial = !extrajudicial && /\b(judicial|hasta publica|praca|trt|tjsp|tj[a-z]{2}|vara|justica)\b/.test(t);
  const juizo = extrajudicial ? false : judicial ? true : null;
  if (/\bvenda direta\b|\bcompra direta\b|\bproposta\b/.test(t)) return { modalidade: "venda_direta", judicial: juizo };
  if (/\bvenda online\b/.test(t)) return { modalidade: "venda_online", judicial: juizo };
  if (/\b(licitacao|concorrencia)\b/.test(t)) return { modalidade: "licitacao_aberta", judicial: juizo };
  if (/\b(leilao|leiloes|hasta|praca|pregao)\b/.test(t)) return { modalidade: "leilao", judicial: juizo };
  return { modalidade: "outro", judicial: juizo };
}
