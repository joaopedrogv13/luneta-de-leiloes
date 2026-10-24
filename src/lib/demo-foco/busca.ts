/**
 * Filtros, ordem e contagens da demonstração "Ajuste o foco" (landing), sobre os imóveis fictícios de ./dados. A
 * mesma ideia da busca do catálogo (src/lib/catalogo/consulta.ts), em miniatura e no navegador:
 * - cada grupo de filtro é um "E"; dentro de um grupo de lista (estados, tipos, praças…), um "OU";
 * - as contagens de cada opção valem com os OUTROS filtros aplicados (tocar numa opção dá exatamente aquele
 *   número), e os histogramas das faixas também;
 * - as escalas dos histogramas são fixas (as barrinhas crescem e encolhem no lugar, sem os cursores pularem).
 * 150 imóveis: filtrar, ordenar e contar tudo leva bem menos de 1 ms, então a lista responde a cada movimento.
 *
 * Sem imports com "@/": os testes rodam em Node puro.
 */
import { textoFaixa, type FormatoFaixa } from "../catalogo/filtros-rotulos";
import { FILTROS_LENTE } from "../catalogo/planos";
import { UF_NOME, normalizar } from "../catalogo/rotulos";
import type { Filtros, Histograma } from "../catalogo/tipos";
import { METRO_PERTO, chaveCidade, tituloImovel, type ImovelFoco, type OcupacaoFoco, type PracaFoco, type TipoFoco } from "./dados";

export interface FiltrosFoco {
  /** busca por texto: cidade, bairro, estado ou tipo ("tatuapé 2 quartos") */
  q?: string;
  uf?: string[];
  /** "UF|Cidade" */
  cidade?: string[];
  tipo?: TipoFoco[];
  lanceMin?: number;
  lanceMax?: number;
  desagioMin?: number;
  desagioMax?: number;
  praca?: PracaFoco[];
  quartosMin?: number;
  areaMin?: number;
  areaMax?: number;
  // ---- plano Luneta (na demonstração, funcionam) ----
  ocupacao?: OcupacaoFoco[];
  financiamento?: boolean;
  notaMin?: number;
  /** só imóveis a até 1 km de uma estação de metrô */
  metro?: boolean;
}

export type GrupoFoco = "q" | "uf" | "cidade" | "tipo" | "lance" | "desagio" | "praca" | "quartos" | "area" | "ocupacao" | "financiamento" | "nota" | "metro";

/** Os grupos na ordem da tela (pílulas, contagem). */
export const GRUPOS: readonly GrupoFoco[] = ["q", "uf", "cidade", "tipo", "lance", "desagio", "praca", "quartos", "area", "ocupacao", "financiamento", "nota", "metro"];

/**
 * O filtro do catálogo (src/lib/catalogo/tipos.ts, Filtros) por trás de cada grupo da demonstração. O metrô ainda não
 * é filtro do catálogo (rodada 5, ponto 11: "Metrô a até 1 km" nos filtros avançados): null, e conta como da Luneta.
 */
const FILTRO_DO_CATALOGO: Record<GrupoFoco, keyof Filtros | null> = {
  q: "q",
  uf: "uf",
  cidade: "cidade",
  tipo: "tipo",
  lance: "lanceMin",
  desagio: "desagioMin",
  praca: "praca",
  quartos: "quartosMin",
  area: "areaMin",
  ocupacao: "ocupacao",
  financiamento: "financiamento",
  nota: "notaLocalMin",
  // o filtro "Metrô a até 1 km" do catálogo (Filtros.metroPerto, URL metro=1; Luneta)
  metro: "metroPerto",
};

/**
 * Filtros avançados do plano Luneta, pela mesma regra do produto (FILTROS_LENTE em src/lib/catalogo/planos.ts): o
 * que não é do Lente leva o selo da Luneta na demonstração (praça, quartos, área, ocupação, financiamento, nota e
 * metrô). Na demonstração, todos funcionam.
 */
export const GRUPOS_LUNETA: ReadonlySet<GrupoFoco> = new Set(
  (Object.keys(FILTRO_DO_CATALOGO) as GrupoFoco[]).filter((g) => {
    const chave = FILTRO_DO_CATALOGO[g];
    return chave === null || !FILTROS_LENTE.includes(chave);
  }),
);

