/**
 * Atualização diária do site no PC do dono: `node base/atualizar-site.mjs` (guia para leigo: base/ATUALIZAR-SITE.md).
 *
 * O banco (`base/dados/luneta.db`) mora no PC. Este comando faz a parte leve, todo dia:
 *   banco        restaura o banco da cópia (branch backup-luneta-db do repositório privado luneta-base) se ele não
 *                existir, e roda `migrar`;
 *   caixa        `coletar caixa` (lista geral; abre do Brasil). Falhou: segue com o que o banco tem e avisa;
 *   leiloeiros   o JSONL do PBCV (coletas-pc/leiloeiros/pbcv-luneta.jsonl ou, sem ele, o último publicado em
 *                coletas-dados/pc/leiloeiros/pbcv-luneta.jsonl.gz): validador antes; recusado, não importa;
 *   fichas       `base:fichas` com coletas-pc/fichas/fichas.json, se houver;
 *   riscos       `base:riscos`;
 *   localizacao  o último geocode do Actions (coletas-dados/localizacao/<execução>/geocode.json), se for mais novo que
 *                o aplicado no banco, e os localizacao*.json.gz mais novos que os do site;
 *   exportar     `exportar --site` e `leiloeiros:relatorio --site` numa pasta de trabalho (coletas-pc/atualizar-site/);
 *                antes de publicar, a TRAVA: o total não pode cair mais de 30% e nenhuma fonte com mais de 1.000
 *                imóveis pode zerar (--forcar passa por cima);
 *   publicar     copia o instantâneo para base/saida/site/ e faz commit SÓ dessa pasta no main, com envio (3
 *                tentativas, com pull --rebase);
 *   copia        uma vez por semana (ou --backup): banco + base/dados/caixa comprimidos, num commit único e órfão no
 *                branch backup-luneta-db do luneta-base (push forçado só desse branch). Falhou: só avisa.
 * A parte pesada (geocode e nota de localização) roda no GitHub Actions toda semana (base-localizacao.yml).
 *
 *   node base/atualizar-site.mjs                      # tudo
 *   node base/atualizar-site.mjs --sem-publicar       # faz tudo menos o envio (nada vai ao GitHub; o site do PC fica igual)
 *   node base/atualizar-site.mjs --etapas leiloeiros,riscos,exportar,publicar
 *   node base/atualizar-site.mjs --banco outro.db     # outro banco (teste)
 *   node base/atualizar-site.mjs --forcar             # publica mesmo se a trava recusar
 *   node base/atualizar-site.mjs --backup             # faz a cópia do banco hoje, mesmo sem ter passado uma semana
 *
 * Tela e `coletas-pc/atualizar-site.log` (sem as pastas do PC); no fim, `coletas-pc/atualizar-site.json`.
 * Saída: 0 ok (avisos possíveis), 1 falha, 2 opção errada, 4 outra atualização rodando, 6 trava, 130 Ctrl+C.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  closeSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import {
  criarRegistro,
  diagnosticarPush,
  mascararUrl,
  motivoJsonInvalido,
  motivoJsonlInvalido,
  pegarTrava,
  quando,
  rodarGit,
  travaDeOutro,
  versaoAtende,
  type Registro,
  type ResultadoComando,
  type RodarGit,
} from "./coleta-pc.ts";
import { ARQUIVO_CATALOGO_LISTA, PASTA_CATALOGO, PASTA_CATALOGO_DETALHES } from "./exportar.ts";
import { ARQUIVO_RELATORIO } from "./leiloeiros/relatorio.ts";
import { extrairTarGz, gravarTarGz, type EntradaTar } from "./util/tar.ts";

export const ETAPAS = ["banco", "caixa", "leiloeiros", "fichas", "riscos", "localizacao", "exportar", "publicar", "copia"] as const;
export type Etapa = (typeof ETAPAS)[number];
export const COMANDO = "node base/atualizar-site.mjs";
/** node:sqlite sem opção experimental. */
export const NODE_MINIMO_SITE: readonly [number, number] = [22, 13];
export const BRANCH_DADOS = "coletas-dados";
export const BRANCH_SITE = "main";
export const URL_COPIA_PADRAO = "https://github.com/joaopedrogv13/luneta-base.git";
export const BRANCH_COPIA = "backup-luneta-db";
export const NOME_COPIA = "luneta-dados.tar.gz";
/** O GitHub recusa arquivo acima de 100 MB: a cópia vai em partes deste tamanho quando passa dele. */
export const LIMITE_PARTE_COPIA = 90 * 1024 * 1024;
export const DIAS_ENTRE_COPIAS = 7;
export const ARQUIVO_LEILOEIROS = "pbcv-luneta.jsonl";
export const CAMINHO_LEILOEIROS_PUBLICADO = `pc/leiloeiros/${ARQUIVO_LEILOEIROS}.gz`;
export const ARQUIVO_GEOCODE = "geocode.json";
export const ARQUIVOS_LOCALIZACAO = ["localizacao.json.gz", "localizacao-osm.json.gz", "localizacao-cidades.json.gz"] as const;
/** A trava: queda máxima do total contra o instantâneo anterior, e o tamanho de fonte que não pode zerar. */
export const QUEDA_MAXIMA = 0.3;
export const FONTE_GRANDE = 1000;
export const PREFIXO_LEILOEIRO = "ll_";
export const PASTA_SITE = join("base", "saida", PASTA_CATALOGO);

const numero = (n: number) => n.toLocaleString("pt-BR");
const LINHA = "=".repeat(78);

// ---------------------------------------------------------------------------------------------------------------------
// Opções

export interface OpcoesAtualizar {
  etapas: Etapa[];
  /** --sem-publicar desliga o envio do site e a cópia do banco: nada vai ao GitHub. */
  publicar: boolean;
  forcar: boolean;
  /** --backup: a cópia do banco hoje, mesmo antes de uma semana. */
  copiaAgora: boolean;
  banco: string | null;
  ajuda: boolean;
}

export class ErroOpcao extends Error {}

export const AJUDA = `Atualiza o site com os dados do dia (Caixa, leiloeiros, fichas, riscos, localização). Guia: base/ATUALIZAR-SITE.md

  ${COMANDO}                     tudo: banco, Caixa, leiloeiros, fichas, riscos, localização, exportar, publicar
                                              (e a cópia do banco, uma vez por semana)
  ${COMANDO} --sem-publicar      faz tudo, mas não envia nada ao GitHub (para testar)
  ${COMANDO} --etapas caixa,exportar
                                              só essas etapas: ${ETAPAS.join(", ")}
  ${COMANDO} --forcar            publica mesmo se a trava de segurança recusar (queda grande de imóveis)
  ${COMANDO} --backup            faz a cópia do banco hoje
  ${COMANDO} --banco outro.db    usa outro arquivo de banco
  ${COMANDO} --sem-atualizar     não roda o "git pull" do começo

Pode parar com Ctrl+C: nada é publicado pela metade.`;

