import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { buscar, criarIndice } from "./consulta";
import {
  contagemCurta,
  faixaDesagio,
  lerPontos,
  montarPontos,
  nivelDaPrecisao,
  posicoesDoLugar,
  precoCurto,
  RAIO_MINIMO,
  RAIO_PADRAO,
  raioDoNivel,
  raioNaTela,
  raioPixelZ0,
  TIPOS_PONTO,
  VERSAO_PONTOS,
  type PontosCompactos,
} from "./pontos";
import type { Busca, Filtros, ImovelResumo } from "./tipos";

const AGORA = new Date("2026-10-14T15:00:00Z");

const BASE: ImovelResumo = {
  id: "x", titulo: "Apartamento", tipo: "apartamento", uf: "SP", cidade: "São Paulo", bairro: "Centro", lat: -23.55, lon: -46.63, precisaoGeo: "exata",
  area: 50, areaTerreno: null, quartos: 2, vagas: null, avaliacao: 200000, lance: 100000, desagio: 50, lanceM2: 2000, avaliacaoM2: 4000,
  modalidade: "leilao", modalidadeFonte: null, praca: null, dataPraca: null, financiamento: null, fgts: null, parcelamento: null, ocupacao: null,
  judicial: null, fonte: { id: "caixa_csv", nome: "Caixa" }, foto: null, totalFotos: 0, selo: 0, seloPendente: false, tags: [],
  coletadoEm: "2026-10-12", notaLocal: null,
};
const im = (id: string, s: Partial<ImovelResumo> = {}): ImovelResumo => ({ ...BASE, id, ...s });

const ITENS: ImovelResumo[] = [
  // o mesmo prédio: dois apartamentos no mesmo ponto (número)
  im("caixa-1", { lat: -23.56123, lon: -46.65432, desagio: 30, lance: 250000 }),
  im("caixa-2", { lat: -23.56123, lon: -46.65432, desagio: 55, lance: 180000 }),
  // na rua
  im("caixa-3", { lat: -23.6, lon: -46.7, precisaoGeo: "rua", tipo: "casa", desagio: null, avaliacao: null, lance: 95050 }),
  // bairro: dois no ponto do bairro, com desvios diferentes
  im("caixa-4", { lat: -23.5, lon: -46.6, precisaoGeo: "bairro", bairro: "Mooca", desagio: 20 }),
  im("caixa-5", { lat: -23.5, lon: -46.6, precisaoGeo: "bairro", bairro: "Mooca", desagio: 40 }),
  // só na cidade (sede do município), outra cidade
  im("caixa-6", { uf: "MG", cidade: "Itajubá", bairro: "Centro", lat: -22.42, lon: -45.45, precisaoGeo: "cidade", tipo: "terreno" }),
  im("caixa-7", { uf: "MG", cidade: "Itajubá", bairro: null, lat: -22.42, lon: -45.45, precisaoGeo: null, desagio: 10 }),
  // sem ponto
  im("caixa-8", { lat: null, lon: null, precisaoGeo: null }),
  // valor fora do padrão (lance > 5× avaliação): entra, mas sem deságio
  im("caixa-9", { lat: -19.9, lon: -43.9, avaliacao: 100000, lance: 900000, desagio: -800 }),
];
const IX = criarIndice(ITENS);
const DESVIOS: Record<number, number> = { 0: 12, 1: 9, 2: 240, 3: 900, 4: 1300 };

function busca(filtros: Filtros = {}, extra: Partial<Busca> = {}): Busca {
  return { conjunto: "previa", plano: "luneta", filtros, ordem: "desagio", pagina: 1, porPagina: 1, ...extra };
}
function pontos(filtros: Filtros = {}, extra: Partial<Busca> = {}): PontosCompactos {
  let m: Int32Array | null = null;
  buscar(IX, busca(filtros, extra), { agora: AGORA, mapa: false, facetas: false, aoFiltrar: (x) => (m = x) });
  return montarPontos(IX, m!, { conjunto: "v1", raio: (k) => DESVIOS[k] ?? null });
}

