/**
 * Tipos do simulador de rentabilidade (página do imóvel e relatório em PDF).
 *
 * Regras:
 * - Dinheiro em reais (number); percentuais como fração (0,05 = 5%); prazos em meses.
 * - Toda premissa tem um padrão conservador calculado a partir do imóvel (premissas.ts) e pode ser trocada
 *   pela pessoa (`Ajustes`, guardados por imóvel no navegador: formato em estado.ts).
 * - Sem imports com "@/" (os testes rodam em Node puro, com jiti).
 */
import type { ImovelDetalhe, ReferenciaM2, TipoImovel } from "../catalogo/tipos";

/**
 * O que o simulador precisa do imóvel (um recorte de ImovelDetalhe; das tags, o slug e, se vier, se ainda
 * está em revisão: tag sem leitura humana nunca aparece como fato).
 */
export type EntradaSimulador = Pick<
  ImovelDetalhe,
  | "id"
  | "tipo"
  | "titulo"
  | "area"
  | "areaTerreno"
  | "areaPrivativa"
  | "avaliacao"
  | "lance"
  | "modalidade"
  | "modalidadeFonte"
  | "fonte"
  | "ocupacao"
  | "uf"
  | "cidade"
  | "financiamento"
  | "parcelamento"
  | "judicial"
  | "condicoesPagamento"
> & { tags: { slug: string; emRevisao?: boolean }[] };

/** Cenários de venda: os três fixos (linhas da matriz) e o personalizado (quando a pessoa define). */
export type CenarioFixo = "conservador" | "base" | "otimista";
export type Cenario = CenarioFixo | "personalizado";
export const CENARIOS: readonly CenarioFixo[] = ["conservador", "base", "otimista"];
export const TODOS_CENARIOS: readonly Cenario[] = ["conservador", "base", "otimista", "personalizado"];

export type NivelReforma = "nenhuma" | "leve" | "media" | "pesada";
export const NIVEIS_REFORMA: readonly NivelReforma[] = ["nenhuma", "leve", "media", "pesada"];

/** Como a reforma é cobrada: por m² de área (construídos) ou valor fixo (terreno, rural, ou se a pessoa quiser). */
export type ModoReforma = "m2" | "fixo";

/** Base do ITBI: o lance (padrão), a avaliação, ou o maior dos dois (regra de muitas prefeituras). */
export type BaseItbi = "lance" | "avaliacao" | "maior";

/** De onde vem o valor de venda de 100%: a avaliação da fonte, a referência de R$/m² da região, ou um valor da pessoa. */
export type BaseVenda = "avaliacao" | "regiao" | "informado";

/**
 * Meta de retorno: lucro em reais, ou rendimento em % no total (até vender), ao ano ou ao mês.
 * "roi_am" e "roi_aa" são equivalentes por juros compostos: (1 + a.m.)^12 = 1 + a.a.
 */
export type TipoMeta = "lucro" | "roi_periodo" | "roi_aa" | "roi_am";
export interface Meta {
  tipo: TipoMeta;
  /** fração (0,2 = 20%) para as metas em %, reais para "lucro"; sempre ≥ 0 */
  valor: number;
}

/** Venda do cenário personalizado: % do valor de referência ou um valor em reais. */
export interface VendaPersonalizada {
  modo: "pct" | "valor";
  /** fração (modo "pct") ou reais (modo "valor") */
  valor: number;
}

/** Custo criado pela pessoa: valor fixo, % do lance ou valor por mês até vender. */
export type ModoCustoExtra = "fixo" | "pct_lance" | "mensal";
export interface CustoExtra {
  /** id curto e estável ([a-z0-9-]), usado em `desligados` como "extra:<id>" */
  id: string;
  nome: string;
  modo: ModoCustoExtra;
  /** reais (fixo e mensal) ou fração do lance (pct_lance) */
  valor: number;
}

/** Linhas da conta que a pessoa pode tirar e religar (os custos criados entram como "extra:<id>"). */
export type LinhaDesligavel =
  | "corretagem"
  | "ir"
  | "comissao"
  | "itbi"
  | "registro"
  | "reserva"
  | "reforma"
  | "condominio"
  | "iptu"
  | "contas"
  | "desocupacao"
  | "dividas"
  | `extra:${string}`;
export const LINHAS_DESLIGAVEIS = ["corretagem", "ir", "comissao", "itbi", "registro", "reserva", "reforma", "condominio", "iptu", "contas", "desocupacao", "dividas"] as const;

/** Todas as premissas já resolvidas (padrão ou ajuste da pessoa). */
export interface Premissas {
  // --- Imóvel
  /** área usada nas contas (m²); quando a fonte não informa, a área típica do tipo (ver `areaEstimada`) */
  area: number;
  /** a área veio da área típica do tipo, não da fonte nem da pessoa */
  areaEstimada: boolean;

