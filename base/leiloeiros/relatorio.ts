/**
 * Relatório por leiloeiro (formato em relatorio-leiloeiros.schema.json): quantos imóveis temos de cada
 * leiloeiro no site, divididos por UF, tipo, modalidade e natureza, a qualidade dos dados (% com foto,
 * edital, avaliação, área, endereço com número e praça com data) e a saúde do coletor.
 *
 *   npm run leiloeiros:relatorio                        da base (base/dados/luneta.db ou --banco / LUNETA_DB)
 *   npm run leiloeiros:relatorio -- --site              e grava em base/saida/site/relatorio-leiloeiros.json
 *   npm run leiloeiros:relatorio -- --arquivo saida.jsonl   de um JSONL dos coletores, antes de importar
 *
 * Sem --site, grava em base/dados/leiloeiros/relatorio-leiloeiros.json (fora do Git) ou em --saida.
 *
 * "Ativo" é o que o site mostra (mesma regra de base/exportar.ts): situação ativa, lance maior que zero e
 * praça que não venceu há mais de 1 dia. Na base, a saúde vem do log das coletas (e do que o coletor
 * declarou na linha de coleta, guardado nos avisos), e a frequência é a declarada ou, sem ela, a medida
 * pelos intervalos entre as importações. Também lista as outras fontes (Caixa, Leilões Judiciais), com os
 * leiloeiros citados nos lotes dos agregadores, para o site somar "leilões por leiloeiro".
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { carregarImoveis } from "../consultas.ts";
import { abrirBanco, CAMINHO_PADRAO, lerNumero, lerTexto, type Banco } from "../db.ts";
import { mesmoImovel, type ChavesImovel } from "../dedup/index.ts";
import { PASTA_CATALOGO, PASTA_SITE_PADRAO } from "../exportar.ts";
import { hojeBrasilia, instanteDe } from "../util/data.ts";
import {
  FREQUENCIAS,
  fonteDoSlug,
  lerColetaDeclarada,
  PREFIXO_FONTE,
  PREFIXO_SITE,
  saudeDoErro,
  slugDaFonte,
  type Frequencia,
  type Saude,
} from "./contrato.ts";
import { carregarEsquema, validarEsquema } from "./esquema.ts";
import { agregar, medidaDoGravado, type Agregado } from "./medidas.ts";
import { maisFrequente, validarJsonl } from "./validar.ts";

export const ARQUIVO_RELATORIO = "relatorio-leiloeiros.json";
export const VERSAO_RELATORIO = 1;
export const SAIDA_PADRAO_RELATORIO = join(dirname(fileURLToPath(import.meta.url)), "..", "dados", "leiloeiros", ARQUIVO_RELATORIO);

const UM_DIA = 24 * 3600 * 1000;
const CRITERIO =
  "Ativo = aparece no site: situação ativa na fonte, lance mínimo maior que zero e praça que não venceu há mais de 1 dia. Divisões e qualidade contam só os ativos.";

export type SaudeRelatorio = Saude | "desconhecida";
export type FrequenciaRelatorio = Frequencia | "irregular" | "desconhecida";

export interface ColetaRelatorio {
  ultima_em: string | null;
  ultima_valida_em: string | null;
  gerado_na_fonte_em: string | null;
  completa: boolean | null;
  saude: SaudeRelatorio;
  frequencia: FrequenciaRelatorio;
  dias_sem_coleta_valida: number | null;
  erro: string | null;
}

export interface LeiloeiroRelatorio extends Omit<Agregado, "situacao"> {
  slug: string;
  nome: string;
  site: string | null;
  plataforma: string | null;
  fonte_id: string;
  prefixo_id_site: string;
  situacao: Omit<Agregado["situacao"], "removidos"> & { removidos: number | null };
  repetidos_caixa: number | null;
  coleta: ColetaRelatorio;
}

export interface OutraFonte {
  fonte_id: string;
  nome: string;
  ativos: number;
  leiloeiros_citados: number;
  principais_leiloeiros: Array<{ nome: string; ativos: number }>;
}

export interface RelatorioLeiloeiros {
  formato: "luneta-relatorio-leiloeiros";
  versao: number;
  gerado_em: string;
  origem: "base" | "jsonl";
  criterio: string;
  totais: {
    leiloeiros: number;
    leiloeiros_com_ativos: number;
    ativos: number;
    leiloes_ativos: number;
    ativos_todas_as_fontes: number;
    por_saude: Record<string, number>;
  };
  leiloeiros: LeiloeiroRelatorio[];
  outras_fontes: OutraFonte[];
}

/** ISO UTC de uma data da base (ou null). */
function iso(data: string | null | undefined): string | null {
  if (!data) return null;
  const t = instanteDe(data);
  return t === null ? null : new Date(t).toISOString();
}

