/**
 * Documentação: matrícula com pendência, construção irregular, área divergente.
 *
 * - Matrícula: indisponibilidade, hipoteca, bloqueio, gravame, arrolamento ou alienação
 *   fiduciária não baixada declarados no texto ("Há indisponibilidade", "Imóvel objeto de
 *   HIPOTECA") → média; atos de matrícula ("AV.10 - INDISPONIBILIDADE", "R.12 Hipoteca") →
 *   baixa (o ato pode ter sido cancelado depois). Na Caixa, "Averbação dos leilões negativos"
 *   diferente de "Averbado" → baixa. Penhoras ficam na tag própria. Sempre com revisão.
 *   "Não há registro de ônus" é contrassinal.
 * - Construção irregular: benfeitoria/construção "não averbada", "sem habite-se", "irregular
 *   perante a prefeitura"; e matrícula que descreve terreno "sem benfeitoria" quando o texto
 *   diz que há construção. Sempre com revisão.
 * - Área divergente: texto que declara divergência de área, ou área do título diferente de
 *   todas as áreas dos campos (tolerância em config.ts). Texto-modelo "ad corpus" ("havendo
 *   divergência de metragem...") não conta.
 */
import { lerNumeroBR } from "../../util/numero.ts";
import { normalizarTexto } from "../../util/texto.ts";
import type { RegraRisco } from "../motor.ts";
import { achados, clausulaDeIntimacao, clausulasDe, desconhecido, deteccao, extra, negado, ressalvado, trechoDe, type Achado } from "./apoio.ts";
import { CONFIG_RISCOS, type ConfigRiscos } from "./config.ts";

// ---------------------------------------------------------------------------
// Matrícula
// ---------------------------------------------------------------------------

const PENDENCIA_DECLARADA = new RegExp(
  [
    String.raw`\b(?:ha|existe[m]?|consta[m]?|com|possui|constando)\s+(?:registros?\s+de\s+)?(?:indisponibilidades?|bloqueios?|gravames?|onus reais|arrolamentos?|hipotecas?)\b`,
    String.raw`\b(?:objeto|alvo)\s+de\s+(?:\w+\s+e\s+)?(?:hipotecas?|indisponibilidades?|bloqueios?|gravames?|arrolamentos?)\b`,
    String.raw`\bindisponibilidades?\s+(?:de\s+bens\s+)?(?:em|nos|de|oriundas?\s+de)\s+outr[oa]s?\s+(?:processos?|autos|feitos)`,
    String.raw`\b(?:hipoteca|alienacao fiduciaria)\b[^;.]{0,30}\bnao\s+baixad[oa]\b`,
    String.raw`\bpendencias?\s+(?:registra\w*|na matricula|documenta\w*|cartorari\w*|junto ao (?:cartorio|registro))`,
    String.raw`\bmatricula\s+(?:bloqueada|irregular|com pendencias?)`,
  ].join("|"),
);
const ATO_DE_MATRICULA = /\b(?:r|av)\.?\s*-?\s*\d{1,3}\b[^;.]{0,30}?\b(?:indisponibilidade|hipoteca|arrolamento|bloqueio|alienacao fiduciaria)\b/;
const ONUS_ROTULADO = /\bonus(?:\/observac(?:ao|oes))?\s*:\s*(?:[rv]\.|av\.|r\s?\d)/;
const ATO_CANCELADO = /^[^;.]{0,50}\b(?:cancelad[oa]|baixad[oa]|extint[oa])\b/;
const LIMPEZA = /(?:cancelamento|baixa|levantamento)\s+(?:de\s+|das?\s+|dos?\s+)?(?:eventua\w+\s+)?$/;
const SEM_ONUS = /\bnao\s+ha\s+registro\s+(?:ou certificacao\s+)?de\s+onus\b|\b(?:imovel|bem)\s+sem\s+(?:onus|gravames)\b|\bnada consta\b[^;]{0,30}\bonus\b/;

