/**
 * Praça: 1ª praça, 2ª praça, praça única.
 *
 * - Venda direta, venda online e licitação (oferta única) → "Praça única" (média; dicionário:
 *   "regra por modalidade").
 * - Praça em vigor (`praca_atual`, do conector ou deduzida pelas datas no núcleo) → 1ª ou 2ª
 *   praça (média). Praça 0 num leilão → praça única (média).
 * - Leilões Judiciais com `vl_lanceinicialsegundoleilao` nulo (extras.regra_praca =
 *   "seg_nulo"): praça única OU desconhecida → "Praça única" com confiança baixa e revisão
 *   (crítica §1.4). "indefinida" → desconhecido.
 * - Leilão sem praça definida (ex.: Leilão SFI da Caixa só pelo CSV, que não diz se é o 1º ou o
 *   2º leilão): só o título (do lote ou do leilão) decide, e só se citar uma praça só; senão
 *   desconhecido. O corpo do edital cita as duas praças quase sempre e não serve.
 */
import type { NumeroPraca } from "../../tipos.ts";
import type { DeteccaoRegra, RegraRisco } from "../motor.ts";
import { desconhecido, deteccao, extra, moeda } from "./apoio.ts";

const OFERTA_UNICA = new Set(["venda_direta", "venda_online", "licitacao_aberta"]);
const ORIGENS_TITULO = new Set(["titulo", "titulo_leilao"]);
// Ordinal masculino ou feminino: "1º Leilão", "1ª Praça", "2o leilão" (a normalização não mexe em º/ª).
const PRIMEIRA = /\b(?:1|primeir)[oaº°ª]?\s*(?:leilao|praca|hasta)\b/;
const SEGUNDA = /\b(?:2|segund)[oaº°ª]?\s*(?:leilao|praca|hasta)\b/;

type Rodada = "primeira-praca" | "segunda-praca" | "praca-unica";
const RODADAS: readonly Rodada[] = ["primeira-praca", "segunda-praca", "praca-unica"];

/** A praça vigente sai "sim"; as outras saem "não", ou "desconhecido" quando a regra não tem certeza. */
function resultado(vigente: Rodada, confianca: "alta" | "media" | "baixa", origem: string, trecho: string, revisar = false): DeteccaoRegra[] {
  return RODADAS.map((r) => {
    if (r === vigente) return deteccao(r, "sim", confianca, origem, trecho, revisar);
    return revisar ? desconhecido(r, trecho, origem) : deteccao(r, "nao", confianca, origem, trecho);
  });
}

function descreverPraca(numero: NumeroPraca, data: string | null | undefined, valor: number | null | undefined): string {
  const nome = numero === 0 ? "Praça única" : `${numero}ª praça`;
  const partes = [data ? `data ${formatarData(data)}` : null, valor ? `lance mínimo ${moeda(valor)}` : null].filter(Boolean);
  return partes.length > 0 ? `${nome} em vigor (${partes.join(", ")}).` : `${nome} em vigor.`;
}

function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export const regraPraca: RegraRisco = {
  id: "praca/rodada",
  descricao: "Praça em vigor pela modalidade (oferta única), pela praça atual ou pela regra de valores da fonte.",
  tags: ["primeira-praca", "segunda-praca", "praca-unica"],
  avaliar({ imovel, textos }) {
    if (OFERTA_UNICA.has(imovel.modalidade)) {
      return resultado("praca-unica", "media", "campo:modalidade", `Modalidade "${imovel.modalidade_fonte ?? imovel.modalidade}": oferta única, sem segunda praça.`);
    }
    const regra = extra(imovel, "regra_praca");
    if (regra === "seg_nulo") {
      return resultado(
        "praca-unica",
        "baixa",
        "campo:regra_praca",
        "A fonte não informa lance de 2ª praça: praça única ou praça não informada.",
        true,
      );
    }
    const atual = imovel.praca_atual;
    if (atual !== null && atual !== undefined && regra !== "indefinida") {
      const praca = imovel.pracas.find((p) => p.numero === atual);
      const trecho = descreverPraca(atual, praca?.data ?? imovel.data_praca, praca?.valor_minimo ?? imovel.preco);
      if (atual === 0) return resultado("praca-unica", "media", "campo:praca_atual", trecho);
      if (atual === 1) return resultado("primeira-praca", "media", "campo:praca_atual", trecho);
      if (atual === 2) return resultado("segunda-praca", "media", "campo:praca_atual", trecho);
      // 3ª praça (rara): é depois da primeira; marca 2ª praça para revisão.
      return resultado("segunda-praca", "baixa", "campo:praca_atual", trecho, true);
    }
    const titulos = textos.filter((t) => ORIGENS_TITULO.has(t.origem));
    const primeira = titulos.find((t) => PRIMEIRA.test(t.normalizado));
    const segunda = titulos.find((t) => SEGUNDA.test(t.normalizado));
    if (segunda && !primeira) return resultado("segunda-praca", "baixa", segunda.origem, segunda.original, true);
    if (primeira && !segunda) return resultado("primeira-praca", "baixa", primeira.origem, primeira.original, true);
    const motivo =
      imovel.pracas.length === 0
        ? "A fonte não informa as praças deste leilão (ex.: o CSV da Caixa não diz se é o 1º ou o 2º leilão)."
        : "Não foi possível saber qual praça está em vigor.";
    return RODADAS.map((r) => desconhecido(r, motivo, "campo:pracas"));
  },
};

export const REGRAS_PRACA: readonly RegraRisco[] = [regraPraca];
