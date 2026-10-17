/**
 * Premissas do simulador: padrões CONSERVADORES por tipo de imóvel e a resolução "padrão ou ajuste".
 *
 * Os números são genéricos (não são de nenhuma cidade): servem para a conta não esquecer nenhum custo.
 * Cada premissa tem uma frase de explicação na tela e pode ser trocada pela pessoa. A ordem de resolução
 * importa: área → reforma e condomínio; avaliação/referência e área → valor de venda.
 */
import type { ReferenciaM2, TipoImovel } from "../catalogo/tipos";
import {
  LINHAS_DESLIGAVEIS,
  NIVEIS_REFORMA,
  type Ajustes,
  type Cenario,
  type CustoExtra,
  type EntradaSimulador,
  type LinhaDesligavel,
  type Meta,
  type NivelReforma,
  type OpcoesVenda,
  type OrigemVenda,
  type PerfilTipo,
  type Premissas,
  type VendaPersonalizada,
} from "./tipos";

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
    // só sala e loja em prédio têm condomínio; galpão, prédio inteiro e casa comercial, não
    condominioPadrao: false,
    opcaoCondominio: "Sala ou loja em condomínio",
    condominioM2: 12,
    condominioMin: 0,
    contasPadrao: 200,
    areaTipica: 80,
    rotuloArea: "área",
  }),
  outro: construido("outro", [0, 300, 800, 1600], {
    condominioPadrao: false,
    opcaoCondominio: "Em condomínio",
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

/** A partir desta área (m²), um comercial ou "outro" é tratado como galpão ou prédio inteiro. */
export const AREA_GRANDE = 500;

const RE_GALPAO = /^(galp[aã]o|pr[eé]dio|barrac[aã]o|armaz[eé]m|dep[oó]sito|edif[ií]cio)\b/i;
const RE_SALA_LOJA = /^(sala|loja|conjunto|ed\.)/i;

/**
 * Galpão, prédio inteiro ou área grande: a reforma é por m² de área grande e acabamento simples (pintura e
 * reparos num galpão de 10 mil m² não custam R$ 300/m²), sem condomínio por padrão.
 */
function grande(base: PerfilTipo): PerfilTipo {
  return {
    ...base,
    grande: true,
    reforma: { nenhuma: 0, leve: 60, media: 150, pesada: 300 },
    descricaoNivel: {
      nenhuma: "pronto para usar",
      leve: "limpeza, pintura e pequenos reparos",
      media: "telhado, piso e instalações",
      pesada: "estrutura, cobertura e instalações",
    },
    areaTipica: AREA_GRANDE,
    notaReforma: "Galpão, prédio inteiro ou área grande: valores por m² menores, de área ampla e acabamento simples.",
  };
}

const PERFIS_GRANDES = { comercial: grande(PERFIS.comercial), outro: grande(PERFIS.outro) } as const;

/**
 * O perfil do imóvel: o do tipo, ou, para comercial e "outro", o de galpão/prédio inteiro quando o título diz
 * ("Galpão 973 m²", "Prédio 663 m²") ou a área passa de 500 m².
 */
export function perfilDoImovel(e: Pick<EntradaSimulador, "tipo" | "titulo" | "area" | "areaTerreno" | "areaPrivativa">): PerfilTipo {
  const base = PERFIS[e.tipo] ?? PERFIS.outro;
  if (e.tipo !== "comercial" && e.tipo !== "outro") return base;
  const area = areaDaFonte(e) ?? 0;
  return RE_GALPAO.test(e.titulo.trim()) || area >= AREA_GRANDE ? PERFIS_GRANDES[e.tipo] : base;
}

/** Condomínio ligado já de saída: só sala ou loja comercial (o título começa assim) que não seja grande. */
export function condominioPorPadrao(e: Pick<EntradaSimulador, "titulo">, perfil: PerfilTipo): boolean {
  return perfil.tipo === "comercial" && !perfil.grande && RE_SALA_LOJA.test(e.titulo.trim());
}

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
  // parcelamento do leilão judicial (CPC, art. 895): pelo menos 25% de entrada e até 30 parcelas mensais,
  // corrigidas por um índice (o edital diz qual; o IPCA anda perto de 4,5% ao ano)
  parcelasEntradaPct: 0.25,
  parcelasN: 30,
  parcelasCorrecaoAA: 0.045,
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
  parcelasEntradaPct: [0.05, 1],
  parcelasN: [1, 120],
  parcelasCorrecaoAA: [0, 0.5],
  metaPct: [0, 10],
  metaLucro: [0, 10_000_000_000],
  iptuAnual: [0, 100_000_000],
  mesesCusto: [0, 120],
  vendaPersonalizadaPct: [0.05, 5],
  extraFixo: [0, 10_000_000_000],
  extraPctLance: [0, 1],
  extraMensal: [0, 100_000_000],
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
  const ordem = { rua: 0, bairro: 1, cidade: 2, uf: 3 } as const;
  const uteis = refs
    .filter((r) => r.tipo === tipo && r.amostra > 0 && r.avaliacaoM2 && positivo(r.avaliacaoM2.mediana))
    .sort((a, b) => ordem[a.escopo] - ordem[b.escopo]);
  return uteis[0] ?? null;
}

/**
 * Entrada e número de parcelas escritos nas condições da fonte ("Entrada de 25% e o restante em até 30
 * parcelas (IPCA)"). O que não der para ler fica de fora (vale o padrão).
 */
export function lerCondicoesParcelamento(texto: string | null | undefined): { entradaPct?: number; parcelas?: number } {
  if (!texto) return {};
  const saida: { entradaPct?: number; parcelas?: number } = {};
  const entrada = /(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(texto);
  if (entrada) {
    const v = Number(entrada[1]!.replace(",", ".")) / 100;
    if (v >= LIMITES.parcelasEntradaPct[0] && v <= LIMITES.parcelasEntradaPct[1]) saida.entradaPct = v;
  }
  const parcelas = /(\d{1,3})\s*(?:parcelas|presta[cç][oõ]es|vezes|meses)/i.exec(texto);
  if (parcelas) {
    const n = Number(parcelas[1]);
    if (n >= LIMITES.parcelasN[0] && n <= LIMITES.parcelasN[1]) saida.parcelas = n;
  }
  return saida;
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
  /** as bases de venda possíveis (avaliação e referência da região), para a pessoa escolher */
  opcoesVenda: OpcoesVenda;
  /** referência de R$/m² mais local (para comparar o valor de venda), se houver */
  referencia: ReferenciaM2 | null;
  /** tags de dívida presentes (rótulos; as ainda sem leitura humana levam "(em revisão)") */
  dividasApontadas: string[];
  /** a fonte (ou uma tag já revisada) diz que o imóvel está ocupado: só então entra a reserva de desocupação */
  ocupado: boolean;
  /** a fonte aceita financiamento */
  podeFinanciar: boolean;
  /** a fonte oferece parcelamento (leilão judicial) */
  podeParcelar: boolean;
}

/**
 * Ocupado com certeza: a fonte diz "ocupado", ou uma tag "ocupado" já lida por uma pessoa (não em revisão) e a
 * fonte não diz o contrário. Só nesse caso o simulador reserva dinheiro para a desocupação; desocupado ou não
 * informado fica sem reserva (a pessoa pode acrescentar a desocupação como custo).
 */
export function ocupadoComCerteza(e: Pick<EntradaSimulador, "ocupacao" | "tags">): boolean {
  if (e.ocupacao === "ocupado") return true;
  if (e.ocupacao === "desocupado") return false;
  return e.tags.some((t) => t.slug === "ocupado" && t.emRevisao !== true);
}

/**
 * Junta o imóvel, as referências e os ajustes da pessoa num modelo pronto para simular.
 * Ajustes inválidos já devem ter sido limpos por `limparAjustes`.
 */
export function montarModelo(entrada: EntradaSimulador, ajustes: Ajustes = {}, referencias?: readonly ReferenciaM2[]): Modelo {
  const perfil = perfilDoImovel(entrada);
  const a = ajustes;

  const areaFonte = areaDaFonte(entrada);
  const areaPadrao = areaFonte ?? perfil.areaTipica;
  const area = a.area ?? areaPadrao;
  const areaReal = a.area !== undefined || areaFonte !== null;

  const reformaNivel = a.reformaNivel ?? PADRAO.reformaNivel;
  const reformaModo = a.reformaModo ?? perfil.modoReforma;
  const condominioDeSaida = condominioPorPadrao(entrada, perfil);
  const emCondominio = perfil.opcaoCondominio ? (a.emCondominio ?? condominioDeSaida) : false;
  const podeFinanciar = entrada.financiamento === true;
  const podeParcelar = entrada.parcelamento === true;
  const parcelar = podeParcelar && (a.parcelar ?? false);
  const condicoes = lerCondicoesParcelamento(entrada.condicoesPagamento);
  const ocupado = ocupadoComCerteza(entrada);

  // --- valor de venda (100%): avaliação ou referência da região; a pessoa escolhe a base ou informa o valor
  const referencia = referenciaLocal(referencias, entrada.tipo);
  const vendaAvaliacao = positivo(entrada.avaliacao) ? entrada.avaliacao : null;
  const m2Regiao = referencia?.avaliacaoM2?.mediana ?? null;
  const opcoesVenda: OpcoesVenda = {
    avaliacao: vendaAvaliacao,
    regiao: referencia && m2Regiao !== null && areaReal ? { valor: Math.round(m2Regiao * area), m2: m2Regiao, area, referencia } : null,
    regiaoSemArea: !!referencia && !areaReal,
  };
  const vendaPadrao = vendaAvaliacao ?? opcoesVenda.regiao?.valor ?? null;
  let origemVenda: OrigemVenda;
  let valorVenda: number | null;
  let baseVenda: Premissas["baseVenda"];
  const querRegiao = a.baseVenda === "regiao" || (a.baseVenda === undefined && vendaAvaliacao === null);
  if (a.valorVenda !== undefined) {
    valorVenda = a.valorVenda;
    origemVenda = { tipo: "ajuste" };
    baseVenda = "informado";
  } else if (querRegiao && opcoesVenda.regiao) {
    valorVenda = opcoesVenda.regiao.valor;
    origemVenda = { tipo: "referencia", referencia: opcoesVenda.regiao.referencia, m2: opcoesVenda.regiao.m2, area };
    baseVenda = "regiao";
  } else if (vendaAvaliacao !== null) {
    valorVenda = vendaAvaliacao;
    origemVenda = { tipo: "avaliacao", avaliacao: vendaAvaliacao };
    baseVenda = "avaliacao";
  } else {
    valorVenda = null;
    origemVenda = { tipo: "nenhuma", motivo: referencia ? "sem-area" : "sem-referencia" };
    baseVenda = "regiao";
  }

  const padrao: Premissas = {
    area: areaPadrao,
    areaEstimada: areaFonte === null,
    comissaoPct: comissaoPadrao(entrada),
    itbiPct: PADRAO.itbiPct,
    itbiBase: "lance",
    registroPct: PADRAO.registroPct,
    registroMin: PADRAO.registroMin,
    reservaPct: PADRAO.reservaPct,
    desocupacao: ocupado ? PADRAO.desocupacao : 0,
    dividas: 0,
    reformaNivel: PADRAO.reformaNivel,
    reformaModo: perfil.modoReforma,
    reformaUnitario: reformaPadrao(perfil, reformaNivel, reformaModo, area),
    emCondominio: condominioDeSaida,
    condominio: condominioPadrao(perfil, area, emCondominio),
    iptuPct: perfil.iptuPadrao,
    iptuAnual: null,
    contas: perfil.contasPadrao,
    mesesCondominio: null,
    mesesIptu: null,
    mesesContas: null,
    valorVenda: vendaPadrao,
    baseVenda: vendaAvaliacao !== null ? "avaliacao" : "regiao",
    cenarioConservador: PADRAO.cenarioConservador,
    cenarioBase: PADRAO.cenarioBase,
    cenarioOtimista: PADRAO.cenarioOtimista,
    vendaPersonalizada: null,
    corretagemPct: PADRAO.corretagemPct,
    irPct: PADRAO.irPct,
    irIsento: false,
    prazos: [...PADRAO.prazos],
    aplicacaoAA: PADRAO.aplicacaoAA,
    financiar: false,
    entradaPct: PADRAO.entradaPct,
    jurosAA: PADRAO.jurosAA,
    prazoFinanciamento: PADRAO.prazoFinanciamento,
    segurosMensal: PADRAO.segurosMensal,
    parcelar: false,
    parcelasEntradaPct: condicoes.entradaPct ?? PADRAO.parcelasEntradaPct,
    parcelasN: condicoes.parcelas ?? PADRAO.parcelasN,
    parcelasCorrecaoAA: PADRAO.parcelasCorrecaoAA,
    custosExtras: [],
    desligados: [],
  };

  const premissas: Premissas = {
    ...padrao,
    ...a,
    area,
    areaEstimada: !areaReal,
    reformaNivel,
    reformaModo,
    emCondominio,
    // as duas formas de pagar a prazo não se somam: o parcelamento da fonte vale sobre o financiamento
    financiar: podeFinanciar && !parcelar && (a.financiar ?? false),
    parcelar,
    prazos: a.prazos ?? padrao.prazos,
    valorVenda,
    baseVenda,
    iptuAnual: a.iptuAnual ?? null,
    mesesCondominio: a.mesesCondominio ?? null,
    mesesIptu: a.mesesIptu ?? null,
    mesesContas: a.mesesContas ?? null,
    vendaPersonalizada: a.vendaPersonalizada ?? null,
    custosExtras: a.custosExtras ?? [],
    desligados: a.desligados ?? [],
  };

  const dividasApontadas = SLUGS_DIVIDA.flatMap((slug) => {
    const tags = entrada.tags.filter((t) => t.slug === slug);
    if (tags.length === 0) return [];
    return [tags.every((t) => t.emRevisao === true) ? `${ROTULO_DIVIDA[slug]} (em revisão)` : ROTULO_DIVIDA[slug]];
  });

  return { entrada, perfil, premissas, padrao, ajustes: a, origemVenda, opcoesVenda, referencia, dividasApontadas, ocupado, podeFinanciar, podeParcelar };
}

/**
 * Valor padrão da reforma para o nível: R$/m² da tabela (modo m²) ou valor total (modo fixo). Num construído
 * em que a pessoa escolheu "valor total", o padrão é a tabela × área (o mesmo custo, escrito em reais).
 */
export function reformaPadrao(perfil: PerfilTipo, nivel: NivelReforma, modo: "m2" | "fixo", area: number): number {
  const tabela = perfil.reforma[nivel];
  if (modo === perfil.modoReforma) return tabela;
  return modo === "fixo" ? Math.round(tabela * area) : area > 0 ? Math.round(tabela / area) : 0;
}

/** Multiplicador do valor de referência em cada cenário (o personalizado, em reais, vira fração da referência). */
export function multiplicador(p: Pick<Premissas, "cenarioConservador" | "cenarioBase" | "cenarioOtimista" | "vendaPersonalizada" | "valorVenda">, cenario: Cenario): number {
  switch (cenario) {
    case "conservador":
      return p.cenarioConservador;
    case "otimista":
      return p.cenarioOtimista;
    case "personalizado": {
      const v = p.vendaPersonalizada;
      if (!v) return p.cenarioBase;
      return v.modo === "pct" ? v.valor : p.valorVenda && p.valorVenda > 0 ? v.valor / p.valorVenda : p.cenarioBase;
    }
    default:
      return p.cenarioBase;
  }
}

/** Cenários que viram linhas da matriz: os três fixos e, se a pessoa definiu, o personalizado. */
export function cenariosDaMatriz(p: Pick<Premissas, "vendaPersonalizada">): Cenario[] {
  return p.vendaPersonalizada ? ["conservador", "base", "otimista", "personalizado"] : ["conservador", "base", "otimista"];
}

/**
 * Colunas da matriz: os prazos da pessoa e, se o prazo escolhido não estiver entre eles, ele também. Sempre em
 * ordem crescente e sem repetir (a pessoa pode digitar "6, 6, 18, 24" ou "30, 12, 18, 24" nos prazos).
 */
export function colunasDaMatriz(prazos: readonly number[], escolhido: number): number[] {
  return [...new Set([...prazos, escolhido])].sort((x, y) => x - y);
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
  "iptuAnual",
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
  "parcelasEntradaPct",
  "parcelasN",
  "parcelasCorrecaoAA",
] as const satisfies readonly (keyof Ajustes & keyof typeof LIMITES)[];

const MESES_CUSTO = ["mesesCondominio", "mesesIptu", "mesesContas"] as const;

const dentro = (v: unknown, [min, max]: readonly [number, number]): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

export const RE_ID_EXTRA = /^[a-z0-9-]{1,40}$/;
const MAX_EXTRAS = 30;

function limparExtra(bruto: unknown): CustoExtra | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  if (typeof o.id !== "string" || !RE_ID_EXTRA.test(o.id)) return null;
  if (typeof o.nome !== "string") return null;
  const nome = o.nome.trim().slice(0, 60);
  if (!nome) return null;
  const lim = o.modo === "fixo" ? LIMITES.extraFixo : o.modo === "pct_lance" ? LIMITES.extraPctLance : o.modo === "mensal" ? LIMITES.extraMensal : null;
  if (!lim || !dentro(o.valor, lim)) return null;
  return { id: o.id, nome, modo: o.modo as CustoExtra["modo"], valor: o.valor };
}

function limparVendaPersonalizada(bruto: unknown): VendaPersonalizada | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  if (o.modo === "pct" && dentro(o.valor, LIMITES.vendaPersonalizadaPct)) return { modo: "pct", valor: o.valor };
  if (o.modo === "valor" && dentro(o.valor, LIMITES.valorVenda)) return { modo: "valor", valor: o.valor };
  return null;
}

