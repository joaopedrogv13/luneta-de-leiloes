import type { Listing } from "@/content/examples";
import { PLANS } from "@/content/site";
import { SEAL_NAMES } from "@/components/ui/Seal";

/** Plano mostrado na demonstração (o Telescópio não muda a visão da lista). */
export type Plan = "lente" | "luneta";

export type FilterKey = "sp" | "apto" | "des30" | "praca2" | "desoc" | "selo";
export type Filters = Record<FilterKey, boolean>;

export const NO_FILTERS: Filters = { sp: false, apto: false, des30: false, praca2: false, desoc: false, selo: false };

/** Filtros livres nos dois planos. "Só com selo" fica à parte: no plano Lente ele é travado. */
export const OPEN_FILTERS: { key: Exclude<FilterKey, "selo">; label: string; test: (l: Listing) => boolean }[] = [
  { key: "sp", label: "Estado: SP", test: (l) => l.uf === "SP" },
  { key: "apto", label: "Apartamentos", test: (l) => l.type === "apartamento" },
  { key: "des30", label: "Deságio ≥ 30%", test: (l) => l.desagio >= 30 },
  { key: "praca2", label: "2ª praça", test: (l) => l.praca === "2ª praça" },
  { key: "desoc", label: "Desocupado", test: (l) => l.desocupado },
];

/** Preço da Luneta com colchetes (placeholder visível até o valor ser validado). */
export const LUNETA_PRICE = PLANS.plans.find((p) => p.id === "luneta")?.price ?? "[129]";

const RINGS = ["", "1 anel", "2 anéis", "3 anéis"] as const;

/** "Alvo · 3 anéis", "Na Mira · 2 anéis", "Promissor · 1 anel" ou "Sem selo". */
export function sealLabel(l: Listing) {
  return l.seal === 0 ? SEAL_NAMES[0] : `${SEAL_NAMES[l.seal]} · ${RINGS[l.seal]}`;
}

/** "Vila Mariana · São Paulo/SP" → bairro e cidade/UF. */
export function splitPlace(place: string) {
  const [bairro, cidadeUf = ""] = place.split(" · ");
  return { bairro, cidadeUf };
}

/** Minúsculas e sem acento, para "sao paulo" achar "São Paulo". */
export function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Palavras normalizadas (sem acento, minúsculas), separadas por qualquer coisa que não seja letra ou número. */
const words = (text: string) => normalize(text).split(/[^a-z0-9]+/).filter(Boolean);

const UFS = new Set(
  "ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to".split(" "),
);

/**
 * Busca por título, bairro, cidade e UF; cada termo digitado precisa casar.
 * Termo de 2 letras que é uma UF ("BA", "sp") compara só com a UF do imóvel, para "BA" não trazer
 * Curitiba (PR); os demais casam pelo início de uma palavra ("cur" acha Curitiba, "itiba" não).
 */
export function matchesQuery(l: Listing, query: string) {
  const terms = words(query);
  if (terms.length === 0) return true;
  const uf = normalize(l.uf);
  const tokens = words(`${l.title} ${l.place}`);
  return terms.every((t) => (t.length === 2 && UFS.has(t) ? t === uf : tokens.some((w) => w.startsWith(t))));
}

/** Respeita "reduzir movimento" nas animações feitas em JS (Web Animations API, contagens). */
export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Desfoque dos marcadores neutros de tags e selo no plano Lente (600ms ao trocar de plano).
 * No Lente o conteúdo real não vai para o DOM: o desfoque só cobre blocos genéricos, iguais em todo cartão.
 */
export const lockFilter = (lente: boolean) => (lente ? "blur(6px)" : "blur(0px)");
