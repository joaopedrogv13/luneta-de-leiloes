import { test } from "node:test";
import assert from "node:assert/strict";
import * as modulo from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LADO_MAPA, latLonParaMapa, posicaoNoMapa } from "./mapa.ts";
import { tabelaPadrao } from "./municipios.ts";

interface ProjecaoDoSite {
  latLonToMap: (lat: number, lon: number) => readonly [number, number];
  BRAZIL_PATH: string;
  BRAZIL_PINS: Record<string, readonly [number, number]>;
}

/** Carrega src/lib/brazil.ts (o código do site) sem passar pelo Next: tira os tipos e importa como data: URL. */
async function carregarSite(): Promise<ProjecaoDoSite | null> {
  const tirarTipos = (modulo as unknown as { stripTypeScriptTypes?: (codigo: string) => string }).stripTypeScriptTypes;
  if (!tirarTipos) return null;
  const fonte = readFileSync(fileURLToPath(new URL("../../src/lib/brazil.ts", import.meta.url)), "utf8");
  return (await import(`data:text/javascript;base64,${Buffer.from(tirarTipos(fonte)).toString("base64")}`)) as ProjecaoDoSite;
}

/** Ponto dentro do contorno do site (path SVG só com M/L/Z, como o BRAZIL_PATH). */
function dentroDoContorno(x: number, y: number, caminho: string): boolean {
  const pontos = [...caminho.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  let dentro = false;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const [xi, yi] = pontos[i] ?? [0, 0];
    const [xj, yj] = pontos[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

test("mesma projeção do site (latLonToMap de src/lib/brazil.ts) em todas as sedes", async (t) => {
  const site = await carregarSite();
  if (!site) {
    t.skip("node:module sem stripTypeScriptTypes (Node < 22.13)");
    return;
  }
  for (const m of tabelaPadrao().municipios) {
    assert.deepEqual(latLonParaMapa(m.lat, m.lon), [...site.latLonToMap(m.lat, m.lon)], `${m.nome}/${m.uf}`);
  }
  assert.deepEqual(latLonParaMapa(-23.55, -46.63), [...site.latLonToMap(-23.55, -46.63)]);
});

test("sedes caem no mapa do site: dentro do viewBox e quase todas dentro do contorno", async (t) => {
  const site = await carregarSite();
  let dentro = 0;
  const municipios = tabelaPadrao().municipios;
  for (const m of municipios) {
    const posicao = posicaoNoMapa(m.lat, m.lon);
    assert.ok(posicao, `${m.nome}/${m.uf} fora do viewBox`);
    if (site && dentroDoContorno(posicao[0], posicao[1], site.BRAZIL_PATH)) dentro++;
  }
  if (!site) {
    t.skip("sem o contorno do site");
    return;
  }
  // O contorno é simplificado: ilhas (Noronha) e parte do litoral ficam de fora.
  assert.ok(dentro / municipios.length > 0.98, `${dentro} de ${municipios.length} dentro do contorno`);
  // As capitais marcadas no site batem com a sede (a calibração do site usou as capitais).
  const pinos: Array<[string, string]> = [["sp", "3550308"], ["rj", "3304557"], ["bh", "3106200"], ["poa", "4314902"], ["mao", "1302603"], ["rec", "2611606"]];
  for (const [pino, codigo] of pinos) {
    const m = tabelaPadrao().porCodigo(codigo);
    const [x, y] = latLonParaMapa(m?.lat ?? 0, m?.lon ?? 0);
    const [px, py] = site.BRAZIL_PINS[pino] ?? [0, 0];
    assert.ok(Math.hypot(x - px, y - py) < 1.5, `${pino}: sede em ${x},${y}, pino em ${px},${py}`);
  }
});

test("posicaoNoMapa: sem coordenada ou fora do viewBox dá null", () => {
  assert.equal(posicaoNoMapa(null, -46), null);
  assert.equal(posicaoNoMapa(-23, undefined), null);
  assert.equal(posicaoNoMapa(40.7, -74.0), null, "Nova York fica fora do mapa");
  const [x, y] = posicaoNoMapa(-15.7795, -47.9297) ?? [-1, -1];
  assert.ok(x > 0 && x < LADO_MAPA && y > 0 && y < LADO_MAPA);
});
