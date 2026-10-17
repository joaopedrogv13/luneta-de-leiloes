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

test("agregar.py: janela de 12 meses e período (dados por dia; dados só com ano e mês, como os do Rio)", (t) => {
  const codigo = `
import json, sys
sys.path.insert(0, ${JSON.stringify(AQUI)})
try:
    import pandas as pd
except ImportError:
    print("SEM_PANDAS"); sys.exit(0)
from agregar import agregar
def linhas(datas):
    return pd.DataFrame({"tipo": "apartamento", "preco_m2": 5000.0, "data": pd.to_datetime(datas), "bairro": "Centro", "rua": "Rua A"})
# por mês: jan/2025 a set/2026 no dia 1º; a janela são os 12 meses de out/2025 a set/2026
mensal = agregar(linhas([f"{a}-{m:02d}-01" for a in (2025, 2026) for m in range(1, 13) if (a, m) <= (2026, 9)]), "Rio de Janeiro", "RJ", {})
# por dia: o período vai do dia seguinte ao corte até a última data
diario = agregar(linhas(["2025-09-01", "2025-09-08", "2026-03-15", "2026-09-07"]), "São Paulo", "SP", {})
print(json.dumps({"mensal": [mensal["fonte"]["periodo"], mensal["fonte"]["transacoes"]], "diario": [diario["fonte"]["periodo"], diario["fonte"]["transacoes"]]}))
`;
  const r = python(["-c", codigo]);
  if (r.error) return t.skip("python3 indisponível");
  if (r.stdout.includes("SEM_PANDAS")) return t.skip("pandas indisponível");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const saida = JSON.parse(r.stdout.trim().split("\n").at(-1)!) as { mensal: [string[], number]; diario: [string[], number] };
  assert.deepEqual(saida.mensal, [["2025-10-01", "2026-09-30"], 12], "12 meses inteiros: out/2025 a set/2026");
  assert.deepEqual(saida.diario, [["2025-09-08", "2026-09-07"], 3], "a compra de 01/09/2025 fica fora");
});
