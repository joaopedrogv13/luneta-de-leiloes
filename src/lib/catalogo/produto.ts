/**
 * O que o produto já tem de verdade, para a landing e as chamadas da Luneta não venderem o que ainda não existe
 * (revisão final da rodada 4, R4-VAZ-01 e R4-VAZ-09). Cada chave liga as frases que dependem dela; enquanto for false,
 * a tela usa o texto de hoje. Ligar é decisão do dono, depois de conferir os dados (ver PENDENCIAS.md, "Rodada 4 ·
 * revisão final").
 *
 * Sem imports com "@/": planos.ts e os testes rodam em Node puro.
 */
export const PRODUTO = {
  /**
   * As tags de posse, dívida, jurídico e matrícula vêm da leitura da página e do edital de cada leilão (as fichas da
   * Caixa, os editais). Hoje (18/10/2026) a base só tem a lista da Caixa: das 86 mil tags, nenhuma vem do edital, da
   * ficha ou do processo; ocupado/desocupado, ação judicial e dívida quase não aparecem. O teste
   * src/content/site.test.ts só deixa ligar com a proporção mínima dessas tags vindas de texto.
   */
  leituraDoEdital: false,
  /** O aviso por e-mail quando um favorito muda de praça. Ainda não existe (não há login nem envio de e-mail). */
  alertaPraca: false,
} as const;

/** As tags de risco, em uma frase curta (chamada da Luneta, cartão da tabela, janela). */
export const TAGS_CHAMADA = PRODUTO.leituraDoEdital
  ? "Ocupação, dívidas, ações e matrícula em cada leilão, com o trecho de onde veio cada alerta."
  : "Os alertas que os dados da fonte já mostram (financiamento, direito de preferência do devedor, deságio e praça), com a origem de cada um.";

/** Os favoritos, em uma frase curta. */
export const FAVORITOS_CHAMADA = PRODUTO.alertaPraca
  ? "Marque os imóveis que você acompanha e receba um aviso quando a praça mudar."
  : "Marque os imóveis que você acompanha e volte a eles num toque.";

/** O aviso ao favoritar (o e-mail só é prometido quando existir). */
export const TOAST_FAVORITADO = PRODUTO.alertaPraca
  ? "Favoritado. Você será avisado por e-mail quando a praça mudar (demonstração)."
  : "Favoritado. Ele fica na sua lista de favoritos (demonstração).";

/** "favoritos com alerta de praça" ou só "favoritos", nas listas do que a Luneta tem. */
export const FAVORITOS_ROTULO = PRODUTO.alertaPraca ? "favoritos com alerta de praça" : "favoritos";
