/**
 * atualizar-site.ts (node base/atualizar-site.mjs) e vigia-dados.ts: as opções, a trava de segurança, a escolha dos
 * arquivos (leiloeiros, geocode, nota), a mensagem do commit, a cópia semanal, o .tar.gz, a publicação de verdade num
 * repositório local (só base/saida/site, rebase quando o main andou), a cópia e a restauração do banco por um branch
 * órfão, e a regra de idade do vigia. Sem rede: o "GitHub" é um repositório na pasta temporária.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  conferirTrava,
  contar,
  copiaVencida,
  copiarInstantaneo,
  ErroOpcao,
  escolherArquivoLeiloeiros,
  fazerCopia,
  lerOpcoes,
  maisNovo,
  mensagemDoCommitSite,
  NOME_COPIA,
  nomesDasPartes,
  publicarSite,
  RepoRemoto,
  restaurarBanco,
  resumirInstantaneo,
  shaDoLeia,
  somarImportacao,
  textoLeiaCopia,
  ultimoPublicado,
  type ResumoInstantaneo,
} from "./atualizar-site.ts";
import { extrairTarGz, gravarTarGz, nomeSeguro } from "./util/tar.ts";
import { avaliarVigia, principal as vigiar } from "./vigia-dados.ts";

const temGit = spawnSync("git", ["--version"]).status === 0;
const temTar = spawnSync("tar", ["--version"]).status === 0;
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const IDENTIDADE = ["-c", "user.name=Teste", "-c", "user.email=teste@example.com"];

const inst = (total: number, fontes: [string, number][]): ResumoInstantaneo => ({
  geradoEm: "2026-10-29T10:00:00Z",
  total,
  fontes: fontes.map(([id, n]) => ({ id, nome: id === "caixa_csv" ? "Caixa" : id, total: n })),
});

test("lerOpcoes: tudo por padrão; --sem-publicar tira o envio e a cópia; --backup inclui a cópia; erros em português", () => {
  const p = lerOpcoes([]);
  assert.deepEqual(p.etapas, ["banco", "caixa", "leiloeiros", "fichas", "riscos", "localizacao", "exportar", "publicar", "copia"]);
  assert.equal(p.publicar, true);
  assert.equal(p.forcar, false);
  const t = lerOpcoes(["--sem-publicar", "--banco", "x.db", "--etapas", "leiloeiros,exportar,publicar"]);
  assert.deepEqual(t.etapas, ["leiloeiros", "exportar"]);
  assert.equal(t.banco, "x.db");
  assert.equal(t.publicar, false);
  assert.deepEqual(lerOpcoes(["--etapas", "exportar", "--backup"]).etapas, ["exportar", "copia"]);
  assert.equal(lerOpcoes(["--forcar"]).forcar, true);
  assert.equal(lerOpcoes(["--sem-atualizar"]).ajuda, false);
  assert.throws(() => lerOpcoes(["--etapas", "nuvem"]), /Etapa desconhecida "nuvem"/);
  assert.throws(() => lerOpcoes(["--backup", "--sem-publicar"]), ErroOpcao);
  assert.throws(() => lerOpcoes(["--xyz"]), /Opção desconhecida: --xyz/);
  assert.throws(() => lerOpcoes(["publicar"]), /sem uma opção antes/);
  // npm sem o "--" (PowerShell): as opções chegam em npm_config_*
  assert.equal(lerOpcoes([], { npm_config_sem_publicar: "true" }).publicar, false);
});

test("conferirTrava: queda acima de 30%, fonte grande que zera, leiloeiros que somem juntos e instantâneo vazio", () => {
  const antes = inst(25_000, [["caixa_csv", 20_000], ["ll_a", 800], ["ll_b", 700], ["ll_c", 3_500]]);
  assert.deepEqual(conferirTrava(antes, inst(24_000, [["caixa_csv", 19_500], ["ll_a", 900], ["ll_b", 600], ["ll_c", 3_000]])), { ok: true, motivos: [] });
  // exatamente 30% de queda passa; um imóvel a menos, não
  assert.equal(conferirTrava(inst(1_000, []), inst(700, [])).ok, true);
  const queda = conferirTrava(inst(1_000, []), inst(699, []));
  assert.equal(queda.ok, false);
  assert.match(queda.motivos[0]!, /caiu 30% \(de 1\.000 para 699 imóveis\)/);
  // a Caixa zerou: cai mais de 30% e a fonte grande zera
  const semCaixa = conferirTrava(antes, inst(5_000, [["ll_a", 800], ["ll_b", 700], ["ll_c", 3_500]]));
  assert.equal(semCaixa.ok, false);
  assert.ok(semCaixa.motivos.some((m) => /a fonte Caixa tinha 20\.000 imóveis e ficou sem nenhum/.test(m)));
  // uma fonte grande zera sem derrubar o total em 30%
  const llc = conferirTrava(antes, inst(23_000, [["caixa_csv", 21_500], ["ll_a", 800], ["ll_b", 700]]));
  assert.deepEqual(llc.motivos, ["a fonte ll_c tinha 3.500 imóveis e ficou sem nenhum"]);
  // leiloeiros pequenos que somem todos de uma vez
  const juntos = conferirTrava(inst(2_000, [["caixa_csv", 600], ["ll_a", 700], ["ll_b", 700]]), inst(1_500, [["caixa_csv", 1_500]]));
  assert.deepEqual(juntos.motivos, ["os leiloeiros tinham 1.400 imóveis juntos e ficaram sem nenhum"]);
  // fonte pequena pode zerar
  assert.equal(conferirTrava(inst(21_230, [["caixa_csv", 21_226], ["leiloesjudiciais_api", 4]]), inst(21_226, [["caixa_csv", 21_226]])).ok, true);
  // primeiro instantâneo: só não pode ser vazio
  assert.equal(conferirTrava(null, inst(10, [["caixa_csv", 10]])).ok, true);
  assert.deepEqual(conferirTrava(null, inst(0, [])).motivos, ["o instantâneo novo não tem nenhum imóvel"]);
});

test("resumirInstantaneo, contar e mensagemDoCommitSite: a mensagem padrão do commit", () => {
  const r = resumirInstantaneo({ formato: "luneta-catalogo", gerado_em: "2026-10-29T10:00:00Z", total: 25_998, fontes: [{ id: "caixa_csv", nome: "Caixa", total: 21_226 }, { id: "ll_mega", nome: "megaleiloes.com.br", total: 4_000 }, { id: "ll_x", nome: "x", total: 770 }, { id: "ll_zero", nome: "z", total: 0 }, { id: "leiloesjudiciais_api", nome: "LJ", total: 2 }] });
  assert.deepEqual(contar(r), { total: 25_998, caixa: 21_226, leiloeiros: 4_770, quantosLeiloeiros: 2, outros: 2 });
  assert.equal(mensagemDoCommitSite(new Date(2026, 9, 29, 7, 5), contar(r)), "Dados: atualização de 29/10/2026, 25.998 imóveis (Caixa 21.226, leiloeiros 4.770)");
  assert.throws(() => resumirInstantaneo({ formato: "outro" }), /não é o catálogo/);
});

test("escolherArquivoLeiloeiros, ultimoPublicado e maisNovo: o arquivo certo de cada lugar", () => {
  assert.deepEqual(escolherArquivoLeiloeiros({ existe: true, problema: null }, { existe: true }), { origem: "local", aviso: null });
  assert.deepEqual(escolherArquivoLeiloeiros({ existe: false, problema: null }, { existe: true }), { origem: "coletas-dados", aviso: null });
  const cortado = escolherArquivoLeiloeiros({ existe: true, problema: "a linha 9 não é um JSON inteiro (arquivo cortado?)" }, { existe: true });
  assert.equal(cortado.origem, "coletas-dados");
  assert.match(cortado.aviso!, /não serve \(a linha 9/);
  assert.equal(escolherArquivoLeiloeiros({ existe: false, problema: null }, { existe: false }).origem, null);

  const caminhos = [
    "localizacao/39091626698/localizacao.json.gz",
    "localizacao/40100163122/osm-pois.csv.gz",
    "localizacao/9999999999/geocode.json",
    "localizacao/40200000000/geocode.json",
    "localizacao/40100000000/geocode.json",
    "pc/leiloeiros/pbcv-luneta.jsonl.gz",
    "localizacao/ultima-execucao.txt",
  ];
  // pelo número da execução, não pela ordem alfabética
  assert.equal(ultimoPublicado(caminhos, "geocode.json"), "localizacao/40200000000/geocode.json");
  assert.equal(ultimoPublicado(caminhos, "localizacao.json.gz"), "localizacao/39091626698/localizacao.json.gz");
  assert.equal(ultimoPublicado(caminhos, "localizacao-osm.json.gz"), null);
  // empate não copia (o do site pode ter colunas a mais com a mesma data, como as estações da rodada 5)
  assert.equal(maisNovo("2026-10-18", "2026-10-18"), false);
  assert.equal(maisNovo("2026-10-25T09:00:00Z", "2026-10-18"), true);
  assert.equal(maisNovo("2026-10-11", "2026-10-18"), false);
  assert.equal(maisNovo("2026-10-18", null), true);
  assert.equal(maisNovo(null, "2026-10-18"), false);
});

test("copiaVencida, nomesDasPartes e o LEIA.md: uma vez por semana, em partes abaixo de 100 MB, com o sha256", () => {
  const agora = new Date("2026-10-29T08:00:00Z");
  assert.equal(copiaVencida(null, agora), true);
  assert.equal(copiaVencida("lixo", agora), true);
  assert.equal(copiaVencida("2026-10-28T08:00:00Z", agora), false);
  // a rodada diária às vezes começa minutos mais cedo: 6,5 dias bastam
  assert.equal(copiaVencida("2026-10-22T08:30:00Z", agora), true);
  assert.equal(copiaVencida("2026-10-23T08:00:00Z", agora), false);
  assert.deepEqual(nomesDasPartes(80 * 1024 * 1024), [NOME_COPIA]);
  assert.deepEqual(nomesDasPartes(200 * 1024 * 1024), [`${NOME_COPIA}.001`, `${NOME_COPIA}.002`, `${NOME_COPIA}.003`]);
  const sha = "a".repeat(64);
  const leia = textoLeiaCopia({ data: new Date(2026, 9, 29), sha256: sha, bytes: 30 * 1024 * 1024, partes: [`${NOME_COPIA}.001`, `${NOME_COPIA}.002`], contagens: "O site tinha 10 imóveis." });
  assert.match(leia, /Cópia feita em 29\/10\/2026/);
  assert.match(leia, /copy \/b luneta-dados\.tar\.gz\.001\+luneta-dados\.tar\.gz\.002 luneta-dados\.tar\.gz/);
  assert.equal(shaDoLeia(leia), sha);
  // o LEIA.md da primeira cópia, feita à mão na nuvem
  assert.equal(shaDoLeia("Restaurar...\n\nsha256: 171acd7ab4db369ece2466b1788ab3686ee0497f5bba39823c7f420aca0247e4\n"), "171acd7ab4db369ece2466b1788ab3686ee0497f5bba39823c7f420aca0247e4");
  assert.equal(shaDoLeia("sem nada"), null);
});

test("somarImportacao: o resumo das coletas por leiloeiro", () => {
  const s = somarImportacao([
    "Coleta #10 de ll_a: sucesso (completa: removidos marcados)",
    "  lidos 9 · descartados 0 · inválidos 0",
    "  novos 9 · atualizados 0 · inalterados 0 · reativados 0 · removidos 0",
    "Coleta #11 de ll_b: sucesso",
    "  novos 1 · atualizados 2 · inalterados 3 · reativados 0 · removidos 4 · ignorados (mais antigos) 1",
    "Coleta #12 de ll_c: erro",
    "  novos 0 · atualizados 0 · inalterados 0 · reativados 0 · removidos 0",
  ]);
  assert.deepEqual(s, { coletas: 3, porStatus: { sucesso: 2, erro: 1 }, novos: 10, atualizados: 2, removidos: 4 });
});

test("tar.gz: grava e lê de volta, abre no tar do sistema e recusa caminho para fora da pasta", { skip: !temTar && "sem tar" }, async () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-tar-"));
  try {
    const a = join(pasta, "a.bin");
    const b = join(pasta, "b.txt");
    writeFileSync(a, Buffer.from(Array.from({ length: 70_001 }, (_, i) => i % 251)));
    writeFileSync(b, "olá\n");
    const nomeLongo = `caixa/${"p".repeat(70)}/${"q".repeat(70)}.db`;
    await gravarTarGz([{ nome: "luneta.db", caminho: a }, { nome: nomeLongo, caminho: b }], join(pasta, "c.tar.gz"));
    const r = await extrairTarGz(join(pasta, "c.tar.gz"), join(pasta, "ext"));
    assert.deepEqual(r.arquivos, ["luneta.db", nomeLongo]);
    assert.deepEqual(readFileSync(join(pasta, "ext", "luneta.db")), readFileSync(a));
    assert.equal(readFileSync(join(pasta, "ext", ...nomeLongo.split("/")), "utf8"), "olá\n");
    // o tar do sistema lê o nosso, e nós lemos o dele (é como a primeira cópia foi feita)
    mkdirSync(join(pasta, "sis"));
    execFileSync("tar", ["-xzf", join(pasta, "c.tar.gz"), "-C", join(pasta, "sis")]);
    assert.deepEqual(readFileSync(join(pasta, "sis", "luneta.db")), readFileSync(a));
    execFileSync("tar", ["-czf", join(pasta, "d.tar.gz"), "-C", join(pasta, "sis"), "."]);
    const d = await extrairTarGz(join(pasta, "d.tar.gz"), join(pasta, "ext2"));
    assert.ok(d.arquivos.some((n) => n.endsWith("luneta.db")));
    assert.deepEqual(readFileSync(join(pasta, "ext2", "luneta.db")), readFileSync(a));
    // cortado
    writeFileSync(join(pasta, "e.tar.gz"), readFileSync(join(pasta, "c.tar.gz")).subarray(0, 200));
    await assert.rejects(extrairTarGz(join(pasta, "e.tar.gz"), join(pasta, "ext3")));
    for (const ruim of ["../fora", "/etc/x", "C:\\x", "a/../../b", ""]) assert.equal(nomeSeguro(ruim), false, ruim);
    assert.equal(nomeSeguro("caixa/detalhes.db"), true);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

/** Um "GitHub" (repositório nu) com o main, e o clone do dono. */
function montarSite(pasta: string): { remoto: string; clone: string } {
  const remoto = join(pasta, "remoto.git");
  git(pasta, "init", "-q", "--bare", "-b", "main", remoto);
  const semente = join(pasta, "semente");
  git(pasta, "clone", "-q", remoto, semente);
  mkdirSync(join(semente, "base", "saida", "site", "detalhes"), { recursive: true });
  writeFileSync(join(semente, "base", "saida", "site", "imoveis.json.gz"), "v1");
  writeFileSync(join(semente, "base", "saida", "site", "detalhes", "00.json.gz"), "v1");
  writeFileSync(join(semente, "base", "saida", "site", "detalhes", "1f.json.gz"), "velho");
  writeFileSync(join(semente, "README.md"), "oi\n");
  git(semente, "add", "-A");
  git(semente, ...IDENTIDADE, "commit", "-q", "-m", "início");
  git(semente, "push", "-q", "origin", "HEAD:main");
  const clone = join(pasta, "clone");
  git(pasta, "clone", "-q", remoto, clone);
  return { remoto, clone };
}

