import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { principal } from "./cli.ts";
import { listarMigracoes } from "./db.ts";
import type { Exportacao } from "./exportar.ts";
import { conferirRegistro, CONECTORES } from "./fontes/index.ts";
import type { RelatorioStatus } from "./status.ts";
import { conectorFalso, httpProibido, imovelExemplo, lote } from "./testes/apoio.ts";

const AGORA = new Date("2026-10-12T12:00:00Z");

function rodar(args: string[], deps: Parameters<typeof principal>[1] = {}) {
  const saida: string[] = [];
  const erro: string[] = [];
  return principal(args, { http: httpProibido(), agora: AGORA, ...deps, saida: (t) => saida.push(t), erro: (t) => erro.push(t) }).then((codigo) => ({
    codigo,
    saida: saida.join("\n"),
    erro: erro.join("\n"),
  }));
}

test("registro de conectores consistente", () => {
  assert.deepEqual(conferirRegistro(CONECTORES), []);
  assert.deepEqual(conferirRegistro([conectorFalso({ registros: () => [] }), conectorFalso({ registros: () => [] })]), ["id repetido: falso"]);
});

test("ponta a ponta: migrar, coletar, riscos, exportar e status", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-cli-"));
  const banco = join(dir, "luneta.db");
  try {
    const registros = [
      ...lote(3),
      imovelExemplo({
        id_na_fonte: "passado",
        url: "https://exemplo.test/passado",
        pracas: [{ numero: 1, data: "2026-09-01T13:00:00.000Z", valor_minimo: 100000 }],
      }),
    ];
    const conectores = [conectorFalso({ registros: () => registros, geradoEm: "2026-10-08" })];

    const m = await rodar(["migrar", "--banco", banco]);
    assert.equal(m.codigo, 0);
    const versao = listarMigracoes().length;
    assert.match(m.saida, new RegExp(`versão 0 → ${versao} \\(aplicadas: esquema\\.sql`));
    assert.match((await rodar(["migrar", "--banco", banco])).saida, new RegExp(`já está na versão ${versao}`));

    const c = await rodar(["coletar", "falso", "--banco", banco, "--fixture", "fixture.json"], { conectores });
    assert.equal(c.codigo, 0, c.erro);
    assert.match(c.saida, /Coleta #1 de falso: sucesso \(completa/);
    assert.match(c.saida, /novos 4/);

    const r = await rodar(["riscos", "--banco", banco], { conectores });
    assert.equal(r.codigo, 0);
    // Cada imóvel recebe as 26 tags (sim, não ou desconhecido); a exportação leva só as "sim".
    assert.match(r.saida, /Riscos: 104 tag\(s\) gravada\(s\) em 4 imóvel\(is\)/);

    const arquivo = join(dir, "saida", "imoveis.json");
    const e = await rodar(["exportar", "--banco", banco, "--saida", arquivo]);
    assert.equal(e.codigo, 0);
    const exportado = JSON.parse(readFileSync(arquivo, "utf8")) as Exportacao;
    assert.equal(exportado.versao, 1);
    assert.equal(exportado.total, 3, "o imóvel com praça já passada fica de fora");
    const primeiro = exportado.imoveis[0];
    assert.ok(primeiro);
    assert.equal(primeiro.fonte_nome, "Fonte falsa de teste");
    assert.equal(primeiro.fotos[0]?.url, "https://exemplo.test/fotos/1001-1.jpg");
    assert.deepEqual(
      primeiro.tags.map((t) => t.slug).sort(),
      ["aceita-financiamento", "desagio-baixo", "desocupado", "imovel-inteiro", "primeira-praca"],
    );
    assert.equal(primeiro.praca_atual, 1);

    const s = await rodar(["status", "--banco", banco, "--json"]);
    const rel = JSON.parse(s.saida) as RelatorioStatus;
    assert.equal(rel.versaoBanco, listarMigracoes().length);
    assert.equal(rel.totais.ativos, 4);
    assert.deepEqual(rel.porUf, [{ uf: "SP", ativos: 4 }]);
    assert.equal(rel.fotos.percentual, 100);
    assert.equal(rel.fontes[0]?.ultimaColeta?.gerado_na_fonte_em, "2026-10-08");
    const texto = await rodar(["status", "--banco", banco]);
    assert.match(texto.saida, /falso — Fonte falsa de teste/);
    assert.match(texto.saida, /Por UF \(ativos\): SP 4/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("erros de uso devolvem código 2 com mensagem", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-cli-"));
  const banco = join(dir, "luneta.db");
  try {
    assert.equal((await rodar([])).codigo, 2);
    assert.equal((await rodar(["--ajuda"])).codigo, 0);
    const desconhecida = await rodar(["coletar", "nao_existe", "--banco", banco]);
    assert.equal(desconhecida.codigo, 2);
    assert.match(desconhecida.erro, /Fonte desconhecida/);
    const uf = await rodar(["coletar", "falso", "--uf", "ZZ", "--banco", banco], { conectores: [conectorFalso({ registros: () => [] })] });
    assert.match(uf.erro, /UF inválida/);
    const limite = await rodar(["coletar", "falso", "--limite", "0", "--banco", banco], { conectores: [conectorFalso({ registros: () => [] })] });
    assert.match(limite.erro, /inteiro positivo/);
    assert.equal((await rodar(["voar"])).codigo, 2);
    assert.equal((await rodar(["status", "--opcao-inexistente"])).codigo, 2);
    const falhou = await rodar(["coletar", "falso", "--banco", banco], { conectores: [conectorFalso({ registros: () => [] })] });
    assert.equal(falhou.codigo, 1, "coleta inválida sai com 1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
