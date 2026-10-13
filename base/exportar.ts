/**
 * Exportação para o site: um JSON com os imóveis ativos, praças, fotos (URL da fonte),
 * documentos e as tags consolidadas (só as que valem "sim").
 *
 * Fica de fora: imóvel removido ou encerrado, praça que já passou há mais de 1 dia e foto
 * reprovada na verificação. A gravação é atômica (arquivo temporário + rename).
 *
 * Posição: `lat`/`lon` com `precisao_geo` ("cidade" = sede do município, quando a fonte não traz
 * coordenada), `codigo_ibge` do município e `mapa` = [x, y] no viewBox 400×400 do mapa do site
 * (mesma projeção de src/lib/brazil.ts, latLonToMap). Imóvel gravado sem coordenada é
 * geocodificado na hora pela cidade.
 *
 * Para o site (`exportar --site`): um instantâneo pequeno e estável no formato `Listing` de
 * src/content/examples.ts (base/saida/amostra-site.json, até 60 imóveis variados) e um agregado
 * por UF para estatísticas (base/saida/estatisticas-uf.json). Ver "Instantâneo para o site" abaixo.
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { carregarImoveis } from "./consultas.ts";
import { lerBool, lerTexto, type Banco } from "./db.ts";
import { geocodificar } from "./geo/geocodificar.ts";
import { posicaoNoMapa } from "./geo/mapa.ts";
import { tabelaPadrao } from "./geo/municipios.ts";
import { chaveNome } from "./geo/nomes.ts";
import { consolidarTags, type LinhaRisco } from "./riscos/motor.ts";
import { CATEGORIAS, definicaoTag, TAGS, type Severidade } from "./riscos/tags.ts";
import type { Confianca, ImovelGravado, ValorRisco } from "./tipos.ts";
import { hojeBrasilia, instanteDe } from "./util/data.ts";
import { hashTexto } from "./util/hash.ts";
import { truncar } from "./util/texto.ts";

export const SAIDA_PADRAO = join(dirname(fileURLToPath(import.meta.url)), "dados", "exportacao", "imoveis.json");

/** Versão do formato do JSON exportado. Suba quando mudar algo de forma incompatível. */
export const VERSAO_EXPORTACAO = 1;

export interface TagExportada {
  slug: string;
  rotulo: string;
  categoria: string;
  severidade: string;
  confianca: Confianca;
  revisao_pendente: boolean;
  revisada: boolean;
  trecho: string | null;
  origem: string;
}

export interface ImovelExportado {
  id: number;
  fonte: string;
  fonte_nome: string;
  id_na_fonte: string;
  url: string;
  titulo: string;
  tipo: string;
  uf: string;
  cidade: string;
  bairro: string | null;
  endereco: string | null;
  cep: string | null;
  lat: number | null;
  lon: number | null;
  /** exata | rua | cep | bairro | cidade ("cidade" = sede do município). */
  precisao_geo: string | null;
  /** Código IBGE do município (7 dígitos), ou null se a cidade não foi reconhecida. */
  codigo_ibge: string | null;
  /** [x, y] no viewBox 400×400 do mapa do site (src/lib/brazil.ts), ou null sem coordenada. */
  mapa: [number, number] | null;
  area_total: number | null;
  area_privativa: number | null;
  area_terreno: number | null;
  quartos: number | null;
  vagas: number | null;
  descricao: string | null;
  modalidade: string;
  modalidade_fonte: string | null;
  judicial: boolean | null;
  aceita_financiamento: boolean | null;
  aceita_fgts: boolean | null;
  aceita_parcelamento: boolean | null;
  leiloeiro: string | null;
  comitente: string | null;
  numero_processo: string | null;
  matricula: string | null;
  cartorio: string | null;
  valor_avaliacao: number | null;
  preco: number | null;
  desconto_pct: number | null;
  praca_atual: number | null;
  data_praca: string | null;
  pracas: ImovelGravado["pracas"];
  fotos: ImovelGravado["fotos"];
  documentos: ImovelGravado["documentos"];
  tags: TagExportada[];
  chave_dedup: string | null;
  /**
   * Chave de endereço (base/dedup). Mesmo imóvel = mesma chave_dedup, ou mesma chave_endereco sem
   * matrículas diferentes (`mesmoImovel` em base/dedup/index.ts): uma fonte com matrícula e outra
   * sem nunca dividem a chave_dedup.
   */
  chave_endereco: string | null;
  primeira_vez_em: string;
  ultima_vez_em: string;
  atualizado_em: string;
  /** Data de geração na fonte do dado gravado (CSV da Caixa, data da resposta da API), ou null. */
  gerado_na_fonte_em: string | null;
}

