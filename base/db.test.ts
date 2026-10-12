import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirBanco, listarMigracoes, migrar, transacao, versaoDoBanco } from "./db.ts";
import { garantirFonte, gravarImoveis } from "./gravar.ts";
import { conectorFalso, imovelExemplo } from "./testes/apoio.ts";

function tabelas(db: ReturnType<typeof abrirBanco>): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((l) => String(l.name));
}

test("migração cria o esquema v1 e é idempotente", () => {
  const db = abrirBanco(":memory:", { migrar: false });
  assert.equal(versaoDoBanco(db), 0);
  const primeira = migrar(db);
  assert.deepEqual(primeira, { de: 0, para: 1, aplicadas: ["esquema.sql"] });
  const antes = tabelas(db);
  for (const t of ["fonte", "coleta", "imovel", "praca", "preco_historico", "foto", "documento", "risco", "edital", "imovel_busca", "edital_busca"]) {
    assert.ok(antes.includes(t), `falta a tabela ${t}`);
  }
  const segunda = migrar(db);
  assert.deepEqual(segunda, { de: 1, para: 1, aplicadas: [] });
  assert.deepEqual(tabelas(db), antes);
  // Rodar o esquema de novo "à força" também não quebra (IF NOT EXISTS em tudo).
  db.exec(listarMigracoes()[0]!.sql);
  assert.deepEqual(tabelas(db), antes);
  db.close();
});

test("migrações extras em ordem, recusa buraco na sequência e banco mais novo", () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-mig-"));
  try {
    writeFileSync(join(dir, "002-coluna-teste.sql"), "ALTER TABLE fonte ADD COLUMN observacao TEXT;");
    writeFileSync(join(dir, "leiame.txt"), "ignorado");
    const caminho = join(dir, "banco.db");
    const db = abrirBanco(caminho, { dirMigracoes: dir });
    assert.equal(versaoDoBanco(db), 2);
    assert.ok(db.prepare("PRAGMA table_info(fonte)").all().some((c) => c.name === "observacao"));
    db.close();
    // Reabrir aplica nada e mantém a versão (arquivo real, WAL).
    const reaberto = abrirBanco(caminho, { dirMigracoes: dir });
    assert.equal(versaoDoBanco(reaberto), 2);
    reaberto.close();

    writeFileSync(join(dir, "004-pulou.sql"), "SELECT 1;");
    assert.throws(() => listarMigracoes(dir), /fora de sequência/);
    rmSync(join(dir, "004-pulou.sql"));

    const futuro = abrirBanco(":memory:", { migrar: false });
    futuro.exec("PRAGMA user_version = 99");
    assert.throws(() => migrar(futuro), /versão 99/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migração com erro não deixa nada pela metade", () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-mig-"));
  try {
    writeFileSync(join(dir, "002-quebrada.sql"), "ALTER TABLE fonte ADD COLUMN nova TEXT; ALTER TABLE tabela_que_nao_existe ADD COLUMN x TEXT;");
    const db = abrirBanco(":memory:", { migrar: false });
    assert.throws(() => migrar(db, { dirMigracoes: dir }));
    assert.equal(versaoDoBanco(db), 1, "v1 aplicada, v2 desfeita");
    assert.ok(!db.prepare("PRAGMA table_info(fonte)").all().some((c) => c.name === "nova"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("transação desfaz tudo em erro e aceita aninhamento", () => {
  const db = abrirBanco(":memory:");
  garantirFonte(db, conectorFalso({ registros: () => [] }));
  assert.throws(() =>
    transacao(db, () => {
      gravarImoveis(db, "falso", [imovelExemplo()]);
      throw new Error("falha depois de gravar");
    }),
  );
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM imovel").get()?.n), 0);

  transacao(db, () => {
    gravarImoveis(db, "falso", [imovelExemplo({ id_na_fonte: "a" })]);
    assert.throws(() => transacao(db, () => {
      gravarImoveis(db, "falso", [imovelExemplo({ id_na_fonte: "b" })]);
      throw new Error("só a interna falha");
    }));
  });
  assert.deepEqual(db.prepare("SELECT id_na_fonte FROM imovel").all().map((l) => l.id_na_fonte), ["a"]);
  db.close();
});

test("restrições do esquema e busca textual sem acento", () => {
  const db = abrirBanco(":memory:");
  garantirFonte(db, conectorFalso({ registros: () => [] }));
  gravarImoveis(db, "falso", [imovelExemplo({ titulo: "Casa em São José dos Campos", descricao: "Imóvel desocupado, com quintal." })]);
  const busca = (termo: string) => db.prepare("SELECT rowid FROM imovel_busca WHERE imovel_busca MATCH ?").all(termo).length;
  assert.equal(busca("sao jose"), 1);
  assert.equal(busca("SÃO JOSÉ"), 1);
  assert.equal(busca("imovel desocupado"), 1);
  assert.equal(busca("ocupado"), 0, "tokenização por palavra inteira");
  assert.throws(() => db.prepare("UPDATE imovel SET status = 'apagado'").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO imovel (fonte_id, id_na_fonte) VALUES ('nao_existe', 'x')").run());
  db.close();
});