function diasDesde(data: string | null, agora: Date): number | null {
  const t = data ? instanteDe(data) : null;
  return t === null ? null : Math.max(0, Math.floor((agora.getTime() - t) / UM_DIA));
}

/** Frequência pelos intervalos entre importações válidas (mediana dos últimos 90 dias). */
export function frequenciaMedida(datas: readonly string[], agora: Date): FrequenciaRelatorio {
  const instantes = datas
    .map((d) => instanteDe(d))
    .filter((t): t is number => t !== null && t >= agora.getTime() - 90 * UM_DIA)
    .sort((a, b) => a - b);
  if (instantes.length < 3) return "desconhecida";
  const intervalos = instantes.slice(1).map((t, k) => (t - instantes[k]!) / UM_DIA).sort((a, b) => a - b);
  const mediana = intervalos[Math.floor(intervalos.length / 2)]!;
  if (mediana <= 1.5) return "diaria";
  if (mediana <= 8) return "semanal";
  if (mediana <= 16) return "quinzenal";
  if (mediana <= 35) return "mensal";
  return "irregular";
}

function ordenarLeiloeiros(lista: LeiloeiroRelatorio[]): LeiloeiroRelatorio[] {
  return lista.sort((a, b) => b.ativos - a.ativos || a.nome.localeCompare(b.nome, "pt-BR") || a.slug.localeCompare(b.slug));
}

function montar(origem: "base" | "jsonl", agora: Date, leiloeiros: LeiloeiroRelatorio[], outras: OutraFonte[]): RelatorioLeiloeiros {
  const porSaude: Record<string, number> = {};
  for (const l of leiloeiros) porSaude[l.coleta.saude] = (porSaude[l.coleta.saude] ?? 0) + 1;
  const ativos = leiloeiros.reduce((s, l) => s + l.ativos, 0);
  return {
    formato: "luneta-relatorio-leiloeiros",
    versao: VERSAO_RELATORIO,
    gerado_em: agora.toISOString(),
    origem,
    criterio: CRITERIO,
    totais: {
      leiloeiros: leiloeiros.length,
      leiloeiros_com_ativos: leiloeiros.filter((l) => l.ativos > 0).length,
      ativos,
      leiloes_ativos: leiloeiros.reduce((s, l) => s + (l.leiloes_ativos ?? 0), 0),
      ativos_todas_as_fontes: ativos + outras.reduce((s, f) => s + f.ativos, 0),
      por_saude: Object.fromEntries(Object.entries(porSaude).sort(([a], [b]) => a.localeCompare(b))),
    },
    leiloeiros: ordenarLeiloeiros(leiloeiros),
    outras_fontes: outras.sort((a, b) => b.ativos - a.ativos || a.fonte_id.localeCompare(b.fonte_id)),
  };
}

// ---------------------------------------------------------------------------
// Da base
// ---------------------------------------------------------------------------

interface LinhaColetaBanco {
  iniciada_em: string;
  status: string;
  completa: boolean;
  gerado: string | null;
  erro: string | null;
  avisos: string[];
}

function coletasDa(db: Banco, fonteId: string): LinhaColetaBanco[] {
  return db
    .prepare(`SELECT iniciada_em, status, completa, gerado_na_fonte_em, erro, avisos FROM coleta WHERE fonte_id = ? ORDER BY iniciada_em DESC, id DESC`)
    .all(fonteId)
    .map((l) => {
      let avisos: string[] = [];
      try {
        const lidos = JSON.parse(lerTexto(l.avisos) ?? "[]") as unknown;
        if (Array.isArray(lidos)) avisos = lidos.filter((a): a is string => typeof a === "string");
      } catch {
        // avisos ilegíveis: segue sem eles
      }
      return {
        iniciada_em: String(l.iniciada_em),
        status: String(l.status),
        completa: lerNumero(l.completa) === 1,
        gerado: lerTexto(l.gerado_na_fonte_em),
        erro: lerTexto(l.erro),
        avisos,
      };
    });
}

/**
 * Saúde e agenda de um leiloeiro pelo log das coletas da fonte dele (a mais recente primeiro). Uma
 * tentativa com dados mais velhos que a última importação gravada (alguém importou um arquivo antigo de
 * novo) não conta como saúde do coletor.
 */