export interface Exportacao {
  versao: number;
  gerado_em: string;
  total: number;
  imoveis: ImovelExportado[];
}

export interface OpcoesExportar {
  limite?: number;
  agora?: Date;
}

const UM_DIA = 24 * 3600 * 1000;

/** Monta o objeto de exportação (sem gravar arquivo). */
export function montarExportacao(db: Banco, opcoes: OpcoesExportar = {}): Exportacao {
  const agora = opcoes.agora ?? new Date();
  const nomes = new Map(db.prepare("SELECT id, nome FROM fonte").all().map((l) => [String(l.id), String(l.nome)]));
  const riscos = new Map<number, LinhaRisco[]>();
  for (const l of db
    .prepare(
      `SELECT r.imovel_id, r.tag, r.valor, r.confianca, r.precisa_revisao, r.origem, r.trecho, r.regra, r.revisado_por, r.revisado_em
       FROM risco r JOIN imovel i ON i.id = r.imovel_id WHERE i.status = 'ativo'`,
    )
    .all()) {
    const id = Number(l.imovel_id);
    const linha: LinhaRisco = {
      tag: String(l.tag),
      valor: String(l.valor) as ValorRisco,
      confianca: String(l.confianca) as Confianca,
      precisa_revisao: lerBool(l.precisa_revisao) ?? false,
      origem: String(l.origem),
      trecho: lerTexto(l.trecho),
      regra: String(l.regra),
      revisado_por: lerTexto(l.revisado_por),
      revisado_em: lerTexto(l.revisado_em),
    };
    riscos.set(id, [...(riscos.get(id) ?? []), linha]);
  }

  const imoveis: ImovelExportado[] = [];
  for (const i of carregarImoveis(db, { status: ["ativo"] })) {
    if (i.data_praca) {
      const quando = instanteDe(i.data_praca);
      if (quando !== null && quando < agora.getTime() - UM_DIA) continue;
    }
    const tags: TagExportada[] = consolidarTags(riscos.get(i.id) ?? [])
      .filter((t) => t.valor === "sim")
      .map((t) => {
        const def = definicaoTag(t.tag);
        return {
          slug: t.tag,
          rotulo: def?.rotulo ?? t.tag,
          categoria: def ? CATEGORIAS[def.categoria] : "",
          severidade: def?.severidade ?? "info",
          confianca: t.confianca,
          revisao_pendente: t.revisao_pendente,
          revisada: t.revisada,
          trecho: t.trecho,
          origem: t.origem,
        };
      });
    // Gravado antes da geocodificação (ou sem ela): resolve agora pela cidade.
    const geo = geocodificar({ uf: i.uf, cidade: i.cidade, lat: i.lat, lon: i.lon, precisao_geo: i.precisao_geo });
    imoveis.push({
      id: i.id,
      fonte: i.fonte_id,
      fonte_nome: nomes.get(i.fonte_id) ?? i.fonte_id,
      id_na_fonte: i.id_na_fonte,
      url: i.url,
      titulo: i.titulo,
      tipo: i.tipo,
      uf: i.uf,
      cidade: i.cidade,
      bairro: i.bairro ?? null,
      endereco: i.endereco ?? null,
      cep: i.cep ?? null,
      lat: geo.lat,
      lon: geo.lon,
      precisao_geo: geo.precisao_geo,
      codigo_ibge: geo.codigo_ibge,
      mapa: posicaoNoMapa(geo.lat, geo.lon),
      area_total: i.area_total ?? null,
      area_privativa: i.area_privativa ?? null,
      area_terreno: i.area_terreno ?? null,
      quartos: i.quartos ?? null,
      vagas: i.vagas ?? null,
      descricao: i.descricao ? truncar(i.descricao, 1000) : null,
      modalidade: i.modalidade,
      modalidade_fonte: i.modalidade_fonte ?? null,
      judicial: i.judicial ?? null,
      aceita_financiamento: i.aceita_financiamento ?? null,
      aceita_fgts: i.aceita_fgts ?? null,
      aceita_parcelamento: i.aceita_parcelamento ?? null,
      leiloeiro: i.leiloeiro ?? null,
      comitente: i.comitente ?? null,
      numero_processo: i.numero_processo ?? null,
      matricula: i.matricula ?? null,
      cartorio: i.cartorio ?? null,
      valor_avaliacao: i.valor_avaliacao ?? null,
      preco: i.preco ?? null,
      desconto_pct: i.desconto_pct,
      praca_atual: i.praca_atual ?? null,
      data_praca: i.data_praca,
      pracas: i.pracas,
      fotos: i.fotos.filter((f) => f.ok !== false),
      documentos: i.documentos,
      tags,
      chave_dedup: i.chave_dedup,
      chave_endereco: i.chave_endereco,
      primeira_vez_em: i.primeira_vez_em,
      ultima_vez_em: i.ultima_vez_em,
      atualizado_em: i.atualizado_em,
      gerado_na_fonte_em: i.gerado_na_fonte_em ?? null,
    });
    if (opcoes.limite && imoveis.length >= opcoes.limite) break;
  }
  return { versao: VERSAO_EXPORTACAO, gerado_em: agora.toISOString(), total: imoveis.length, imoveis };
}

