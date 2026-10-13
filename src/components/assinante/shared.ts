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

/** "Voltar ao site" (logo, faixa e rodapé) leva aos planos da landing: quem viu a demonstração volta para assinar. */
export const BACK_TO_SITE = "/#planos";

/** Preço da Luneta com colchetes (placeholder visível até o valor ser validado). */
export const LUNETA_PRICE = PLANS.plans.find((p) => p.id === "luneta")?.price ?? "[129]";

const RINGS = ["", "1 anel", "2 anéis", "3 anéis"] as const;

/** "Alvo · 3 anéis", "Na Mira · 2 anéis", "Promissor · 1 anel", "Sem selo" ou, nos casos reais, "Selo em análise". */
export function sealLabel(l: Listing) {
  if (l.sealPending) return "Selo em análise";
  return l.seal === 0 ? SEAL_NAMES[0] : `${SEAL_NAMES[l.seal]} · ${RINGS[l.seal]}`;
}

/**
 * De onde vem a lista: os textos que mudam entre os exemplos da /assinante e os casos reais da /previa
 * (contagem, nome da lista para leitores de tela, nota sob a lista e o complemento do título).
 */
export type ListOrigin = {
  one: string;
  other: string;
  subtitle: string;
  listLabel: string;
  note: string;
};

/** Praça como a fonte informou; casos reais sem praça dizem isso, sem adivinhar. */
export const pracaLabel = (l: Listing) => l.praca ?? "Praça não informada pela fonte";

/**
 * Deságio para mostrar. Positivo: "−48%". Casos reais podem ter lance acima da avaliação (deságio
 * negativo): "+46%" com a nota "lance acima da avaliação", sem sinal de menos que confunda.
 */
export function desagioView(l: Listing): { value: string; note?: string; short: string } {
  if (l.desagio > 0) return { value: `−${l.desagio}%`, short: `−${l.desagio}%` };
  if (l.desagio === 0) return { value: "0%", note: "lance igual à avaliação", short: "lance igual à avaliação" };
  const acima = Math.abs(l.desagio);
  return { value: `+${acima}%`, note: "lance acima da avaliação", short: `lance ${acima}% acima da avaliação` };
}

const MODALIDADES: Record<string, string> = {
  leilao: "Leilão",
  venda_direta: "Venda direta",
  venda_online: "Venda online",
  licitacao_aberta: "Licitação aberta",
};

/** "venda_direta" → "Venda direta" (modalidade como está na base). */
export function modalidadeLabel(m: string) {
  const s = m.replace(/_/g, " ");
  return MODALIDADES[m] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

const two = (n: number) => String(n).padStart(2, "0");

/**
 * Data e hora da praça em Brasília ("16/10/2026 às 14:00"), igual no servidor e no navegador
 * (UTC−3 fixo: o Brasil não tem horário de verão desde 2019). Só a data quando a fonte não dá a hora.
 */
export function dataPracaLabel(iso: string | null | undefined) {
  if (!iso) return "não informada pela fonte";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.split("-").reverse().join("/");
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "não informada pela fonte";
  const d = new Date(t - 3 * 3600 * 1000);
  return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} às ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
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
