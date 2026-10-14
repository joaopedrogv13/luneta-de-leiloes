/**
 * Textos das tags de risco para o catálogo: slug → "O que é" e "Na prática", a origem da evidência em
 * português e a ordem de leitura. Os textos vêm de src/content/tags.ts (casados pelo rótulo, sem acento e
 * sem caixa); a lista de slugs espelha base/riscos/tags.ts (o teste confere). Tag que não estiver no site
 * ganha um texto genérico pela gravidade, nunca uma tela vazia.
 *
 * Imports relativos (sem "@/"): o teste roda em Node puro.
 */
import { TAG_CATEGORIES } from "../../../content/tags";
import type { Confianca, Severidade, TagResumo } from "../../../lib/catalogo/tipos";

/** As 26 tags da base (base/riscos/tags.ts), na mesma ordem. */
export const TAGS_BASE = [
  { slug: "ocupado", rotulo: "Ocupado", severidade: "grave", categoria: "Posse" },
  { slug: "desocupado", rotulo: "Desocupado", severidade: "positivo", categoria: "Posse" },
  { slug: "ocupacao-nao-informada", rotulo: "Ocupação não informada", severidade: "info", categoria: "Posse" },
  { slug: "desagio-alto", rotulo: "Deságio alto", severidade: "positivo", categoria: "Preço" },
  { slug: "desagio-baixo", rotulo: "Deságio baixo", severidade: "atencao", categoria: "Preço" },
  { slug: "preco-acima-mercado", rotulo: "Preço acima do mercado", severidade: "grave", categoria: "Preço" },
  { slug: "custos-extras-altos", rotulo: "Custos extras altos", severidade: "atencao", categoria: "Preço" },
  { slug: "condominio-em-atraso", rotulo: "Condomínio em atraso", severidade: "atencao", categoria: "Dívidas" },
  { slug: "iptu-em-atraso", rotulo: "IPTU em atraso", severidade: "atencao", categoria: "Dívidas" },
  { slug: "divida-passa-arrematante", rotulo: "Dívida passa ao arrematante", severidade: "grave", categoria: "Dívidas" },
  { slug: "acao-judicial", rotulo: "Ação judicial em curso", severidade: "grave", categoria: "Jurídico" },
  { slug: "penhora-outros-credores", rotulo: "Penhora de outros credores", severidade: "grave", categoria: "Jurídico" },
  { slug: "leilao-com-recurso", rotulo: "Leilão com recurso", severidade: "atencao", categoria: "Jurídico" },
  { slug: "direito-preferencia", rotulo: "Devedor com direito de preferência", severidade: "atencao", categoria: "Jurídico" },
  { slug: "matricula-pendencia", rotulo: "Matrícula com pendência", severidade: "atencao", categoria: "Documentação" },
  { slug: "construcao-irregular", rotulo: "Construção irregular", severidade: "grave", categoria: "Documentação" },
  { slug: "area-divergente", rotulo: "Área divergente", severidade: "atencao", categoria: "Documentação" },
  { slug: "imovel-inteiro", rotulo: "Imóvel inteiro", severidade: "positivo", categoria: "Propriedade" },
  { slug: "cota-parte", rotulo: "Cota-parte", severidade: "atencao", categoria: "Propriedade" },
  { slug: "so-direitos", rotulo: "Só direitos sobre o imóvel", severidade: "grave", categoria: "Propriedade" },
  { slug: "sem-fotos", rotulo: "Sem fotos", severidade: "info", categoria: "Condição" },
  { slug: "sem-vistoria", rotulo: "Sem vistoria", severidade: "info", categoria: "Condição" },
  { slug: "aceita-financiamento", rotulo: "Aceita financiamento", severidade: "positivo", categoria: "Condição" },
  { slug: "primeira-praca", rotulo: "1ª praça", severidade: "info", categoria: "Praça" },
  { slug: "segunda-praca", rotulo: "2ª praça", severidade: "positivo", categoria: "Praça" },
  { slug: "praca-unica", rotulo: "Praça única", severidade: "info", categoria: "Praça" },
] as const satisfies readonly { slug: string; rotulo: string; severidade: Severidade; categoria: string }[];

export interface ConteudoTag {
  slug: string;
  rotulo: string;
  severidade: Severidade;
  /** "Posse", "Preço"...; null para um slug que a base não conhece */
  categoria: string | null;
  oQueE: string;
  naPratica: string;
  /** true quando o texto é o genérico da gravidade (a tag ainda não tem explicação própria no site) */
  generico: boolean;
}

/** Ordem de leitura: grave, atenção, positivo, informativo. */
export const SEVERIDADE_ORDEM: readonly Severidade[] = ["grave", "atencao", "positivo", "info"];

const chave = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ª]+/g, " ")
    .trim();

const TEXTOS_SITE = new Map<string, { what: string; practice: string; categoria: string }>();
for (const cat of TAG_CATEGORIES) {
  for (const t of cat.tags) TEXTOS_SITE.set(chave(t.label), { what: t.what, practice: t.practice, categoria: cat.name });
}

const BASE_POR_SLUG = new Map<string, (typeof TAGS_BASE)[number]>(TAGS_BASE.map((t) => [t.slug, t]));