/** Grava `conteudo` em `caminho` de forma atômica (arquivo temporário + rename). */
function gravarAtomico(caminho: string, conteudo: string): void {
  mkdirSync(dirname(caminho), { recursive: true });
  const temporario = `${caminho}.${process.pid}.tmp`;
  writeFileSync(temporario, conteudo, "utf8");
  renameSync(temporario, caminho);
}

/** Grava a exportação em `caminho` (padrão base/dados/exportacao/imoveis.json). */
export function exportar(db: Banco, caminho: string = SAIDA_PADRAO, opcoes: OpcoesExportar = {}): Exportacao {
  const dados = montarExportacao(db, opcoes);
  // Compacto: com ~21 mil imóveis o JSON indentado passa de 40 MB.
  gravarAtomico(caminho, JSON.stringify(dados) + "\n");
  return dados;
}

// ---------------------------------------------------------------------------
// Instantâneo para o site
// ---------------------------------------------------------------------------
//
// amostra-site.json: até 60 imóveis no formato `Listing` de src/content/examples.ts, para o site
// mostrar casos reais sem depender do banco. Mesmos nomes de campo do tipo do site (avaliacao,
// lance, desagio, praca, date, seal, desocupado, tags, why, photo, source, point), mais `city`,
// `modalidade`, `dataPraca`, `tagsEmRevisao` e `photoFonte`. Diferenças em relação ao tipo:
// - `praca` é null quando a fonte não diz a praça (Leilão SFI da Caixa sem ficha, lote da
//   Leilões Judiciais com regra "seg_nulo"); o site precisa mostrar "praça não informada";
// - `desagio` é negativo quando o preço passa da avaliação (tag "Preço acima do mercado");
// - `tags` leva só as tags "sim" que não aguardam leitura humana; as que aguardam vão em
//   `tagsEmRevisao` e não devem aparecer como fato;
// - `seal` é sempre 0 (sem selo): os critérios dos selos estão pendentes;
// - `photo` é a URL na fonte (sem download); `photoFonte.origem = "padrao_url"` quer dizer URL
//   montada por padrão conhecido e ainda não verificada. O site a mostra com <img> simples, sem o
//   otimizador do next/image (que baixaria e re-hospedaria a foto): ver base/FASE1-SITE.md.
//
// estatisticas-uf.json: contagens e medianas por UF (e do Brasil) sobre os mesmos imóveis da
// exportação completa (ativos, sem praça vencida).
//
// "Estável": mesma base, mesma saída (fora `gerado_em`). A escolha não é aleatória: segue a
// ordem do id com desempate por hash do id, e o arquivo sai ordenado por UF e id.

