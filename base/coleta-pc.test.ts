/**
 * coleta-pc.ts (node base/coleta-pc.mjs): opções, pré-requisitos (Node, Python), máscaras do log e da URL, o que vai ao
 * branch, o diagnóstico do envio e a publicação de verdade num repositório git local (clone raso, commit, envio com
 * retentativa e rebase, conflito, branch novo, sem credencial, Git do Windows com autocrlf, JSON cortado), a trava de
 * uma coleta por vez, a limpeza de sobras e as frases do resumo. Sem rede: o "GitHub" é um repositório na pasta temporária.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  acharPython,
  anonimizar,
  aPartirDe,
  arquivosParaPublicar,
  candidatosPython,
  classificarFalhaBh,
  diagnosticarPush,
  ErroOpcao,
  instrucoesDoPush,
  lerOpcoes,
  limparTemporariasVelhas,
  mascararUrl,
  mensagemDoCommit,
  motivoJsonInvalido,
  pegarTrava,
  PREFIXO_TEMPORARIA,
  publicar,
  quando,
  resumoDasFichas,
  rodarGit,
  textoDoBloqueio,
  TRAVA,
  travaDeOutro,
  versaoAtende,
  type RodarGit,
} from "./coleta-pc.ts";
import type { ResumoFichas } from "./fontes/caixa/baixar-fichas.ts";

test("lerOpcoes: padrão é tudo (fichas e BH) com envio; --etapas, --uf, --limite, --sem-publicar, --so-publicar", () => {
  assert.deepEqual(lerOpcoes([]), { etapas: ["fichas", "bh"], uf: null, limite: null, publicar: true, soPublicar: false, refazerFalhas: false, semPausa: false, ajuda: false });
  assert.equal(lerOpcoes(["--sem-pausa"]).semPausa, true);
  assert.equal(lerOpcoes([], { npm_config_sem_pausa: "true" }).semPausa, true);
  assert.deepEqual(lerOpcoes(["--etapas", "bh"]).etapas, ["bh"]);
  assert.deepEqual(lerOpcoes(["--etapas", "bh,fichas"]).etapas, ["fichas", "bh"], "sempre na ordem fichas, bh");
  assert.deepEqual(lerOpcoes(["--etapas", " FICHAS , fichas "]).etapas, ["fichas"]);
  assert.deepEqual(lerOpcoes(["--etapas=tudo"]).etapas, ["fichas", "bh"]);
  assert.equal(lerOpcoes(["--uf", "rj"]).uf, "RJ");
  assert.equal(lerOpcoes(["--limite", "500"]).limite, 500);
  assert.equal(lerOpcoes(["--sem-publicar"]).publicar, false);
  assert.equal(lerOpcoes(["--publicar"]).publicar, true);
  assert.equal(lerOpcoes(["--refazer-falhas"]).refazerFalhas, true);
  assert.equal(lerOpcoes(["-h"]).ajuda, true);
  assert.equal(lerOpcoes(["--help"]).ajuda, true);
  const so = lerOpcoes(["--so-publicar"]);
  assert.deepEqual([so.etapas, so.publicar, so.soPublicar], [[], true, true]);
});

test("lerOpcoes: erros em português claro", () => {
  const erro = (argv: string[], padrao: RegExp) => assert.throws(() => lerOpcoes(argv), (e: unknown) => e instanceof ErroOpcao && padrao.test(e.message));
  erro(["--etapas", "caixa"], /Etapa desconhecida "caixa"/);
  erro(["--etapas", ","], /vazio/);
  erro(["--uf", "XX"], /UF "XX" não existe/);
  erro(["--limite", "0"], /maior que zero/);
  erro(["--limite", "dez"], /número inteiro/);
  erro(["--publicar", "--sem-publicar"], /não os dois/);
  erro(["--so-publicar", "--sem-publicar"], /não fazem nada/);
  erro(["--so-publicar", "--etapas", "bh"], /tire o --etapas/);
  erro(["--uf"], /^A opção --uf está sem valor \(ex\.: --uf RJ\)\. Veja as opções com: node base\/coleta-pc\.mjs --ajuda$/);
  erro(["--qualquer"], /^Opção desconhecida: --qualquer\. Veja/);
  assert.throws(() => lerOpcoes(["--qualquer"]), (e: unknown) => !/Unknown option|positional/.test((e as Error).message), "sem o inglês do Node");
  // o npm engoliu "--uf" e deixou "RJ" solto (PowerShell sem "--")
  erro(["RJ"], /node base\/coleta-pc\.mjs/);
});

test("lerOpcoes: opções que o npm guardou em npm_config_* (rodado sem o \"--\") também valem", () => {
  const env = { npm_config_uf: "sp", npm_config_limite: "20", npm_config_etapas: "fichas", npm_config_sem_publicar: "true" };
  const op = lerOpcoes([], env);
  assert.deepEqual([op.uf, op.limite, op.etapas, op.publicar], ["SP", 20, ["fichas"], false]);
  assert.equal(lerOpcoes(["--uf", "MG"], env).uf, "MG", "a linha de comando vence");
  assert.equal(lerOpcoes([], { npm_config_uf: "true" }).uf, null, "\"--uf\" sem valor no npm vira true: ignorado");
  assert.deepEqual(lerOpcoes([], { npm_config_so_publicar: "true" }).etapas, []);
});

test("versaoAtende: Node 22.6 ou mais novo", () => {
  assert.equal(versaoAtende("22.5.1"), false);
  assert.equal(versaoAtende("v22.6.0"), true);
  assert.equal(versaoAtende("22.22.0"), true);
  assert.equal(versaoAtende("24.1.0"), true);
  assert.equal(versaoAtende("20.18.0"), false);
  assert.equal(versaoAtende("3.8.10", [3, 9]), false);
  assert.equal(versaoAtende("3.12.1", [3, 9]), true);
});

test("candidatosPython e acharPython: py -3 primeiro no Windows; pula o atalho da loja e o Python 2; diz os módulos que faltam", () => {
  assert.deepEqual(candidatosPython("win32"), [["py", "-3"], ["python"], ["python3"]]);
  assert.deepEqual(candidatosPython("darwin"), [["python3"], ["python"]]);
  const chamadas: string[] = [];
  const falso = (respostas: Record<string, { status: number | null; stdout: string }>) => (cmd: string, args: readonly string[]) => {
    const chave = `${cmd} ${args.includes("-c") && String(args.at(-1)).includes("find_spec") ? "modulos" : "versao"}`;
    chamadas.push(chave);
    return respostas[chave] ?? { status: null, stdout: "" };
  };
  // Windows sem o py; "python" é o atalho da Microsoft Store (código 9009); "python3" é o de verdade, sem pandas
  const p = acharPython("win32", falso({ "python versao": { status: 9009, stdout: "" }, "python3 versao": { status: 0, stdout: "3.12.4\n" }, "python3 modulos": { status: 0, stdout: "pandas,openpyxl\n" } }));
  assert.deepEqual(p, { comando: ["python3"], versao: "3.12.4", faltando: ["pandas", "openpyxl"] });
  assert.deepEqual(chamadas, ["py versao", "python versao", "python3 versao", "python3 modulos"]);
  assert.equal(acharPython("linux", falso({ "python3 versao": { status: 0, stdout: "2.7.18" }, "python versao": { status: 0, stdout: "3.8.0" } })), null);
  assert.deepEqual(acharPython("linux", falso({ "python3 versao": { status: 0, stdout: "3.11.2" }, "python3 modulos": { status: 0, stdout: "\n" } }))?.faltando, []);
});

test("mascararUrl e anonimizar: nem senha da URL nem a pasta do PC vão para o branch público", () => {
  assert.equal(mascararUrl("https://joao:ghp_123@github.com/x/y.git"), "https://***@github.com/x/y.git");
  assert.equal(mascararUrl("https://github.com/x/y.git"), "https://github.com/x/y.git");
  assert.equal(mascararUrl("git@github.com:x/y.git"), "git@github.com:x/y.git");
  const raiz = "C:\\Users\\Joao\\luneta-de-leiloes";
  assert.equal(
    anonimizar('File "C:\\Users\\Joao\\luneta-de-leiloes\\base\\fontes\\itbi\\bh.py", line 3 · C:/Users/Joao/AppData/x', raiz, "C:\\Users\\Joao"),
    'File "<projeto>\\base\\fontes\\itbi\\bh.py", line 3 · ~/AppData/x',
  );
  assert.equal(anonimizar("/home/ana/luneta/coletas-pc/x", "/home/ana/luneta", "/home/ana"), "<projeto>/coletas-pc/x");
  // Windows: maiúsculas e minúsculas misturadas, e a pasta temporária na forma curta (com parte do nome do usuário)
  assert.equal(
    anonimizar("fatal: c:\\users\\joao pedro\\luneta\\x · C:\\Users\\JOAOPE~1\\AppData\\Local\\Temp\\luneta-publicar-1 · c:/Users/João Pedro/y", "C:\\Users\\Joao Pedro\\luneta", "C:\\Users\\João Pedro", "C:\\Users\\JOAOPE~1\\AppData\\Local\\Temp\\"),
    "fatal: <projeto>\\x · <temp>\\luneta-publicar-1 · ~/y",
  );
});

test("motivoJsonInvalido: arquivo cortado, vazio ou fichas.json sem os campos não vão ao branch", () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-json-"));
  try {
    const escrever = (nome: string, texto: string) => {
      writeFileSync(join(pasta, nome), texto);
      return join(pasta, nome);
    };
    assert.equal(motivoJsonInvalido(escrever("ok.json", '{"a":1}')), null);
    assert.match(motivoJsonInvalido(escrever("cortado.json", '{"lidas_em":"2026-10-18","fichas":{"1":{"a"'))!, /não é um JSON inteiro/);
    assert.equal(motivoJsonInvalido(escrever("vazio.json", "")), "arquivo vazio");
    assert.equal(motivoJsonInvalido(escrever("lista.json", "[1]")), "não é um objeto JSON");
    assert.match(motivoJsonInvalido(escrever("fichas.json", '{"total":0}'), true)!, /lidas_em e fichas/);
    assert.equal(motivoJsonInvalido(escrever("fichas2.json", '{"lidas_em":"2026-10-18T00:00:00Z","fichas":{}}'), true), null);
    assert.match(motivoJsonInvalido(join(pasta, "nao-existe.json"))!, /não é um JSON inteiro/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("travaDeOutro e pegarTrava: uma coleta por vez; trava velha (PC desligou, número reaproveitado) não prende", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-trava-"));
  // um processo vivo de verdade, que não é este
  const vivo = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
  try {
    const agora = Date.now();
    const gravar = (pid: number, batida: number) => writeFileSync(join(pasta, TRAVA), JSON.stringify({ pid, inicio: new Date(agora - 3600_000).toISOString(), batida: new Date(batida).toISOString() }));
    assert.equal(travaDeOutro(pasta, agora), null, "sem trava");
    gravar(vivo.pid!, agora - 10_000);
    assert.equal(travaDeOutro(pasta, agora)?.pid, vivo.pid, "outra coleta rodando");
    gravar(vivo.pid!, agora - 10 * 60_000);
    assert.equal(travaDeOutro(pasta, agora), null, "parou de bater o ponto: velha");
    gravar(vivo.pid!, agora - 10_000);
    assert.equal(travaDeOutro(pasta, agora, () => false), null, "o processo não existe mais");
    writeFileSync(join(pasta, TRAVA), "{cortado");
    assert.equal(travaDeOutro(pasta, agora), null, "trava ilegível não prende");

    const soltar = pegarTrava(pasta);
    const minha = JSON.parse(readFileSync(join(pasta, TRAVA), "utf8"));
    assert.equal(minha.pid, process.pid);
    assert.equal(travaDeOutro(pasta), null, "a própria trava não conta");
    soltar();
    assert.ok(!existsSync(join(pasta, TRAVA)), "soltar apaga a trava");
    // não apaga a trava de outro
    gravar(vivo.pid!, Date.now());
    soltar();
    assert.ok(existsSync(join(pasta, TRAVA)));
  } finally {
    vivo.kill();
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("limparTemporariasVelhas: apaga só as sobras de envio com mais de 6 h", () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-tmp-"));
  try {
    const velha = join(dir, `${PREFIXO_TEMPORARIA}velha`);
    const nova = join(dir, `${PREFIXO_TEMPORARIA}nova`);
    const outra = join(dir, "outra-coisa");
    for (const p of [velha, nova, outra]) mkdirSync(join(p, "repo", ".git"), { recursive: true });
    const antigo = new Date(Date.now() - 7 * 3600_000);
    utimesSync(velha, antigo, antigo);
    utimesSync(outra, antigo, antigo);
    assert.equal(limparTemporariasVelhas(dir), 1);
    assert.deepEqual([existsSync(velha), existsSync(nova), existsSync(outra)], [false, true, true]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("quando, aPartirDe e resumoDasFichas: o que falta de verdade, sem mandar rodar de novo à toa", () => {
  const agora = new Date(2026, 9, 18, 14, 5);
  assert.equal(quando(new Date(2026, 9, 18, 9, 30), agora), "às 09:30");
  assert.equal(aPartirDe(new Date(2026, 9, 18, 16, 5), agora), "a partir das 16:05");
  assert.equal(aPartirDe(new Date(2026, 9, 19, 1, 0), agora), "a partir de 19/10, às 01:00");

  const base: ResumoFichas = { inicio: "", fim: "", pedidos: 100, fila: 10, puladosNaPasta: 90, puladosPorFalha: 0, foraDoLimite: 0, naPasta: 100, restantes: 0, comFalhaGuardada: 0, ok: [], bloqueio: [], falha: [], parada: "fim" };
  const ok = Array.from({ length: 10 }, (_, i) => String(i));
  assert.match(resumoDasFichas({ ...base, ok }), /10 novas nesta vez; 100 de 100 já baixadas; todas baixadas\.$/);
  // as que faltam são todas falhas guardadas: nada de "rode o mesmo comando de novo"
  const soFalhas = resumoDasFichas({ ...base, ok: ok.slice(0, 4), comFalhaGuardada: 6, falha: [{ id: "x", motivo: "404" }] });
  assert.doesNotMatch(soFalhas, /rode o mesmo comando/);
  assert.match(soFalhas, /nada mais a baixar por agora\. 6 não abriram .* daqui a 7 dias, não precisa fazer nada\./);
  assert.match(resumoDasFichas({ ...base, restantes: 40, puladosNaPasta: 60 }), /faltam 40 \(~2 min\): rode o mesmo comando de novo para continuar/);
  assert.match(resumoDasFichas({ ...base, restantes: 40, parada: "bloqueio", bloqueio: [{ id: "x", motivo: "m" }] }, "a partir das 16:05"), /rode o mesmo comando de novo a partir das 16:05\. Recusas: 1\./);
  assert.match(resumoDasFichas({ ...base, restantes: 40, parada: "sem_conexao" }), /confira a internet e rode o mesmo comando de novo/);
});

test("arquivosParaPublicar: fichas.json e resumo sempre em pc/fichas/ (cumulativo), ITBI em itbi/; nunca o HTML; acima do limite vai .gz", () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-pc-"));
  try {
    assert.deepEqual(arquivosParaPublicar(pasta), []);
    mkdirSync(join(pasta, "fichas"));
    mkdirSync(join(pasta, "itbi"));
    writeFileSync(join(pasta, "fichas", "fichas.json"), '{"lidas_em":"2026-10-18T00:00:00Z","fichas":{}}');
    writeFileSync(join(pasta, "fichas", "resumo.json"), "{}");
    writeFileSync(join(pasta, "fichas", "falhas.json"), "{}");
    writeFileSync(join(pasta, "fichas", "0000010005120.html"), "<html>");
    writeFileSync(join(pasta, "itbi", "itbi-belo-horizonte.json"), "{}");
    writeFileSync(join(pasta, "itbi", "log-belo-horizonte.txt"), "ok");
    writeFileSync(join(pasta, "itbi", "rascunho.txt"), "x");
    // o .parcial do bh.py (gravação em andamento ou interrompida) não vai
    writeFileSync(join(pasta, "itbi", "itbi-belo-horizonte.json.parcial"), '{"cortado":');
    const lista = arquivosParaPublicar(pasta);
    assert.deepEqual(lista.map((a) => a.destino), [
      "pc/fichas/fichas.json",
      "pc/fichas/resumo.json",
      "itbi/itbi-belo-horizonte.json",
      "itbi/log-belo-horizonte.txt",
    ]);
    assert.ok(lista.every((a) => !a.origem.endsWith(".html")));
    assert.equal(lista[0]!.remover, "pc/fichas/fichas.json.gz");
    const grande = arquivosParaPublicar(pasta, 10);
    assert.deepEqual([grande[0]!.destino, grande[0]!.comprimir, grande[0]!.remover], ["pc/fichas/fichas.json.gz", true, "pc/fichas/fichas.json"]);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("diagnosticarPush, instrucoesDoPush e textoDoBloqueio: dizem exatamente o que fazer", () => {
  assert.equal(diagnosticarPush("remote: Permission to x/y.git denied to fulano.\nfatal: unable to access 'https://github.com/x/y.git/': The requested URL returned error: 403"), "credencial");
  assert.equal(diagnosticarPush("fatal: could not read Username for 'https://github.com': terminal prompts disabled"), "credencial");
  assert.equal(diagnosticarPush("fatal: Authentication failed for 'https://github.com/x/y.git/'"), "credencial");
  assert.equal(diagnosticarPush("git@github.com: Permission denied (publickey)."), "credencial");
  assert.equal(diagnosticarPush("fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com"), "rede");
  assert.equal(diagnosticarPush("! [rejected] HEAD -> coletas-dados (fetch first)"), "outro");
  const c = instrucoesDoPush("credencial", "");
  assert.match(c, /gh auth login/);
  assert.match(c, /gh auth setup-git/);
  assert.match(c, /node base\/coleta-pc\.mjs --so-publicar/, "o comando do guia, sem o npm");
  assert.match(c, /coletas-pc\//);
  assert.match(instrucoesDoPush("rede", ""), /internet/);
  assert.match(instrucoesDoPush("outro", "linha 1\nerro final"), /erro final/);
  assert.match(textoDoBloqueio("Coleta bloqueada por precaução: robots.txt inacessível (falha de rede: fetch failed em https://x/robots.txt)"), /confira a internet/);
  const recusa = textoDoBloqueio("Conteúdo recusado em https://x: página de desafio anti-robô (perfdrive)");
  assert.match(recusa, /NÃO tente contornar/);
  assert.match(recusa, /mais tarde/);
  assert.match(recusa, /perfdrive/);
  assert.match(textoDoBloqueio("HTTP 403 em https://x", "a partir das 16:05"), /rode de novo a partir das 16:05 \(antes disso o programa nem tenta/);
  // sem conexão não é bloqueio; certificado recusado (antivírus que inspeciona HTTPS) tem o seu aviso
  const semRede = textoDoBloqueio("falha de rede: fetch failed (ENOTFOUND) em https://x/sistema/detalhe-imovel.asp");
  assert.match(semRede, /^=+\nSEM CONEXÃO: não consegui abrir/);
  assert.doesNotMatch(semRede, /BLOQUEIO/);
  const cert = textoDoBloqueio("Coleta bloqueada por precaução: robots.txt inacessível (falha de rede: fetch failed (SELF_SIGNED_CERT_IN_CHAIN) em https://x/robots.txt)");
  assert.match(cert, /certificado de segurança/);
  assert.match(cert, /antivírus/);
});

test("classificarFalhaBh: bloqueio só com a recusa do portal; sem internet ou proxy não é bloqueio", () => {
  const recusa = "  tentativa 1 falhou: RuntimeError: HTTP 403 em https://dados.pbh.gov.br/api/3/action/package_search (bloqueio: não contornado)\nFALHOU: RuntimeError: BH: ... (HTTP 403 para este servidor)";
  assert.equal(classificarFalhaBh(recusa, 1).status, "bloqueio");
  // a saída real deste ambiente (proxy recusa o túnel): a frase final do bh.py fala em 403, mas não é o portal
  const proxy = "tentativa 1 falhou: ProxyError: HTTPSConnectionPool(host='dados.pbh.gov.br', port=443): Max retries exceeded (Caused by ProxyError('Unable to connect to proxy', OSError('Tunnel connection failed: 403 Forbidden')))\nFALHOU: RuntimeError: BH: o portal da PBH recusou a API, as páginas e o download direto (HTTP 403 para este servidor); rodar de uma rede no Brasil";
  const p = classificarFalhaBh(proxy, 1);
  assert.equal(p.status, "falha");
  assert.match(p.detalhe, /sem internet/);
  assert.match(classificarFalhaBh("KeyError: 'valor'", 1).detalhe, /código 1/);
  const ssl = classificarFalhaBh("tentativa 1 falhou: SSLError: HTTPSConnectionPool(host='dados.pbh.gov.br', port=443): Max retries exceeded (Caused by SSLError(SSLCertVerificationError(1, '[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: self-signed certificate in certificate chain')))", 1);
  assert.equal(ssl.status, "falha");
  assert.match(ssl.detalhe, /certificado/);
});

// ---------------------------------------------------------------------------------------------------------------------
// Publicação num "GitHub" local

const temGit = spawnSync("git", ["--version"]).status === 0;
const AMBIENTE_GIT = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "Teste", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "Teste", GIT_COMMITTER_EMAIL: "t@t" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env: AMBIENTE_GIT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Repositório "remoto" (bare) com o branch coletas-dados já com arquivos do Actions. */
function remotoComBranch(raiz: string, comBranch = true): string {
  const remoto = join(raiz, "remoto.git");
  git(raiz, "init", "-q", "--bare", remoto);
  if (!comBranch) return remoto;
  const sem = join(raiz, "semente");
  git(raiz, "init", "-q", sem);
  git(sem, "checkout", "-q", "-b", "coletas-dados");
  mkdirSync(join(sem, "itbi"));
  writeFileSync(join(sem, "itbi", "itbi-recife.json"), '{"cidade":"Recife"}');
  writeFileSync(join(sem, "itbi", "itbi-belo-horizonte.json"), '{"antigo":true}');
  git(sem, "add", "-A");
  git(sem, "-c", "user.name=Teste", "-c", "user.email=t@t", "commit", "-q", "-m", "ITBI (execução 1)");
  git(sem, "push", "-q", remoto, "HEAD:refs/heads/coletas-dados");
  return remoto;
}

