/**
 * Premissas do simulador: padrões CONSERVADORES por tipo de imóvel e a resolução "padrão ou ajuste".
 *
 * Os números são genéricos (não são de nenhuma cidade): servem para a conta não esquecer nenhum custo.
 * Cada premissa tem uma frase de explicação na tela e pode ser trocada pela pessoa. A ordem de resolução
 * importa: área → reforma e condomínio; avaliação/referência e área → valor de venda.
 */
import type { ReferenciaM2, TipoImovel } from "../catalogo/tipos";
import { NIVEIS_REFORMA, type Ajustes, type EntradaSimulador, type Meta, type NivelReforma, type OrigemVenda, type PerfilTipo, type Premissas } from "./tipos";

// ---------------------------------------------------------------------------
// Perfis por tipo
// ---------------------------------------------------------------------------

const DESC_CONSTRUIDO: Record<NivelReforma, string> = {
  nenhuma: "pronto para usar",
  leve: "pintura e pequenos reparos",
  media: "pisos, banheiro e cozinha",
  pesada: "elétrica, hidráulica e acabamentos",
};

function construido(
  tipo: TipoImovel,
  reforma: [number, number, number, number],
  extra: Pick<PerfilTipo, "condominioPadrao" | "opcaoCondominio" | "condominioM2" | "condominioMin" | "contasPadrao" | "areaTipica" | "rotuloArea">,
): PerfilTipo {
  return {
    tipo,
    modoReforma: "m2",
    reforma: { nenhuma: reforma[0], leve: reforma[1], media: reforma[2], pesada: reforma[3] },
    rotuloReforma: "Reforma",
    descricaoNivel: DESC_CONSTRUIDO,
    rotuloImposto: "IPTU",
    iptuPadrao: 0.01,
    ...extra,
  };
}

export const PERFIS: Record<TipoImovel, PerfilTipo> = {
  apartamento: construido("apartamento", [0, 350, 900, 1800], {
    condominioPadrao: true,
    opcaoCondominio: null,
    condominioM2: 9,
    condominioMin: 350,
    contasPadrao: 150,
    areaTipica: 60,
    rotuloArea: "área privativa",
  }),
  casa: construido("casa", [0, 450, 1100, 2200], {
    condominioPadrao: false,
    opcaoCondominio: "Casa em condomínio",
    condominioM2: 4,
    condominioMin: 0,
    contasPadrao: 200,
    areaTipica: 100,
    rotuloArea: "área construída",
  }),
  comercial: construido("comercial", [0, 300, 800, 1600], {
    condominioPadrao: true,
    opcaoCondominio: null,
    condominioM2: 12,
    condominioMin: 0,
    contasPadrao: 200,
    areaTipica: 80,
    rotuloArea: "área",
  }),
  outro: construido("outro", [0, 300, 800, 1600], {
    condominioPadrao: true,
    opcaoCondominio: null,
    condominioM2: 12,
    condominioMin: 0,
    contasPadrao: 200,
    areaTipica: 80,
    rotuloArea: "área",
  }),
  terreno: {
    tipo: "terreno",
    modoReforma: "fixo",
    reforma: { nenhuma: 0, leve: 2000, media: 5000, pesada: 10000 },
    rotuloReforma: "Limpeza e cercamento",
    descricaoNivel: { nenhuma: "nada a fazer", leve: "limpeza", media: "limpeza e cercamento", pesada: "muro, aterro ou terraplenagem" },
    condominioPadrao: false,
    opcaoCondominio: "Loteamento fechado",
    condominioM2: 0.8,
    condominioMin: 0,
    rotuloImposto: "IPTU",
    iptuPadrao: 0.015,
    contasPadrao: 80,
    areaTipica: 300,
    rotuloArea: "área do terreno",
  },
  rural: {
    tipo: "rural",
    modoReforma: "fixo",
    reforma: { nenhuma: 0, leve: 5000, media: 20000, pesada: 50000 },
    rotuloReforma: "Adequações",
    descricaoNivel: { nenhuma: "nada a fazer", leve: "cercas e acesso", media: "cercas, acesso e reparos", pesada: "benfeitorias e recuperação" },
    condominioPadrao: false,
    opcaoCondominio: null,
    condominioM2: 0,
    condominioMin: 0,
    rotuloImposto: "ITR",
    iptuPadrao: 0.001,
    contasPadrao: 300,
    areaTipica: 10000,
    rotuloArea: "área",
  },
};

