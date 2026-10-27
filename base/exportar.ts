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
 * Para o site (`exportar --site`): o catálogo completo em base/saida/site (todos os imóveis
 * exportáveis no formato de src/lib/catalogo/tipos.ts, em .json.gz; ver "Catálogo completo do site"
 * abaixo), um instantâneo pequeno e estável no formato `Listing` de src/content/examples.ts
 * (base/saida/amostra-site.json, até 60 imóveis variados) e um agregado por UF para estatísticas
 * (base/saida/estatisticas-uf.json). Ver "Instantâneo para o site" abaixo.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { carregarImoveis } from "./consultas.ts";
import { lerBool, lerTexto, type Banco } from "./db.ts";
import { CACHE_PADRAO } from "./fontes/caixa/cache.ts";
import { geocodificar } from "./geo/geocodificar.ts";
import { posicaoNoMapa } from "./geo/mapa.ts";
import { tabelaPadrao } from "./geo/municipios.ts";
import { chaveNome } from "./geo/nomes.ts";
import { PREFIXO_FONTE as PREFIXO_FONTE_LEILOEIRO } from "./leiloeiros/contrato.ts";
import { consolidarTags, type LinhaRisco } from "./riscos/motor.ts";
import { CATEGORIAS, definicaoTag, TAGS, type Severidade } from "./riscos/tags.ts";
import type { Confianca, ImovelGravado, Modalidade, ValorRisco } from "./tipos.ts";
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
  /** Ocupação informada pela fonte em campo próprio ("ocupado" | "desocupado"), ou null. */
  ocupacao: string | null;
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
  const imoveis = montarExportaveis(db, { ...opcoes, agora }).map((p) => p.exportado);
  return { versao: VERSAO_EXPORTACAO, gerado_em: agora.toISOString(), total: imoveis.length, imoveis };
}

/** Um imóvel exportável: como foi gravado (com `extras` e `textos`) e como sai na exportação. */
interface Exportavel {
  gravado: ImovelGravado;
  exportado: ImovelExportado;
}

/**
 * Os imóveis que saem em qualquer exportação: ativos e sem praça vencida há mais de 1 dia. Mesma
 * regra para o JSON completo, a amostra, as estatísticas e o catálogo do site.
 */
function montarExportaveis(db: Banco, opcoes: OpcoesExportar & { agora: Date }): Exportavel[] {
  const agora = opcoes.agora;
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

  const imoveis: Exportavel[] = [];
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
    const exportado: ImovelExportado = {
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
      ocupacao: i.ocupacao ?? null,
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
    };
    imoveis.push({ gravado: i, exportado });
    if (opcoes.limite && imoveis.length >= opcoes.limite) break;
  }
  return imoveis;
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
// - `desagio` é negativo quando o preço passa da avaliação (tag "Lance acima da avaliação", slug preco-acima-mercado);
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
  /**
   * Cache das fichas da Caixa (base/fontes/caixa/cache.ts), só para a data da leitura de cada ficha (o registro
   * "lido em" do site). Padrão: LUNETA_CAIXA_CACHE, senão base/dados/caixa/detalhes.db, se existir; null desliga.
   */
  cacheCaixa?: string | null;
}

const PRACA_SITE: Readonly<Record<number, PracaSite>> = { 0: "Praça única", 1: "1ª praça", 2: "2ª praça" };
const TIPOS_SITE: ReadonlySet<string> = new Set<TipoSite>(["apartamento", "casa", "comercial", "terreno"]);
const ORDEM_SEVERIDADE: Readonly<Record<Severidade, number>> = { grave: 0, atencao: 1, positivo: 2, info: 3 };
const ORDEM_TAG: ReadonlyMap<string, number> = new Map(TAGS.map((t, i) => [t.slug, i]));
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;
/**
 * Nome do portal no cartão do site ("Caso real · Caixa"). O leiloeiro de cada lote fica no banco. As fontes
 * dos leiloeiros (ll_<slug>, base/leiloeiros) não entram aqui: o nome delas já é o do leiloeiro (fonte.nome).
 */
const PORTAL: Readonly<Record<string, string>> = { caixa_csv: "Caixa", leiloesjudiciais_api: "Leilões Judiciais" };
/**
 * Prefixo do id no site: curto e estável. Sem entrada, é o id da fonte com "_" trocado por "-": nos
 * leiloeiros, "ll-<slug>" (o id fica "ll-<slug>-<lote>"; ver base/leiloeiros/contrato.ts).
 */
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
  return montarArquivosSite(db, montarExportaveis(db, { agora }), opcoes.amostra ?? TAMANHO_AMOSTRA_SITE, agora);
}

