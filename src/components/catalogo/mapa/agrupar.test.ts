import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { projetar } from "../../../lib/mapa/brasil-ufs";
import {
  RAIO_CIDADE_MAX,
  RAIO_CIDADE_MIN,
  agrupar,
  escolherRotulos,
  fatorRaio,
  fonteNumero,
  nomeDoNo,
  raioCidade,
  raioGrupo,
  raioParaTexto,
  textoContagem,
  zoomParaSeparar,
  type PontoProjetado,
} from "./agrupar";

/** 1.163 cidades do IBGE com totais pseudoaleatórios (determinísticos), concentrados em RJ/SP/GO. */
function pontosSinteticos(n = 1163): PontoProjetado[] {
  const linhas = readFileSync(path.join(process.cwd(), "base/geo/municipios.csv"), "utf8").trim().split("\n").slice(1);
  let semente = 42;
  const rnd = () => {
    semente = (semente * 1103515245 + 12345) % 2 ** 31;
    return semente / 2 ** 31;
  };
  const peso: Record<string, number> = { RJ: 9, SP: 6, GO: 6, MG: 2 };
  return linhas
    .map((l) => l.split(","))
    .map((c) => ({ c, nota: c[5] === "1" ? 99 : rnd() * (peso[c[1]] ?? 0.5) }))
    .sort((a, b) => b.nota - a.nota)
    .slice(0, n)
    .map(({ c: [, uf, cidade, lat, lon, capital] }) => {
      const [x, y] = projetar(Number(lat), Number(lon));
      const total = capital === "1" ? 150 + Math.round(rnd() * 900) : 1 + Math.round(rnd() ** 3 * 60);
      return { chave: `${uf}|${cidade}`, cidade, uf, lat: Number(lat), lon: Number(lon), total, lanceMin: 50_000, desagioMax: 40, destaques: [], x, y };
    });
}

const PONTOS = pontosSinteticos();
const maiorCidade = Math.max(...PONTOS.map((p) => p.total));
const somaTotal = PONTOS.reduce((s, p) => s + p.total, 0);
/** escala base de um painel ~760×900 */
const S0 = 0.32;

describe("raios", () => {
  it("cidades de 6 a 28 px pela raiz do total", () => {
    assert.equal(raioCidade(0, 100), RAIO_CIDADE_MIN);
    assert.equal(raioCidade(100, 100), RAIO_CIDADE_MAX);
    assert.ok(raioCidade(25, 100) > RAIO_CIDADE_MIN && raioCidade(25, 100) < RAIO_CIDADE_MAX);
    assert.ok(raioCidade(100, 100, 0.68) < RAIO_CIDADE_MAX, "mapa pequeno: bolhas menores");
  });
  it("grupos sempre com espaço para o número", () => {
    for (const n of [2, 87, 1234, 9999, 18_000]) assert.ok(raioGrupo(n, 1000, 21_000, 0.68) >= raioParaTexto(textoContagem(n)));
    assert.equal(textoContagem(1234), "1.234");
    assert.equal(textoContagem(18_420), "18 mil");
  });
  it("o tamanho não mente: cresce com o total e um grupo nunca é menor que uma cidade com menos imóveis", () => {
    for (const fator of [1, 0.68]) {
      let antes = 0;
      for (const total of [2, 10, 50, 200, 900, 1000, 1500, 5000, 15_000, 49_000]) {
        const r = raioGrupo(total, 1000, 49_000, fator);
        assert.ok(r >= antes, `fator ${fator}: ${total} → ${r.toFixed(1)} < ${antes.toFixed(1)}`);
        assert.ok(r >= raioCidade(total, 1000, fator) - 1e-9);
        antes = r;
      }
      // a maior cidade (1.000) é menor que um grupo de 15 mil
      assert.ok(raioGrupo(15_000, 1000, 49_000, fator) > raioCidade(1000, 1000, fator) + 3 * fator);
      assert.ok(raioGrupo(49_000, 1000, 49_000, fator) <= Math.max(38 * fator, 28 * fator + 4) + 1e-9);
    }
  });
  it("número dentro da bolha: fonte menor quando só assim cabe; bolhas pequenas sem número", () => {
    assert.equal(fonteNumero(28, "88"), 11.5);
    assert.equal(fonteNumero(14.5, "467"), 10);
    assert.equal(fonteNumero(11, "8"), null);
    assert.equal(fonteNumero(13, "1.234"), null);
  });
  it("fator dos raios pelo tamanho do mapa", () => {
    assert.equal(fatorRaio(1200, 900), 1);
    assert.equal(fatorRaio(358, 320), 0.68);
  });
});

