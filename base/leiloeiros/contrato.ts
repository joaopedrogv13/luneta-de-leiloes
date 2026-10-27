/**
 * Contrato de troca com os coletores dos leiloeiros (Apps Script do dono, ou o que vier depois):
 * um arquivo JSONL em UTF-8, uma linha por registro. Documentação para quem escreve o coletor em
 * base/leiloeiros/CONTRATO.md; esquemas em imovel.schema.json e coleta.schema.json.
 *
 * Dois tipos de linha:
 * - `{"registro": "coleta", ...}`: uma por leiloeiro por carga. Diz quando a coleta terminou, se a
 *   carga traz TODOS os lotes de imóveis ativos do leiloeiro (`completa`) e a saúde do coletor. Sem
 *   ela, nada do leiloeiro sai do site por ter sumido da carga (a remoção fica desligada).
 * - `{"registro": "imovel", ...}`: um lote de imóvel.
 *
 * Ids: `<slug-do-leiloeiro>:<id-do-lote>`, com o slug em minúsculas e hífens e o id do lote só com
 * letras minúsculas e dígitos. Na base, cada leiloeiro vira uma fonte `ll_<slug com _>` e o lote vira
 * `id_na_fonte`; no site, o id é `ll-<slug>-<lote>`. Como o id do lote não tem hífen, o que vem depois
 * do último hífen é sempre o lote: dois leiloeiros nunca geram o mesmo id no site (o site recusa o
 * arquivo inteiro se um id repetir).
 */
import { MODALIDADES, PRECISOES_GEO, TIPOS_IMOVEL, UFS, type AcessoFonte, type Modalidade, type PrecisaoGeo, type TipoImovel } from "../tipos.ts";

export const VERSAO_CONTRATO = 1;

/** Prefixo da fonte de cada leiloeiro na base (`fonte.id`). */
export const PREFIXO_FONTE = "ll_";
/** Prefixo do id no site. */
export const PREFIXO_SITE = "ll-";

export const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RE_LOTE = /^[a-z0-9]+$/;
export const MAX_SLUG = 30;
export const MAX_LOTE = 40;
/** Número do processo no padrão CNJ (Res. 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO. */
export const RE_PROCESSO_CNJ = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

export const SITUACOES = ["ativo", "suspenso", "encerrado", "vendido", "cancelado"] as const;
export type Situacao = (typeof SITUACOES)[number];

export const SITUACOES_PRACA = ["futura", "aberta", "deserta", "arrematada", "encerrada", "suspensa", "cancelada"] as const;
export type SituacaoPraca = (typeof SITUACOES_PRACA)[number];

export const NATUREZAS = ["judicial", "extrajudicial"] as const;
export type Natureza = (typeof NATUREZAS)[number];

export const TIPOS_COMITENTE = ["banco", "judicial", "orgao_publico", "empresa", "outro"] as const;
export type TipoComitente = (typeof TIPOS_COMITENTE)[number];

export const TIPOS_DOCUMENTO_LINHA = ["edital", "matricula", "laudo", "avaliacao", "processo", "outro"] as const;
export type TipoDocumentoLinha = (typeof TIPOS_DOCUMENTO_LINHA)[number];

/** Quem paga a dívida declarada: o arrematante, o dinheiro do lance (sub-rogação no preço) ou o vendedor. */
export const RESPONSAVEIS_DEBITO = ["arrematante", "pago_com_o_lance", "vendedor"] as const;
export type ResponsavelDebito = (typeof RESPONSAVEIS_DEBITO)[number];

export const SAUDES = ["ok", "parcial", "quebrado", "bloqueado"] as const;
export type Saude = (typeof SAUDES)[number];

export const FREQUENCIAS = ["diaria", "semanal", "quinzenal", "mensal", "manual"] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];

/** Como o coletor lê o site do leiloeiro. */
export const METODOS = ["html", "json_interno", "api_documentada", "arquivo_oficial"] as const;
export type Metodo = (typeof METODOS)[number];