test("pontos: mesmo ponto vira um lugar só; nível pela precisão; maior desvio do lugar; sem ponto fica de fora", () => {
  const p = pontos();
  assert.equal(p.versao, VERSAO_PONTOS);
  assert.equal(p.conjunto, "v1");
  assert.equal(p.total, 8);
  assert.equal(p.semPonto, 1);
  const d = lerPontos(p);
  assert.equal(d.lugares.length, 5, "prédio, rua, bairro, cidade, valor fora do padrão");
  const porNivel = (n: number) => d.lugares.filter((l) => l.nivel === n);
  const predio = porNivel(0).find((l) => l.n === 2)!;
  assert.ok(predio);
  assert.equal(predio.raio, 10, "o maior desvio do lugar (12 m), em dezenas");
  assert.equal(predio.lanceMin, 180000);
  assert.equal(predio.desagioSoma, 85);
  assert.equal(predio.desagioN, 2);
  // o de maior deságio primeiro
  assert.deepEqual(posicoesDoLugar(d, predio).map((k) => ITENS[k]!.id), ["caixa-2", "caixa-1"]);
  assert.ok(Math.abs(predio.lat - -23.56123) < 1e-9 && Math.abs(predio.lon - -46.65432) < 1e-9, "coordenada volta exata (1e-5)");

  const rua = porNivel(1)[0]!;
  assert.equal(rua.raio, 240);
  assert.equal(rua.desagioN, 0, "sem avaliação: sem deságio");
  assert.equal(rua.lanceMin, 95100, "lance em centenas de reais");
  assert.equal(d.tipo[rua.inicio], TIPOS_PONTO.indexOf("casa"));

  const bairro = porNivel(2)[0]!;
  assert.equal(bairro.n, 2);
  assert.equal(bairro.raio, 1300, "o círculo cobre o maior desvio");
  assert.equal(bairro.nome, "Mooca, São Paulo/SP");

  const cidade = porNivel(3)[0]!;
  assert.equal(cidade.n, 2, "precisão cidade e sem precisão juntos na sede");
  assert.equal(cidade.raio, 0);
  assert.equal(cidade.nome, "Itajubá/MG");

  const suspeito = d.lugares.find((l) => posicoesDoLugar(d, l).some((k) => ITENS[k]!.id === "caixa-9"))!;
  assert.equal(suspeito.desagioN, 0, "valor fora do padrão não pinta o mapa de deságio");
});

test("pontos: seguem os filtros e o plano da lista; a área do mapa não muda os pontos (o servidor a tira antes)", () => {
  assert.equal(pontos({ uf: ["MG"] }).total, 2);
  assert.equal(pontos({ tipo: ["casa"] }).total, 1);
  // filtro avançado no Lente não vale (como na lista)
  assert.equal(pontos({ quartosMin: 3 }, { plano: "lente" }).total, 8);
  assert.equal(pontos({ quartosMin: 3 }).total, 0);
});

test("pontos: ordem Z e diferenças pequenas; formato compacto (lido de volta igual)", () => {
  const p = pontos();
  const json = JSON.parse(JSON.stringify(p)) as PontosCompactos;
  const a = lerPontos(json);
  const b = lerPontos(p);
  assert.deepEqual(a.lugares, b.lugares);
  assert.deepEqual([...a.k].sort(), [0, 1, 2, 3, 4, 5, 6, 8]);
  assert.throws(() => lerPontos({ ...p, versao: 99 as unknown as typeof VERSAO_PONTOS }), /formato/);
  assert.throws(() => lerPontos({ ...p, lugares: { ...p.lugares, n: [1] } }), /tamanhos/);
  assert.throws(() => lerPontos({ ...p, lugares: { ...p.lugares, n: p.lugares.n.map((x) => x + 1) } }), /soma/);
});

test("pontos: 21 mil imóveis viram lugares em poucos ms e cabem em ~150 KB com gzip", () => {
  const n = 21000;
  const grandes = Array.from({ length: n }, (_, k) =>
    im(`caixa-${k}`, {
      lat: -30 + ((k * 7919) % 2000) / 100,
      lon: -55 + ((k * 104729) % 2000) / 100,
      precisaoGeo: (["exata", "rua", "bairro", "cidade"] as const)[k % 4],
      desagio: (k * 31) % 90,
      lance: 50000 + ((k * 7919) % 900000),
    }),
  );
  const ix = criarIndice(grandes);
  let m: Int32Array | null = null;
  buscar(ix, busca(), { agora: AGORA, mapa: false, facetas: false, aoFiltrar: (x) => (m = x) });
  const t = performance.now();
  const p = montarPontos(ix, m!, { conjunto: "v" });
  const ms = performance.now() - t;
  assert.ok(ms < 150, `${ms.toFixed(0)} ms`);
  const gz = gzipSync(JSON.stringify(p)).length;
  assert.ok(gz < 200_000, `${Math.round(gz / 1000)} KB`);
  const t2 = performance.now();
  const d = lerPontos(p);
  assert.ok(performance.now() - t2 < 80);
  assert.equal(d.k.length, n);
});

