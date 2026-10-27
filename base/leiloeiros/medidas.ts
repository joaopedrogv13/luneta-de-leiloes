/**
 * Medidas por lote e por leiloeiro, iguais para o validador (sobre o JSONL) e para o relatório (sobre
 * a base): o que está "no ar", por UF, tipo, modalidade e natureza, e a qualidade dos dados.
 *
 * "No ar" segue a regra da exportação do site (base/exportar.ts): situação ativa, lance maior que zero
 * e praça que não venceu há mais de 1 dia.
 */
import { chaveEndereco } from "../dedup/index.ts";
import type { ImovelGravado } from "../tipos.ts";
import { instanteDe } from "../util/data.ts";
import { enderecoEmTexto, type LinhaImovel } from "./contrato.ts";

const UM_DIA = 24 * 3600 * 1000;

export type Natureza = "judicial" | "extrajudicial" | "nao_informada";

export interface Medida {
  /** Situação ativa na fonte. */
  ativoNaFonte: boolean;
  /** Vendido, encerrado, suspenso ou cancelado (na base: status encerrado). */
  encerrado: boolean;
  /** Sumiu de uma carga completa (só na base). */
  removido: boolean;
  pracaVencida: boolean;
  semLance: boolean;
  /** Aparece no site. */
  noAr: boolean;
  uf: string;
  tipo: string;
  modalidade: string;
  natureza: Natureza;
  comFoto: boolean;
  comEdital: boolean;
  comAvaliacao: boolean;
  comArea: boolean;
  comEnderecoCompleto: boolean;
  comPracaDatada: boolean;
  /** Leilão (evento) do lote na fonte, para contar leilões por leiloeiro; null se o coletor não informa. */
  leilao: string | null;
}

const positivo = (v: number | null | undefined): boolean => typeof v === "number" && Number.isFinite(v) && v > 0;

function vencida(data: string | null | undefined, agora: Date): boolean {
  if (!data) return false;
  const t = instanteDe(data);
  return t !== null && t < agora.getTime() - UM_DIA;
}

function natureza(judicial: boolean | null | undefined): Natureza {
  return judicial === true ? "judicial" : judicial === false ? "extrajudicial" : "nao_informada";
}

/**
 * Praça em vigor de uma linha do JSONL, como a importação a escolhe: a informada; senão a primeira
 * futura ou aberta; senão a primeira (em ordem de número) com data que ainda não passou; senão a última.
 */
export function pracaEmVigor(l: Pick<LinhaImovel, "pracas" | "praca_atual">, agora: Date): LinhaImovel["pracas"][number] | null {
  const pracas = [...(l.pracas ?? [])].sort((a, b) => a.numero - b.numero);
  if (pracas.length === 0) return null;
  if (l.praca_atual !== null && l.praca_atual !== undefined) return pracas.find((p) => p.numero === l.praca_atual) ?? null;
  const declarada = pracas.find((p) => p.situacao === "aberta" || p.situacao === "futura");
  if (declarada) return declarada;
  if (pracas.length === 1) return pracas[0]!;
  const comData = pracas.filter((p) => p.data && instanteDe(p.data) !== null);
  if (comData.length === 0) return null;
  return comData.find((p) => (instanteDe(p.data!) ?? 0) >= agora.getTime()) ?? comData[comData.length - 1]!;
}

/** Medida de uma linha do JSONL (já validada pelo esquema). */
export function medidaDaLinha(l: LinhaImovel, agora: Date): Medida {
  const ativo = l.situacao === "ativo";
  const praca = pracaEmVigor(l, agora);
  const lance = l.lance_minimo ?? praca?.valor_minimo ?? null;
  const pracaVencida = ativo && vencida(praca?.data, agora);
  const semLance = ativo && !positivo(lance);
  const endereco = enderecoEmTexto(l.endereco);
  return {
    ativoNaFonte: ativo,
    encerrado: !ativo,
    removido: false,
    pracaVencida,
    semLance,
    noAr: ativo && !pracaVencida && !semLance,
    uf: l.endereco.uf,
    tipo: l.tipo,
    modalidade: l.modalidade,
    natureza: natureza(l.natureza === "judicial" ? true : l.natureza === "extrajudicial" ? false : null),
    comFoto: l.fotos.length > 0,
    comEdital: l.documentos.some((d) => d.tipo === "edital"),
    comAvaliacao: positivo(l.avaliacao),
    comArea: positivo(l.area_privativa) || positivo(l.area_total) || positivo(l.area_terreno),
    comEnderecoCompleto:
      endereco !== null && chaveEndereco({ uf: l.endereco.uf, cidade: l.endereco.cidade, bairro: l.endereco.bairro ?? null, endereco }) !== null,
    comPracaDatada: Boolean(praca?.data),
    leilao: l.leilao_id?.trim() || null,
  };
}