function montarArquivosSite(db: Banco, exportaveis: readonly Exportavel[], n: number, agora: Date): { amostra: AmostraSite; estatisticas: EstatisticasUf } {
  const imoveis = exportaveis.map((p) => p.exportado);
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

/**
 * Grava, em `pasta` (padrão base/saida), os dois formatos do site: amostra-site.json e
 * estatisticas-uf.json (a /previa antiga) e o catálogo completo em `site/` (lista e detalhes em .json.gz).
 */
export function exportarSite(
  db: Banco,
  pasta: string = PASTA_SITE_PADRAO,
  opcoes: OpcoesExportarSite = {},
): { amostra: AmostraSite; estatisticas: EstatisticasUf; catalogo: ResumoCatalogo; arquivos: string[] } {
  const agora = opcoes.agora ?? new Date();
  const exportaveis = montarExportaveis(db, { agora });
  const { amostra, estatisticas } = montarArquivosSite(db, exportaveis, opcoes.amostra ?? TAMANHO_AMOSTRA_SITE, agora);
  const arquivos = [join(pasta, ARQUIVO_AMOSTRA_SITE), join(pasta, ARQUIVO_ESTATISTICAS_UF)];
  // Indentado: são arquivos pequenos, versionados, e o diff precisa ser legível.
  gravarAtomico(arquivos[0]!, JSON.stringify(amostra, null, 2) + "\n");
  gravarAtomico(arquivos[1]!, JSON.stringify(estatisticas, null, 2) + "\n");
  const catalogo = gravarCatalogo(join(pasta, PASTA_CATALOGO), montarCatalogoDe(db, exportaveis, agora, datasDasFichas(opcoes.cacheCaixa)));
  // `arquivos`: os dois JSON de sempre; os do catálogo estão em `catalogo.arquivos`.
  return { amostra, estatisticas, catalogo, arquivos };
}

// ---------------------------------------------------------------------------
// Catálogo completo do site (base/saida/site)
// ---------------------------------------------------------------------------
//
// O catálogo de imóveis do site (/previa, /api/catalogo, /previa/imovel/[id]) lê todos os imóveis
// exportáveis, no formato de src/lib/catalogo/tipos.ts:
//
//   site/imoveis.json.gz        lista: ImovelResumo de todos (com tags e selo, sem plano aplicado:
//                               quem tira tags e selo no plano Lente é o servidor do site), mais
//                               `endereco` (só para o índice de busca do servidor), e os metadados
//                               (versão, gerado_em, fontes com gerado_na_fonte_em e totais). Em
//                               colunas (`colunas.titulo[k]` é o título do k-ésimo imóvel): 40% menor
//                               que uma lista de objetos depois do gzip;
//   site/detalhes/00..1f.json.gz o resto do ImovelDetalhe (o que não está na lista), repartido em 32
//                               pedaços pelo hash do id (FNV-1a de 32 bits, módulo 32): a página do
//                               imóvel carrega só um pedaço.
//
// O detalhe completo = linha da lista + pedaço do detalhe; as tags do detalhe trazem confiança,
// origem e evidência (trecho já mascarado) e são casadas pelo slug com as da lista. O link
// "Ver endereço no Google Maps" é montado pelo servidor a partir do endereço da lista (não ocupa
// espaço aqui). Tudo gzip nível 9; mesma base, mesmos bytes (fora `gerado_em`).

// Espelho do contrato do site (src/lib/catalogo/tipos.ts). A base é um projeto TypeScript à parte
// (ESM, module nodenext) e não consegue importar aquele arquivo; o site confere cada campo ao carregar
// (src/lib/catalogo/instantaneo.ts) e o teste do site lê os arquivos gerados. Mudou lá, mude aqui.
type TipoCatalogo = "apartamento" | "casa" | "terreno" | "comercial" | "rural" | "outro";
type PracaCatalogo = "1" | "2" | "unica";
type PrecisaoGeo = "exata" | "rua" | "cep" | "bairro" | "cidade";
type Ocupacao = "ocupado" | "desocupado";

export interface TagResumo {
  slug: string;
  rotulo: string;
  severidade: Severidade;
  emRevisao: boolean;
}

export interface TagDetalhe extends TagResumo {
  confianca: Confianca;
  origem: string;
  evidencia: string | null;
}

/** ImovelResumo do site. */
export interface ImovelResumo {
  id: string;
  titulo: string;
  tipo: TipoCatalogo;
  uf: string;
  cidade: string;
  bairro: string | null;
  lat: number | null;
  lon: number | null;
  precisaoGeo: PrecisaoGeo | null;
  area: number | null;
  areaTerreno: number | null;
  quartos: number | null;
  vagas: number | null;
  avaliacao: number | null;
  lance: number;
  desagio: number | null;
  lanceM2: number | null;
  avaliacaoM2: number | null;
  modalidade: Modalidade;
  modalidadeFonte: string | null;
  praca: PracaCatalogo | null;
  dataPraca: string | null;
  financiamento: boolean | null;
  fgts: boolean | null;
  parcelamento: boolean | null;
  ocupacao: Ocupacao | null;
  judicial: boolean | null;
  fonte: { id: string; nome: string };
  foto: string | null;
  totalFotos: number;
  selo: 0 | 1 | 2 | 3;
  seloPendente: boolean;
  tags: TagResumo[];
  coletadoEm: string;
}

export interface LinkImovel {
  tipo: "anuncio" | "edital" | "matricula" | "laudo" | "avaliacao" | "leiloeiro" | "processo" | "mapa" | "outro";
  rotulo: string;
  url: string;
  descricao?: string;
}

export interface PracaDetalhe {
  numero: 0 | 1 | 2 | 3;
  data: string | null;
  valorMinimo: number | null;
}

/** ImovelDetalhe do site. */
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
  links: LinkImovel[];
  condicoesPagamento: string | null;
  geradoNaFonteEm: string | null;
  porQueSelo: string;
}