export type OrdemFoco = "desagio" | "lance-asc" | "lance-desc" | "area-desc" | "localizacao";

/** Ordens com os mesmos nomes da prévia (src/lib/catalogo/rotulos.ts, ORDEM_ROTULO). */
export const ORDENS: readonly { valor: OrdemFoco; rotulo: string; luneta?: true }[] = [
  { valor: "desagio", rotulo: "Maior deságio" },
  { valor: "lance-asc", rotulo: "Menor lance" },
  { valor: "lance-desc", rotulo: "Maior lance" },
  { valor: "area-desc", rotulo: "Maior área" },
  { valor: "localizacao", rotulo: "Melhor localização", luneta: true },
];

export const TIPO_ROTULO: Record<TipoFoco, string> = { apartamento: "Apartamento", casa: "Casa", comercial: "Comercial", terreno: "Terreno" };
export const PRACA_ROTULO: Record<PracaFoco, string> = { "1": "1ª praça", "2": "2ª praça", unica: "Praça única" };
export const OCUPACAO_ROTULO: Record<OcupacaoFoco, string> = { desocupado: "Desocupado", ocupado: "Ocupado", nao_informado: "Não informada" };
/** Mínimos prontos da nota de localização (os mesmos da prévia). */
export const NOTAS = [40, 60, 80] as const;
/** Escolhas de quartos ("pelo menos"). */
export const QUARTOS = [1, 2, 3, 4] as const;

type Faixa = "lance" | "desagio" | "area";

/**
 * Limites fixos das barrinhas de cada faixa (números redondos; a largura de cada barra vale um degrau). Abaixo do 1º
 * limite conta na 1ª barra e acima do último, na última (como no catálogo). O teste confere que cobrem os dados.
 */
export const LIMITES: Record<Faixa, readonly number[]> = {
  lance: [50_000, 75_000, 100_000, 125_000, 150_000, 175_000, 200_000, 250_000, 300_000, 350_000, 400_000, 500_000, 600_000, 700_000, 800_000, 1_000_000, 1_250_000, 1_500_000, 2_000_000, 2_500_000],
  desagio: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65],
  area: [30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 200, 250, 300, 400, 500, 700, 900],
};

export const FORMATO: Record<Faixa, FormatoFaixa> = { lance: "moeda", desagio: "desagio", area: "m2" };

const CAMPO: Record<Faixa, { min: keyof FiltrosFoco; max: keyof FiltrosFoco; valor: (i: ImovelFoco) => number }> = {
  lance: { min: "lanceMin", max: "lanceMax", valor: (i) => i.lance },
  desagio: { min: "desagioMin", max: "desagioMax", valor: (i) => i.desagio },
  area: { min: "areaMin", max: "areaMax", valor: (i) => i.area },
};

/** As chaves de FiltrosFoco de cada grupo. */
export const CHAVES: Record<GrupoFoco, readonly (keyof FiltrosFoco)[]> = {
  q: ["q"],
  uf: ["uf"],
  cidade: ["cidade"],
  tipo: ["tipo"],
  lance: ["lanceMin", "lanceMax"],
  desagio: ["desagioMin", "desagioMax"],
  praca: ["praca"],
  quartos: ["quartosMin"],
  area: ["areaMin", "areaMax"],
  ocupacao: ["ocupacao"],
  financiamento: ["financiamento"],
  nota: ["notaMin"],
  metro: ["metro"],
};

/** Texto em que a busca procura (sem acento e sem caixa), guardado por imóvel. */
const TEXTO = new WeakMap<ImovelFoco, string>();
function textoDe(i: ImovelFoco) {
  let t = TEXTO.get(i);
  if (t === undefined) {
    t = normalizar(`${tituloImovel(i)} ${TIPO_ROTULO[i.tipo]} ${i.bairro} ${i.cidade} ${i.uf} ${UF_NOME[i.uf] ?? ""} ${PRACA_ROTULO[i.praca]}`);
    TEXTO.set(i, t);
  }
  return t;
}

