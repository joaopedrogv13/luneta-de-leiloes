import type { SealLevel } from "@/components/ui/Seal";
import { BRAZIL_PINS } from "@/lib/brazil";
import type { LocalizacaoFicticia } from "@/lib/catalogo/localizacao";
import type { Severity } from "./tags";

/**
 * Casos exibidos na landing e na área do assinante.
 * - Sem `source`: EXEMPLO FICTÍCIO, só para ilustrar tags e selos (rotulado "Exemplo fictício").
 * - Com `source`: CASO REAL coletado de um anúncio público; o cartão leva direto ao anúncio no site do
 *   leiloeiro e mostra a data da coleta. Tags e selo são uma análise ilustrativa feita a partir do anúncio,
 *   não uma recomendação; preços e datas mudam, por isso sempre confira o edital.
 */
export type ListingSource = {
  /** Nome do leiloeiro ou portal (ex.: "Portal Zuk"). */
  leiloeiro: string;
  /** URL da página do imóvel específico no site do leiloeiro. */
  url: string;
  /** Data da coleta, AAAA-MM-DD. */
  coletadoEm: string;
};

export type ListingTag = { label: string; severity: Severity };

export type Listing = {
  id: string;
  title: string;
  /** "Bairro · Cidade/UF", ou só "Cidade/UF" quando a fonte não traz o bairro. */
  place: string;
  uf: string;
  /** Posição no mapa (viewBox 400×400): BRAZIL_PINS.x para capitais ou latLonToMap(lat, lon). */
  point: readonly [number, number];
  type: "apartamento" | "casa" | "comercial" | "terreno";
  avaliacao: number;
  lance: number;
  /** Deságio em % inteiro; negativo quando o lance passa da avaliação (casos reais). */
  desagio: number;
  /** null: a fonte não diz a praça (casos reais da base, ex.: Leilão SFI da Caixa sem ficha). */
  praca: "1ª praça" | "2ª praça" | "Praça única" | null;
  date: string;
  seal: SealLevel;
  desocupado: boolean;
  tags: ListingTag[];
  /** Por que recebeu (ou não) o selo. */
  why: string;
  /**
   * Foto na fonte (URL do leiloeiro). Na área do assinante e na /previa vai num <img> simples (sem o otimizador
   * do next/image, que baixaria e re-hospedaria a foto). O AuctionCard da landing ainda usa next/image: antes de pôr
   * casos reais ali, trocar também (base/FASE1-SITE.md, passo 7). Sem foto (ou se ela falhar), placeholder.
   */
  photo?: string;
  /** Origem, quando o caso é real. */
  source?: ListingSource;
  // Casos reais da base (base/saida/amostra-site.json), usados na /previa:
  /** Tags calculadas automaticamente que aguardam leitura humana: aparecem à parte, nunca como fato. */
  tagsEmRevisao?: ListingTag[];
  /** Selo ainda não avaliado (critérios pendentes): "Selo em análise" em vez de "Sem selo". */
  sealPending?: boolean;
  /** Modalidade na base: leilao, venda_direta, venda_online, licitacao_aberta… */
  modalidade?: string;
  /** Data e hora da praça (ISO); null quando a fonte não informa. */
  dataPraca?: string | null;
  /**
   * Nota de localização FICTÍCIA (só nos exemplos): coerente com o bairro real do exemplo e marcada como exemplo na
   * tela. Os moradores e as células são os da cidade de verdade (base/saida/site/localizacao-cidades.json.gz).
   */
  localizacao?: LocalizacaoFicticia;
};

