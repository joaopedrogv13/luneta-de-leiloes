/**
 * Coleta no PC do dono: `node base/coleta-pc.mjs` (guia para quem não programa: base/COLETA-NO-PC.md).
 *
 * Duas fontes só abrem de uma rede no Brasil, e o GitHub Actions (servidores fora do Brasil) não chega a elas:
 * - as **fichas da Caixa** (matrícula, comarca, ofício, inscrição, averbação): o anti-robô barra os servidores de fora;
 * - o **ITBI de Belo Horizonte**: o portal da prefeitura responde HTTP 403 fora do Brasil.
 * Este comando roda as duas no PC do dono, com o mesmo cliente educado de sempre (User-Agent identificado, robots.txt,
 * 2 s entre páginas, parada depois de 5 bloqueios seguidos e 2 h de pausa antes de tentar de novo; nada de contornar
 * anti-robô), e publica o resultado no branch `coletas-dados` do GitHub, de onde a base aplica
 * (base/fontes/caixa/README.md e base/fontes/itbi/README.md).
 *
 *   node base/coleta-pc.mjs                            # fichas (todas, com retomada) + BH + envio ao GitHub
 *   node base/coleta-pc.mjs --etapas bh                # só BH
 *   node base/coleta-pc.mjs --uf RJ --limite 500       # só fichas do RJ, no máximo 500 nesta vez
 *   node base/coleta-pc.mjs --sem-publicar             # coleta e não envia
 *   node base/coleta-pc.mjs --so-publicar              # só envia o que já está em coletas-pc/
 *   npm run coleta:pc -- --uf RJ                       # o mesmo pelo npm (atalhos coleta:pc:fichas, :bh, :publicar)
 *
 * O guia manda rodar pelo `node`, não pelo `npm run`: no Windows, o PowerShell bloqueia o `npm` com a política de
 * execução padrão e engole o "--" das opções, e o Ctrl+C mata só o shell do npm (o terminal volta enquanto a coleta
 * ainda grava e envia em segundo plano).
 *
 * Tudo fica em `coletas-pc/` (ignorada pelo git): `fichas/<id13>.html` (o HTML da Caixa, que NÃO é publicado),
 * `fichas/fichas.json` (os campos lidos, com a máscara LGPD do parser: é o que vai ao GitHub), `fichas/resumo.json`,
 * `itbi/itbi-belo-horizonte.json` (agregados por cidade, bairro e rua, sem dado pessoal), `leiloeiros/*.jsonl` (o arquivo
 * dos leiloeiros que o exportador do PBCV grava: base/leiloeiros/pbcv/README.md), `log.txt` e `.em-uso` (a
 * trava que impede duas coletas ao mesmo tempo na mesma pasta, o que dobraria o ritmo de acesso à Caixa).
 * O envio usa um clone raso numa pasta temporária: o branch e os arquivos do dono não mudam.
 *
 * Sem dependência nova: Node 22.6+ (TypeScript direto), Git para o envio e, só para BH, Python 3 com pandas, numpy e
 * requests. `base/coleta-pc.mjs` confere a versão do Node antes de abrir este arquivo.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, statfs } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import {
  baixarFichas,
  criarParada,
  cerca,
  esperaInterrompivel,
  idsDoPedido,
  INSTANTANEO_PADRAO,
  INTERVALO_MS,
  lerInstantaneo,
  lerResumoAnterior,
  pausaDoBloqueio,
  regravarFichasJson,
  SEGUNDOS_POR_FICHA,
  type ItemFicha,
  type ResumoFichas,
} from "./fontes/caixa/baixar-fichas.ts";
import { UFS } from "./tipos.ts";
import { criarClienteHttp } from "./util/http.ts";

export const ETAPAS = ["fichas", "bh"] as const;
export type Etapa = (typeof ETAPAS)[number];
export const BRANCH = "coletas-dados";
/** Acima disso o fichas.json vai comprimido (o GitHub avisa em 50 MB e recusa arquivo de 100 MB). */
export const LIMITE_JSON_PUBLICADO = 40 * 1024 * 1024;
/** O log publicado é o pedaço desde o último envio, até este tamanho (o fim). */
export const LIMITE_LOG_PUBLICADO = 5 * 1024 * 1024;
export const NODE_MINIMO: readonly [number, number] = [22, 6];
export const INSTALAR_PYTHON_MODULOS = "pip install pandas numpy requests openpyxl";
/** O comando que o guia ensina (sem o npm: ver o topo). */
export const COMANDO = "node base/coleta-pc.mjs";
/** Pasta onde as fichas consolidadas ficam no branch: sempre a mesma (o fichas.json é cumulativo; o histórico guarda as antigas). */
export const DESTINO_FICHAS = "pc/fichas";
/** Pasta do JSONL dos leiloeiros (exportador do PBCV) no branch: sempre o mesmo arquivo, comprimido (~70 MB viram ~8 MB). */
export const DESTINO_LEILOEIROS = "pc/leiloeiros";
export const TRAVA = ".em-uso";
/** A trava vale enquanto o processo dela existe e bate o ponto (a cada 30 s) há menos que isto. */
export const TRAVA_VIVA_MS = 2 * 60 * 1000;
export const PREFIXO_TEMPORARIA = "luneta-publicar-";
/** Pasta temporária de envio interrompido (Ctrl+C duplo, janela fechada) mais velha que isto é apagada no envio seguinte. */
export const IDADE_TEMPORARIA_VELHA_MS = 6 * 3600 * 1000;

const numero = (n: number) => n.toLocaleString("pt-BR");

// ---------------------------------------------------------------------------------------------------------------------
// Opções

export interface OpcoesColetaPc {
  etapas: Etapa[];
  uf: string | null;
  limite: number | null;
  publicar: boolean;
  soPublicar: boolean;
  refazerFalhas: boolean;
  /** Não respeita a pausa de 2 h depois de uma recusa da Caixa (para quem trocou de rede, ex.: desligou a VPN). */
  semPausa: boolean;
  ajuda: boolean;
}

export class ErroOpcao extends Error {}

export const AJUDA = `Coleta no PC (fichas da Caixa e ITBI de Belo Horizonte). Guia: base/COLETA-NO-PC.md

  ${COMANDO}                       tudo: fichas, BH e envio ao GitHub
  ${COMANDO} --etapas bh           só BH
  ${COMANDO} --etapas fichas       só as fichas
  ${COMANDO} --uf RJ               fichas só de uma UF
  ${COMANDO} --limite 200          no máximo 200 fichas novas nesta vez
  ${COMANDO} --sem-publicar        não envia ao GitHub no fim
  ${COMANDO} --so-publicar         só envia o que já foi coletado
  ${COMANDO} --refazer-falhas      tenta de novo as fichas que falharam nos últimos 7 dias
  ${COMANDO} --sem-pausa           não espera as 2 h depois de um BLOQUEIO (só se você trocou de rede)

Também funciona pelo npm (no Mac, no Linux ou no Prompt de Comando do Windows): npm run coleta:pc -- --uf RJ
Pode parar com Ctrl+C a qualquer momento: o que já foi baixado fica salvo e a próxima vez continua de onde parou.`;

