/**
 * O que cada plano vê. Uma regra só para o servidor (o dado da Luneta não sai para o Lente) e para a tela (a chamada
 * da Luneta no lugar). Decisão da rodada 4 ("todas as novas implementações vão para o plano Luneta"): Lente =
 * encontrar; Luneta = decidir; Telescópio = a Luneta para equipes.
 *
 * - Lente: busca com os 6 filtros prometidos na página de planos (estado, cidade, tipo, faixa de preço, deságio e
 *   data; ver FILTROS_LENTE), as ordens por preço, deságio, data, área, m² e recentes, fotos, vistas, mapa e a página
 *   do imóvel com os dados da fonte, o glossário, o registro e os imóveis parecidos.
 * - Luneta: tudo, incluindo o que está em RECURSOS_LUNETA (tags, selos, favoritos, simulador, relatório, preço da
 *   região, buscas nos portais, nota de localização e os filtros avançados).
 *
 * Toda trava é "pelo menos o plano mínimo do recurso" (NIVEL × MINIMO), nunca "igual à Luneta": um 3º plano
 * (Telescópio) entra no tipo Plano e em NIVEL com nível 2 e vê tudo da Luneta sem mudar nenhuma tela.
 *
 * Sem imports com "@/" e sem importar consulta.ts (que importa este módulo): os testes rodam em Node puro.
 */
import { ORDEM_PADRAO, type Filtros, type Ordem, type PaginaImovel, type Plano, type Recurso } from "./tipos";
import { FAVORITOS_CHAMADA, TAGS_CHAMADA } from "./produto";

export type { Recurso } from "./tipos";

/** Todos os recursos, na ordem em que a tela os cita. */
export const RECURSOS: readonly Recurso[] = ["tags", "selos", "favoritos", "simulador", "relatorio", "regiao", "portais", "localizacao", "filtrosAvancados"];

/**
 * Nível de cada plano. O Telescópio, quando existir no catálogo (com login), entra aqui com nível 2 e no tipo Plano;
 * nenhuma trava muda. Plano desconhecido em tempo de execução vale como o Lente (o mais fechado).
 */
const NIVEL: Record<Plano, number> = { lente: 0, luneta: 1 };

/**
 * O plano de um parâmetro da URL (`?plano=`) ou da sessão. Sem valor: o padrão da demonstração (`ausente`, hoje a
 * Luneta: a prévia e a /assinante abrem com tudo). Valor presente vale pelo nome, sem diferença de caixa nem de espaço
 * ("LENTE", " lente"); valor desconhecido ("telescopio" antes de existir, "plano[]=...", vazio) vale como o Lente, o
 * mais fechado, nunca como a Luneta (revisão final da rodada 4, R4-VAZ-07).
 */
export function lerPlano(v: string | string[] | null | undefined, ausente: Plano = "luneta"): Plano {
  if (v === undefined || v === null) return ausente;
  const bruto = Array.isArray(v) ? v[0] : v;
  const nome = typeof bruto === "string" ? bruto.trim().toLowerCase() : "";
  return nome === "luneta" ? "luneta" : "lente";
}

/** O plano mínimo de cada recurso. Trocar um recurso de plano é mudar esta constante (e a tabela de planos). */
export const MINIMO: Readonly<Record<Recurso, Plano>> = {
  tags: "luneta",
  selos: "luneta",
  favoritos: "luneta",
  simulador: "luneta",
  relatorio: "luneta",
  regiao: "luneta",
  portais: "luneta",
  localizacao: "luneta",
  filtrosAvancados: "luneta",
};

