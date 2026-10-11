import type { SealLevel } from "@/components/ui/Seal";
import { BRAZIL_PINS } from "@/lib/brazil";
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

export type Listing = {
  id: string;
  title: string;
  place: string;
  uf: string;
  /** Posição no mapa (viewBox 400×400): BRAZIL_PINS.x para capitais ou latLonToMap(lat, lon). */
  point: readonly [number, number];
  type: "apartamento" | "casa" | "comercial" | "terreno";
  avaliacao: number;
  lance: number;
  desagio: number;
  praca: "1ª praça" | "2ª praça" | "Praça única";
  date: string;
  seal: SealLevel;
  desocupado: boolean;
  tags: { label: string; severity: Severity }[];
  /** Por que recebeu (ou não) o selo. */
  why: string;
  /** Foto real em WebP, quando houver (renderizada com next/image dentro da moldura de lente). */
  photo?: string;
  /** Origem, quando o caso é real. */
  source?: ListingSource;
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
    why: "Posse livre e nenhuma dívida passando ao arrematante. O condomínio em atraso fica com o antigo dono, conforme o edital.",
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
