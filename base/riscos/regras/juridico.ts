/**
 * Jurídico: ação judicial em curso, penhora de outros credores, leilão com recurso, devedor
 * com direito de preferência.
 *
 * - Ação judicial: só ação que discute o imóvel ou o leilão (anulatória, embargos de
 *   terceiro, usucapião, reintegração de posse, fraude à execução...). O processo da própria
 *   execução não conta, nem o texto-modelo do art. 903 ("ainda que venham a ser julgados
 *   procedentes os embargos do executado"), nem ação já julgada ("por sentença proferida nos
 *   autos da ação de usucapião, transitada em julgado"; "embargos de terceiro julgados
 *   improcedentes"). Sempre com revisão.
 * - Penhora de outros credores: "Há outras penhoras", "penhoras em outros processos",
 *   "penhora no rosto dos autos" (confiança média). Ato de matrícula ("R.5 - Penhora") é
 *   fraco: pode ser a penhora da própria execução (baixa, revisão). A lista-modelo de
 *   intimação ("credor com penhora anteriormente averbada") e o texto de baixa de gravames
 *   ("cancelamento de eventuais penhoras") não contam.
 * - Leilão com recurso: agravo, recurso pendente, efeito suspensivo, embargos à arrematação.
 *   Recurso já decidido ("conforme acórdão proferido no agravo") e o texto-modelo ("nos
 *   processos em que constar pendência de recurso") não contam. Sempre com revisão.
 * - Direito de preferência: Leilão SFI da Caixa (Lei 9.514/97, art. 27, §2º-B: o devedor
 *   fiduciante tem preferência até o 2º leilão) → alta. Alienação fiduciária extrajudicial de
 *   outro credor → média. Judicial: só preferência atribuída a alguém ("o coproprietário terá
 *   direito de preferência") ou venda com reserva da cota do coproprietário (art. 843, §1º)
 *   afirmada sobre este imóvel (a regra condicional do modelo, "caso o bem seja indivisível...",
 *   não conta), confiança baixa e revisão. Venda direta, venda online e licitação da Caixa acontecem
 *   depois dos leilões: a preferência do antigo devedor já acabou ("não", média). Remição da
 *   execução (art. 826 do CPC) existe em todo leilão judicial e não é sinal específico.
 */
import type { Confianca } from "../../tipos.ts";
import type { RegraRisco } from "../motor.ts";
import {
  achados,
  atoCancelado,
  clausulaDeIntimacao,
  clausulasDe,
  desconhecido,
  deteccao,
  ehCaixa,
  ehLeilaoSfi,
  negado,
  ressalvado,
  trechoDe,
  type Achado,
} from "./apoio.ts";
import { vendaComReservaDeCota } from "./sinais.ts";

// ---------------------------------------------------------------------------
// Ação judicial
// ---------------------------------------------------------------------------

const ACAO_FORTE = new RegExp(
  [
    String.raw`\bacao\s+(?:anulatoria|revisional|de nulidade|declaratoria(?: de nulidade)?|reivindicatoria|de usucapiao|possessoria|de reintegracao de posse|de manutencao de posse|pauliana|de despejo|de rescisao|de adjudicacao compulsoria|demolitoria|de imissao (?:na|de) posse)\b`,
    String.raw`\bembargos\s+de\s+terceiros?\b`,
    String.raw`\busucapiao\b`,
    String.raw`\bfraude\s+(?:a|de|contra)\s+(?:execucao|credores)\b`,
  ].join("|"),
);
const ACAO_FRACA = new RegExp(
  [
    String.raw`\b(?:imovel|bem)\s+(?:e\s+)?(?:objeto|alvo)\s+de\s+(?:acao|acoes|processo|litigio|disputa)\b`,
    String.raw`\b(?:ha|existe[m]?|consta[m]?|tramita[m]?|pende[m]?)\s+(?:acao|acoes|processo|processos)\s+(?:judicia\w*\s+)?(?:em curso|pendentes?|em tramite|em andamento|sobre o (?:imovel|bem)|discutindo|questionando|que (?:discute|questiona))`,
    String.raw`\b(?:imovel|bem)\s+com\s+acao\s+judicial\b`,
    String.raw`\bacao judicial\s+(?:em curso|em andamento|pendente|em tramite)`,
    String.raw`\bsub judice\b`,
    String.raw`\b(?:imovel|bem|area)\s+(?:e\s+)?litigios[oa]\b`,
  ].join("|"),
);
const SEM_PROCESSOS =
  /\bnao\s+ha\s+registro\s+(?:ou certificacao\s+)?de\s+onus,?\s+recursos?\s+ou\s+processos?\s+pendentes|\b(?:nao|inexist\w*)\s+(?:ha|existem|constam|consta)?\s*(?:acoes|acao|processos?)\s+(?:judicia\w*\s+)?pendentes/;

