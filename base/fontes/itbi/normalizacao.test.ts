/**
 * normalizar.py confere os casos de casos-normalizacao.json (os mesmos que src/lib/catalogo/lugar.test.ts confere
 * contra lugar.ts): as chaves de rua e bairro do ITBI e as do site saem da mesma regra. E o formato do arquivo
 * do site (para_site.py) num exemplo pequeno. Pula sem python3.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const AQUI = dirname(fileURLToPath(import.meta.url));
const python = (args: string[]) => spawnSync("python3", ["-I", ...args], { encoding: "utf8" });

test("normalizar.py: todos os casos compartilhados com o site", (t) => {
  const r = python([join(AQUI, "testar_normalizacao.py")]);
  if (r.error) return t.skip("python3 indisponível");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const casos = JSON.parse(readFileSync(join(AQUI, "casos-normalizacao.json"), "utf8")) as { rua: unknown[]; bairro: unknown[] };
  assert.match(r.stdout, new RegExp(`${casos.rua.length + casos.bairro.length} de ${casos.rua.length + casos.bairro.length} casos iguais`));
});

test("para_site.py: grava <uf>-<cidade>.json.gz, tira bairro que é torre/bloco e recusa arquivo sem o formato", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "itbi-"));
  try {
    const estat = { n: 9, media: 5000, mediana: 4900, p25: 4000, p75: 6000 };
    const entrada = {
      cidade: "São Paulo",
      uf: "SP",
      fonte: { nome: "Prefeitura", url: "https://exemplo", via: "x", observacao: "y", periodo: ["2025-09-08", "2026-09-07"], transacoes: 9 },
      cidade_tipos: { apartamento: estat },
      bairros: { tatuape: { nome: "TATUAPE", tipos: { apartamento: estat } }, "torre 1": { nome: "TORRE 1", tipos: { apartamento: estat } } },
      ruas: { abagiba: { nome: "R ABAGIBA", tipos: { apartamento: { ...estat, n: 3 } } } },
    };
    writeFileSync(join(dir, "itbi-sp.json"), JSON.stringify(entrada));
    const r = python([join(AQUI, "para_site.py"), "--de", dir, "--para", join(dir, "site")]);
    if (r.error) return t.skip("python3 indisponível");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(readdirSync(join(dir, "site")), ["sp-sao-paulo.json.gz"]);
    const saida = JSON.parse(gunzipSync(readFileSync(join(dir, "site", "sp-sao-paulo.json.gz"))).toString("utf8"));
    assert.equal(saida.formato, "luneta-itbi");
    assert.equal(saida.versao, 1);
    assert.deepEqual(Object.keys(saida.bairros), ["tatuape"], "torre 1 sai");
    assert.deepEqual(saida.fonte.periodo, ["2025-09-08", "2026-09-07"]);
    writeFileSync(join(dir, "itbi-sp.json"), JSON.stringify({ cidade: "X" }));
    assert.notEqual(python([join(AQUI, "para_site.py"), "--de", dir, "--para", join(dir, "site2")]).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
