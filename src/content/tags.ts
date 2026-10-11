/**
 * Tags de risco (blueprint, Passo 2 · Clusterização). A cor indica a gravidade e vem sempre
 * acompanhada de ícone e texto: vermelho grave, amarelo atenção, verde positivo, cinza informativo.
 * Os critérios exatos de cada tag devem ser validados com o advogado parceiro.
 *
 * `what` e `practice` alimentam o pop-up de explicação da seção "Tags de risco e selos":
 * linguagem simples, sem promessa, e sempre com a sugestão de conferir no edital ou com advogado
 * quando fizer sentido. Revisar junto com os critérios.
 */
export type Severity = "grave" | "atencao" | "positivo" | "info";

export const SEVERITY_LABEL: Record<Severity, string> = {
  grave: "Risco grave",
  atencao: "Atenção",
  positivo: "Ponto positivo",
  info: "Informativo",
};

/** Ordem de leitura das gravidades (resumo de cores dos cartões de categoria). */
export const SEVERITY_ORDER: readonly Severity[] = ["grave", "atencao", "positivo", "info"];

export type TagDef = {
  label: string;
  severity: Severity;
  /** "O que é": 1 ou 2 frases, em português simples. */
  what: string;
  /** "Na prática": 1 frase de cuidado ou vantagem. */
  practice: string;
};

export type TagCategory = {
  name: string;
  /** A pergunta que a categoria responde (aparece no cartão, como convite para abrir). */
  question: string;
  tags: TagDef[];
};