/** Ressalvas próprias dos modelos de edital ("ainda que venham a ser julgados procedentes"). */
const MODELO_903 = /\bart(?:igo)?\.?\s*903\b|ainda que venham a ser julgad/;
/** Decisão logo depois da ação ou do recurso ("..., julgados improcedentes"); "ainda não julgados" é pendente. */
const JA_DECIDIDO_DEPOIS =
  /^[^;]{0,60}\b(?<!\bnao\s)(?:transitad\w* em julgado|julgad[oa]s?\b|(?:negad|dad)[oa] provimento|(?:deu|negou|dar|negar|deram|negaram)\s+(?:parcial\s+)?provimento|nao conhecid[oa]|improvid[oa]|desprovid[oa]|provid[oa]\b|decidid[oa])/;
/**
 * Ação já decidida ou histórica: "por sentença proferida nos autos da ação de usucapião,
 * transitada em julgado, o imóvel foi registrado", "os embargos de terceiro foram julgados
 * improcedentes". Mais estreito que o do recurso: "conforme certidão, há ação..." conta.
 */
const ACAO_DECIDIDA_ANTES = /\b(?:proferid\w*|transitad\w*|julgad\w*|homologad\w*)\b[^;]{0,40}$/;

export const regraAcaoJudicial: RegraRisco = {
  id: "juridico/acao-judicial",
  descricao: "Ação que discute o imóvel ou o leilão (anulatória, embargos de terceiro, usucapião...). O processo da própria execução e ação já julgada não contam.",
  tags: ["acao-judicial"],
  avaliar({ textos }) {
    const cls = clausulasDe(textos);
    const valido = (a: Achado): boolean =>
      !ressalvado(a) &&
      !negado(a) &&
      !MODELO_903.test(a.clausula.n) &&
      !clausulaDeIntimacao(a.clausula) &&
      !ACAO_DECIDIDA_ANTES.test(a.antes) &&
      !JA_DECIDIDO_DEPOIS.test(a.depois);
    const forte = achados(cls, ACAO_FORTE).find(valido);
    if (forte) return [deteccao("acao-judicial", "sim", "media", forte.texto.origem, trechoDe(forte), true)];
    const fraca = achados(cls, ACAO_FRACA).find(valido);
    if (fraca) return [deteccao("acao-judicial", "sim", "baixa", fraca.texto.origem, trechoDe(fraca), true)];
    const sem = achados(cls, SEM_PROCESSOS)[0];
    if (sem) return [deteccao("acao-judicial", "nao", "media", sem.texto.origem, trechoDe(sem), true)];
    return [desconhecido("acao-judicial", "A fonte não menciona ação sobre o imóvel ou o leilão.")];
  },
};

// ---------------------------------------------------------------------------
// Penhora de outros credores
// ---------------------------------------------------------------------------

const PENHORA_EXPLICITA = new RegExp(
  [
    String.raw`\b(?:ha|existe[m]?|consta[m]?|com)\s+(?:outras?|demais|diversas|varias)\s+penhoras?\b`,
    String.raw`\boutras?\s+penhoras?\b`,
    String.raw`\bpenhoras?\s+(?:e\s+indisponibilidades?\s+)?(?:em|de|nos|oriundas?\s+de|determinadas?\s+(?:em|por))\s+outr[oa]s?\s+(?:processos?|autos|credores|execucoes|feitos|juizos|varas)`,
    String.raw`\bpenhoras?\s+no\s+rosto\s+dos\s+autos\b`,
    String.raw`\b(?:objeto de|gravad[oa] com|onerad[oa] (?:com|por))\s+(?:outras?\s+)?penhoras\b`,
    String.raw`\bpenhoras?\s+anterior(?:es|mente)?\b`,
  ].join("|"),
);
const PENHORA_MATRICULA = /\b(?:r|av)\.?\s*-?\s*\d{1,3}\b[^;.]{0,40}?\bpenhora\b/;
const SEM_PENHORA = /\b(?:nao|inexist\w*)\s+(?:ha|existem|constam|consta)?\s*(?:outras?\s+)?penhoras?\b/;
const LIMPEZA_DE_GRAVAMES = /(?:cancelamento|baixa|levantamento)\s+(?:de\s+|das?\s+|dos?\s+)?(?:eventua\w+\s+)?$/;
/** Penhora da própria execução ("AV.12 - Penhora realizada nestes autos em favor do exequente", "Av.03, a penhora exequenda"). */
const PENHORA_DESTES_AUTOS =
  /\b(?:nestes|destes|neste|deste|nos presentes|dos presentes)\s+(?:autos|processo|feito)\b|\b(?:desta|da presente|nesta)\s+execucao\b|\bem favor d[oa]s?\s+(?:exequente|reclamante|autor)\b|\bpenhoras?\s+exequend[oa]s?\b/;