export const ROTULO_NIVEL: Record<NivelReforma, string> = { nenhuma: "Nenhuma", leve: "Leve", media: "Média", pesada: "Pesada" };

// ---------------------------------------------------------------------------
// Padrões fixos
// ---------------------------------------------------------------------------

export const PADRAO = {
  comissaoLeilao: 0.05,
  itbiPct: 0.03,
  registroPct: 0.02,
  registroMin: 3000,
  reservaPct: 0.05,
  desocupacao: 10000,
  reformaNivel: "leve" as NivelReforma,
  corretagemPct: 0.06,
  irPct: 0.15,
  cenarioConservador: 0.9,
  cenarioBase: 1,
  cenarioOtimista: 1.1,
  prazos: [6, 12, 18, 24],
  aplicacaoAA: 0.1,
  entradaPct: 0.2,
  jurosAA: 0.115,
  prazoFinanciamento: 360,
  segurosMensal: 100,
} as const;

export const META_PADRAO: Meta = { tipo: "roi_aa", valor: 0.2 };

/** Faixas aceitas em cada ajuste (também limitam os campos da tela). */
export const LIMITES = {
  area: [1, 50_000_000],
  comissaoPct: [0, 0.2],
  itbiPct: [0, 0.1],
  registroPct: [0, 0.1],
  registroMin: [0, 200_000],
  reservaPct: [0, 0.5],
  desocupacao: [0, 10_000_000],
  dividas: [0, 100_000_000],
  reformaUnitario: [0, 10_000_000],
  condominio: [0, 1_000_000],
  iptuPct: [0, 0.1],
  contas: [0, 1_000_000],
  valorVenda: [1, 10_000_000_000],
  cenarioConservador: [0.1, 3],
  cenarioBase: [0.1, 3],
  cenarioOtimista: [0.1, 3],
  corretagemPct: [0, 0.2],
  irPct: [0, 0.34],
  prazo: [3, 60],
  aplicacaoAA: [0, 1],
  entradaPct: [0.05, 1],
  jurosAA: [0, 0.5],
  prazoFinanciamento: [12, 420],
  segurosMensal: [0, 100_000],
  metaPct: [0, 10],
  metaLucro: [0, 10_000_000_000],
} as const satisfies Record<string, readonly [number, number]>;

export const SLUGS_DIVIDA = ["condominio-em-atraso", "iptu-em-atraso", "divida-passa-arrematante"] as const;

export const ROTULO_DIVIDA: Record<(typeof SLUGS_DIVIDA)[number], string> = {
  "condominio-em-atraso": "condomínio em atraso",
  "iptu-em-atraso": "IPTU em atraso",
  "divida-passa-arrematante": "dívida que passa ao arrematante",
};

// ---------------------------------------------------------------------------
// Resolução
// ---------------------------------------------------------------------------

const positivo = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Área que o imóvel informa para o tipo (null = a fonte não diz). Nos construídos, a "área principal" do
 * catálogo cai na área do terreno quando a fonte não dá a construída; essa não serve para reforma, condomínio
 * nem para a venda pela referência de R$/m² (uma casa de 70 m² num lote de 360 m² viraria reforma e venda de
 * 360 m²), então conta como não informada e o simulador pede a área.
 */
export function areaDaFonte(e: Pick<EntradaSimulador, "tipo" | "area" | "areaTerreno" | "areaPrivativa">): number | null {
  if (e.tipo === "terreno" || e.tipo === "rural") return positivo(e.areaTerreno) ? e.areaTerreno : positivo(e.area) ? e.area : null;
  if (positivo(e.areaPrivativa)) return e.areaPrivativa;
  return positivo(e.area) && e.area !== e.areaTerreno ? e.area : null;
}

/** Referência de R$/m² mais local com mediana de avaliação: bairro, senão cidade, senão UF. */
export function referenciaLocal(refs: readonly ReferenciaM2[] | undefined, tipo: TipoImovel): ReferenciaM2 | null {
  if (!refs?.length) return null;
  const ordem = { bairro: 0, cidade: 1, uf: 2 } as const;
  const uteis = refs
    .filter((r) => r.tipo === tipo && r.amostra > 0 && r.avaliacaoM2 && positivo(r.avaliacaoM2.mediana))
    .sort((a, b) => ordem[a.escopo] - ordem[b.escopo]);
  return uteis[0] ?? null;
}