/** Opções da linha de comando. O npm sem "--" (comum no PowerShell) põe as opções em npm_config_*: elas valem também. */
export function lerOpcoes(argv: readonly string[], env: Readonly<Record<string, string | undefined>> = {}): OpcoesColetaPc {
  let v: Record<string, string | boolean | undefined>;
  let soltos: string[];
  try {
    const r = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        etapas: { type: "string" },
        uf: { type: "string" },
        limite: { type: "string" },
        publicar: { type: "boolean" },
        "sem-publicar": { type: "boolean" },
        "so-publicar": { type: "boolean" },
        "refazer-falhas": { type: "boolean" },
        "sem-pausa": { type: "boolean" },
        ajuda: { type: "boolean", short: "h" },
        help: { type: "boolean" },
      },
    });
    v = r.values;
    soltos = r.positionals;
  } catch (e) {
    // a mensagem do Node vem em inglês: diz só qual opção e o que houve
    const nome = /'(-{1,2}[^' ]+)/.exec((e as Error).message)?.[1] ?? "";
    const codigo = (e as NodeJS.ErrnoException).code;
    const exemplos: Record<string, string> = { "--uf": "--uf RJ", "--limite": "--limite 50", "--etapas": "--etapas bh" };
    const motivo =
      codigo === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE"
        ? `A opção ${nome} está sem valor${exemplos[nome] ? ` (ex.: ${exemplos[nome]})` : ""}.`
        : `Opção desconhecida: ${nome || (e as Error).message}.`;
    throw new ErroOpcao(`${motivo} Veja as opções com: ${COMANDO} --ajuda`);
  }
  if (soltos.length) {
    throw new ErroOpcao(
      `Recebi "${soltos.join(" ")}" sem uma opção antes. Se você usou "npm run" no PowerShell, o npm engoliu as opções: ` +
        `rode "${COMANDO}" com as mesmas opções (ex.: ${COMANDO} --uf RJ).`,
    );
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

  const ajuda = v.ajuda === true || v.help === true;
  const soPublicar = ligado("so-publicar", "so_publicar");
  const semPublicar = ligado("sem-publicar", "sem_publicar");
  if (v.publicar === true && semPublicar) throw new ErroOpcao("Use --publicar ou --sem-publicar, não os dois.");
  if (soPublicar && semPublicar) throw new ErroOpcao("--so-publicar e --sem-publicar juntos não fazem nada.");

  let etapas: Etapa[] = [...ETAPAS];
  const etapasTexto = texto("etapas");
  if (soPublicar) {
    if (etapasTexto) throw new ErroOpcao("--so-publicar não roda etapas: tire o --etapas.");
    etapas = [];
  } else if (etapasTexto !== undefined) {
    const pedidas = etapasTexto.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!pedidas.length) throw new ErroOpcao("--etapas vazio. Use fichas, bh ou fichas,bh.");
    const escolhidas = new Set<Etapa>();
    for (const p of pedidas) {
      if (p === "tudo") ETAPAS.forEach((e) => escolhidas.add(e));
      else if ((ETAPAS as readonly string[]).includes(p)) escolhidas.add(p as Etapa);
      else throw new ErroOpcao(`Etapa desconhecida "${p}". Use fichas, bh ou fichas,bh.`);
    }
    etapas = ETAPAS.filter((e) => escolhidas.has(e));
  }

  const ufTexto = texto("uf");
  let uf: string | null = null;
  if (ufTexto !== undefined) {
    uf = ufTexto.trim().toUpperCase();
    if (!(UFS as readonly string[]).includes(uf)) throw new ErroOpcao(`UF "${ufTexto}" não existe. Use a sigla: RJ, SP, MG...`);
  }

  const limiteTexto = texto("limite");
  let limite: number | null = null;
  if (limiteTexto !== undefined) {
    if (!/^\d+$/.test(limiteTexto.trim()) || Number(limiteTexto) < 1) throw new ErroOpcao(`--limite precisa de um número inteiro maior que zero (recebi "${limiteTexto}").`);
    limite = Number(limiteTexto);
  }

  return {
    etapas,
    uf,
    limite,
    publicar: !semPublicar,
    soPublicar,
    refazerFalhas: ligado("refazer-falhas", "refazer_falhas"),
    semPausa: ligado("sem-pausa", "sem_pausa"),
    ajuda,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pré-requisitos

export function versaoAtende(versao: string, minima: readonly [number, number] = NODE_MINIMO): boolean {
  const [maior = 0, menor = 0] = versao.replace(/^v/, "").split(".").map((x) => Number.parseInt(x, 10));
  return maior > minima[0] || (maior === minima[0] && menor >= minima[1]);
}

/** Comandos do Python a tentar, na ordem. No Windows, o lançador `py -3` vem antes: `python` pode ser o atalho da loja. */
export function candidatosPython(plataforma: string): string[][] {
  return plataforma === "win32" ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]];
}

export type Rodar = (comando: string, args: readonly string[]) => { status: number | null; stdout: string };

const rodarSync: Rodar = (comando, args) => {
  const r = spawnSync(comando, [...args], { encoding: "utf8", timeout: 60_000, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  return { status: r.error ? null : r.status, stdout: r.stdout ?? "" };
};

export interface Python {
  comando: string[];
  versao: string;
  faltando: string[];
}

/** O primeiro Python 3.9+ que responde, com os módulos que faltam (pandas, numpy, requests, openpyxl). */
export function acharPython(plataforma: string = process.platform, rodar: Rodar = rodarSync): Python | null {
  for (const c of candidatosPython(plataforma)) {
    const [cmd, ...pre] = c as [string, ...string[]];
    const r = rodar(cmd, [...pre, "-c", "import sys; print('%d.%d.%d' % sys.version_info[:3])"]);
    const versao = r.stdout.trim();
    if (r.status !== 0 || !/^3\.\d+\.\d+$/.test(versao) || !versaoAtende(versao, [3, 9])) continue;
    const m = rodar(cmd, [...pre, "-c", "import importlib.util as u; print(','.join(m for m in ('pandas','numpy','requests','openpyxl') if u.find_spec(m) is None))"]);
    const faltando = m.status === 0 ? m.stdout.trim().split(",").filter(Boolean) : ["pandas", "numpy", "requests", "openpyxl"];
    return { comando: c, versao, faltando };
  }
  return null;
}

/** Tira usuário e senha de uma URL de git ("https://eu:token@github.com/..." → "https://***@github.com/..."). */
export function mascararUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]+@/i, "$1***@");
}

export interface Checagem {
  item: string;
  ok: boolean;
  detalhe: string;
  /** O que fazer, quando falta. */
  resolver?: string;
  /** O que fica sem rodar quando falta. */
  afeta: "tudo" | Etapa | "publicar";
  /** Só um aviso (não impede nada). */
  aviso?: boolean;
}

// ---------------------------------------------------------------------------------------------------------------------
// Trava: uma coleta por vez na mesma pasta

export interface Trava {
  pid: number;
  inicio: string;
  /** Último "estou vivo" (ISO). */
  batida: string;
}

/** O processo existe? (EPERM: existe, mas é de outro usuário.) */
export function processoVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * A trava de outra coleta que ainda está rodando, ou null. Trava velha (o PC desligou, a janela foi fechada) não conta:
 * o processo dela não existe mais ou parou de bater o ponto há mais de TRAVA_VIVA_MS (o número do processo pode ter
 * sido reaproveitado pelo sistema depois de reiniciar).
 */
export function travaDeOutro(pasta: string, agora: number = Date.now(), vivo: (pid: number) => boolean = processoVivo): Trava | null {
  let t: Trava;
  try {
    t = JSON.parse(readFileSync(join(pasta, TRAVA), "utf8")) as Trava;
  } catch {
    return null;
  }
  if (!t || typeof t.pid !== "number" || t.pid === process.pid) return null;
  const batida = Date.parse(t.batida);
  if (!Number.isFinite(batida) || agora - batida > TRAVA_VIVA_MS) return null;
  return vivo(t.pid) ? t : null;
}

/** Grava a trava deste processo e a mantém viva; devolve a função que a solta (também chamada na saída). */
export function pegarTrava(pasta: string): () => void {
  const caminho = join(pasta, TRAVA);
  const inicio = new Date().toISOString();
  const bater = () => {
    try {
      writeFileSync(caminho, JSON.stringify({ pid: process.pid, inicio, batida: new Date().toISOString() } satisfies Trava));
    } catch {
      // disco cheio ou arquivo preso: a trava é proteção, não pode derrubar a coleta
    }
  };
  bater();
  const relogio = setInterval(bater, 30_000);
  relogio.unref();
  let solta = false;
  const soltar = () => {
    if (solta) return;
    solta = true;
    clearInterval(relogio);
    try {
      const t = JSON.parse(readFileSync(caminho, "utf8")) as Trava;
      if (t.pid === process.pid) unlinkSync(caminho);
    } catch {
      // já não existe
    }
  };
  process.on("exit", soltar);
  return soltar;
}

