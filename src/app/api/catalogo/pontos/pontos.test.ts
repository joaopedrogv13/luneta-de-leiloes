/**
 * Os endpoints do mapa de verdade, chamados como o Next chama (GET com NextRequest), sobre o conjunto da demonstração
 * ("exemplos"): GET /api/catalogo/pontos e GET /api/catalogo/pontos/itens. Desde a rodada 5 ele é a vitrine (os ~10
 * melhores imóveis reais, com os 6 exemplos fictícios à parte, fora do índice e do mapa); sem o instantâneo da base
 * (base/saida/site), ficam só os 6 fictícios. O teste vale nos dois casos: o esperado vem do mesmo conjunto carregado.
 * "server-only" aponta para o módulo vazio (o mesmo que o Next usa no servidor) e "@/" para src/.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createJiti } from "jiti";
import { NextRequest } from "next/server";
import { lerPontos, posicoesDoLugar, type PontosCompactos } from "../../../../lib/catalogo/pontos";
import type { DadosConjunto } from "../../../../lib/catalogo/conjuntos";
import type { ImovelResumo } from "../../../../lib/catalogo/tipos";

const RAIZ = process.cwd();
const jiti = createJiti(__filename, {
  alias: {
    "@/": `${join(RAIZ, "src")}/`,
    "server-only": join(RAIZ, "node_modules/next/dist/compiled/server-only/empty.js"),
  },
});

type Rota = { GET: (r: NextRequest) => Promise<Response> };
type Dados = { dadosDoConjunto: (c: "exemplos") => Promise<DadosConjunto> };
const conjuntoExemplos = async () => (await jiti.import<Dados>(join(RAIZ, "src/lib/catalogo/dados.ts"))).dadosDoConjunto("exemplos");
const rotaPontos = () => jiti.import<Rota>(join(RAIZ, "src/app/api/catalogo/pontos/route.ts"));
const rotaItens = () => jiti.import<Rota>(join(RAIZ, "src/app/api/catalogo/pontos/itens/route.ts"));
const pedir = async (rota: Rota, consulta: string, cabecalhos: Record<string, string> = {}) =>
  rota.GET(new NextRequest(`http://localhost/api/catalogo/pontos?${consulta}`, { headers: cabecalhos }));

test("GET /api/catalogo/pontos: a demonstração no formato compacto, com cache público; sem conjunto, 400", async () => {
  const conj = await conjuntoExemplos();
  const ix = conj.indice;
  const rota = await rotaPontos();
  const r = await pedir(rota, "conjunto=exemplos");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("cache-control") ?? "", /public/);
  assert.match(r.headers.get("x-robots-tag") ?? "", /noindex/);
  const p = (await r.json()) as PontosCompactos;
  const d = lerPontos(p);
  assert.ok(ix.n > 0);
  assert.equal(d.total + d.semPonto, ix.n, "todos os imóveis da lista (o índice), nenhum a mais");
  assert.ok([...d.k].every((k) => k >= 0 && k < ix.n), "só posições do índice");
  if (conj.vitrine) {
    // a vitrine: só imóveis reais, com o endereço no número ou na rua; os exemplos fictícios ficam fora do mapa
    assert.ok([...d.k].every((k) => !ix.itens[k]!.id.startsWith("ex-")));
    assert.ok(d.lugares.every((l) => (l.nivel === 0 || l.nivel === 1) && l.raio > 0));
  } else {
    // só os exemplos: ficam na sede da cidade, nenhum vira alfinete exato
    assert.equal(d.total, 6, "os 6 exemplos");
    assert.ok(d.lugares.every((l) => l.nivel === 3 && l.raio === 0 && l.nome?.includes("/")));
  }
  // filtros e área: os filtros valem; a área do mapa não muda os pontos
  const so = lerPontos((await (await pedir(rota, "conjunto=exemplos&uf=SP")).json()) as PontosCompactos);
  assert.equal(so.total + so.semPonto, ix.itens.filter((i) => i.uf === "SP").length);
  const comArea = lerPontos((await (await pedir(rota, "conjunto=exemplos&bbox=-47,-24,-46,-23")).json()) as PontosCompactos);
  assert.equal(comArea.total, d.total);
  assert.equal((await pedir(rota, "")).status, 400);
  // comprimida na rota (o next start não comprime as rotas de API): gzip e brotli conforme o navegador aceita
  const gz = await pedir(rota, "conjunto=exemplos", { "accept-encoding": "gzip, deflate" });
  assert.equal(gz.headers.get("content-encoding"), "gzip");
  assert.equal(gz.headers.get("vary"), "Accept-Encoding");
  assert.equal(lerPontos(JSON.parse(gunzipSync(Buffer.from(await gz.arrayBuffer())).toString()) as PontosCompactos).total, d.total);
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
  assert.equal(itens.length, Math.min(3, ks.length));
  assert.deepEqual(aceitas, ks);
  // os imóveis das posições pedidas, na ordem, e na Luneta com as tags que eles têm
  const ix = (await conjuntoExemplos()).indice;
  assert.deepEqual(
    itens.map((i) => i.id),
    ks.map((k) => ix.itens[k]!.id),
  );
  assert.deepEqual(
    itens.map((i) => i.tags.length),
    ks.map((k) => ix.itens[k]!.tags.length),
    "na Luneta, as tags vêm",
  );
  const lente = (await (await pedir(rota, `conjunto=exemplos&versao=${p.conjunto}&k=${ks.join(",")}&plano=lente`)).json()) as { itens: ImovelResumo[] };
  assert.ok(lente.itens.every((i) => i.tags.length === 0 && i.selo === 0 && i.notaLocal === null), "no Lente, nada da Luneta");
  assert.equal((await pedir(rota, `conjunto=exemplos&versao=outra&k=0`)).status, 409);
  assert.equal((await pedir(rota, `conjunto=exemplos&k=0`)).status, 400);
  // posição fora da lista é ignorada; a primeira depois do índice também (na vitrine, a de um exemplo fictício, que não
  // está no mapa)
  const fora = (await (await pedir(rota, `conjunto=exemplos&versao=${p.conjunto}&k=999,-1,abc,${ix.n},${ks[0]}`)).json()) as { itens: ImovelResumo[]; ks: number[] };
  assert.deepEqual(fora.ks, [ks[0]]);
  assert.equal(fora.itens.length, 1);
});

// ---- revisão final da rodada 5 (R5-TEC-02, R5-TEC-15): a prévia inteira, quando o instantâneo está no repositório ----
const temInstantaneo = existsSync(join(RAIZ, "base/saida/site/imoveis.json.gz"));
type DadosPrevia = { dadosDoConjunto: (c: "previa") => Promise<DadosConjunto> };
type BuscaPrevia = { conjunto: "previa"; plano: "lente" | "luneta"; filtros: object; ordem: "relevancia"; pagina: number };
type Servidor = { buscar: (b: BuscaPrevia) => Promise<{ total: number }> };
const servidor = () => jiti.import<Servidor>(join(RAIZ, "src/lib/catalogo/servidor.ts"));

test("GET /api/catalogo/pontos no Lente: os filtros da Luneta (metrô, nota, tags) não mudam os pontos", { skip: !temInstantaneo }, async () => {
  const rota = await rotaPontos();
  const contar = async (consulta: string) => {
    const d = lerPontos((await (await pedir(rota, consulta)).json()) as PontosCompactos);
    return d.total + d.semPonto;
  };
  const lente = await contar("conjunto=previa&plano=lente");
  assert.ok(lente > 20_000, "a prévia inteira");
  for (const f of ["metro=1", "notaLocalMin=80", "comTags=metro-perto", "quartosMin=3"]) {
    assert.equal(await contar(`conjunto=previa&plano=lente&${f}`), lente, `Lente com ${f}: ignorado, como na lista`);
  }
  // na Luneta, o metrô filtra, com o mesmo número da lista
  const metro = await contar("conjunto=previa&metro=1");
  assert.ok(metro > 0 && metro < lente / 10, `Luneta com metro=1: ${metro}`);
  const { buscar } = await servidor();
  assert.equal(metro, (await buscar({ conjunto: "previa", plano: "luneta", filtros: { metroPerto: true }, ordem: "relevancia", pagina: 1 })).total);
});

test("GET /api/catalogo/pontos acompanha o relógio: praça vencida sai do mapa como sai da lista, e o cache não passa do vencimento", { skip: !temInstantaneo }, async (t) => {
  const { dadosDoConjunto } = await jiti.import<DadosPrevia>(join(RAIZ, "src/lib/catalogo/dados.ts"));
  const ix = (await dadosDoConjunto("previa")).indice;
  const datas = [...new Set([...ix.instante].filter((x) => Number.isFinite(x)))].sort((a, b) => a - b);
  assert.ok(datas.length >= 2, "o instantâneo tem pelo menos duas datas de praça");
  const DIA = 24 * 3600 * 1000;
  const rota = await rotaPontos();
  const { buscar } = await servidor();
  const conferir = async (agora: number) => {
    t.mock.timers.setTime(agora);
    // a mesma URL nas três horas: a segunda e a terceira já encontram a resposta guardada na memória da instância
    const r = await pedir(rota, "conjunto=previa&lanceMin=1");
    const d = lerPontos((await r.json()) as PontosCompactos);
    const lista = await buscar({ conjunto: "previa", plano: "luneta", filtros: { lanceMin: 1 }, ordem: "relevancia", pagina: 1 });
    assert.equal(d.total + d.semPonto, lista.total, `em ${new Date(agora).toISOString()}: o mapa e a lista com o mesmo total`);
    const sMaxAge = Number(/s-maxage=(\d+)/.exec(r.headers.get("cache-control") ?? "")?.[1]);
    return { total: lista.total, sMaxAge };
  };
  // um minuto antes do primeiro vencimento; logo depois dele; depois do último
  t.mock.timers.enable({ apis: ["Date"], now: datas[0]! + DIA - 60_000 });
  const antes = await conferir(datas[0]! + DIA - 60_000);
  assert.ok(antes.sMaxAge <= 60, `o cache vale no máximo até o vencimento (${antes.sMaxAge} s)`);
  const depois = await conferir(datas[0]! + DIA + 1);
  assert.ok(depois.total < antes.total, "o imóvel vencido saiu");
  const fim = await conferir(datas.at(-1)! + DIA + 1);
  assert.ok(fim.total < depois.total);
  assert.ok(fim.sMaxAge <= 86_400 && fim.sMaxAge > 0, "sem vencimento adiante: até a virada do dia");
});
