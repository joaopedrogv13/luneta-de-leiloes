/**
 * Preço: deságio alto, deságio baixo, preço acima do mercado, custos extras altos.
 *
 * - Deságio = `desconto_pct` calculado pelo núcleo (1 − preço/avaliação), nunca a coluna
 *   "Desconto" da Caixa (que fica em 0 quando o preço passa da avaliação). Limiares em
 *   config.ts (padrão: alto ≥ 40%, baixo < 20%; precisam de validação).
 * - "Preço acima do mercado" só compara com a AVALIAÇÃO, que não é preço de mercado: sai como
 *   "preço acima da avaliação", sempre com revisão humana. Sem referência de mercado no
 *   material, preço abaixo da avaliação não prova nada: fica "desconhecido".
 * - Custos extras: comissão acima de 5%, laudêmio/foro/terreno de marinha, regularização de
 *   construção a cargo do arrematante, baixa de gravames a cargo do arrematante quando o texto
 *   declara gravames, e dívidas que passam ao arrematante somando 10% ou mais da avaliação.
 *   ITBI, registro e comissão de 5% são custos normais de todo leilão e não contam.
 */
import type { Confianca, ImovelGravado } from "../../tipos.ts";
import { lerNumeroBR } from "../../util/numero.ts";
import type { RegraRisco } from "../motor.ts";
import {
  achados,
  clausulaDeIntimacao,
  clausulasDe,
  desconhecido,
  deteccao,
  extra,
  maisForte,
  moeda,
  porcento,
  ressalvado,
  ressalvadoDepois,
  trechoDaClausula,
  trechoDe,
  type Achado,
} from "./apoio.ts";
import { CONFIG_RISCOS, type ConfigRiscos } from "./config.ts";
import { analisarDividaPassa, dividasDeclaradas, gravamesDeclarados, RESPONSABILIDADE_DO_ARREMATANTE } from "./sinais.ts";

/** Confiança da avaliação da fonte (config) rebaixada quando a própria fonte se contradiz. */
function confiancaDaAvaliacao(imovel: ImovelGravado, fonteId: string, config: ConfigRiscos): { confianca: Confianca; revisar: boolean } {
  if (extra(imovel, "avaliacao_confere") === false) return { confianca: "baixa", revisar: true };
  return { confianca: config.confiancaAvaliacaoPorFonte[fonteId] ?? "media", revisar: false };
}

export function criarRegraDesagio(config: ConfigRiscos = CONFIG_RISCOS): RegraRisco {
  return {
    id: "preco/desagio",
    descricao: `Deságio sobre a avaliação: alto a partir de ${config.desagioAltoMinPct}%, baixo abaixo de ${config.desagioBaixoMaxPct}%.`,
    tags: ["desagio-alto", "desagio-baixo"],
    avaliar({ imovel, fonte }) {
      const d = imovel.desconto_pct;
      if (d === null || imovel.preco === null || imovel.valor_avaliacao === null || imovel.valor_avaliacao === undefined || imovel.preco === undefined) {
        const motivo = imovel.valor_avaliacao ? "Sem preço mínimo para calcular o deságio." : "A fonte não informa a avaliação: não dá para calcular o deságio.";
        return [desconhecido("desagio-alto", motivo, "campo:valor_avaliacao"), desconhecido("desagio-baixo", motivo, "campo:valor_avaliacao")];
      }
      const { confianca, revisar } = confiancaDaAvaliacao(imovel, fonte?.id ?? imovel.fonte_id, config);
      const trecho =
        d >= 0
          ? `Preço mínimo ${moeda(imovel.preco)} sobre avaliação de ${moeda(imovel.valor_avaliacao)}: deságio de ${porcento(d)}.`
          : `Preço mínimo ${moeda(imovel.preco)} acima da avaliação de ${moeda(imovel.valor_avaliacao)}: sem deságio.`;
      const origem = "campo:preco×valor_avaliacao";
      const alto = d >= config.desagioAltoMinPct;
      const baixo = d < config.desagioBaixoMaxPct;
      return [
        deteccao("desagio-alto", alto ? "sim" : "nao", confianca, origem, trecho, revisar && alto),
        deteccao("desagio-baixo", baixo ? "sim" : "nao", confianca, origem, trecho, revisar && baixo),
      ];
    },
  };
}