export const ROBOTS = ["permite", "proibe", "sem_robots", "nao_verificado"] as const;
export const TERMOS = ["permitem", "proibem", "silenciosos", "nao_lidos"] as const;

/** Classe de acesso da base para cada método (fonte.acesso). */
export const ACESSO_DO_METODO: Readonly<Record<Metodo, AcessoFonte>> = {
  html: "html",
  json_interno: "endpoint_interno",
  api_documentada: "api_documentada",
  arquivo_oficial: "arquivo_oficial",
};

// Os enums da base repetidos aqui para o esquema e a documentação (o teste confere que batem).
export { MODALIDADES, PRECISOES_GEO, TIPOS_IMOVEL, UFS };

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

export interface LeiloeiroLinha {
  slug: string;
  nome: string;
  site: string;
  matricula_junta?: string | null;
}

export interface EnderecoLinha {
  texto?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade: string;
  uf: string;
  cep?: string | null;
}

export interface PracaLinha {
  numero: 0 | 1 | 2 | 3;
  data: string | null;
  valor_minimo: number | null;
  situacao?: SituacaoPraca | null;
}

export interface PagamentoLinha {
  a_vista?: boolean | null;
  parcelamento?: boolean | null;
  parcelas_max?: number | null;
  entrada_pct?: number | null;
  indice_correcao?: string | null;
  financiamento?: boolean | null;
  fgts?: boolean | null;
  texto?: string | null;
}

export interface OcupacaoLinha {
  situacao: "ocupado" | "desocupado" | null;
  origem: "campo" | "texto" | null;
  texto?: string | null;
}

export interface DebitoLinha {
  valor: number | null;
  responsavel: ResponsavelDebito | null;
}

export interface DebitosLinha {
  iptu?: DebitoLinha | null;
  condominio?: DebitoLinha | null;
  texto?: string | null;
}

export interface DocumentoLinha {
  tipo: TipoDocumentoLinha;
  titulo?: string | null;
  url: string;
}

export interface FotoLinha {
  url: string;
  ordem?: number | null;
}

export interface RegistroImovelLinha {
  matricula?: string | null;
  cartorio?: string | null;
  inscricao_municipal?: string | null;
}

export interface ControleLinha {
  coletado_em: string;
  versao_coletor: string;
  hash?: string | null;
}

export interface LinhaImovel {
  registro: "imovel";
  versao_contrato: number;
  id: string;
  leiloeiro: LeiloeiroLinha;
  plataforma?: string | null;
  comitente?: { nome: string; tipo: TipoComitente } | null;
  url: string;
  leilao_id?: string | null;
  leilao_titulo?: string | null;
  lote_numero?: string | null;
  situacao: Situacao;
  situacao_fonte?: string | null;
  tipo: TipoImovel;
  tipo_fonte?: string | null;
  titulo: string;
  descricao?: string | null;
  observacoes?: string | null;
  endereco: EnderecoLinha;
  lat?: number | null;
  lon?: number | null;
  precisao_geo?: PrecisaoGeo | null;
  area_privativa?: number | null;
  area_total?: number | null;
  area_terreno?: number | null;
  quartos?: number | null;
  vagas?: number | null;
  avaliacao?: number | null;
  lance_minimo?: number | null;
  lance_atual?: number | null;
  incremento?: number | null;
  comissao_pct?: number | null;
  pracas: PracaLinha[];
  praca_atual?: 0 | 1 | 2 | 3 | null;
  modalidade: Modalidade;
  modalidade_fonte?: string | null;
  natureza?: Natureza | null;
  processo?: string | null;
  pagamento?: PagamentoLinha | null;
  ocupacao?: OcupacaoLinha | null;
  debitos?: DebitosLinha | null;
  documentos: DocumentoLinha[];
  fotos: FotoLinha[];
  registro_imovel?: RegistroImovelLinha | null;
  extras?: Record<string, string | number | boolean | null> | null;
  controle: ControleLinha;
}

