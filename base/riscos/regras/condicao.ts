/**
 * Condição: sem fotos, sem vistoria, aceita financiamento.
 *
 * - Sem fotos: só para fonte que publica fotos (`capacidades.fotos`). Lista vazia ou fotos
 *   verificadas como ausentes (ok = false) → "sim" (alta). Foto da fonte ou verificada → "não".
 *   Só a capa montada por padrão de URL e ainda não verificada (Caixa sem HEAD) →
 *   "desconhecido". Fonte que não publica foto (CSV, PNCP, DOU...) → "desconhecido", nunca "sim".
 * - Sem vistoria: "não foi possível vistoriar", "vistoria externa", "sem acesso ao interior",
 *   "avaliação feita externamente", "visitação não permitida" (revisão). "Não é permitida sem
 *   agendamento prévio" é visita com condição, não proibição. Anexo de avaliação não é
 *   vistoria. Laudo de vistoria entre os documentos, ou "visitação permitida", é contrassinal.
 * - Aceita financiamento: campo estruturado (coluna "Financiamento" da Caixa) → alta. Texto:
 *   "aceita financiamento" / "NÃO aceita financiamento", "exclusivamente à vista" → média.
 *   Parcelamento judicial (art. 895, "pode ser parcelado com 25% de entrada") NÃO é
 *   financiamento e não conta.
 */
import type { RegraRisco } from "../motor.ts";
import { achados, clausulasDe, desconhecido, deteccao, negado, ressalvado, trechoDe } from "./apoio.ts";

export const regraFotos: RegraRisco = {
  id: "condicao/fotos",
  descricao: "Sem fotos só em fonte que publica fotos: lista vazia ou fotos verificadas como ausentes.",
  tags: ["sem-fotos"],
  avaliar({ imovel, fonte }) {
    if (!fonte?.capacidades.fotos) {
      return [desconhecido("sem-fotos", "A fonte não publica fotos: a falta de foto aqui não diz nada.", "capacidade:fotos")];
    }
    const fotos = imovel.fotos;
    if (fotos.length === 0) {
      return [deteccao("sem-fotos", "sim", "alta", "campo:fotos", "A fonte publica fotos, mas este anúncio veio sem nenhuma.")];
    }
    if (fotos.every((f) => f.ok === false)) {
      return [deteccao("sem-fotos", "sim", "alta", "campo:fotos", `${fotos.length} foto(s) conferida(s) na fonte e não encontrada(s).`)];
    }
    const confirmadas = fotos.filter((f) => f.ok === true || (f.ok !== false && f.origem !== "padrao_url"));
    if (confirmadas.length > 0) {
      return [deteccao("sem-fotos", "nao", "alta", "campo:fotos", `${confirmadas.length} foto(s) publicada(s) pela fonte.`)];
    }
    return [desconhecido("sem-fotos", "Só há foto montada por padrão de endereço, ainda não conferida na fonte.", "campo:fotos")];
  },
};

const SEM_VISTORIA = new RegExp(
  [
    String.raw`\bnao\s+(?:foi|e|era|sera|foram)\s+possivel\s+(?:realizar\s+(?:a\s+)?|efetuar\s+(?:a\s+)?|proceder\s+a\s+|fazer\s+(?:a\s+)?)?(?:vistori\w*|visita\w*|o acesso|acesso|ingress\w*|adentrar|entrar|constatar o (?:interior|estado))`,
    String.raw`\bvistoria\s+(?:interna\s+)?(?:nao\s+(?:foi\s+)?(?:realizada|efetuada|autorizada|permitida|possivel)|externa|prejudicada|impossibilitada|indireta)`,
    String.raw`\bsem\s+(?:acesso|ingresso)\s+(?:ao|a)\s+(?:seu\s+)?(?:interior|imovel|unidade|residencia|casa|apartamento)\b`,
    String.raw`\bsem\s+vistoria\b`,
    String.raw`\b(?:avaliacao|avaliad[oa]|laudo|vistoria|vistoriad[oa])\s+(?:realizad[oa]\s+|feit[oa]\s+|efetuad[oa]\s+)?(?:apenas\s+|somente\s+|exclusivamente\s+)?(?:externamente|pelo lado de fora|por fora|pela fachada|de forma (?:indireta|externa))`,
    String.raw`\b(?:visitacao|visitas?)\s+(?:ao\s+imovel\s+)?(?:nao\s+(?:e\s+|sera\s+|foi\s+)?(?:permitid|autorizad|possivel)\w*|proibid\w*|vedad\w*)`,
    String.raw`\b(?:acesso|entrada|ingresso)\s+(?:ao\s+(?:interior|imovel)\s+)?(?:foi\s+)?(?:negad|recusad|impedid|nao\s+(?:foi\s+)?(?:permitid|franquead|autorizad))\w*`,
  ].join("|"),
);
/**
 * Condição logo depois: "a visita não é permitida sem agendamento prévio" (a visita é permitida,
 * com condição); "avaliados com base na vistoria externa, quando não for possível a vistoria
 * interna" (regra geral do edital da Caixa, não fato do imóvel).
 */