export function lerOpcoes(argv: readonly string[], env: Readonly<Record<string, string | undefined>> = {}): OpcoesAtualizar {
  let v: Record<string, string | boolean | undefined>;
  let soltos: string[];
  try {
    const r = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        etapas: { type: "string" },
        banco: { type: "string" },
        "sem-publicar": { type: "boolean" },
        forcar: { type: "boolean" },
        backup: { type: "boolean" },
        "sem-atualizar": { type: "boolean" },
        ajuda: { type: "boolean", short: "h" },
        help: { type: "boolean" },
      },
    });
    v = r.values;
    soltos = r.positionals;
  } catch (e) {
    const nome = /'(-{1,2}[^' ]+)/.exec((e as Error).message)?.[1] ?? "";
    const codigo = (e as NodeJS.ErrnoException).code;
    const motivo = codigo === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE" ? `A opção ${nome} está sem valor.` : `Opção desconhecida: ${nome || (e as Error).message}.`;
    throw new ErroOpcao(`${motivo} Veja as opções com: ${COMANDO} --ajuda`);
  }
  if (soltos.length) {
    throw new ErroOpcao(`Recebi "${soltos.join(" ")}" sem uma opção antes. Rode "${COMANDO}" com as opções (ex.: ${COMANDO} --sem-publicar).`);
  }
  const doNpm = (nome: string): string | undefined => {
    const valor = env[`npm_config_${nome}`];
    return valor === undefined || valor === "" ? undefined : valor;
  };
  const ligado = (nome: string, chave: string) => v[nome] === true || doNpm(chave) === "true";
  const texto = (nome: string): string | undefined => {
    if (typeof v[nome] === "string") return v[nome];
    const doEnv = doNpm(nome);
    return doEnv === "true" ? undefined : doEnv;
  };

  const semPublicar = ligado("sem-publicar", "sem_publicar");
  const copiaAgora = ligado("backup", "backup");
  if (semPublicar && copiaAgora) throw new ErroOpcao("--backup envia a cópia ao GitHub e --sem-publicar não envia nada: use um dos dois.");

  let etapas: Etapa[] = [...ETAPAS];
  const etapasTexto = texto("etapas");
  if (etapasTexto !== undefined) {
    const pedidas = etapasTexto.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!pedidas.length) throw new ErroOpcao(`--etapas vazio. Use uma lista: ${ETAPAS.join(",")}`);
    const escolhidas = new Set<Etapa>();
    for (const p of pedidas) {
      if (p === "tudo") ETAPAS.forEach((e) => escolhidas.add(e));
      else if ((ETAPAS as readonly string[]).includes(p)) escolhidas.add(p as Etapa);
      else throw new ErroOpcao(`Etapa desconhecida "${p}". Use: ${ETAPAS.join(", ")}.`);
    }
    if (copiaAgora) escolhidas.add("copia");
    etapas = ETAPAS.filter((e) => escolhidas.has(e));
  }
  if (semPublicar) etapas = etapas.filter((e) => e !== "publicar" && e !== "copia");

  const banco = texto("banco");
  return {
    etapas,
    publicar: !semPublicar,
    forcar: ligado("forcar", "forcar"),
    copiaAgora,
    banco: banco === undefined ? null : banco,
    ajuda: v.ajuda === true || v.help === true,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Regras puras (testadas em atualizar-site.test.ts)

export interface FonteInstantaneo {
  id: string;
  nome: string;
  total: number;
}

export interface ResumoInstantaneo {
  geradoEm: string;
  total: number;
  fontes: FonteInstantaneo[];
}

/** O resumo do imoveis.json.gz (já descomprimido e lido). Lança se não for um catálogo do site. */
export function resumirInstantaneo(lista: unknown): ResumoInstantaneo {
  const l = lista as { formato?: unknown; gerado_em?: unknown; total?: unknown; fontes?: unknown };
  if (typeof l !== "object" || l === null || l.formato !== "luneta-catalogo") throw new Error("não é o catálogo do site (formato luneta-catalogo)");
  if (typeof l.total !== "number" || !Array.isArray(l.fontes)) throw new Error("catálogo sem total ou sem fontes");
  const fontes = (l.fontes as { id?: unknown; nome?: unknown; total?: unknown }[]).map((f) => ({
    id: String(f.id),
    nome: typeof f.nome === "string" ? f.nome : String(f.id),
    total: typeof f.total === "number" ? f.total : 0,
  }));
  return { geradoEm: typeof l.gerado_em === "string" ? l.gerado_em : "", total: l.total, fontes };
}

/** Lê o resumo do imoveis.json.gz de uma pasta do site; null se não existir. */
export function lerResumoInstantaneo(pastaSite: string): ResumoInstantaneo | null {
  const caminho = join(pastaSite, ARQUIVO_CATALOGO_LISTA);
  if (!existsSync(caminho)) return null;
  return resumirInstantaneo(JSON.parse(gunzipSync(readFileSync(caminho)).toString("utf8")));
}

export interface Contagens {
  total: number;
  caixa: number;
  leiloeiros: number;
  /** Leiloeiros com pelo menos um imóvel no site. */
  quantosLeiloeiros: number;
  outros: number;
}

export function contar(r: ResumoInstantaneo): Contagens {
  let caixa = 0;
  let leiloeiros = 0;
  let quantos = 0;
  for (const f of r.fontes) {
    if (f.id === "caixa_csv") caixa += f.total;
    else if (f.id.startsWith(PREFIXO_LEILOEIRO)) {
      leiloeiros += f.total;
      if (f.total > 0) quantos++;
    }
  }
  return { total: r.total, caixa, leiloeiros, quantosLeiloeiros: quantos, outros: r.total - caixa - leiloeiros };
}

export interface ResultadoTrava {
  ok: boolean;
  motivos: string[];
}

/**
 * A trava antes de publicar: o instantâneo novo não pode estar vazio, o total não pode cair mais de 30% contra o
 * anterior, e nenhuma fonte que tinha mais de 1.000 imóveis pode zerar (os leiloeiros contam também juntos: nenhum
 * passa de 1.000 sozinho, mas todos sumirem de uma vez é o mesmo defeito).
 */
export function conferirTrava(anterior: ResumoInstantaneo | null, novo: ResumoInstantaneo, queda = QUEDA_MAXIMA, grande = FONTE_GRANDE): ResultadoTrava {
  const motivos: string[] = [];
  if (novo.total <= 0) motivos.push("o instantâneo novo não tem nenhum imóvel");
  if (anterior && anterior.total > 0 && novo.total > 0 && novo.total < anterior.total * (1 - queda)) {
    const pct = Math.round((1 - novo.total / anterior.total) * 100);
    motivos.push(`o total caiu ${pct}% (de ${numero(anterior.total)} para ${numero(novo.total)} imóveis); o limite é ${Math.round(queda * 100)}%`);
  }
  if (anterior) {
    const totalNovo = new Map(novo.fontes.map((f) => [f.id, f.total]));
    for (const f of anterior.fontes) {
      if (f.total > grande && (totalNovo.get(f.id) ?? 0) === 0) motivos.push(`a fonte ${f.nome} tinha ${numero(f.total)} imóveis e ficou sem nenhum`);
    }
    const a = contar(anterior);
    const n = contar(novo);
    if (a.leiloeiros > grande && n.leiloeiros === 0) motivos.push(`os leiloeiros tinham ${numero(a.leiloeiros)} imóveis juntos e ficaram sem nenhum`);
  }
  return { ok: motivos.length === 0, motivos };
}

/** "Dados: atualização de 29/10/2026, 25.300 imóveis (Caixa 20.000, leiloeiros 5.300)". */
export function mensagemDoCommitSite(data: Date, c: Contagens): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const dia = `${p(data.getDate())}/${p(data.getMonth() + 1)}/${data.getFullYear()}`;
  return `Dados: atualização de ${dia}, ${numero(c.total)} imóveis (Caixa ${numero(c.caixa)}, leiloeiros ${numero(c.leiloeiros)})`;
}

export type OrigemLeiloeiros = "local" | "coletas-dados" | null;

/**
 * De onde vem o JSONL dos leiloeiros: o do PC (coletas-pc/leiloeiros/pbcv-luneta.jsonl), se existir e estiver inteiro;
 * senão, o último publicado no branch coletas-dados; senão, nenhum (a etapa é pulada e o banco fica com o que tem).
 */
export function escolherArquivoLeiloeiros(local: { existe: boolean; problema: string | null }, publicado: { existe: boolean }): { origem: OrigemLeiloeiros; aviso: string | null } {
  if (local.existe && !local.problema) return { origem: "local", aviso: null };
  const aviso = local.existe ? `o arquivo do PC não serve (${local.problema})` : null;
  if (publicado.existe) return { origem: "coletas-dados", aviso };
  return { origem: null, aviso };
}

/**
 * O caminho mais novo de `nome` publicado pelo Actions em localizacao/<execução>/ (o número da execução só cresce),
 * ou null.
 */
export function ultimoPublicado(caminhos: readonly string[], nome: string): string | null {
  let melhor: { caminho: string; execucao: number } | null = null;
  for (const c of caminhos) {
    const m = /^localizacao\/(\d+)\/(.+)$/.exec(c);
    if (!m || m[2] !== nome) continue;
    const execucao = Number(m[1]);
    if (!melhor || execucao > melhor.execucao) melhor = { caminho: c, execucao };
  }
  return melhor?.caminho ?? null;
}

/** O publicado é mais novo que o que já temos? Pela data de geração (AAAA-MM-DD...); empate não conta. */
export function maisNovo(publicado: string | null, atual: string | null): boolean {
  if (!publicado) return false;
  if (!atual) return true;
  return publicado.slice(0, 10) > atual.slice(0, 10);
}