/** Medida de um imóvel gravado na base. */
export function medidaDoGravado(i: ImovelGravado, agora: Date): Medida {
  const ativo = i.status === "ativo";
  const pracaVencida = ativo && vencida(i.data_praca, agora);
  const semLance = ativo && !positivo(i.preco);
  return {
    ativoNaFonte: ativo,
    encerrado: i.status === "encerrado",
    removido: i.status === "removido",
    pracaVencida,
    semLance,
    noAr: ativo && !pracaVencida && !semLance,
    uf: i.uf,
    tipo: i.tipo,
    modalidade: i.modalidade,
    natureza: natureza(i.judicial),
    comFoto: i.fotos.some((f) => f.ok !== false),
    comEdital: i.documentos.some((d) => d.tipo === "edital"),
    comAvaliacao: positivo(i.valor_avaliacao),
    comArea: positivo(i.area_privativa) || positivo(i.area_total) || positivo(i.area_terreno),
    comEnderecoCompleto: Boolean(i.endereco) && i.chave_endereco !== null,
    comPracaDatada: Boolean(i.data_praca),
    leilao: typeof i.extras?.leilao_id === "string" && i.extras.leilao_id.trim() ? i.extras.leilao_id.trim() : null,
  };
}

export interface Agregado {
  ativos: number;
  /** Leilões distintos com imóvel ativo; null se nenhum ativo informa o leilão (0 sem ativos). */
  leiloes_ativos: number | null;
  situacao: { ativos_na_fonte: number; encerrados: number; removidos: number; praca_vencida: number; sem_lance: number };
  por_uf: Record<string, number>;
  por_tipo: Record<string, number>;
  por_modalidade: Record<string, number>;
  por_natureza: Record<string, number>;
  qualidade: {
    com_foto_pct: number | null;
    com_edital_pct: number | null;
    com_avaliacao_pct: number | null;
    com_area_pct: number | null;
    com_endereco_completo_pct: number | null;
    com_praca_datada_pct: number | null;
  };
}

function contar(lista: readonly Medida[], chave: (m: Medida) => string): Record<string, number> {
  const mapa = new Map<string, number>();
  for (const m of lista) mapa.set(chave(m), (mapa.get(chave(m)) ?? 0) + 1);
  return Object.fromEntries([...mapa].sort(([a, x], [b, y]) => y - x || a.localeCompare(b)));
}

function pct(lista: readonly Medida[], teste: (m: Medida) => boolean): number | null {
  return lista.length === 0 ? null : Math.round((100 * lista.filter(teste).length) / lista.length);
}

function contarLeiloes(noAr: readonly Medida[]): number | null {
  if (noAr.length === 0) return 0;
  const leiloes = new Set(noAr.map((m) => m.leilao).filter((l): l is string => l !== null));
  return leiloes.size > 0 ? leiloes.size : null;
}

/** Contagens e qualidade de um leiloeiro; as divisões e a qualidade são sobre os que estão no ar. */
export function agregar(medidas: readonly Medida[]): Agregado {
  const noAr = medidas.filter((m) => m.noAr);
  return {
    ativos: noAr.length,
    leiloes_ativos: contarLeiloes(noAr),
    situacao: {
      ativos_na_fonte: medidas.filter((m) => m.ativoNaFonte).length,
      encerrados: medidas.filter((m) => m.encerrado).length,
      removidos: medidas.filter((m) => m.removido).length,
      praca_vencida: medidas.filter((m) => m.pracaVencida).length,
      sem_lance: medidas.filter((m) => m.semLance).length,
    },
    por_uf: contar(noAr, (m) => m.uf),
    por_tipo: contar(noAr, (m) => m.tipo),
    por_modalidade: contar(noAr, (m) => m.modalidade),
    por_natureza: contar(noAr, (m) => m.natureza),
    qualidade: {
      com_foto_pct: pct(noAr, (m) => m.comFoto),
      com_edital_pct: pct(noAr, (m) => m.comEdital),
      com_avaliacao_pct: pct(noAr, (m) => m.comAvaliacao),
      com_area_pct: pct(noAr, (m) => m.comArea),
      com_endereco_completo_pct: pct(noAr, (m) => m.comEnderecoCompleto),
      com_praca_datada_pct: pct(noAr, (m) => m.comPracaDatada),
    },
  };
}