export const PASTA_SITE_PADRAO = join(dirname(fileURLToPath(import.meta.url)), "saida");
export const ARQUIVO_AMOSTRA_SITE = "amostra-site.json";
export const ARQUIVO_ESTATISTICAS_UF = "estatisticas-uf.json";
export const TAMANHO_AMOSTRA_SITE = 60;
/** Versão do formato dos dois arquivos do site. Suba quando mudar algo de forma incompatível. */
export const VERSAO_SITE = 1;

export type PracaSite = "1ª praça" | "2ª praça" | "Praça única";
export type TipoSite = "apartamento" | "casa" | "comercial" | "terreno";
export interface TagSite {
  label: string;
  severity: Severidade;
}

/** Um imóvel no formato `Listing` do site (src/content/examples.ts), com os acréscimos descritos acima. */
export interface ListingSite {
  id: string;
  title: string;
  /** "Bairro · Cidade/UF" (ou "Cidade/UF" sem bairro), como nos exemplos do site. */
  place: string;
  uf: string;
  city: string;
  /** [x, y] no viewBox 400×400 do mapa do site (latLonToMap de src/lib/brazil.ts). */
  point: [number, number];
  type: TipoSite;
  /** Valor de avaliação, em reais. */
  avaliacao: number;
  /** Lance mínimo (preço vigente), em reais. */
  lance: number;
  /** Deságio em % inteiro: 100 × (1 − lance/avaliação). Negativo se o lance passa da avaliação. */
  desagio: number;
  praca: PracaSite | null;
  /** Data da praça como no site ("19 out"), em Brasília; "data não informada" sem data. */
  date: string;
  /** Data da praça em ISO (para ordenar), ou null. */
  dataPraca: string | null;
  seal: 0;
  desocupado: boolean;
  tags: TagSite[];
  tagsEmRevisao: TagSite[];
  why: string;
  photo?: string;
  photoFonte?: { origem: string; verificadaEm: string | null };
  modalidade: string;
  source: { leiloeiro: string; url: string; coletadoEm: string };
}

export interface AmostraSite {
  versao: number;
  gerado_em: string;
  /** Como a amostra foi escolhida, em uma frase. */
  criterio: string;
  fontes: FonteExportada[];
  total: number;
  imoveis: ListingSite[];
}

export interface FonteExportada {
  id: string;
  nome: string;
  /** Data de geração declarada pela fonte na última coleta gravada (ou null). */
  gerado_na_fonte_em: string | null;
  /** Início da última coleta gravada. */
  coletado_em: string | null;
}

export interface EstatisticaUf {
  /** Sigla da UF, ou "BR" para o total. */
  uf: string;
  ativos: number;
  porFonte: Record<string, number>;
  porModalidade: Record<string, number>;
  porTipo: Record<string, number>;
  cidades: number;
  maioresCidades: Array<{ cidade: string; ativos: number }>;
  /** Deságio em %: mediana e quartis (1 casa), e quantos têm preço acima da avaliação. */
  desagio: { mediana: number | null; p25: number | null; p75: number | null; acimaDaAvaliacao: number };
  lanceMediano: number | null;
  avaliacaoMediana: number | null;
  /** Ativos com ao menos uma URL de foto (verificada ou não) e com foto verificada (HEAD ok). */
  comFoto: number;
  comFotoVerificada: number;
  /** Ativos com coordenada, e por precisão ("cidade" = sede do município). */
  geocodificados: number;
  porPrecisaoGeo: Record<string, number>;
  porPraca: Record<string, number>;
  /** Tags "sim" sem revisão pendente, por slug; e as que aguardam leitura humana. */
  tags: Record<string, number>;
  tagsEmRevisao: Record<string, number>;
  /** Centro dos pontos dos ativos no mapa do site ([x, y], viewBox 400×400), ou null. */
  centro: [number, number] | null;
}

