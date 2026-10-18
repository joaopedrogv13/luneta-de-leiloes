import type { TitleParts } from "@/components/ui/Heading";

/**
 * Textos da seção "Por dentro, depois de assinar" (dentro de "A solução").
 * A mesma lista aparece em duas visões: Lente (tudo num só lugar, riscos e selos desfocados) e
 * Luneta (riscos, selos e as contas para decidir). A troca Lente → Luneta é animada por uma luneta que varre a lista.
 */

export type PlanView = "lente" | "luneta";

export type PointIcon = "globe" | "filter" | "pin" | "scan" | "tag" | "rings" | "bell" | "calc";

type Point = { icon: PointIcon; title: string; text: string };

export const POR_DENTRO = {
  eyebrow: "Por dentro, depois de assinar",
  title: ["Com a Lente, você vê tudo. Com a Luneta, você vê o que", "importa", "."] satisfies TitleParts,
  lead: "Os dois planos abrem a mesma base. A diferença é o quanto você enxerga em cada leilão.",
  tablistLabel: "Veja cada plano por dentro",

  lente: {
    tab: "Lente",
    hint: "tudo num só lugar",
    kicker: "Plano Lente · tudo num só lugar",
    headline: "Todos os leilões de imóveis do Brasil em um só site.",
    text: "Chega de abrir dezenas de sites de leiloeiros. A Lente reúne tudo e deixa você filtrar até achar o seu imóvel.",
    points: [
      {
        icon: "globe",
        title: "Acesso centralizado",
        text: "Os leilões de todos os estados numa base única, atualizada todos os dias.",
      },
      {
        icon: "filter",
        title: "Filtro por região e desconto",
        text: "Estado e cidade, tipo de imóvel, faixa de preço, deságio e data do leilão.",
      },
      {
        icon: "pin",
        title: "Fotos, mapa e a página do imóvel",
        text: "Veja onde fica, leia os dados da fonte e a matrícula, com cada termo explicado, e vá direto ao leilão.",
      },
    ] satisfies readonly Point[],
    note: {
      title: "Riscos e selos desfocados",
      text: "Na Lente você vê o desconto, mas não o que ele esconde. As contas e a nota de localização são da Luneta.",
    },
    cta: "Ver o que a Luneta mostra",
  },

  luneta: {
    tab: "Luneta",
    hint: "para decidir",
    kicker: "Plano Luneta · para decidir",
    headline: "Cada leilão lido, com os riscos à vista e as contas feitas.",
    text: "Tudo o que a Lente tem e mais o que ajuda a decidir: os riscos de cada leilão, os selos, o simulador de lance, o preço da região e a nota de localização.",
    points: [
      {
        icon: "scan",
        title: "Cada leilão lido para você",
        text: "Ocupação, dívidas, processo, documentação e praça, lidos nos dados da fonte, com o trecho de onde veio cada alerta.",
      },
      {
        icon: "tag",
        title: "Riscos em tags, os melhores com selo",
        text: "Cor, ícone e texto para o que pesa contra o lance; Promissor, Na Mira e Alvo para os casos que passam nos critérios.",
      },
      {
        icon: "calc",
        title: "Lance máximo, região e entorno",
        text: "Até quanto vale dar de lance para a sua meta, o preço do m² ali perto e a nota de localização, de 0 a 100.",
      },
      {
        icon: "bell",
        title: "Favoritos e alerta de 2ª praça",
        text: "Receba um e-mail quando um favorito for para a 2ª praça, em que o lance costuma cair.",
      },
    ] satisfies readonly Point[],
    cta: { label: "Assinar Luneta", href: "#planos" },
    ctaNote: "Cancele quando quiser.",
  },

  /** A "janela do app" com os exemplos. */
  window: {
    label: "Demonstração com exemplos fictícios: a mesma lista de leilões vista pelo plano Lente e pelo plano Luneta.",
    app: "Luneta",
    search: "Buscar cidade, bairro ou leiloeiro",
    filtersLabel: "Filtros",
    chips: ["Brasil inteiro", "Deságio acima de 40%", "Maior deságio primeiro"],
    badge: { lente: "Plano Lente", luneta: "Plano Luneta" },
    locked: "Riscos e oportunidades só no plano Luneta",
  },

  disclaimer:
    "Exemplos fictícios. A classificação é uma análise dos dados dos editais, não uma garantia, e não substitui a avaliação de um advogado.",
  replay: "Ver a troca de novo",
  demo: "Abrir a demonstração completa →",
} as const;

/** Plurais do contador da janela ("1 risco identificado", "2 oportunidades"). */
export const plural = {
  exemplos: (n: number) => (n === 1 ? "exemplo" : "exemplos"),
  riscos: (n: number) => (n === 1 ? "risco identificado" : "riscos identificados"),
  oportunidades: (n: number) => (n === 1 ? "oportunidade" : "oportunidades"),
};

/** Texto do aviso para leitores de tela quando a troca termina. */
export function announceView(view: PlanView, risks: number, opps: number) {
  return view === "luneta"
    ? `Visão do plano Luneta: ${risks} ${plural.riscos(risks)} e ${opps} ${plural.oportunidades(opps)} com selo nos exemplos.`
    : "Visão do plano Lente: tags de risco e selos desfocados.";
}