export interface LinhaColeta {
  registro: "coleta";
  versao_contrato: number;
  leiloeiro: LeiloeiroLinha;
  plataforma?: string | null;
  metodo?: Metodo | null;
  iniciado_em?: string | null;
  coletado_em: string;
  versao_coletor: string;
  completa: boolean;
  total_na_fonte?: number | null;
  total_enviados: number;
  saude: Saude;
  erro?: string | null;
  frequencia?: Frequencia | null;
  extrai?: { fotos: boolean; documentos: boolean; ocupacao: boolean } | null;
  robots?: (typeof ROBOTS)[number] | null;
  termos?: (typeof TERMOS)[number] | null;
}

export type LinhaJsonl = LinhaImovel | LinhaColeta;

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

export function slugValido(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length >= 2 && slug.length <= MAX_SLUG && RE_SLUG.test(slug);
}

export function loteValido(lote: unknown): lote is string {
  return typeof lote === "string" && lote.length >= 1 && lote.length <= MAX_LOTE && RE_LOTE.test(lote);
}

/** "alfa-leiloes:48211" → { slug: "alfa-leiloes", lote: "48211" }; null se o id não segue o contrato. */
export function separarId(id: unknown): { slug: string; lote: string } | null {
  if (typeof id !== "string") return null;
  const pos = id.indexOf(":");
  if (pos < 0 || id.indexOf(":", pos + 1) >= 0) return null;
  const slug = id.slice(0, pos);
  const lote = id.slice(pos + 1);
  return slugValido(slug) && loteValido(lote) ? { slug, lote } : null;
}

/** Fonte da base de um leiloeiro: "alfa-leiloes" → "ll_alfa_leiloes". */
export function fonteDoSlug(slug: string): string {
  return PREFIXO_FONTE + slug.replace(/-/g, "_");
}

/** O contrário de `fonteDoSlug`; null para fonte que não é de leiloeiro. */
export function slugDaFonte(fonteId: string): string | null {
  if (!fonteId.startsWith(PREFIXO_FONTE)) return null;
  const slug = fonteId.slice(PREFIXO_FONTE.length).replace(/_/g, "-");
  return slugValido(slug) ? slug : null;
}

/** Id do imóvel no site (o mesmo que base/exportar.ts monta pelo prefixo da fonte): "ll-alfa-leiloes-48211". */
export function idNoSite(slug: string, lote: string): string {
  return `${PREFIXO_SITE}${slug}-${lote}`;
}

/**
 * Endereço como vai para a base (`imovel.endereco`): logradouro, número e complemento juntos quando o
 * coletor separou os campos ("Rua das Flores, 100, Apto 31"); senão o texto original. Bairro, cidade
 * e UF ficam nas colunas deles. Sem número, fica sem número (nunca "s/n" inventado).
 */
export function enderecoEmTexto(e: Pick<EnderecoLinha, "texto" | "logradouro" | "numero" | "complemento">): string | null {
  const logradouro = e.logradouro?.trim();
  if (logradouro) return [logradouro, e.numero?.trim(), e.complemento?.trim()].filter((p) => p).join(", ");
  return e.texto?.trim() || null;
}

/** Palavras de quem vende sem ser pessoa física: empresa, banco, vara, órgão, entidade. */
const MARCA_PJ =
  /(?<![\p{L}])(?:s\.?\s?\/?a\.?|ltda|eireli|me|epp|banco|bank|caixa|vara|tribunal|tj[a-z]{2}|tr[tf]\d*|ju[ií]zo|comarca|justi[çc]a|f[óo]rum|prefeitura|munic[íi]pio|estado|uni[ãa]o|governo|secretaria|minist[ée]rio|inss|receita|fazenda|cooperativa|sicoob|sicredi|cr[ée]dito|financeira|fundo|funda[çc][ãa]o|associa[çc][ãa]o|condom[íi]nio|construtora|incorporadora|empreendimentos?|participa[çc][õo]es|holding|companhia|cia|seguradora|administradora|igreja|instituto|universidade|autarquia|empresa|sociedade|cons[óo]rcio|massa\s+falida)(?![\p{L}])/iu;

