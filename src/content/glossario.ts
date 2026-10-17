/**
 * Glossário dos termos de venda, pagamento e registro (o "i" ao lado de cada campo da página do imóvel).
 * Linguagem simples, sem promessa, e sempre com o lembrete de conferir no edital. As referências legais
 * estão na nota `base` de cada termo. Revisar com o advogado parceiro antes do lançamento.
 */
export type Termo = {
  /** nome como aparece na tela */
  titulo: string;
  /** o que é, em 1 ou 2 frases */
  oQueE: string;
  /** o que muda para quem compra */
  naPratica: string;
  /** base legal ou de onde vem a regra (curta) */
  base?: string;
};

export const GLOSSARIO = {
  // Modalidades
  leilao: {
    titulo: "Leilão",
    oQueE: "Disputa pública, conduzida por um leiloeiro oficial, em que vence o maior lance a partir do valor mínimo do edital. Pode ser judicial (determinado por um juiz) ou extrajudicial (feito pelo banco credor, sem processo).",
    naPratica: "Quem arremata paga, além do lance, a comissão do leiloeiro (em geral 5%), o ITBI e o registro. As regras (prazo de pagamento, quem paga dívidas, ocupação) estão no edital.",
    base: "Judicial: Código de Processo Civil, arts. 879 a 903. Extrajudicial: Lei 9.514/1997, art. 27.",
  },
  leilao_sfi: {
    titulo: "Leilão SFI (Caixa)",
    oQueE: "Leilão de imóvel que foi garantia de um financiamento com alienação fiduciária (Sistema de Financiamento Imobiliário). O comprador deixou de pagar, a Caixa consolidou a propriedade e leva o imóvel a leilão, sem processo na Justiça.",
    naPratica: "Costuma ter 1º e 2º leilão no mesmo edital (\"Edital Único\"). No 1º, o mínimo é o valor do imóvel; no 2º, pode cair para o valor da dívida e despesas. O antigo dono pode ter direito de preferência até o 2º leilão.",
    base: "Lei 9.514/1997, art. 27 (com as mudanças da Lei 14.711/2023).",
  },
  venda_direta: {
    titulo: "Venda direta",
    oQueE: "O imóvel já é da Caixa (os leilões terminaram sem vencedor) e é vendido sem disputa, pelo valor mínimo anunciado.",
    naPratica: "Não há lance: em geral leva quem formaliza primeiro uma proposta válida pelo preço pedido. Por isso o preço não sobe, mas os bons imóveis saem rápido.",
    base: "Regras de venda da Caixa, no edital/condições de cada imóvel.",
  },
  venda_online: {
    titulo: "Venda online",
    oQueE: "Disputa pela internet, no site da Caixa, durante um período definido. Vence a maior proposta igual ou acima do valor mínimo.",
    naPratica: "Funciona como um leilão com prazo: o preço final pode subir acima do mínimo. Leia as condições (pagamento à vista, financiamento, FGTS) antes de propor.",
    base: "Regras de venda da Caixa.",
  },
  licitacao_aberta: {
    titulo: "Licitação aberta",
    oQueE: "Concorrência com edital: as propostas são entregues até uma data e abertas numa sessão; vence a maior, desde que não fique abaixo do mínimo.",
    naPratica: "Tem data e regras rígidas de documentação; perder um prazo do edital desclassifica a proposta.",
    base: "Edital da licitação.",
  },
  // Natureza
  judicial: {
    titulo: "Leilão judicial",
    oQueE: "Venda determinada por um juiz dentro de um processo (cobrança de dívida, condomínio, trabalhista, inventário, falência). O dinheiro paga quem tem direito no processo.",
    naPratica: "Há praças com mínimos fixados no edital. Na 2ª praça, o lance não pode ser \"preço vil\": abaixo do mínimo do edital ou, sem ele, abaixo de 50% da avaliação. Recursos no processo podem atrasar a posse.",
    base: "Código de Processo Civil, arts. 879 a 903 (preço vil: art. 891).",
  },
  extrajudicial: {
    titulo: "Execução extrajudicial",
    oQueE: "Venda feita sem processo na Justiça: o banco credor retoma o imóvel dado em garantia (alienação fiduciária) quando o devedor para de pagar, e o leva a leilão por um leiloeiro.",
    naPratica: "Tende a ser mais rápida que a judicial. O antigo dono pode recomprar até o 2º leilão (direito de preferência), e o imóvel muitas vezes ainda está ocupado: a desocupação, se preciso, é pedida à Justiça depois.",
    base: "Lei 9.514/1997, arts. 26 e 27.",
  },
  // Praças
  praca_1: {
    titulo: "1ª praça (1º leilão)",
    oQueE: "Primeira rodada de lances. O mínimo costuma ser o valor de avaliação (judicial) ou o valor do imóvel no contrato (Leilão SFI).",
    naPratica: "Quase sempre o lance mais caro do processo. Se ninguém arrematar, vem a 2ª praça com mínimo menor.",
  },
  praca_2: {
    titulo: "2ª praça (2º leilão)",
    oQueE: "Segunda rodada, aberta quando ninguém arremata na primeira. O mínimo cai: no judicial, o que o edital fixar (sem ele, 50% da avaliação); no Leilão SFI, o valor da dívida e das despesas.",
    naPratica: "É onde aparecem os maiores descontos, e também a maior concorrência. Confira no edital o mínimo exato.",
    base: "CPC, art. 891; Lei 9.514/1997, art. 27.",
  },
  praca_unica: {
    titulo: "Praça única",
    oQueE: "Uma só oportunidade de compra, sem 2ª rodada (ex.: venda direta, venda online ou edital com praça única).",
    naPratica: "O preço anunciado é o ponto de partida; não espere uma segunda rodada mais barata.",
  },
  // Pagamento
  financiamento: {
    titulo: "Financiamento",
    oQueE: "Parte do valor pode ser paga com crédito imobiliário de um banco, com o próprio imóvel como garantia.",
    naPratica: "Depende da modalidade e da aprovação de crédito antes da compra. Juros, entrada mínima e prazo mudam o retorno: simule com financiamento no simulador.",
  },
  fgts: {
    titulo: "Uso do FGTS",
    oQueE: "Pagar parte do valor com o saldo do FGTS do comprador.",
    naPratica: "Só vale para imóvel residencial e para quem cumpre as regras do FGTS (por exemplo, não ter outro imóvel na mesma cidade); a modalidade precisa aceitar. Confira nas condições do imóvel.",
    base: "Regras do FGTS (Lei 8.036/1990) e condições da venda.",
  },
  parcelamento: {
    titulo: "Parcelamento",
    oQueE: "O próprio vendedor aceita receber em parcelas, sem banco.",
    naPratica: "No leilão judicial, a lei permite proposta com pelo menos 25% à vista e o resto em até 30 parcelas corrigidas, com o imóvel em garantia (hipoteca). Proposta à vista costuma ter preferência.",
    base: "Código de Processo Civil, art. 895.",
  },
  consorcio: {
    titulo: "Carta de consórcio",
    oQueE: "Pagar com a carta de crédito de um consórcio imobiliário contemplado.",
    naPratica: "Precisa da aprovação da administradora do consórcio antes do prazo de pagamento.",
  },
  // Ocupação
  ocupacao: {
    titulo: "Ocupação",
    oQueE: "Se há alguém morando ou usando o imóvel (o antigo dono, um inquilino ou outra pessoa).",
    naPratica: "Imóvel ocupado pode exigir acordo ou ação na Justiça para a desocupação, com custo e prazo incertos. Quando a fonte não informa, procure no edital, no processo ou visite a região.",
  },
  // Registro
  matricula: {
    titulo: "Matrícula",
    oQueE: "A \"certidão de nascimento\" do imóvel no Cartório de Registro de Imóveis: quem é o dono, a área, e os ônus (hipoteca, penhora, alienação fiduciária).",
    naPratica: "Leia a matrícula atualizada antes do lance: ela mostra penhoras e outras dívidas registradas que podem afetar a compra.",
    base: "Lei de Registros Públicos (Lei 6.015/1973).",
  },
  cartorio: {
    titulo: "Cartório, comarca e ofício",
    oQueE: "Onde a matrícula está registrada: a comarca (cidade) e o número do Ofício de Registro de Imóveis.",
    naPratica: "É nesse cartório que você pede a certidão atualizada da matrícula e registra a compra depois.",
  },
  inscricao_imobiliaria: {
    titulo: "Inscrição imobiliária",
    oQueE: "O número do imóvel no cadastro da prefeitura, o mesmo do carnê do IPTU.",
    naPratica: "Com ele você consulta na prefeitura se há IPTU atrasado e qual o valor venal (que pode influir no ITBI).",
  },
  averbacao_leiloes_negativos: {
    titulo: "Averbação dos leilões negativos",
    oQueE: "Registro, na matrícula, de que os leilões do contrato de financiamento terminaram sem vencedor. Com isso, a dívida do antigo dono se extingue e a Caixa fica livre para vender o imóvel.",
    naPratica: "\"Averbado\" quer dizer que esse passo já está na matrícula, o que dá mais segurança à compra. Sem a averbação, peça à Caixa a previsão antes de fechar.",
    base: "Lei 9.514/1997, art. 27.",
  },
  direito_preferencia: {
    titulo: "Direito de preferência",
    oQueE: "Na execução extrajudicial, o antigo dono pode recomprar o imóvel pagando a dívida e as despesas, até a data do 2º leilão.",
    naPratica: "Se ele exercer esse direito, a venda para você não acontece. Por isso o 2º leilão é o momento mais seguro nessa modalidade.",
    base: "Lei 9.514/1997, art. 27, § 2º-B.",
  },
  comitente: {
    titulo: "Comitente",
    oQueE: "Quem está vendendo: o banco, o tribunal ou o órgão que contratou o leilão.",
    naPratica: "É a parte com quem ficam as regras de pagamento e a quem se pedem esclarecimentos, junto com o leiloeiro.",
  },
  leiloeiro: {
    titulo: "Leiloeiro",
    oQueE: "Profissional oficial, registrado na Junta Comercial, que conduz o leilão e recebe a comissão.",
    naPratica: "A comissão (em geral 5% do lance) é paga por quem arremata, além do lance. O site do leiloeiro tem o edital e o lance ao vivo.",
    base: "Decreto 21.981/1932.",
  },
} satisfies Record<string, Termo>;

export type ChaveGlossario = keyof typeof GLOSSARIO;

/** Termo para uma modalidade da base ("leilao", "venda_direta"...), considerando o nome da fonte (Leilão SFI). */
export function termoModalidade(modalidade: string, modalidadeFonte: string | null): ChaveGlossario | null {
  if (modalidade === "leilao") return /sfi|edital\s*u/i.test(modalidadeFonte ?? "") ? "leilao_sfi" : "leilao";
  if (modalidade === "venda_direta" || modalidade === "venda_online" || modalidade === "licitacao_aberta") return modalidade;
  return null;
}
