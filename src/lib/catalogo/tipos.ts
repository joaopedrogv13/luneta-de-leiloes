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
 * - No plano Lente o servidor não manda tags, selo, nota de localização, preço da região nem buscas nos portais, e os
 *   filtros avançados e as ordens da Luneta não valem (regra única em src/lib/catalogo/planos.ts): o conteúdo
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
/**
 * Precisão da posição no mapa. Vem do geocode (base/fontes/localizacao): número → "exata", rua → "rua", bairro →
 * "bairro", o resto → "cidade" (sede do município, IBGE). A Leilões Judiciais traz o ponto da própria fonte.
 */
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
  /**
   * Nota de localização (0 a 100; ver LocalizacaoImovel): a calculada, ou o meio da faixa na aproximada. null sem
   * nota (endereço só na cidade, rural, cidade pequena) e sempre no plano Lente.
   */
  notaLocal: number | null;
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
  /**
   * Dados de registro da página do imóvel na fonte (na Caixa, a "ficha"): matrícula(s), comarca, ofício,
   * inscrição imobiliária, averbação dos leilões negativos. `situacao`:
   * - "lido": a Luneta leu a página e os campos vazios estão vazios lá também;
   * - "pendente": a fonte publica esses dados numa página que a Luneta ainda não leu (mostre o link
   *   `paginaFonte`, nunca "não informado pela fonte");
   * - "na_fonte": vieram do próprio anúncio/API (ex.: Leilões Judiciais);
   * - "nao_publica": a fonte não publica esses dados.
   */
  registro: RegistroImovel;
}