const SO_COM_CONDICAO =
  /^\s*,?\s*(?:sem\s+(?:o\s+|a\s+)?(?:previ[oa]\s+)?(?:agendamento|autorizacao|acompanhamento|aviso)|salvo|exceto|senao|a nao ser|fora d[oa]s?\s+(?:horario|dias?|data)|quando|caso|se|na hipotese|nos casos)\b/;
const COM_VISTORIA =
  /\bvistoria\s+(?:interna\s+)?(?:realizada|efetuada|feita)\s+(?:em|no dia|na data)\b|\b(?:visitacao|visitas?)\s+(?:ao imovel\s+)?(?:permitida|liberada|agendad\w*|mediante agendamento)/;

export const regraVistoria: RegraRisco = {
  id: "condicao/vistoria",
  descricao: "Texto diz que não houve vistoria interna (sem acesso, avaliação externa, visitação proibida).",
  tags: ["sem-vistoria"],
  avaliar({ imovel, textos }) {
    const cls = clausulasDe(textos);
    const sem = achados(cls, SEM_VISTORIA).find((a) => !ressalvado(a, 50) && !SO_COM_CONDICAO.test(a.depois));
    if (sem) return [deteccao("sem-vistoria", "sim", "media", sem.texto.origem, trechoDe(sem), true)];
    const laudo = imovel.documentos.find((d) => /vistoria/i.test(d.titulo ?? "") || (d.tipo === "laudo" && /vistoria/i.test(d.url)));
    if (laudo) return [deteccao("sem-vistoria", "nao", "media", "campo:documentos", `Documento publicado: ${laudo.titulo ?? "laudo de vistoria"}.`)];
    const com = achados(cls, COM_VISTORIA).find((a) => !ressalvado(a) && !negado(a));
    if (com) return [deteccao("sem-vistoria", "nao", "baixa", com.texto.origem, trechoDe(com), true)];
    return [desconhecido("sem-vistoria", "A fonte não diz se houve vistoria interna.")];
  },
};

const ACEITA_FINANCIAMENTO = /\b(?:aceita|permite|admite|possibilidade de|e permitid[oa]|pode ser (?:adquirid[oa]|pag[oa]) (?:com|por|mediante))\s+(?:\w+\s+){0,2}?financiamento/;
const NEGA_FINANCIAMENTO =
  /\bnao\s+(?:aceita|permite|admite|e permitid[oa]|ha possibilidade de)\s+(?:\w+\s+){0,2}?financiamento|\bsem\s+(?:possibilidade\s+de\s+)?financiamento|\bexclusivamente\s+a\s+vista\b|\bsomente\s+(?:a\s+vista|recursos proprios)\b|\bvedad[oa]\s+(?:o\s+)?financiamento/;

export const regraFinanciamento: RegraRisco = {
  id: "condicao/financiamento",
  descricao: "Financiamento bancário pelo campo da fonte (Caixa: coluna Financiamento) ou pelo texto. Parcelamento judicial não conta.",
  tags: ["aceita-financiamento"],
  avaliar({ imovel, textos }) {
    if (imovel.aceita_financiamento === true || imovel.aceita_financiamento === false) {
      return [
        deteccao(
          "aceita-financiamento",
          imovel.aceita_financiamento ? "sim" : "nao",
          "alta",
          "campo:aceita_financiamento",
          `Financiamento informado pela fonte em campo próprio: ${imovel.aceita_financiamento ? "sim" : "não"}.`,
        ),
      ];
    }
    const cls = clausulasDe(textos);
    const nega = achados(cls, NEGA_FINANCIAMENTO).find((a) => !ressalvado(a));
    if (nega) return [deteccao("aceita-financiamento", "nao", "media", nega.texto.origem, trechoDe(nega))];
    const aceita = achados(cls, ACEITA_FINANCIAMENTO).find((a) => !ressalvado(a) && !negado(a));
    if (aceita) return [deteccao("aceita-financiamento", "sim", "media", aceita.texto.origem, trechoDe(aceita), true)];
    return [desconhecido("aceita-financiamento", "A fonte não diz se aceita financiamento bancário (parcelamento judicial não conta).", "campo:aceita_financiamento")];
  },
};

export const REGRAS_CONDICAO: readonly RegraRisco[] = [regraFotos, regraVistoria, regraFinanciamento];