// ---------------------------------------------------------------------------------------------------------------------
// Registro (tela + coletas-pc/log.txt)

export interface Registro {
  /** Mostra na tela e grava no log. */
  linha(texto: string): void;
  /** Só no log (detalhe do cliente HTTP, por exemplo). */
  arquivo(texto: string): void;
  readonly caminho: string;
}

const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Tira do texto os caminhos do PC (pasta do projeto, pasta temporária e pasta do usuário): o log vai para um branch
 * público. Caminho do Windows ("C:\...") é trocado sem olhar maiúsculas e minúsculas; a pasta temporária pode vir na
 * forma curta, com parte do nome do usuário (C:\Users\JOOPED~1\AppData\Local\Temp).
 */
export function anonimizar(texto: string, raiz: string, casa: string = homedir(), temporaria: string = tmpdir()): string {
  let t = texto;
  for (const [de, para] of [[raiz, "<projeto>"], [temporaria, "<temp>"], [casa, "~"]] as const) {
    if (!de || de.length < 4) continue;
    const semBarraFinal = de.replace(/[\\/]+$/, "");
    const windows = /^[a-z]:[\\/]/i.test(semBarraFinal);
    for (const forma of new Set([semBarraFinal, semBarraFinal.replace(/\\/g, "/"), semBarraFinal.replace(/\//g, "\\")])) {
      t = windows ? t.replace(new RegExp(escaparRegex(forma), "gi"), para) : t.split(forma).join(para);
    }
  }
  return t;
}

export function criarRegistro(caminho: string, raiz: string, tela: (t: string) => void = console.log): Registro {
  mkdirSync(dirname(caminho), { recursive: true });
  const hora = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const gravar = (t: string) => {
    const limpo = anonimizar(t, raiz);
    try {
      appendFileSync(caminho, limpo.split("\n").map((l) => `${hora()} ${l}`).join("\n") + "\n");
    } catch {
      // log é ajuda, não pode derrubar a coleta (disco cheio, arquivo aberto em outro programa)
    }
  };
  return {
    caminho,
    linha(t) {
      tela(t);
      gravar(t);
    },
    arquivo: gravar,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Publicação no branch coletas-dados

export interface ResultadoComando {
  status: number;
  saida: string;
  erro: string;
}

export type RodarGit = (args: readonly string[], cwd: string) => Promise<ResultadoComando>;

/** Git sem shell. A entrada fica no terminal: se o git pedir usuário e senha, o dono vê e responde. */
export const rodarGit: RodarGit = (args, cwd) =>
  new Promise((resolver) => {
    let saida = "";
    let erro = "";
    let filho: ChildProcess;
    try {
      filho = spawn("git", [...args], { cwd, stdio: ["inherit", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      resolver({ status: 127, saida: "", erro: (e as Error).message });
      return;
    }
    filho.stdout?.on("data", (d: Buffer) => (saida += d.toString("utf8")));
    filho.stderr?.on("data", (d: Buffer) => (erro += d.toString("utf8")));
    filho.on("error", (e) => resolver({ status: 127, saida, erro: erro + e.message }));
    filho.on("close", (codigo) => resolver({ status: codigo ?? 1, saida, erro }));
  });

export interface ArquivoParaPublicar {
  /** Caminho no PC. */
  origem: string;
  /** Caminho no branch (com "/"). */
  destino: string;
  comprimir?: boolean;
  /** Variante a apagar no branch (fichas.json ↔ fichas.json.gz). */
  remover?: string;
}

/** Data local AAAA-MM-DD (a pasta pc/<data>/ do log no branch). */
export function dataLocal(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * O que vai ao branch: `pc/fichas/fichas.json` (ou `.json.gz` acima de 40 MB) e `pc/fichas/resumo.json`, sempre no
 * mesmo lugar (o fichas.json junta todas as fichas da pasta; uma cópia por dia faria o clone de cada envio crescer
 * dezenas de MB por dia); `itbi/*.json` e o log de BH em `itbi/`, como o Actions publica; os JSONL dos leiloeiros
 * (`leiloeiros/*.jsonl`, sempre .gz) e o resumo deles em `pc/leiloeiros/`. Nunca os HTML das fichas.
 */
export function arquivosParaPublicar(pasta: string, limite: number = LIMITE_JSON_PUBLICADO): ArquivoParaPublicar[] {
  const lista: ArquivoParaPublicar[] = [];
  const fichas = join(pasta, "fichas");
  const json = join(fichas, "fichas.json");
  if (existsSync(json)) {
    const grande = statSync(json).size > limite;
    lista.push(
      grande
        ? { origem: json, destino: `${DESTINO_FICHAS}/fichas.json.gz`, comprimir: true, remover: `${DESTINO_FICHAS}/fichas.json` }
        : { origem: json, destino: `${DESTINO_FICHAS}/fichas.json`, remover: `${DESTINO_FICHAS}/fichas.json.gz` },
    );
  }
  const resumo = join(fichas, "resumo.json");
  if (existsSync(resumo)) lista.push({ origem: resumo, destino: `${DESTINO_FICHAS}/resumo.json` });
  const itbi = join(pasta, "itbi");
  if (existsSync(itbi)) {
    for (const nome of readdirSync(itbi).sort()) {
      if (/\.json$/i.test(nome) || nome === "log-belo-horizonte.txt") lista.push({ origem: join(itbi, nome), destino: `itbi/${nome}` });
    }
  }
  const leiloeiros = join(pasta, "leiloeiros");
  if (existsSync(leiloeiros)) {
    for (const nome of readdirSync(leiloeiros).sort()) {
      const origem = join(leiloeiros, nome);
      if (/\.jsonl$/i.test(nome)) {
        lista.push({ origem, destino: `${DESTINO_LEILOEIROS}/${nome}.gz`, comprimir: true, remover: `${DESTINO_LEILOEIROS}/${nome}` });
      } else if (/\.json$/i.test(nome)) lista.push({ origem, destino: `${DESTINO_LEILOEIROS}/${nome}` });
    }
  }
  return lista;
}

/**
 * Por que este JSON não pode ir ao branch (vazio, cortado por queda de energia ou Ctrl+C no meio da gravação, não é
 * JSON, fichas.json sem os campos), ou null. Um arquivo assim publicado apagaria o bom que já está lá.
 */
export function motivoJsonInvalido(caminho: string, ehFichas = false): string | null {
  let valor: unknown;
  try {
    const texto = readFileSync(caminho, "utf8");
    if (!texto.trim()) return "arquivo vazio";
    valor = JSON.parse(texto);
  } catch (e) {
    return `não é um JSON inteiro (${(e as Error).message.slice(0, 100)})`;
  }
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return "não é um objeto JSON";
  if (ehFichas) {
    const v = valor as { lidas_em?: unknown; fichas?: unknown };
    if (typeof v.lidas_em !== "string" || typeof v.fichas !== "object" || v.fichas === null) return "sem os campos lidas_em e fichas";
  }
  return null;
}

/**
 * Por que este JSONL não pode ir ao branch (vazio, cortado no meio de uma linha, linha que não é um objeto JSON), ou
 * null. Igual ao motivoJsonInvalido: um arquivo quebrado publicado tomaria o lugar do bom.
 */
export function motivoJsonlInvalido(caminho: string): string | null {
  let texto: string;
  try {
    texto = readFileSync(caminho, "utf8");
  } catch (e) {
    return `não li o arquivo (${(e as Error).message.slice(0, 100)})`;
  }
  const linhas = texto.split("\n");
  let validas = 0;
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]!.trim();
    if (!linha) continue;
    try {
      const valor: unknown = JSON.parse(linha);
      if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return `a linha ${i + 1} não é um objeto JSON`;
    } catch {
      return `a linha ${i + 1} não é um JSON inteiro (arquivo cortado?)`;
    }
    validas++;
  }
  return validas === 0 ? "arquivo vazio" : null;
}

export type ProblemaPush = "credencial" | "rede" | "outro";

export function diagnosticarPush(erro: string): ProblemaPush {
  if (/Authentication failed|could not read (Username|Password)|Permission denied|denied to|Invalid username or password|terminal prompts disabled|requested URL returned error: 40[13]|HTTP 40[13]|Write access to repository not granted|publickey/i.test(erro)) return "credencial";
  if (/Could not resolve host|unable to access|timed out|Connection (refused|reset|timed out)|Failed to connect|Network is unreachable|early EOF|RPC failed/i.test(erro)) return "rede";
  return "outro";
}

export function instrucoesDoPush(problema: ProblemaPush, erro: string): string {
  const depois = `Depois rode só o envio: ${COMANDO} --so-publicar`;
  if (problema === "credencial") {
    return [
      "O GitHub não aceitou o envio: falta entrar com a conta que pode gravar no repositório.",
      "Os dados continuam salvos no seu PC, em coletas-pc/. Para enviar:",
      "  1. Instale o GitHub CLI: https://cli.github.com",
      "  2. Rode: gh auth login   (escolha GitHub.com, HTTPS e \"Login with a web browser\"; entre com a conta dona do repositório)",
      "  3. Rode: gh auth setup-git",
      `  4. ${depois}`,
      "No Windows, o Git costuma abrir sozinho uma janela do navegador para entrar no GitHub: entre com a conta dona do repositório.",
    ].join("\n");
  }
  if (problema === "rede") return `Sem conexão com o GitHub agora. Os dados continuam em coletas-pc/. Quando a internet voltar: ${depois}`;
  return `O envio falhou. Os dados continuam em coletas-pc/. Mande para o Claude as últimas linhas abaixo e o arquivo coletas-pc/log.txt.\n${erro.trim().split("\n").slice(-8).join("\n")}\n${depois}`;
}

export interface OpcoesPublicar {
  /** Pasta do projeto (o clone do dono). */
  raiz: string;
  /** coletas-pc/ */
  pasta: string;
  data: string;
  /** URL do repositório (padrão: o origin do clone do dono). */
  remoto?: string;
  /** Arquivos gerados na hora (log, última execução): destino → conteúdo; `anexar` junta ao que já está no branch. */
  extras?: { destino: string; conteudo: string; anexar?: boolean }[];
  log: (t: string) => void;
  git?: RodarGit;
  tentativas?: number;
  /** Tamanho a partir do qual o fichas.json vai comprimido (padrão LIMITE_JSON_PUBLICADO). */
  limiteJson?: number;
  /** Espera entre os envios que não passaram (padrão: setTimeout; nos testes, nada). */
  esperar?: (ms: number) => Promise<void>;
  /** Onde criar a pasta temporária (padrão: a do sistema). */
  temporarias?: string;
}

export interface ResultadoPublicacao {
  ok: boolean;
  /** "nada novo" quando não havia o que mudar no branch. */
  mensagem: string;
  commit?: string;
  enviados: string[];
  /** Arquivos que não foram por estarem quebrados (o do branch fica como estava). */
  recusados: { destino: string; motivo: string }[];
  problema?: ProblemaPush;
}

export const mensagemDoCommit = (data: string) => `Coleta no PC (fichas da Caixa, ITBI BH) ${data}`;

/** A pasta temporária do envio em andamento: se o processo sair no meio (Ctrl+C duplo), o 'exit' a apaga. */
let temporariaEmUso: string | null = null;

export function apagarTemporariaEmUso(): void {
  if (!temporariaEmUso) return;
  try {
    rmSync(temporariaEmUso, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // o sistema limpa depois; o próximo envio também
  }
  temporariaEmUso = null;
}

/** Apaga as sobras de envios interrompidos (janela fechada no meio) com mais de IDADE_TEMPORARIA_VELHA_MS. */
export function limparTemporariasVelhas(dir: string = tmpdir(), agora: number = Date.now()): number {
  let apagadas = 0;
  let nomes: string[];
  try {
    nomes = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const nome of nomes) {
    if (!nome.startsWith(PREFIXO_TEMPORARIA)) continue;
    const caminho = join(dir, nome);
    try {
      if (agora - statSync(caminho).mtimeMs < IDADE_TEMPORARIA_VELHA_MS) continue;
      rmSync(caminho, { recursive: true, force: true, maxRetries: 3 });
      apagadas++;
    } catch {
      // presa por outro programa: fica para a próxima
    }
  }
  return apagadas;
}

const esperarPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Copia os arquivos para um clone raso do branch numa pasta temporária, faz o commit e envia (3 tentativas, com rebase). */
export async function publicar(op: OpcoesPublicar): Promise<ResultadoPublicacao> {
  const git = op.git ?? rodarGit;
  const tentativas = op.tentativas ?? 3;
  const esperar = op.esperar ?? esperarPadrao;
  const recusados: { destino: string; motivo: string }[] = [];
  const arquivos = arquivosParaPublicar(op.pasta, op.limiteJson).filter((a) => {
    const jsonl = /\.jsonl$/i.test(a.origem);
    if (!jsonl && !/\.json$/i.test(a.origem)) return true;
    const motivo = jsonl ? motivoJsonlInvalido(a.origem) : motivoJsonInvalido(a.origem, a.destino.startsWith(`${DESTINO_FICHAS}/fichas.json`));
    if (!motivo) return true;
    recusados.push({ destino: a.destino, motivo });
    op.log(`Não envio ${a.destino}: ${motivo}. O que já está no branch fica como estava.`);
    return false;
  });
  const extras = op.extras ?? [];
  if (!arquivos.length && !extras.length) return { ok: true, mensagem: "nada para enviar (coletas-pc/ está vazia)", enviados: [], recusados };

  let remoto = op.remoto;
  if (!remoto) {
    const r = await git(["remote", "get-url", "origin"], op.raiz);
    if (r.status !== 0 || !r.saida.trim()) return { ok: false, mensagem: "o clone não tem o endereço do GitHub (origin)", enviados: [], recusados, problema: "outro" };
    remoto = r.saida.trim();
  }
  const dirTemporarias = op.temporarias ?? tmpdir();
  limparTemporariasVelhas(dirTemporarias);
  const temporaria = await mkdtemp(join(dirTemporarias, PREFIXO_TEMPORARIA));
  temporariaEmUso = temporaria;
  const repo = join(temporaria, "repo");
  const enviados = [...arquivos.map((a) => a.destino), ...extras.map((e) => e.destino)];

  const aplicar = () => {
    for (const a of arquivos) {
      const destino = join(repo, ...a.destino.split("/"));
      mkdirSync(dirname(destino), { recursive: true });
      if (a.comprimir) writeFileSync(destino, gzipSync(readFileSync(a.origem), { level: 9 }));
      else copyFileSync(a.origem, destino);
      if (a.remover) rmSync(join(repo, ...a.remover.split("/")), { force: true });
    }
    for (const e of extras) {
      const destino = join(repo, ...e.destino.split("/"));
      mkdirSync(dirname(destino), { recursive: true });
      const antes = e.anexar && existsSync(destino) ? readFileSync(destino, "utf8") : "";
      writeFileSync(destino, antes + e.conteudo);
    }
  };
  // Sem conversão de fim de linha em nenhum passo: o Git para Windows vem com core.autocrlf=true, que no checkout troca
  // LF por CRLF; o commit levaria CRLF de volta aos arquivos que o Actions publicou (itbi/*.json, logs).
  const SEM_CRLF = ["-c", "core.autocrlf=false", "-c", "core.safecrlf=false", "-c", "core.eol=lf"];
  const commitar = async (): Promise<"feito" | "nada" | ResultadoComando> => {
    const add = await git([...SEM_CRLF, "add", "-A"], repo);
    if (add.status !== 0) return add;
    const diff = await git(["diff", "--cached", "--quiet"], repo);
    if (diff.status === 0) return "nada";
    const c = await git([...SEM_CRLF, "commit", "-q", "-m", mensagemDoCommit(op.data)], repo);
    return c.status === 0 ? "feito" : c;
  };
  const falhou = (r: ResultadoComando): ResultadoPublicacao => {
    const erro = mascararTudo(r.erro || r.saida);
    const problema = diagnosticarPush(erro);
    return { ok: false, mensagem: instrucoesDoPush(problema, erro), enviados: [], recusados, problema };
  };

  try {
    op.log(`Enviando para o GitHub (${mascararUrl(remoto)}, branch ${BRANCH}): ${enviados.join(", ")}`);
    const existe = await git(["ls-remote", "--exit-code", "--heads", remoto, BRANCH], op.raiz);
    if (existe.status === 0) {
      // "-c" depois de "clone" fica gravado no clone: vale para o checkout e para todos os comandos seguintes
      const clone = await git(
        ["clone", "-q", "-c", "core.autocrlf=false", "-c", "core.safecrlf=false", "-c", "core.eol=lf", "--depth", "1", "--branch", BRANCH, "--single-branch", "--no-tags", remoto, repo],
        temporaria,
      );
      if (clone.status !== 0) return falhou(clone);
    } else if (existe.status === 2) {
      // o branch ainda não existe: começa um do zero
      mkdirSync(repo, { recursive: true });
      for (const args of [["init", "-q"], ["config", "core.autocrlf", "false"], ["checkout", "-q", "-b", BRANCH], ["remote", "add", "origin", remoto]]) {
        const r = await git(args, repo);
        if (r.status !== 0) return falhou(r);
      }
    } else {
      return falhou(existe);
    }
    if ((await git(["config", "user.email"], repo)).status !== 0) {
      await git(["config", "user.name", "Coleta no PC (Luneta)"], repo);
      await git(["config", "user.email", "coleta-pc@users.noreply.github.com"], repo);
    }
    aplicar();
    const c = await commitar();
    if (c === "nada") return { ok: true, mensagem: "nada novo (o branch já tem estes arquivos)", enviados: [], recusados };
    if (c !== "feito") return falhou(c);

    let ultimo: ResultadoComando | null = null;
    for (let i = 1; i <= tentativas; i++) {
      const push = await git(["push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`], repo);
      if (push.status === 0) {
        const sha = (await git(["rev-parse", "--short", "HEAD"], repo)).saida.trim();
        return { ok: true, mensagem: `enviado (commit ${sha} em ${BRANCH})`, commit: sha, enviados, recusados };
      }
      ultimo = push;
      if (diagnosticarPush(push.erro) === "credencial") break;
      if (i === tentativas) break;
      op.log(`Envio ${i} de ${tentativas} não passou; buscando o que chegou no branch e tentando de novo.`);
      await esperar(i * 5000);
      const busca = await git(["fetch", "-q", "origin", BRANCH], repo);
      if (busca.status !== 0) continue;
      const rebase = await git([...SEM_CRLF, "rebase", "-q", "FETCH_HEAD"], repo);
      if (rebase.status !== 0) {
        // conflito (ex.: o Actions publicou itbi/ ao mesmo tempo): refaz o commit em cima do branch novo, com os nossos
        await git(["rebase", "--abort"], repo);
        await git(["reset", "-q", "--hard", "FETCH_HEAD"], repo);
        aplicar();
        const refeito = await commitar();
        if (refeito === "nada") return { ok: true, mensagem: "nada novo (o branch já tem estes arquivos)", enviados: [], recusados };
        if (refeito !== "feito") return falhou(refeito);
      }
    }
    return falhou(ultimo ?? { status: 1, saida: "", erro: "push não tentado" });
  } finally {
    apagarTemporariaEmUso();
  }
}

const mascararTudo = (t: string) => t.replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s]+@/gi, "$1***@");

// ---------------------------------------------------------------------------------------------------------------------
// Etapa BH (Python)

export interface ResultadoBh {
  status: "ok" | "bloqueio" | "falha" | "interrompido";
  detalhe: string;
}

/**
 * Por que o bh.py falhou, pela saída dele. Bloqueio é só a recusa de verdade do portal: `comum.baixar` escreve
 * "HTTP 403 em <url> (bloqueio: não contornado)". A frase final do bh.py fala em 403 em qualquer falha, e um proxy ou a
 * falta de internet também aparecem como erro de conexão: esses viram "sem conexão". Certificado recusado (antivírus que
 * inspeciona HTTPS, comum no Windows) tem mensagem própria: não adianta conferir a internet.
 */
export function classificarFalhaBh(saida: string, codigo: number | null): ResultadoBh {
  if (/HTTP (403|429) em \S+ \(bloqueio/i.test(saida)) return { status: "bloqueio", detalhe: "o portal da prefeitura recusou o acesso (HTTP 403/429)" };
  if (/SSLError|CERTIFICATE_VERIFY_FAILED|certificate verify failed/i.test(saida)) {
    return {
      status: "falha",
      detalhe: "o Python não aceitou o certificado de segurança do portal da prefeitura (um antivírus que inspeciona HTTPS costuma causar isso); avise o Claude e mande o arquivo coletas-pc/log.txt",
    };
  }
  if (/ConnectionError|NameResolutionError|Failed to resolve|getaddrinfo|ProxyError|Max retries exceeded|timed out|ConnectTimeout/i.test(saida)) {
    return { status: "falha", detalhe: "não consegui abrir o portal da prefeitura (sem internet, proxy ou portal fora do ar); confira a internet e tente de novo" };
  }
  return { status: "falha", detalhe: `o conector terminou com erro (código ${codigo ?? "?"}); veja coletas-pc/itbi/log-belo-horizonte.txt` };
}

/** Troca `destino` por `origem` (no Windows, um antivírus pode segurar o arquivo: copia e apaga). */
function moverPorCima(origem: string, destino: string): void {
  try {
    renameSync(origem, destino);
  } catch {
    copyFileSync(origem, destino);
    rmSync(origem, { force: true });
  }
}

function rodarBh(raiz: string, pasta: string, python: Python, registro: Registro, aoIniciar: (filho: ChildProcess) => void, interrompido: () => boolean): Promise<ResultadoBh> {
  const dir = join(pasta, "itbi");
  mkdirSync(dir, { recursive: true });
  const saida = join(dir, "itbi-belo-horizonte.json");
  // o bh.py grava direto no arquivo: grava num ".parcial" (que não vai ao GitHub) e só vira o oficial se terminar bem.
  // Assim um Ctrl+C ou uma queda de energia no meio da gravação não deixa um JSON cortado para o envio.
  const parcial = `${saida}.parcial`;
  const logBh = join(dir, "log-belo-horizonte.txt");
  rmSync(parcial, { force: true });
  writeFileSync(logBh, "");
  const [cmd, ...pre] = python.comando as [string, ...string[]];
  registro.linha(`ITBI de Belo Horizonte: ${python.comando.join(" ")} bh.py (portal de dados abertos da PBH; pode levar alguns minutos)`);
  return new Promise((resolver) => {
    let texto = "";
    let resto = "";
    // na pasta do conector: os imports (ckan, comum, agregar...) são irmãos do bh.py
    const filho = spawn(cmd, [...pre, "bh.py", parcial], {
      cwd: join(raiz, "base", "fontes", "itbi"),
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", PYTHONUNBUFFERED: "1" },
      windowsHide: true,
    });
    aoIniciar(filho);
    const linhas = (d: Buffer) => {
      resto += d.toString("utf8");
      const partes = resto.split(/\r?\n/);
      resto = partes.pop() ?? "";
      for (const l of partes) {
        texto += l + "\n";
        registro.linha(`  BH | ${l}`);
        try {
          appendFileSync(logBh, anonimizar(l, raiz) + "\n");
        } catch {
          // log é ajuda
        }
      }
    };
    filho.stdout.on("data", linhas);
    filho.stderr.on("data", linhas);
    filho.on("error", (e) => resolver({ status: "falha", detalhe: `não consegui abrir o Python (${e.message})` }));
    filho.on("close", (codigo, sinal) => {
      if (resto) linhas(Buffer.from("\n"));
      const pronto = codigo === 0 && existsSync(parcial);
      const quebrado = pronto ? motivoJsonInvalido(parcial) : null;
      if (pronto && !quebrado) {
        moverPorCima(parcial, saida);
        resolver({ status: "ok", detalhe: "coletas-pc/itbi/itbi-belo-horizonte.json" });
        return;
      }
      rmSync(parcial, { force: true });
      if (sinal || codigo === null || interrompido()) resolver({ status: "interrompido", detalhe: "interrompido com Ctrl+C" });
      else if (quebrado) resolver({ status: "falha", detalhe: `o conector terminou sem um JSON válido (${quebrado}); veja coletas-pc/itbi/log-belo-horizonte.txt` });
      else resolver(classificarFalhaBh(texto, codigo));
    });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Programa

const LINHA = "=".repeat(78);

/** "às 14:05", ou "em 18/10, às 14:05" se não for hoje (hora do PC). */
export function quando(d: Date, agora: Date = new Date()): string {
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (dataLocal(d) === dataLocal(agora)) return `às ${hora}`;
  return `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, às ${hora}`;
}

/** "a partir das 16:05", ou "a partir de 19/10, às 16:05" se não for hoje. */
export function aPartirDe(d: Date, agora: Date = new Date()): string {
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (dataLocal(d) === dataLocal(agora)) return `a partir das ${hora}`;
  return `a partir de ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, às ${hora}`;
}

/** O certificado do site não foi aceito (antivírus que inspeciona HTTPS, rede de empresa): não é bloqueio nem internet. */
const ERRO_DE_CERTIFICADO = /CERT_|certificate|UNABLE_TO_VERIFY|SELF_SIGNED|unable to get local issuer/i;

/** O aviso de BLOQUEIO / SEM CONEXÃO: sem internet (robots.txt inacessível por falha de rede), certificado ou recusa da Caixa. */
export function textoDoBloqueio(motivo: string, liberadoEm?: string): string {
  const semRede = /inacess[ií]vel \((falha de rede|tempo esgotado)/i.test(motivo) || /^(falha de rede|tempo esgotado)/i.test(motivo);
  let corpo: string[];
  if (semRede && ERRO_DE_CERTIFICADO.test(motivo)) {
    corpo = [
      "SEM CONEXÃO: o Node não aceitou o certificado de segurança do site da Caixa. Não é bloqueio da Caixa.",
      "Costuma ser um antivírus que inspeciona sites seguros (HTTPS) ou uma rede de empresa.",
      "O que fazer: avise o Claude e mande o arquivo coletas-pc/log.txt. Não desligue o antivírus por conta própria.",
    ];
  } else if (semRede) {
    corpo = [
      "SEM CONEXÃO: não consegui abrir o site da Caixa (sem internet, ou o site fora do ar). Não é bloqueio da Caixa.",
      "O que fazer: confira a internet e rode de novo. O que já foi baixado não é baixado de novo.",
    ];
  } else {
    corpo = [
      "BLOQUEIO: a Caixa recusou 5 fichas seguidas (página de desafio anti-robô, robots.txt ou HTTP 403/429).",
      "O que fazer: NÃO tente contornar (nada de VPN, outro navegador ou programa que imite navegador).",
      liberadoEm
        ? `Pare por agora e rode de novo ${liberadoEm} (antes disso o programa nem tenta as fichas).`
        : "Pare por agora e rode de novo mais tarde (algumas horas, ou amanhã).",
      "O que já foi baixado não é baixado de novo.",
      "Se você está numa VPN ou rede de empresa, desligue a VPN e use a internet de casa. Se acontecer sempre, avise o Claude.",
    ];
  }
  return [LINHA, ...corpo, `Último motivo: ${motivo}`, LINHA].join("\n");
}

/** A frase do resumo para as fichas desta execução. */
export function resumoDasFichas(r: ResumoFichas, liberadoEm?: string): string {
  const baixadas = r.puladosNaPasta + r.ok.length;
  let texto = `Fichas: ${numero(r.ok.length)} novas nesta vez; ${numero(baixadas)} de ${numero(r.pedidos)} já baixadas`;
  if (r.restantes > 0) {
    const tempo = cerca(r.restantes * SEGUNDOS_POR_FICHA);
    if (r.parada === "bloqueio") texto += `; faltam ${numero(r.restantes)} (${tempo}): rode o mesmo comando de novo ${liberadoEm ?? "mais tarde"}`;
    else if (r.parada === "sem_conexao") texto += `; faltam ${numero(r.restantes)} (${tempo}): confira a internet e rode o mesmo comando de novo`;
    else texto += `; faltam ${numero(r.restantes)} (${tempo}): rode o mesmo comando de novo para continuar`;
  } else {
    texto += r.comFalhaGuardada > 0 ? "; nada mais a baixar por agora" : "; todas baixadas";
  }
  if (r.comFalhaGuardada > 0) {
    texto += `. ${numero(r.comFalhaGuardada)} não abriram (página sem a ficha, ou o imóvel saiu da venda): o programa tenta de novo sozinho daqui a 7 dias, não precisa fazer nada`;
  }
  texto += ".";
  if (r.bloqueio.length) texto += ` Recusas: ${numero(r.bloqueio.length)}.`;
  if (r.falha.length) texto += ` Falhas nesta vez: ${numero(r.falha.length)}.`;
  return texto;
}

export async function principal(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const raiz = resolve(import.meta.dirname, "..");
  process.chdir(raiz);
  let op: OpcoesColetaPc;
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
  const pasta = join(raiz, "coletas-pc");
  mkdirSync(pasta, { recursive: true });

  // --- uma coleta por vez: duas janelas ao mesmo tempo dobrariam o ritmo de acesso à Caixa e brigariam pelos arquivos
  const outra = travaDeOutro(pasta);
  if (outra) {
    console.error(
      `Já tem uma coleta rodando neste PC (começou ${quando(new Date(outra.inicio))}, em outra janela do terminal).\n` +
        "Espere ela terminar (aparece \"pode fechar a janela\"), ou pare aquela com Ctrl+C, e rode de novo.",
    );
    return 4;
  }
  pegarTrava(pasta);
  // Ctrl+C duplo (process.exit) no meio do envio: não deixa o clone temporário para trás
  process.on("exit", apagarTemporariaEmUso);

  const caminhoLog = join(pasta, "log.txt");
  const registro = criarRegistro(caminhoLog, raiz);
  registro.arquivo(`${LINHA}\nInício · Node ${process.versions.node} · ${process.platform} · opções: ${argv.join(" ") || "(nenhuma)"}`);
  registro.linha("Luneta · coleta no PC (fichas da Caixa e ITBI de Belo Horizonte). Guia: base/COLETA-NO-PC.md");

  // --- pré-requisitos
  const checagens: Checagem[] = [];
  checagens.push({
    item: "Node",
    ok: versaoAtende(process.versions.node),
    detalhe: `${process.versions.node} (precisa ${NODE_MINIMO.join(".")} ou mais novo)`,
    resolver: "Instale a versão LTS do Node em https://nodejs.org/pt-br/download, feche e abra o terminal e rode de novo.",
    afeta: "tudo",
  });
  let itens: ItemFicha[] = [];
  if (op.etapas.includes("fichas")) {
    try {
      itens = lerInstantaneo(readFileSync(join(raiz, INSTANTANEO_PADRAO)));
      checagens.push({ item: "Lista de imóveis", ok: itens.length > 0, detalhe: `${numero(itens.length)} imóveis da Caixa no instantâneo do site`, afeta: "fichas", resolver: "Atualize o projeto: git pull" });
    } catch (e) {
      checagens.push({ item: "Lista de imóveis", ok: false, detalhe: `não li ${INSTANTANEO_PADRAO} (${(e as Error).message})`, resolver: "Rode o comando dentro da pasta do projeto clonado e atualize: git pull", afeta: "fichas" });
    }
    try {
      const livre = await statfs(pasta).then((s) => s.bavail * s.bsize);
      checagens.push({ item: "Espaço em disco", ok: livre > 1024 ** 3, detalhe: `${(livre / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB livres (as fichas ocupam ~600 MB)`, resolver: "Libere pelo menos 1 GB no disco.", afeta: "fichas", aviso: true });
    } catch {
      // statfs indisponível: segue sem a checagem
    }
  }
  let python: Python | null = null;
  if (op.etapas.includes("bh")) {
    python = acharPython();
    if (!python) {
      checagens.push({
        item: "Python 3",
        ok: false,
        detalhe: "não achei o Python 3.9 ou mais novo (py -3, python, python3)",
        resolver: `Instale o Python em https://www.python.org/downloads/ (no Windows, marque "Add python.exe to PATH"). Depois: ${INSTALAR_PYTHON_MODULOS}`,
        afeta: "bh",
      });
    } else {
      const obrigatorios = python.faltando.filter((m) => m !== "openpyxl");
      const pip = `${python.comando.join(" ")} -m ${INSTALAR_PYTHON_MODULOS}`;
      checagens.push({
        item: "Python 3",
        ok: obrigatorios.length === 0,
        detalhe: `${python.versao} (${python.comando.join(" ")})${obrigatorios.length ? `; faltam ${obrigatorios.join(", ")}` : " com pandas, numpy e requests"}`,
        resolver: `Instale os pacotes: ${INSTALAR_PYTHON_MODULOS}   (se "pip" não for achado: ${pip})`,
        afeta: "bh",
      });
      if (!obrigatorios.length && python.faltando.includes("openpyxl")) {
        checagens.push({ item: "openpyxl", ok: false, detalhe: "falta (só usado se a prefeitura publicar planilha .xlsx)", resolver: `${pip}`, afeta: "bh", aviso: true });
      }
    }
  }
  let remoto: string | null = null;
  if (op.publicar) {
    const versaoGit = rodarSync("git", ["--version"]);
    if (versaoGit.status !== 0) {
      checagens.push({ item: "Git", ok: false, detalhe: "não achei o Git", resolver: "Instale o Git em https://git-scm.com/downloads (no Windows, aceite as opções padrão), feche e abra o terminal.", afeta: "publicar" });
    } else {
      const dentro = rodarSync("git", ["-C", raiz, "rev-parse", "--is-inside-work-tree"]);
      const origin = rodarSync("git", ["-C", raiz, "remote", "get-url", "origin"]);
      if (dentro.status !== 0 || dentro.stdout.trim() !== "true") {
        checagens.push({ item: "Clone do repositório", ok: false, detalhe: "esta pasta não veio de git clone (talvez de um .zip)", resolver: "Clone o repositório (passo 2 do guia) e copie a pasta coletas-pc/ para dentro do clone.", afeta: "publicar" });
      } else if (origin.status !== 0 || !origin.stdout.trim()) {
        checagens.push({ item: "Clone do repositório", ok: false, detalhe: "o clone não tem o endereço do GitHub (origin)", resolver: "Rode: git remote add origin https://github.com/joaopedrogv13/luneta-de-leiloes.git", afeta: "publicar" });
      } else {
        remoto = origin.stdout.trim();
        checagens.push({ item: "Git", ok: true, detalhe: `${versaoGit.stdout.trim().replace(/^git version /, "")}; envio para ${mascararUrl(remoto)}`, afeta: "publicar" });
      }
    }
  }
  registro.linha("Conferindo o que é preciso:");
  for (const c of checagens) {
    registro.linha(`  ${c.ok ? "ok   " : c.aviso ? "aviso" : "FALTA"}  ${c.item}: ${c.detalhe}`);
    if (!c.ok && c.resolver) registro.linha(`         Como resolver: ${c.resolver}`);
  }
  const falta = (afeta: Checagem["afeta"]) => checagens.some((c) => !c.ok && !c.aviso && (c.afeta === afeta || c.afeta === "tudo"));
  if (falta("tudo")) return 1;
  let etapas = op.etapas.filter((e) => !falta(e));
  const pulou = op.etapas.filter((e) => falta(e));
  const podePublicar = op.publicar && !falta("publicar");

  // --- pausa depois de uma recusa da Caixa: não insistir com quem acabou de dizer não
  const pastaFichas = join(pasta, "fichas");
  let pausa: { desde: Date; ate: Date } | null = null;
  if (etapas.includes("fichas") && !op.semPausa) {
    pausa = pausaDoBloqueio(await lerResumoAnterior(pastaFichas), new Date());
    if (pausa) etapas = etapas.filter((e) => e !== "fichas");
  }
  if (!etapas.length && !podePublicar) {
    registro.linha(pausa ? `Nada para fazer agora. As fichas estão em pausa: ${textoDaPausa(pausa)}` : "Nada para fazer: resolva o que falta acima e rode de novo.");
    return pausa ? 3 : 1;
  }

  // --- plano
  const ids = etapas.includes("fichas") ? idsDoPedido({ todas: true, uf: op.uf ?? undefined }, () => itens, new Date()) : [];
  registro.linha("Vai fazer:");
  let passo = 0;
  if (etapas.includes("fichas")) {
    registro.linha(
      `  ${++passo}. Fichas da Caixa: ${numero(ids.length)} imóveis${op.uf ? ` de ${op.uf}` : ""}, as já baixadas são puladas` +
        `${op.limite ? `; no máximo ${numero(op.limite)} novas nesta vez` : ""}. Prioridade: praça mais próxima, depois Leilão SFI, Licitação, Venda Online e Venda Direta. 2 s entre páginas (~${SEGUNDOS_POR_FICHA.toLocaleString("pt-BR")} s por ficha).`,
    );
  }
  if (etapas.includes("bh")) registro.linha(`  ${++passo}. ITBI de Belo Horizonte (portal de dados abertos da prefeitura).`);
  if (podePublicar) registro.linha(`  ${++passo}. Enviar o resultado para o GitHub (branch ${BRANCH}; os HTML das fichas não vão).`);
  for (const e of pulou) registro.linha(`  (sem ${e === "bh" ? "BH" : "as fichas"}: falta o que está acima)`);
  if (pausa) registro.linha(`  (sem as fichas desta vez: ${textoDaPausa(pausa)})`);
  if (op.publicar && !podePublicar) registro.linha("  (sem o envio ao GitHub: falta o que está acima; os dados ficam em coletas-pc/)");
  registro.linha("Pode parar com Ctrl+C a qualquer momento: o que já foi baixado fica salvo. Não feche a janela antes de aparecer \"pode fechar a janela\".");

  // --- Ctrl+C
  const parada = criarParada();
  let filhoPython: ChildProcess | null = null;
  let ultimoSinal = 0;
  process.on("SIGINT", () => {
    const agora = Date.now();
    // o npm repassa o mesmo Ctrl+C: dois sinais em menos de 2 s contam como um
    if (parada.pedida && agora - ultimoSinal > 2000) {
      registro.linha("Saindo agora, sem esperar. O que já foi baixado está salvo; para enviar depois: " + `${COMANDO} --so-publicar`);
      process.exit(130);
    }
    if (!parada.pedida) {
      registro.linha(
        `Ctrl+C: parando com cuidado.${etapas.includes("fichas") ? " As fichas baixadas estão salvas e o fichas.json está sendo gravado." : ""}` +
          `${podePublicar ? " Depois envio ao GitHub o que já foi coletado." : ""} (Ctrl+C de novo sai na hora.)`,
      );
    }
    ultimoSinal = agora;
    parada.pedir();
    filhoPython?.kill();
  });

  // --- etapas
  let resumoFichas: ResumoFichas | null = null;
  let bh: ResultadoBh | null = null;
  let liberadoEm: string | undefined;
  if (etapas.includes("fichas") && !parada.pedida) {
    registro.linha(`${LINHA}\nFichas da Caixa`);
    const http = criarClienteHttp({
      intervaloMinimoMs: INTERVALO_MS,
      esperar: esperaInterrompivel(parada),
      // cada página baixada já tem a sua linha; no log ficam só retentativas e erros do cliente
      log: (m) => {
        if (!/→ HTTP 2\d\d,/.test(m)) registro.arquivo(m);
      },
    });
    // caminho relativo (a pasta do projeto é a atual): o log não leva a pasta do PC
    resumoFichas = await baixarFichas({ ids, saida: join("coletas-pc", "fichas"), http, parada, limite: op.limite, refazerFalhas: op.refazerFalhas, log: (t) => registro.linha(t) });
    if (resumoFichas.parada === "bloqueio") {
      const p = pausaDoBloqueio(resumoFichas, new Date());
      liberadoEm = p ? aPartirDe(p.ate) : undefined;
      registro.linha(textoDoBloqueio(resumoFichas.motivoDaParada ?? "", liberadoEm));
    } else if (resumoFichas.parada === "sem_conexao") {
      registro.linha(textoDoBloqueio(resumoFichas.motivoDaParada ?? "falha de rede"));
    } else if (resumoFichas.parada === "falhas") {
      registro.linha("As fichas pararam depois de muitas falhas seguidas: a página da Caixa pode estar fora do ar ou ter mudado. Tente mais tarde; se repetir, avise o Claude.");
    }
  }
  if (etapas.includes("bh") && python && !parada.pedida) {
    registro.linha(`${LINHA}\nITBI de Belo Horizonte`);
    bh = await rodarBh(raiz, pasta, python, registro, (f) => (filhoPython = f), () => parada.pedida);
    filhoPython = null;
    if (bh.status === "bloqueio") {
      registro.linha(
        "BLOQUEIO: o portal da Prefeitura de BH recusou o acesso (HTTP 403) também daqui. Não contornamos: tente mais tarde. " +
          "Se você está numa VPN, desligue-a (o portal só abre de rede no Brasil).",
      );
    }
  }

  // --- envio
  let publicacao: ResultadoPublicacao | null = null;
  if (podePublicar && remoto) {
    registro.linha(`${LINHA}\nEnvio ao GitHub`);
    // fichas.json cortado (o PC desligou no meio da gravação) ou que nunca chegou a ser gravado: refaz das fichas da pasta
    if (temHtml(pastaFichas) && motivoJsonInvalido(join(pastaFichas, "fichas.json"), true)) {
      registro.linha("O fichas.json não está inteiro (o PC desligou no meio da gravação?): refazendo a partir das fichas baixadas...");
      const r = await regravarFichasJson(pastaFichas, (feitos, de) => registro.linha(`  conferidas ${numero(feitos)} de ${numero(de)}...`));
      registro.linha(`fichas.json refeito com ${numero(r.total)} fichas.`);
    }
    const data = dataLocal();
    const extras: { destino: string; conteudo: string; anexar?: boolean }[] = [];
    const marca = join(pasta, ".log-enviado-ate");
    let desde = 0;
    try {
      desde = Number(readFileSync(marca, "utf8")) || 0;
    } catch {
      // primeiro envio
    }
    const tamanho = existsSync(caminhoLog) ? statSync(caminhoLog).size : 0;
    if (desde > tamanho) desde = 0;
    const inicioLog = Math.max(desde, tamanho - LIMITE_LOG_PUBLICADO);
    if (tamanho > inicioLog) extras.push({ destino: `pc/${data}/log.txt`, conteudo: readFileSync(caminhoLog).subarray(inicioLog).toString("utf8"), anexar: true });
    if (bh?.status === "ok") extras.push({ destino: "itbi/ultima-execucao.txt", conteudo: `PC do dono · etapa bh · ${new Date().toISOString()}\n` });
    publicacao = await publicar({ raiz, pasta, data, remoto, extras, log: (t) => registro.linha(t) });
    if (publicacao.ok) {
      writeFileSync(marca, String(tamanho));
      const pastas = [...new Set(publicacao.enviados.map((d) => d.slice(0, d.lastIndexOf("/") + 1)))].join(", ");
      registro.linha(`Envio: ${publicacao.mensagem}${publicacao.enviados.length ? `; pastas ${pastas} do branch ${BRANCH}` : ""}.`);
    } else {
      registro.linha(`${LINHA}\n${publicacao.mensagem}\n${LINHA}`);
    }
  }

  // --- resumo
  registro.linha(`${LINHA}\nResumo`);
  if (resumoFichas) registro.linha(`  ${resumoDasFichas(resumoFichas, liberadoEm)}`);
  else if (pausa) registro.linha(`  Fichas: em pausa (${textoDaPausa(pausa)}).`);
  else if (op.etapas.includes("fichas")) registro.linha("  Fichas: não rodaram.");
  if (bh) registro.linha(`  BH: ${bh.status === "ok" ? "ok" : bh.status.toUpperCase()} (${bh.detalhe}).`);
  else if (op.etapas.includes("bh")) registro.linha("  BH: não rodou.");
  if (publicacao) {
    registro.linha(`  Envio ao GitHub: ${publicacao.ok ? publicacao.mensagem : "NÃO enviado (veja acima o que fazer)"}.`);
    for (const r of publicacao.recusados) registro.linha(`  Não enviado (arquivo com problema): ${r.destino}: ${r.motivo}.`);
  } else if (op.publicar) registro.linha(`  Envio ao GitHub: não feito (os dados estão em coletas-pc/). Para enviar depois: ${COMANDO} --so-publicar`);
  else registro.linha(`  Envio ao GitHub: desligado (--sem-publicar). Para enviar depois: ${COMANDO} --so-publicar`);
  registro.linha(`  Log completo: coletas-pc/log.txt. ${parada.pedida ? "Interrompido: pode fechar a janela." : "Pronto: pode fechar a janela."}`);

  if (parada.pedida) return 130;
  if (publicacao && !publicacao.ok) return 1;
  if (resumoFichas?.parada === "bloqueio" || bh?.status === "bloqueio" || pausa) return 3;
  if (resumoFichas?.parada === "sem_conexao") return 5;
  if (bh?.status === "falha" || resumoFichas?.parada === "falhas") return 1;
  return 0;
}

function textoDaPausa(pausa: { desde: Date; ate: Date }): string {
  return (
    `a Caixa recusou o acesso ${quando(pausa.desde)}; para não insistir, a próxima tentativa fica liberada ${aPartirDe(pausa.ate)}. ` +
    `Se você desligou uma VPN ou trocou de rede, pode tentar já com: ${COMANDO} --sem-pausa`
  );
}

function temHtml(pasta: string): boolean {
  try {
    return readdirSync(pasta).some((n) => /^\d{13}\.html$/.test(n));
  } catch {
    return false;
  }
}

// O lançador (coleta-pc.mjs) marca LUNETA_COLETA_PC=1: assim o programa roda mesmo se o caminho do processo não bater
// com import.meta.url (letra de unidade, atalho de pasta no Windows), em vez de sair calado sem fazer nada.
const peloLancador = process.env.LUNETA_COLETA_PC === "1";
if (peloLancador || (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)) {
  delete process.env.LUNETA_COLETA_PC;
  process.exitCode = await principal(process.argv.slice(2));
}