/**
 * Palavras da busca, sem acento ("São" acha "sao"). Número seguido de "quarto(s)" vira um termo só ("2 quart"): em
 * "2 quartos", o 2 é dos quartos, não da "2ª praça".
 */
export function termosDaBusca(q: string | undefined): string[] {
  const palavras = q ? normalizar(q).split(/\s+/).filter(Boolean) : [];
  const termos: string[] = [];
  for (let k = 0; k < palavras.length; k++) {
    if (/^\d+$/.test(palavras[k]) && palavras[k + 1]?.startsWith("quart")) {
      termos.push(`${palavras[k]} quart`);
      k++;
    } else termos.push(palavras[k]);
  }
  return termos;
}

const temLista = <T>(v: readonly T[] | undefined): v is readonly T[] => !!v && v.length > 0;
const dentro = (v: number, min: number | undefined, max: number | undefined) => (min === undefined || v >= min) && (max === undefined || v <= max);

/** O imóvel passa no grupo `g` dos filtros? */
export function passaNoGrupo(i: ImovelFoco, f: FiltrosFoco, g: GrupoFoco, termos = termosDaBusca(f.q)): boolean {
  switch (g) {
    case "q":
      return !termos.length || termos.every((t) => textoDe(i).includes(t));
    case "uf":
      return !temLista(f.uf) || f.uf.includes(i.uf);
    case "cidade":
      return !temLista(f.cidade) || f.cidade.includes(chaveCidade(i));
    case "tipo":
      return !temLista(f.tipo) || f.tipo.includes(i.tipo);
    case "lance":
    case "desagio":
    case "area": {
      const c = CAMPO[g];
      return dentro(c.valor(i), f[c.min] as number | undefined, f[c.max] as number | undefined);
    }
    case "praca":
      return !temLista(f.praca) || f.praca.includes(i.praca);
    case "quartos":
      return f.quartosMin === undefined || (i.quartos !== null && i.quartos >= f.quartosMin);
    case "ocupacao":
      return !temLista(f.ocupacao) || f.ocupacao.includes(i.ocupacao);
    case "financiamento":
      return f.financiamento === undefined || i.financiamento === f.financiamento;
    case "nota":
      return f.notaMin === undefined || (i.nota !== null && i.nota >= f.notaMin);
    case "metro":
      return !f.metro || (i.metro !== null && i.metro <= METRO_PERTO);
  }
}

/** O grupo `g` tem filtro valendo? */
export function grupoAtivo(f: FiltrosFoco, g: GrupoFoco): boolean {
  if (g === "q") return termosDaBusca(f.q).length > 0;
  if (g === "metro") return !!f.metro;
  return CHAVES[g].some((k) => {
    const v = f[k];
    return Array.isArray(v) ? v.length > 0 : v !== undefined;
  });
}

/** Os grupos com filtro valendo, na ordem da tela. */
export function gruposAtivos(f: FiltrosFoco): GrupoFoco[] {
  return GRUPOS.filter((g) => grupoAtivo(f, g));
}

/** Tira o grupo inteiro dos filtros. */
export function removerGrupo(f: FiltrosFoco, g: GrupoFoco): FiltrosFoco {
  const novo: FiltrosFoco = { ...f };
  for (const k of CHAVES[g]) delete novo[k];
  return novo;
}

/**
 * Troca os estados escolhidos. Como na prévia (definirUfs), as cidades de estados que saíram da lista saem também
 * (senão "Campinas" + estado "RJ" daria zero sem a pessoa entender por quê).
 */
export function definirUfs(f: FiltrosFoco, ufs: string[]): FiltrosFoco {
  const novo: FiltrosFoco = { ...f, uf: ufs };
  if (!ufs.length) delete novo.uf;
  if (ufs.length && novo.cidade) {
    novo.cidade = novo.cidade.filter((c) => ufs.includes(c.split("|")[0]));
    if (!novo.cidade.length) delete novo.cidade;
  }
  return novo;
}

