/**
 * Conteúdo da landing, copiado do blueprint (Passo 3) — em conflito de texto, vale o blueprint.
 *
 * Convenção de placeholders: qualquer trecho entre colchetes, como "[X]" ou "[49]", é renderizado
 * por <RichText> como um placeholder visível (borda tracejada em latão). Para publicar, troque o
 * colchete pelo valor real. A lista completa está em PENDENCIAS.md.
 */

export const SITE = {
  name: "Luneta de Leilões",
  shortName: "Luneta",
  /** [domínio] confirmar no registro.br antes de publicar. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://lunetadeleiloes.com.br",
  locale: "pt_BR",
  title: "Leilões de Imóveis do Brasil em um Só Lugar | Luneta de Leilões",
  description:
    "Todos os leilões de imóveis do Brasil reunidos, comparados e classificados por risco. Veja os descontos e fale com um advogado especialista.",
  slogan: "Mire a oportunidade. Veja o risco antes do lance.",
  keywords: [
    "leilão de imóveis",
    "imóveis de leilão com desconto",
    "como comprar imóvel em leilão",
    "primeira e segunda praça",
    "leilões de imóveis no Brasil",
    "Luneta de Leilões",
  ],
} as const;

export const NAV_LINKS = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#niveis", label: "Níveis" },
  { href: "#planos", label: "Planos" },
  { href: "#advogado", label: "Falar com advogado" },
] as const;

/** Demonstração da área de quem assina (sem login; exemplos fictícios). */
export const SUBSCRIBER_AREA = { href: "/assinante", label: "Área do assinante" } as const;

export const HERO = {
  titleStart: "Todos os leilões do Brasil. Na",
  titleEm: "mira",
  titleEnd: "da sua luneta.",
  subtitle:
    "Pare de abrir dezenas de sites de leiloeiros. A Luneta de Leilões reúne, compara e classifica cada oportunidade, da névoa ao alvo.",
  primary: "Ver planos",
  secondary: "Falar com um advogado especialista",
  /** No celular o secundário vira link de texto ao lado do botão principal (sobra espaço para a lente). */
  secondaryShort: "Falar com advogado",
  trust: "+[X] leilões ativos · [X] leiloeiros monitorados · atualizado todos os dias",
} as const;

export const PROBLEM = {
  eyebrow: "O problema",
  title: ["Cada leiloeiro tem o seu site. O horizonte fica cheio de", "névoa", "."],
  text: "Os leiloeiros são independentes. Para achar uma boa oportunidade, você precisa entrar em vários sites, comparar preços, ler editais e descobrir sozinho se o imóvel está ocupado ou cheio de dívidas. É lento, confuso e arriscado.",
  /** Faixa rolante "leiloeiros monitorados": nomes reais entram aqui. */
  marquee: ["[Leiloeiro 1]", "[Leiloeiro 2]", "[Leiloeiro 3]", "[Leiloeiro 4]", "[Leiloeiro 5]", "[Leiloeiro 6]"],
} as const;

export const SOLUTION = {
  eyebrow: "A solução",
  title: ["Aproxime o Brasil inteiro em uma só", "lente", "."],
  cards: [
    { icon: "globe", title: "Todos os leilões do Brasil", text: "Uma base única, de todos os estados." },
    { icon: "pin", title: "Mapa e fotos", text: "Veja onde está o imóvel e como ele é por dentro e por fora." },
    { icon: "filter", title: "Filtros inteligentes", text: "Estado, cidade, tipo de imóvel, faixa de preço, deságio e data." },
    { icon: "check", title: "Dados tratados", text: "Informação limpa, sem você precisar ler cada edital." },
  ],
} as const;

export const LEVELS = {
  eyebrow: "Tags de risco e selos",
  attention: "Atenção",
  title: ["Nem todo desconto é uma boa", "oportunidade", "."],
  caution: {
    eyebrow: "Cuidado",
    title: ["O maior desconto costuma esconder o maior", "risco", "."],
    text: "Muitos dos deságios mais altos vêm com ocupante, dívida que passa ao arrematante ou ação judicial em curso. Quase nada disso aparece no anúncio: está no edital e no processo.",
    compare: [
      { plan: "Plano Lente", text: "você vê o desconto." },
      { plan: "Plano Luneta", text: "você vê o que ele esconde, antes do lance." },
    ],
    cta: "Visível no plano Luneta",
    /** Exemplo fictício da animação: o deságio chama atenção e a varredura revela o que ele esconde. */
    demo: {
      title: "Apartamento 2 quartos",
      place: "Niterói/RJ",
      desagio: 55,
      lance: "R$ 270.000",
      lente: "Visão Lente",
      luneta: "Visão Luneta",
      hiddenLabel: "Por trás do desconto",
      locked: "Tags visíveis no plano Luneta",
      verdict: "desconto ≠ oportunidade",
      /** `source`: onde o risco foi encontrado (aparece ao lado da tag em telas maiores). */
      tags: [
        { label: "Ocupado", severity: "grave", source: "no edital" },
        { label: "Dívida passa ao arrematante", severity: "grave", source: "no edital" },
        { label: "Ação judicial em curso", severity: "grave", source: "no processo" },
        { label: "Leilão com recurso", severity: "atencao", source: "no processo" },
      ],
    },
  },
  bridge: ["Por isso, no plano Luneta, a gente separa os", "melhores", "casos para você."],
  sealsNote: "Três selos, do Promissor ao Alvo. Cada nível soma um anel e mais um critério cumprido.",
  seals: [
    {
      level: 1,
      name: "Promissor",
      rings: "1 anel",
      text: "Passou nos critérios mínimos: dados completos e deságio relevante. Vale dar uma olhada.",
    },
    {
      level: 2,
      name: "Na Mira",
      rings: "2 anéis",
      text: "Soma posse livre e nenhuma dívida passando ao arrematante. Vale mirar.",
    },
    {
      level: 3,
      name: "Alvo",
      rings: "3 anéis · retículo · luar",
      text: "Só os melhores. Soma documentação e processo limpos e praça favorável. Maior deságio, nenhum risco identificado.",
    },
  ],
  tags: {
    eyebrow: "Tags de risco",
    title: ["Os riscos", "escondidos", "em cada leilão."],
    text: "Ocupante que não sai, dívida que passa para quem arremata, processo que ainda corre, matrícula com pendência. Esses riscos normalmente estão no edital e no processo, não no anúncio. A Luneta lê cada caso e marca o que encontrou em tags, inclusive nos leilões sem selo.",
    legend: {
      grave: "Vermelho: risco grave",
      atencao: "Amarelo: atenção",
      positivo: "Verde: ponto positivo",
      info: "Cinza: informativo",
    },
    hint: "Abra uma categoria e toque numa tag para entender o risco.",
    openAll: "Abrir todas",
    closeAll: "Fechar todas",
    start: "Comece por aqui",
    what: "O que é",
    practice: "Na prática",
    footer: "No plano Luneta, essa tag aparece em cada leilão em que for encontrada.",
  },
  disclaimer:
    "A classificação é uma análise baseada nos dados dos editais e não substitui a avaliação de um advogado.",
} as const;

export const EXAMPLES = {
  eyebrow: "Exemplos de cada nível",
  title: ["Da névoa ao", "alvo", ", lado a lado."],
  note: "Exemplos fictícios, só para ilustrar a classificação.",
} as const;

export const PRACAS = {
  eyebrow: "Primeira e segunda praça",
  title: ["O mesmo imóvel pode ficar", "até 50%", "mais barato na segunda praça."],
  text: "Muitos leilões têm duas rodadas. Na primeira praça, o lance mínimo costuma partir do valor de avaliação. Se ninguém arremata, vem a segunda praça, e o mesmo imóvel pode sair por até metade desse valor.",
  alert:
    "Por isso, no plano Luneta, você marca seus casos favoritos e a gente avisa por e-mail assim que eles vão para a segunda praça. Você não perde o momento do lance.",
} as const;

export const FILTERS = {
  eyebrow: "Filtros e mapa",
  title: ["Ajuste o", "foco", ". A lista responde na hora."],
} as const;

export const STATS = {
  eyebrow: "Dados de deságio",
  title: ["O desconto", "médio", "dos leilões na nossa base"],
  /**
   * Números calculados com a própria base. Enquanto forem null, a página mostra o placeholder [X].
   * Não use números de terceiros sem fonte.
   */
  items: [
    { value: null as number | null, suffix: "%", label: "deságio médio", tone: "luar" },
    { value: null as number | null, suffix: "%", label: "maior deságio do mês", tone: "pos" },
    { value: null as number | null, suffix: "", label: "total de leilões ativos", tone: "luar" },
  ],
} as const;

export type PlanId = "lente" | "luneta" | "telescopio";

export const PLANS = {
  eyebrow: "Planos e preços",
  title: ["Escolha o", "alcance", "da sua luneta."],
  /** Preços sugeridos no blueprint, a validar. Os colchetes marcam o placeholder visível. */
  plans: [
    {
      id: "lente" as PlanId,
      name: "Lente",
      tier: "básico",
      audience: "Quem quer ver tudo reunido.",
      price: "[49]",
      priceValue: 49,
      period: "/mês",
      cta: "Assinar Lente",
      href: "#comecar",
      featured: false,
    },
    {
      id: "luneta" as PlanId,
      name: "Luneta",
      tier: "intermediário",
      audience: "Quem quer decidir com segurança, com tags de risco e selos.",
      price: "[129]",
      priceValue: 129,
      period: "/mês",
      cta: "Assinar Luneta",
      href: "#comecar",
      featured: true,
    },
    {
      id: "telescopio" as PlanId,
      name: "Telescópio",
      tier: "escala",
      audience: "Assessorias, investidores e escritórios.",
      price: "[499]",
      priceValue: 499,
      period: "/mês ou sob consulta",
      cta: "Falar sobre o Telescópio",
      href: "#comecar",
      featured: false,
    },
  ],
  /** Linhas da tabela comparativa (Passo 2 do blueprint). */
  features: [
    { label: "Todos os leilões do Brasil", lente: true, luneta: true, telescopio: true },
    { label: "Fotos, mapa e filtros (estado, cidade, tipo, faixa de preço, deságio, data)", lente: true, luneta: true, telescopio: true },
    { label: "Tags de risco", lente: "blur", luneta: true, telescopio: true },
    { label: "Selos Promissor, Na Mira e Alvo", lente: "blur", luneta: true, telescopio: true },
    { label: "Favoritos", lente: false, luneta: true, telescopio: true },
    { label: "Alerta por e-mail quando muda a praça", lente: false, luneta: true, telescopio: true },
    { label: "Prioridade para contato com advogado", lente: false, luneta: true, telescopio: true },
    { label: "Base completa atualizada toda semana (planilha/exportação) com tags e selos em colunas", lente: false, luneta: false, telescopio: true },
    { label: "Vários usuários", lente: false, luneta: false, telescopio: true },
    { label: "Suporte dedicado", lente: false, luneta: false, telescopio: true },
  ] satisfies { label: string; lente: boolean | "blur"; luneta: boolean | "blur"; telescopio: boolean | "blur" }[],
  note: "Cancele quando quiser · [7] dias para cancelar.",
} as const;

export const LAWYER = {
  eyebrow: "Consultoria com advogado",
  title: ["Achou a oportunidade? Fale com quem", "entende", "."],
  text: "Antes de dar o lance, converse com um advogado especialista em leilões. Ele analisa o edital, os riscos e o caminho para a posse do imóvel. Peça o contato direto aqui.",
  cta: "Quero falar com um advogado",
  oab: "A publicidade de serviços jurídicos segue as regras da OAB.",
  steps: [
    { n: "01", title: "Análise do edital", text: "Regras do leilão, prazos, custos e condições de pagamento." },
    { n: "02", title: "Leitura dos riscos", text: "Ocupação, dívidas, matrícula e processos que podem pesar na decisão." },
    { n: "03", title: "Caminho para a posse", text: "O que acontece depois do lance vencedor até a chave na mão." },
  ],
} as const;

export const SOCIAL = {
  eyebrow: "Prova social",
  title: ["Você está entre os primeiros a olhar pela", "luneta", "."],
  launch: "Lançamento",
  launchText:
    "Os depoimentos desta seção serão de assinantes reais, com nome, foto e resultado. Nada inventado.",
  guarantee: "[7] dias",
  guaranteeTitle: "para cancelar.",
  guaranteeText: "Assine, explore a base inteira e, se não fizer sentido, cancele dentro do prazo.",
} as const;

export const FAQ = {
  eyebrow: "Perguntas frequentes",
  title: ["Antes de", "mirar", ", tire as dúvidas."],
  items: [
    {
      q: "Como funciona um leilão de imóveis?",
      a: "O imóvel é oferecido publicamente por um leiloeiro, a partir de um lance mínimo definido no edital. Quem dá o maior lance arremata, paga nas condições do edital e segue o caminho para a posse descrito nele.",
    },
    {
      q: "O que é primeira e segunda praça?",
      a: "Muitos leilões têm duas rodadas. Na primeira praça, o lance mínimo costuma partir do valor de avaliação. Se ninguém arremata, vem a segunda praça, em que o mesmo imóvel pode sair por até metade desse valor.",
    },
    {
      q: "Os leilões de todo o Brasil estão aqui?",
      a: "Reunimos os leilões de imóveis dos leiloeiros monitorados, de todos os estados, em uma base única atualizada todos os dias. Hoje são [X] leiloeiros monitorados.",
    },
    {
      q: "Como vocês classificam o risco?",
      a: "Lemos os dados do edital e aplicamos tags de risco por categoria: posse, preço, dívidas, jurídico, documentação, propriedade, condição e praça. A cor indica a gravidade, sempre com ícone e texto. Os selos Promissor, Na Mira e Alvo somam critérios cumulativos, e só os melhores recebem os três anéis.",
    },
    {
      q: "A classificação é uma garantia?",
      a: "Não. A classificação é uma análise baseada nos dados dos editais, não uma garantia, e não substitui a avaliação de um advogado. “Nenhum risco identificado” quer dizer que a análise não encontrou riscos nos dados disponíveis, não que eles não existam.",
    },
    {
      q: "Como recebo os alertas de mudança de praça?",
      a: "No plano Luneta, marque o leilão como favorito. Assim que ele for para a segunda praça, você recebe um e-mail com o novo lance mínimo e a data.",
    },
    {
      q: "Posso cancelar quando quiser?",
      a: "Sim. A assinatura pode ser cancelada quando você quiser, e você tem [7] dias para cancelar após a contratação.",
    },
    {
      q: "Como falo com um advogado?",
      a: "Peça o contato pelo botão “Quero falar com um advogado”. Assinantes Luneta e Telescópio têm prioridade no atendimento.",
    },
  ],
} as const;

export const FINAL_CTA = {
  title: ["O próximo", "alvo", "pode estar na lista de hoje."],
  cta: "Começar agora",
  formTitle: "Ainda decidindo? Receba exemplos de oportunidades.",
  formText: "Enviamos alguns leilões classificados, de cada nível, para você ver a luneta funcionando.",
  submit: "Quero receber exemplos",
  successTitle: "Mira ajustada.",
  successText:
    "Demonstração: nenhum dado foi enviado. Quando o envio for ligado, você recebe os primeiros exemplos de oportunidades no seu e-mail.",
} as const;

export const FOOTER = {
  legal:
    "As tags de risco e os selos Promissor, Na Mira e Alvo são uma análise baseada nos dados públicos dos editais. A classificação não é garantia de resultado e não substitui a avaliação de um advogado. “Nenhum risco identificado” significa que nossa análise não encontrou riscos nos dados disponíveis, não que eles não existam. Preços, prazos e condições dos leilões podem mudar; confira sempre o edital oficial do leiloeiro. Dados pessoais tratados conforme a LGPD.",
  company: "[Razão social] · CNPJ [X]",
} as const;
