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
  /**
   * O aviso por e-mail quando um favorito muda de praça, no MARKETING (landing, tabela de planos, FAQ, chamadas da
   * Luneta). Ligado em 23/10/2026 por decisão do dono (rodada 5, ponto 8: "dê mais foco aos favoritos em 2ª praça com
   * notificação por e-mail"), antes de o envio existir. O back-end é OBRIGATÓRIO antes do lançamento: contas, favoritos
   * no servidor, comparação da praça a cada atualização da base e fila de e-mails (PENDENCIAS.md, "Back-end: favoritos
   * e alerta de mudança de praça"). Enquanto `envioDeEmail` for false, a demonstração guarda a preferência só no
   * navegador e diz que o envio começa no lançamento.
   */
  alertaPraca: true,
  /**
   * O envio de e-mails existe de verdade (login, favoritos no servidor, comparação a cada atualização, fila de envio com
   * consentimento e descadastro). Hoje (23/10/2026) não: nenhum e-mail é coletado nem enviado.
   */
  envioDeEmail: false,
} as const;

/** As tags de risco, em uma frase curta (chamada da Luneta, cartão da tabela, janela). */
export const TAGS_CHAMADA = PRODUTO.leituraDoEdital
  ? "Ocupação, dívidas, ações e matrícula em cada leilão, com o trecho de onde veio cada alerta."
  : "Os alertas que os dados da fonte já mostram (financiamento, direito de preferência do devedor, deságio e praça), com a origem de cada um.";

/** Os favoritos, em uma frase curta. */
export const FAVORITOS_CHAMADA = PRODUTO.alertaPraca
  ? "Marque os imóveis que você acompanha e receba um e-mail quando a praça mudar, com o novo lance mínimo e a data."
  : "Marque os imóveis que você acompanha e volte a eles num toque.";

/** O aviso ao favoritar, na demonstração (o e-mail é uma opção do favorito, e o envio só existe com `envioDeEmail`). */
export const TOAST_FAVORITADO = PRODUTO.alertaPraca
  ? "Favoritado. Ligue o aviso por e-mail para saber se a praça ou o preço mudar (demonstração)."
  : "Favoritado. Ele fica na sua lista de favoritos (demonstração).";

/** "favoritos com alerta de praça" ou só "favoritos", nas listas do que a Luneta tem. */
export const FAVORITOS_ROTULO = PRODUTO.alertaPraca ? "favoritos com alerta de praça" : "favoritos";

/**
 * A opção "Avisar por e-mail quando a praça mudar" do botão de favorito (catálogo e página do imóvel). Enquanto não
 * houver envio de verdade, a tela diz que a preferência fica só neste navegador e que o envio começa no lançamento.
 */
export const ALERTA_PRACA = {
  opcao: "Avisar por e-mail quando a praça mudar",
  explicacao: "Na 2ª praça (ou em qualquer mudança de praça, data ou lance mínimo), você recebe um e-mail com o novo lance mínimo e a data.",
  demonstracao: PRODUTO.envioDeEmail
    ? null
    : "Demonstração: a preferência fica só neste navegador; o envio de e-mails começa no lançamento.",
  ligado: PRODUTO.envioDeEmail ? "Aviso por e-mail ligado." : "Aviso ligado (demonstração: o envio de e-mails começa no lançamento).",
  desligado: "Aviso por e-mail desligado.",
  /**
   * Praça única (venda direta, venda online, licitação: nunca vão à 2ª praça): o mesmo aviso, com o que de fato pode
   * mudar (o preço, ou o imóvel sair da venda). O back-end compara os dois (PENDENCIAS.md, "Back-end: favoritos e alerta
   * de mudança de praça", item 4). Revisão final da rodada 5, CONT-03.
   */
  unica: {
    opcao: "Avisar por e-mail se o preço mudar ou o imóvel sair da venda",
    explicacao: "Este imóvel é de praça única (não vai à 2ª praça). Se o preço mudar, ou se ele for vendido ou retirado da venda, você recebe um e-mail.",
  },
} as const;

/** O texto da opção do aviso para o imóvel: o da mudança de praça, ou o da praça única. */
export function textoAlerta(pracaUnica: boolean): { opcao: string; explicacao: string } {
  return pracaUnica ? ALERTA_PRACA.unica : ALERTA_PRACA;
}