export interface RegistroImovel {
  situacao: "lido" | "pendente" | "na_fonte" | "nao_publica";
  matriculas: string[];
  /** "2º Ofício de Registro de Imóveis de São Gonçalo/RJ" */
  cartorio: string | null;
  comarca: string | null;
  oficio: string | null;
  inscricaoImobiliaria: string | null;
  /** "Averbado", "Não averbado"... como a fonte escreve */
  averbacaoLeiloesNegativos: string | null;
  /** página do imóvel na fonte, onde os dados estão (para "pendente") */
  paginaFonte: string | null;
  /** quando a ficha foi lida (AAAA-MM-DD), se "lido" */
  lidoEm: string | null;
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
  /** Luneta: nota de localização mínima (0 a 100); imóvel sem nota não passa */
  notaLocalMin?: number;
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
  | "localizacao" // Luneta: maior nota de localização primeiro, sem nota por último
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
  /** resultados com data da praça (a ordem "Praça mais próxima" só ajuda se houver) */
  comData?: number;
  /** todos os resultados coletados no mesmo dia (a ordem "Mais recentes" não muda nada) */
  coletaUnica?: boolean;
  /**
   * Luneta: quantos imóveis têm nota de localização a partir de cada valor, com os OUTROS filtros aplicados:
   * `notaLocal[t]` = nota ≥ t (t de 0 a 100; `notaLocal[0]` = com nota). Vazio no Lente e sem facetas.
   */
  notaLocal?: number[];
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
/**
 * O que o valor do ITBI de uma cidade é (base/fontes/itbi/README.md): o preço declarado na compra (São Paulo, Rio), a
 * base de cálculo da prefeitura (Porto Alegre, Fortaleza) ou a avaliação da prefeitura para o imposto (Recife). Muda o
 * nome do número na tela ("preço médio declarado", "base de cálculo média"...); revisão final da rodada 4, R4-VAZ-04.
 */
export type ValorItbi = "declarado" | "base_calculo" | "avaliacao_prefeitura";

export interface ReferenciaM2 {
  /** recorte, do mais perto ao mais longe */
  escopo: "rua" | "bairro" | "cidade" | "uf";
  /**
   * De onde vêm os números: "leiloes" = avaliação e lance de outros imóveis em leilão na base; "itbi" =
   * transações reais registradas na prefeitura (ITBI pago), últimos 12 meses.
   */
  fonte?: "leiloes" | "itbi";
  /** ITBI: período coberto [de, até] (AAAA-MM-DD) */
  periodo?: [string, string] | null;
  /** ITBI: o que o valor da cidade é (ausente: "valor registrado", sem dizer qual) */
  valorItbi?: ValorItbi;
  /** média do recorte (sem os 10% mais baixos e os 10% mais altos), R$/m²: avaliação (leilões) ou preço pago (ITBI) */
  media?: number | null;
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
  /**
   * buscas prontas em portais de anúncios (sem API: só links para o usuário abrir); `nivel` diz se a busca é
   * na mesma rua, no mesmo bairro ou na cidade
   */
  buscasExternas: (LinkImovel & { nivel?: "rua" | "bairro" | "cidade" })[];
  /** de quais cidades a Luneta tem preço de transação real (ITBI) e índices, e de quais ainda não */
  cobertura?: CoberturaPrecos;
}

export interface CoberturaPrecos {
  /** a cidade deste imóvel tem ITBI na base? */
  cidadeTemItbi: boolean;
  /**
   * A cidade tem ITBI, mas este imóvel fica sem a comparação por um motivo do arquivo, e não por falta de compras:
   * a frase pronta para mostrar (ex.: em São Paulo, a área publicada para apartamentos inclui a parte comum do
   * prédio). null/ausente quando não é o caso.
   */
  semComparacao?: string | null;
  fontes: FontePreco[];
}

export interface FontePreco {
  /** "São Paulo/SP", "FipeZAP" */
  nome: string;
  tipo: "itbi" | "indice";
  situacao: "temos" | "coleta_pendente" | "sem_dado_aberto" | "precisa_autorizacao";
  /** frase curta: "transações de out/2025 a set/2026 (48.210)", "coleta pronta, aguardando rodar" */
  detalhe: string;
  url: string | null;
  licenca: string | null;
  /** imóveis da base nesta cidade */
  imoveisNaBase: number | null;
}

// ---------------------------------------------------------------------------
// Nota de localização (base/fontes/localizacao; servidor em src/lib/catalogo/localizacao.ts)
// ---------------------------------------------------------------------------

export type PrecisaoLocal = "numero" | "rua" | "bairro" | "cidade";
export type ChaveComponenteLocal = "servicos" | "transporte" | "renda" | "infra" | "comercio" | "lazer";

export interface IndicadorLocal {
  /** "mercados_500", "escolas_1k", "onibus_500", "estacao_m", "parque_m", "renda", "pavimentacao"... */
  chave: string;
  /** "Mercados a até 500 m" */
  rotulo: string;
  /** pronto para mostrar: "12", "650 m", "R$ 2.400", "87%" (moeda com NBSP via rotulos.ts no servidor) */
  valor: string;
  /** o número cru (para ordenar e comparar) */
  numero: number | null;
  /** o comum na cidade (mediana ponderada pelos moradores): "5", "1,2 km"... null se não houver */
  comum: string | null;
}

export interface ComponenteLocal {
  chave: ChaveComponenteLocal;
  /** "Serviços do dia a dia", "Transporte", "Renda do entorno", "Infraestrutura da rua", "Comércio e movimento", "Lazer" */
  rotulo: string;
  /** percentil 0–100 entre os moradores da cidade; null = a cidade não tem esse dado (peso redistribuído) */
  nota: number | null;
  /** peso efetivo em % depois de redistribuir (soma 100 nos componentes com nota) */
  peso: number;
  /** cidade pequena: posição em terços */
  terco?: "baixo" | "medio" | "alto" | null;
  indicadores: IndicadorLocal[];
  /** ex.: > 30% dos domicílios do raio sem setor nos agregados */
  incompleto?: boolean;
}

export interface AlertaLocal {
  /** v1: BATER (IBGE/Cemaden, base 2010) */
  tipo: "area_risco";
  /** "Área de risco mapeada perto" */
  titulo: string;
  /** inclui "a ausência de área mapeada não quer dizer que não haja risco" */
  texto: string;
  /** 0 = dentro */
  distanciaM: number | null;
  fonte: string;
}

export interface LocalizacaoImovel {
  situacao: "calculada" | "aproximada" | "sem_nota" | "pendente";
  /** 0–100 (percentil final); null em sem_nota/pendente */
  nota: number | null;
  /** aproximada (bairro): faixa plausível */
  faixa: [number, number] | null;
  precisao: PrecisaoLocal | null;
  /** incerteza do ponto (m) */
  desvioM: number | null;
  /** ponto usado (mais preciso que o centro da cidade) */
  lat: number | null;
  lon: number | null;
  /** "São Gonçalo/RJ", 895560, 3920 */
  referencia: { nome: string; moradores: number; celulas: number } | null;
  /** sempre os 6, na ordem dos pesos */
  componentes: ComponenteLocal[];
  alertas: AlertaLocal[];
  /** sem_nota/aproximada: frase pronta ("O endereço foi localizado só no bairro...") */
  motivo: string | null;
  /** a cidade tem mapeamento BATER? (false → "sem mapeamento de risco para esta cidade") */
  coberturaRisco: boolean;
  /**
   * Precisão "bairro" em que o ponto é, na verdade, o meio de uma rua achada no CNEFE, rebaixada porque os endereços
   * dela se espalham demais (motivo "desvio_alto" do geocode, ~800 imóveis). A tela fala em "meio da rua", nunca em
   * "centro do bairro" (revisão final da rodada 4, M3). Ausente = falso.
   */
  pontoRuaEspalhada?: boolean;
  /**
   * Raio (m) em que a área de risco foi procurada: a incerteza do ponto, entre 100 e 500 m, em qualquer precisão (antes,
   * 100 m fixos no número e na rua; M2). null = não foi conferido: a cidade não tem mapeamento, ou o imóvel não tem ponto (endereço só na
   * cidade). Sem alerta, a tela diz o que foi conferido ("nenhuma área mapeada a menos de 100 m do imóvel") e, com
   * `coberturaRisco` e raio null, que a cidade tem áreas mapeadas mas o imóvel não pôde ser conferido. Nunca "sem risco".
   */
  riscoRaioM: number | null;
  fontes: { nome: string; detalhe: string; licenca: string; url: string | null }[];
  versao: number;
  /** AAAA-MM-DD */
  geradoEm: string;
}

export interface PaginaImovel {
  imovel: ImovelDetalhe;
  vizinhanca: Vizinhanca;
  selosDesligados: boolean;
  sobre: SobreConjunto;
  /** nota de localização (null no Lente e em conjunto sem dado; "pendente" quando o imóvel ainda não foi calculado) */
  localizacao: LocalizacaoImovel | null;
  /** o que o plano atual NÃO vê (src/lib/catalogo/planos.ts): a tela mostra a chamada da Luneta no lugar */
  travas: Recurso[];
}

/** Recursos dos planos (src/lib/catalogo/planos.ts). */
export type Recurso = "tags" | "selos" | "favoritos" | "simulador" | "relatorio" | "regiao" | "portais" | "localizacao" | "filtrosAvancados";