export const TAG_CATEGORIES: TagCategory[] = [
  {
    name: "Posse",
    question: "Tem alguém morando no imóvel?",
    tags: [
      {
        label: "Ocupado",
        severity: "grave",
        what: "Há alguém morando ou usando o imóvel: o antigo dono, um inquilino ou outra pessoa. Quem arremata compra o imóvel, mas não recebe as chaves na hora.",
        practice: "A desocupação pode exigir acordo ou ação na Justiça, com custo e prazo incertos. Coloque isso na conta antes do lance.",
      },
      {
        label: "Desocupado",
        severity: "positivo",
        what: "O edital ou o processo informa que o imóvel está vazio.",
        practice: "Menos custo e menos espera para entrar no imóvel. Ainda assim, veja a data dessa informação: a situação pode ter mudado.",
      },
      {
        label: "Ocupação não informada",
        severity: "info",
        what: "Nem o edital nem o anúncio dizem se há alguém no imóvel.",
        practice: "Trate como possivelmente ocupado até ter certeza: procure a informação no processo ou pergunte ao leiloeiro.",
      },
    ],
  },
  {
    name: "Preço",
    question: "O desconto é de verdade?",
    tags: [
      {
        label: "Deságio alto",
        severity: "positivo",
        what: "O lance mínimo está bem abaixo do valor de avaliação do imóvel. Deságio é esse desconto, em porcentagem.",
        practice: "É um bom começo, não uma garantia: confira as outras tags, porque desconto grande costuma vir acompanhado de risco.",
      },
      {
        label: "Deságio baixo",
        severity: "atencao",
        what: "O lance mínimo está perto do valor de avaliação, então o desconto é pequeno.",
        practice: "Somando comissão do leiloeiro, impostos e cartório, a vantagem pode sumir. Compare com o preço de imóveis parecidos na região.",
      },
      {
        label: "Preço acima do mercado",
        severity: "grave",
        what: "O lance mínimo está acima do que imóveis parecidos da região costumam valer, muitas vezes porque a avaliação do edital está desatualizada.",
        practice: "Leilão só compensa com desconto real. Compare com anúncios da mesma região antes de dar qualquer lance.",
      },
      {
        label: "Custos extras altos",
        severity: "atencao",
        what: "Além do lance, o edital prevê despesas acima do comum para quem arremata, como comissão maior, débitos a quitar ou custos de regularização.",
        practice: "Some todos os custos ao lance para saber o preço final de verdade.",
      },
    ],
  },
  {
    name: "Dívidas",
    question: "Quem paga o que está atrasado?",
    tags: [
      {
        label: "Condomínio em atraso",
        severity: "atencao",
        what: "Há cotas de condomínio sem pagamento. Essa dívida acompanha o imóvel, e o edital diz se ela sai do valor do lance ou fica com quem arremata.",
        practice: "Leia essa regra no edital e peça ao condomínio o valor atualizado antes de decidir.",
      },
      {
        label: "IPTU em atraso",
        severity: "atencao",
        what: "O imposto municipal do imóvel tem parcelas em aberto.",
        practice: "Em leilões judiciais, o IPTU antigo costuma ser pago com o valor do lance; em outros, o edital pode passar a dívida para quem arremata. Confira antes do lance.",
      },
      {
        label: "Dívida passa ao arrematante",
        severity: "grave",
        what: "O edital prevê que débitos do imóvel, como IPTU ou condomínio, ficam com quem arremata.",
        practice: "Some essas dívidas ao lance antes de decidir e peça os valores atualizados: elas continuam crescendo até a transferência.",
      },
    ],
  },
  {
    name: "Jurídico",
    question: "O processo ainda pode mudar?",
    tags: [
      {
        label: "Ação judicial em curso",
        severity: "grave",
        what: "Existe um processo na Justiça que discute o imóvel ou o próprio leilão, como um pedido para anular a venda.",
        practice: "Uma decisão pode atrasar a posse ou até desfazer a compra. Vale ler o processo com um advogado antes do lance.",
      },
      {
        label: "Penhora de outros credores",
        severity: "grave",
        what: "Além da dívida que levou o imóvel a leilão, outros credores também bloquearam o imóvel na Justiça. Esse bloqueio se chama penhora.",
        practice: "Muitas vezes essas penhoras são canceladas depois do leilão, mas isso pode levar tempo e gerar disputa. Confira com um advogado.",
      },
      {
        label: "Leilão com recurso",
        severity: "atencao",
        what: "Há um recurso pendente no processo: uma das partes pediu a um tribunal que revise uma decisão.",
        practice: "Se o recurso for aceito, o leilão pode ser suspenso ou anulado. Acompanhe o andamento antes e depois do lance.",
      },
      {
        label: "Devedor com direito de preferência",
        severity: "atencao",
        what: "A lei permite que o antigo dono, ou outra pessoa com esse direito, fique com o imóvel quitando a dívida ou igualando o maior lance, dentro de um prazo.",
        practice: "Você pode vencer o leilão e não levar o imóvel. Veja no edital como funciona a devolução do que foi pago.",
      },
    ],
  },
  {
    name: "Documentação",
    question: "A papelada está em ordem?",
    tags: [
      {
        label: "Matrícula com pendência",
        severity: "atencao",
        what: "A matrícula é o registro do imóvel no cartório, como uma certidão com toda a sua história. Pendência é uma anotação que ainda precisa ser resolvida, como um registro faltando ou um bloqueio.",
        practice: "Pode atrasar ou encarecer a passagem do imóvel para o seu nome. Peça a matrícula atualizada e veja quem resolve cada anotação.",
      },
      {
        label: "Construção irregular",
        severity: "grave",
        what: "O que foi construído não bate com o projeto aprovado ou com o registro, como uma ampliação sem habite-se.",
        practice: "Regularizar pode custar caro e, em alguns casos, nem ser possível. Também pode dificultar financiamento e revenda.",
      },
      {
        label: "Área divergente",
        severity: "atencao",
        what: "A metragem informada no edital é diferente da que consta na matrícula ou no cadastro da prefeitura.",
        practice: "Descubra qual área vale de fato: ela muda o valor real do imóvel e pode exigir correção no cartório.",
      },
    ],
  },
  {
    name: "Propriedade",
    question: "O que exatamente está à venda?",
    tags: [
      {
        label: "Imóvel inteiro",
        severity: "positivo",
        what: "O leilão vende 100% do imóvel, e não só uma parte dele.",
        practice: "Você passa a ser o único dono, sem dividir decisões ou o uso do imóvel com outras pessoas.",
      },
      {
        label: "Cota-parte",
        severity: "atencao",
        what: "O leilão vende só uma fração do imóvel, como 50%. O restante continua com outros donos.",
        practice: "Morar, alugar ou vender o imóvel inteiro vai depender de acordo com os outros donos ou de ação na Justiça.",
      },
      {
        label: "Só direitos sobre o imóvel",
        severity: "grave",
        what: "O leilão não vende o imóvel em si, mas os direitos de quem ainda o estava pagando, como num financiamento ou num contrato de compra.",
        practice: "Você pode assumir parcelas e obrigações do contrato, e a escritura no seu nome pode demorar. Leia o edital com um advogado.",
      },
    ],
  },
  {
    name: "Condição",
    question: "Dá para saber o estado do imóvel?",
    tags: [
      {
        label: "Sem fotos",
        severity: "info",
        what: "O anúncio não traz fotos do imóvel, ou mostra só a fachada.",
        practice: "Reserve uma margem para reforma e, se der, veja o imóvel por fora antes do lance.",
      },
      {
        label: "Sem vistoria",
        severity: "info",
        what: "Não há visita nem laudo sobre o estado interno. O imóvel é vendido no estado em que se encontra.",
        practice: "Problemas escondidos ficam por conta de quem arremata: inclua uma margem para reparos no seu limite de lance.",
      },
      {
        label: "Aceita financiamento",
        severity: "positivo",
        what: "O edital permite pagar parte do lance com financiamento bancário.",
        practice: "Você precisa de menos dinheiro na hora. Deixe o crédito encaminhado antes do leilão, porque os prazos de pagamento são curtos.",
      },
    ],
  },
  {
    name: "Praça",
    question: "Em que rodada está o leilão?",
    tags: [
      {
        label: "1ª praça",
        severity: "info",
        what: "Primeira rodada do leilão. O lance mínimo costuma ser o valor de avaliação, ou algo perto dele.",
        practice: "Se ninguém arrematar, o imóvel pode ir para a 2ª praça, normalmente com lance mínimo menor. Vale acompanhar.",
      },
      {
        label: "2ª praça",
        severity: "positivo",
        what: "Segunda rodada, aberta quando ninguém arremata na primeira. O lance mínimo cai e, em leilões judiciais, pode chegar à metade da avaliação.",
        practice: "É onde costumam estar os maiores descontos, mas as outras tags continuam valendo: confira os riscos antes do lance.",
      },
      {
        label: "Praça única",
        severity: "info",
        what: "O leilão tem uma rodada só, sem segunda chance com preço menor.",
        practice: "Não espere o preço cair: decida dentro do prazo, com as contas já feitas.",
      },
    ],
  },
];
