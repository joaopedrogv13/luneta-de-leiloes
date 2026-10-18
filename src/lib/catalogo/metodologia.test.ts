/**
 * Números da página do método, tirados dos arquivos de verdade da nota (base/saida/site): as contas fecham com o total,
 * os pesos somam 100 e batem com a medição (base/saida/localizacao/medicao-nota.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lerLocalizacao } from "./localizacao";
import { pctTexto, resumoDaBase, VALIDACAO_ITBI } from "./metodologia";

const PASTA = join(process.cwd(), "base", "saida", "site");
const MEDICAO = join(process.cwd(), "base", "saida", "localizacao", "medicao-nota.md");

test("porcentagem com uma casa", () => {
  assert.equal(pctTexto(10481, 21230), "49,4%");
  assert.equal(pctTexto(0, 0), "0%");
  assert.equal(pctTexto(1, 3), "33,3%");
});

test("resumo da base: as contas fecham e batem com a medição", { skip: !existsSync(join(PASTA, "localizacao.json.gz")) }, async () => {
  const r = resumoDaBase(await lerLocalizacao(PASTA))!;
  assert.ok(r);
  const somaPrecisao = Object.values(r.porPrecisao).reduce((a, b) => a + b, 0);
  assert.equal(somaPrecisao, r.total);
  const s = r.porSituacao;
  assert.equal(s.calculada + s.aproximada + s.semNota, r.total);
  assert.equal(s.pequena + s.cidade + s.rural + s.foraDaBase, s.semNota);
  assert.equal(Object.values(r.pesos).reduce((a, b) => a + b, 0), 100);
  assert.ok(r.cidades.total > 0 && r.cidades.pequenas < r.cidades.total);
  assert.ok(r.fontes.some((f) => /OpenStreetMap/.test(f.nome) && f.url === "https://www.openstreetmap.org/copyright"));
  assert.equal(r.renda?.variavel, "V06006");
  // a medição escrita pelo cálculo diz o mesmo
  if (existsSync(MEDICAO)) {
    const md = readFileSync(MEDICAO, "utf8");
    const n = (x: number) => new Intl.NumberFormat("pt-BR").format(x);
    assert.match(md, new RegExp(`\\| calculada \\| ${n(s.calculada).replace(".", "\\.")} \\|`));
    assert.match(md, new RegExp(`\\| numero \\| ${n(r.porPrecisao.numero).replace(".", "\\.")} \\|`));
    assert.match(md, new RegExp(`Cidades: ${n(r.cidades.total).replace(".", "\\.")}; pequenas`));
    assert.match(md, new RegExp(`Com mapeamento de risco do BATER: ${r.cidades.comRisco} `));
  }
});

test("validação com o ITBI: os números da medição", () => {
  assert.equal(VALIDACAO_ITBI.mediana, 0.32);
  assert.equal(VALIDACAO_ITBI.cidades.length, 5);
  if (existsSync(MEDICAO)) {
    const md = readFileSync(MEDICAO, "utf8");
    assert.match(md, /Mediana entre as linhas: nota 0,32; Serviços -0,00; Transporte 0,18; Renda 0,50; Infraestrutura 0,29; Comércio -0,07; Lazer 0,02/);
  }
});