/** "a", "a e b", "a, b e c" */
export function lista(itens: readonly string[]): string {
  return itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Os filtros que cada plano tem, com as chaves de `Filtros` por trás de cada rótulo: a fonte única dos textos (a
 * tabela e a seção Filtros da landing, a chamada do painel e a janela da Luneta; revisão final da rodada 4, UX-10). O
 * Lente tem os 6 de sempre (e a busca por texto); o resto é "filtro avançado", do plano Luneta. `destaque`: os que a
 * chamada curta cita antes do "e mais". O teste src/content/site.test.ts confere as chaves com FILTROS_LENTE, e o tipo
 * `FiltroSemLugar` (src/content/site.ts) obriga a dar lugar a todo filtro novo de `Filtros`.
 */
export const FILTROS_PROMETIDOS = {
  lente: [
    { rotulo: "estado", chaves: ["uf"] },
    { rotulo: "cidade", chaves: ["cidade", "bairro"] },
    { rotulo: "tipo", chaves: ["tipo"] },
    { rotulo: "faixa de preço", chaves: ["lanceMin", "lanceMax", "avaliacaoMin", "avaliacaoMax"] },
    { rotulo: "deságio", chaves: ["desagioMin", "desagioMax"] },
    { rotulo: "data", chaves: ["dataDe", "dataAte"] },
  ],
  luneta: [
    { rotulo: "área", chaves: ["areaMin", "areaMax"], destaque: true },
    { rotulo: "quartos", chaves: ["quartosMin"], destaque: true },
    { rotulo: "vagas", chaves: ["vagasMin"], destaque: true },
    { rotulo: "R$/m²", chaves: ["lanceM2Min", "lanceM2Max"] },
    { rotulo: "praça", chaves: ["praca"], destaque: true },
    { rotulo: "modalidade", chaves: ["modalidade", "natureza"] },
    { rotulo: "ocupação", chaves: ["ocupacao"] },
    { rotulo: "forma de pagamento", chaves: ["financiamento", "fgts", "parcelamento"], destaque: true },
    { rotulo: "fonte", chaves: ["fonte"] },
    { rotulo: "foto", chaves: ["comFoto"] },
    { rotulo: "tags de risco", chaves: ["comTags", "semTags"] },
    { rotulo: "selo", chaves: ["selo"] },
    { rotulo: "nota de localização", chaves: ["notaLocalMin"] },
    { rotulo: "metrô perto", chaves: ["metroPerto"] },
  ],
} as const satisfies Record<"lente" | "luneta", readonly { rotulo: string; chaves: readonly (keyof Filtros)[]; destaque?: boolean }[]>;

/** "estado, cidade, tipo, faixa de preço, deságio e data" */
export const FILTROS_DO_LENTE = lista(FILTROS_PROMETIDOS.lente.map((f) => f.rotulo));
/** "área, quartos, vagas, R$/m², praça, …, tags de risco, selo e nota de localização" (todos) */
export const FILTROS_DA_LUNETA = lista(FILTROS_PROMETIDOS.luneta.map((f) => f.rotulo));
/** "área, quartos, vagas, praça, forma de pagamento e mais" (a chamada curta e a janela) */
export const FILTROS_AVANCADOS_CURTO = `${FILTROS_PROMETIDOS.luneta
  .filter((f) => "destaque" in f && f.destaque)
  .map((f) => f.rotulo)
  .join(", ")} e mais`;

/**
 * Recursos da Luneta, com o nome e o texto curto da chamada (o Lente vê a chamada no lugar). Os textos maiores (a
 * janela da Luneta) ficam em src/components/catalogo/planos/textos.ts.
 */
export const RECURSOS_LUNETA: Record<Recurso, { rotulo: string; chamada: string }> = {
  tags: { rotulo: "Tags de risco", chamada: TAGS_CHAMADA },
  selos: { rotulo: "Selos", chamada: "Os imóveis que passam nos critérios da Luneta, de Promissor a Alvo." },
  favoritos: { rotulo: "Favoritos", chamada: FAVORITOS_CHAMADA },
  simulador: { rotulo: "Simulador de lance", chamada: "Até quanto vale dar de lance para a sua meta, com os custos do leilão e três cenários de venda." },
  relatorio: { rotulo: "Relatório em PDF", chamada: "O imóvel, a simulação e os alertas num relatório em folhas A4, pronto para imprimir." },
  regiao: { rotulo: "Preço do m² na região", chamada: "A avaliação comparada com a rua, o bairro e a cidade e, em 5 capitais, com as compras registradas na prefeitura (ITBI)." },
  portais: { rotulo: "Buscas nos portais", chamada: "Anúncios parecidos na mesma rua, no bairro e na cidade, a um clique." },
  localizacao: {
    rotulo: "Nota de localização",
    chamada: "Uma nota de 0 a 100 para o entorno do imóvel com endereço localizado, comparado com o resto da cidade, com cada parte explicada.",
  },
  filtrosAvancados: { rotulo: "Filtros avançados", chamada: `${maiuscula(FILTROS_AVANCADOS_CURTO)}.` },
};

/** O plano vê o recurso? Lente: só o que não é da Luneta; Luneta (e um plano acima dela): tudo. */
export function pode(plano: Plano, recurso: Recurso): boolean {
  return (NIVEL[plano] ?? 0) >= NIVEL[MINIMO[recurso]];
}

/** O que o plano NÃO vê, na ordem de RECURSOS (PaginaImovel.travas). */
export function travasDo(plano: Plano): Recurso[] {
  return RECURSOS.filter((r) => !pode(plano, r));
}

// ---------------------------------------------------------------------------
// Filtros e ordens
// ---------------------------------------------------------------------------

/**
 * Os filtros do Lente: os 6 prometidos na página de planos (estado e cidade com o bairro, tipo, faixa de preço com a
 * avaliação, deságio e data), mais a busca por texto. O resto é "filtro avançado" (Luneta), ou de tags, selo e nota.
 */
export const FILTROS_LENTE: (keyof Filtros)[] = [
  "q", "uf", "cidade", "bairro", "tipo", "lanceMin", "lanceMax", "avaliacaoMin", "avaliacaoMax", "desagioMin", "desagioMax", "dataDe", "dataAte",
];
const DO_LENTE: ReadonlySet<keyof Filtros> = new Set(FILTROS_LENTE);

/** De que recurso é cada filtro: null = do Lente (todos os planos); tags, selo e nota têm recurso próprio. */
export function recursoDoFiltro(chave: keyof Filtros): Recurso | null {
  // a área do mapa ("Buscar nesta área") é da vista de mapa, que os dois planos têm: não é filtro avançado
  if (DO_LENTE.has(chave) || chave === "bbox") return null;
  if (chave === "comTags" || chave === "semTags") return "tags";
  if (chave === "selo") return "selos";
  if (chave === "notaLocalMin") return "localizacao";
  return "filtrosAvancados";
}

/** O plano usa este filtro? */
export function filtroPermitido(chave: keyof Filtros, plano: Plano): boolean {
  const r = recursoDoFiltro(chave);
  return r === null || pode(plano, r);
}

const preenchido = (v: unknown) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);