export function coletaDaBase(linhas: readonly LinhaColetaBanco[], agora: Date): ColetaRelatorio {
  const validas = linhas.filter((c) => c.status === "sucesso" || c.status === "parcial");
  const valida = validas[0];
  const tValida = valida ? instanteDe(valida.gerado ?? valida.iniciada_em) : null;
  const ultima = linhas.find((c) => {
    const t = c.gerado ? instanteDe(c.gerado) : null;
    return c === valida || tValida === null || t === null || t >= tValida;
  });
  const declarada = valida ? valida.avisos.map(lerColetaDeclarada).find((d) => d !== null) ?? null : null;
  let saude: SaudeRelatorio = "desconhecida";
  if (ultima && (ultima.status === "erro" || ultima.status === "invalida")) saude = saudeDoErro(ultima.erro) ?? "quebrado";
  else if (ultima?.status === "parcial") saude = "parcial";
  else if (ultima?.status === "sucesso") saude = declarada?.saude ?? (ultima.completa ? "ok" : "parcial");
  const datasValidas = validas.map((c) => c.gerado ?? c.iniciada_em);
  return {
    ultima_em: iso(ultima?.iniciada_em),
    ultima_valida_em: iso(valida?.iniciada_em),
    gerado_na_fonte_em: iso(valida?.gerado),
    completa: valida ? valida.completa : null,
    saude,
    frequencia: declarada?.frequencia ?? frequenciaMedida(datasValidas, agora),
    dias_sem_coleta_valida: diasDesde(valida?.gerado ?? valida?.iniciada_em ?? null, agora),
    erro: ultima && (ultima.status === "erro" || ultima.status === "invalida") ? ultima.erro : null,
  };
}

/** O imóvel ativo está no site? (pelas colunas de `imovel`, sem carregar praças e fotos) */
function noArPelaLinha(preco: number | null, dataPraca: string | null, agora: Date): boolean {
  if (preco === null || preco <= 0) return false;
  const t = dataPraca ? instanteDe(dataPraca) : null;
  return t === null || t >= agora.getTime() - UM_DIA;
}

/** Relatório a partir da base. */
export function relatorioDaBase(db: Banco, opcoes: { agora?: Date } = {}): RelatorioLeiloeiros {
  const agora = opcoes.agora ?? new Date();
  const fontes = db.prepare("SELECT id, nome, url FROM fonte WHERE finalidade = 'vitrine' ORDER BY id").all();

  // Ativos da Caixa por chave, para contar os repetidos.
  const caixaPorDedup = new Set<string>();
  const caixaPorEndereco = new Map<string, ChavesImovel[]>();
  for (const l of db.prepare("SELECT chave_dedup, chave_endereco FROM imovel WHERE fonte_id = 'caixa_csv' AND status = 'ativo'").all()) {
    const chaves: ChavesImovel = { chave_dedup: lerTexto(l.chave_dedup), chave_endereco: lerTexto(l.chave_endereco) };
    if (chaves.chave_dedup) caixaPorDedup.add(chaves.chave_dedup);
    if (chaves.chave_endereco) caixaPorEndereco.set(chaves.chave_endereco, [...(caixaPorEndereco.get(chaves.chave_endereco) ?? []), chaves]);
  }
  const naCaixa = (c: ChavesImovel): boolean =>
    (c.chave_dedup !== null && caixaPorDedup.has(c.chave_dedup)) ||
    (c.chave_endereco !== null && (caixaPorEndereco.get(c.chave_endereco) ?? []).some((b) => mesmoImovel(c, b)));

  const leiloeiros: LeiloeiroRelatorio[] = [];
  const outras: OutraFonte[] = [];
  for (const f of fontes) {
    const id = String(f.id);
    const slug = slugDaFonte(id);
    if (slug) {
      const imoveis = carregarImoveis(db, { fonteId: id });
      const medidas = imoveis.map((i) => medidaDoGravado(i, agora));
      const ag = agregar(medidas);
      const noAr = imoveis.filter((_, k) => medidas[k]!.noAr);
      leiloeiros.push({
        slug,
        nome: String(f.nome),
        site: lerTexto(f.url),
        plataforma: maisFrequente(imoveis.map((i) => (typeof i.extras?.plataforma === "string" ? i.extras.plataforma : null))),
        fonte_id: id,
        prefixo_id_site: `${PREFIXO_SITE}${slug}`,
        ...ag,
        repetidos_caixa: noAr.filter((i) => naCaixa(i)).length,
        coleta: coletaDaBase(coletasDa(db, id), agora),
      });
      continue;
    }
    if (id.startsWith(PREFIXO_FONTE)) continue; // id fora do padrão de leiloeiro: não é desta base
    const citados = new Map<string, number>();
    let ativos = 0;
    for (const l of db.prepare("SELECT leiloeiro, preco, data_praca FROM imovel WHERE fonte_id = ? AND status = 'ativo'").all(id)) {
      if (!noArPelaLinha(lerNumero(l.preco), lerTexto(l.data_praca), agora)) continue;
      ativos++;
      const nome = lerTexto(l.leiloeiro);
      if (nome && !/\bexemplo\b/i.test(nome)) citados.set(nome, (citados.get(nome) ?? 0) + 1);
    }
    outras.push({
      fonte_id: id,
      nome: String(f.nome),
      ativos,
      leiloeiros_citados: citados.size,
      principais_leiloeiros: [...citados]
        .sort(([a, x], [b, y]) => y - x || a.localeCompare(b, "pt-BR"))
        .slice(0, 10)
        .map(([nome, n]) => ({ nome, ativos: n })),
    });
  }
  return montar("base", agora, leiloeiros, outras);
}