export const LISTINGS: Listing[] = [
  {
    id: "alvo-sp",
    title: "Apartamento 3 quartos",
    place: "Vila Mariana · São Paulo/SP",
    uf: "SP",
    point: BRAZIL_PINS.sp,
    type: "apartamento",
    avaliacao: 620000,
    lance: 322400,
    desagio: 48,
    praca: "2ª praça",
    date: "14 nov",
    seal: 3,
    desocupado: true,
    tags: [
      { label: "Desocupado", severity: "positivo" },
      { label: "Sem dívidas identificadas", severity: "positivo" },
      { label: "Documentação regular", severity: "positivo" },
      { label: "2ª praça", severity: "positivo" },
    ],
    why: "Dados completos, deságio alto, posse livre, nenhuma dívida passando ao arrematante, documentação e processo limpos e praça favorável. Nenhum risco identificado nos dados do edital.",
    localizacao: {
      nota: 91,
      componentes: { servicos: 88, transporte: 93, renda: 85, infra: 96, comercio: 82, lazer: 71 },
      indicadores: { mercados_500: 18, farmacias_500: 5, padarias_500: 6, escolas_1k: 31, saude_1k: 14, estacao_m: 420, onibus_500: 26, onibus_face: 21, renda: 5800, pavimentacao: 100, calcada: 99, iluminacao: 100, esgoto: 100, comercio_1k: 3100, parque_m: 650 },
      moradores: 11437655,
      celulas: 23601,
      coberturaRisco: true,
    },
  },
  {
    id: "namira-pr",
    title: "Casa 2 quartos",
    place: "Água Verde · Curitiba/PR",
    uf: "PR",
    point: BRAZIL_PINS.cwb,
    type: "casa",
    avaliacao: 480000,
    lance: 307200,
    desagio: 36,
    praca: "2ª praça",
    date: "21 nov",
    seal: 2,
    desocupado: true,
    tags: [
      { label: "Desocupado", severity: "positivo" },
      { label: "Condomínio em atraso · R$ 4.300", severity: "atencao" },
    ],
    why: "Posse livre e nenhuma dívida passando ao arrematante. Segundo o edital, o condomínio em atraso é quitado com o valor da arrematação.",
    localizacao: {
      nota: 85,
      componentes: { servicos: 79, transporte: 74, renda: 88, infra: 94, comercio: 70, lazer: 83 },
      indicadores: { mercados_500: 6, farmacias_500: 3, padarias_500: 3, escolas_1k: 14, saude_1k: 5, estacao_m: 900, onibus_500: 15, onibus_face: 18, renda: 6400, pavimentacao: 100, calcada: 99, iluminacao: 100, esgoto: 100, comercio_1k: 1500, parque_m: 300 },
      moradores: 1774310,
      celulas: 8248,
      coberturaRisco: true,
    },
  },
  {
    id: "promissor-ba",
    title: "Apartamento 2 quartos",
    place: "Pituba · Salvador/BA",
    uf: "BA",
    point: BRAZIL_PINS.ssa,
    type: "apartamento",
    avaliacao: 390000,
    lance: 230100,
    desagio: 41,
    praca: "1ª praça",
    date: "3 dez",
    seal: 1,
    desocupado: false,
    tags: [
      { label: "Ocupação não informada", severity: "info" },
      { label: "Matrícula com pendência", severity: "atencao" },
    ],
    why: "Dados completos e deságio relevante, mas a ocupação não foi informada e a matrícula tem pendência.",
    localizacao: {
      nota: 86,
      componentes: { servicos: 85, transporte: 72, renda: 90, infra: 88, comercio: 86, lazer: 64 },
      indicadores: { mercados_500: 38, farmacias_500: 7, padarias_500: 6, escolas_1k: 29, saude_1k: 21, estacao_m: 1200, onibus_500: 18, onibus_face: 9, renda: 4800, pavimentacao: 100, calcada: 78, iluminacao: 100, esgoto: 99, comercio_1k: 3300, parque_m: 900 },
      moradores: 2416356,
      celulas: 5242,
      coberturaRisco: true,
    },
  },
  {
    id: "semselo-rj",
    title: "Sala comercial",
    place: "Centro · Rio de Janeiro/RJ",
    uf: "RJ",
    point: BRAZIL_PINS.rj,
    type: "comercial",
    avaliacao: 300000,
    lance: 135000,
    desagio: 55,
    praca: "Praça única",
    date: "28 nov",
    seal: 0,
    desocupado: false,
    tags: [
      { label: "Ocupado", severity: "grave" },
      { label: "Ação judicial em curso", severity: "grave" },
      { label: "Dívida passa ao arrematante", severity: "grave" },
    ],
    why: "O maior desconto da lista vem com ocupante, ação judicial em curso e dívida que passa ao arrematante.",
    localizacao: {
      nota: 82,
      componentes: { servicos: 70, transporte: 98, renda: 58, infra: 92, comercio: 99, lazer: 76 },
      indicadores: { mercados_500: 12, farmacias_500: 9, padarias_500: 7, escolas_1k: 25, saude_1k: 18, estacao_m: 250, onibus_500: 40, onibus_face: 24, renda: 2400, pavimentacao: 100, calcada: 98, iluminacao: 100, esgoto: 99, comercio_1k: 6800, parque_m: 400 },
      moradores: 6193495,
      celulas: 15882,
      coberturaRisco: true,
    },
  },
  {
    id: "namira-mg",
    title: "Apartamento 1 quarto",
    place: "Savassi · Belo Horizonte/MG",
    uf: "MG",
    point: BRAZIL_PINS.bh,
    type: "apartamento",
    avaliacao: 350000,
    lance: 234500,
    desagio: 33,
    praca: "2ª praça",
    date: "9 dez",
    seal: 2,
    desocupado: true,
    tags: [
      { label: "Desocupado", severity: "positivo" },
      { label: "IPTU em atraso · R$ 1.900", severity: "atencao" },
      { label: "Sem vistoria", severity: "info" },
    ],
    why: "Desocupado e sem dívida passando ao arrematante. Sem vistoria disponível.",
    localizacao: {
      nota: 94,
      componentes: { servicos: 92, transporte: 85, renda: 94, infra: 97, comercio: 95, lazer: 68 },
      indicadores: { mercados_500: 16, farmacias_500: 6, padarias_500: 8, escolas_1k: 22, saude_1k: 30, estacao_m: 1100, onibus_500: 30, onibus_face: 35, renda: 7200, pavimentacao: 100, calcada: 100, iluminacao: 100, esgoto: 100, comercio_1k: 4200, parque_m: 700 },
      moradores: 2317249,
      celulas: 6654,
      coberturaRisco: true,
    },
  },
  {
    id: "semselo-go",
    title: "Terreno 450 m²",
    place: "Setor Bueno · Goiânia/GO",
    uf: "GO",
    point: BRAZIL_PINS.gyn,
    type: "terreno",
    avaliacao: 410000,
    lance: 319800,
    desagio: 22,
    praca: "1ª praça",
    date: "17 dez",
    seal: 0,
    desocupado: false,
    tags: [
      { label: "Deságio baixo", severity: "atencao" },
      { label: "Cota-parte", severity: "atencao" },
      { label: "Área divergente", severity: "atencao" },
    ],
    why: "Deságio abaixo do relevante, venda de cota-parte e área divergente entre matrícula e edital.",
    localizacao: {
      nota: 87,
      componentes: { servicos: 83, transporte: 66, renda: 91, infra: 95, comercio: 84, lazer: 88 },
      indicadores: { mercados_500: 9, farmacias_500: 4, padarias_500: 4, escolas_1k: 13, saude_1k: 8, estacao_m: 1600, onibus_500: 12, onibus_face: 8, renda: 6100, pavimentacao: 100, calcada: 100, iluminacao: 100, esgoto: 99, comercio_1k: 1800, parque_m: 250 },
      moradores: 1439259,
      celulas: 8740,
      coberturaRisco: false,
    },
  },
];

/** Um de cada nível, na ordem do blueprint (Alvo, Na Mira, Promissor, sem selo). */
export const FEATURED_EXAMPLES = ["alvo-sp", "namira-pr", "promissor-ba", "semselo-rj"].map(
  (id) => LISTINGS.find((l) => l.id === id)!,
);

/** Rótulo do cartão: "Exemplo fictício" ou "Caso real · leiloeiro". */
export const listingLabel = (l: Listing) => (l.source ? `Caso real · ${l.source.leiloeiro}` : "Exemplo fictício");

/** "11/10/2026" a partir de "2026-10-11". */
export const formatDate = (iso: string) => iso.split("-").reverse().join("/");

export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