export const regraMatricula: RegraRisco = {
  id: "documentacao/matricula",
  descricao: "Indisponibilidade, hipoteca, bloqueio, gravame ou alienação não baixada declarados no texto ou em ato de matrícula.",
  tags: ["matricula-pendencia"],
  avaliar({ imovel, textos }) {
    const cls = clausulasDe(textos);
    const valido = (a: Achado): boolean => !ressalvado(a) && !negado(a) && !clausulaDeIntimacao(a.clausula) && !LIMPEZA.test(a.antes);
    const declarada = achados(cls, PENDENCIA_DECLARADA).find(valido);
    if (declarada) return [deteccao("matricula-pendencia", "sim", "media", declarada.texto.origem, trechoDe(declarada), true)];
    const ato = [...achados(cls, ATO_DE_MATRICULA), ...achados(cls, ONUS_ROTULADO)].find((a) => valido(a) && !ATO_CANCELADO.test(a.depois));
    if (ato) return [deteccao("matricula-pendencia", "sim", "baixa", ato.texto.origem, trechoDe(ato), true)];
    const averbacao = extra(imovel, "averbacao_leiloes_negativos");
    if (typeof averbacao === "string" && /nao averbad|pendente|a averbar/.test(normalizarTexto(averbacao))) {
      return [deteccao("matricula-pendencia", "sim", "baixa", "campo:averbacao_leiloes_negativos", `Averbação dos leilões negativos: ${averbacao}.`, true)];
    }
    const sem = achados(cls, SEM_ONUS)[0];
    if (sem) return [deteccao("matricula-pendencia", "nao", "media", sem.texto.origem, trechoDe(sem), true)];
    return [desconhecido("matricula-pendencia", "A fonte não traz pendências da matrícula.")];
  },
};

// ---------------------------------------------------------------------------
// Construção irregular
// ---------------------------------------------------------------------------

const CONSTRUCAO_IRREGULAR = new RegExp(
  [
    String.raw`\b(?:benfeitorias?|construc(?:ao|oes)|edificac(?:ao|oes)|ampliac(?:ao|oes)|acrescimos?|area construida|reformas?)\b[^;]{0,80}?\bnao\s+(?:se\s+)?(?:encontra[m]?\s+|esta[o]?\s+|foi\s+|foram\s+|estao\s+)?(?:devidamente\s+)?(?:averbad|regularizad|aprovad|licenciad|regularment)\w*`,
    String.raw`\bnao\s+averbad[oa]s?\s+(?:na|no|junto)\s+(?:a\s+)?(?:matricula|registro|cartorio|cri)\b`,
    String.raw`\b(?:construc(?:ao|oes)|edificac(?:ao|oes)|benfeitorias?|ampliac(?:ao|oes))\s+(?:irregular\w*|clandestin\w*|nao averbad\w*|sem averbacao|sem aprovacao)`,
    String.raw`\bsem\s+(?:o\s+)?habite[- ]?se\b`,
    String.raw`\bsem\s+(?:alvara|projeto aprovado|aprovacao (?:da|na|pela) prefeitura)`,
    String.raw`\birregular(?:idades?|es)?\s+(?:perante|junto a|na|com a)\s+(?:a\s+)?(?:prefeitura|municipio|municipalidade|orgaos? (?:publicos|competentes))`,
    String.raw`\b(?:ordem|acao|risco|sujeit[oa]s?|passivel)\s+(?:de\s+|a\s+)?demolicao\b`,
  ].join("|"),
);
const SEM_BENFEITORIA = /\bsem\s+benfeitorias?(?:\s+alguma)?\b/;
const CONSTRUIDO_DE_FATO = /\b(?:foi|foram)\s+(?:construid|edificad|erigid)\w*|\bha\s+(?:uma?\s+)?(?:casa|construcao|edificacao|predio)\s+(?:construid|edificad|erguid)\w*/;

