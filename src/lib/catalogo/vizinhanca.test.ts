import { test } from "node:test";
import assert from "node:assert/strict";
import type { ImovelResumo } from "./tipos";
import { buscasExternas, consultaExterna, parecidos, referenciasM2, vizinhanca } from "./vizinhanca";

function imovel(id: string, s: Partial<ImovelResumo> = {}): ImovelResumo {
  const area = s.area === undefined ? 60 : s.area;
  const lance = s.lance ?? 120000;
  const avaliacao = s.avaliacao === undefined ? 200000 : s.avaliacao;
  return {
    id, titulo: "Apartamento 2 quartos", tipo: "apartamento", uf: "MG", cidade: "Uberlândia", bairro: "Centro", lat: -18.9, lon: -48.3,
    precisaoGeo: "cidade", area, areaTerreno: null, quartos: 2, vagas: 1, avaliacao, lance, desagio: avaliacao ? Math.round(100 * (1 - lance / avaliacao)) : null,
    lanceM2: area ? Math.round(lance / area) : null, avaliacaoM2: area && avaliacao ? Math.round(avaliacao / area) : null,
    modalidade: "venda_direta", modalidadeFonte: null, praca: "unica", dataPraca: null, financiamento: true, fgts: null, parcelamento: null,
    ocupacao: null, judicial: false, fonte: { id: "caixa_csv", nome: "Caixa" }, foto: "https://x.test/f.jpg", totalFotos: 1, selo: 0,
    seloPendente: true, tags: [], coletadoEm: "2026-10-12", ...s,
  };
}

const ALVO = imovel("alvo", { lance: 100000, area: 50 }); // R$ 2.000/m²
const BASE: ImovelResumo[] = [
  ALVO,
  // bairro Centro: 5 outros apartamentos (R$/m² de 1.000 a 5.000)
  ...[1000, 2000, 3000, 4000, 5000].map((m2, k) => imovel(`centro-${k}`, { lance: m2 * 60, area: 60 })),
  // outro bairro da mesma cidade
  ...[1500, 2500].map((m2, k) => imovel(`sm-${k}`, { bairro: "SANTA MONICA", lance: m2 * 60, area: 60 })),
  // outra cidade da UF e outro tipo
  imovel("uberaba", { cidade: "Uberaba", lance: 60000, area: 60 }),
  imovel("casa", { tipo: "casa", lance: 60000, area: 60 }),
  imovel("sem-area", { area: null }),
];

test("referências de R$/m²: bairro, cidade e UF com amostra suficiente, sem o próprio imóvel", () => {
  const refs = referenciasM2(ALVO, BASE);
  assert.deepEqual(refs.map((r) => [r.escopo, r.nome, r.amostra]), [
    ["bairro", "Centro, Uberlândia/MG", 5],
    ["cidade", "Uberlândia/MG", 7],
    ["uf", "MG", 8],
  ]);
  const bairro = refs[0]!;
  assert.deepEqual(bairro.lanceM2, { mediana: 3000, p25: 2000, p75: 4000 });
  assert.deepEqual(bairro.imovel, { avaliacaoM2: 4000, lanceM2: 2000 });
  assert.equal(bairro.percentilLance, 60, "3 dos 5 têm R$/m² de lance maior");
  assert.equal(bairro.tipo, "apartamento");
  assert.ok(bairro.avaliacaoM2 && bairro.avaliacaoM2.mediana > 0);
  // bairro com amostra pequena fica de fora; cidade igual à UF não repete
  const sm = imovel("sm-x", { bairro: "Santa Mônica" });
  assert.deepEqual(referenciasM2(sm, BASE).map((r) => r.escopo), ["cidade", "uf"]);
  assert.deepEqual(referenciasM2(imovel("so", { uf: "AC", cidade: "Rio Branco" }), BASE), [], "sem amostra, sem referência");
});