export const PASTA_CATALOGO = "site";
export const ARQUIVO_CATALOGO_LISTA = "imoveis.json.gz";
export const PASTA_CATALOGO_DETALHES = "detalhes";
export const PARTES_CATALOGO = 32;
/** Versão do formato do catálogo (lista e detalhes). Suba quando mudar algo de forma incompatível. */
export const VERSAO_CATALOGO = 1;

/** Uma linha da lista: o resumo do imóvel e o endereço (para a busca por texto no servidor). */
export interface LinhaCatalogo extends ImovelResumo {
  endereco: string | null;
}

/**
 * Dados de registro lidos da página do imóvel na fonte (na Caixa, a ficha): o site mostra o registro como "lido",
 * com a data. Só vem quando há o que mostrar (imóvel da Caixa com ficha lida); sem ele, o site decide pela
 * matrícula e pelo cartório do detalhe (src/lib/catalogo/instantaneo.ts, registroDe).
 */
export interface RegistroCatalogo {
  matriculas: string[];
  comarca: string | null;
  oficio: string | null;
  inscricaoImobiliaria: string | null;
  /** "Averbado", "Não averbado"... como a fonte escreve */
  averbacaoLeiloesNegativos: string | null;
  /** dia da leitura da ficha (AAAA-MM-DD), quando se sabe */
  lidoEm: string | null;
}

/** O que o detalhe tem além da linha da lista. */
export interface DetalheCatalogo extends Omit<ImovelDetalhe, keyof ImovelResumo | "endereco"> {
  /** Mesma ordem e mesmos slugs das tags da linha. */
  tags: Array<Pick<TagDetalhe, "slug" | "confianca" | "origem" | "evidencia">>;
  registro?: RegistroCatalogo;
}

export interface FonteCatalogo extends FonteExportada {
  /** Imóveis desta fonte no catálogo. */
  total: number;
}

/** Campos de uma linha, na ordem das colunas do arquivo. */
export const CAMPOS_LINHA = [
  "id", "titulo", "tipo", "uf", "cidade", "bairro", "lat", "lon", "precisaoGeo", "area", "areaTerreno", "quartos", "vagas",
  "avaliacao", "lance", "desagio", "lanceM2", "avaliacaoM2", "modalidade", "modalidadeFonte", "praca", "dataPraca",
  "financiamento", "fgts", "parcelamento", "ocupacao", "judicial", "fonte", "foto", "totalFotos", "selo", "seloPendente",
  "tags", "coletadoEm", "endereco",
] as const satisfies readonly (keyof LinhaCatalogo)[];
// Campo novo em LinhaCatalogo sem coluna não compila.
const TODOS_OS_CAMPOS: [Exclude<keyof LinhaCatalogo, (typeof CAMPOS_LINHA)[number]>] extends [never] ? true : never = true;
void TODOS_OS_CAMPOS;

/** Colunas da lista: um array por campo, todos com `total` posições. */
export type ColunasCatalogo = { [K in keyof LinhaCatalogo]: Array<LinhaCatalogo[K]> };

export interface ListaCatalogo {
  formato: "luneta-catalogo";
  versao: number;
  gerado_em: string;
  criterio: string;
  fontes: FonteCatalogo[];
  total: number;
  /** Em quantos pedaços estão os detalhes (arquivos detalhes/00.json.gz em diante). */
  partes: number;
  colunas: ColunasCatalogo;
}