export function criarRegraPrecoAcima(config: ConfigRiscos = CONFIG_RISCOS): RegraRisco {
  return {
    id: "preco/acima-avaliacao",
    descricao: "Preço mínimo acima da avaliação (não do mercado: a avaliação não é preço de mercado). Sempre com revisão.",
    tags: ["preco-acima-mercado"],
    avaliar({ imovel }) {
      const preco = imovel.preco ?? null;
      const avaliacao = imovel.valor_avaliacao ?? null;
      if (preco === null || avaliacao === null || avaliacao <= 0 || preco <= 0) {
        return [desconhecido("preco-acima-mercado", "Sem avaliação para comparar e sem referência de preço de mercado.", "campo:valor_avaliacao")];
      }
      const acima = (preco / avaliacao - 1) * 100;
      if (acima > config.precoAcimaAvaliacaoMinPct) {
        const suspeito = preco / avaliacao > config.razaoPrecoAvaliacaoSuspeita;
        const trecho =
          `Preço mínimo ${moeda(preco)} está ${porcento(acima)} acima da avaliação (${moeda(avaliacao)}). ` +
          "A comparação é com a avaliação, que não é preço de mercado." +
          (suspeito ? " Diferença grande demais: pode ser erro de cadastro na fonte." : "");
        return [deteccao("preco-acima-mercado", "sim", suspeito ? "baixa" : "media", "campo:preco>valor_avaliacao", trecho, true)];
      }
      return [
        desconhecido(
          "preco-acima-mercado",
          `Preço mínimo não passa da avaliação (${moeda(avaliacao)}), mas não há referência de preço de mercado para comparar.`,
          "campo:preco×valor_avaliacao",
        ),
      ];
    },
  };
}

// ---------------------------------------------------------------------------
// Custos extras
// ---------------------------------------------------------------------------

interface SinalCusto {
  confianca: Confianca;
  origem: string;
  trecho: string;
}

const COMISSAO = /\bcomissao\b[^;]{0,120}?\b(\d{1,2}(?:[.,]\d{1,2})?)\s*%/;
const CONTEXTO_MULTA = /\bmulta\b|\bperd\w*|\binadimpl\w*|\bdesistencia\b|\badjudica\w*|\bremi(?:cao|ssao)\b|\bacordo\b/;
const FORO_LAUDEMIO =
  /\b(?:laudemio|terrenos? de marinha|acrescidos? de marinha|aforamento|aforad[oa]|enfiteuse|enfiteutic\w*|foreiro|foro anual|taxa de ocupacao)\b/;
const BOILERPLATE_CTN = /fato gerador|dominio util ou a posse|\bctn\b/;
const REGULARIZACAO = /\bregulariza(?:cao|coes|r)\b/;
const OBJETO_REGULARIZACAO = /benfeitori|construc|edificac|averbac|averbad|area|habite|prefeitura|orgaos? competentes|documenta/;
const BAIXA_GRAVAMES = /\b(?:baixa|cancelamento|levantamento)\s+(?:de\s+|das?\s+|dos?\s+)?(?:eventua\w+\s+)?(?:gravames|penhoras|indisponibilidades|onus|constricoes|hipotecas?)/;

