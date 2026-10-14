/**
 * Contrato do catálogo de imóveis: o que o servidor manda para a lista, os cartões, o mapa, os filtros,
 * a página do imóvel e o simulador. Vale para os dois conjuntos de dados:
 * - "previa": o instantâneo do banco em base/saida/site (todos os imóveis ativos; gerado por
 *   `npm run base:exportar -- --site`);
 * - "exemplos": os exemplos fictícios de src/content/examples.ts (a /assinante, demonstração pública).
 *
 * Regras que atravessam tudo:
 * - Dinheiro em reais (number), áreas em m², datas em ISO (UTC). Formatação só na hora de mostrar.
 * - `null` = a fonte não informa. Nunca adivinhar; a tela diz "não informado pela fonte".
 * - No plano Lente o servidor não manda tags nem selo (nem o filtro/ordem por eles funciona): o conteúdo
 *   bloqueado nunca chega ao navegador.
 * - Sem imports com "@/" aqui e nos demais módulos de src/lib/catalogo: os testes rodam em Node puro.
 */

export type Conjunto = "previa" | "exemplos";
export type Plano = "lente" | "luneta";

export type TipoImovel = "apartamento" | "casa" | "terreno" | "comercial" | "rural" | "outro";
export type Modalidade = "leilao" | "venda_direta" | "venda_online" | "licitacao_aberta" | "outro";
/** Praça atual: 1ª, 2ª, praça única; `null` = a fonte não diz. */
export type Praca = "1" | "2" | "unica";
export type Ocupacao = "ocupado" | "desocupado";
export type Severidade = "grave" | "atencao" | "positivo" | "info";
export type Confianca = "alta" | "media" | "baixa";
/** Precisão da posição no mapa. Hoje a Caixa só tem "cidade" (sede do município, IBGE). */
export type PrecisaoGeo = "exata" | "rua" | "cep" | "bairro" | "cidade";
/** 0 = sem selo, 1 Promissor, 2 Na Mira, 3 Alvo. */
export type Selo = 0 | 1 | 2 | 3;

/** Tag de risco resumida (lista, cartões, filtros). Só as tags que valem "sim". */
export interface TagResumo {
  /** slug estável de base/riscos/tags.ts (ex.: "ocupado", "desagio-alto") */
  slug: string;
  rotulo: string;
  severidade: Severidade;
  /** calculada automaticamente e ainda sem leitura humana: nunca mostrar como fato */
  emRevisao: boolean;
}

/** Tag com a evidência (página do imóvel e pop-up da tag). */
export interface TagDetalhe extends TagResumo {
  confianca: Confianca;
  /** de onde veio: "campo:modalidade_fonte", "descricao", "ficha", "edital", "ausencia"... */
  origem: string;
  /** trecho do anúncio/edital que levou à tag, já mascarado (LGPD); null se não houver */
  evidencia: string | null;
}

export interface FonteImovel {
  /** id da fonte na base: "caixa_csv", "leiloesjudiciais_api", "exemplo"... */
  id: string;
  /** nome para mostrar: "Caixa", "Leilões Judiciais", "Exemplo fictício" */
  nome: string;
}

/** Imóvel na lista: tudo o que lista, cartões, mapa, filtros e ordenação usam. */
export interface ImovelResumo {
  /** id do site: "caixa-1444419018304", "lj-222141", "ex-1"... (estável; vai na URL do imóvel) */
  id: string;
  titulo: string;
  tipo: TipoImovel;
  uf: string;
  cidade: string;
  bairro: string | null;
  lat: number | null;
  lon: number | null;
  precisaoGeo: PrecisaoGeo | null;
  /**
   * área principal (m²): privativa, senão total, senão do terreno. Terreno e rural: a do terreno primeiro.
   * Casa/apartamento com privativa abaixo de 15 m² (erro de digitação da fonte) usa a total.
   */
  area: number | null;
  areaTerreno: number | null;
  quartos: number | null;
  vagas: number | null;
  /** valor de avaliação; null se a fonte não der */
  avaliacao: number | null;
  /** lance mínimo / preço vigente */
  lance: number;
  /** deságio em % inteiro: 100 × (1 − lance/avaliação); negativo se o lance passa da avaliação; null sem avaliação */
  desagio: number | null;
  /** lance ÷ área (R$/m²), inteiro (com centavos abaixo de R$ 10/m², em glebas); null sem área */
  lanceM2: number | null;
  /** avaliação ÷ área (R$/m²), inteiro (com centavos abaixo de R$ 10/m²); null sem avaliação ou área */
  avaliacaoM2: number | null;
  modalidade: Modalidade;
  /** como a fonte chama a modalidade ("Leilão SFI - Edital Único", "Venda Online"...) */
  modalidadeFonte: string | null;
  praca: Praca | null;
  /** data e hora da praça atual (ISO) */
  dataPraca: string | null;
  financiamento: boolean | null;
  fgts: boolean | null;
  parcelamento: boolean | null;
  ocupacao: Ocupacao | null;
  judicial: boolean | null;
  fonte: FonteImovel;
  /** URL da foto principal na fonte (sem download); null sem foto */
  foto: string | null;
  /** quantas fotos a fonte publica (para o selo "+N fotos"); 0 sem foto */
  totalFotos: number;
  /** selo (só no plano Luneta; no Lente vem 0) */
  selo: Selo;
  /** selo ainda não avaliado (critérios pendentes): mostrar "Selo em análise" */
  seloPendente: boolean;
  /** tags "sim" (só no plano Luneta; no Lente vem []) */
  tags: TagResumo[];
  /** quando foi coletado (AAAA-MM-DD) */
  coletadoEm: string;
}