/** Contagens de cada opção (com os OUTROS filtros aplicados) e histogramas das faixas. */
export interface FacetasFoco {
  uf: Record<string, number>;
  cidade: Record<string, number>;
  tipo: Record<TipoFoco, number>;
  praca: Record<PracaFoco, number>;
  ocupacao: Record<OcupacaoFoco, number>;
  /** quartos[n] = imóveis com pelo menos n quartos (n de 1 a 4) */
  quartos: Record<number, number>;
  /** imóveis que aceitam financiamento */
  financiamento: number;
  /** nota[t] = imóveis com nota ≥ t (t em NOTAS) */
  nota: Record<number, number>;
  /** imóveis a até 1 km do metrô */
  metro: number;
  lance: Histograma;
  desagio: Histograma;
  area: Histograma;
}

export interface ResultadoFoco {
  itens: ImovelFoco[];
  total: number;
  facetas: FacetasFoco;
}

function histogramaVazio(limites: readonly number[]): Histograma {
  return { min: limites[0], max: limites[limites.length - 1], limites: [...limites], totais: new Array<number>(limites.length - 1).fill(0) };
}

/** Em que barra cai o valor (abaixo do 1º limite: a 1ª; acima do último: a última). */
export function barraDe(limites: readonly number[], v: number): number {
  const n = limites.length - 1;
  let j = 0;
  while (j < n - 1 && v >= limites[j + 1]) j++;
  return j;
}

const ORDEM_FN: Record<OrdemFoco, (a: ImovelFoco, b: ImovelFoco) => number> = {
  desagio: (a, b) => b.desagio - a.desagio || a.lance - b.lance,
  "lance-asc": (a, b) => a.lance - b.lance,
  "lance-desc": (a, b) => b.lance - a.lance,
  "area-desc": (a, b) => b.area - a.area || a.lance - b.lance,
  // sem nota vai para o fim (como na prévia)
  localizacao: (a, b) => (b.nota ?? -1) - (a.nota ?? -1) || b.desagio - a.desagio,
};

/** Filtra, ordena e conta. A ordem é estável (empate: a ordem da lista, pelo id). */
export function buscar(lista: readonly ImovelFoco[], f: FiltrosFoco, ordem: OrdemFoco = "desagio"): ResultadoFoco {
  const termos = termosDaBusca(f.q);
  const ativos = gruposAtivos(f);
  const facetas: FacetasFoco = {
    uf: {},
    cidade: {},
    tipo: { apartamento: 0, casa: 0, comercial: 0, terreno: 0 },
    praca: { "1": 0, "2": 0, unica: 0 },
    ocupacao: { desocupado: 0, ocupado: 0, nao_informado: 0 },
    quartos: { 1: 0, 2: 0, 3: 0, 4: 0 },
    financiamento: 0,
    nota: { 40: 0, 60: 0, 80: 0 },
    metro: 0,
    lance: histogramaVazio(LIMITES.lance),
    desagio: histogramaVazio(LIMITES.desagio),
    area: histogramaVazio(LIMITES.area),
  };
  const itens: ImovelFoco[] = [];
  /** conta o imóvel na faceta do grupo g (ele passa em todos os outros) */
  const contar = (i: ImovelFoco, g: GrupoFoco) => {
    switch (g) {
      case "uf":
        facetas.uf[i.uf] = (facetas.uf[i.uf] ?? 0) + 1;
        break;
      case "cidade": {
        const k = chaveCidade(i);
        facetas.cidade[k] = (facetas.cidade[k] ?? 0) + 1;
        break;
      }
      case "tipo":
        facetas.tipo[i.tipo]++;
        break;
      case "praca":
        facetas.praca[i.praca]++;
        break;
      case "ocupacao":
        facetas.ocupacao[i.ocupacao]++;
        break;
      case "quartos":
        for (const n of QUARTOS) if (i.quartos !== null && i.quartos >= n) facetas.quartos[n]++;
        break;
      case "financiamento":
        if (i.financiamento) facetas.financiamento++;
        break;
      case "nota":
        for (const t of NOTAS) if (i.nota !== null && i.nota >= t) facetas.nota[t]++;
        break;
      case "metro":
        if (i.metro !== null && i.metro <= METRO_PERTO) facetas.metro++;
        break;
      case "lance":
      case "desagio":
      case "area": {
        const h = facetas[g];
        h.totais[barraDe(h.limites, CAMPO[g].valor(i))]++;
        break;
      }
      case "q":
        break;
    }
  };
  for (const i of lista) {
    // os grupos ativos em que o imóvel não passa (com 2 ou mais, não conta em faceta nenhuma)
    let falhou: GrupoFoco | null = null;
    let falhas = 0;
    for (const g of ativos) {
      if (!passaNoGrupo(i, f, g, termos)) {
        falhou = g;
        if (++falhas > 1) break;
      }
    }
    if (falhas > 1) continue;
    if (falhou) {
      contar(i, falhou);
      continue;
    }
    itens.push(i);
    for (const g of GRUPOS) contar(i, g);
  }
  itens.sort((a, b) => ORDEM_FN[ordem](a, b) || (a.id < b.id ? -1 : 1));
  return { itens, total: itens.length, facetas };
}