export interface EstatisticasUf {
  versao: number;
  gerado_em: string;
  fontes: FonteExportada[];
  brasil: EstatisticaUf;
  ufs: EstatisticaUf[];
}

export interface OpcoesExportarSite {
  agora?: Date;
  /** Quantos imóveis na amostra (padrão 60). */
  amostra?: number;
}

const PRACA_SITE: Readonly<Record<number, PracaSite>> = { 0: "Praça única", 1: "1ª praça", 2: "2ª praça" };
const TIPOS_SITE: ReadonlySet<string> = new Set<TipoSite>(["apartamento", "casa", "comercial", "terreno"]);
const ORDEM_SEVERIDADE: Readonly<Record<Severidade, number>> = { grave: 0, atencao: 1, positivo: 2, info: 3 };
const ORDEM_TAG: ReadonlyMap<string, number> = new Map(TAGS.map((t, i) => [t.slug, i]));
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;
/** Nome do portal no cartão do site ("Caso real · Caixa"). O leiloeiro de cada lote fica no banco. */
const PORTAL: Readonly<Record<string, string>> = { caixa_csv: "Caixa", leiloesjudiciais_api: "Leilões Judiciais" };
/** Prefixo do id no site: curto e estável. */
const PREFIXO_ID: Readonly<Record<string, string>> = { caixa_csv: "caixa", leiloesjudiciais_api: "lj" };

export const POR_QUE_SEM_SELO =
  "Sem selo por enquanto: os critérios dos selos ainda estão em definição. As tags são calculadas automaticamente a partir do anúncio; confira sempre o edital.";

/** Dia em Brasília de uma data da base ("AAAA-MM-DD" fica como está). */
function diaBrasilia(data: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
  const t = new Date(data);
  return Number.isNaN(t.getTime()) ? data.slice(0, 10) : hojeBrasilia(t);
}

/** "19 out", como as datas dos cartões do site. */
export function dataCurtaSite(data: string | null): string {
  if (!data) return "data não informada";
  const [, mes, dia] = diaBrasilia(data).split("-").map(Number) as [number, number, number];
  const nomeMes = MESES[mes - 1];
  return nomeMes && dia ? `${dia} ${nomeMes}` : "data não informada";
}

/**
 * Nome da cidade para o site: o nome oficial do IBGE quando ele é só a forma acentuada do que a
 * fonte escreveu ("Maceio" → "Maceió"; o CSV da Caixa não tem acento nas cidades). Distrito ou
 * região administrativa ("Taguatinga", no DF) fica como a fonte escreveu.
 */
function cidadeParaSite(i: ImovelExportado): string {
  const oficial = i.codigo_ibge ? tabelaPadrao().porCodigo(i.codigo_ibge)?.nome : undefined;
  return oficial && chaveNome(oficial) === chaveNome(i.cidade) ? oficial : i.cidade;
}

function ordenarTags(a: TagSite & { slug: string }, b: TagSite & { slug: string }): number {
  return ORDEM_SEVERIDADE[a.severity] - ORDEM_SEVERIDADE[b.severity] || (ORDEM_TAG.get(a.slug) ?? 99) - (ORDEM_TAG.get(b.slug) ?? 99);
}

/**
 * Converte um imóvel exportado para o formato do site. Devolve null quando o site não consegue
 * mostrá-lo: tipo fora dos quatro do site (rural, vaga, outro), sem posição no mapa, sem
 * avaliação ou sem lance.
 */
