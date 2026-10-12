/**
 * Catálogo das 26 tags de risco da base.
 *
 * O `slug` é o identificador estável: é o que vai para o banco (tabela `risco`), para a
 * exportação e para as regras. Rótulo, categoria e severidade são iguais aos do site
 * (src/content/tags.ts, onde também ficam as explicações); o teste `tags.test.ts` confere.
 * Para mudar um rótulo, mude nos dois lugares. Para criar uma tag, acrescente aqui e no site.
 * Nunca reaproveite nem renomeie um slug: crie outro.
 */

/** Gravidade, com os mesmos valores do site: vermelho, amarelo, verde e cinza. */
export type Severidade = "grave" | "atencao" | "positivo" | "info";

export type CategoriaTag =
  | "posse"
  | "preco"
  | "dividas"
  | "juridico"
  | "documentacao"
  | "propriedade"
  | "condicao"
  | "praca";

/** Nome de cada categoria como aparece no site, na ordem do site. */
export const CATEGORIAS: Readonly<Record<CategoriaTag, string>> = {
  posse: "Posse",
  preco: "Preço",
  dividas: "Dívidas",
  juridico: "Jurídico",
  documentacao: "Documentação",
  propriedade: "Propriedade",
  condicao: "Condição",
  praca: "Praça",
};

/**
 * Grupos de tags que não deveriam valer "sim" ao mesmo tempo. Quando duas tags do mesmo
 * grupo saem "sim" para um imóvel, o motor marca as duas para revisão humana.
 */
export type GrupoExclusivo = "ocupacao" | "desagio" | "praca";

export interface DefinicaoTag {
  readonly slug: string;
  readonly rotulo: string;
  readonly categoria: CategoriaTag;
  readonly severidade: Severidade;
  readonly grupo?: GrupoExclusivo;
}

export const TAGS = [
  // Posse
  { slug: "ocupado", rotulo: "Ocupado", categoria: "posse", severidade: "grave", grupo: "ocupacao" },
  { slug: "desocupado", rotulo: "Desocupado", categoria: "posse", severidade: "positivo", grupo: "ocupacao" },
  { slug: "ocupacao-nao-informada", rotulo: "Ocupação não informada", categoria: "posse", severidade: "info", grupo: "ocupacao" },
  // Preço
  { slug: "desagio-alto", rotulo: "Deságio alto", categoria: "preco", severidade: "positivo", grupo: "desagio" },
  { slug: "desagio-baixo", rotulo: "Deságio baixo", categoria: "preco", severidade: "atencao", grupo: "desagio" },
  { slug: "preco-acima-mercado", rotulo: "Preço acima do mercado", categoria: "preco", severidade: "grave" },
  { slug: "custos-extras-altos", rotulo: "Custos extras altos", categoria: "preco", severidade: "atencao" },
  // Dívidas
  { slug: "condominio-em-atraso", rotulo: "Condomínio em atraso", categoria: "dividas", severidade: "atencao" },
  { slug: "iptu-em-atraso", rotulo: "IPTU em atraso", categoria: "dividas", severidade: "atencao" },
  { slug: "divida-passa-arrematante", rotulo: "Dívida passa ao arrematante", categoria: "dividas", severidade: "grave" },
  // Jurídico
  { slug: "acao-judicial", rotulo: "Ação judicial em curso", categoria: "juridico", severidade: "grave" },
  { slug: "penhora-outros-credores", rotulo: "Penhora de outros credores", categoria: "juridico", severidade: "grave" },
  { slug: "leilao-com-recurso", rotulo: "Leilão com recurso", categoria: "juridico", severidade: "atencao" },
  { slug: "direito-preferencia", rotulo: "Devedor com direito de preferência", categoria: "juridico", severidade: "atencao" },
  // Documentação
  { slug: "matricula-pendencia", rotulo: "Matrícula com pendência", categoria: "documentacao", severidade: "atencao" },
  { slug: "construcao-irregular", rotulo: "Construção irregular", categoria: "documentacao", severidade: "grave" },
  { slug: "area-divergente", rotulo: "Área divergente", categoria: "documentacao", severidade: "atencao" },
  // Propriedade
  { slug: "imovel-inteiro", rotulo: "Imóvel inteiro", categoria: "propriedade", severidade: "positivo" },
  { slug: "cota-parte", rotulo: "Cota-parte", categoria: "propriedade", severidade: "atencao" },
  { slug: "so-direitos", rotulo: "Só direitos sobre o imóvel", categoria: "propriedade", severidade: "grave" },
  // Condição
  { slug: "sem-fotos", rotulo: "Sem fotos", categoria: "condicao", severidade: "info" },
  { slug: "sem-vistoria", rotulo: "Sem vistoria", categoria: "condicao", severidade: "info" },
  { slug: "aceita-financiamento", rotulo: "Aceita financiamento", categoria: "condicao", severidade: "positivo" },
  // Praça
  { slug: "primeira-praca", rotulo: "1ª praça", categoria: "praca", severidade: "info", grupo: "praca" },
  { slug: "segunda-praca", rotulo: "2ª praça", categoria: "praca", severidade: "positivo", grupo: "praca" },
  { slug: "praca-unica", rotulo: "Praça única", categoria: "praca", severidade: "info", grupo: "praca" },
] as const satisfies readonly DefinicaoTag[];

export type SlugTag = (typeof TAGS)[number]["slug"];

const POR_SLUG: ReadonlyMap<string, DefinicaoTag> = new Map(TAGS.map((t) => [t.slug, t]));

export function ehSlugTag(valor: string): valor is SlugTag {
  return POR_SLUG.has(valor);
}

/** Definição de uma tag pelo slug; `undefined` se o slug não existir. */
export function definicaoTag(slug: string): DefinicaoTag | undefined {
  return POR_SLUG.get(slug);
}