export const regraPenhora: RegraRisco = {
  id: "juridico/penhora",
  descricao: "Penhoras de outros credores declaradas no texto; ato de matrícula com penhora é sinal fraco.",
  tags: ["penhora-outros-credores"],
  avaliar({ textos }) {
    const cls = clausulasDe(textos);
    const valido = (a: Achado): boolean =>
      !ressalvado(a) && !negado(a) && !clausulaDeIntimacao(a.clausula) && !LIMPEZA_DE_GRAVAMES.test(a.antes) && !/\bcredor\w*[^;]{0,80}$/.test(a.antes);
    const explicita = achados(cls, PENHORA_EXPLICITA).find(valido);
    if (explicita) return [deteccao("penhora-outros-credores", "sim", "media", explicita.texto.origem, trechoDe(explicita))];
    const ato = achados(cls, PENHORA_MATRICULA).find(
      (a) => valido(a) && !atoCancelado(a) && !PENHORA_DESTES_AUTOS.test(a.casado + a.depois.slice(0, 120)),
    );
    if (ato) return [deteccao("penhora-outros-credores", "sim", "baixa", ato.texto.origem, trechoDe(ato), true)];
    const sem = achados(cls, SEM_PENHORA).find((a) => !ressalvado(a));
    if (sem) return [deteccao("penhora-outros-credores", "nao", "media", sem.texto.origem, trechoDe(sem), true)];
    return [desconhecido("penhora-outros-credores", "A fonte não menciona penhoras de outros credores.")];
  },
};

// ---------------------------------------------------------------------------
// Leilão com recurso
// ---------------------------------------------------------------------------

const RECURSO = new RegExp(
  [
    String.raw`\bagravos?(?:\s+de\s+(?:instrumento|peticao)|\s+interno|\s+regimental)?\b`,
    String.raw`\brecursos?\s+(?:pendentes?|em andamento|interpost\w*|aguardando|especial|extraordinario|de revista|ordinario)\b`,
    String.raw`\bpendencia\s+de\s+recursos?\b`,
    String.raw`\befeito suspensivo\b`,
    String.raw`\bembargos\s+a\s+(?:arrematacao|execucao|adjudicacao|alienacao)\b`,
    String.raw`\b(?:apelacao|impugnacao)\s+(?:pendente|interpost\w*|em tramite)`,
    // "pendente de julgamento" só quando o sujeito é recurso (embargos de terceiro são ação, não recurso).
    String.raw`\b(?:recursos?|apelac(?:ao|oes)|embargos de declaracao)\b[^;]{0,60}?\b(?:pendentes?\s+de\s+julgamento|aguardando\s+(?:o\s+)?julgamento)\b`,
  ].join("|"),
);
/** Recurso já decidido: a menção é a fonte de uma decisão, não algo pendente. */
const JA_DECIDIDO_ANTES = /\b(?:acordao|decisao|decidid\w*|julgad\w*|transitad\w*|proferid\w*|determinad\w*|conforme|nos autos d[oa])\b[^;]{0,40}$/;
const SEM_RECURSO = /\b(?:nao|inexist\w*)\s+(?:ha|existem|constam|consta)?\s*(?:registro\s+(?:ou certificacao\s+)?de\s+onus,?\s+)?recursos?\s+(?:ou\s+processos?\s+)?pendentes?/;

export const regraRecurso: RegraRisco = {
  id: "juridico/recurso",
  descricao: "Recurso pendente no processo (agravo, efeito suspensivo, embargos à arrematação). Recurso já decidido não conta.",
  tags: ["leilao-com-recurso"],
  avaliar({ textos }) {
    const cls = clausulasDe(textos);
    const valido = (a: Achado): boolean =>
      !ressalvado(a) && !negado(a) && !MODELO_903.test(a.clausula.n) && !JA_DECIDIDO_ANTES.test(a.antes) && !JA_DECIDIDO_DEPOIS.test(a.depois);
    const achado = achados(cls, RECURSO).find(valido);
    if (achado) return [deteccao("leilao-com-recurso", "sim", "baixa", achado.texto.origem, trechoDe(achado), true)];
    const sem = achados(cls, SEM_RECURSO)[0];
    if (sem) return [deteccao("leilao-com-recurso", "nao", "media", sem.texto.origem, trechoDe(sem), true)];
    return [desconhecido("leilao-com-recurso", "A fonte não menciona recurso pendente.")];
  },
};

