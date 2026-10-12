/**
 * Limiares e parâmetros das regras de risco, num lugar só.
 *
 * ATENÇÃO: nenhum destes números foi validado. Eles vêm do catálogo de fontes (§4), da crítica
 * e da medição do CSV da Caixa de 08/10/2026 (mediana de deságio 42,1%; p25 38,2%; p75 48,0%).
 * Precisam ser revistos com o advogado parceiro e com dados de mais fontes antes de virar
 * promessa no site. Mudar um valor aqui muda as tags na próxima execução de `riscos`.
 */
import type { Confianca } from "../../tipos.ts";

export interface ConfigRiscos {
  /** Deságio (1 − preço/avaliação, em %) a partir do qual vale "Deságio alto". */
  desagioAltoMinPct: number;
  /** Deságio abaixo do qual vale "Deságio baixo" (inclui preço acima da avaliação). */
  desagioBaixoMaxPct: number;
  /**
   * Quanto o preço precisa passar da avaliação (em %) para "Preço acima do mercado". A tag só
   * compara com a AVALIAÇÃO, que não é preço de mercado: sai sempre com revisão humana.
   */
  precoAcimaAvaliacaoMinPct: number;
  /**
   * Preço maior que a avaliação vezes este fator é provável erro de cadastro na fonte (o CSV da
   * Caixa de 08/10/2026 tem preço de até 174× a avaliação): a tag sai com confiança baixa.
   */
  razaoPrecoAvaliacaoSuspeita: number;
  /** Comissão do leiloeiro acima disto (em %) conta como custo extra (o piso usual é 5%). */
  comissaoUsualMaxPct: number;
  /** Dívidas que passam ao arrematante, somadas, acima desta fração da avaliação = custo extra alto. */
  dividaRelevanteFracaoAvaliacao: number;
  /** Diferença relativa entre a área do título e a da descrição acima da qual a área diverge. */
  toleranciaAreaFracao: number;
  /** Texto mínimo (caracteres) para tratar a ausência de sinais como informação ("Imóvel inteiro"). */
  textoMinimoParaAusencia: number;
  /**
   * Confiança da avaliação por fonte, usada no deságio. A Caixa publica a avaliação em coluna
   * própria; na Leilões Judiciais a avaliação é `vl_lanceminimo`, campo não documentado
   * (conferido em 7 lotes da sonda). Fonte não listada: "media".
   */
  confiancaAvaliacaoPorFonte: Readonly<Record<string, Confianca>>;
  /** Fontes da Caixa (texto-padrão da ficha e regras do Leilão SFI). */
  fontesCaixa: readonly string[];
}

export const CONFIG_RISCOS: ConfigRiscos = {
  // Precisa de validação: 40% fica perto da mediana da Caixa (42%), então metade da Caixa sai
  // como "Deságio alto". Talvez o certo seja um limiar por modalidade ou por praça.
  desagioAltoMinPct: 40,
  // Precisa de validação: abaixo de 20% a comissão (5%), o ITBI (2–3%) e o registro comem o
  // desconto, mas o número exato depende da cidade e do tipo de leilão.
  desagioBaixoMaxPct: 20,
  precoAcimaAvaliacaoMinPct: 0,
  razaoPrecoAvaliacaoSuspeita: 3,
  comissaoUsualMaxPct: 5,
  // Precisa de validação: 10% da avaliação é o teto que a própria Caixa usa para condomínio e
  // tributos na regra de despesas da ficha.
  dividaRelevanteFracaoAvaliacao: 0.1,
  // Precisa de validação: tolerância de 10% entre áreas (o material não define uma).
  toleranciaAreaFracao: 0.1,
  textoMinimoParaAusencia: 150,
  confiancaAvaliacaoPorFonte: { caixa_csv: "alta", leiloesjudiciais_api: "media" },
  fontesCaixa: ["caixa_csv"],
};