export type TipoLink = "anuncio" | "edital" | "matricula" | "laudo" | "avaliacao" | "leiloeiro" | "processo" | "mapa" | "outro";

export interface LinkImovel {
  tipo: TipoLink;
  rotulo: string;
  url: string;
  /** frase curta sob o rótulo ("Página do imóvel no site da Caixa") */
  descricao?: string;
}

export interface PracaDetalhe {
  /** 0 = praça única/venda; 1, 2, 3 */
  numero: 0 | 1 | 2 | 3;
  data: string | null;
  valorMinimo: number | null;
}

/** Imóvel completo: a página do imóvel. */
export interface ImovelDetalhe extends Omit<ImovelResumo, "tags"> {
  tags: TagDetalhe[];
  endereco: string | null;
  areaTotal: number | null;
  areaPrivativa: number | null;
  descricao: string | null;
  fotos: string[];
  pracas: PracaDetalhe[];
  matricula: string | null;
  cartorio: string | null;
  numeroProcesso: string | null;
  leiloeiro: string | null;
  comitente: string | null;
  /** anúncio na fonte, edital, matrícula, site do leiloeiro, endereço no mapa... (sempre com https) */
  links: LinkImovel[];
  /** parcelamento oferecido pela fonte (ex.: 25% de entrada + 30 parcelas) */
  condicoesPagamento: string | null;
  /** data de geração na fonte (ISO ou AAAA-MM-DD) */
  geradoNaFonteEm: string | null;
  /** por que tem (ou não) selo */
  porQueSelo: string;
}

// ---------------------------------------------------------------------------
// Filtros, ordem e busca
// ---------------------------------------------------------------------------

/** Chave de cidade: "MG|Uberlândia". Chave de bairro: "MG|Uberlândia|Centro". */
export type ChaveCidade = string;
export type ChaveBairro = string;

/** Opção "não informado" das listas que aceitam ausência. */
export const NAO_INFORMADO = "nd" as const;

/**
 * Filtros da busca. Tudo opcional; ausente = não filtra. Listas = "qualquer um destes" (OU dentro do
 * filtro, E entre filtros). Faixas são inclusivas.
 */
export interface Filtros {
  /** texto livre: título, bairro, cidade, UF ou nome do estado, endereço, id */
  q?: string;
  uf?: string[];
  cidade?: ChaveCidade[];
  bairro?: ChaveBairro[];
  tipo?: TipoImovel[];
  lanceMin?: number;
  lanceMax?: number;
  avaliacaoMin?: number;
  avaliacaoMax?: number;
  /** deságio em % (pode ser negativo) */
  desagioMin?: number;
  desagioMax?: number;
  lanceM2Min?: number;
  lanceM2Max?: number;
  areaMin?: number;
  areaMax?: number;
  /** "pelo menos N" */
  quartosMin?: number;
  vagasMin?: number;
  modalidade?: Modalidade[];
  praca?: (Praca | typeof NAO_INFORMADO)[];
  /** data da praça (AAAA-MM-DD, inclusivo, horário de Brasília) */
  dataDe?: string;
  dataAte?: string;
  financiamento?: boolean;
  fgts?: boolean;
  parcelamento?: boolean;
  ocupacao?: (Ocupacao | typeof NAO_INFORMADO)[];
  /** "judicial" | "extrajudicial" | "nd" */
  natureza?: ("judicial" | "extrajudicial" | typeof NAO_INFORMADO)[];
  fonte?: string[];
  comFoto?: boolean;
  /** Luneta: exige todas estas tags (confirmadas, não "em revisão") */
  comTags?: string[];
  /** Luneta: esconde imóveis com qualquer uma destas tags (confirmadas ou em revisão) */
  semTags?: string[];
  /** Luneta: selos aceitos */
  selo?: Exclude<Selo, 0>[];
}

export type Ordem =
  | "desagio" // maior deságio (padrão)
  | "lance-asc" // menor lance
  | "lance-desc" // maior lance
  | "m2-asc" // menor R$/m²
  | "area-desc" // maior área
  | "data" // praça mais próxima (sem data por último)
  | "alertas" // Luneta: menos alertas graves e de atenção primeiro
  | "selo" // Luneta: maior selo primeiro (desligado enquanto os selos estão pendentes)
  | "recentes"; // coletados por último

export const ORDEM_PADRAO: Ordem = "desagio";

/** Uma opção de filtro com quantos imóveis ela daria (com os outros filtros aplicados). */
export interface OpcaoFaceta {
  valor: string;
  rotulo: string;
  total: number;
}

