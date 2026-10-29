/**
 * Vigia dos dados (.github/workflows/vigia-dados.yml, todo dia por volta das 12:00 de Brasília): confere se o PC do dono
 * está mandando os dados e atualizando o site. Falha (e o GitHub manda e-mail ao dono) quando:
 *   - o último `pc/leiloeiros/pbcv-luneta.jsonl.gz` do branch coletas-dados tem mais de 36 h (ou nunca foi enviado);
 *   - o último commit de `base/saida/site/` no main tem mais de 36 h;
 *   - o coletor gravou um erro em `pc/leiloeiros/status.json` (`{"ok": false, "motivo": ..., "quando": ...}`; o arquivo
 *     é opcional, formato em base/leiloeiros/CONTRATO.md).
 * Só lê (API do GitHub, permissão contents: read); não faz commit, então não dispara deploy na Vercel.
 *
 *   node --experimental-strip-types base/vigia-dados.ts [--repo dono/repo] [--agora ISO]
 *   npm run dados:vigia
 * GITHUB_TOKEN (o do Actions) evita o limite de 60 consultas por hora da API sem login.
 */
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const LIMITE_HORAS = 36;
export const REPO_PADRAO = "joaopedrogv13/luneta-de-leiloes";
export const CAMINHO_JSONL = "pc/leiloeiros/pbcv-luneta.jsonl.gz";
export const CAMINHO_STATUS = "pc/leiloeiros/status.json";
export const CAMINHO_SITE = "base/saida/site";

export interface EntradaVigia {
  /** Data (ISO) do último commit que mudou o JSONL dos leiloeiros no coletas-dados; null se nunca. */
  leiloeirosEm: string | null;
  /** Data (ISO) do último commit de base/saida/site no main; null se nunca. */
  siteEm: string | null;
  /** O conteúdo de pc/leiloeiros/status.json (já lido como JSON), undefined se não existe. */
  status?: unknown;
  /** Texto do status.json que não é JSON. */
  statusInvalido?: string;
  agora: Date;
  limiteHoras?: number;
}

export interface ResultadoVigia {
  ok: boolean;
  problemas: string[];
  linhas: string[];
}

const horasDesde = (iso: string, agora: Date) => Math.max(0, (agora.getTime() - Date.parse(iso)) / 3_600_000);

/** "29/10 às 08:15 (horário de Brasília)". */
export function dataBrasilia(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${dia} às ${hora}`;
}

/** A regra do vigia, sem rede. */
export function avaliarVigia(e: EntradaVigia): ResultadoVigia {
  const limite = e.limiteHoras ?? LIMITE_HORAS;
  const problemas: string[] = [];
  const linhas: string[] = [];
  const conferir = (iso: string | null, oQue: string, nunca: string, atrasado: string) => {
    if (!iso || !Number.isFinite(Date.parse(iso))) {
      problemas.push(nunca);
      linhas.push(`${oQue}: nunca`);
      return;
    }
    const h = horasDesde(iso, e.agora);
    const texto = `${oQue}: ${dataBrasilia(iso)} (há ${Math.round(h)} h)`;
    linhas.push(texto);
    if (h > limite) problemas.push(`${atrasado} Último: ${dataBrasilia(iso)}, há ${Math.round(h)} h (o limite é ${limite} h).`);
  };
  conferir(
    e.leiloeirosEm,
    "Arquivo dos leiloeiros (coletas-dados)",
    `O PC nunca enviou o arquivo dos leiloeiros (${CAMINHO_JSONL} no branch coletas-dados).`,
    "O PC parou de enviar o arquivo dos leiloeiros: a coleta do PBCV, o exportador ou o envio (node base/coleta-pc.mjs --so-publicar) não rodou.",
  );
  conferir(
    e.siteEm,
    "Dados do site (main)",
    `O site nunca recebeu um commit de dados (${CAMINHO_SITE}).`,
    "O site não recebe dados novos: a atualização diária (node base/atualizar-site.mjs) não rodou, parou na trava de segurança ou não conseguiu enviar.",
  );
  if (e.statusInvalido !== undefined) {
    problemas.push(`O ${CAMINHO_STATUS} não é um JSON válido: ${e.statusInvalido.slice(0, 120)}`);
  } else if (e.status !== undefined) {
    const s = e.status as { ok?: unknown; motivo?: unknown; quando?: unknown };
    if (typeof s !== "object" || s === null || typeof s.ok !== "boolean") {
      problemas.push(`O ${CAMINHO_STATUS} não está no formato {"ok": true|false, "motivo": "...", "quando": "..."}.`);
    } else {
      const quando = typeof s.quando === "string" && Number.isFinite(Date.parse(s.quando)) ? ` em ${dataBrasilia(s.quando)}` : "";
      linhas.push(`Status do coletor: ${s.ok ? "ok" : "ERRO"}${quando}`);
      if (!s.ok) problemas.push(`O coletor avisou erro${quando}: ${typeof s.motivo === "string" && s.motivo.trim() ? s.motivo.trim().slice(0, 300) : "(sem motivo)"}.`);
    }
  }
  return { ok: problemas.length === 0, problemas, linhas };
}

// ---------------------------------------------------------------------------------------------------------------------
// Consulta à API do GitHub

type Buscar = typeof fetch;

async function api(caminho: string, buscar: Buscar, token: string | undefined, aceitar = "application/vnd.github+json"): Promise<Response> {
  let ultimo: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await buscar(`https://api.github.com${caminho}`, {
        headers: { Accept: aceitar, "User-Agent": "luneta-vigia-dados", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (r.status < 500) return r;
      ultimo = new Error(`HTTP ${r.status}`);
    } catch (e) {
      ultimo = e;
    }
    await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
  }
  throw new Error(`a API do GitHub não respondeu (${(ultimo as Error)?.message ?? ultimo})`);
}