/**
 * O comitente parece empresa, banco, vara ou órgão? Com tipo "outro" e sem nenhuma dessas palavras, o nome
 * pode ser de pessoa física (que nunca vai ao site: o comitente vai sem a máscara de nomes).
 */
export function comitentePareceEmpresaOuOrgao(nome: string): boolean {
  return MARCA_PJ.test(nome);
}

// ---------------------------------------------------------------------------
// JSONL
// ---------------------------------------------------------------------------

export interface LinhaLida {
  /** Número da linha no arquivo (1 = primeira). */
  numero: number;
  valor?: unknown;
  /** JSON inválido nesta linha. */
  erro?: string;
}

/** Linhas do JSONL (BOM e linhas em branco ignorados; \r\n aceito). */
export function lerJsonl(texto: string): LinhaLida[] {
  const semBom = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const linhas: LinhaLida[] = [];
  semBom.split("\n").forEach((bruta, i) => {
    const linha = bruta.replace(/\r$/, "");
    if (linha.trim() === "") return;
    try {
      linhas.push({ numero: i + 1, valor: JSON.parse(linha) as unknown });
    } catch (e) {
      linhas.push({ numero: i + 1, erro: `JSON inválido (${(e as Error).message})` });
    }
  });
  return linhas;
}

// ---------------------------------------------------------------------------
// Coleta declarada (vai para os avisos da coleta na base e volta no relatório)
// ---------------------------------------------------------------------------

const MARCA_DECLARADA = "Coleta declarada pelo coletor:";

/** Aviso gravado no log da coleta com o que o coletor declarou (o relatório lê de volta). */
export function avisoColetaDeclarada(c: Pick<LinhaColeta, "saude" | "frequencia" | "completa" | "versao_coletor" | "erro">): string {
  const erro = c.erro ? `, erro: ${c.erro.replace(/\s+/g, " ").slice(0, 200)}` : "";
  return `${MARCA_DECLARADA} saúde ${c.saude}, frequência ${c.frequencia ?? "nao_informada"}, completa ${c.completa ? "sim" : "não"}, versão ${c.versao_coletor}${erro}`;
}

/** Lê de volta o aviso de `avisoColetaDeclarada`; null se o texto não é um deles. */
export function lerColetaDeclarada(aviso: string): { saude: Saude; frequencia: Frequencia | null; completa: boolean } | null {
  const m = /^Coleta declarada pelo coletor: saúde (\w+), frequência (\w+), completa (sim|não)/.exec(aviso);
  if (!m) return null;
  const saude = (SAUDES as readonly string[]).includes(m[1]!) ? (m[1] as Saude) : null;
  if (!saude) return null;
  const frequencia = (FREQUENCIAS as readonly string[]).includes(m[2]!) ? (m[2] as Frequencia) : null;
  return { saude, frequencia, completa: m[3] === "sim" };
}

/** Erro de uma coleta que o coletor declarou quebrada ou bloqueada e sem lotes: começa por "[bloqueado]" ou "[quebrado]". */
export function erroDeclarado(saude: Saude, erro: string | null | undefined): string {
  return `[${saude}] ${erro?.trim() || "o coletor não mandou lotes"}`;
}

/** Saúde pela mensagem de erro de uma coleta ("[bloqueado] ..." → bloqueado). */
export function saudeDoErro(erro: string | null): Saude | null {
  const m = erro ? /^\[(bloqueado|quebrado)\]/.exec(erro) : null;
  return m ? (m[1] as Saude) : null;
}
