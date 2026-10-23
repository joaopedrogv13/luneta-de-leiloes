/**
 * Os endpoints do mapa de verdade, chamados como o Next chama (GET com NextRequest), sobre os exemplos fictícios (o
 * conjunto que não depende de arquivos gerados): GET /api/catalogo/pontos e GET /api/catalogo/pontos/itens.
 * "server-only" aponta para o módulo vazio (o mesmo que o Next usa no servidor) e "@/" para src/.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createJiti } from "jiti";
import { NextRequest } from "next/server";
import { lerPontos, posicoesDoLugar, type PontosCompactos } from "../../../../lib/catalogo/pontos";
import type { ImovelResumo } from "../../../../lib/catalogo/tipos";

const RAIZ = process.cwd();
const jiti = createJiti(__filename, {
  alias: {
    "@/": `${join(RAIZ, "src")}/`,
    "server-only": join(RAIZ, "node_modules/next/dist/compiled/server-only/empty.js"),
  },
});

type Rota = { GET: (r: NextRequest) => Promise<Response> };
const rotaPontos = () => jiti.import<Rota>(join(RAIZ, "src/app/api/catalogo/pontos/route.ts"));
const rotaItens = () => jiti.import<Rota>(join(RAIZ, "src/app/api/catalogo/pontos/itens/route.ts"));
const pedir = async (rota: Rota, consulta: string, cabecalhos: Record<string, string> = {}) =>
  rota.GET(new NextRequest(`http://localhost/api/catalogo/pontos?${consulta}`, { headers: cabecalhos }));

test("GET /api/catalogo/pontos: os exemplos no formato compacto, com cache público; sem conjunto, 400", async () => {
  const rota = await rotaPontos();
  const r = await pedir(rota, "conjunto=exemplos");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("cache-control") ?? "", /public/);
  assert.match(r.headers.get("x-robots-tag") ?? "", /noindex/);
  const p = (await r.json()) as PontosCompactos;
  const d = lerPontos(p);
  assert.equal(d.total, 6, "os 6 exemplos");
  // exemplos ficam na sede da cidade: nenhum vira alfinete exato
  assert.ok(d.lugares.every((l) => l.nivel === 3 && l.raio === 0 && l.nome?.includes("/")));
  // filtros e área: a área do mapa não muda os pontos
  const so = lerPontos((await (await pedir(rota, "conjunto=exemplos&uf=SP")).json()) as PontosCompactos);
  assert.equal(so.total, 1);
  const comArea = lerPontos((await (await pedir(rota, "conjunto=exemplos&bbox=-47,-24,-46,-23")).json()) as PontosCompactos);
  assert.equal(comArea.total, 6);
  assert.equal((await pedir(rota, "")).status, 400);
  // comprimida na rota (o next start não comprime as rotas de API): gzip e brotli conforme o navegador aceita
  const gz = await pedir(rota, "conjunto=exemplos", { "accept-encoding": "gzip, deflate" });
  assert.equal(gz.headers.get("content-encoding"), "gzip");
  assert.equal(gz.headers.get("vary"), "Accept-Encoding");
  assert.equal(lerPontos(JSON.parse(gunzipSync(Buffer.from(await gz.arrayBuffer())).toString()) as PontosCompactos).total, 6);
  assert.equal((await pedir(rota, "conjunto=exemplos", { "accept-encoding": "gzip, deflate, br, zstd" })).headers.get("content-encoding"), "br");
});

test("GET /api/catalogo/pontos/itens: os imóveis pela posição, com o plano; versão velha dá 409", async () => {
  const p = (await (await pedir(await rotaPontos(), "conjunto=exemplos")).json()) as PontosCompactos;
  const d = lerPontos(p);
  const ks = d.lugares.flatMap((l) => posicoesDoLugar(d, l)).slice(0, 3);
  const rota = await rotaItens();
  const luneta = await pedir(rota, `conjunto=exemplos&versao=${p.conjunto}&k=${ks.join(",")}`);
  assert.equal(luneta.status, 200);
  assert.equal(luneta.headers.get("cache-control"), "no-store");
  const { itens, ks: aceitas } = (await luneta.json()) as { itens: ImovelResumo[]; ks: number[] };
  assert.equal(itens.length, 3);
  assert.deepEqual(aceitas, ks);
  assert.ok(itens.some((i) => i.tags.length > 0), "na Luneta, as tags vêm");
  const lente = (await (await pedir(rota, `conjunto=exemplos&versao=${p.conjunto}&k=${ks.join(",")}&plano=lente`)).json()) as { itens: ImovelResumo[] };
  assert.ok(lente.itens.every((i) => i.tags.length === 0 && i.selo === 0 && i.notaLocal === null), "no Lente, nada da Luneta");
  assert.equal((await pedir(rota, `conjunto=exemplos&versao=outra&k=0`)).status, 409);
  assert.equal((await pedir(rota, `conjunto=exemplos&k=0`)).status, 400);
  // posição fora da lista é ignorada
  const fora = (await (await pedir(rota, `conjunto=exemplos&versao=${p.conjunto}&k=999,-1,abc,${ks[0]}`)).json()) as { itens: ImovelResumo[]; ks: number[] };
  assert.deepEqual(fora.ks, [ks[0]]);
  assert.equal(fora.itens.length, 1);
});