// ---------------------------------------------------------------------------
// Direito de preferência
// ---------------------------------------------------------------------------

const TITULAR = String.raw`(?:executad[oa]s?|devedor(?:a|es)?(?:\s+fiduciante)?|fiduciantes?|coproprietari[oa]s?|condomin[oa]s?|conjuges?|meeir[oa]s?|arrendatari[oa]s?|credor(?:es)?\s+hipotecari[oa]s?)`;
const PREFERENCIA_ATRIBUIDA = new RegExp(
  [
    String.raw`\b${TITULAR}\s+(?:\w+\s+){0,4}?(?:tera|tem|terao|possui|possuem|podera exercer|poderao exercer|exercera|exercerao|goza|gozara)\s+(?:o\s+)?direito\s+de\s+preferencia`,
    String.raw`\bdireito\s+de\s+preferencia\s+(?:\w+\s+){0,3}?(?:d[oa]s?|ao|aos|assegurad[oa]\s+ao)\s+${TITULAR}`,
    String.raw`\b(?:assegurad|garantid|conferid)[oa]\s+a[oa]s?\s+${TITULAR}\s+(?:\w+\s+){0,2}?o\s+direito\s+de\s+preferencia`,
  ].join("|"),
);
const FIDUCIARIA = /\balienacao fiduciaria\b|\blei\s+(?:federal\s+)?(?:n[ºo°.]*\s*)?9\.?514|\bfiduciante\b|\bconsolidacao da propriedade\b/;

function det(valor: "sim" | "nao", confianca: Confianca, origem: string, trecho: string, revisar = false) {
  return deteccao("direito-preferencia", valor, confianca, origem, trecho, revisar);
}

export const regraPreferencia: RegraRisco = {
  id: "juridico/preferencia",
  descricao: "Leilão SFI/alienação fiduciária (preferência do devedor até o 2º leilão); no judicial, preferência atribuída a alguém ou art. 843.",
  tags: ["direito-preferencia"],
  avaliar(entrada) {
    const { imovel, textos } = entrada;
    if (ehLeilaoSfi(imovel)) {
      return [
        det(
          "sim",
          "alta",
          "campo:modalidade_fonte",
          `Modalidade "${imovel.modalidade_fonte}": alienação fiduciária (Lei 9.514/97, art. 27, §2º-B). O antigo devedor pode comprar pelo valor da dívida até o 2º leilão.`,
        ),
      ];
    }
    const cls = clausulasDe(textos);
    if (imovel.judicial === false) {
      const fiduciaria = achados(cls, FIDUCIARIA).find((a) => !ressalvado(a) && !clausulaDeIntimacao(a.clausula));
      if (fiduciaria) return [det("sim", "media", fiduciaria.texto.origem, trechoDe(fiduciaria))];
    }
    const atribuida = achados(cls, PREFERENCIA_ATRIBUIDA).find((a) => !ressalvado(a) && !negado(a));
    if (atribuida) return [det("sim", "baixa", atribuida.texto.origem, trechoDe(atribuida), true)];
    const art843 = vendaComReservaDeCota(cls)[0];
    if (art843) {
      return [
        det(
          "sim",
          "baixa",
          art843.texto.origem,
          `${trechoDe(art843)} (Art. 843 do CPC: o coproprietário ou cônjuge não executado tem preferência na arrematação em igualdade de condições.)`,
          true,
        ),
      ];
    }
    if (ehCaixa(entrada) && ["venda_direta", "venda_online", "licitacao_aberta"].includes(imovel.modalidade)) {
      return [
        det(
          "nao",
          "media",
          "campo:modalidade",
          `Modalidade "${imovel.modalidade_fonte ?? imovel.modalidade}": venda depois dos leilões da Lei 9.514/97; a preferência do antigo devedor vale só até o 2º leilão.`,
        ),
      ];
    }
    return [desconhecido("direito-preferencia", "A fonte não indica direito de preferência de devedor ou coproprietário.")];
  },
};

export const REGRAS_JURIDICO: readonly RegraRisco[] = [regraAcaoJudicial, regraPenhora, regraRecurso, regraPreferencia];
