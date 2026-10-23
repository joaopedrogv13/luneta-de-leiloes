/**
 * Conteúdo da landing, copiado do blueprint (Passo 3) — em conflito de texto, vale o blueprint.
 *
 * Convenção de placeholders: qualquer trecho entre colchetes, como "[X]" ou "[49]", é renderizado
 * por <RichText> como um placeholder visível (borda tracejada em latão). Para publicar, troque o
 * colchete pelo valor real. A lista completa está em PENDENCIAS.md.
 *
 * Este arquivo vai ao navegador (o menu, o FAQ e o formulário são componentes de cliente): importa só tipos e as regras
 * curtas de planos.ts e produto.ts (o que o produto já tem: as frases das tags e do alerta de praça dependem disso). Os textos
 * das seções "Decida com números" e "Nota de localização" ficam em ferramentas.ts (só no servidor). O teste
 * src/content/site.test.ts confere que a tabela de planos bate com src/lib/catalogo/planos.ts.
 */
import type { Filtros, Recurso } from "@/lib/catalogo/tipos";
// caminhos relativos: o teste (site.test.ts) importa este arquivo sem o alias "@/"
import { FILTROS_DA_LUNETA, FILTROS_DO_LENTE, FILTROS_PROMETIDOS } from "../lib/catalogo/planos";
import { FAVORITOS_ROTULO, PRODUTO } from "../lib/catalogo/produto";

/**
 * Os filtros que a landing promete a cada plano: a lista mora em src/lib/catalogo/planos.ts (a mesma da chamada do
 * painel e da janela da Luneta). O teste confere as chaves com FILTROS_LENTE.
 */
export { FILTROS_PROMETIDOS };

/**
 * Filtros de `Filtros` que a landing não cita (deve ser `never`; o teste confere). Um filtro novo no catálogo entra
 * em FILTROS_PROMETIDOS: no Lente (se estiver em FILTROS_LENTE) ou na Luneta. A busca por texto e a área do mapa
 * ("Buscar nesta área", da vista de mapa) não são filtros da tabela de planos.
 */
export type FiltroSemLugar = Exclude<keyof Filtros, "q" | "bbox" | (typeof FILTROS_PROMETIDOS)["lente" | "luneta"][number]["chaves"][number]>;

export const SITE = {
  name: "Luneta de Leilões",
  shortName: "Luneta",
  /** [domínio] confirmar no registro.br antes de publicar. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://lunetadeleiloes.com.br",
  /** Só NEXT_PUBLIC_INDEXAR="1" libera buscadores: até o domínio final, o site publicado tem placeholders. */
  indexable: process.env.NEXT_PUBLIC_INDEXAR === "1",
  locale: "pt_BR",
  title: "Leilões de Imóveis do Brasil em um Só Lugar | Luneta de Leilões",
  description:
    "Leilões de imóveis do Brasil reunidos e classificados por risco. Simule o lance máximo, compare o preço do m² da região e fale com um advogado.",
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

/**
 * Menu. `largo`: no computador, o link só aparece a partir de 1280 px (entre 1024 e 1279 os seis itens não cabem
 * ao lado de "Área do assinante" e "Ver planos"); no menu do celular e no rodapé, sempre.
 */
export const NAV_LINKS: readonly { href: string; label: string; largo?: boolean }[] = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#niveis", label: "Níveis" },
  { href: "#decida", label: "Ferramentas", largo: true },
  { href: "#planos", label: "Planos" },
  { href: "#advogado", label: "Falar com advogado" },
];

/** Página pública do método da nota de localização (fora da área do assinante). */
export const METODO_NOTA = { href: "/metodologia/localizacao", label: "Como a nota é calculada" } as const;

/** Demonstração da área de quem assina (sem login; exemplos fictícios). */
export const SUBSCRIBER_AREA = { href: "/assinante", label: "Área do assinante" } as const;