/** A cópia semanal está vencida? (6,5 dias, para a rodada diária não pular para o oitavo dia por alguns minutos) */
export function copiaVencida(ultima: string | null, agora: Date, dias = DIAS_ENTRE_COPIAS): boolean {
  if (!ultima) return true;
  const t = Date.parse(ultima);
  if (!Number.isFinite(t)) return true;
  return agora.getTime() - t >= (dias - 0.5) * 24 * 3600 * 1000;
}

/** Nomes dos arquivos da cópia no branch: um só até o limite; acima, partes .001, .002... */
export function nomesDasPartes(tamanho: number, limite = LIMITE_PARTE_COPIA): string[] {
  if (tamanho <= limite) return [NOME_COPIA];
  const n = Math.ceil(tamanho / limite);
  return Array.from({ length: n }, (_, i) => `${NOME_COPIA}.${String(i + 1).padStart(3, "0")}`);
}

/** O sha256 gravado no LEIA.md da cópia, ou null. */
export function shaDoLeia(texto: string): string | null {
  return /sha256:\s*`?([0-9a-f]{64})/i.exec(texto)?.[1]?.toLowerCase() ?? null;
}

export function textoLeiaCopia(o: { data: Date; sha256: string; bytes: number; partes: string[]; contagens: string }): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const dia = `${p(o.data.getDate())}/${p(o.data.getMonth() + 1)}/${o.data.getFullYear()}`;
  const mb = (o.bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const juntar =
    o.partes.length > 1
      ? `\nO arquivo está em ${o.partes.length} partes (o GitHub recusa arquivo acima de 100 MB). Junte antes de abrir:\n` +
        `- Windows (Prompt de Comando): \`copy /b ${o.partes.join("+")} ${NOME_COPIA}\`\n` +
        `- Mac ou Linux: \`cat ${NOME_COPIA}.* > ${NOME_COPIA}\`\n`
      : "";
  return [
    "# Cópia de segurança da base da Luneta",
    "",
    `\`${NOME_COPIA}\` contém \`base/dados/luneta.db\` e \`base/dados/caixa/\`. Cópia feita em ${dia} pelo PC do dono`,
    `(\`${COMANDO}\`), ${mb} MB. ${o.contagens}`,
    "",
    "Cada cópia substitui a anterior (commit único, sem histórico).",
    juntar,
    `Restaurar sozinho: \`${COMANDO}\` restaura quando \`base/dados/luneta.db\` não existe. À mão, na pasta`,
    `\`luneta-de-leiloes\`: \`tar -xzf ${NOME_COPIA} -C base/dados\` (o Windows 10 em diante tem o \`tar\`).`,
    "",
    `sha256: ${o.sha256}`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------------------
// Estado entre execuções (coletas-pc/atualizar-site/estado.json; só no PC)

export interface Estado {
  copia?: { quando: string; sha256: string; bytes: number };
  leiloeiros?: { banco: string; sha256: string; quando: string; origem: string };
}

function lerEstado(caminho: string): Estado {
  try {
    const e = JSON.parse(readFileSync(caminho, "utf8")) as Estado;
    return typeof e === "object" && e !== null ? e : {};
  } catch {
    return {};
  }
}

function gravarJson(caminho: string, valor: unknown): void {
  mkdirSync(dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, JSON.stringify(valor, null, 2) + "\n");
  renameSync(tmp, caminho);
}

async function sha256DoArquivo(caminho: string): Promise<string> {
  const h = createHash("sha256");
  for await (const pedaco of createReadStream(caminho)) h.update(pedaco as Buffer);
  return h.digest("hex");
}

// ---------------------------------------------------------------------------------------------------------------------
// Programas da base (node com TypeScript) e o Git

/** As opções do Node que este Node aceita (TypeScript direto, sem o aviso experimental). */
function opcoesDoNode(): string[] {
  const aceita = (o: string) => process.allowedNodeEnvironmentFlags.has(o);
  const r: string[] = [];
  if (aceita("--experimental-strip-types")) r.push("--experimental-strip-types");
  if (aceita("--disable-warning")) r.push("--disable-warning=ExperimentalWarning");
  if (aceita("--use-system-ca")) r.push("--use-system-ca");
  return r;
}

export interface SaidaPrograma {
  status: number;
  linhas: string[];
}

interface OpcoesPrograma {
  /** Quantas linhas mostrar na tela (as outras vão só para o log). */
  tela?: number;
  /** Quantas linhas gravar no log (o fim sempre vai). */
  log?: number;
  env?: NodeJS.ProcessEnv;
}

let filhoAtual: ReturnType<typeof spawn> | null = null;

/** Roda um programa da base com o Node deste processo; a saída vai para a tela (o começo) e para o log. */
function rodarPrograma(raiz: string, script: string, args: readonly string[], registro: Registro, o: OpcoesPrograma = {}): Promise<SaidaPrograma> {
  const limiteTela = o.tela ?? 15;
  const limiteLog = o.log ?? 400;
  return new Promise((resolver) => {
    const linhas: string[] = [];
    let resto = "";
    let contadas = 0;
    const fim: string[] = [];
    const tratar = (l: string) => {
      linhas.push(l);
      contadas++;
      if (contadas <= limiteTela) registro.linha(`    ${l}`);
      else if (contadas <= limiteLog) registro.arquivo(`    ${l}`);
      else {
        fim.push(l);
        if (fim.length > 20) fim.shift();
      }
      if (linhas.length > 50_000) linhas.splice(0, 10_000);
    };
    const filho = spawn(process.execPath, [...opcoesDoNode(), join(raiz, script), ...args], {
      cwd: raiz,
      env: o.env ?? process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    filhoAtual = filho;
    const dados = (d: Buffer) => {
      resto += d.toString("utf8");
      const partes = resto.split(/\r?\n/);
      resto = partes.pop() ?? "";
      for (const l of partes) tratar(l);
    };
    filho.stdout!.on("data", dados);
    filho.stderr!.on("data", dados);
    filho.on("error", (e) => {
      filhoAtual = null;
      resolver({ status: 127, linhas: [...linhas, e.message] });
    });
    filho.on("close", (codigo, sinal) => {
      filhoAtual = null;
      if (resto) tratar(resto);
      if (contadas > limiteTela) registro.linha(`    (mais ${numero(contadas - limiteTela)} linha(s) no log)`);
      if (fim.length) {
        registro.arquivo(`    ... ${numero(contadas - limiteLog - fim.length)} linha(s) omitidas ...`);
        for (const l of fim) registro.arquivo(`    ${l}`);
      }
      resolver({ status: codigo ?? (sinal ? 130 : 1), linhas });
    });
  });
}

/** `git` com a saída num arquivo (bytes: o .gz não pode passar por texto). */
function gitParaArquivo(args: readonly string[], cwd: string, destino: string): Promise<ResultadoComando> {
  return new Promise((resolver) => {
    mkdirSync(dirname(destino), { recursive: true });
    const fd = openSync(destino, "w");
    let erro = "";
    const filho = spawn("git", [...args], { cwd, stdio: ["inherit", fd, "pipe"], windowsHide: true });
    filho.stderr!.on("data", (d: Buffer) => (erro += d.toString("utf8")));
    filho.on("error", (e) => {
      closeSync(fd);
      resolver({ status: 127, saida: "", erro: erro + e.message });
    });
    filho.on("close", (codigo) => {
      closeSync(fd);
      resolver({ status: codigo ?? 1, saida: "", erro });
    });
  });
}

const mascararTudo = (t: string) => t.replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s]+@/gi, "$1***@");
const ultimasLinhas = (t: string, n = 4) => mascararTudo(t).trim().split("\n").slice(-n).join(" | ");

/**
 * Um repositório "nu" com só a ponta de um branch, sem os arquivos (filtro blob:none): cada arquivo é baixado quando
 * lido. Assim o clone do dono não muda e o branch coletas-dados (centenas de MB de prints e fichas) não é baixado
 * inteiro.
 */
export class RepoRemoto {
  readonly pasta: string;
  readonly url: string;
  readonly branch: string;
  private readonly git: RodarGit;
  private buscado = false;
  private lista: string[] = [];
  constructor(pasta: string, url: string, branch: string, git: RodarGit = rodarGit) {
    this.pasta = pasta;
    this.url = url;
    this.branch = branch;
    this.git = git;
  }

  async buscar(): Promise<void> {
    if (this.buscado) return;
    if (!existsSync(join(this.pasta, "HEAD"))) {
      mkdirSync(this.pasta, { recursive: true });
      const init = await this.git(["init", "-q", "--bare"], this.pasta);
      if (init.status !== 0) throw new Error(`não consegui preparar a pasta do Git (${ultimasLinhas(init.erro)})`);
    }
    // a URL vai na linha de comando (sem remote gravado), e o filtro torna o remote "promisor" para baixar sob demanda
    await this.git(["remote", "remove", "origin"], this.pasta);
    await this.git(["remote", "add", "origin", this.url], this.pasta);
    const f = await this.git(["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", `+refs/heads/${this.branch}:refs/heads/${this.branch}`], this.pasta);
    if (f.status !== 0) throw new Error(`não consegui buscar o branch ${this.branch} de ${mascararUrl(this.url)} (${ultimasLinhas(f.erro)})`);
    const l = await this.git(["ls-tree", "-r", "--name-only", this.branch], this.pasta);
    if (l.status !== 0) throw new Error(`não consegui listar o branch ${this.branch} (${ultimasLinhas(l.erro)})`);
    this.lista = l.saida.split("\n").map((s) => s.trim()).filter(Boolean);
    this.buscado = true;
  }

  arquivos(): string[] {
    return this.lista;
  }

  tem(caminho: string): boolean {
    return this.lista.includes(caminho);
  }

  async extrair(caminho: string, destino: string): Promise<void> {
    const r = await gitParaArquivo(["cat-file", "blob", `${this.branch}:${caminho}`], this.pasta, destino);
    if (r.status !== 0) {
      rmSync(destino, { force: true });
      throw new Error(`não consegui baixar ${caminho} (${ultimasLinhas(r.erro)})`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Banco: restaurar e copiar

function moverPorCima(origem: string, destino: string): void {
  mkdirSync(dirname(destino), { recursive: true });
  try {
    renameSync(origem, destino);
  } catch {
    copyFileSync(origem, destino);
    rmSync(origem, { force: true });
  }
}

const ARQUIVO_TEMPORARIO_SQLITE = /-(wal|shm|journal)$/;

/**
 * Baixa a cópia do branch backup-luneta-db, confere o sha256 do LEIA.md e põe o banco no lugar (e a pasta caixa/, se
 * ainda não existir). Só chamada quando o banco não existe: nunca sobrescreve um banco.
 */
export async function restaurarBanco(o: { banco: string; trabalho: string; url: string; log: (t: string) => void; git?: RodarGit }): Promise<string> {
  if (existsSync(o.banco)) throw new Error("o banco já existe: não restauro por cima");
  const temp = mkdtempSync(join(o.trabalho, "restaurar-"));
  try {
    const repo = new RepoRemoto(join(temp, "repo.git"), o.url, BRANCH_COPIA, o.git);
    await repo.buscar();
    const nomes = repo.arquivos();
    const partes = nomes.includes(NOME_COPIA) ? [NOME_COPIA] : nomes.filter((n) => n.startsWith(`${NOME_COPIA}.`) && /\.\d{3}$/.test(n)).sort();
    if (!partes.length) throw new Error(`o branch ${BRANCH_COPIA} não tem ${NOME_COPIA}`);
    o.log(`  baixando ${partes.join(", ")}...`);
    const arquivo = join(temp, NOME_COPIA);
    if (partes.length === 1) await repo.extrair(partes[0]!, arquivo);
    else {
      const fd = openSync(arquivo, "w");
      try {
        for (const p of partes) {
          const pedaco = join(temp, "parte");
          await repo.extrair(p, pedaco);
          writeSync(fd, readFileSync(pedaco));
          rmSync(pedaco, { force: true });
        }
      } finally {
        closeSync(fd);
      }
    }
    let esperado: string | null = null;
    if (nomes.includes("LEIA.md")) {
      await repo.extrair("LEIA.md", join(temp, "LEIA.md"));
      esperado = shaDoLeia(readFileSync(join(temp, "LEIA.md"), "utf8"));
    }
    const sha = await sha256DoArquivo(arquivo);
    if (esperado && esperado !== sha) throw new Error(`a cópia baixada não confere com o LEIA.md (sha256 ${sha.slice(0, 12)}…, esperado ${esperado.slice(0, 12)}…)`);
    const ext = join(temp, "ext");
    await extrairTarGz(arquivo, ext);
    if (!existsSync(join(ext, "luneta.db"))) throw new Error("a cópia não tem o luneta.db");
    const dirDados = dirname(o.banco);
    const caixa = join(ext, "caixa");
    if (existsSync(caixa) && !existsSync(join(dirDados, "caixa"))) {
      for (const nome of readdirSync(caixa)) {
        if (!ARQUIVO_TEMPORARIO_SQLITE.test(nome)) moverPorCima(join(caixa, nome), join(dirDados, "caixa", nome));
      }
    }
    // o banco por último: se algo falhou antes, a próxima execução tenta de novo
    moverPorCima(join(ext, "luneta.db"), o.banco);
    return `restaurado da cópia (sha256 ${sha.slice(0, 12)}…${esperado ? ", conferido com o LEIA.md" : ", sem LEIA.md para conferir"})`;
  } finally {
    rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}

/** Uma cópia coerente de um banco SQLite em uso (VACUUM INTO lê o banco e o WAL de uma vez só). */
function copiarSqlite(origem: string, destino: string): void {
  mkdirSync(dirname(destino), { recursive: true });
  rmSync(destino, { force: true });
  const db = new DatabaseSync(origem, { readOnly: true });
  try {
    db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
}

export interface ResultadoCopia {
  ok: boolean;
  mensagem: string;
  sha256?: string;
  bytes?: number;
}

/** Comprime banco + caixa/ e envia como commit único órfão (push forçado só do branch backup-luneta-db). */
export async function fazerCopia(o: { banco: string; trabalho: string; url: string; agora: Date; contagens: string; log: (t: string) => void; git?: RodarGit }): Promise<ResultadoCopia> {
  const git = o.git ?? rodarGit;
  const temp = mkdtempSync(join(o.trabalho, "copia-"));
  try {
    const dados = join(temp, "dados");
    const entradas: EntradaTar[] = [];
    o.log("  copiando o banco (cópia coerente, sem parar nada)...");
    copiarSqlite(o.banco, join(dados, "luneta.db"));
    entradas.push({ nome: "luneta.db", caminho: join(dados, "luneta.db") });
    const caixa = join(dirname(o.banco), "caixa");
    if (existsSync(caixa)) {
      for (const nome of readdirSync(caixa).sort()) {
        const origem = join(caixa, nome);
        if (ARQUIVO_TEMPORARIO_SQLITE.test(nome) || !statSync(origem).isFile()) continue;
        const destino = join(dados, "caixa", nome);
        if (nome.endsWith(".db")) copiarSqlite(origem, destino);
        else {
          mkdirSync(dirname(destino), { recursive: true });
          copyFileSync(origem, destino);
        }
        entradas.push({ nome: `caixa/${nome}`, caminho: destino });
      }
    }
    o.log("  comprimindo...");
    const arquivo = join(temp, NOME_COPIA);
    await gravarTarGz(entradas, arquivo);
    rmSync(dados, { recursive: true, force: true });
    const bytes = statSync(arquivo).size;
    const sha = await sha256DoArquivo(arquivo);
    const repo = join(temp, "repo");
    mkdirSync(repo, { recursive: true });
    const partes = nomesDasPartes(bytes);
    if (partes.length === 1) renameSync(arquivo, join(repo, NOME_COPIA));
    else {
      const tudo = readFileSync(arquivo);
      partes.forEach((p, i) => writeFileSync(join(repo, p), tudo.subarray(i * LIMITE_PARTE_COPIA, (i + 1) * LIMITE_PARTE_COPIA)));
      rmSync(arquivo, { force: true });
    }
    writeFileSync(join(repo, "LEIA.md"), textoLeiaCopia({ data: o.agora, sha256: sha, bytes, partes, contagens: o.contagens }));
    const SEM_CRLF = ["-c", "core.autocrlf=false", "-c", "core.safecrlf=false"];
    for (const args of [["init", "-q"], ["symbolic-ref", "HEAD", `refs/heads/${BRANCH_COPIA}`], [...SEM_CRLF, "add", "-A"]]) {
      const r = await git(args, repo);
      if (r.status !== 0) return { ok: false, mensagem: `o Git falhou ao preparar a cópia (${ultimasLinhas(r.erro)})` };
    }
    const quem = (await git(["config", "user.email"], repo)).status === 0 ? [] : ["-c", "user.name=Atualização do site (Luneta)", "-c", "user.email=atualizar-site@users.noreply.github.com"];
    const p = (n: number) => String(n).padStart(2, "0");
    const dia = `${p(o.agora.getDate())}/${p(o.agora.getMonth() + 1)}/${o.agora.getFullYear()}`;
    const c = await git([...SEM_CRLF, ...quem, "commit", "-q", "-m", `Cópia de segurança da base da Luneta (luneta.db) em ${dia}`], repo);
    if (c.status !== 0) return { ok: false, mensagem: `o commit da cópia falhou (${ultimasLinhas(c.erro)})` };
    o.log(`  enviando ${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB para ${mascararUrl(o.url)} (branch ${BRANCH_COPIA})...`);
    // forçado SÓ neste branch: o commit é órfão e substitui o anterior, para o repositório não crescer a cada semana
    const push = await git(["push", "-q", "--force", o.url, `HEAD:refs/heads/${BRANCH_COPIA}`], repo);
    if (push.status !== 0) {
      const problema = diagnosticarPush(push.erro);
      const dica =
        problema === "credencial"
          ? "o GitHub não aceitou o login para o repositório luneta-base (entre com a conta joaopedrogv13 quando o Git pedir)"
          : problema === "rede"
            ? "sem conexão com o GitHub agora"
            : ultimasLinhas(push.erro);
      return { ok: false, mensagem: `a cópia não foi enviada: ${dica}` };
    }
    return { ok: true, mensagem: `enviada (${partes.length > 1 ? `${partes.length} partes, ` : ""}sha256 ${sha.slice(0, 12)}…)`, sha256: sha, bytes };
  } finally {
    rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}

/** A data do geocode mais novo já aplicado no banco (extras.geo.gerado_em), ou null. */
export function geocodeAplicado(banco: string): string | null {
  const db = new DatabaseSync(banco, { readOnly: true });
  try {
    const r = db.prepare("SELECT max(json_extract(extras, '$.geo.gerado_em')) AS d FROM imovel WHERE extras IS NOT NULL").get() as { d?: unknown } | undefined;
    return typeof r?.d === "string" ? r.d : null;
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Publicar no main

export interface ResultadoPublicacaoSite {
  ok: boolean;
  mensagem: string;
  commit?: string;
}

/** Copia o instantâneo da pasta de trabalho para base/saida/site (só os arquivos que ela tem). */
export function copiarInstantaneo(origemSite: string, destinoSite: string): string[] {
  const copiados: string[] = [];
  const copiar = (nome: string) => {
    const o = join(origemSite, nome);
    if (!existsSync(o)) return;
    const d = join(destinoSite, nome);
    mkdirSync(dirname(d), { recursive: true });
    copyFileSync(o, d);
    copiados.push(nome.split(/[\\/]/).join("/"));
  };
  const detalhesNovos = join(origemSite, PASTA_CATALOGO_DETALHES);
  if (existsSync(detalhesNovos)) {
    const novos = new Set(readdirSync(detalhesNovos).filter((n) => n.endsWith(".json.gz")));
    for (const n of novos) copiar(join(PASTA_CATALOGO_DETALHES, n));
    const pasta = join(destinoSite, PASTA_CATALOGO_DETALHES);
    for (const n of existsSync(pasta) ? readdirSync(pasta) : []) if (n.endsWith(".json.gz") && !novos.has(n)) rmSync(join(pasta, n));
  }
  for (const n of [ARQUIVO_RELATORIO, ...ARQUIVOS_LOCALIZACAO]) copiar(n);
  // a lista por último (quem lê a lista já acha os pedaços da mesma geração)
  copiar(ARQUIVO_CATALOGO_LISTA);
  return copiados;
}

/**
 * Commit SÓ de base/saida/site no main do clone do dono e envio, com 3 tentativas (pull --rebase entre elas). Antes do
 * envio, confere que o commit não leva nenhum outro caminho.
 */
export async function publicarSite(o: { raiz: string; mensagem: string; log: (t: string) => void; git?: RodarGit; tentativas?: number; esperar?: (ms: number) => Promise<void> }): Promise<ResultadoPublicacaoSite> {
  const git = o.git ?? rodarGit;
  const tentativas = o.tentativas ?? 3;
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pasta = PASTA_SITE.split(/[\\/]/).join("/");
  const SEM_CRLF = ["-c", "core.autocrlf=false", "-c", "core.safecrlf=false"];
  const ramo = await git(["rev-parse", "--abbrev-ref", "HEAD"], o.raiz);
  if (ramo.status !== 0) return { ok: false, mensagem: "esta pasta não é um clone do Git (baixe o projeto com git clone: guia base/COLETA-NO-PC.md, passo 2)" };
  if (ramo.saida.trim() !== BRANCH_SITE) return { ok: false, mensagem: `o projeto está no branch "${ramo.saida.trim()}", e o site sai do ${BRANCH_SITE}. Rode: git checkout ${BRANCH_SITE}` };
  const add = await git([...SEM_CRLF, "add", "-A", "--", pasta], o.raiz);
  if (add.status !== 0) return { ok: false, mensagem: `git add falhou (${ultimasLinhas(add.erro)})` };
  const diff = await git(["diff", "--cached", "--quiet", "--", pasta], o.raiz);
  if (diff.status === 0) return { ok: true, mensagem: "nada novo (o site já tem estes dados)" };
  const quem = (await git(["config", "user.email"], o.raiz)).status === 0 ? [] : ["-c", "user.name=Atualização do site (Luneta)", "-c", "user.email=atualizar-site@users.noreply.github.com"];
  const c = await git([...SEM_CRLF, ...quem, "commit", "-q", "-m", o.mensagem, "--", pasta], o.raiz);
  if (c.status !== 0) return { ok: false, mensagem: `o commit falhou (${ultimasLinhas(c.erro || c.saida)})` };
  const nomes = await git(["show", "--name-only", "--format=", "HEAD"], o.raiz);
  const fora = nomes.saida.split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith(`${pasta}/`));
  if (nomes.status !== 0 || fora.length) {
    await git(["reset", "-q", "--soft", "HEAD~1"], o.raiz);
    return { ok: false, mensagem: `o commit levaria outros caminhos (${fora.slice(0, 3).join(", ")}): desfeito, nada enviado` };
  }
  let ultimo = "";
  for (let i = 1; i <= tentativas; i++) {
    const push = await git(["push", "-q", "origin", `HEAD:refs/heads/${BRANCH_SITE}`], o.raiz);
    if (push.status === 0) {
      const sha = (await git(["rev-parse", "--short", "HEAD"], o.raiz)).saida.trim();
      return { ok: true, mensagem: `enviado (commit ${sha} no ${BRANCH_SITE}; a Vercel publica em alguns minutos)`, commit: sha };
    }
    ultimo = push.erro;
    const problema = diagnosticarPush(push.erro);
    if (problema === "credencial") {
      return { ok: false, mensagem: "o GitHub não aceitou o envio: falta entrar com a conta dona do repositório (guia base/COLETA-NO-PC.md, item 7). O commit ficou no PC e vai na próxima vez." };
    }
    if (i === tentativas) break;
    o.log(`  envio ${i} de ${tentativas} não passou; buscando o que chegou no ${BRANCH_SITE} e tentando de novo.`);
    await esperar(i * 5000);
    // os dados deste commit valem mais que os de outro commit no mesmo arquivo (-X theirs: no rebase, "theirs" é o nosso)
    const pull = await git([...SEM_CRLF, "pull", "-q", "--rebase", "-X", "theirs", "--autostash", "origin", BRANCH_SITE], o.raiz);
    if (pull.status !== 0) {
      await git(["rebase", "--abort"], o.raiz);
      return { ok: false, mensagem: `não consegui juntar com o que chegou no ${BRANCH_SITE} (${ultimasLinhas(pull.erro)}). O commit ficou no PC; mande o log para o Claude.` };
    }
  }
  const problema = diagnosticarPush(ultimo);
  return {
    ok: false,
    mensagem: problema === "rede" ? "sem conexão com o GitHub agora; o commit ficou no PC e vai na próxima vez" : `o envio falhou (${ultimasLinhas(ultimo)}); o commit ficou no PC`,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Programa

type StatusEtapa = "ok" | "aviso" | "falha" | "pulada";

export interface RelatorioEtapa {
  etapa: Etapa | "trava";
  status: StatusEtapa;
  detalhe: string;
}

/** Linhas "Coleta #N de ll_x: status" e "novos N · atualizados N ..." da importação dos leiloeiros, somadas. */
export function somarImportacao(linhas: readonly string[]): { coletas: number; porStatus: Record<string, number>; novos: number; atualizados: number; removidos: number } {
  const porStatus: Record<string, number> = {};
  let coletas = 0;
  let novos = 0;
  let atualizados = 0;
  let removidos = 0;
  for (const l of linhas) {
    const c = /^Coleta #\d+ de (\S+): (\S+)/.exec(l.trim());
    if (c) {
      coletas++;
      porStatus[c[2]!] = (porStatus[c[2]!] ?? 0) + 1;
    }
    const n = /novos (\d+) · atualizados (\d+) · inalterados \d+ · reativados \d+ · removidos (\d+)/.exec(l);
    if (n) {
      novos += Number(n[1]);
      atualizados += Number(n[2]);
      removidos += Number(n[3]);
    }
  }
  return { coletas, porStatus, novos, atualizados, removidos };
}

export async function principal(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const raiz = resolve(import.meta.dirname, "..");
  process.chdir(raiz);
  let op: OpcoesAtualizar;
  try {
    op = lerOpcoes(argv, env);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  if (op.ajuda) {
    console.log(AJUDA);
    return 0;
  }
  if (!versaoAtende(process.versions.node, NODE_MINIMO_SITE)) {
    console.error(`Seu Node é o ${process.versions.node}; a atualização precisa do ${NODE_MINIMO_SITE.join(".")} ou mais novo. Instale a versão LTS em https://nodejs.org/pt-br/download.`);
    return 1;
  }
  const pastaPc = join(raiz, "coletas-pc");
  const trabalho = join(pastaPc, "atualizar-site");
  mkdirSync(trabalho, { recursive: true });
  const outra = travaDeOutro(trabalho);
  if (outra) {
    console.error(`Já tem uma atualização do site rodando neste PC (começou ${quando(new Date(outra.inicio))}). Espere ela terminar e rode de novo.`);
    return 4;
  }
  pegarTrava(trabalho);

  const agora = new Date();
  const registro = criarRegistro(join(pastaPc, "atualizar-site.log"), raiz);
  const banco = op.banco ? resolve(op.banco) : join(raiz, "base", "dados", "luneta.db");
  const dirDados = dirname(banco);
  const caminhoEstado = join(trabalho, "estado.json");
  const estado = lerEstado(caminhoEstado);
  const saidaTrabalho = join(trabalho, "saida");
  const siteTrabalho = join(saidaTrabalho, PASTA_CATALOGO);
  const siteReal = join(raiz, PASTA_SITE);
  // os programas da base usam o banco e o cache das fichas da mesma pasta (com --banco, um teste não toca o banco real)
  const envBase: NodeJS.ProcessEnv = { ...process.env, LUNETA_CAIXA_CACHE: join(dirDados, "caixa", "detalhes.db") };
  delete envBase.LUNETA_DB;
  const argBanco = ["--banco", banco];
  const urlCopia = env.LUNETA_COPIA_URL || URL_COPIA_PADRAO;
  const relatorio: RelatorioEtapa[] = [];
  const anotar = (etapa: RelatorioEtapa["etapa"], status: StatusEtapa, detalhe: string) => {
    relatorio.push({ etapa, status, detalhe });
    const marca = status === "ok" ? "ok" : status.toUpperCase();
    registro.linha(`  → ${marca}: ${detalhe}`);
  };
  const quer = (e: Etapa) => op.etapas.includes(e);

  registro.arquivo(`${LINHA}\nInício · Node ${process.versions.node} · ${process.platform} · opções: ${argv.join(" ") || "(nenhuma)"}`);
  registro.linha(`Luneta · atualização do site (${agora.toLocaleString("pt-BR")}). Guia: base/ATUALIZAR-SITE.md`);
  registro.linha(`Etapas: ${op.etapas.join(", ") || "(nenhuma)"}${op.publicar ? "" : " · sem publicar (nada vai ao GitHub)"}${op.forcar ? " · --forcar" : ""}`);
  if (op.banco) registro.linha(`Banco: ${relative(raiz, banco) || banco}`);

  let parada = false;
  let ultimoSinal = 0;
  process.on("SIGINT", () => {
    const t = Date.now();
    if (parada && t - ultimoSinal > 2000) {
      registro.linha("Saindo agora. Nada foi publicado pela metade.");
      filhoAtual?.kill();
      process.exit(130);
    }
    if (!parada) registro.linha("Ctrl+C: paro depois da etapa em andamento e não publico nada. (Ctrl+C de novo sai na hora.)");
    parada = true;
    ultimoSinal = t;
  });

  // coletas-dados: buscado uma vez, na primeira etapa que precisa
  let urlDados = env.LUNETA_DADOS_URL || "";
  if (!urlDados) {
    const r = await rodarGit(["remote", "get-url", "origin"], raiz);
    urlDados = r.status === 0 && r.saida.trim() ? r.saida.trim() : "https://github.com/joaopedrogv13/luneta-de-leiloes.git";
  }
  const repoDados = new RepoRemoto(join(trabalho, "coletas-dados.git"), urlDados, BRANCH_DADOS);
  let erroDados: string | null = null;
  const dados = async (): Promise<RepoRemoto | null> => {
    if (erroDados) return null;
    try {
      await repoDados.buscar();
      return repoDados;
    } catch (e) {
      erroDados = (e as Error).message;
      registro.linha(`  (sem o branch ${BRANCH_DADOS}: ${erroDados})`);
      return null;
    }
  };

  const titulo = (t: string) => registro.linha(`${LINHA}\n${t}`);
  let codigo = 0;
  let novo: ResumoInstantaneo | null = null;
  let anterior: ResumoInstantaneo | null = null;
  let trava: ResultadoTrava | null = null;
  let publicacao: ResultadoPublicacaoSite | null = null;
  let copia: ResultadoCopia | null = null;

  // ---- a. banco
  if (quer("banco")) {
    titulo("Banco");
    let restaurado: string | null = null;
    if (!existsSync(banco)) {
      registro.linha(`O banco não existe neste PC: vou restaurar da cópia no repositório privado (${mascararUrl(urlCopia)}, branch ${BRANCH_COPIA}).`);
      registro.linha("Se o Git pedir login, entre com a conta joaopedrogv13.");
      try {
        restaurado = await restaurarBanco({ banco, trabalho, url: urlCopia, log: (t) => registro.linha(t) });
        registro.linha(`  ${restaurado}`);
      } catch (e) {
        anotar("banco", "falha", `não consegui restaurar o banco: ${(e as Error).message}`);
        registro.linha(
          [
            "Restaurar à mão: entre em https://github.com/joaopedrogv13/luneta-base/tree/backup-luneta-db (com a conta joaopedrogv13),",
            `baixe o ${NOME_COPIA} (e junte as partes, se houver: o LEIA.md de lá explica) para a pasta do projeto e rode`,
            `  tar -xzf ${NOME_COPIA} -C base/dados`,
            `Depois rode de novo: ${COMANDO}`,
          ].join("\n"),
        );
        codigo = 1;
      }
    }
    if (!codigo) {
      const m = await rodarPrograma(raiz, "base/cli.ts", ["migrar", ...argBanco], registro, { env: envBase });
      if (m.status !== 0) {
        anotar("banco", "falha", "migrar falhou (veja acima)");
        codigo = 1;
      } else anotar("banco", "ok", restaurado ? `${restaurado}; migrado` : "migrado");
    }
  } else if (!existsSync(banco)) {
    anotar("banco", "falha", `o banco não existe (${relative(raiz, banco) || banco}) e a etapa "banco" não foi pedida`);
    codigo = 1;
  }
  if (codigo) return terminar();

  // ---- b. Caixa
  if (quer("caixa") && !parada) {
    titulo("Caixa (lista geral)");
    const r = await rodarPrograma(raiz, "base/cli.ts", ["coletar", "caixa", ...argBanco], registro, { env: envBase, tela: 25 });
    if (r.status === 0) anotar("caixa", "ok", "lista da Caixa coletada");
    else anotar("caixa", "aviso", "a coleta da Caixa falhou; sigo com os imóveis da Caixa que o banco já tem");
  }

  // ---- c. leiloeiros
  if (quer("leiloeiros") && !parada) {
    titulo("Leiloeiros (arquivo do PBCV)");
    const local = join(pastaPc, "leiloeiros", ARQUIVO_LEILOEIROS);
    const localExiste = existsSync(local);
    const problemaLocal = localExiste ? motivoJsonlInvalido(local) : null;
    let publicado = false;
    if (!localExiste || problemaLocal) publicado = (await dados())?.tem(CAMINHO_LEILOEIROS_PUBLICADO) ?? false;
    const escolha = escolherArquivoLeiloeiros({ existe: localExiste, problema: problemaLocal }, { existe: publicado });
    if (escolha.aviso) registro.linha(`  ${escolha.aviso}`);
    let arquivo: string | null = null;
    let origem = "";
    if (escolha.origem === "local") {
      arquivo = local;
      origem = `coletas-pc/leiloeiros/${ARQUIVO_LEILOEIROS}, de ${statSync(local).mtime.toLocaleString("pt-BR")}`;
    } else if (escolha.origem === "coletas-dados") {
      try {
        const gz = join(trabalho, `${ARQUIVO_LEILOEIROS}.gz`);
        await repoDados.extrair(CAMINHO_LEILOEIROS_PUBLICADO, gz);
        arquivo = join(trabalho, ARQUIVO_LEILOEIROS);
        writeFileSync(arquivo, gunzipSync(readFileSync(gz)));
        rmSync(gz, { force: true });
        origem = `o último publicado em ${BRANCH_DADOS}/${CAMINHO_LEILOEIROS_PUBLICADO}`;
      } catch (e) {
        anotar("leiloeiros", "aviso", `não consegui baixar o arquivo publicado: ${(e as Error).message}`);
      }
    }
    if (!arquivo) {
      if (!relatorio.some((r) => r.etapa === "leiloeiros")) {
        anotar("leiloeiros", "aviso", `não há arquivo dos leiloeiros (nem em coletas-pc/leiloeiros/ nem em ${BRANCH_DADOS}); o banco fica com os que tem`);
      }
    } else {
      registro.linha(`Arquivo: ${origem}`);
      const sha = await sha256DoArquivo(arquivo);
      if (estado.leiloeiros && estado.leiloeiros.sha256 === sha && estado.leiloeiros.banco === banco) {
        anotar("leiloeiros", "ok", `é o mesmo arquivo importado em ${new Date(estado.leiloeiros.quando).toLocaleString("pt-BR")}: não importo de novo`);
      } else {
        registro.linha("Conferindo o arquivo (validador do contrato)...");
        const v = await rodarPrograma(raiz, "base/leiloeiros/validar.ts", ["--arquivo", arquivo, "--max", "10"], registro, { env: envBase, tela: 2, log: 60 });
        if (v.status !== 0) {
          anotar("leiloeiros", "aviso", "o validador RECUSOU o arquivo (veja os erros no log): não importei; o site segue com os leiloeiros que o banco já tem");
        } else if (!parada) {
          registro.linha("Importando (uma fonte por leiloeiro; leva alguns minutos)...");
          const r = await rodarPrograma(raiz, "base/cli.ts", ["coletar", "leiloeiros", "--arquivo", arquivo, ...argBanco], registro, { env: envBase, tela: 0, log: 3000 });
          const s = somarImportacao(r.linhas);
          const status = Object.entries(s.porStatus).map(([k, n]) => `${k} ${numero(n)}`).join(", ");
          const texto = `${numero(s.coletas)} leiloeiro(s) (${status || "nenhuma coleta"}); novos ${numero(s.novos)}, atualizados ${numero(s.atualizados)}, removidos ${numero(s.removidos)}`;
          if (s.coletas === 0) anotar("leiloeiros", "aviso", `a importação não gravou nada (código ${r.status}; veja o log)`);
          else {
            // código 1 com coletas gravadas: algum leiloeiro veio só com erro (bloqueado, fora do ar), o que é normal
            anotar("leiloeiros", "ok", texto);
            estado.leiloeiros = { banco, sha256: sha, quando: new Date().toISOString(), origem };
            gravarJson(caminhoEstado, estado);
          }
        }
      }
    }
  }

  // ---- d. fichas
  if (quer("fichas") && !parada) {
    const fichas = [join(pastaPc, "fichas", "fichas.json"), join(pastaPc, "fichas", "fichas.json.gz")].find((c) => existsSync(c));
    if (!fichas) anotar("fichas", "pulada", "não há coletas-pc/fichas/fichas.json");
    else {
      titulo("Fichas da Caixa");
      const problema = fichas.endsWith(".json") ? motivoJsonInvalido(fichas, true) : null;
      if (problema) anotar("fichas", "aviso", `o fichas.json não está inteiro (${problema}); não apliquei`);
      else {
        const r = await rodarPrograma(raiz, "base/fontes/caixa/aplicar-fichas.ts", ["--arquivo", fichas, ...argBanco], registro, { env: envBase });
        anotar("fichas", r.status === 0 ? "ok" : "aviso", r.status === 0 ? "fichas aplicadas" : "a aplicação das fichas falhou (veja acima); sigo sem elas");
      }
    }
  }

  // ---- e. riscos
  if (quer("riscos") && !parada) {
    titulo("Riscos (tags)");
    const r = await rodarPrograma(raiz, "base/cli.ts", ["riscos", ...argBanco], registro, { env: envBase, tela: 3 });
    anotar("riscos", r.status === 0 ? "ok" : "aviso", r.status === 0 ? (r.linhas.find((l) => l.startsWith("Riscos:")) ?? "tags refeitas") : "as regras de risco falharam; o site sai com as tags anteriores");
  }

  // ---- f. localização
  const copiarLocalizacao: { nome: string; caminho: string; geradoEm: string }[] = [];
  if (quer("localizacao") && !parada) {
    titulo("Localização (geocode e nota do Actions)");
    const repo = await dados();
    if (!repo) anotar("localizacao", "aviso", `não li o branch ${BRANCH_DADOS}; o site fica com a localização que já tem`);
    else {
      const partes: string[] = [];
      let status: StatusEtapa = "ok";
      const geocode = ultimoPublicado(repo.arquivos(), ARQUIVO_GEOCODE);
      if (!geocode) partes.push("nenhum geocode publicado ainda");
      else {
        try {
          const destino = join(trabalho, ARQUIVO_GEOCODE);
          await repo.extrair(geocode, destino);
          const gerado = (JSON.parse(readFileSync(destino, "utf8")) as { gerado_em?: string }).gerado_em ?? null;
          const aplicado = geocodeAplicado(banco);
          if (maisNovo(gerado, aplicado)) {
            registro.linha(`Geocode de ${gerado?.slice(0, 10)} (${geocode}); o banco tinha o de ${aplicado ?? "nenhum"}.`);
            const r = await rodarPrograma(raiz, "base/fontes/localizacao/aplicar.ts", ["--arquivo", destino, ...argBanco], registro, { env: envBase });
            if (r.status === 0) partes.push(`geocode de ${gerado?.slice(0, 10)} aplicado`);
            else {
              status = "aviso";
              partes.push("o geocode novo falhou ao aplicar");
            }
          } else partes.push(`geocode de ${aplicado ?? gerado?.slice(0, 10)} já aplicado`);
          rmSync(destino, { force: true });
        } catch (e) {
          status = "aviso";
          partes.push(`geocode: ${(e as Error).message}`);
        }
      }
      for (const nome of ARQUIVOS_LOCALIZACAO) {
        const caminho = ultimoPublicado(repo.arquivos(), nome);
        if (!caminho) continue;
        try {
          const destino = join(trabalho, "localizacao", nome);
          await repo.extrair(caminho, destino);
          const lerData = (c: string) => (JSON.parse(gunzipSync(readFileSync(c)).toString("utf8")) as { gerado_em?: string }).gerado_em ?? null;
          const publicadoEm = lerData(destino);
          const atual = existsSync(join(siteReal, nome)) ? lerData(join(siteReal, nome)) : null;
          if (maisNovo(publicadoEm, atual)) {
            copiarLocalizacao.push({ nome, caminho: destino, geradoEm: publicadoEm! });
            partes.push(`${nome} de ${publicadoEm} vai ao site (o do site é de ${atual ?? "nenhum"})`);
          }
        } catch (e) {
          status = "aviso";
          partes.push(`${nome}: ${(e as Error).message}`);
        }
      }
      if (!copiarLocalizacao.length) partes.push("a nota do site já é a mais nova");
      anotar("localizacao", status, partes.join("; "));
    }
  }

  // ---- g. exportar e relatório
  if (quer("exportar") && !parada) {
    titulo("Instantâneo do site e relatório dos leiloeiros");
    rmSync(saidaTrabalho, { recursive: true, force: true });
    const e = await rodarPrograma(raiz, "base/cli.ts", ["exportar", "--site", "--pasta", saidaTrabalho, ...argBanco], registro, { env: envBase });
    if (e.status !== 0) {
      anotar("exportar", "falha", "o exportar falhou (veja acima): nada a publicar");
      codigo = 1;
    } else {
      const r = await rodarPrograma(raiz, "base/leiloeiros/relatorio.ts", ["--site", "--pasta", saidaTrabalho, ...argBanco], registro, { env: envBase, tela: 4, log: 200 });
      for (const l of copiarLocalizacao) copyFileSync(l.caminho, join(siteTrabalho, l.nome));
      try {
        novo = lerResumoInstantaneo(siteTrabalho);
        anterior = lerResumoInstantaneo(siteReal);
      } catch (err) {
        anotar("exportar", "falha", `não li o instantâneo: ${(err as Error).message}`);
        codigo = 1;
      }
      if (novo) {
        const c = contar(novo);
        anotar(
          "exportar",
          r.status === 0 ? "ok" : "aviso",
          `${numero(c.total)} imóveis: Caixa ${numero(c.caixa)}, leiloeiros ${numero(c.leiloeiros)} (${numero(c.quantosLeiloeiros)} leiloeiros)${c.outros ? `, outras fontes ${numero(c.outros)}` : ""}` +
            `${anterior ? `; antes ${numero(anterior.total)}` : ""}${r.status === 0 ? "" : "; o relatório dos leiloeiros falhou"}`,
        );
      } else if (!codigo) {
        anotar("exportar", "falha", "o exportar não gravou o imoveis.json.gz");
        codigo = 1;
      }
    }
  }

  // ---- h. trava
  if (novo && !parada) {
    titulo("Trava de segurança");
    trava = conferirTrava(anterior, novo);
    if (trava.ok) anotar("trava", "ok", anterior ? `total ${numero(anterior.total)} → ${numero(novo.total)}; nenhuma fonte grande zerou` : "primeiro instantâneo (sem anterior para comparar)");
    else if (op.forcar) anotar("trava", "aviso", `recusaria (${trava.motivos.join("; ")}), mas --forcar passa por cima`);
    else {
      anotar("trava", "falha", `NÃO publico: ${trava.motivos.join("; ")}`);
      registro.linha(
        "Isso costuma ser uma coleta que falhou pela metade (Caixa fora do ar, arquivo dos leiloeiros vazio). Confira o log acima.\n" +
          `Se a queda for de verdade (ex.: a Caixa tirou muitos imóveis), publique assim: ${COMANDO} --forcar`,
      );
      codigo = 6;
    }
  }

  // ---- i. publicar
  if (quer("publicar")) {
    if (parada) anotar("publicar", "pulada", "interrompido com Ctrl+C");
    else if (!novo) anotar("publicar", "pulada", 'sem instantâneo novo nesta execução (a etapa "exportar" não rodou ou falhou)');
    else if (trava && !trava.ok && !op.forcar) anotar("publicar", "pulada", "a trava recusou");
    else {
      titulo("Publicar no site (commit só de base/saida/site no main)");
      const copiados = copiarInstantaneo(siteTrabalho, siteReal);
      registro.arquivo(`  copiados para ${PASTA_SITE}: ${copiados.join(", ")}`);
      publicacao = await publicarSite({ raiz, mensagem: mensagemDoCommitSite(agora, contar(novo)), log: (t) => registro.linha(t) });
      anotar("publicar", publicacao.ok ? "ok" : "falha", publicacao.mensagem);
      if (!publicacao.ok) codigo = codigo || 1;
    }
  } else if (novo) registro.linha(`(Sem publicar: o instantâneo novo ficou em coletas-pc/atualizar-site/saida/site; o ${PASTA_SITE} do projeto não mudou.)`);

  // ---- j. cópia do banco
  if (quer("copia") && !parada) {
    const vencida = op.copiaAgora || copiaVencida(estado.copia?.quando ?? null, agora);
    if (!vencida) {
      const ultima = new Date(estado.copia!.quando);
      const proxima = new Date(ultima.getTime() + (DIAS_ENTRE_COPIAS - 0.5) * 24 * 3600 * 1000);
      anotar("copia", "pulada", `a última cópia foi em ${ultima.toLocaleDateString("pt-BR")}; a próxima, a partir de ${proxima.toLocaleDateString("pt-BR")} (ou com --backup)`);
    } else if (!existsSync(banco)) anotar("copia", "aviso", "sem banco para copiar");
    else {
      titulo(`Cópia do banco (repositório privado luneta-base, branch ${BRANCH_COPIA})`);
      const c = novo ? contar(novo) : null;
      const contagens = c ? `O site tinha ${numero(c.total)} imóveis (Caixa ${numero(c.caixa)}, leiloeiros ${numero(c.leiloeiros)}).` : "";
      try {
        copia = await fazerCopia({ banco, trabalho, url: urlCopia, agora, contagens, log: (t) => registro.linha(t) });
      } catch (e) {
        copia = { ok: false, mensagem: `a cópia falhou: ${(e as Error).message}` };
      }
      if (copia.ok) {
        estado.copia = { quando: agora.toISOString(), sha256: copia.sha256!, bytes: copia.bytes! };
        gravarJson(caminhoEstado, estado);
      }
      // falha da cópia só avisa: o site já foi atualizado
      anotar("copia", copia.ok ? "ok" : "aviso", copia.mensagem);
    }
  }

  return terminar();

  function terminar(): number {
    if (parada) codigo = 130;
    titulo("Resumo");
    const nomes: Record<string, string> = {
      banco: "Banco",
      caixa: "Caixa",
      leiloeiros: "Leiloeiros",
      fichas: "Fichas",
      riscos: "Riscos",
      localizacao: "Localização",
      exportar: "Instantâneo",
      trava: "Trava",
      publicar: "Publicação",
      copia: "Cópia do banco",
    };
    for (const r of relatorio) registro.linha(`  ${nomes[r.etapa]}: ${r.status === "ok" ? "ok" : r.status.toUpperCase()} · ${r.detalhe}`);
    if (!op.publicar) registro.linha("  Publicação: desligada (--sem-publicar).");
    const final =
      codigo === 0
        ? relatorio.some((r) => r.status === "aviso")
          ? "Pronto, com avisos (veja acima)."
          : "Pronto."
        : codigo === 6
          ? "Parado pela trava de segurança: o site NÃO foi atualizado."
          : codigo === 130
            ? "Interrompido: nada foi publicado pela metade."
            : "Terminou com erro (veja acima). Se não souber o que fazer, mande o arquivo coletas-pc/atualizar-site.log para o Claude.";
    registro.linha(`  ${final} Log: coletas-pc/atualizar-site.log · resultado: coletas-pc/atualizar-site.json`);
    try {
      gravarJson(join(pastaPc, "atualizar-site.json"), {
        quando: agora.toISOString(),
        terminado_em: new Date().toISOString(),
        codigo,
        opcoes: { etapas: op.etapas, publicar: op.publicar, forcar: op.forcar, backup: op.copiaAgora, banco_proprio: Boolean(op.banco) },
        etapas: relatorio,
        instantaneo: novo ? { gerado_em: novo.geradoEm, ...contar(novo), fontes: novo.fontes.length } : null,
        anterior: anterior ? { gerado_em: anterior.geradoEm, ...contar(anterior) } : null,
        trava,
        publicacao,
        copia: copia ? { ok: copia.ok, mensagem: copia.mensagem, sha256: copia.sha256 ?? null, bytes: copia.bytes ?? null } : null,
      });
    } catch {
      // o resumo na tela e no log já foi
    }
    return codigo;
  }
}

// O lançador (atualizar-site.mjs) marca LUNETA_ATUALIZAR_SITE=1 (o caminho do processo pode não bater com import.meta.url
// no Windows).
const peloLancador = process.env.LUNETA_ATUALIZAR_SITE === "1";
if (peloLancador || (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)) {
  delete process.env.LUNETA_ATUALIZAR_SITE;
  process.exitCode = await principal(process.argv.slice(2));
}
