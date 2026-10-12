/**
 * Contratos da base. Os conectores (base/fontes/*) produzem estes tipos e o núcleo grava.
 *
 * Convenções:
 * - Campos de dados em snake_case, com os mesmos nomes das colunas do banco e da exportação.
 *   Funções e opções em camelCase.
 * - Datas: "AAAA-MM-DD" quando só se sabe o dia; data e hora em ISO 8601 UTC
 *   ("2026-10-08T13:00:00.000Z"). Use util/data.ts para converter horários de Brasília.
 * - Dinheiro em reais (number, duas casas). Áreas em m².
 * - `null` ou campo ausente = a fonte não informa. Nunca invente valor.
 * - LGPD: nenhum campo pode levar nome, CPF/CNPJ de pessoa física, e-mail ou IP de devedor,
 *   executado, exequente, depositário, licitante ou arrematante. O núcleo mascara títulos,
 *   descrições e textos ao gravar (util/lgpd.ts), mas o conector não deve mapear esses
 *   campos da fonte (ex.: nm_usuario, id_usuario, lances com IP).
 *
 * Mudanças aqui afetam todos os conectores: só acrescente campos opcionais; renomear ou
 * remover exige combinar com quem mantém os conectores e migrar o banco.
 */
import type { SlugTag } from "./riscos/tags.ts";
import type { ClienteHttp } from "./util/http.ts";

// ---------------------------------------------------------------------------
// Valores fechados
// ---------------------------------------------------------------------------

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;
export type Uf = (typeof UFS)[number];

/** Tipos de imóvel. O site agrupa em apartamento, casa, comercial e terreno; o resto é filtro extra. */
export const TIPOS_IMOVEL = ["apartamento", "casa", "terreno", "comercial", "rural", "vaga", "outro"] as const;
export type TipoImovel = (typeof TIPOS_IMOVEL)[number];

/**
 * Modalidade de venda, normalizada. O rótulo original vai em `modalidade_fonte`.
 * - leilao: leilão com praças (judicial ou extrajudicial; ver `judicial`). Ex.: "Leilão SFI - Edital Único".
 * - venda_direta: preço fixo, vence a primeira proposta válida. Ex.: "Venda Direta Online".
 * - venda_online: disputa online com prazo, sem praças. Ex.: "Venda Online" da Caixa.
 * - licitacao_aberta: concorrência/licitação com data de abertura. Ex.: "Licitação Aberta".
 */
export const MODALIDADES = ["leilao", "venda_direta", "venda_online", "licitacao_aberta", "outro"] as const;
export type Modalidade = (typeof MODALIDADES)[number];

/** Situação do anúncio. "removido" só o núcleo atribui (sumiu da fonte numa coleta completa). */
export const STATUS_IMOVEL = ["ativo", "encerrado", "removido"] as const;
export type StatusImovel = (typeof STATUS_IMOVEL)[number];

/** Precisão das coordenadas: do ponto exato do imóvel até o centro da cidade. */
export const PRECISOES_GEO = ["exata", "rua", "cep", "bairro", "cidade"] as const;
export type PrecisaoGeo = (typeof PRECISOES_GEO)[number];

/** 0 = oferta única (venda direta, praça única); 1 e 2 = 1ª e 2ª praça; 3 = 3ª praça (raro). */
export type NumeroPraca = 0 | 1 | 2 | 3;

