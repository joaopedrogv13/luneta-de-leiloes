/**
 * Rótulos do mínimo e do máximo na régua do "Meu lance" (rodada 6, decisão 2): nunca se sobrepõem nem saem da faixa.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrumarRotulos, fimDaRegua } from "./marcas";

const sobrepoe = (esq: number[], larg: number[], folga: number) => {
  const pares = esq.map((x, i) => [x, x + larg[i]!] as const).sort((a, b) => a[0] - b[0]);
  return pares.some((p, i) => i > 0 && p[0] < pares[i - 1]![1] + folga - 1e-9);
};

test("rótulos longe um do outro ficam centrados nos traços", () => {
  assert.deepEqual(arrumarRotulos([60, 220], [100, 100], 280), [10, 170]);
});

test("rótulos presos às bordas da faixa", () => {
  // o da esquerda colado no começo, o da direita no fim
  assert.deepEqual(arrumarRotulos([5, 278], [100, 100], 280), [0, 180]);
});

test("rótulos próximos se afastam do ponto de encontro, sem se sobrepor (celular de 360 px: faixa de ~280 px)", () => {
  for (const faixa of [240, 280, 330]) {
    for (let a = 0; a <= faixa; a += 7) {
      for (let b = 0; b <= faixa; b += 11) {
        const larg = [104, 112];
        const esq = arrumarRotulos([a, b], larg, faixa, 8);
        assert.ok(!sobrepoe(esq, larg, 8), `faixa ${faixa}, traços ${a} e ${b}: ${esq}`);
        esq.forEach((x, i) => {
          assert.ok(x >= 0 && x + larg[i]! <= faixa + 1e-9, `faixa ${faixa}, traços ${a} e ${b}: rótulo ${i} em ${x}`);
        });
      }
    }
  }
});

test("a ordem dos rótulos acompanha a dos traços (o máximo abaixo do mínimo fica à esquerda)", () => {
  const [min, max] = arrumarRotulos([150, 140], [90, 90], 280);
  assert.ok(max! < min!);
});

test("sem espaço para os dois: encostados a partir da esquerda, um só rótulo, nenhum", () => {
  assert.deepEqual(arrumarRotulos([50, 60], [150, 150], 200, 8), [0, 158]);
  assert.deepEqual(arrumarRotulos([140], [100], 280), [90]);
  assert.deepEqual(arrumarRotulos([], [], 280), []);
});

test("fim da régua: cabe o lance máximo, mesmo acima da maior venda dos cenários (revisão da rodada 6)", () => {
  // o padrão de antes: 1,6 × o mínimo ou a maior venda dos cenários, o que for maior, em múltiplos de R$ 1.000
  assert.equal(fimDaRegua(25_100, 276_100, 129_024), 276_000);
  assert.equal(fimDaRegua(210_000, 385_000, 202_686), 385_000);
  assert.equal(fimDaRegua(210_000, 385_000, null), 385_000);
  // venda direta num cenário personalizado de 250%: o máximo (R$ 388.175) passava do fim (R$ 276.000) e a marca ficava
  // presa na ponta; agora a régua vai até o máximo com 10% de folga
  const fim = fimDaRegua(25_100, 276_100, 388_175);
  assert.ok(fim > 388_175 && fim % 1000 === 0, String(fim));
  assert.equal(fim, 427_000);
  // nunca abaixo de R$ 10.000
  assert.equal(fimDaRegua(0, 0, 0), 10_000);
  for (const teto of [1, 999, 10_001, 1_234_567, 98_765_432]) assert.ok(fimDaRegua(0, 0, teto) >= teto, String(teto));
});