/**
 * Os filtros presentes que o plano não usa, na ordem em que vieram (um link da Luneta aberto no Lente): o servidor
 * os ignora e a tela avisa "este filtro é do plano Luneta". Vazio quando tudo vale.
 */
export function filtrosForaDoPlano(f: Filtros, plano: Plano): (keyof Filtros)[] {
  return (Object.keys(f) as (keyof Filtros)[]).filter((k) => preenchido(f[k]) && !filtroPermitido(k, plano));
}

/** Os filtros que valem no plano (o servidor busca só com eles). O mesmo objeto quando nada sai. */
export function filtrosDoPlano(f: Filtros, plano: Plano): Filtros {
  const fora = filtrosForaDoPlano(f, plano);
  if (fora.length === 0) return f;
  const saida: Filtros = { ...f };
  for (const k of fora) delete saida[k];
  return saida;
}

/** Ordens que dependem de um recurso da Luneta: "Menos alertas" (tags), "Melhor selo" e "Melhor localização". */
export const RECURSO_DA_ORDEM: Readonly<Partial<Record<Ordem, Recurso>>> = { alertas: "tags", selo: "selos", localizacao: "localizacao" };

/** O plano pode usar esta ordem? */
export function ordemPermitida(o: Ordem, plano: Plano): boolean {
  const r = RECURSO_DA_ORDEM[o];
  return r === undefined || pode(plano, r);
}

/** A ordem que vale no plano: as da Luneta caem para a padrão (maior deságio) no Lente. */
export function ordemDoPlano(o: Ordem, plano: Plano): Ordem {
  return ordemPermitida(o, plano) ? o : ORDEM_PADRAO;
}

// ---------------------------------------------------------------------------
// O que sai do servidor
// ---------------------------------------------------------------------------

/**
 * Tira de um imóvel da lista o que o plano não vê: no Lente, tags, selo e a nota de localização (o conteúdo bloqueado
 * nunca chega ao navegador). O mesmo objeto quando o plano vê tudo.
 */
export function paraPlano<T extends { tags: unknown[]; selo: number; notaLocal?: number | null }>(item: T, plano: Plano): T {
  const tags = pode(plano, "tags");
  const selo = pode(plano, "selos");
  const nota = pode(plano, "localizacao");
  if (tags && selo && nota) return item;
  return {
    ...item,
    ...(tags ? {} : { tags: [] }),
    ...(selo ? {} : { selo: 0 }),
    ...(!nota && "notaLocal" in item ? { notaLocal: null } : {}),
  };
}

/**
 * A página do imóvel com o plano aplicado (o que o plano não vê não sai do servidor): no Lente, sem tags, selo,
 * explicação do selo e nota de localização (`localizacao: null`, `notaLocal: null`), sem o preço da região (leilões e
 * ITBI: `referencias: []`) e sem as buscas nos portais (`buscasExternas: []`). Ficam a cobertura de preços (de quais
 * cidades a Luneta tem o dado), os parecidos (com o plano aplicado) e o ponto no mapa. `travas` diz o que falta.
 */
export function aplicarPlanoPagina(p: PaginaImovel, plano: Plano): PaginaImovel {
  const travas = travasDo(plano);
  if (travas.length === 0) return { ...p, travas };
  const tags = pode(plano, "tags");
  const selos = pode(plano, "selos");
  const nota = pode(plano, "localizacao");
  return {
    ...p,
    imovel: {
      ...p.imovel,
      ...(tags ? {} : { tags: [] }),
      ...(selos ? {} : { selo: 0 as const, porQueSelo: "" }),
      ...(nota ? {} : { notaLocal: null }),
    },
    vizinhanca: {
      ...p.vizinhanca,
      referencias: pode(plano, "regiao") ? p.vizinhanca.referencias : [],
      buscasExternas: pode(plano, "portais") ? p.vizinhanca.buscasExternas : [],
      parecidos: p.vizinhanca.parecidos.map((x) => paraPlano(x, plano)),
    },
    localizacao: nota ? p.localizacao : null,
    travas,
  };
}
