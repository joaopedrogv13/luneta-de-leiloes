import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { principal } from "../../cli.ts";
import { abrirBanco } from "../../db.ts";
import { httpProibido } from "../../testes/apoio.ts";
import { CONECTORES, conferirRegistro, obterConector } from "../index.ts";
import { DIR_FIXTURES } from "./testes.ts";

const RADAR = ["djen", "dou_inlabs", "pncp", "querido_diario"] as const;

test("os quatro conectores do radar estão registrados, como radar, sem lista completa", () => {
  assert.deepEqual(conferirRegistro(CONECTORES), []);
  for (const id of RADAR) {
    const c = obterConector(id);
    assert.ok(c, `${id} não registrado`);
    assert.equal(c.finalidade, "radar");
    assert.equal(c.capacidades.listaCompleta, false, "radar nunca marca removidos");
    assert.equal(c.capacidades.fotos, false, "radar não publica fotos: nunca gera 'Sem fotos'");
  }
});

test("CLI: coletar cada fonte do radar por --fixture grava editais e o status mostra a coleta", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-radar-"));
  const banco = join(dir, "luneta.db");
  const fixtures: Record<(typeof RADAR)[number], string> = {
    djen: join(DIR_FIXTURES, "djen", "comunicacao.json"),
    dou_inlabs: join(DIR_FIXTURES, "dou_inlabs", "2026-10-09-DO3"),
    pncp: join(DIR_FIXTURES, "pncp", "publicacao.json"),
    querido_diario: join(DIR_FIXTURES, "querido_diario", "gazettes.json"),
  };
  const esperados = { djen: 2, dou_inlabs: 1, pncp: 2, querido_diario: 1 };
  try {
    for (const id of RADAR) {
      const saida: string[] = [];
      const erro: string[] = [];
      const codigo = await principal(["coletar", id, "--fixture", fixtures[id], "--banco", banco], {
        http: httpProibido(),
        agora: new Date("2026-10-12T12:00:00Z"),
        saida: (t) => saida.push(t),
        erro: (t) => erro.push(t),
      });
      assert.equal(codigo, 0, `${id}: ${erro.join("\n")}`);
      assert.match(saida.join("\n"), new RegExp(`de ${id}: sucesso[\\s\\S]*editais ${esperados[id]}`));
    }
    const db = abrirBanco(banco);
    try {
      const porFonte = db.prepare("SELECT fonte_id, count(*) AS n FROM edital GROUP BY fonte_id ORDER BY fonte_id").all();
      assert.deepEqual(porFonte.map((l) => [l.fonte_id, Number(l.n)]), RADAR.map((id) => [id, esperados[id]]));
      assert.equal(Number(db.prepare("SELECT count(*) AS n FROM imovel").get()?.n), 0);
      // Busca textual dos editais (FTS5, sem acento).
      const busca = db.prepare("SELECT e.fonte_id FROM edital_busca b JOIN edital e ON e.id = b.rowid WHERE edital_busca MATCH 'leilao' ORDER BY e.fonte_id").all();
      assert.ok(busca.length >= 4);
    } finally {
      db.close();
    }
    const fontes: string[] = [];
    await principal(["fontes", "--banco", banco], { saida: (t) => fontes.push(t), erro: () => undefined });
    for (const id of RADAR) assert.match(fontes.join("\n"), new RegExp(`^${id}\\t.*\\tradar\\t`, "m"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