/** Quantos imóveis sairiam sem o grupo `g` (para "tirar o filtro que mais restringe" na lista vazia). */
export function sugestaoParaVazio(lista: readonly ImovelFoco[], f: FiltrosFoco): { grupo: GrupoFoco; total: number } | null {
  let melhor: { grupo: GrupoFoco; total: number } | null = null;
  for (const g of gruposAtivos(f)) {
    const sem = removerGrupo(f, g);
    const termos = termosDaBusca(sem.q);
    const ativos = gruposAtivos(sem);
    const total = lista.filter((i) => ativos.every((x) => passaNoGrupo(i, sem, x, termos))).length;
    if (total > 0 && (!melhor || total > melhor.total)) melhor = { grupo: g, total };
  }
  return melhor;
}

/** Nome curto de cada grupo (botões, pílulas, "tirar o filtro de …"). */
export const NOME_GRUPO: Record<GrupoFoco, string> = {
  q: "Busca",
  uf: "Estado",
  cidade: "Cidade",
  tipo: "Tipo",
  lance: "Preço",
  desagio: "Deságio",
  praca: "Praça",
  quartos: "Quartos",
  area: "Área",
  ocupacao: "Ocupação",
  financiamento: "Financiamento",
  nota: "Nota de localização",
  metro: "Metrô perto",
};

/** "A, B e mais 2" */
function listaCurta(itens: readonly string[], max = 2) {
  if (itens.length <= max) return itens.join(", ");
  return `${itens.slice(0, max).join(", ")} +${itens.length - max}`;
}

/**
 * O que o grupo filtra, em poucas palavras (o botão rápido ativo e a pílula): "SP, RJ", "Campinas +1",
 * "Até R$ 300 mil", "Deságio ≥ 40%", "3+ quartos", "Nota 60+", "Metrô a até 1 km". null sem filtro.
 */
export function resumoGrupo(f: FiltrosFoco, g: GrupoFoco): string | null {
  if (!grupoAtivo(f, g)) return null;
  const maiusc = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  switch (g) {
    case "q":
      return `“${f.q!.trim()}”`;
    case "uf":
      return listaCurta(f.uf!, 3);
    case "cidade":
      return listaCurta(f.cidade!.map((c) => c.split("|")[1]));
    case "tipo":
      return listaCurta(f.tipo!.map((t) => TIPO_ROTULO[t]));
    case "lance":
    case "desagio":
    case "area": {
      const c = CAMPO[g];
      const t = textoFaixa(f[c.min] as number | undefined, f[c.max] as number | undefined, FORMATO[g]);
      return t ? (g === "area" ? `Área ${t}` : maiusc(t)) : null;
    }
    case "praca":
      return listaCurta(f.praca!.map((p) => PRACA_ROTULO[p]));
    case "quartos":
      return `${f.quartosMin}+ ${f.quartosMin === 1 ? "quarto" : "quartos"}`;
    case "ocupacao":
      return listaCurta(f.ocupacao!.map((o) => (o === "nao_informado" ? "Ocupação não informada" : OCUPACAO_ROTULO[o])));
    case "financiamento":
      return f.financiamento ? "Aceita financiamento" : "Sem financiamento";
    case "nota":
      return `Nota ${f.notaMin}+`;
    case "metro":
      return "Metrô a até 1 km";
  }
}