  // --- Compra (sobre o lance)
  comissaoPct: number;
  itbiPct: number;
  itbiBase: BaseItbi;
  registroPct: number;
  /** piso de escritura e registro, em reais */
  registroMin: number;
  /** reserva para imprevistos */
  reservaPct: number;

  // --- Regularização e reforma (valores fixos)
  desocupacao: number;
  /** condomínio/IPTU atrasados ou outras dívidas que passam ao comprador */
  dividas: number;
  reformaNivel: NivelReforma;
  reformaModo: ModoReforma;
  /** R$/m² (modo "m2") ou R$ (modo "fixo") */
  reformaUnitario: number;

  // --- Enquanto não vende (por mês)
  /** casa em condomínio / terreno em loteamento fechado */
  emCondominio: boolean;
  condominio: number;
  /** IPTU (ou ITR, no rural) ao ano, como fração do valor de avaliação (ou do lance, sem avaliação) */
  iptuPct: number;
  /** IPTU em reais por ano (do carnê); quando informado, vale no lugar do % */
  iptuAnual: number | null;
  /** contas e manutenção (luz, água, limpeza, pequenos reparos) */
  contas: number;
  /** meses de cada custo mensal; null = até vender (o prazo da célula); nunca passa do prazo da célula */
  mesesCondominio: number | null;
  mesesIptu: number | null;
  mesesContas: number | null;

  // --- Venda e impostos
  /** valor de referência para a venda (cenário de 100%); null = falta informar */
  valorVenda: number | null;
  /** de onde vem o valor de referência (resolvido) */
  baseVenda: BaseVenda;
  /** % do valor de referência em cada cenário */
  cenarioConservador: number;
  cenarioBase: number;
  cenarioOtimista: number;
  /** cenário personalizado (null = a pessoa ainda não definiu) */
  vendaPersonalizada: VendaPersonalizada | null;
  corretagemPct: number;
  /** alíquota de IR sobre o ganho de capital (pessoa física) */
  irPct: number;
  /** a pessoa tem direito a isenção do IR (único imóvel até R$ 440 mil, ou compra de outro residencial em 180 dias) */
  irIsento: boolean;
  /** prazos de venda das colunas da matriz (meses desde a compra, 3 a 60) */
  prazos: number[];
  /** rendimento de uma aplicação para comparar (ao ano) */
  aplicacaoAA: number;

  // --- Pagamento
  /** simular com financiamento (só quando a fonte diz que aceita) */
  financiar: boolean;
  entradaPct: number;
  jurosAA: number;
  prazoFinanciamento: number;
  /** seguros obrigatórios e tarifa do banco, por mês, enquanto o financiamento corre */
  segurosMensal: number;
  /**
   * simular com o parcelamento oferecido pela fonte (leilão judicial: entrada e parcelas mensais corrigidas por
   * um índice, como o IPCA; só quando a fonte diz que aceita). Exclui o financiamento.
   */
  parcelar: boolean;
  /** entrada do parcelamento, fração do lance */
  parcelasEntradaPct: number;
  /** número de parcelas mensais */
  parcelasN: number;
  /** correção das parcelas ao ano (estimativa do índice) */
  parcelasCorrecaoAA: number;

  // --- Linhas da conta
  /** custos criados pela pessoa */
  custosExtras: CustoExtra[];
  /** linhas tiradas da conta (o valor fica guardado para religar) */
  desligados: LinhaDesligavel[];
}

/**
 * O que a pessoa trocou (o resto vem do padrão). `baseVenda` só aceita "avaliacao" ou "regiao": o valor
 * informado é o próprio `valorVenda`. Os campos que aceitam null nas premissas (iptuAnual, meses...) ficam
 * só com número no ajuste: tirar o ajuste é voltar ao padrão.
 */
export type Ajustes = Partial<
  Omit<Premissas, "areaEstimada" | "baseVenda" | "iptuAnual" | "mesesCondominio" | "mesesIptu" | "mesesContas" | "vendaPersonalizada">
> & {
  baseVenda?: "avaliacao" | "regiao";
  iptuAnual?: number;
  mesesCondominio?: number;
  mesesIptu?: number;
  mesesContas?: number;
  vendaPersonalizada?: VendaPersonalizada;
};

/** De onde veio o valor de referência para a venda (para explicar na tela). */
export type OrigemVenda =
  | { tipo: "avaliacao"; avaliacao: number }
  | { tipo: "referencia"; referencia: ReferenciaM2; m2: number; area: number }
  | { tipo: "ajuste" }
  | { tipo: "nenhuma"; motivo: "sem-area" | "sem-referencia" };