test("nível da precisão e raio padrão", () => {
  assert.equal(nivelDaPrecisao("exata"), 0);
  assert.equal(nivelDaPrecisao("rua"), 1);
  assert.equal(nivelDaPrecisao("cep"), 2);
  assert.equal(nivelDaPrecisao("bairro"), 2);
  assert.equal(nivelDaPrecisao("cidade"), 3);
  assert.equal(nivelDaPrecisao(null), 3);
  assert.equal(RAIO_PADRAO[3], 0);
  // sem desvio na base: o padrão do nível
  let m: Int32Array | null = null;
  buscar(IX, busca(), { agora: AGORA, mapa: false, facetas: false, aoFiltrar: (x) => (m = x) });
  const d = lerPontos(montarPontos(IX, m!, { conjunto: "v" }));
  assert.equal(d.lugares.find((l) => l.nivel === 2)!.raio, RAIO_PADRAO[2]);
});

test("só o bairro nunca vira ponto: o círculo tem pelo menos 300 m, mesmo com desvio de 10 m na base", () => {
  assert.equal(raioDoNivel(2, 10), RAIO_MINIMO[2]);
  assert.equal(raioDoNivel(2, 1300), 1300);
  assert.equal(raioDoNivel(2, null), RAIO_PADRAO[2]);
  assert.equal(raioDoNivel(1, 10), 10, "na rua, o desvio da base");
  assert.equal(raioDoNivel(3, 900), 0, "na cidade, sem raio (o marcador da sede)");
  let m: Int32Array | null = null;
  buscar(IX, busca(), { agora: AGORA, mapa: false, facetas: false, aoFiltrar: (x) => (m = x) });
  const d = lerPontos(montarPontos(IX, m!, { conjunto: "v", raio: () => 10 }));
  for (const l of d.lugares.filter((x) => x.nivel === 2)) assert.ok(l.raio >= RAIO_MINIMO[2], `bairro com ${l.raio} m`);
  // no zoom 16 (rua), 300 m em São Paulo passam de 130 px de raio: um círculo, nunca um alfinete
  assert.ok(raioNaTela(RAIO_MINIMO[2], -23.55, 16) > 130);
});

test("metros → pixels: um raio de 1 km em São Paulo no zoom 14 tem ~228 px; o raio dobra a cada zoom", () => {
  const z14 = raioNaTela(1000, -23.55, 14);
  // 78.271,5 m/px × cos(23,55°) ÷ 2^14 = 4,38 m/px
  assert.ok(Math.round(z14) === 228, String(z14));
  assert.ok(Math.abs(z14 - 1000 / ((78271.517 * Math.cos((23.55 * Math.PI) / 180)) / 2 ** 14)) < 1e-6);
  assert.ok(Math.abs(raioNaTela(1000, -23.55, 15) / z14 - 2) < 1e-9);
  assert.ok(raioPixelZ0(1000, 0) < raioPixelZ0(1000, -30), "longe do equador, o mesmo raio ocupa mais pixels");
});

test("rótulos: preço curto sem arredondar para cima, contagem curta e faixa do deságio", () => {
  assert.equal(precoCurto(180000), "180 mil");
  assert.equal(precoCurto(99950), "99 mil");
  assert.equal(precoCurto(1250000), "1,2 mi");
  assert.equal(precoCurto(5500), "5,5 mil");
  assert.equal(precoCurto(950), "950");
  assert.equal(precoCurto(0), "");
  assert.equal(contagemCurta(8), "8");
  assert.equal(contagemCurta(1234), "1,2 mil");
  assert.equal(contagemCurta(21230), "21 mil");
  assert.equal(faixaDesagio(null), -1);
  assert.equal(faixaDesagio(NaN), -1);
  assert.equal(faixaDesagio(-10), 0);
  assert.equal(faixaDesagio(19.9), 0);
  assert.equal(faixaDesagio(20), 1);
  assert.equal(faixaDesagio(45), 2);
  assert.equal(faixaDesagio(60), 3);
});