/** Texto genérico por gravidade, para tag sem explicação própria no site. */
const GENERICO: Record<Severidade, { oQueE: string; naPratica: string }> = {
  grave: {
    oQueE: "Ponto de risco sério encontrado no anúncio ou no edital deste imóvel.",
    naPratica: "Entenda o que ele significa para este imóvel, de preferência com um advogado, antes de dar qualquer lance.",
  },
  atencao: {
    oQueE: "Ponto que pede cuidado: pode trazer custo, prazo ou trabalho extra para quem arremata.",
    naPratica: "Confira no edital o que ele significa para este imóvel e coloque na conta antes do lance.",
  },
  positivo: {
    oQueE: "Ponto a favor deste imóvel, segundo o anúncio ou o edital.",
    naPratica: "É uma vantagem, não uma garantia: confira as outras tags e o edital antes do lance.",
  },
  info: {
    oQueE: "Informação sobre este imóvel que ajuda a entender o leilão.",
    naPratica: "Use para comparar com outros imóveis e confira os detalhes no edital.",
  },
};

/** Explicação de uma tag: casa pelo slug (rótulo oficial da base) e, se preciso, pelo rótulo recebido. */
export function conteudoTag(tag: Pick<TagResumo, "slug" | "rotulo" | "severidade">): ConteudoTag {
  const base = BASE_POR_SLUG.get(tag.slug);
  const site = (base && TEXTOS_SITE.get(chave(base.rotulo))) ?? TEXTOS_SITE.get(chave(tag.rotulo));
  const rotulo = tag.rotulo || base?.rotulo || tag.slug;
  if (site) {
    return { slug: tag.slug, rotulo, severidade: tag.severidade, categoria: base?.categoria ?? site.categoria, oQueE: site.what, naPratica: site.practice, generico: false };
  }
  const g = GENERICO[tag.severidade] ?? GENERICO.info;
  return { slug: tag.slug, rotulo, severidade: tag.severidade, categoria: base?.categoria ?? null, ...g, generico: true };
}

/** Campos da fonte que viram tag, em português ("campo:modalidade_fonte" → "modalidade"). */
const CAMPOS: Record<string, string> = {
  modalidade: "modalidade da venda",
  modalidade_fonte: "modalidade da venda",
  judicial: "natureza da venda (judicial ou não)",
  "preco×valor_avaliacao": "preço e avaliação",
  "preco>valor_avaliacao": "preço e avaliação",
  preco: "preço",
  valor_avaliacao: "avaliação",
  aceita_financiamento: "aceita financiamento",
  aceita_fgts: "aceita FGTS",
  aceita_parcelamento: "aceita parcelamento",
  fotos: "fotos publicadas",
  praca_atual: "praça atual",
  pracas: "praças (datas e lances)",
  regra_praca: "regra das praças",
  ocupacao: "ocupação",
  area_total: "área",
  area_privativa: "área",
};

/**
 * De onde veio a tag, para leigos: "campo da fonte", "descrição do anúncio", "ficha do imóvel", "edital",
 * "a fonte não informa". `detalhe` diz qual campo, quando der.
 */
export function origemTag(origem: string): { rotulo: string; detalhe: string | null } {
  const o = origem.trim();
  if (o.startsWith("campo:")) {
    const campo = o.slice("campo:".length);
    return { rotulo: "campo da fonte", detalhe: CAMPOS[campo] ?? null };
  }
  switch (o) {
    case "descricao":
      return { rotulo: "descrição do anúncio", detalhe: null };
    case "titulo":
      return { rotulo: "título do anúncio", detalhe: null };
    case "ficha":
      return { rotulo: "ficha do imóvel", detalhe: null };
    case "edital":
      return { rotulo: "edital", detalhe: null };
    case "ausencia":
      return { rotulo: "a fonte não informa", detalhe: null };
    case "manual":
      return { rotulo: "leitura humana", detalhe: null };
    default:
      return { rotulo: "dados da fonte", detalhe: null };
  }
}

/** Origens em que a evidência traz um trecho literal da fonte (vai entre aspas); nas outras é a leitura dos campos. */
const ORIGENS_TRECHO = new Set(["descricao", "titulo", "ficha", "edital"]);

/**
 * Separa a evidência em nota da regra e trecho literal da fonte. O motor de regras às vezes escreve uma frase
 * própria antes do trecho ("Só há sinal fraco de ocupação no texto: …cada um…"): só o trecho vai entre aspas,
 * para não atribuir à fonte uma frase que é nossa. Origem de campo ou de ausência: tudo é nota (sem aspas).
 */
export function partesEvidencia(evidencia: string, origem: string): { nota: string | null; trecho: string | null } {
  const ev = evidencia.trim();
  if (!ev) return { nota: null, trecho: null };
  if (!ORIGENS_TRECHO.has(origem.trim())) return { nota: ev, trecho: null };
  const i = ev.indexOf("…");
  if (i > 0) {
    const antes = ev.slice(0, i).trim();
    if (antes.endsWith(":")) return { nota: antes, trecho: ev.slice(i).trim() };
  }
  return { nota: null, trecho: ev };
}

export const CONFIANCA_ROTULO: Record<Confianca, string> = { alta: "alta", media: "média", baixa: "baixa" };
/** Barras acesas no medidor de confiança (de 3). */
export const CONFIANCA_NIVEL: Record<Confianca, 1 | 2 | 3> = { alta: 3, media: 2, baixa: 1 };

/**
 * Ordem de leitura das tags: confirmadas antes das em revisão; dentro de cada grupo, grave, atenção,
 * positivo e informativo; empate mantém a ordem recebida. Não altera a lista original.
 */
export function ordenarTags<T extends Pick<TagResumo, "severidade" | "emRevisao">>(tags: readonly T[]): T[] {
  const peso = (t: T) => (t.emRevisao ? 10 : 0) + Math.max(0, SEVERIDADE_ORDEM.indexOf(t.severidade));
  return tags
    .map((t, i) => ({ t, i }))
    .sort((a, b) => peso(a.t) - peso(b.t) || a.i - b.i)
    .map((x) => x.t);
}