/** coletas-pc/ com fichas.json, resumo, um HTML (que não pode ir) e o ITBI de BH. */
function pastaColeta(raiz: string, bh = '{"cidade":"Belo Horizonte"}'): string {
  const pasta = join(raiz, "coletas-pc");
  mkdirSync(join(pasta, "fichas"), { recursive: true });
  mkdirSync(join(pasta, "itbi"), { recursive: true });
  writeFileSync(join(pasta, "fichas", "fichas.json"), '{"lidas_em":"2026-10-18T01:00:00.000Z","total":0,"lida_em_por_id":{},"fichas":{}}');
  writeFileSync(join(pasta, "fichas", "resumo.json"), '{"ok":[]}');
  writeFileSync(join(pasta, "fichas", "0000010005120.html"), "<html>ficha da Caixa</html>");
  writeFileSync(join(pasta, "itbi", "itbi-belo-horizonte.json"), bh);
  writeFileSync(join(pasta, "itbi", "log-belo-horizonte.txt"), "OK: 100 transações");
  return pasta;
}

const arquivosNoBranch = (remoto: string) => git(remoto, "ls-tree", "-r", "--name-only", "coletas-dados").split("\n").sort();

test("publicar: clone raso numa pasta temporária, commit com a mensagem certa e envio; o HTML não vai; repetir não cria commit", { skip: !temGit && "sem git" }, async () => {
  const raiz = mkdtempSync(join(tmpdir(), "luneta-pub-"));
  try {
    const remoto = remotoComBranch(raiz);
    const pasta = pastaColeta(raiz);
    const linhas: string[] = [];
    const r = await publicar({ raiz, pasta, data: "2026-10-18", remoto, log: (l) => linhas.push(l), extras: [{ destino: "pc/2026-10-18/log.txt", conteudo: "linha 1\n", anexar: true }] });
    assert.equal(r.ok, true, r.mensagem);
    assert.match(r.mensagem, /enviado \(commit [0-9a-f]+ em coletas-dados\)/);
    assert.equal(git(remoto, "log", "-1", "--format=%s", "coletas-dados"), mensagemDoCommit("2026-10-18"));
    assert.equal(mensagemDoCommit("2026-10-18"), "Coleta no PC (fichas da Caixa, ITBI BH) 2026-10-18");
    assert.deepEqual(arquivosNoBranch(remoto), [
      "itbi/itbi-belo-horizonte.json",
      "itbi/itbi-recife.json",
      "itbi/log-belo-horizonte.txt",
      "pc/2026-10-18/log.txt",
      "pc/fichas/fichas.json",
      "pc/fichas/resumo.json",
    ]);
    assert.equal(git(remoto, "show", "coletas-dados:itbi/itbi-belo-horizonte.json"), '{"cidade":"Belo Horizonte"}');
    assert.equal(git(remoto, "show", "coletas-dados:itbi/itbi-recife.json"), '{"cidade":"Recife"}', "o que o Actions publicou continua");
    assert.ok(!linhas.join("\n").includes("ficha da Caixa"));

    // log anexado no segundo envio do mesmo dia
    const r2 = await publicar({ raiz, pasta, data: "2026-10-18", remoto, log: () => undefined, extras: [{ destino: "pc/2026-10-18/log.txt", conteudo: "linha 2\n", anexar: true }] });
    assert.equal(r2.ok, true, r2.mensagem);
    assert.equal(git(remoto, "show", "coletas-dados:pc/2026-10-18/log.txt"), "linha 1\nlinha 2");
    const commits = git(remoto, "rev-list", "--count", "coletas-dados");
    const r3 = await publicar({ raiz, pasta, data: "2026-10-18", remoto, log: () => undefined });
    assert.equal(r3.ok, true);
    assert.match(r3.mensagem, /nada novo/);
    assert.equal(git(remoto, "rev-list", "--count", "coletas-dados"), commits);

    // fichas.json grande vai comprimido, e a versão sem compressão sai do branch
    const r4 = await publicar({ raiz, pasta, data: "2026-10-18", remoto, log: () => undefined, limiteJson: 10 });
    assert.equal(r4.ok, true, r4.mensagem);
    const nomes = arquivosNoBranch(remoto);
    assert.ok(nomes.includes("pc/fichas/fichas.json.gz") && !nomes.includes("pc/fichas/fichas.json"), nomes.join(", "));
    const gz = execFileSync("git", ["show", "coletas-dados:pc/fichas/fichas.json.gz"], { cwd: remoto });
    assert.equal(gunzipSync(gz).toString("utf8"), readFileSync(join(pasta, "fichas", "fichas.json"), "utf8"));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("publicar: se o branch andou no meio (o Actions publicou), busca, faz rebase e envia; com conflito, refaz o commit em cima", { skip: !temGit && "sem git" }, async () => {
  const raiz = mkdtempSync(join(tmpdir(), "luneta-pub-"));
  try {
    const remoto = remotoComBranch(raiz);
    const pasta = pastaColeta(raiz);
    /** Antes do 1º push, outro envio chega ao remoto (mudando `arquivo`). */
    const concorrente = (arquivo: string): RodarGit => {
      let feito = false;
      return async (args, cwd) => {
        if (args.includes("push") && !feito) {
          feito = true;
          const outro = join(raiz, `outro-${arquivo.replace(/\W/g, "")}`);
          git(raiz, "clone", "-q", "--branch", "coletas-dados", remoto, outro);
          writeFileSync(join(outro, ...arquivo.split("/")), '{"do":"actions"}');
          git(outro, "add", "-A");
          git(outro, "-c", "user.name=Teste", "-c", "user.email=t@t", "commit", "-q", "-m", "ITBI (execução 2)");
          git(outro, "push", "-q", "origin", "HEAD:coletas-dados");
        }
        return rodarGit(args, cwd);
      };
    };
    const linhas: string[] = [];
    const r = await publicar({ raiz, pasta, data: "2026-10-18", remoto, log: (l) => linhas.push(l), git: concorrente("itbi/itbi-poa.json"), esperar: async () => undefined });
    assert.equal(r.ok, true, r.mensagem);
    assert.ok(linhas.some((l) => /Envio 1 de 3 não passou/.test(l)));
    assert.equal(git(remoto, "log", "-1", "--format=%s", "coletas-dados"), mensagemDoCommit("2026-10-18"));
    assert.ok(arquivosNoBranch(remoto).includes("itbi/itbi-poa.json"), "o envio do outro continua lá");

    // conflito no mesmo arquivo (itbi-belo-horizonte.json): o nosso vence, em cima do commit do outro
    writeFileSync(join(pasta, "itbi", "itbi-belo-horizonte.json"), '{"cidade":"BH","versao":2}');
    const r2 = await publicar({ raiz, pasta, data: "2026-10-19", remoto, log: () => undefined, git: concorrente("itbi/itbi-belo-horizonte.json"), esperar: async () => undefined });
    assert.equal(r2.ok, true, r2.mensagem);
    assert.equal(git(remoto, "show", "coletas-dados:itbi/itbi-belo-horizonte.json"), '{"cidade":"BH","versao":2}');
    assert.equal(git(remoto, "log", "-2", "--format=%s", "coletas-dados"), `${mensagemDoCommit("2026-10-19")}\nITBI (execução 2)`);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("publicar: cria o branch quando ele ainda não existe", { skip: !temGit && "sem git" }, async () => {
  const raiz = mkdtempSync(join(tmpdir(), "luneta-pub-"));
  try {
    const remoto = remotoComBranch(raiz, false);
    const r = await publicar({ raiz, pasta: pastaColeta(raiz), data: "2026-10-18", remoto, log: () => undefined });
    assert.equal(r.ok, true, r.mensagem);
    assert.ok(arquivosNoBranch(remoto).includes("pc/fichas/fichas.json"));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("publicar: com o Git do Windows (core.autocrlf=true), os arquivos que já estão no branch não ganham CRLF", { skip: !temGit && "sem git" }, async () => {
  const raiz = mkdtempSync(join(tmpdir(), "luneta-pub-"));
  const antes = process.env.GIT_CONFIG_GLOBAL;
  try {
    const remoto = remotoComBranch(raiz);
    // um log de várias linhas no branch, como o Actions publica
    const outro = join(raiz, "outro");
    git(raiz, "clone", "-q", "--branch", "coletas-dados", remoto, outro);
    writeFileSync(join(outro, "itbi", "log-recife.txt"), "linha 1\nlinha 2\nlinha 3\n");
    git(outro, "add", "-A");
    git(outro, "-c", "user.name=Teste", "-c", "user.email=t@t", "commit", "-q", "-m", "log");
    git(outro, "push", "-q", "origin", "HEAD:coletas-dados");
    // a configuração global do Git para Windows
    const global = join(raiz, "gitconfig");
    writeFileSync(global, "[core]\n\tautocrlf = true\n[user]\n\tname = Dono\n\temail = dono@x\n");
    process.env.GIT_CONFIG_GLOBAL = global;
    const pasta = pastaColeta(raiz);
    const r = await publicar({ raiz, pasta, data: "2026-10-18", remoto, log: () => undefined, extras: [{ destino: "itbi/log-recife.txt", conteudo: "linha 4\n", anexar: true }] });
    assert.equal(r.ok, true, r.mensagem);
    const conteudo = (f: string) => execFileSync("git", ["show", `coletas-dados:${f}`], { cwd: remoto, encoding: "utf8" });
    assert.equal(conteudo("itbi/log-recife.txt"), "linha 1\nlinha 2\nlinha 3\nlinha 4\n", "sem \\r no log anexado");
    assert.equal(conteudo("itbi/itbi-recife.json"), '{"cidade":"Recife"}', "o arquivo do Actions não foi tocado");
    const mudou = execFileSync("git", ["diff", "--name-only", "coletas-dados~1", "coletas-dados"], { cwd: remoto, encoding: "utf8" }).trim().split("\n").sort();
    assert.ok(!mudou.includes("itbi/itbi-recife.json"), mudou.join(", "));
  } finally {
    if (antes === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = antes;
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("publicar: JSON cortado (queda de energia, Ctrl+C no meio) não vai e não apaga o bom que está no branch", { skip: !temGit && "sem git" }, async () => {
  const raiz = mkdtempSync(join(tmpdir(), "luneta-pub-"));
  try {
    const remoto = remotoComBranch(raiz);
    const pasta = pastaColeta(raiz, '{"cidade":"Belo Hori');
    writeFileSync(join(pasta, "fichas", "fichas.json"), "");
    const linhas: string[] = [];
    const r = await publicar({ raiz, pasta, data: "2026-10-18", remoto, log: (l) => linhas.push(l) });
    assert.equal(r.ok, true, r.mensagem);
    assert.deepEqual(r.recusados.map((x) => x.destino).sort(), ["itbi/itbi-belo-horizonte.json", "pc/fichas/fichas.json"]);
    assert.ok(linhas.some((l) => /Não envio itbi\/itbi-belo-horizonte\.json: não é um JSON inteiro/.test(l)), linhas.join("\n"));
    assert.equal(git(remoto, "show", "coletas-dados:itbi/itbi-belo-horizonte.json"), '{"antigo":true}', "o do branch ficou");
    assert.ok(!arquivosNoBranch(remoto).includes("pc/fichas/fichas.json"));
    assert.ok(arquivosNoBranch(remoto).includes("pc/fichas/resumo.json"), "o resto vai");
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("publicar: Ctrl+C duplo (process.exit) no meio do envio não deixa o clone temporário para trás", { skip: !temGit && "sem git" }, () => {
  const raiz = mkdtempSync(join(tmpdir(), "luneta-pub-"));
  try {
    const remoto = remotoComBranch(raiz);
    const pasta = pastaColeta(raiz);
    const temporarias = join(raiz, "tmp");
    mkdirSync(temporarias);
    const modulo = pathToFileURL(join(import.meta.dirname, "coleta-pc.ts")).href;
    // como o principal faz: process.on("exit", apagarTemporariaEmUso); o "Ctrl+C de novo" chega bem na hora do push
    const codigo = `
      import { publicar, apagarTemporariaEmUso, rodarGit } from ${JSON.stringify(modulo)};
      process.on("exit", apagarTemporariaEmUso);
      await publicar({ raiz: ${JSON.stringify(raiz)}, pasta: ${JSON.stringify(pasta)}, data: "2026-10-18", remoto: ${JSON.stringify(remoto)},
        temporarias: ${JSON.stringify(temporarias)}, log: () => undefined,
        git: async (args, cwd) => (args.includes("push") ? process.exit(130) : rodarGit(args, cwd)) });`;
    const r = spawnSync(process.execPath, ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "--input-type=module", "-e", codigo], { env: AMBIENTE_GIT, encoding: "utf8" });
    assert.equal(r.status, 130, r.stderr);
    assert.deepEqual(readdirSync(temporarias), [], "nenhuma pasta luneta-publicar-* sobrou");
    assert.deepEqual(arquivosNoBranch(remoto), ["itbi/itbi-belo-horizonte.json", "itbi/itbi-recife.json"], "nada foi enviado");
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("publicar: sem credencial, não insiste e diz o que fazer; nada vazio é enviado; pasta temporária some", { skip: !temGit && "sem git" }, async () => {
  const raiz = mkdtempSync(join(tmpdir(), "luneta-pub-"));
  try {
    const remoto = remotoComBranch(raiz);
    let pushes = 0;
    let temporaria = "";
    const semCredencial: RodarGit = async (args, cwd) => {
      if (args.includes("push")) {
        pushes++;
        temporaria = cwd;
        return { status: 128, saida: "", erro: "remote: Permission to x/y.git denied to alguem.\nfatal: unable to access 'https://alguem:segredo@github.com/x/y.git/': The requested URL returned error: 403" };
      }
      return rodarGit(args, cwd);
    };
    const r = await publicar({ raiz, pasta: pastaColeta(raiz), data: "2026-10-18", remoto, log: () => undefined, git: semCredencial });
    assert.equal(r.ok, false);
    assert.equal(r.problema, "credencial");
    assert.equal(pushes, 1, "credencial errada não melhora tentando de novo");
    assert.match(r.mensagem, /gh auth login/);
    assert.ok(!r.mensagem.includes("segredo"));
    assert.ok(temporaria && !existsSync(temporaria), "a pasta temporária foi apagada");
    assert.deepEqual(arquivosNoBranch(remoto), ["itbi/itbi-belo-horizonte.json", "itbi/itbi-recife.json"], "nada mudou no remoto");

    const vazia = join(raiz, "vazia");
    mkdirSync(vazia);
    const r2 = await publicar({ raiz, pasta: vazia, data: "2026-10-18", remoto, log: () => undefined });
    assert.equal(r2.ok, true);
    assert.match(r2.mensagem, /nada para enviar/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