export function paraListing(i: ImovelExportado): ListingSite | null {
  if (!TIPOS_SITE.has(i.tipo)) return null;
  if (!i.mapa) return null;
  if (i.valor_avaliacao === null || i.valor_avaliacao <= 0 || i.preco === null || i.desconto_pct === null) return null;
  const confirmadas: Array<TagSite & { slug: string }> = [];
  const emRevisao: Array<TagSite & { slug: string }> = [];
  for (const t of i.tags) {
    const tag = { slug: t.slug, label: t.rotulo, severity: t.severidade as Severidade };
    (t.revisao_pendente ? emRevisao : confirmadas).push(tag);
  }
  confirmadas.sort(ordenarTags);
  emRevisao.sort(ordenarTags);
  const foto = [...i.fotos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))[0];
  const cidade = cidadeParaSite(i);
  const listing: ListingSite = {
    id: `${PREFIXO_ID[i.fonte] ?? i.fonte.replace(/_/g, "-")}-${i.id_na_fonte}`,
    title: i.titulo,
    place: `${i.bairro ? `${i.bairro} · ` : ""}${cidade}/${i.uf}`,
    uf: i.uf,
    city: cidade,
    point: i.mapa,
    type: i.tipo as TipoSite,
    avaliacao: i.valor_avaliacao,
    lance: i.preco,
    desagio: Math.round(i.desconto_pct),
    praca: i.praca_atual === null ? null : (PRACA_SITE[i.praca_atual] ?? null),
    date: dataCurtaSite(i.data_praca),
    dataPraca: i.data_praca,
    seal: 0,
    desocupado: confirmadas.some((t) => t.slug === "desocupado"),
    tags: confirmadas.map(({ label, severity }) => ({ label, severity })),
    tagsEmRevisao: emRevisao.map(({ label, severity }) => ({ label, severity })),
    why: POR_QUE_SEM_SELO,
    modalidade: i.modalidade,
    source: {
      leiloeiro: PORTAL[i.fonte] ?? i.fonte_nome,
      url: i.url,
      coletadoEm: diaBrasilia(i.gerado_na_fonte_em ?? i.ultima_vez_em),
    },
  };
  if (foto) {
    listing.photo = foto.url;
    listing.photoFonte = { origem: foto.origem, verificadaEm: foto.verificada_em ?? null };
  }
  return listing;
}

/** Classe de risco para variar a amostra: a pior severidade entre as tags "sim" (confirmadas ou não). */
function classeRisco(l: ListingSite): string {
  const todas = [...l.tags, ...l.tagsEmRevisao];
  if (todas.some((t) => t.severity === "grave")) return "grave";
  if (todas.some((t) => t.severity === "atencao")) return "atencao";
  return "sem-risco";
}

/**
 * Escolhe até `n` imóveis variados, de forma determinística. A cada passo pega o candidato cuja
 * fonte, modalidade, classe de risco, UF e tipo estão menos representados até ali (nessa ordem
 * de prioridade); o desempate é o hash do id, para não pegar sempre os primeiros ids.
 */
export function selecionarAmostra(candidatos: readonly ListingSite[], n: number = TAMANHO_AMOSTRA_SITE): ListingSite[] {
  const fonteDe = (l: ListingSite) => l.source.leiloeiro;
  const eixos: Array<(l: ListingSite) => string> = [fonteDe, (l) => l.modalidade, classeRisco, (l) => l.uf, (l) => l.type];
  const contagens = eixos.map(() => new Map<string, number>());
  const restantes = candidatos.map((l) => ({ l, chaves: eixos.map((f) => f(l)), desempate: hashTexto(l.id) }));
  const escolhidos: ListingSite[] = [];
  while (escolhidos.length < n && restantes.length > 0) {
    let melhor = 0;
    let melhorPeso: number[] | null = null;
    for (let k = 0; k < restantes.length; k++) {
      const r = restantes[k]!;
      const peso = r.chaves.map((c, e) => contagens[e]!.get(c) ?? 0);
      if (melhorPeso === null || compararPesos(peso, melhorPeso, r.desempate, restantes[melhor]!.desempate) < 0) {
        melhor = k;
        melhorPeso = peso;
      }
    }
    const [r] = restantes.splice(melhor, 1);
    if (!r) break;
    r.chaves.forEach((c, e) => contagens[e]!.set(c, (contagens[e]!.get(c) ?? 0) + 1));
    escolhidos.push(r.l);
  }
  return escolhidos.sort((a, b) => a.uf.localeCompare(b.uf) || a.id.localeCompare(b.id));
}