// ---------------------------------------------------------------------------
// Do JSONL
// ---------------------------------------------------------------------------

/** Relatório a partir de um JSONL dos coletores (só os lotes sem erro; sem repetidos da Caixa). */
export function relatorioDoJsonl(texto: string, opcoes: { agora?: Date } = {}): RelatorioLeiloeiros {
  const agora = opcoes.agora ?? new Date();
  const r = validarJsonl(texto, { agora, tabela: null });
  const leiloeiros: LeiloeiroRelatorio[] = r.leiloeiros.map((l) => {
    const c = l.coleta;
    const valida = c !== null && (c.saude === "ok" || c.saude === "parcial");
    return {
      slug: l.slug,
      nome: l.nome ?? l.slug,
      site: l.site,
      plataforma: l.plataforma,
      fonte_id: fonteDoSlug(l.slug),
      prefixo_id_site: `${PREFIXO_SITE}${l.slug}`,
      ...l.agregado,
      situacao: { ...l.agregado.situacao, removidos: null },
      repetidos_caixa: null,
      coleta: {
        ultima_em: iso(c?.coletado_em),
        ultima_valida_em: valida ? iso(c.coletado_em) : null,
        gerado_na_fonte_em: iso(c?.coletado_em),
        completa: c ? c.completa : null,
        saude: c?.saude ?? "desconhecida",
        frequencia: c?.frequencia && (FREQUENCIAS as readonly string[]).includes(c.frequencia) ? c.frequencia : "desconhecida",
        dias_sem_coleta_valida: valida ? diasDesde(c.coletado_em, agora) : null,
        erro: c?.erro ?? null,
      },
    };
  });
  return montar("jsonl", agora, leiloeiros, []);
}

// ---------------------------------------------------------------------------
// Gravação e saída
// ---------------------------------------------------------------------------

/** Confere o relatório contra o esquema (lança erro: seria defeito deste arquivo). */
export function conferirRelatorio(r: RelatorioLeiloeiros): void {
  const erros = validarEsquema(r, carregarEsquema("relatorio-leiloeiros"));
  if (erros.length > 0) throw new Error(`relatório fora do esquema: ${erros.slice(0, 5).map((e) => `${e.caminho}: ${e.mensagem}`).join("; ")}`);
}

export function gravarRelatorio(caminho: string, r: RelatorioLeiloeiros): void {
  conferirRelatorio(r);
  mkdirSync(dirname(caminho), { recursive: true });
  const temporario = `${caminho}.${process.pid}.tmp`;
  writeFileSync(temporario, JSON.stringify(r, null, 2) + "\n", "utf8");
  renameSync(temporario, caminho);
}