/** Comissão do leiloeiro: 5% quando há leiloeiro (leilão, judicial ou modalidade desconhecida). */
export function comissaoPadrao(e: Pick<EntradaSimulador, "modalidade" | "judicial">): number {
  if (e.judicial === true) return PADRAO.comissaoLeilao;
  return e.modalidade === "leilao" || e.modalidade === "outro" ? PADRAO.comissaoLeilao : 0;
}

export function condominioPadrao(perfil: PerfilTipo, area: number, emCondominio: boolean): number {
  if (!perfil.condominioPadrao && !(perfil.opcaoCondominio && emCondominio)) return 0;
  return Math.round(Math.max(perfil.condominioMin, perfil.condominioM2 * area));
}

export interface Modelo {
  entrada: EntradaSimulador;
  perfil: PerfilTipo;
  premissas: Premissas;
  /** o padrão de cada premissa, dado o que já foi ajustado antes dela (para "voltar ao padrão") */
  padrao: Premissas;
  ajustes: Ajustes;
  origemVenda: OrigemVenda;
  /** referência de R$/m² mais local (para comparar o valor de venda), se houver */
  referencia: ReferenciaM2 | null;
  /** tags de dívida presentes (rótulos; as ainda sem leitura humana levam "(em revisão)") */
  dividasApontadas: string[];
  /** a fonte aceita financiamento */
  podeFinanciar: boolean;
}

/**
 * Junta o imóvel, as referências e os ajustes da pessoa num modelo pronto para simular.
 * Ajustes inválidos já devem ter sido limpos por `limparAjustes`.
 */
export function montarModelo(entrada: EntradaSimulador, ajustes: Ajustes = {}, referencias?: readonly ReferenciaM2[]): Modelo {
  const perfil = PERFIS[entrada.tipo] ?? PERFIS.outro;
  const a = ajustes;

  const areaFonte = areaDaFonte(entrada);
  const areaPadrao = areaFonte ?? perfil.areaTipica;
  const area = a.area ?? areaPadrao;
  const areaReal = a.area !== undefined || areaFonte !== null;

  const reformaNivel = a.reformaNivel ?? PADRAO.reformaNivel;
  const emCondominio = perfil.opcaoCondominio ? (a.emCondominio ?? false) : false;
  const podeFinanciar = entrada.financiamento === true;

  const referencia = referenciaLocal(referencias, entrada.tipo);
  let origemVenda: OrigemVenda;
  let vendaPadrao: number | null;
  if (positivo(entrada.avaliacao)) {
    vendaPadrao = entrada.avaliacao;
    origemVenda = { tipo: "avaliacao", avaliacao: entrada.avaliacao };
  } else if (referencia && areaReal) {
    const m2 = referencia.avaliacaoM2!.mediana;
    vendaPadrao = Math.round(m2 * area);
    origemVenda = { tipo: "referencia", referencia, m2, area };
  } else {
    vendaPadrao = null;
    origemVenda = { tipo: "nenhuma", motivo: referencia ? "sem-area" : "sem-referencia" };
  }
  if (a.valorVenda !== undefined) origemVenda = { tipo: "ajuste" };

  const desocupado = entrada.ocupacao === "desocupado";

  const padrao: Premissas = {
    area: areaPadrao,
    areaEstimada: areaFonte === null,
    comissaoPct: comissaoPadrao(entrada),
    itbiPct: PADRAO.itbiPct,
    registroPct: PADRAO.registroPct,
    registroMin: PADRAO.registroMin,
    reservaPct: PADRAO.reservaPct,
    desocupacao: desocupado ? 0 : PADRAO.desocupacao,
    dividas: 0,
    reformaNivel: PADRAO.reformaNivel,
    reformaUnitario: perfil.reforma[reformaNivel],
    emCondominio: false,
    condominio: condominioPadrao(perfil, area, emCondominio),
    iptuPct: perfil.iptuPadrao,
    contas: perfil.contasPadrao,
    valorVenda: vendaPadrao,
    cenarioConservador: PADRAO.cenarioConservador,
    cenarioBase: PADRAO.cenarioBase,
    cenarioOtimista: PADRAO.cenarioOtimista,
    corretagemPct: PADRAO.corretagemPct,
    irPct: PADRAO.irPct,
    prazos: [...PADRAO.prazos],
    aplicacaoAA: PADRAO.aplicacaoAA,
    financiar: false,
    entradaPct: PADRAO.entradaPct,
    jurosAA: PADRAO.jurosAA,
    prazoFinanciamento: PADRAO.prazoFinanciamento,
    segurosMensal: PADRAO.segurosMensal,
  };

  const premissas: Premissas = {
    ...padrao,
    ...a,
    area,
    areaEstimada: !areaReal,
    reformaNivel,
    emCondominio,
    financiar: podeFinanciar && (a.financiar ?? false),
    prazos: a.prazos ?? padrao.prazos,
    valorVenda: a.valorVenda ?? vendaPadrao,
  };

  const dividasApontadas = SLUGS_DIVIDA.flatMap((slug) => {
    const tags = entrada.tags.filter((t) => t.slug === slug);
    if (tags.length === 0) return [];
    return [tags.every((t) => t.emRevisao === true) ? `${ROTULO_DIVIDA[slug]} (em revisão)` : ROTULO_DIVIDA[slug]];
  });

  return { entrada, perfil, premissas, padrao, ajustes: a, origemVenda, referencia, dividasApontadas, podeFinanciar };
}