function compararPesos(a: readonly number[], b: readonly number[], desempateA: string, desempateB: string): number {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k]! - b[k]!;
  return desempateA.localeCompare(desempateB);
}

/** Percentil (0 a 1) por interpolação linear, numa lista já ordenada. */
function percentil(ordenados: readonly number[], p: number): number | null {
  if (ordenados.length === 0) return null;
  const pos = (ordenados.length - 1) * p;
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  return ordenados[baixo]! + (ordenados[alto]! - ordenados[baixo]!) * (pos - baixo);
}

const umaCasa = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);
const inteiro = (v: number | null): number | null => (v === null ? null : Math.round(v));

function contarPor<T>(lista: readonly T[], chave: (x: T) => string | null): Record<string, number> {
  const mapa = new Map<string, number>();
  for (const x of lista) {
    const k = chave(x);
    if (k !== null) mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return Object.fromEntries([...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** Estatística de um grupo de imóveis exportados (uma UF, ou o Brasil com uf = "BR"). */
export function estatisticaDe(uf: string, imoveis: readonly ImovelExportado[]): EstatisticaUf {
  const ordenar = (xs: number[]) => xs.sort((a, b) => a - b);
  const desagios = ordenar(imoveis.flatMap((i) => (i.desconto_pct === null ? [] : [i.desconto_pct])));
  const lances = ordenar(imoveis.flatMap((i) => (i.preco === null ? [] : [i.preco])));
  const avaliacoes = ordenar(imoveis.flatMap((i) => (i.valor_avaliacao === null ? [] : [i.valor_avaliacao])));
  const porCidade = contarPor(imoveis, cidadeParaSite);
  const maioresCidades = Object.entries(porCidade)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, 5)
    .map(([cidade, ativos]) => ({ cidade, ativos }));
  const pontos = imoveis.flatMap((i) => (i.mapa ? [i.mapa] : []));
  const centro: [number, number] | null = pontos.length
    ? [umaCasa(pontos.reduce((s, p) => s + p[0], 0) / pontos.length)!, umaCasa(pontos.reduce((s, p) => s + p[1], 0) / pontos.length)!]
    : null;
  const tagsSim = imoveis.flatMap((i) => i.tags);
  return {
    uf,
    ativos: imoveis.length,
    porFonte: contarPor(imoveis, (i) => i.fonte),
    porModalidade: contarPor(imoveis, (i) => i.modalidade),
    porTipo: contarPor(imoveis, (i) => i.tipo),
    cidades: Object.keys(porCidade).length,
    maioresCidades,
    desagio: {
      mediana: umaCasa(percentil(desagios, 0.5)),
      p25: umaCasa(percentil(desagios, 0.25)),
      p75: umaCasa(percentil(desagios, 0.75)),
      acimaDaAvaliacao: imoveis.filter((i) => i.preco !== null && i.valor_avaliacao !== null && i.preco > i.valor_avaliacao).length,
    },
    lanceMediano: inteiro(percentil(lances, 0.5)),
    avaliacaoMediana: inteiro(percentil(avaliacoes, 0.5)),
    comFoto: imoveis.filter((i) => i.fotos.length > 0).length,
    comFotoVerificada: imoveis.filter((i) => i.fotos.some((f) => f.ok === true)).length,
    geocodificados: imoveis.filter((i) => i.lat !== null && i.lon !== null).length,
    porPrecisaoGeo: contarPor(imoveis, (i) => i.precisao_geo ?? "sem"),
    porPraca: contarPor(imoveis, (i) => (i.praca_atual === null ? "não informada" : (PRACA_SITE[i.praca_atual] ?? `${i.praca_atual}ª praça`))),
    tags: contarPor(tagsSim.filter((t) => !t.revisao_pendente), (t) => t.slug),
    tagsEmRevisao: contarPor(tagsSim.filter((t) => t.revisao_pendente), (t) => t.slug),
    centro,
  };
}

/** Fontes com a data da última coleta gravada (sucesso ou parcial). */
function fontesExportadas(db: Banco): FonteExportada[] {
  return db
    .prepare(
      `SELECT f.id, f.nome,
         (SELECT c.gerado_na_fonte_em FROM coleta c WHERE c.fonte_id = f.id AND c.status IN ('sucesso','parcial')
            ORDER BY c.iniciada_em DESC, c.id DESC LIMIT 1) AS gerado,
         (SELECT c.iniciada_em FROM coleta c WHERE c.fonte_id = f.id AND c.status IN ('sucesso','parcial')
            ORDER BY c.iniciada_em DESC, c.id DESC LIMIT 1) AS coletado
       FROM fonte f WHERE f.finalidade = 'vitrine' ORDER BY f.id`,
    )
    .all()
    .map((l) => ({ id: String(l.id), nome: String(l.nome), gerado_na_fonte_em: lerTexto(l.gerado), coletado_em: lerTexto(l.coletado) }));
}

/** Monta a amostra e o agregado por UF (sem gravar). */
export function montarExportacaoSite(db: Banco, opcoes: OpcoesExportarSite = {}): { amostra: AmostraSite; estatisticas: EstatisticasUf } {
  const agora = opcoes.agora ?? new Date();
  const n = opcoes.amostra ?? TAMANHO_AMOSTRA_SITE;
  const { imoveis } = montarExportacao(db, { agora });
  const fontes = fontesExportadas(db);
  // Um anúncio por imóvel: quem divide chave_dedup ou chave_endereco com um anterior fica de fora.
  const vistas = new Set<string>();
  const candidatos = imoveis.flatMap((i) => {
    const l = paraListing(i);
    if (!l) return [];
    const chaves = [i.chave_dedup, i.chave_endereco].filter((c): c is string => c !== null);
    if (chaves.some((c) => vistas.has(c))) return [];
    for (const c of chaves) vistas.add(c);
    return [l];
  });
  const escolhidos = selecionarAmostra(candidatos, n);
  const porUf = new Map<string, ImovelExportado[]>();
  for (const i of imoveis) porUf.set(i.uf, [...(porUf.get(i.uf) ?? []), i]);
  return {
    amostra: {
      versao: VERSAO_SITE,
      gerado_em: agora.toISOString(),
      criterio: `Até ${n} imóveis ativos que o site consegue mostrar (apartamento, casa, comercial ou terreno, com avaliação, lance e posição no mapa), variando fonte, modalidade, risco, UF e tipo; escolha determinística.`,
      fontes,
      total: escolhidos.length,
      imoveis: escolhidos,
    },
    estatisticas: {
      versao: VERSAO_SITE,
      gerado_em: agora.toISOString(),
      fontes,
      brasil: estatisticaDe("BR", imoveis),
      ufs: [...porUf.keys()].sort().map((uf) => estatisticaDe(uf, porUf.get(uf)!)),
    },
  };
}

/** Grava amostra-site.json e estatisticas-uf.json em `pasta` (padrão base/saida). */
export function exportarSite(
  db: Banco,
  pasta: string = PASTA_SITE_PADRAO,
  opcoes: OpcoesExportarSite = {},
): { amostra: AmostraSite; estatisticas: EstatisticasUf; arquivos: string[] } {
  const { amostra, estatisticas } = montarExportacaoSite(db, opcoes);
  const arquivos = [join(pasta, ARQUIVO_AMOSTRA_SITE), join(pasta, ARQUIVO_ESTATISTICAS_UF)];
  // Indentado: são arquivos pequenos, versionados, e o diff precisa ser legível.
  gravarAtomico(arquivos[0]!, JSON.stringify(amostra, null, 2) + "\n");
  gravarAtomico(arquivos[1]!, JSON.stringify(estatisticas, null, 2) + "\n");
  return { amostra, estatisticas, arquivos };
}
