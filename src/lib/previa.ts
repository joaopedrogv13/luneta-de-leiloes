import amostra from "../../base/saida/amostra-site.json";
import estatisticas from "../../base/saida/estatisticas-uf.json";
import { formatDate, type Listing, type ListingTag } from "@/content/examples";
import type { Severity } from "@/content/tags";
import type { Plan } from "@/components/assinante/shared";

/**
 * Prévia da fase 1 (/previa): o instantâneo do banco em base/saida (gerado por `npm run base:exportar -- --site`)
 * no formato `Listing` do site. Só o servidor importa este módulo: os dois JSON não vão para o navegador,
 * e no plano Lente a lista sai daqui sem tags, sem tags em revisão e sem explicação.
 * Formato dos arquivos: base/README.md ("Exportação para o site") e base/exportar.ts (ListingSite, EstatisticaUf).
 */

/** Um imóvel de amostra-site.json, com os tipos largos do JSON (conferidos em `paraListing`). */
interface ImovelAmostra {
  id: string;
  title: string;
  place: string;
  uf: string;
  point: number[];
  type: string;
  avaliacao: number;
  lance: number;
  desagio: number;
  praca: string | null;
  date: string;
  dataPraca: string | null;
  desocupado: boolean;
  tags: { label: string; severity: string }[];
  tagsEmRevisao: { label: string; severity: string }[];
  why: string;
  photo?: string;
  modalidade: string;
  source: { leiloeiro: string; url: string; coletadoEm: string };
}

interface FonteAmostra {
  id: string;
  gerado_na_fonte_em: string | null;
}

interface EstatisticaUf {
  uf: string;
  ativos: number;
  desagio: { mediana: number | null };
  tags: Record<string, number | undefined>;
}

const IMOVEIS: ImovelAmostra[] = amostra.imoveis;
const FONTES: FonteAmostra[] = amostra.fontes;
const BRASIL: EstatisticaUf = estatisticas.brasil;
const UFS: EstatisticaUf[] = estatisticas.ufs;

const TIPOS = ["apartamento", "casa", "comercial", "terreno"] as const;
const PRACAS = ["1ª praça", "2ª praça", "Praça única"] as const;
const SEVERIDADES: readonly Severity[] = ["grave", "atencao", "positivo", "info"];

function um<T extends string>(valor: string, aceitos: readonly T[], campo: string, id: string): T {
  if (!(aceitos as readonly string[]).includes(valor)) throw new Error(`previa: ${campo} inesperado em ${id}: ${valor}`);
  return valor as T;
}

const tags = (lista: ImovelAmostra["tags"], id: string): ListingTag[] =>
  lista.map((t) => ({ label: t.label, severity: um(t.severity, SEVERIDADES, "severity", id) }));

/** Confere um imóvel do JSON (tipo, praça, gravidades, ponto) e o leva ao tipo do site. Selo: sempre "em análise". */
function paraListing(i: ImovelAmostra): Listing {
  const [x, y] = i.point;
  if (x === undefined || y === undefined) throw new Error(`previa: ponto inválido em ${i.id}`);
  return {
    id: i.id,
    title: i.title,
    place: i.place,
    uf: i.uf,
    point: [x, y],
    type: um(i.type, TIPOS, "type", i.id),
    avaliacao: i.avaliacao,
    lance: i.lance,
    desagio: i.desagio,
    praca: i.praca === null ? null : um(i.praca, PRACAS, "praca", i.id),
    date: i.date,
    dataPraca: i.dataPraca,
    seal: 0,
    sealPending: true,
    desocupado: i.desocupado,
    tags: tags(i.tags, i.id),
    tagsEmRevisao: tags(i.tagsEmRevisao, i.id),
    why: i.why,
    photo: i.photo,
    modalidade: i.modalidade,
    source: i.source,
  };
}

const LISTAGEM: Listing[] = IMOVEIS.map(paraListing);

/**
 * Os imóveis da prévia como o plano pode ver. No Lente o servidor não manda tags, tags em revisão nem a
 * explicação (mesma regra da /assinante: nada disso no DOM); a Luneta recebe tudo.
 */
export function imoveisDaPrevia(plan: Plan): Listing[] {
  if (plan === "luneta") return LISTAGEM;
  return LISTAGEM.map((l) => ({ ...l, tags: [], tagsEmRevisao: [], why: "" }));
}

const n = (v: number) => v.toLocaleString("pt-BR");

/** "08/10/2026" a partir da data de geração na fonte ("2026-10-08" ou ISO). */
function dataDaFonte(id: string) {
  const d = FONTES.find((f) => f.id === id)?.gerado_na_fonte_em;
  return d ? formatDate(d.slice(0, 10)) : "data não informada";
}

/** Texto da faixa do topo, com as datas das fontes do instantâneo. */
export const FAIXA_PREVIA = `Prévia interna com dados reais · Caixa (lista de ${dataDaFonte("caixa_csv")}) e Leilões Judiciais (${dataDaFonte("leiloesjudiciais_api")}) · classificação automática ainda não revisada · selos desligados`;

/** Resumo do banco inteiro (estatisticas-uf.json), não só da amostra de 60. */
export const RESUMO_BANCO = {
  ativos: n(BRASIL.ativos),
  maioresUfs: [...UFS]
    .sort((a, b) => b.ativos - a.ativos || a.uf.localeCompare(b.uf))
    .slice(0, 5)
    .map((u) => ({ uf: u.uf, ativos: n(u.ativos) })),
  desagioMediano: BRASIL.desagio.mediana === null ? "não calculado" : `${n(BRASIL.desagio.mediana)}%`,
  // tag "Aceita financiamento" confirmada (vem do campo da fonte; a contagem não soma tags em revisão)
  financiamento: n(BRASIL.tags["aceita-financiamento"] ?? 0),
  amostra: n(LISTAGEM.length),
};