/** Tabela legível para o terminal. */
export function formatarRelatorio(r: RelatorioLeiloeiros): string {
  const t = r.totais;
  const linhas = [
    `Relatório por leiloeiro (${r.origem === "base" ? "da base" : "do JSONL"}), gerado em ${r.gerado_em}`,
    `${t.leiloeiros} leiloeiro(s) com coletor, ${t.leiloeiros_com_ativos} com imóveis no site; ${t.ativos} ativo(s) dos leiloeiros em ${t.leiloes_ativos} leilão(ões), ${t.ativos_todas_as_fontes} somando as outras fontes`,
    `Saúde dos coletores: ${Object.entries(t.por_saude).map(([s, n]) => `${s} ${n}`).join(", ") || "nenhum"}`,
    "",
  ];
  for (const l of r.leiloeiros) {
    const c = l.coleta;
    const ufs = Object.entries(l.por_uf).slice(0, 5).map(([uf, n]) => `${uf} ${n}`).join(", ");
    linhas.push(
      `${String(l.ativos).padStart(6)}  ${l.nome} (${l.slug})${l.leiloes_ativos !== null ? ` · ${l.leiloes_ativos} leilão(ões)` : ""}${l.plataforma ? ` · ${l.plataforma}` : ""} · saúde ${c.saude} · ${c.frequencia}`
        + `${c.gerado_na_fonte_em ? ` · lido em ${hojeBrasilia(new Date(c.gerado_na_fonte_em))}` : ""}${ufs ? ` · ${ufs}` : ""}`
        + `${l.repetidos_caixa ? ` · ${l.repetidos_caixa} também na Caixa` : ""}${c.erro ? ` · erro: ${c.erro}` : ""}`,
    );
  }
  if (r.outras_fontes.length > 0) {
    linhas.push("", "Outras fontes:");
    for (const f of r.outras_fontes) {
      linhas.push(`${String(f.ativos).padStart(6)}  ${f.nome} (${f.fonte_id})${f.leiloeiros_citados ? ` · ${f.leiloeiros_citados} leiloeiro(s) citados nos lotes` : ""}`);
    }
  }
  return linhas.join("\n");
}

const AJUDA = `Relatório por leiloeiro (base/leiloeiros/relatorio-leiloeiros.schema.json).

Uso: npm run leiloeiros:relatorio -- [--site [--pasta base/saida]] [--saida arquivo.json] [--banco base/dados/luneta.db]
     npm run leiloeiros:relatorio -- --arquivo saida.jsonl     (de um JSONL, antes de importar)

  --site      grava em base/saida/site/${ARQUIVO_RELATORIO} (o instantâneo do site)
  --saida     outro arquivo de saída (padrão base/dados/leiloeiros/${ARQUIVO_RELATORIO})
  --json      mostra o JSON no terminal em vez da tabela
  --agora ISO data de referência (padrão: agora)`;

export function principal(argv: readonly string[], saida: (t: string) => void = (t) => process.stdout.write(t + "\n"), erro: (t: string) => void = (t) => process.stderr.write(t + "\n")): number {
  let v: { arquivo?: string; banco?: string; site?: boolean; pasta?: string; saida?: string; json?: boolean; agora?: string; ajuda?: boolean };
  try {
    v = parseArgs({
      args: [...argv],
      strict: true,
      options: {
        arquivo: { type: "string" },
        banco: { type: "string" },
        site: { type: "boolean" },
        pasta: { type: "string" },
        saida: { type: "string" },
        json: { type: "boolean" },
        agora: { type: "string" },
        ajuda: { type: "boolean", short: "h" },
      },
    }).values;
  } catch (e) {
    erro(`${(e as Error).message}\n\n${AJUDA}`);
    return 2;
  }
  if (v.ajuda) {
    saida(AJUDA);
    return 0;
  }
  const agora = v.agora ? new Date(v.agora) : new Date();
  if (Number.isNaN(agora.getTime())) {
    erro(`--agora inválido: ${v.agora}`);
    return 2;
  }
  let relatorio: RelatorioLeiloeiros;
  if (v.arquivo) {
    const caminho = resolve(v.arquivo);
    if (!existsSync(caminho)) {
      erro(`Arquivo não encontrado: ${caminho}`);
      return 2;
    }
    relatorio = relatorioDoJsonl(readFileSync(caminho, "utf8"), { agora });
  } else {
    const caminhoBanco = v.banco ? resolve(v.banco) : process.env.LUNETA_DB || CAMINHO_PADRAO;
    if (!existsSync(caminhoBanco)) {
      erro(`Banco não encontrado: ${caminhoBanco}. Rode npm run base:migrar e importe os leiloeiros (base:coletar -- leiloeiros --arquivo ...), ou use --arquivo.`);
      return 2;
    }
    const db = abrirBanco(caminhoBanco);
    try {
      relatorio = relatorioDaBase(db, { agora });
    } finally {
      db.close();
    }
  }
  const destino = v.site ? join(v.pasta ? resolve(v.pasta) : PASTA_SITE_PADRAO, PASTA_CATALOGO, ARQUIVO_RELATORIO) : v.saida ? resolve(v.saida) : SAIDA_PADRAO_RELATORIO;
  gravarRelatorio(destino, relatorio);
  saida(v.json ? JSON.stringify(relatorio, null, 2) : `${formatarRelatorio(relatorio)}\n\nGravado em ${destino}`);
  return 0;
}

const executadoDireto = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executadoDireto) {
  try {
    process.exitCode = principal(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`Erro: ${(e as Error)?.stack ?? String(e)}\n`);
    process.exitCode = 1;
  }
}
