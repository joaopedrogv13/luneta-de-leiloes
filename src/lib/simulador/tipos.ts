/**
 * Tipos do simulador de rentabilidade (página do imóvel).
 *
 * Regras:
 * - Dinheiro em reais (number); percentuais como fração (0,05 = 5%); prazos em meses.
 * - Toda premissa tem um padrão conservador calculado a partir do imóvel (premissas.ts) e pode ser trocada
 *   pela pessoa (`Ajustes`, guardados por imóvel no navegador).
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

export type Cenario = "conservador" | "base" | "otimista";
export const CENARIOS: readonly Cenario[] = ["conservador", "base", "otimista"];

export type NivelReforma = "nenhuma" | "leve" | "media" | "pesada";
export const NIVEIS_REFORMA: readonly NivelReforma[] = ["nenhuma", "leve", "media", "pesada"];

/** Como a reforma é cobrada: por m² de área (construídos) ou valor fixo (terreno, rural). */
export type ModoReforma = "m2" | "fixo";

/** Meta de retorno: % ao ano, % no período (até vender) ou lucro em reais. */
export type TipoMeta = "roi_aa" | "roi_periodo" | "lucro";
export interface Meta {
  tipo: TipoMeta;
  /** fração (0,2 = 20%) para as metas em %, reais para "lucro"; sempre ≥ 0 */
  valor: number;
}

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
  /** R$/m² (modo "m2") ou R$ (modo "fixo") */
  reformaUnitario: number;

  // --- Enquanto não vende (por mês)
  /** casa em condomínio / terreno em loteamento fechado */
  emCondominio: boolean;
  condominio: number;
  /** IPTU (ou ITR, no rural) ao ano, como fração do valor de avaliação (ou do lance, sem avaliação) */
  iptuPct: number;
  /** contas e manutenção (luz, água, limpeza, pequenos reparos) */
  contas: number;

  // --- Venda e impostos
  /** valor de referência para a venda (cenário de 100%); null = falta informar */
  valorVenda: number | null;
  /** % do valor de referência em cada cenário */
  cenarioConservador: number;
  cenarioBase: number;
  cenarioOtimista: number;
  corretagemPct: number;
  /** alíquota de IR sobre o ganho de capital (pessoa física) */
  irPct: number;
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
}

/** O que a pessoa trocou (o resto vem do padrão). */
export type Ajustes = Partial<Omit<Premissas, "areaEstimada">>;

/** De onde veio o valor de referência para a venda (para explicar na tela). */
export type OrigemVenda =
  | { tipo: "avaliacao"; avaliacao: number }
  | { tipo: "referencia"; referencia: ReferenciaM2; m2: number; area: number }
  | { tipo: "ajuste" }
  | { tipo: "nenhuma"; motivo: "sem-area" | "sem-referencia" };

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
  mensal: { condominio: number; iptu: number; contas: number; seguros: number; total: number };
  /** custo mensal × meses */
  custosMensais: number;
  financiamento: ResultadoFinanciamento | null;
  /** lucro líquido (depois do IR) */
  lucro: number;
  /** dinheiro próprio posto no negócio até a venda */
  capital: number;
  /** lucro ÷ capital */
  roi: number;
  /** (1 + ROI)^(12/meses) − 1 */
  roiAA: number;
  /** quanto o mesmo capital renderia na aplicação de comparação, no mesmo prazo */
  rendimentoAplicacao: number;
}

export interface ResultadoFinanciamento {
  entrada: number;
  financiado: number;
  taxaMensal: number;
  prazo: number;
  /** meses de parcela pagos até a venda (no máximo o prazo) */
  parcelasPagas: number;
  primeiraParcela: number;
  totalParcelas: number;
  jurosPagos: number;
  amortizado: number;
  /** saldo devedor quitado com o dinheiro da venda */
  saldoDevedor: number;
}

/** Seleção de uma célula da matriz. */
export interface Celula {
  cenario: Cenario;
  /** índice em `prazos` */
  prazo: number;
}
