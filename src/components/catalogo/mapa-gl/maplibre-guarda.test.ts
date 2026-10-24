/**
 * Guarda do peso do mapa (revisão final da rodada 5, R5-TEC-15): o MapLibre (1 MB, 287 KB em gzip) só pode entrar nos
 * pedaços de código do mapa, carregados sob demanda. Um import estático dele (ou de um módulo que o importa) em qualquer
 * outro lugar o poria no JavaScript inicial da lista, da landing ou da página do imóvel, sem nenhum outro teste falhar.
 *
 * Regras conferidas varrendo src/:
 * 1. só MapaGL.tsx, MapaLocalGL.tsx e nucleo.ts (em mapa-gl/) importam "maplibre-gl" de verdade (`import type` não
 *    conta: some na compilação);
 * 2. esses três só são importados de verdade entre si; de fora, só por `import()` (next/dynamic) ou `import type`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const RAIZ = process.cwd();
const SRC = join(RAIZ, "src");
const MAPA_GL = join(SRC, "components", "catalogo", "mapa-gl");
const PESADOS = new Set(["MapaGL", "MapaLocalGL", "nucleo"].map((n) => join(MAPA_GL, n)));

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.ts$/.test(nome) ? [caminho] : [];
  });
}

/** Os módulos importados de verdade (estáticos, sem `import type`; também `export ... from` e import só de efeito). */
function importsEstaticos(codigo: string): string[] {
  const semComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const saida: string[] = [];
  const padroes = [
    /^\s*import\s+(?!type\s)[^;'"]*?\sfrom\s+["']([^"']+)["']/gm,
    /^\s*import\s+["']([^"']+)["']/gm,
    /^\s*export\s+(?!type\s)[^;'"]*?\sfrom\s+["']([^"']+)["']/gm,
  ];
  for (const p of padroes) for (const m of semComentarios.matchAll(p)) saida.push(m[1]!);
  return saida;
}

/** O caminho do módulo importado, sem a extensão (null para pacotes). */
function resolver(de: string, especificador: string): string | null {
  if (especificador.startsWith("@/")) return join(SRC, especificador.slice(2)).replace(/\.(ts|tsx)$/, "");
  if (especificador.startsWith(".")) return resolve(dirname(de), especificador).replace(/\.(ts|tsx)$/, "");
  return null;
}

test("o maplibre-gl só entra nos pedaços do mapa, e esses só por import() (fora do JavaScript inicial)", () => {
  const todos = arquivos(SRC);
  assert.ok(todos.length > 100, "varreu src/");
  const comMaplibre: string[] = [];
  const estaticosDosPesados: string[] = [];
  for (const arq of todos) {
    const semExt = arq.replace(/\.(ts|tsx)$/, "");
    for (const esp of importsEstaticos(readFileSync(arq, "utf8"))) {
      if (esp === "maplibre-gl" || esp.startsWith("maplibre-gl/")) comMaplibre.push(relative(SRC, arq));
      const alvo = resolver(arq, esp);
      if (alvo && PESADOS.has(alvo) && !PESADOS.has(semExt)) estaticosDosPesados.push(`${relative(SRC, arq)} → ${esp}`);
    }
  }
  assert.deepEqual(
    [...new Set(comMaplibre)].sort(),
    ["components/catalogo/mapa-gl/MapaGL.tsx", "components/catalogo/mapa-gl/MapaLocalGL.tsx", "components/catalogo/mapa-gl/nucleo.ts"],
    "só os três módulos do mapa importam o maplibre-gl",
  );
  assert.deepEqual(estaticosDosPesados, [], "de fora, os módulos do mapa só por import() ou import type");
  // e quem os carrega usa import() (Explorar: a vista de mapa; MapaLocal: o mapa da página do imóvel)
  const explorar = readFileSync(join(MAPA_GL, "Explorar.tsx"), "utf8");
  assert.match(explorar, /import\("\.\/MapaGL"\)/);
  const local = readFileSync(join(SRC, "components", "catalogo", "imovel", "MapaLocal.tsx"), "utf8");
  assert.match(local, /dynamic\(\(\) => import\("@\/components\/catalogo\/mapa-gl\/MapaLocalGL"\)/);
});

test("a guarda pega um import estático do mapa (o próprio detector)", () => {
  assert.deepEqual(importsEstaticos('import { MapaGL } from "./mapa-gl/MapaGL";'), ["./mapa-gl/MapaGL"]);
  assert.deepEqual(importsEstaticos('import type { Folga } from "./mapa-gl/MapaGL";'), []);
  assert.deepEqual(importsEstaticos('import "maplibre-gl/dist/maplibre-gl.css";'), ["maplibre-gl/dist/maplibre-gl.css"]);
  assert.deepEqual(importsEstaticos('const M = dynamic(() => import("./MapaGL"));'), []);
  assert.deepEqual(importsEstaticos('export { x } from "./nucleo";'), ["./nucleo"]);
});