/** Linhas → colunas (o arquivo guarda colunas). */
export function emColunas(linhas: readonly LinhaCatalogo[]): ColunasCatalogo {
  const colunas = {} as Record<string, unknown[]>;
  for (const campo of CAMPOS_LINHA) colunas[campo] = linhas.map((l) => l[campo]);
  return colunas as ColunasCatalogo;
}

/** Colunas → linhas (o contrário de `emColunas`). */
export function deColunas(colunas: ColunasCatalogo, total: number): LinhaCatalogo[] {
  return Array.from({ length: total }, (_, k) => {
    const linha = {} as Record<string, unknown>;
    for (const campo of CAMPOS_LINHA) linha[campo] = colunas[campo][k];
    return linha as unknown as LinhaCatalogo;
  });
}

export interface ParteCatalogo {
  formato: "luneta-catalogo-detalhes";
  versao: number;
  /** Igual ao da lista: pedaço de outra geração é recusado pelo site. */
  gerado_em: string;
  parte: string;
  total: number;
  detalhes: Record<string, DetalheCatalogo>;
}

export interface Catalogo {
  lista: ListaCatalogo;
  partes: ParteCatalogo[];
}

export interface ResumoCatalogo {
  total: number;
  arquivos: string[];
  /** Tamanho em bytes da lista e de todos os pedaços juntos. */
  bytes: { lista: number; detalhes: number };
}

/**
 * Pedaço dos detalhes de um id do site: FNV-1a de 32 bits sobre as unidades UTF-16 do id, módulo
 * `partes`, em 2 dígitos hexadecimais ("00".."1f"). O site repete esta conta em
 * src/lib/catalogo/instantaneo.ts; o teste do site confere que cada id está no pedaço calculado.
 */
export function parteDoId(id: string, partes: number = PARTES_CATALOGO): string {
  let h = 0x811c9dc5;
  for (let k = 0; k < id.length; k++) {
    h ^= id.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % partes).toString(16).padStart(2, "0");
}

const TIPOS_CATALOGO: ReadonlySet<string> = new Set<TipoCatalogo>(["apartamento", "casa", "terreno", "comercial", "rural", "outro"]);
const PRACA_CATALOGO: Readonly<Record<number, PracaCatalogo>> = { 0: "unica", 1: "1", 2: "2" };
const PRECISOES: ReadonlySet<string> = new Set<PrecisaoGeo>(["exata", "rua", "cep", "bairro", "cidade"]);
const ROTULO_DOCUMENTO: Readonly<Record<string, string>> = {
  edital: "Edital",
  matricula: "Matrícula",
  laudo: "Laudo",
  avaliacao: "Avaliação",
  outro: "Documento",
};