/** Mantém só ajustes válidos e dentro das faixas; nunca lança. */
export function limparAjustes(bruto: unknown): Ajustes {
  if (!bruto || typeof bruto !== "object") return {};
  const o = bruto as Record<string, unknown>;
  const a: Ajustes = {};
  for (const k of NUMERICOS) {
    if (dentro(o[k], LIMITES[k])) a[k] = o[k];
  }
  for (const k of MESES_CUSTO) {
    if (Number.isInteger(o[k]) && dentro(o[k], LIMITES.mesesCusto)) a[k] = o[k] as number;
  }
  if (typeof o.reformaNivel === "string" && (NIVEIS_REFORMA as readonly string[]).includes(o.reformaNivel)) {
    a.reformaNivel = o.reformaNivel as NivelReforma;
  }
  if (o.reformaModo === "m2" || o.reformaModo === "fixo") a.reformaModo = o.reformaModo;
  if (o.itbiBase === "lance" || o.itbiBase === "avaliacao" || o.itbiBase === "maior") a.itbiBase = o.itbiBase;
  if (o.baseVenda === "avaliacao" || o.baseVenda === "regiao") a.baseVenda = o.baseVenda;
  if (typeof o.emCondominio === "boolean") a.emCondominio = o.emCondominio;
  if (typeof o.financiar === "boolean") a.financiar = o.financiar;
  if (typeof o.parcelar === "boolean") a.parcelar = o.parcelar;
  if (typeof o.irIsento === "boolean") a.irIsento = o.irIsento;
  if (Array.isArray(o.prazos) && o.prazos.length === 4 && o.prazos.every((m) => Number.isInteger(m) && dentro(m, LIMITES.prazo))) {
    a.prazos = [...(o.prazos as number[])];
  }
  const vp = limparVendaPersonalizada(o.vendaPersonalizada);
  if (vp) a.vendaPersonalizada = vp;
  if (Array.isArray(o.custosExtras)) {
    const vistos = new Set<string>();
    const extras = o.custosExtras
      .map(limparExtra)
      .filter((x): x is CustoExtra => x !== null && !vistos.has(x.id) && !!vistos.add(x.id))
      .slice(0, MAX_EXTRAS);
    if (extras.length) a.custosExtras = extras;
  }
  if (Array.isArray(o.desligados)) {
    const validos = o.desligados.filter(
      (d): d is LinhaDesligavel =>
        typeof d === "string" && ((LINHAS_DESLIGAVEIS as readonly string[]).includes(d) || (d.startsWith("extra:") && RE_ID_EXTRA.test(d.slice(6)))),
    );
    const unicos = [...new Set(validos)].slice(0, 50);
    if (unicos.length) a.desligados = unicos;
  }
  return a;
}

export function limparMeta(bruto: unknown): Meta {
  if (!bruto || typeof bruto !== "object") return META_PADRAO;
  const o = bruto as Record<string, unknown>;
  if (o.tipo === "lucro" && dentro(o.valor, LIMITES.metaLucro)) return { tipo: "lucro", valor: o.valor };
  if ((o.tipo === "roi_aa" || o.tipo === "roi_periodo" || o.tipo === "roi_am") && dentro(o.valor, LIMITES.metaPct)) return { tipo: o.tipo, valor: o.valor };
  return META_PADRAO;
}
