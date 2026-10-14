import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UFS_MAPA, projetar } from "../../../lib/mapa/brasil-ufs";
import {
  CAIXA_BRASIL,
  ZOOM_MAX,
  ZOOM_MIN,
  caixaDasUfs,
  caixaDosPontos,
  cameraBrasil,
  enquadrar,
  enquadrarResultados,
  interpolar,
  limitar,
  moverPx,
  paraMundo,
  paraTela,
  zoomNoPonto,
  type Tela,
} from "./geometria";

const TELA: Tela = { w: 760, h: 900, folga: { cima: 24, dir: 68, baixo: 52, esq: 24 } };
const perto = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

describe("câmera do mapa", () => {
  it("zoom 1 mostra o Brasil inteiro dentro da área útil (sem os controles e a legenda)", () => {
    const c = cameraBrasil(TELA);
    assert.equal(c.z, 1);
    const [x0, y0] = paraTela(CAIXA_BRASIL[0], CAIXA_BRASIL[1], c, TELA);
    const [x1, y1] = paraTela(CAIXA_BRASIL[2], CAIXA_BRASIL[3], c, TELA);
    assert.ok(x0 >= TELA.folga.esq - 0.5 && x1 <= TELA.w - TELA.folga.dir + 0.5, `x ${x0}..${x1}`);
    assert.ok(y0 >= TELA.folga.cima - 0.5 && y1 <= TELA.h - TELA.folga.baixo + 0.5, `y ${y0}..${y1}`);
    // encosta em pelo menos um dos lados (o Brasil ocupa o espaço)
    assert.ok(perto(x0, TELA.folga.esq, 1) || perto(y0, TELA.folga.cima, 1));
  });

  it("limita o zoom entre 1× e 14×", () => {
    assert.equal(limitar({ z: 0.2, cx: 1000, cy: 1000 }, TELA).z, ZOOM_MIN);
    assert.equal(limitar({ z: 99, cx: 1000, cy: 1000 }, TELA).z, ZOOM_MAX);
    assert.equal(limitar({ z: Number.NaN, cx: 1000, cy: 1000 }, TELA).z, ZOOM_MIN);
  });

  it("não deixa arrastar o Brasil para fora da tela", () => {
    const brasil = cameraBrasil(TELA);
    assert.deepEqual(moverPx(brasil, TELA, 5000, -5000), brasil, "no zoom 1 o país fica parado");
    const perto4 = moverPx({ ...brasil, z: 4 }, TELA, 1e6, 1e6);
    // a borda oeste/norte do Brasil não passa da borda da área útil
    const [x0, y0] = paraTela(CAIXA_BRASIL[0], CAIXA_BRASIL[1], perto4, TELA);
    assert.ok(perto(x0, TELA.folga.esq) && perto(y0, TELA.folga.cima), `${x0}, ${y0}`);
  });

  it("zoom na roda/duplo clique mantém parado o ponto sob o cursor", () => {
    const c = { z: 3, cx: 1300, cy: 1500 };
    const ancora: [number, number] = [200, 600];
    const antes = paraMundo(...ancora, c, TELA);
    const d = zoomNoPonto(c, TELA, 2, ...ancora);
    assert.equal(d.z, 6);
    const depois = paraMundo(...ancora, d, TELA);
    assert.ok(perto(antes[0], depois[0], 1e-6) && perto(antes[1], depois[1], 1e-6));
    // e a animação também: no meio do caminho a âncora continua no mesmo lugar
    const meio = interpolar(c, d, 0.5);
    const noMeio = paraMundo(...ancora, meio, TELA);
    assert.ok(perto(antes[0], noMeio[0], 1e-6) && perto(antes[1], noMeio[1], 1e-6));
    assert.ok(meio.z > 3 && meio.z < 6);
    assert.deepEqual(interpolar(c, d, 0), c);
    assert.deepEqual(interpolar(c, d, 1), d);
  });

  it("enquadra uma UF inteira (MG) na área útil", () => {
    const caixa = caixaDasUfs(["mg"])!;
    assert.deepEqual(caixa, UFS_MAPA.MG.caixa);
    const c = enquadrar(caixa, TELA);
    assert.ok(c.z > 2.5, `zoom ${c.z}`);
    const [x0, y0] = paraTela(caixa[0], caixa[1], c, TELA);
    const [x1, y1] = paraTela(caixa[2], caixa[3], c, TELA);
    assert.ok(x0 >= TELA.folga.esq - 0.5 && x1 <= TELA.w - TELA.folga.dir + 0.5);
    assert.ok(y0 >= TELA.folga.cima - 0.5 && y1 <= TELA.h - TELA.folga.baixo + 0.5);
    assert.equal(caixaDasUfs(["XX"]), null);
  });

  it("resultados no país todo mostram o Brasil inteiro; uma cidade aproxima sem passar de 9×", () => {
    const capitais = [
      [-9.97, -67.82], [2.82, -60.67], [-30.03, -51.23], [-7.12, -34.86], [-3.12, -60.02],
    ].map(([lat, lon]) => {
      const [x, y] = projetar(lat, lon);
      return { x, y };
    });
    assert.equal(enquadrarResultados(caixaDosPontos(capitais)!, TELA, 26).z, 1);
    const [x, y] = projetar(-18.91, -48.27);
    const umaCidade = enquadrarResultados(caixaDosPontos([{ x, y }])!, TELA, 26);
    assert.ok(umaCidade.z > 5 && umaCidade.z <= 9, `zoom ${umaCidade.z}`);
    const [sx, sy] = paraTela(x, y, umaCidade, TELA);
    assert.ok(sx > 0 && sx < TELA.w && sy > 0 && sy < TELA.h);
  });

  it("a projeção dos pontos é a mesma do contorno: Uberlândia cai dentro da caixa de MG", () => {
    const [x, y] = projetar(-18.91, -48.27);
    const [x0, y0, x1, y1] = UFS_MAPA.MG.caixa;
    assert.ok(x > x0 && x < x1 && y > y0 && y < y1);
  });
});