describe("agrupamento", () => {
  for (const z of [1, 2, 4, 8, 13]) {
    it(`zoom ${z}: nenhuma bolha encosta em outra, nada se perde e o total se mantém`, () => {
      const escala = S0 * z;
      const nos = agrupar(PONTOS, { escala, maiorCidade, somaTotal });
      const vistos = new Set<string>();
      for (const n of nos) for (const m of n.membros) {
        assert.ok(!vistos.has(m.chave), `cidade repetida: ${m.chave}`);
        vistos.add(m.chave);
      }
      assert.equal(vistos.size, PONTOS.length);
      assert.equal(nos.reduce((s, n) => s + n.total, 0), somaTotal);
      for (let i = 0; i < nos.length; i++) {
        for (let j = i + 1; j < nos.length; j++) {
          const a = nos[i];
          const b = nos[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y) * escala;
          assert.ok(d >= Math.max(a.r, 11) + Math.max(b.r, 11) + 2 - 1e-6, `${a.id} × ${b.id}: ${d.toFixed(1)} px`);
        }
      }
      // membros do maior para o menor; id do grupo pela maior cidade
      for (const n of nos) {
        assert.equal(n.id, `${n.grupo ? "g" : "c"}:${n.membros[0].chave}`);
        for (let k = 1; k < n.membros.length; k++) assert.ok(n.membros[k - 1].total >= n.membros[k].total);
      }
    });
  }

  it("aproximar diminui o número de grupos; sem agrupar, uma bolha por cidade", () => {
    const longe = agrupar(PONTOS, { escala: S0, maiorCidade, somaTotal }).length;
    const perto = agrupar(PONTOS, { escala: S0 * 8, maiorCidade, somaTotal }).length;
    assert.ok(longe < perto && perto <= PONTOS.length, `${longe} → ${perto}`);
    assert.equal(agrupar(PONTOS, { escala: S0, maiorCidade, somaTotal, agrupar: false }).length, PONTOS.length);
  });

  it("é determinístico e rápido (1.163 cidades)", () => {
    const t0 = performance.now();
    const a = agrupar(PONTOS, { escala: S0 * 2, maiorCidade, somaTotal });
    const ms = performance.now() - t0;
    const b = agrupar([...PONTOS].reverse(), { escala: S0 * 2, maiorCidade, somaTotal });
    assert.deepEqual(a.map((n) => n.id), b.map((n) => n.id));
    assert.ok(ms < 60, `${ms.toFixed(1)} ms`);
  });

  it("zoomParaSeparar abre o grupo (pelo menos 1,5× e em várias partes)", () => {
    const nos = agrupar(PONTOS, { escala: S0, maiorCidade, somaTotal });
    const grupo = nos.filter((n) => n.grupo).sort((a, b) => b.membros.length - a.membros.length)[0];
    const z = zoomParaSeparar(grupo.membros, S0, 1, 14, { maiorCidade, somaTotal });
    assert.ok(z >= 1.5 && z <= 14);
    const partes = agrupar(grupo.membros, { escala: S0 * z, maiorCidade, somaTotal });
    assert.ok(z === 14 || partes.length >= 4 || Math.max(...partes.map((p) => p.membros.length)) <= grupo.membros.length / 2);
  });

  it("nome do grupo só quando uma cidade domina (≥ 60%)", () => {
    const [a, b] = PONTOS;
    assert.equal(nomeDoNo({ grupo: false, total: a.total, membros: [a] }), a.cidade);
    assert.equal(nomeDoNo({ grupo: true, total: 100, membros: [{ ...a, total: 70 }, { ...b, total: 30 }] }), a.cidade);
    assert.equal(nomeDoNo({ grupo: true, total: 100, membros: [{ ...a, total: 50 }, { ...b, total: 50 }] }), null);
  });
});

describe("rótulos das cidades", () => {
  it("não se sobrepõem, não saem da tela e começam pelas maiores", () => {
    const nos = Array.from({ length: 60 }, (_, i) => ({
      id: `c:${i}`,
      sx: 40 + ((i * 97) % 700),
      sy: 40 + ((i * 53) % 800),
      r: 8 + (i % 10),
      total: 100 - i,
      texto: `Cidade ${i}`,
    }));
    const rot = escolherRotulos(nos, 760, 900, { maximo: 24 });
    assert.ok(rot.length > 0 && rot.length <= 24);
    assert.equal(rot[0].id, "c:0");
    const ret = rot.map((r) => {
      const larg = r.texto.length * 6.4 + 4;
      const x0 = r.lado === "dir" ? r.x + r.r + 3 : r.x - r.r - 3 - larg;
      return [x0, r.y - 8, x0 + larg, r.y + 8];
    });
    for (const [x0, y0, x1, y1] of ret) assert.ok(x0 >= 2 && y0 >= 2 && x1 <= 758 && y1 <= 898);
    for (let i = 0; i < ret.length; i++)
      for (let j = i + 1; j < ret.length; j++) {
        const [a, b] = [ret[i], ret[j]];
        assert.ok(!(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]), `${rot[i].id} × ${rot[j].id}`);
      }
  });
  it("só as maiores disputam um nome e nenhum nome entra na coluna de botões", () => {
    const nos = Array.from({ length: 40 }, (_, i) => ({ id: `c:${i}`, sx: 30 + ((i * 131) % 600), sy: 30 + ((i * 71) % 700), r: 8, total: 100 - i, texto: `Cidade ${i}` }));
    const rot = escolherRotulos(nos, 760, 900, { maximo: 24, considerar: 10, limiteDir: 692 });
    assert.ok(rot.every((r) => Number(r.id.slice(2)) < 10));
    for (const r of rot) {
      const larg = r.texto.length * 6.4 + 4;
      const x1 = r.lado === "dir" ? r.x + r.r + 3 + larg : r.x - r.r - 3;
      assert.ok(x1 <= 690, `${r.id}: ${x1}`);
    }
  });
});