/** As bases de venda possíveis para este imóvel (a pessoa escolhe; a que faltar fica null). */
export interface OpcoesVenda {
  avaliacao: number | null;
  regiao: { valor: number; m2: number; area: number; referencia: ReferenciaM2 } | null;
  /** há referência da região, mas falta a área real para multiplicar */
  regiaoSemArea: boolean;
}

/** Contexto do tipo de imóvel: o que mostrar e com que nomes. */
export interface PerfilTipo {
  tipo: TipoImovel;
  modoReforma: ModoReforma;
  /** valores da tabela por nível: R$/m² (m2) ou R$ (fixo) */
  reforma: Record<NivelReforma, number>;
  /** nome da linha de reforma ("Reforma", "Limpeza e cercamento", "Adequações") */
  rotuloReforma: string;
  /** o que cada nível quer dizer, curto */
  descricaoNivel: Record<NivelReforma, string>;
  /** tem condomínio por padrão (apartamento, comercial) */
  condominioPadrao: boolean;
  /** pode ter condomínio por opção (casa em condomínio, loteamento fechado) */
  opcaoCondominio: string | null;
  /** R$/m² de condomínio por mês (0 = não se aplica) */
  condominioM2: number;
  condominioMin: number;
  /** "IPTU" ou "ITR" */
  rotuloImposto: string;
  iptuPadrao: number;
  contasPadrao: number;
  /** área típica (m²), usada só enquanto a área não é informada */
  areaTipica: number;
  /** "área privativa", "área do terreno"... */
  rotuloArea: string;
  /**
   * galpão, prédio inteiro ou área grande (comercial e outros): reforma por m² bem menor, sem condomínio por
   * padrão
   */
  grande?: boolean;
  /** frase extra na ajuda da reforma (por que estes valores) */
  notaReforma?: string;
}

/** Um custo criado pela pessoa, já calculado para a simulação. */
export interface ExtraSimulado {
  id: string;
  nome: string;
  modo: ModoCustoExtra;
  /** valor do parâmetro (R$, fração do lance ou R$/mês) */
  parametro: number;
  /** quanto custa nesta simulação (no prazo todo, para os mensais) */
  valor: number;
}

/** Uma simulação: um lance, um cenário, um prazo. */
export interface Simulacao {
  lance: number;
  meses: number;
  cenario: Cenario;
  venda: number;
  corretagem: number;
  /** base do IR: venda − corretagem − lance − comissão − ITBI − registro − reforma (pode ser negativa) */
  ganhoCapital: number;
  ir: number;
  comissao: number;
  itbi: number;
  registro: number;
  reserva: number;
  /** comissão + ITBI + registro + reserva */
  aquisicao: number;
  desocupacao: number;
  dividas: number;
  reforma: number;
  /** valores por mês; `extras` são os custos mensais criados pela pessoa */
  mensal: { condominio: number; iptu: number; contas: number; seguros: number; extras: number; total: number };
  /** meses em que cada custo mensal corre (o prazo, ou o que a pessoa definiu) */
  mesesCusto: { condominio: number; iptu: number; contas: number };
  /** condomínio, IPTU e contas no período (+ seguros do financiamento) */
  custosMensais: number;
  /** custos criados pela pessoa (todos os modos) */
  extras: ExtraSimulado[];
  extrasTotal: number;
  financiamento: ResultadoFinanciamento | null;
  /** lucro líquido (depois do IR) */
  lucro: number;
  /** lucro médio por ano: lucro × 12 ÷ meses */
  lucroAno: number;
  /** dinheiro próprio posto no negócio até a venda */
  capital: number;
  /** lucro ÷ capital */
  roi: number;
  /** (1 + ROI)^(12/meses) − 1 */
  roiAA: number;
  /** (1 + ROI)^(1/meses) − 1 */
  roiAM: number;
  /** quanto o mesmo capital renderia na aplicação de comparação, no mesmo prazo */
  rendimentoAplicacao: number;
}

export interface ResultadoFinanciamento {
  /** "banco": financiamento SAC com juros; "fonte": parcelamento da própria fonte, corrigido por índice */
  tipo: "banco" | "fonte";
  entrada: number;
  financiado: number;
  taxaMensal: number;
  prazo: number;
  /** meses de parcela pagos até a venda (no máximo o prazo) */
  parcelasPagas: number;
  primeiraParcela: number;
  totalParcelas: number;
  /** juros (banco) ou correção (fonte) pagos até a venda, contando a correção do saldo quitado */
  jurosPagos: number;
  amortizado: number;
  /** saldo devedor quitado com o dinheiro da venda (no parcelamento da fonte, já corrigido) */
  saldoDevedor: number;
}

/** Seleção do cartão e da matriz: um cenário e um prazo de venda (em meses). */
export interface Celula {
  cenario: Cenario;
  meses: number;
}