export const regraConstrucao: RegraRisco = {
  id: "documentacao/construcao",
  descricao: "Construção não averbada, sem habite-se ou irregular; ou terreno 'sem benfeitoria' com construção de fato.",
  tags: ["construcao-irregular"],
  avaliar({ textos }) {
    const cls = clausulasDe(textos);
    const explicita = achados(cls, CONSTRUCAO_IRREGULAR).find((a) => !ressalvado(a, 50));
    if (explicita) return [deteccao("construcao-irregular", "sim", "media", explicita.texto.origem, trechoDe(explicita), true)];
    // Matrícula de terreno "sem benfeitoria" e oficial/laudo dizendo que há construção.
    const semBenfeitoria = achados(cls, SEM_BENFEITORIA)[0];
    if (semBenfeitoria) {
      const construido = achados(cls, CONSTRUIDO_DE_FATO).find(
        (a) => a.texto === semBenfeitoria.texto && a.inicio > semBenfeitoria.inicio && a.inicio - semBenfeitoria.fim < 1500,
      );
      if (construido) {
        return [
          deteccao(
            "construcao-irregular",
            "sim",
            "baixa",
            construido.texto.origem,
            `${trechoDe(semBenfeitoria, 40)} … ${trechoDe(construido, 80)}`,
            true,
          ),
        ];
      }
    }
    return [desconhecido("construcao-irregular", "A fonte não menciona construção irregular ou não averbada.")];
  },
};

// ---------------------------------------------------------------------------
// Área divergente
// ---------------------------------------------------------------------------

const AREA_DIVERGENTE = new RegExp(
  [
    String.raw`\bdivergencias?\s+(?:de|da|das|entre|na|nas)\s+(?:a\s+|as\s+)?(?:areas?|metragens?|medidas|dimensoes|confrontacoes)`,
    String.raw`\barea\s+(?:real\s+)?divergente\b`,
    String.raw`\b(?:areas?|metragens?)\s+(?:real\s+|construida\s+|do imovel\s+)?(?:diverge[m]?|difere[m]?|nao\s+(?:confere[m]?|corresponde[m]?|coincide[m]?|bate[m]?))\b`,
    String.raw`\bdiferenca\s+(?:de|entre\s+(?:as\s+)?)\s*(?:areas?|metragens?)\b`,
    String.raw`\barea\s+(?:construida\s+)?(?:real\s+)?(?:maior|menor|superior|inferior)\s+(?:a|que|do que)\s+(?:a\s+)?(?:constante|registrada|averbada|da matricula|do registro|do cadastro|do iptu)`,
  ].join("|"),
);
const AREA_NO_TITULO = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)\s*m(?:²|2)(?![\p{L}\d])/u;

function areaDoTitulo(titulo: string): number | null {
  const m = AREA_NO_TITULO.exec(normalizarTexto(titulo));
  return m?.[1] ? lerNumeroBR(m[1], { decimal: "," }) : null;
}

export function criarRegraArea(config: ConfigRiscos = CONFIG_RISCOS): RegraRisco {
  return {
    id: "documentacao/area",
    descricao: "Divergência de área declarada no texto, ou área do título diferente das áreas informadas.",
    tags: ["area-divergente"],
    avaliar({ imovel, textos }) {
      const cls = clausulasDe(textos);
      const declarada = achados(cls, AREA_DIVERGENTE).find((a) => !ressalvado(a) && !negado(a));
      if (declarada) return [deteccao("area-divergente", "sim", "baixa", declarada.texto.origem, trechoDe(declarada), true)];
      const doTitulo = areaDoTitulo(imovel.titulo);
      const campos = [imovel.area_privativa, imovel.area_total, imovel.area_terreno].filter((a): a is number => typeof a === "number" && a > 0);
      if (doTitulo !== null && doTitulo > 0 && campos.length > 0) {
        const bate = campos.some((a) => Math.abs(a - doTitulo) / Math.max(a, doTitulo) <= config.toleranciaAreaFracao);
        if (!bate) {
          return [
            deteccao(
              "area-divergente",
              "sim",
              "baixa",
              "titulo×campos",
              `Título com ${lerArea(doTitulo)} m²; áreas informadas: ${campos.map(lerArea).join(", ")} m².`,
              true,
            ),
          ];
        }
      }
      return [desconhecido("area-divergente", "A fonte não aponta divergência de área.")];
    },
  };
}

function lerArea(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export const REGRAS_DOCUMENTACAO: readonly RegraRisco[] = [regraMatricula, regraConstrucao, criarRegraArea()];