test("parecidos: mesmo tipo e cidade, mesmo bairro primeiro, área ±35% e quartos ±1, com foto antes; nunca o próprio", () => {
  const lista = [
    ALVO,
    imovel("bairro-sem-foto", { area: 52, foto: null }),
    imovel("bairro-com-foto", { area: 55 }),
    imovel("outro-bairro", { bairro: "Tibery", area: 50 }),
    imovel("grande", { area: 200 }),
    imovel("muitos-quartos", { quartos: 5, area: 50 }),
    imovel("sem-quartos", { quartos: null, area: 48 }),
    imovel("outra-cidade", { cidade: "Uberaba", area: 50 }),
    imovel("casa", { tipo: "casa", area: 50 }),
    ...Array.from({ length: 4 }, (_, k) => imovel(`extra-${k}`, { bairro: "Tibery", area: 60 + k })),
  ];
  const p = parecidos(ALVO, lista).map((i) => i.id);
  assert.equal(p.length, 6);
  assert.deepEqual(p.slice(0, 3), ["bairro-com-foto", "sem-quartos", "bairro-sem-foto"], "mesmo bairro, com foto antes");
  assert.ok(!p.includes("alvo") && !p.includes("outra-cidade") && !p.includes("casa"));
  assert.ok(!p.includes("grande") && !p.includes("muitos-quartos"), "fora das faixas não entra");
  assert.deepEqual(parecidos(ALVO, [ALVO, imovel("grande", { area: 200 }), imovel("q5", { quartos: 5, area: 50 })]), [], "melhor nenhum do que um que não parece");
  assert.deepEqual(parecidos(ALVO, [ALVO, imovel("borda", { area: 67.5, quartos: 3 })]).map((i) => i.id), ["borda"], "+35% e +1 quarto ainda entram");
  assert.deepEqual(parecidos(imovel("sem-dados", { area: null, quartos: null }), [ALVO]).map((i) => i.id), ["alvo"], "sem área nem quartos no imóvel, só tipo e cidade");
  const agora = new Date("2026-10-14T15:00:00Z");
  const vencido = imovel("vencido", { dataPraca: "2026-10-12T13:00:00.000Z" });
  const ontem = imovel("ontem", { dataPraca: "2026-10-13T20:00:00.000Z" });
  assert.deepEqual(parecidos(ALVO, [ALVO, vencido, ontem], 6, agora).map((i) => i.id), ["ontem"], "praça vencida há mais de 1 dia não entra");
});

test("buscas externas: Google com site: para 5 portais e uma geral, consulta legível", () => {
  assert.equal(consultaExterna(ALVO), "apartamento 2 quartos à venda Centro Uberlândia MG");
  assert.equal(consultaExterna(imovel("t", { tipo: "terreno", quartos: null, bairro: null })), "terreno à venda Uberlândia MG");
  assert.equal(consultaExterna(imovel("c", { tipo: "comercial", quartos: 3 })), "imóvel comercial à venda Centro Uberlândia MG", "comercial sem quartos");
  assert.equal(consultaExterna(imovel("q", { quartos: 1 })), "apartamento 1 quarto à venda Centro Uberlândia MG");
  const links = buscasExternas(ALVO);
  assert.equal(links.length, 6);
  for (const site of ["zapimoveis.com.br", "vivareal.com.br", "olx.com.br", "quintoandar.com.br", "imovelweb.com.br"]) {
    const l = links.find((x) => decodeURIComponent(x.url).includes(`site:${site}`));
    assert.ok(l, site);
    assert.match(l.url, /^https:\/\/www\.google\.com\/search\?q=/);
  }
  assert.ok(!decodeURIComponent(links.at(-1)!.url).includes("site:"), "a última é a busca geral");
});

test("vizinhanca: junta as três partes", () => {
  const v = vizinhanca(ALVO, BASE);
  assert.equal(v.referencias.length, 3);
  assert.ok(v.parecidos.length > 0 && v.parecidos.length <= 6);
  assert.equal(v.buscasExternas.length, 6);
});