export async function ultimoCommit(repo: string, branch: string, caminho: string, buscar: Buscar = fetch, token?: string): Promise<string | null> {
  const r = await api(`/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(caminho)}&per_page=1`, buscar, token);
  if (r.status === 404 || r.status === 409) return null;
  if (!r.ok) throw new Error(`a API do GitHub respondeu HTTP ${r.status} para os commits de ${caminho}`);
  const lista = (await r.json()) as { commit?: { committer?: { date?: string } } }[];
  return lista[0]?.commit?.committer?.date ?? null;
}

export async function lerStatus(repo: string, buscar: Buscar = fetch, token?: string): Promise<{ status?: unknown; statusInvalido?: string }> {
  const r = await api(`/repos/${repo}/contents/${CAMINHO_STATUS}?ref=coletas-dados`, buscar, token, "application/vnd.github.raw+json");
  if (r.status === 404) return {};
  if (!r.ok) throw new Error(`a API do GitHub respondeu HTTP ${r.status} para ${CAMINHO_STATUS}`);
  const texto = await r.text();
  try {
    return { status: JSON.parse(texto) };
  } catch {
    return { statusInvalido: texto };
  }
}

export async function principal(argv: readonly string[], env: NodeJS.ProcessEnv = process.env, buscar: Buscar = fetch): Promise<number> {
  let v: { repo?: string; agora?: string };
  try {
    v = parseArgs({ args: [...argv], options: { repo: { type: "string" }, agora: { type: "string" } } }).values;
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const repo = v.repo ?? env.GITHUB_REPOSITORY ?? REPO_PADRAO;
  const token = env.GITHUB_TOKEN || undefined;
  const agora = v.agora ? new Date(v.agora) : new Date();
  let resultado: ResultadoVigia;
  try {
    const [leiloeirosEm, siteEm, status] = await Promise.all([
      ultimoCommit(repo, "coletas-dados", CAMINHO_JSONL, buscar, token),
      ultimoCommit(repo, "main", CAMINHO_SITE, buscar, token),
      lerStatus(repo, buscar, token),
    ]);
    resultado = avaliarVigia({ leiloeirosEm, siteEm, ...status, agora });
  } catch (e) {
    resultado = { ok: false, problemas: [`Não consegui conferir: ${(e as Error).message}. Se repetir amanhã, avise o Claude.`], linhas: [] };
  }
  for (const l of resultado.linhas) console.log(l);
  const resumo = [
    `## Vigia dos dados: ${resultado.ok ? "tudo em dia" : "PROBLEMA"}`,
    "",
    ...resultado.linhas.map((l) => `- ${l}`),
    ...(resultado.ok ? [] : ["", "**O que houve:**", ...resultado.problemas.map((p) => `- ${p}`), "", "O que fazer: base/ATUALIZAR-SITE.md, seção \"Se chegar o e-mail do vigia\"."]),
  ].join("\n");
  if (env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(env.GITHUB_STEP_SUMMARY, resumo + "\n");
    } catch {
      // o log já tem tudo
    }
  }
  if (resultado.ok) {
    console.log(`Tudo em dia (limite de ${LIMITE_HORAS} h).`);
    return 0;
  }
  for (const p of resultado.problemas) console.log(`${env.GITHUB_ACTIONS ? "::error title=Vigia dos dados::" : "PROBLEMA: "}${p}`);
  console.log('O que fazer: base/ATUALIZAR-SITE.md, seção "Se chegar o e-mail do vigia".');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await principal(process.argv.slice(2));
}