function sinaisDeCusto(imovel: ImovelGravado, cls: ReturnType<typeof clausulasDe>, config: ConfigRiscos): SinalCusto[] {
  const sinais: SinalCusto[] = [];
  const doAchado = (a: Achado, confianca: Confianca): SinalCusto => ({ confianca, origem: a.texto.origem, trecho: trechoDe(a) });

  // a) Comissão acima do usual.
  for (const a of achados(cls, COMISSAO)) {
    if (CONTEXTO_MULTA.test(a.clausula.n) || ressalvado(a)) continue;
    const pct = lerNumeroBR(a.grupos[1] ?? "", { decimal: "," });
    if (pct !== null && pct > config.comissaoUsualMaxPct && pct <= 20) {
      sinais.push(doAchado(a, "media"));
      break;
    }
  }
  // b) Laudêmio, foro, terreno de marinha, aforamento.
  for (const a of achados(cls, FORO_LAUDEMIO)) {
    if (ressalvado(a) || ressalvadoDepois(a) || clausulaDeIntimacao(a.clausula) || BOILERPLATE_CTN.test(a.clausula.n)) continue;
    sinais.push(doAchado(a, "media"));
    break;
  }
  // c) Regularização de construção ou documentação a cargo do arrematante.
  for (const a of achados(cls, REGULARIZACAO)) {
    if (ressalvado(a, 40)) continue;
    if (!OBJETO_REGULARIZACAO.test(a.clausula.n) || !RESPONSABILIDADE_DO_ARREMATANTE.test(a.clausula.n)) continue;
    sinais.push({ confianca: "media", origem: a.texto.origem, trecho: trechoDaClausula(a) });
    break;
  }
  // d) Baixa de gravames a cargo do arrematante, quando o texto declara gravames.
  if (gravamesDeclarados(cls).length > 0) {
    for (const a of achados(cls, BAIXA_GRAVAMES)) {
      if (!RESPONSABILIDADE_DO_ARREMATANTE.test(a.clausula.n)) continue;
      sinais.push({ confianca: "baixa", origem: a.texto.origem, trecho: trechoDaClausula(a) });
      break;
    }
  }
  // e) Dívidas declaradas que passam ao arrematante, somando uma fração relevante da avaliação.
  const avaliacao = imovel.valor_avaliacao ?? null;
  const passa = analisarDividaPassa(cls);
  if (avaliacao && passa.positivos.length > 0) {
    const declaradas = [...dividasDeclaradas(cls, "condominio").positivos, ...dividasDeclaradas(cls, "iptu").positivos];
    const vistos = new Set<string>();
    let soma = 0;
    for (const d of declaradas) {
      const chave = `${d.achado.texto.origem}:${d.achado.clausula.inicio}`;
      if (d.valor === null || vistos.has(chave)) continue;
      vistos.add(chave);
      soma += d.valor;
    }
    if (soma >= config.dividaRelevanteFracaoAvaliacao * avaliacao) {
      const primeira = declaradas.find((d) => d.valor !== null);
      sinais.push({
        confianca: "media",
        origem: primeira?.achado.texto.origem ?? "descricao",
        trecho: `Dívidas declaradas de ${moeda(soma)} (${porcento((soma / avaliacao) * 100)} da avaliação) e o texto põe dívida na conta do arrematante. ${primeira ? trechoDe(primeira.achado, 60) : ""}`.trim(),
      });
    }
  }
  return sinais;
}

export function criarRegraCustosExtras(config: ConfigRiscos = CONFIG_RISCOS): RegraRisco {
  return {
    id: "preco/custos-extras",
    descricao: "Comissão acima de 5%, laudêmio/foro, regularização ou baixa de gravames a cargo do arrematante, dívidas que passam ≥ 10% da avaliação.",
    tags: ["custos-extras-altos"],
    avaliar({ imovel, textos }) {
      const sinais = sinaisDeCusto(imovel, clausulasDe(textos), config);
      const melhor = maisForte(sinais);
      if (!melhor) return [desconhecido("custos-extras-altos", "O texto não traz custo além dos usuais (comissão de 5%, ITBI, registro).")];
      return [deteccao("custos-extras-altos", "sim", melhor.confianca, melhor.origem, melhor.trecho, true)];
    },
  };
}

export const REGRAS_PRECO: readonly RegraRisco[] = [criarRegraDesagio(), criarRegraPrecoAcima(), criarRegraCustosExtras()];