export const HERO = {
  titleStart: "Todos os leilões do Brasil. Na",
  titleEm: "mira",
  titleEnd: "da sua luneta.",
  subtitle:
    "Pare de abrir dezenas de sites de leiloeiros. A Luneta de Leilões reúne cada oportunidade, mostra o risco e faz a conta do lance.",
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
  /** O que todos os planos têm (o plano Lente). O que a Luneta acrescenta vem em "Por dentro" e em "Decida com números". */
  cards: [
    { icon: "globe", title: "Todos os leilões do Brasil", text: "Uma base única, de todos os estados." },
    { icon: "pin", title: "Fotos grandes e mapa", text: "Veja onde fica cada imóvel e como ele é, em lista, em cards ou no mapa." },
    { icon: "filter", title: "Filtros por região e desconto", text: "Estado, cidade, tipo de imóvel, faixa de preço, deságio e data." },
    { icon: "check", title: "A página inteira do imóvel", text: "Dados da fonte, documentos e matrícula num só lugar, com um (i) que explica cada termo." },
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
      {
        plan: "Plano Luneta",
        text: PRODUTO.leituraDoEdital ? "você vê o que ele esconde, antes do lance." : "você vê os riscos que os dados do leilão já mostram, antes do lance.",
      },
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
    text: PRODUTO.leituraDoEdital
      ? "Ocupante que não sai, dívida que passa para quem arremata, processo que ainda corre, matrícula com pendência. Esses riscos normalmente estão no edital e no processo, não no anúncio. A Luneta lê cada caso e marca o que encontrou em tags, inclusive nos leilões sem selo."
      : "Ocupante que não sai, dívida que passa para quem arremata, processo que ainda corre, matrícula com pendência. Esses riscos normalmente estão no edital e no processo, não no anúncio. Hoje a Luneta marca em tags o que os dados de cada leilão já mostram (financiamento, direito de preferência do devedor, deságio e praça); ocupação, dívidas e matrícula entram quando ela ler a página e o edital de cada leilão.",
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
    "A classificação é uma análise baseada nos dados de cada leilão e não substitui a avaliação de um advogado.",
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
  /** o alerta por e-mail só aparece quando existir (PRODUTO.alertaPraca); até lá, só os favoritos */
  alert: PRODUTO.alertaPraca
    ? "Por isso, no plano Luneta, você marca seus casos favoritos e a gente avisa por e-mail assim que eles vão para a segunda praça. Você não perde o momento do lance."
    : "Por isso, no plano Luneta, você marca seus casos favoritos e acompanha a praça e o lance mínimo de cada um num só lugar.",
  mostrarAlerta: PRODUTO.alertaPraca,
} as const;

export const FILTERS = {
  eyebrow: "Filtros e mapa",
  title: ["Ajuste o", "foco", ". A lista responde na hora."],
  text: `No plano Lente, filtre por ${FILTROS_DO_LENTE}, e veja o resultado em lista, em cards ou no mapa. Na Luneta, também por ${FILTROS_DA_LUNETA}.`,
  /** rótulo dos filtros da demonstração que são do plano Luneta */
  luneta: "Luneta",
} as const;

export const STATS = {
  eyebrow: "Dados de deságio",
  title: ["O desconto", "médio", "dos leilões na nossa base"],
  /**
   * Números calculados com a própria base. Enquanto forem null, a página mostra o placeholder [X].
   * Não use números de terceiros sem fonte.
   */
  items: [
    { value: null as number | null, suffix: "%", label: "deságio médio" },
    { value: null as number | null, suffix: "%", label: "maior deságio do mês" },
    { value: null as number | null, suffix: "", label: "total de leilões ativos" },
  ],
} as const;

export type PlanId = "lente" | "luneta" | "telescopio";

/**
 * ✓ incluído, false não incluído. (Até a rodada 4 havia "blur", desfocado, para as tags e os selos no Lente; o Lente
 * deixou de ver qualquer coisa deles, e a tabela não promete mais o desfoque: revisão final da rodada 4, UX-04.)
 */
export type PlanValue = boolean;

/**
 * Uma linha da tabela "Compare os planos". `grupo`: o bloco da tabela (Encontrar = Lente; Decidir e Acompanhar = Luneta;
 * Equipe = Telescópio). `cartao`: o rótulo curto nos cartões de preço; linhas com o mesmo `cartao` viram uma linha só
 * no cartão ("Tags de risco e selos"). `recurso`: o recurso de src/lib/catalogo/planos.ts que a linha promete (o teste
 * confere que o que a tabela dá ao Lente é o que o código deixa o Lente ver).
 */
export interface PlanFeature {
  grupo: "Encontrar" | "Decidir" | "Acompanhar" | "Equipe";
  label: string;
  cartao?: string;
  recurso?: Recurso;
  lente: PlanValue;
  luneta: PlanValue;
  telescopio: PlanValue;
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const FEATURES: readonly PlanFeature[] = [
  // Encontrar: o plano Lente (o que a fonte publica, reunido e fácil de achar)
  { grupo: "Encontrar", label: "Todos os leilões do Brasil", lente: true, luneta: true, telescopio: true },
  { grupo: "Encontrar", label: "Fotos grandes e mapa do Brasil, em lista ou em cards", cartao: "Fotos grandes e mapa", lente: true, luneta: true, telescopio: true },
  { grupo: "Encontrar", label: `Filtros por ${FILTROS_DO_LENTE}`, lente: true, luneta: true, telescopio: true },
  {
    grupo: "Encontrar",
    label: "Página completa de cada imóvel com os dados da fonte: documentos, matrícula, link do leilão e um (i) que explica cada termo",
    cartao: "Página completa do imóvel, com matrícula e glossário",
    lente: true,
    luneta: true,
    telescopio: true,
  },
  { grupo: "Encontrar", label: "Imóveis parecidos em cada página", cartao: "Imóveis parecidos", lente: true, luneta: true, telescopio: true },
  // Decidir: o que a Luneta calcula, cruza ou analisa
  {
    grupo: "Decidir",
    label: PRODUTO.leituraDoEdital ? "Tags de risco, com o trecho de onde veio cada alerta" : "Tags de risco, com a origem de cada alerta",
    cartao: "Tags de risco e selos",
    recurso: "tags",
    lente: false,
    luneta: true,
    telescopio: true,
  },
  { grupo: "Decidir", label: "Selos Promissor, Na Mira e Alvo", cartao: "Tags de risco e selos", recurso: "selos", lente: false, luneta: true, telescopio: true },
  { grupo: "Decidir", label: `Filtros avançados: ${FILTROS_DA_LUNETA}`, cartao: "Filtros avançados", recurso: "filtrosAvancados", lente: false, luneta: true, telescopio: true },
  { grupo: "Decidir", label: "Simulador de lance máximo, com cenários e prazos que você ajusta", cartao: "Simulador de lance máximo", recurso: "simulador", lente: false, luneta: true, telescopio: true },
  {
    grupo: "Decidir",
    label: "Preço do m² na rua, no bairro e na cidade, com o valor das compras registradas no ITBI em 5 capitais",
    cartao: "Preço do m² da região, com compras reais",
    recurso: "regiao",
    lente: false,
    luneta: true,
    telescopio: true,
  },
  { grupo: "Decidir", label: "Buscas prontas nos portais de anúncios, na mesma rua, no bairro e na cidade", cartao: "Buscas nos portais de anúncios", recurso: "portais", lente: false, luneta: true, telescopio: true },
  { grupo: "Decidir", label: "Nota de localização de 0 a 100, com cada parte explicada", cartao: "Nota de localização", recurso: "localizacao", lente: false, luneta: true, telescopio: true },
  { grupo: "Decidir", label: "Relatório em PDF do imóvel e da simulação", cartao: "Relatório em PDF", recurso: "relatorio", lente: false, luneta: true, telescopio: true },
  // Acompanhar
  { grupo: "Acompanhar", label: "Favoritos", cartao: maiuscula(FAVORITOS_ROTULO), recurso: "favoritos", lente: false, luneta: true, telescopio: true },
  // o alerta por e-mail só entra na tabela quando existir (PRODUTO.alertaPraca)
  ...(PRODUTO.alertaPraca
    ? [{ grupo: "Acompanhar", label: "Alerta por e-mail quando muda a praça", cartao: maiuscula(FAVORITOS_ROTULO), lente: false, luneta: true, telescopio: true } as const]
    : []),
  { grupo: "Acompanhar", label: "Prioridade para contato com advogado", lente: false, luneta: true, telescopio: true },
  // Equipe: o Telescópio
  {
    grupo: "Equipe",
    label: "Base completa atualizada toda semana, em planilha, com tags, selos, nota de localização e preço da região em colunas",
    cartao: "Base completa em planilha",
    lente: false,
    luneta: false,
    telescopio: true,
  },
  { grupo: "Equipe", label: "Vários usuários", lente: false, luneta: false, telescopio: true },
  { grupo: "Equipe", label: "Suporte dedicado", lente: false, luneta: false, telescopio: true },
];

export const PLANS = {
  eyebrow: "Planos e preços",
  title: ["Escolha o", "alcance", "da sua luneta."],
  lead: "A Lente encontra. A Luneta ajuda a decidir. O Telescópio leva a Luneta para a equipe.",
  /** Preços sugeridos no blueprint, a validar. Os colchetes marcam o placeholder visível. */
  plans: [
    {
      id: "lente" as PlanId,
      name: "Lente",
      tier: "básico",
      audience: "Quem quer achar o imóvel: todos os leilões reunidos, com fotos, mapa e filtros.",
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
      audience: "Quem quer decidir com mais informação: riscos, selos, simulador, preço da região e nota de localização.",
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
      audience: "Assessorias, investidores e escritórios: tudo da Luneta para a equipe, com a base em planilha.",
      price: "[499]",
      priceValue: 499,
      period: "/mês ou sob consulta",
      cta: "Falar sobre o Telescópio",
      href: "#comecar",
      featured: false,
    },
  ],
  /** Linhas da tabela comparativa, em grupos (decisão da rodada 4: Lente = encontrar; Luneta = decidir). */
  features: FEATURES,
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
      q: "O que o plano Lente inclui?",
      a: `A Lente é para encontrar o imóvel: todos os leilões da base, com fotos, mapa, filtros por ${FILTROS_DO_LENTE}, e a página de cada imóvel com os dados da fonte, os documentos, a matrícula, o link do leilão, um (i) que explica cada termo e os imóveis parecidos. O que a Luneta calcula ou analisa para ajudar a decidir fica no plano Luneta: tags de risco e selos, filtros avançados, simulador de lance, preço do m² da região, buscas nos portais, nota de localização, relatório em PDF e ${FAVORITOS_ROTULO}. O Telescópio tem tudo da Luneta, para equipes.`,
    },
    {
      q: "Como vocês classificam o risco?",
      a: PRODUTO.leituraDoEdital
        ? "Lemos os dados do edital e aplicamos tags de risco por categoria: posse, preço, dívidas, jurídico, documentação, propriedade, condição e praça. A cor indica a gravidade, sempre com ícone e texto. Os selos Promissor, Na Mira e Alvo somam critérios cumulativos, e só os melhores recebem os três anéis."
        : "Lemos os dados de cada leilão e aplicamos tags de risco por categoria: posse, preço, dívidas, jurídico, documentação, propriedade, condição e praça. A cor indica a gravidade, sempre com ícone e texto. Hoje as tags vêm dos campos que a fonte publica (financiamento, direito de preferência do devedor, deságio e praça); a ocupação, as dívidas e a matrícula entram quando a Luneta ler a página e o edital de cada leilão. Os selos Promissor, Na Mira e Alvo somam critérios cumulativos, e só os melhores recebem os três anéis.",
    },
    {
      q: "O simulador diz quanto vou lucrar?",
      a: "Não: ele faz a conta com as premissas que você escolher. Você diz quanto quer ganhar, em reais ou em % ao ano, e em quanto tempo pretende vender. O simulador desconta os custos que costumam aparecer (comissão do leiloeiro, ITBI, escritura e registro, reforma, condomínio e IPTU até a venda, corretagem e imposto sobre o ganho) e mostra o maior lance que ainda atinge a sua meta, em três cenários de venda e em vários prazos. Dá para mudar qualquer número, e a simulação inteira sai num relatório em PDF. É uma estimativa com premissas genéricas, não é promessa de lucro nem recomendação de investimento: o resultado depende do preço de venda, dos custos e do prazo de verdade. Confira o edital e os custos locais com um profissional.",
    },
    {
      q: "De onde vem o preço do m²?",
      a: "De duas fontes. Em toda a base, comparamos a avaliação do imóvel com a média dos imóveis do mesmo tipo em leilão na mesma rua, no mesmo bairro, na cidade e no estado. Em São Paulo, no Rio de Janeiro, em Porto Alegre, em Fortaleza e no Recife, usamos também o valor das compras registradas na prefeitura para o ITBI, nos 12 meses mais recentes que cada uma publicou: em São Paulo e no Rio, o preço declarado na compra; em Porto Alegre e em Fortaleza, a base de cálculo da prefeitura; no Recife, a avaliação da prefeitura para o imposto. A avaliação do leilão não é preço de mercado, e o valor do ITBI é o registrado na prefeitura: use os dois como referência, não como avaliação do imóvel.",
    },
    {
      q: "Como funciona a nota de localização?",
      a: "A nota vai de 0 a 100 e compara o entorno do imóvel com onde moram as pessoas da mesma cidade: uma nota 78 quer dizer melhor localizado que 78% dos moradores. Entram seis partes, com pesos diferentes: serviços do dia a dia (mercado, farmácia, escola, saúde), transporte, renda do entorno, infraestrutura da rua, comércio e lazer, num raio de 500 m a 1 km, com dados abertos do IBGE (Censo 2022), do Inep, do Ministério da Saúde e do OpenStreetMap. As áreas de risco mapeadas aparecem como alerta, fora da nota, e o preço também fica de fora. A página do imóvel mostra cada parte e o peso dela. Se o endereço foi achado só no bairro, a nota sai aproximada; só na cidade, não damos nota. Em cidades com menos de 20 mil moradores, mostramos os números do entorno e a posição em terços, sem nota de 0 a 100. A nota não é avaliação do imóvel, não mede segurança e não é garantia: visite o local.",
    },
    {
      q: "A classificação, a nota e o simulador são garantia?",
      a: "Não. As tags e os selos são uma análise automática dos dados de cada leilão; a nota de localização resume dados abertos do entorno; o simulador faz contas com premissas genéricas. Nada disso é garantia de resultado nem recomendação de investimento, e nada substitui a leitura do edital, a visita ao imóvel e a avaliação de um advogado. “Nenhum risco identificado” quer dizer que a análise não encontrou riscos nos dados disponíveis, não que eles não existam.",
    },
    // só quando o alerta por e-mail existir (PRODUTO.alertaPraca)
    ...(PRODUTO.alertaPraca
      ? [
          {
            q: "Como recebo os alertas de mudança de praça?",
            a: "No plano Luneta, marque o leilão como favorito. Assim que ele for para a segunda praça, você recebe um e-mail com o novo lance mínimo e a data.",
          } as const,
        ]
      : []),
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
    "As tags de risco e os selos Promissor, Na Mira e Alvo são uma análise baseada nos dados públicos de cada leilão. A classificação não é garantia de resultado e não substitui a avaliação de um advogado. “Nenhum risco identificado” significa que nossa análise não encontrou riscos nos dados disponíveis, não que eles não existam. O simulador faz contas com premissas genéricas e não é recomendação de investimento. A nota de localização resume dados abertos do entorno e não é avaliação do imóvel nem garantia. Preços, prazos e condições dos leilões podem mudar; confira sempre o edital oficial do leiloeiro. Dados pessoais tratados conforme a LGPD.",
  company: "[Razão social] · CNPJ [X]",
} as const;