export const TIPOS_DOCUMENTO = ["edital", "matricula", "laudo", "avaliacao", "outro"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export type ValorRisco = "sim" | "nao" | "desconhecido";
export type Confianca = "alta" | "media" | "baixa";

/** Classe de acesso, a mesma régua do catálogo de fontes. */
export type AcessoFonte =
  | "api_documentada"
  | "arquivo_oficial"
  | "dados_abertos"
  | "endpoint_interno"
  | "html"
  | "desconhecido";

/** Quem publica, a mesma régua do catálogo de fontes. */
export type TipoFonte =
  | "agregador"
  | "banco_privado"
  | "banco_publico"
  | "governo"
  | "judicial"
  | "leiloeiro"
  | "plataforma"
  | "outro";

/** Para que a fonte serve no produto. */
export type FinalidadeFonte = "vitrine" | "radar" | "enriquecimento";

// ---------------------------------------------------------------------------
// Registros normalizados
// ---------------------------------------------------------------------------

export interface Praca {
  numero: NumeroPraca;
  /** Data (e hora, se houver) da praça ou do fim da disputa. */
  data?: string | null;
  /** Lance mínimo ou preço da praça, em reais. */
  valor_minimo?: number | null;
}

export interface Foto {
  /** URL da foto NA FONTE. A base não baixa nem re-hospeda imagens. */
  url: string;
  ordem?: number;
  /** Tamanho declarado pela fonte, ex.: "640x480" ou "thumb_grande". */
  tamanho?: string | null;
  /**
   * Como a URL foi obtida. Valores usados: "api" (veio na resposta da fonte), "ficha"
   * (página de detalhe), "padrao_url" (montada por padrão conhecido; precisa de verificação).
   */
  origem: string;
  /** Quando alguém conferiu que a URL responde (HEAD/GET). */
  verificada_em?: string | null;
  /** Resultado da verificação; `null` = ainda não verificada. */
  ok?: boolean | null;
}

export interface Documento {
  tipo: TipoDocumento;
  titulo?: string | null;
  /** URL do documento na fonte (edital, matrícula, laudo). Não baixamos o arquivo. */
  url: string;
  publicado_em?: string | null;
}

/** Texto adicional para as regras de risco, como trechos da ficha ou do edital. */
export interface TextoFonte {
  /** De onde veio: "ficha", "edital", "observacoes", "anexo:matricula"... */
  origem: string;
  texto: string;
}

export interface ImovelNormalizado {
  registro: "imovel";
  /** Identificador estável do imóvel na fonte (ex.: N° do imóvel da Caixa, lote_id). */
  id_na_fonte: string;
  /** Página pública do imóvel na fonte (é para onde o site leva o usuário). */
  url: string;
  titulo: string;
  tipo: TipoImovel;
  uf: Uf;
  cidade: string;
  bairro?: string | null;
  endereco?: string | null;
  /** Só dígitos ou "00000-000"; o núcleo guarda 8 dígitos. */
  cep?: string | null;
  lat?: number | null;
  lon?: number | null;
  precisao_geo?: PrecisaoGeo | null;
  area_total?: number | null;
  area_privativa?: number | null;
  area_terreno?: number | null;
  quartos?: number | null;
  vagas?: number | null;
  /** Descrição em texto (HTML é limpo ao gravar). */
  descricao?: string | null;
  textos?: TextoFonte[];
  modalidade: Modalidade;
  /** Rótulo original da modalidade na fonte. */
  modalidade_fonte?: string | null;
  judicial?: boolean | null;
  /** Financiamento bancário (ex.: coluna "Financiamento" da Caixa). Parcelamento judicial NÃO conta. */
  aceita_financiamento?: boolean | null;
  aceita_fgts?: boolean | null;
  /** Parcelamento do lance (ex.: art. 895 do CPC). Não é financiamento. */
  aceita_parcelamento?: boolean | null;
  /** Ocupação declarada em CAMPO ESTRUTURADO da fonte. Texto livre fica para as regras de risco. */
  ocupacao?: "ocupado" | "desocupado" | null;
  /** Nome do leiloeiro (profissional público) ou da plataforma. */
  leiloeiro?: string | null;
  /** Quem vende: banco, órgão, vara/tribunal. Nunca o nome de pessoa física. */
  comitente?: string | null;
  /** Número do processo (formato CNJ quando houver). */
  numero_processo?: string | null;
  matricula?: string | null;
  /** Cartório de registro, ex.: "6º Cartório de Registro de Imóveis de São Paulo". */
  cartorio?: string | null;
  valor_avaliacao?: number | null;
  /**
   * Valor mínimo vigente (lance mínimo da praça atual ou preço de venda). Se ausente, o núcleo
   * usa o `valor_minimo` da praça atual.
   */
  preco?: number | null;
  /** Praça em vigor. Se ausente, o núcleo deduz pelas datas das praças. */
  praca_atual?: NumeroPraca | null;
  pracas: Praca[];
  fotos: Foto[];
  documentos: Documento[];
  /** "ativo" se omitido. O conector nunca usa "removido". */
  status?: Exclude<StatusImovel, "removido">;
  /** Campos estruturados da fonte sem coluna própria (ex.: inscricao_imobiliaria, nu_parcelas). */
  extras?: Record<string, string | number | boolean | null>;
}

/**
 * Imóvel como está no banco (leitura): o normalizado já limpo e mascarado, mais o que o núcleo
 * calcula. É o que as regras de risco e a exportação recebem.
 */
export interface ImovelGravado extends Omit<ImovelNormalizado, "status"> {
  /** Id interno (0 em imóvel montado para teste, fora do banco). */
  id: number;
  fonte_id: string;
  status: StatusImovel;
  cidade_norm: string;
  /** 100 × (1 − preço/avaliação); negativo quando o preço passa da avaliação. */
  desconto_pct: number | null;
  data_praca: string | null;
  primeira_vez_em: string;
  ultima_vez_em: string;
  atualizado_em: string;
  /** Data de geração na fonte do dado gravado (quando a fonte informa). */
  gerado_na_fonte_em: string | null;
  removido_em: string | null;
  hash_conteudo: string;
  chave_dedup: string | null;
  chave_endereco: string | null;
}

/** Edital ou aviso de leilão para o radar (PNCP, DJEN, DOU, Querido Diário...). */
export interface EditalNormalizado {
  registro: "edital";
  id_na_fonte: string;
  titulo: string;
  orgao?: string | null;
  uf?: Uf | null;
  cidade?: string | null;
  /** Data de publicação. */
  publicado_em?: string | null;
  /** Data do leilão, se o aviso informar. */
  data_leilao?: string | null;
  /** Link para o edital ou o aviso na fonte. */
  url: string;
  /** Resumo curto do texto (o núcleo mascara dados pessoais e corta em 2.000 caracteres). */
  resumo?: string | null;
  /** Imóvel da base a que o edital se refere, quando já se sabe. */
  imovel_id?: number | null;
}

export type RegistroNormalizado = ImovelNormalizado | EditalNormalizado;

/** Uma tag detectada para um imóvel, com a evidência. */
export interface RiscoDetectado {
  tag: SlugTag;
  valor: ValorRisco;
  confianca: Confianca;
  /** Exige leitura humana antes de exibir como fato. */
  precisa_revisao: boolean;
  /** De onde veio a evidência: "campo:modalidade", "descricao", "titulo", "ficha", "edital"... */
  origem: string;
  /** Trecho de evidência. O motor mascara dados pessoais e corta antes de gravar. */
  trecho: string | null;
  /** Id da regra que detectou (o motor preenche com o id da regra que rodou). */
  regra: string;
}

// ---------------------------------------------------------------------------
// Conectores
// ---------------------------------------------------------------------------

export interface CapacidadesFonte {
  /** A fonte publica fotos? Se não, a tag "Sem fotos" nunca sai dela. */
  fotos: boolean;
  /** A fonte publica documentos (edital, matrícula, laudo)? */
  documentos: boolean;
  /** A fonte informa ocupação em campo estruturado? */
  ocupacao: boolean;
  /**
   * Uma execução sem --limite traz a lista inteira (ou a da UF pedida)? Só assim o núcleo
   * marca como "removido" o que sumiu. Busca paginada incompleta deve ser `false`.
   */
  listaCompleta: boolean;
}

/** Metadados que o conector informa durante a coleta (opcoes.informar). */
export interface MetaColeta {
  /** Data de geração declarada pela fonte (ex.: "Data de geração" do CSV da Caixa). */
  geradoEm?: string;
  /** URL ou arquivo efetivamente lido. */
  origem?: string;
  /** Quantos registros a fonte diz ter, para conferência. */
  totalNaFonte?: number;
  /** Alerta não fatal (ex.: "3 linhas sem UF ignoradas"). */
  aviso?: string;
}

export interface OpcoesColeta {
  /** Restringe a coleta a uma UF (quando a fonte permite). */
  uf?: Uf;
  /** Lê de um arquivo ou fixture local em vez da rede. Todo conector deve aceitar. */
  arquivo?: string;
  /** Para depois de N registros brutos (teste). Uma coleta limitada nunca marca removidos. */
  limite?: number;
  /** Também busca páginas de detalhe (ficha, fotos, documentos). Mais lento. */
  detalhes?: boolean;
  /** Cliente HTTP educado (util/http.ts). Use sempre este em vez de fetch direto. */
  http: ClienteHttp;
  /** Informa metadados da coleta (data de geração, origem, avisos). */
  informar: (meta: MetaColeta) => void;
  /** Mensagens de progresso para o terminal. */
  log: (mensagem: string) => void;
  /** Cancelamento (Ctrl+C). */
  sinal?: AbortSignal;
}

/**
 * Um conector de fonte. `coletar` lê os registros brutos (rede ou arquivo local) e
 * `normalizar` converte cada um. O núcleo cuida do resto: validação, gravação transacional,
 * histórico, remoção, log da coleta e riscos.
 *
 * Regras para quem escreve conector:
 * - `coletar` deve validar o conteúdo bruto (assinatura do arquivo, volume, formato) e lançar
 *   erro se a resposta não for a esperada (ex.: página de desafio anti-robô no lugar do CSV).
 * - `normalizar` devolve `null` para descartar um registro fora de escopo (ex.: veículo) e
 *   lança erro só para registro quebrado. Não grava nada, não faz rede.
 * - Nunca mapear nomes, CPF/CNPJ de pessoa física, e-mail ou IP de partes e licitantes.
 */
export interface Conector<Bruto = unknown> {
  /** Slug estável, ex.: "caixa_csv". Vira fonte.id no banco. */
  readonly id: string;
  readonly nome: string;
  readonly tipo: TipoFonte;
  readonly acesso: AcessoFonte;
  readonly finalidade: FinalidadeFonte;
  /** Página principal da fonte. */
  readonly url?: string;
  readonly capacidades: CapacidadesFonte;
  /**
   * Mínimo de registros válidos numa coleta completa sem filtro de UF. Abaixo disso a coleta é
   * considerada inválida e nada é gravado (protege contra arquivo truncado).
   */
  readonly volumeMinimo?: number;
  /**
   * Fração máxima dos ativos que uma coleta completa pode marcar como removidos (padrão 0,5).
   * Acima disso o núcleo grava o resto mas não remove nada e registra aviso.
   */
  readonly maxFracaoRemocao?: number;
  coletar(opcoes: OpcoesColeta): AsyncIterable<Bruto>;
  normalizar(bruto: Bruto): RegistroNormalizado | null;
}