/** Só https (o site nunca abre http); http vira https, o resto (javascript:, ftp:...) cai fora. */
function https(url: string | null | undefined): string | null {
  if (!url) return null;
  const limpo = url.trim();
  if (/^https:\/\//i.test(limpo)) return limpo;
  if (/^http:\/\//i.test(limpo)) return `https://${limpo.slice(7)}`;
  return null;
}

const positivo = (v: number | null | undefined): number | null => (v !== null && v !== undefined && Number.isFinite(v) && v > 0 ? v : null);
const semZeroNegativo = (v: number): number => (Object.is(v, -0) ? 0 : v);

/** Abaixo disso, área privativa de casa ou apartamento é erro de digitação da fonte (5,69 m² com total de 71,35 m²). */
const PRIVATIVA_MINIMA_RESIDENCIAL = 15;

/**
 * Área principal (m²), a que o R$/m² usa: a privativa, senão a total, senão a do terreno. Terreno e
 * rural: a do terreno primeiro (é a que o título mostra; a fonte às vezes põe 1 m² na "total" de um
 * terreno de 800 m², ou a área da casa na "privativa" de uma gleba de 21 ha). Casa ou apartamento com
 * privativa abaixo de 15 m² usa a total (vírgula fora do lugar na fonte); o detalhe continua mostrando
 * as três áreas como a fonte publica.
 */
export function areaPrincipal(i: Pick<ImovelExportado, "tipo" | "area_privativa" | "area_total" | "area_terreno">): number | null {
  const privativa = positivo(i.area_privativa);
  const total = positivo(i.area_total);
  const terreno = positivo(i.area_terreno);
  if (i.tipo === "terreno" || i.tipo === "rural") return terreno ?? total ?? privativa;
  const residencial = i.tipo === "apartamento" || i.tipo === "casa";
  const privativaPlausivel = privativa !== null && (!residencial || privativa >= PRIVATIVA_MINIMA_RESIDENCIAL) ? privativa : null;
  return privativaPlausivel ?? total ?? terreno ?? privativa;
}

/** R$/m² inteiro; com centavos abaixo de R$ 10/m² (glebas e áreas rurais), para não virar "R$ 0/m²". */
function porM2(valor: number, area: number): number {
  const x = valor / area;
  return x >= 10 ? Math.round(x) : Math.round(x * 100) / 100;
}

/** "MATRÍCULA 13.941" → "Matrícula 13.941" (títulos todos em maiúsculas viram frase). */
function tituloLegivel(titulo: string): string {
  const t = titulo.replace(/\s+/g, " ").trim();
  if (/\p{Ll}/u.test(t)) return t;
  const minusculo = t.toLocaleLowerCase("pt-BR");
  return minusculo.charAt(0).toLocaleUpperCase("pt-BR") + minusculo.slice(1);
}

function numeroExtra(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Parcelamento oferecido pela fonte, quando ela diz (hoje só a Leilões Judiciais, nos campos
 * nu_parcelas, vl_percentualentrada e indice_correcao): "Entrada de 25% e o restante em até 30
 * parcelas (IPCA)". Pagamento à vista não vira frase: o padrão da fonte (1 parcela, 100% de entrada)
 * não distingue "à vista" de "não informado".
 */
export function condicoesDePagamento(extras: Readonly<Record<string, unknown>>): string | null {
  const parcelas = numeroExtra(extras.nu_parcelas);
  const entrada = numeroExtra(extras.vl_percentualentrada);
  if (parcelas === null || parcelas <= 1 || entrada === null || entrada <= 0 || entrada >= 100) return null;
  const indice = typeof extras.indice_correcao === "string" ? extras.indice_correcao.replace(/\s*\(.*?\)\s*/g, " ").trim() : "";
  const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(entrada);
  return `Entrada de ${pct}% e o restante em até ${Math.round(parcelas)} parcelas${indice ? ` (${indice})` : ""}`;
}

/**
 * Nome do leiloeiro para o site. Os lotes da Leilões Judiciais gravados a partir da fixture têm
 * nomes sintéticos ("Leiloeiro Exemplo Dois"): esses ficam de fora, como na amostra.
 */
function leiloeiroParaSite(nome: string | null): string | null {
  if (!nome || /\bexemplo\b/i.test(nome)) return null;
  return nome;
}

/** Links da página do imóvel (fora o do Google Maps, que o servidor monta pelo endereço). */
function linksDoCatalogo(i: ImovelExportado, extras: Readonly<Record<string, unknown>>): LinkImovel[] {
  const links: LinkImovel[] = [];
  const portal = PORTAL[i.fonte] ?? i.fonte_nome;
  // Fonte de um leiloeiro (base/leiloeiros): o nome é o do leiloeiro, e o anúncio é um lote no site dele.
  const doLeiloeiro = i.fonte.startsWith(PREFIXO_FONTE_LEILOEIRO);
  const anuncio = https(i.url);
  if (anuncio) {
    const lote = i.fonte === "leiloesjudiciais_api" || doLeiloeiro;
    links.push({
      tipo: "anuncio",
      rotulo: doLeiloeiro ? "Ver lote no site do leiloeiro" : `Ver ${lote ? "lote" : "anúncio"} na ${portal}`,
      url: anuncio,
      descricao: doLeiloeiro ? `Página do lote no site de ${portal}` : `Página do ${lote ? "lote" : "imóvel"} no site da ${portal}`,
    });
  }
  const publicadoPor = doLeiloeiro ? "no site do leiloeiro" : `pela ${portal}`;
  for (const d of i.documentos) {
    const url = https(d.url);
    if (!url) continue;
    const tipo = (["edital", "matricula", "laudo", "avaliacao"] as const).find((t) => t === d.tipo) ?? "outro";
    links.push({
      tipo,
      rotulo: d.titulo ? tituloLegivel(d.titulo) : (ROTULO_DOCUMENTO[d.tipo] ?? "Documento"),
      url,
      descricao: /\.pdf(?:$|[?#])/i.test(url) ? `PDF publicado ${publicadoPor}` : `Documento publicado ${publicadoPor}`,
    });
  }
  const site = https(typeof extras.site_leiloeiro === "string" ? extras.site_leiloeiro : null);
  if (site) {
    let host = site;
    try {
      host = new URL(site).hostname.replace(/^www\./, "");
    } catch {
      // URL estranha: mostra como veio
    }
    links.push({ tipo: "leiloeiro", rotulo: "Site do leiloeiro", url: site, descricao: host });
  }
  return links;
}

/**
 * Registro lido da ficha da Caixa: matrículas, comarca, ofício, inscrição imobiliária, averbação dos leilões
 * negativos (extras gravados pelo conector com --detalhes ou por `npm run base:fichas`) e o dia da leitura
 * (`extras.ficha_lida_em`, senão a data guardada no cache das fichas). undefined fora da Caixa ou sem ficha.
 */
export function registroDaFicha(i: Pick<ImovelExportado, "fonte" | "matricula">, extras: Readonly<Record<string, unknown>>, fichaLidaEm: string | null = null): RegistroCatalogo | undefined {
  if (i.fonte !== "caixa_csv") return undefined;
  const texto = (campo: string): string | null => {
    const v = extras[campo];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const lidoEm = texto("ficha_lida_em") ?? fichaLidaEm;
  const comarca = texto("comarca");
  const oficio = texto("oficio");
  const inscricaoImobiliaria = texto("inscricao_imobiliaria");
  const averbacaoLeiloesNegativos = texto("averbacao_leiloes_negativos");
  const matriculas = texto("matriculas")?.split(/\s*[,;]\s*/).filter(Boolean) ?? (i.matricula ? [i.matricula] : []);
  if (!lidoEm && !comarca && !oficio && !inscricaoImobiliaria && !averbacaoLeiloesNegativos && matriculas.length === 0) return undefined;
  // o site recusa o pedaço inteiro com uma data fora de AAAA-MM-DD (instantaneo.ts): melhor sem a data
  const dia = lidoEm && /^\d{4}-\d{2}-\d{2}/.test(lidoEm) ? lidoEm.slice(0, 10) : null;
  return { matriculas, comarca, oficio, inscricaoImobiliaria, averbacaoLeiloesNegativos, lidoEm: dia };
}

/** id13 → dia em que a ficha foi lida, do cache das fichas da Caixa (só leitura; sem cache, vazio). */
export function datasDasFichas(caminho?: string | null): Map<string, string> {
  const alvo = caminho === undefined ? (process.env.LUNETA_CAIXA_CACHE ?? CACHE_PADRAO) : caminho;
  const datas = new Map<string, string>();
  if (!alvo || alvo === "off" || alvo === "0" || !existsSync(alvo)) return datas;
  let cache: DatabaseSync | null = null;
  try {
    cache = new DatabaseSync(alvo, { readOnly: true });
    for (const l of cache.prepare("SELECT id13, ficha_em FROM detalhe WHERE ficha IS NOT NULL AND ficha_em IS NOT NULL").all()) {
      datas.set(String(l.id13), String(l.ficha_em).slice(0, 10));
    }
  } catch (e) {
    console.error(`Aviso: não li as datas das fichas em ${alvo} (${(e as Error).message}); o site mostra o registro sem a data da leitura.`);
  } finally {
    cache?.close();
  }
  return datas;
}

/** Converte um imóvel exportável em linha da lista e detalhe do catálogo; null se o site não consegue mostrá-lo. */
export function paraCatalogo(
  i: ImovelExportado,
  extras: Readonly<Record<string, unknown>> = {},
  fichaLidaEm: string | null = null,
): { linha: LinhaCatalogo; detalhe: DetalheCatalogo } | null {
  const lance = positivo(i.preco);
  if (lance === null) return null;
  const tags = [...i.tags]
    .map((t) => ({ ...t, severity: (t.severidade as Severidade) ?? "info" }))
    .sort((a, b) => ORDEM_SEVERIDADE[a.severity] - ORDEM_SEVERIDADE[b.severity] || (ORDEM_TAG.get(a.slug) ?? 99) - (ORDEM_TAG.get(b.slug) ?? 99));
  const area = areaPrincipal(i);
  const avaliacao = positivo(i.valor_avaliacao);
  const fotos = [...i.fotos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).flatMap((f) => https(f.url) ?? []);
  const linha: LinhaCatalogo = {
    id: `${PREFIXO_ID[i.fonte] ?? i.fonte.replace(/_/g, "-")}-${i.id_na_fonte}`,
    titulo: i.titulo,
    tipo: TIPOS_CATALOGO.has(i.tipo) ? (i.tipo as TipoCatalogo) : "outro",
    uf: i.uf,
    cidade: cidadeParaSite(i),
    bairro: i.bairro,
    lat: i.lat,
    lon: i.lon,
    precisaoGeo: i.precisao_geo && PRECISOES.has(i.precisao_geo) ? (i.precisao_geo as PrecisaoGeo) : null,
    area,
    areaTerreno: positivo(i.area_terreno),
    quartos: positivo(i.quartos),
    vagas: positivo(i.vagas),
    avaliacao,
    lance,
    desagio: avaliacao === null ? null : semZeroNegativo(Math.round(100 * (1 - lance / avaliacao))),
    lanceM2: area === null ? null : porM2(lance, area),
    avaliacaoM2: area === null || avaliacao === null ? null : porM2(avaliacao, area),
    modalidade: i.modalidade as Modalidade,
    modalidadeFonte: i.modalidade_fonte,
    praca: i.praca_atual === null ? null : (PRACA_CATALOGO[i.praca_atual] ?? null),
    // data que não é data fica de fora: o site recusa o arquivo inteiro se uma linha vier inválida
    dataPraca: i.data_praca && !Number.isNaN(Date.parse(i.data_praca)) ? i.data_praca : null,
    financiamento: i.aceita_financiamento,
    fgts: i.aceita_fgts,
    parcelamento: i.aceita_parcelamento,
    ocupacao: i.ocupacao === "ocupado" || i.ocupacao === "desocupado" ? (i.ocupacao satisfies Ocupacao) : null,
    judicial: i.judicial,
    fonte: { id: i.fonte, nome: PORTAL[i.fonte] ?? i.fonte_nome },
    foto: fotos[0] ?? null,
    totalFotos: fotos.length,
    selo: 0,
    seloPendente: true,
    tags: tags.map((t): TagResumo => ({ slug: t.slug, rotulo: t.rotulo, severidade: t.severity, emRevisao: t.revisao_pendente })),
    coletadoEm: diaBrasilia(i.primeira_vez_em),
    endereco: i.endereco,
  };
  const detalhe: DetalheCatalogo = {
    areaTotal: positivo(i.area_total),
    areaPrivativa: positivo(i.area_privativa),
    descricao: i.descricao,
    fotos,
    pracas: i.pracas.map((p): PracaDetalhe => ({ numero: p.numero, data: p.data ?? null, valorMinimo: p.valor_minimo ?? null })),
    matricula: i.matricula,
    cartorio: i.cartorio,
    numeroProcesso: i.numero_processo,
    leiloeiro: leiloeiroParaSite(i.leiloeiro),
    comitente: i.comitente,
    links: linksDoCatalogo(i, extras),
    condicoesPagamento: condicoesDePagamento(extras),
    geradoNaFonteEm: i.gerado_na_fonte_em,
    porQueSelo: POR_QUE_SEM_SELO,
    tags: tags.map((t) => ({ slug: t.slug, confianca: t.confianca, origem: t.origem, evidencia: t.trecho })),
  };
  const registro = registroDaFicha(i, extras, fichaLidaEm);
  if (registro) detalhe.registro = registro;
  return { linha, detalhe };
}

/** Monta a lista e os pedaços do catálogo (sem gravar). */
export function montarCatalogo(db: Banco, opcoes: { agora?: Date; cacheCaixa?: string | null } = {}): Catalogo {
  const agora = opcoes.agora ?? new Date();
  return montarCatalogoDe(db, montarExportaveis(db, { agora }), agora, datasDasFichas(opcoes.cacheCaixa));
}

/** "São Jorge", "Sao Jorge" e "SAO JORGE" → "sao jorge"; "Gebara (Itambi)" e "Gebara Itambi" → "gebara itambi". */
function chaveBairro(bairro: string): string {
  return bairro.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Uma grafia só para o mesmo bairro da mesma cidade. A fonte escreve o mesmo bairro de jeitos
 * diferentes ("Sao Jorge" 28 vezes e "São Jorge" 1 vez; "Cabucu" e "Cabuçu"), o que repetiria o bairro
 * no filtro e dividiria a contagem. Fica a grafia acentuada (a do português), depois a que tem
 * minúsculas, depois a mais usada; no empate, a primeira em ordem alfabética.
 */
export function unificarBairros(linhas: LinhaCatalogo[]): void {
  const grafias = new Map<string, Map<string, number>>();
  const chave = (l: LinhaCatalogo) => `${l.uf}|${l.cidade}|${chaveBairro(l.bairro!)}`;
  for (const l of linhas) {
    if (!l.bairro) continue;
    const k = chave(l);
    const contagem = grafias.get(k) ?? new Map<string, number>();
    contagem.set(l.bairro, (contagem.get(l.bairro) ?? 0) + 1);
    grafias.set(k, contagem);
  }
  const acentos = (s: string) => (s.normalize("NFD").match(/[̀-ͯ]/g) ?? []).length;
  const escolhida = new Map<string, string>();
  for (const [k, contagem] of grafias) {
    if (contagem.size < 2) continue;
    const [melhor] = [...contagem].sort(
      ([a, na], [b, nb]) => acentos(b) - acentos(a) || Number(/\p{Ll}/u.test(b)) - Number(/\p{Ll}/u.test(a)) || nb - na || (a < b ? -1 : a > b ? 1 : 0),
    );
    escolhida.set(k, melhor![0]);
  }
  if (escolhida.size === 0) return;
  for (const l of linhas) if (l.bairro) l.bairro = escolhida.get(chave(l)) ?? l.bairro;
}

function montarCatalogoDe(db: Banco, exportaveis: readonly Exportavel[], agora: Date, fichasLidas: ReadonlyMap<string, string> = new Map()): Catalogo {
  const gerado_em = agora.toISOString();
  const convertidos = exportaveis
    .flatMap(
      (p) =>
        paraCatalogo(
          { ...p.exportado, descricao: p.gravado.descricao ? truncar(p.gravado.descricao, 4000) : null },
          p.gravado.extras,
          p.exportado.fonte === "caixa_csv" ? (fichasLidas.get(p.exportado.id_na_fonte) ?? null) : null,
        ) ?? [],
    )
    .sort((a, b) => (a.linha.id < b.linha.id ? -1 : a.linha.id > b.linha.id ? 1 : 0));
  unificarBairros(convertidos.map((c) => c.linha));
  const porFonte = new Map<string, number>();
  for (const c of convertidos) porFonte.set(c.linha.fonte.id, (porFonte.get(c.linha.fonte.id) ?? 0) + 1);
  const fontes = fontesExportadas(db).map((f) => ({ ...f, nome: PORTAL[f.id] ?? f.nome, total: porFonte.get(f.id) ?? 0 }));
  const detalhes = new Map<string, Record<string, DetalheCatalogo>>();
  for (let k = 0; k < PARTES_CATALOGO; k++) detalhes.set(k.toString(16).padStart(2, "0"), {});
  for (const c of convertidos) detalhes.get(parteDoId(c.linha.id))![c.linha.id] = c.detalhe;
  return {
    lista: {
      formato: "luneta-catalogo",
      versao: VERSAO_CATALOGO,
      gerado_em,
      criterio: "Todos os imóveis ativos da base, sem praça vencida há mais de 1 dia e com lance informado.",
      fontes,
      total: convertidos.length,
      partes: PARTES_CATALOGO,
      colunas: emColunas(convertidos.map((c) => c.linha)),
    },
    partes: [...detalhes].map(([parte, d]) => ({
      formato: "luneta-catalogo-detalhes",
      versao: VERSAO_CATALOGO,
      gerado_em,
      parte,
      total: Object.keys(d).length,
      detalhes: d,
    })),
  };
}

function gravarGzipAtomico(caminho: string, valor: unknown): number {
  mkdirSync(dirname(caminho), { recursive: true });
  // mtime zerado no cabeçalho do gzip (padrão do zlib): mesmo conteúdo, mesmos bytes.
  const dados = gzipSync(Buffer.from(JSON.stringify(valor), "utf8"), { level: 9 });
  const temporario = `${caminho}.${process.pid}.tmp`;
  writeFileSync(temporario, dados);
  renameSync(temporario, caminho);
  return dados.length;
}

/** Grava o catálogo em `pasta` (padrão base/saida/site), tirando pedaços de uma geração anterior que sobrarem. */
export function gravarCatalogo(pasta: string, catalogo: Catalogo): ResumoCatalogo {
  const pastaDetalhes = join(pasta, PASTA_CATALOGO_DETALHES);
  const arquivos: string[] = [];
  let bytesDetalhes = 0;
  const esperados = new Set<string>();
  for (const p of catalogo.partes) {
    const nome = `${p.parte}.json.gz`;
    esperados.add(nome);
    const caminho = join(pastaDetalhes, nome);
    bytesDetalhes += gravarGzipAtomico(caminho, p);
    arquivos.push(caminho);
  }
  for (const nome of existsSync(pastaDetalhes) ? readdirSync(pastaDetalhes) : []) {
    if (nome.endsWith(".json.gz") && !esperados.has(nome)) rmSync(join(pastaDetalhes, nome));
  }
  // A lista por último: quem lê a lista já encontra os pedaços da mesma geração.
  const caminhoLista = join(pasta, ARQUIVO_CATALOGO_LISTA);
  const bytesLista = gravarGzipAtomico(caminhoLista, catalogo.lista);
  arquivos.unshift(caminhoLista);
  return { total: catalogo.lista.total, arquivos, bytes: { lista: bytesLista, detalhes: bytesDetalhes } };
}