/** Histograma de uma faixa numérica (para o controle de faixa com barrinhas). */
export interface Histograma {
  min: number;
  max: number;
  /** limites das barras (n+1 valores, crescentes) */
  limites: number[];
  /** quantos imóveis em cada barra (n valores) */
  totais: number[];
}

export interface Facetas {
  uf: OpcaoFaceta[];
  /** cidades das UFs escolhidas (ou todas), com a chave "UF|Cidade" */
  cidade: OpcaoFaceta[];
  /** bairros das cidades escolhidas; vazio enquanto nenhuma cidade estiver escolhida */
  bairro: OpcaoFaceta[];
  tipo: OpcaoFaceta[];
  modalidade: OpcaoFaceta[];
  praca: OpcaoFaceta[];
  ocupacao: OpcaoFaceta[];
  natureza: OpcaoFaceta[];
  fonte: OpcaoFaceta[];
  /**
   * Luneta: tags com contagem (vazio no Lente). Vem toda tag presente nos resultados, confirmada ou em
   * revisão. `total` = com a tag CONFIRMADA (o que "exigir" daria; pode ser 0 quando só há em revisão);
   * `comRevisao` = confirmada ou em revisão (o que "esconder" tira). Use `comRevisao` na lista de esconder.
   */
  tags: (OpcaoFaceta & { severidade: Severidade; comRevisao?: number })[];
  /** Luneta: selos (vazio no Lente ou com selos pendentes) */
  selo: OpcaoFaceta[];
  lance: Histograma | null;
  avaliacao: Histograma | null;
  desagio: Histograma | null;
  lanceM2: Histograma | null;
  area: Histograma | null;
  /** contagens para os filtros sim/não */
  financiamento: number;
  fgts: number;
  parcelamento: number;
  comFoto: number;
}

/** Um ponto do mapa: os imóveis filtrados de uma cidade, agregados (a posição é a da cidade). */
export interface PontoMapa {
  chave: ChaveCidade;
  cidade: string;
  uf: string;
  lat: number;
  lon: number;
  total: number;
  lanceMin: number;
  /** maior deságio da cidade (null se nenhum tem avaliação) */
  desagioMax: number | null;
  /** até 3 imóveis para o cartão do mapa (os de maior deságio) */
  destaques: Pick<ImovelResumo, "id" | "titulo" | "tipo" | "foto" | "lance" | "desagio" | "bairro">[];
}

export interface Busca {
  conjunto: Conjunto;
  plano: Plano;
  filtros: Filtros;
  ordem: Ordem;
  /** 1, 2, 3... */
  pagina: number;
  /** padrão 24, máximo 96 */
  porPagina?: number;
}

export interface ResultadoBusca {
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
  itens: ImovelResumo[];
  facetas: Facetas;
  /** todas as cidades com resultado (não só a página): o mapa mostra o conjunto inteiro */
  mapa: PontoMapa[];
  /** imóveis ativos no conjunto inteiro, sem filtro */
  totalConjunto: number;
  /** os selos estão desligados neste conjunto (critérios pendentes) */
  selosDesligados: boolean;
  /** quando o conjunto foi gerado e de que fontes, para o rodapé */
  sobre: SobreConjunto;
}

export interface SobreConjunto {
  geradoEm: string;
  fontes: { id: string; nome: string; geradoNaFonteEm: string | null; total: number }[];
}

// ---------------------------------------------------------------------------
// Preço do m² na região e imóveis parecidos (página do imóvel)
// ---------------------------------------------------------------------------

export interface FaixaM2 {
  mediana: number;
  p25: number;
  p75: number;
}

/**
 * Referência de R$/m² entre imóveis do mesmo tipo em leilão/venda na base (não é preço de mercado:
 * é a avaliação e o lance de outros imóveis da base). Usa o menor recorte com amostra suficiente:
 * bairro (n ≥ 5), senão cidade (n ≥ 5), senão UF.
 */
export interface ReferenciaM2 {
  escopo: "bairro" | "cidade" | "uf";
  /** "Centro, Uberlândia/MG", "Uberlândia/MG", "MG" */
  nome: string;
  tipo: TipoImovel;
  amostra: number;
  avaliacaoM2: FaixaM2 | null;
  lanceM2: FaixaM2 | null;
  /** este imóvel */
  imovel: { avaliacaoM2: number | null; lanceM2: number | null };
  /** % de imóveis do recorte com R$/m² de lance maior que o deste (quanto maior, mais barato este é) */
  percentilLance: number | null;
}

export interface Vizinhanca {
  referencias: ReferenciaM2[];
  /** até 6 imóveis parecidos (mesmo tipo, mesma cidade, área parecida), do mais parecido ao menos */
  parecidos: ImovelResumo[];
  /** buscas prontas em portais de anúncios (sem API: só links para o usuário abrir) */
  buscasExternas: LinkImovel[];
}

export interface PaginaImovel {
  imovel: ImovelDetalhe;
  vizinhanca: Vizinhanca;
  selosDesligados: boolean;
  sobre: SobreConjunto;
}
