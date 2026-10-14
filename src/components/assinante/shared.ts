import { PLANS } from "@/content/site";

/**
 * O que sobrou da /assinante antiga (a lista, o filtro e o painel de detalhe viraram o catálogo em
 * src/components/catalogo): os textos que o catálogo e o convite à Luneta (UpgradeModal) usam.
 */

/** "Voltar ao site" (logo, faixa e rodapé) leva aos planos da landing: quem viu a demonstração volta para assinar. */
export const BACK_TO_SITE = "/#planos";

/** Preço da Luneta com colchetes (placeholder visível até o valor ser validado). */
export const LUNETA_PRICE = PLANS.plans.find((p) => p.id === "luneta")?.price ?? "[129]";