/** Multiplicador do valor de referência em cada cenário. */
export function multiplicador(p: Premissas, cenario: "conservador" | "base" | "otimista"): number {
  return cenario === "conservador" ? p.cenarioConservador : cenario === "otimista" ? p.cenarioOtimista : p.cenarioBase;
}

// ---------------------------------------------------------------------------
// Limpeza do que vem do navegador (localStorage pode ter qualquer coisa)
// ---------------------------------------------------------------------------

const NUMERICOS = [
  "area",
  "comissaoPct",
  "itbiPct",
  "registroPct",
  "registroMin",
  "reservaPct",
  "desocupacao",
  "dividas",
  "reformaUnitario",
  "condominio",
  "iptuPct",
  "contas",
  "valorVenda",
  "cenarioConservador",
  "cenarioBase",
  "cenarioOtimista",
  "corretagemPct",
  "irPct",
  "aplicacaoAA",
  "entradaPct",
  "jurosAA",
  "prazoFinanciamento",
  "segurosMensal",
] as const satisfies readonly (keyof Ajustes & keyof typeof LIMITES)[];

const dentro = (v: unknown, [min, max]: readonly [number, number]): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/** Mantém só ajustes válidos e dentro das faixas; nunca lança. */
export function limparAjustes(bruto: unknown): Ajustes {
  if (!bruto || typeof bruto !== "object") return {};
  const o = bruto as Record<string, unknown>;
  const a: Ajustes = {};
  for (const k of NUMERICOS) {
    if (dentro(o[k], LIMITES[k])) a[k] = o[k];
  }
  if (typeof o.reformaNivel === "string" && (NIVEIS_REFORMA as readonly string[]).includes(o.reformaNivel)) {
    a.reformaNivel = o.reformaNivel as NivelReforma;
  }
  if (typeof o.emCondominio === "boolean") a.emCondominio = o.emCondominio;
  if (typeof o.financiar === "boolean") a.financiar = o.financiar;
  if (Array.isArray(o.prazos) && o.prazos.length === 4 && o.prazos.every((m) => Number.isInteger(m) && dentro(m, LIMITES.prazo))) {
    a.prazos = [...(o.prazos as number[])];
  }
  return a;
}

export function limparMeta(bruto: unknown): Meta {
  if (!bruto || typeof bruto !== "object") return META_PADRAO;
  const o = bruto as Record<string, unknown>;
  if (o.tipo === "lucro" && dentro(o.valor, LIMITES.metaLucro)) return { tipo: "lucro", valor: o.valor };
  if ((o.tipo === "roi_aa" || o.tipo === "roi_periodo") && dentro(o.valor, LIMITES.metaPct)) return { tipo: o.tipo, valor: o.valor };
  return META_PADRAO;
}