test("publicarSite: commit só de base/saida/site no main; o resto do clone não vai; repetir não cria commit", { skip: !temGit && "sem git" }, async () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-site-"));
  try {
    const { remoto, clone } = montarSite(pasta);
    git(clone, "config", "user.name", "Dono");
    git(clone, "config", "user.email", "dono@example.com");
    // o instantâneo novo, na pasta de trabalho
    const trabalho = join(pasta, "trabalho");
    mkdirSync(join(trabalho, "detalhes"), { recursive: true });
    writeFileSync(join(trabalho, "imoveis.json.gz"), "v2");
    writeFileSync(join(trabalho, "detalhes", "00.json.gz"), "v2");
    writeFileSync(join(trabalho, "relatorio-leiloeiros.json"), "{}");
    const copiados = copiarInstantaneo(trabalho, join(clone, "base", "saida", "site"));
    assert.deepEqual(copiados, ["detalhes/00.json.gz", "relatorio-leiloeiros.json", "imoveis.json.gz"]);
    assert.equal(existsSync(join(clone, "base", "saida", "site", "detalhes", "1f.json.gz")), false, "pedaço que não existe mais sai");
    // o dono tem uma mudança dele e um arquivo já preparado: nenhum dos dois vai no commit
    writeFileSync(join(clone, "README.md"), "mudança do dono\n");
    writeFileSync(join(clone, "outro.txt"), "preparado\n");
    git(clone, "add", "outro.txt");
    const r = await publicarSite({ raiz: clone, mensagem: "Dados: atualização de 29/10/2026, 2 imóveis (Caixa 1, leiloeiros 1)", log: () => {}, esperar: async () => {} });
    assert.equal(r.ok, true, r.mensagem);
    const nomes = git(remoto, "show", "--name-only", "--format=%s", "main").split("\n").filter(Boolean);
    assert.equal(nomes[0], "Dados: atualização de 29/10/2026, 2 imóveis (Caixa 1, leiloeiros 1)");
    assert.deepEqual(nomes.slice(1).sort(), ["base/saida/site/detalhes/00.json.gz", "base/saida/site/detalhes/1f.json.gz", "base/saida/site/imoveis.json.gz", "base/saida/site/relatorio-leiloeiros.json"]);
    assert.equal(git(remoto, "show", "main:README.md"), "oi");
    assert.match(git(clone, "status", "--porcelain"), /M README\.md/);
    assert.match(git(clone, "status", "--porcelain"), /A {2}outro\.txt/);
    const r2 = await publicarSite({ raiz: clone, mensagem: "de novo", log: () => {} });
    assert.equal(r2.ok, true);
    assert.match(r2.mensagem, /nada novo/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("publicarSite: o main andou no meio (commit da nuvem): pull --rebase e envia; fora do main não publica", { skip: !temGit && "sem git" }, async () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-site-"));
  try {
    const { remoto, clone } = montarSite(pasta);
    const outro = join(pasta, "outro");
    git(pasta, "clone", "-q", remoto, outro);
    writeFileSync(join(outro, "base", "saida", "site", "imoveis.json.gz"), "da nuvem");
    writeFileSync(join(outro, "codigo.ts"), "export {};\n");
    git(outro, "add", "-A");
    git(outro, ...IDENTIDADE, "commit", "-q", "-m", "nuvem");
    git(outro, "push", "-q", "origin", "HEAD:main");
    writeFileSync(join(clone, "base", "saida", "site", "imoveis.json.gz"), "do PC");
    const log: string[] = [];
    const r = await publicarSite({ raiz: clone, mensagem: "Dados: teste", log: (t) => log.push(t), esperar: async () => {} });
    assert.equal(r.ok, true, r.mensagem);
    assert.ok(log.some((l) => /envio 1 de 3 não passou/.test(l)));
    assert.equal(git(remoto, "show", "main:base/saida/site/imoveis.json.gz"), "do PC", "os dados do PC ficam por cima");
    assert.equal(git(remoto, "show", "main:codigo.ts"), "export {};", "o commit da nuvem continua lá");
    assert.equal(git(remoto, "log", "-1", "--format=%s", "main"), "Dados: teste");

    git(clone, "checkout", "-q", "-b", "teste");
    const fora = await publicarSite({ raiz: clone, mensagem: "x", log: () => {} });
    assert.equal(fora.ok, false);
    assert.match(fora.mensagem, /branch "teste".*git checkout main/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("fazerCopia e restaurarBanco: commit órfão único no branch da cópia, restaura e confere o sha256", { skip: !temGit && "sem git" }, async () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-copia-"));
  try {
    const remoto = join(pasta, "base-privada.git");
    git(pasta, "init", "-q", "--bare", "-b", "main", remoto);
    const dados = join(pasta, "dados");
    mkdirSync(join(dados, "caixa"), { recursive: true });
    const banco = join(dados, "luneta.db");
    const db = new DatabaseSync(banco);
    db.exec("PRAGMA journal_mode = WAL; CREATE TABLE imovel (id INTEGER PRIMARY KEY, extras TEXT); INSERT INTO imovel (extras) VALUES ('{\"geo\":{\"gerado_em\":\"2026-10-18\"}}');");
    // com o banco aberto e o WAL cheio: a cópia precisa ver a linha que ainda não foi para o arquivo principal
    db.exec("INSERT INTO imovel (extras) VALUES (NULL)");
    writeFileSync(join(dados, "caixa", "detalhes.db.bak"), "bak");
    writeFileSync(join(dados, "caixa", "detalhes.db-shm"), "temporário");
    const trabalho = join(pasta, "trabalho");
    mkdirSync(trabalho);
    const env = { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@example.com" };
    const antes = process.env;
    process.env = env;
    try {
      const c1 = await fazerCopia({ banco, trabalho, url: remoto, agora: new Date(2026, 9, 29), contagens: "O site tinha 1 imóvel.", log: () => {} });
      assert.equal(c1.ok, true, c1.mensagem);
      const c2 = await fazerCopia({ banco, trabalho, url: remoto, agora: new Date(2026, 10, 5), contagens: "", log: () => {} });
      assert.equal(c2.ok, true, c2.mensagem);
    } finally {
      process.env = antes;
    }
    db.close();
    // um commit só, sem pai: a semana anterior não fica no histórico
    assert.equal(git(remoto, "rev-list", "--count", "backup-luneta-db"), "1");
    assert.deepEqual(git(remoto, "ls-tree", "--name-only", "backup-luneta-db").split("\n").sort(), ["LEIA.md", NOME_COPIA]);
    assert.match(git(remoto, "show", "backup-luneta-db:LEIA.md"), /Cópia feita em 05\/11\/2026/);
    assert.notEqual(spawnSync("git", ["rev-parse", "--verify", "-q", "refs/heads/main"], { cwd: remoto }).status, 0, "o main da base privada não foi tocado");

    // restaurar num PC sem o banco
    const novo = join(pasta, "pc", "base", "dados", "luneta.db");
    mkdirSync(join(pasta, "pc", "trab"), { recursive: true });
    const msg = await restaurarBanco({ banco: novo, trabalho: join(pasta, "pc", "trab"), url: remoto, log: () => {} });
    assert.match(msg, /conferido com o LEIA\.md/);
    const lido = new DatabaseSync(novo, { readOnly: true });
    assert.equal((lido.prepare("SELECT count(*) AS n FROM imovel").get() as { n: number }).n, 2);
    lido.close();
    assert.equal(readFileSync(join(pasta, "pc", "base", "dados", "caixa", "detalhes.db.bak"), "utf8"), "bak");
    assert.equal(existsSync(join(pasta, "pc", "base", "dados", "caixa", "detalhes.db-shm")), false);
    await assert.rejects(restaurarBanco({ banco: novo, trabalho: join(pasta, "pc", "trab"), url: remoto, log: () => {} }), /já existe/);

    // cópia adulterada: o sha256 do LEIA.md não confere
    const mexido = join(pasta, "mexido");
    git(pasta, "clone", "-q", "-b", "backup-luneta-db", remoto, mexido);
    writeFileSync(join(mexido, NOME_COPIA), gzipSync(Buffer.alloc(1024)));
    git(mexido, "add", "-A");
    git(mexido, ...IDENTIDADE, "commit", "-q", "-m", "x");
    git(mexido, "push", "-q", "origin", "HEAD:backup-luneta-db");
    await assert.rejects(
      restaurarBanco({ banco: join(pasta, "pc2", "luneta.db"), trabalho: join(pasta, "pc", "trab"), url: remoto, log: () => {} }),
      /não confere com o LEIA\.md/,
    );
    assert.equal(existsSync(join(pasta, "pc2", "luneta.db")), false);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("RepoRemoto: só a ponta do branch, sem baixar os arquivos até ler; lê bytes sem estragar o .gz", { skip: !temGit && "sem git" }, async () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-remoto-"));
  try {
    const remoto = join(pasta, "r.git");
    git(pasta, "init", "-q", "--bare", "-b", "coletas-dados", remoto);
    const w = join(pasta, "w");
    git(pasta, "clone", "-q", remoto, w);
    mkdirSync(join(w, "pc", "leiloeiros"), { recursive: true });
    const gz = gzipSync(Buffer.from('{"registro":"coleta"}\n'));
    writeFileSync(join(w, "pc", "leiloeiros", "pbcv-luneta.jsonl.gz"), gz);
    git(w, "add", "-A");
    git(w, ...IDENTIDADE, "commit", "-q", "-m", "1");
    git(w, "push", "-q", "origin", "HEAD:coletas-dados");
    const repo = new RepoRemoto(join(pasta, "cache.git"), `file://${remoto}`, "coletas-dados");
    await repo.buscar();
    assert.deepEqual(repo.arquivos(), ["pc/leiloeiros/pbcv-luneta.jsonl.gz"]);
    await repo.extrair("pc/leiloeiros/pbcv-luneta.jsonl.gz", join(pasta, "x.gz"));
    assert.deepEqual(readFileSync(join(pasta, "x.gz")), gz);
    await assert.rejects(repo.extrair("nao/existe", join(pasta, "y")), /não consegui baixar nao\/existe/);
    await assert.rejects(new RepoRemoto(join(pasta, "c2.git"), join(pasta, "nada.git"), "coletas-dados").buscar(), /não consegui buscar o branch coletas-dados/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("vigia: falha com mais de 36 h, com o arquivo nunca enviado ou com status de erro do coletor", () => {
  const agora = new Date("2026-10-29T15:00:00Z");
  const ok = avaliarVigia({ leiloeirosEm: "2026-10-29T05:34:30Z", siteEm: "2026-10-28T10:00:00Z", agora });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.linhas, ["Arquivo dos leiloeiros (coletas-dados): 29/10 às 02:34 (há 9 h)", "Dados do site (main): 28/10 às 07:00 (há 29 h)"]);
  // 36 h exatas passam; 36 h e um minuto, não
  assert.equal(avaliarVigia({ leiloeirosEm: "2026-10-28T03:00:00Z", siteEm: "2026-10-28T03:00:00Z", agora }).ok, true);
  const atrasado = avaliarVigia({ leiloeirosEm: "2026-10-28T02:59:00Z", siteEm: "2026-10-24T17:18:14Z", agora });
  assert.equal(atrasado.ok, false);
  assert.equal(atrasado.problemas.length, 2);
  assert.match(atrasado.problemas[0]!, /parou de enviar o arquivo dos leiloeiros/);
  assert.match(atrasado.problemas[1]!, /há 118 h \(o limite é 36 h\)/);
  assert.match(avaliarVigia({ leiloeirosEm: null, siteEm: "2026-10-29T10:00:00Z", agora }).problemas[0]!, /nunca enviou/);
  // status.json do coletor (opcional)
  const erro = avaliarVigia({ leiloeirosEm: "2026-10-29T10:00:00Z", siteEm: "2026-10-29T10:00:00Z", status: { ok: false, motivo: "leiloes.db travado", quando: "2026-10-29T09:00:00Z" }, agora });
  assert.deepEqual(erro.problemas, ["O coletor avisou erro em 29/10 às 06:00: leiloes.db travado."]);
  assert.equal(avaliarVigia({ leiloeirosEm: "2026-10-29T10:00:00Z", siteEm: "2026-10-29T10:00:00Z", status: { ok: true, quando: "2026-10-29T09:00:00Z" }, agora }).ok, true);
  assert.match(avaliarVigia({ leiloeirosEm: "2026-10-29T10:00:00Z", siteEm: "2026-10-29T10:00:00Z", status: { motivo: "x" }, agora }).problemas[0]!, /não está no formato/);
  assert.match(avaliarVigia({ leiloeirosEm: "2026-10-29T10:00:00Z", siteEm: "2026-10-29T10:00:00Z", statusInvalido: "{ok:", agora }).problemas[0]!, /não é um JSON válido/);
});

test("vigia: consulta a API do GitHub (commits do caminho e o status.json) e sai com 1 quando falha", async () => {
  const pedidos: string[] = [];
  const respostas = (status: string | null) =>
    (async (url: string) => {
      pedidos.push(url);
      if (url.includes("/contents/")) return status === null ? new Response("{}", { status: 404 }) : new Response(status, { status: 200 });
      const data = url.includes("sha=coletas-dados") ? "2026-10-29T05:00:00Z" : "2026-10-29T06:00:00Z";
      return new Response(JSON.stringify([{ commit: { committer: { date: data } } }]), { status: 200 });
    }) as unknown as typeof fetch;
  const log = console.log;
  const saida: string[] = [];
  console.log = (t: string) => saida.push(t);
  try {
    assert.equal(await vigiar(["--repo", "dono/repo", "--agora", "2026-10-29T15:00:00Z"], {}, respostas(null)), 0);
    assert.ok(pedidos.some((u) => u.includes("/repos/dono/repo/commits?sha=coletas-dados&path=pc%2Fleiloeiros%2Fpbcv-luneta.jsonl.gz")));
    assert.ok(pedidos.some((u) => u.includes("/repos/dono/repo/commits?sha=main&path=base%2Fsaida%2Fsite")));
    assert.equal(await vigiar(["--repo", "dono/repo", "--agora", "2026-10-29T15:00:00Z"], {}, respostas('{"ok":false,"motivo":"PC sem internet"}')), 1);
    assert.ok(saida.some((l) => /PROBLEMA: O coletor avisou erro: PC sem internet/.test(l)));
    assert.equal(await vigiar(["--repo", "dono/repo", "--agora", "2026-11-05T15:00:00Z"], {}, respostas(null)), 1);
  } finally {
    console.log = log;
  }
});
