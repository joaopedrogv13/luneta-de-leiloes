import { test } from "node:test";
import assert from "node:assert/strict";
import type { ImovelResumo } from "./tipos";
import { buscasExternas, chaveRuaNaCidade, consultaExterna, indiceDeRuas, mediaAparada, parecidos, referenciasM2, vizinhanca } from "./vizinhanca";

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
  assert.ok(refs.every((r) => r.fonte === "leiloes"));
  const bairro = refs[0]!;
  assert.equal(bairro.media, 3333, "média de avaliação/m² (R$ 200.000 em 60 m²)");
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

test("buscas externas: por nível (rua, bairro, cidade), 5 portais e uma geral em cada, consulta legível", () => {
  assert.equal(consultaExterna(ALVO), "apartamento 2 quartos à venda Centro Uberlândia MG");
  assert.equal(consultaExterna(ALVO, "rua", "Rua Goiás"), "apartamento 2 quartos à venda Rua Goiás Centro Uberlândia MG");
  assert.equal(consultaExterna(ALVO, "cidade"), "apartamento 2 quartos à venda Uberlândia MG");
  assert.equal(consultaExterna(imovel("t", { tipo: "terreno", quartos: null, bairro: null })), "terreno à venda Uberlândia MG");
  assert.equal(consultaExterna(imovel("c", { tipo: "comercial", quartos: 3 })), "imóvel comercial à venda Centro Uberlândia MG", "comercial sem quartos");
  assert.equal(consultaExterna(imovel("q", { quartos: 1 })), "apartamento 1 quarto à venda Centro Uberlândia MG");

  const semRua = buscasExternas(ALVO);
  assert.deepEqual([...new Set(semRua.map((l) => l.nivel))], ["bairro", "cidade"], "sem rua conhecida: bairro e cidade");
  assert.equal(semRua.length, 12);
  const links = buscasExternas(ALVO, { chave: "goias", nome: "Rua Goiás" });
  assert.deepEqual([...new Set(links.map((l) => l.nivel))], ["rua", "bairro", "cidade"]);
  assert.equal(links.length, 18);
  for (const nivel of ["rua", "bairro", "cidade"] as const) {
    const doNivel = links.filter((l) => l.nivel === nivel);
    assert.equal(doNivel.length, 6);
    for (const site of ["zapimoveis.com.br", "vivareal.com.br", "olx.com.br", "quintoandar.com.br", "imovelweb.com.br"]) {
      const l = doNivel.find((x) => decodeURIComponent(x.url).includes(`site:${site}`));
      assert.ok(l, `${nivel} ${site}`);
      assert.match(l.url, /^https:\/\/www\.google\.com\/search\?q=/);
    }
    assert.ok(!decodeURIComponent(doNivel.at(-1)!.url).includes("site:"), "a última de cada nível é a busca geral");
  }
  const rua = links.filter((l) => l.nivel === "rua");
  assert.ok(rua.every((l) => decodeURIComponent(l.url).includes("Rua Goiás") && /na mesma rua/.test(l.descricao!)));
  assert.ok(links.filter((l) => l.nivel === "bairro").every((l) => /no mesmo bairro/.test(l.descricao!)));
  assert.ok(links.filter((l) => l.nivel === "cidade").every((l) => /na cidade/.test(l.descricao!) && !decodeURIComponent(l.url).includes("Centro")));
  assert.deepEqual([...new Set(buscasExternas(imovel("sb", { bairro: null })).map((l) => l.nivel))], ["cidade"], "sem bairro: só a cidade");
});

test("mediaAparada: sem os 10% de cada ponta (a mesma conta do agregar.py)", () => {
  assert.equal(mediaAparada([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 6, "tira o 1 e o 10: média de 2..9 = 5,5 → 6");
  assert.equal(mediaAparada([100, 200, 300]), 200, "com menos de 10, nada sai");
  assert.equal(mediaAparada([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1_000_000]), 1000, "um valor absurdo na ponta sai");
  assert.equal(mediaAparada([]), null);
});

test("rua: índice por UF, cidade e rua (nome genérico leva o bairro) e o recorte da rua com n ≥ 3", () => {
  const naRua = (id: string, s: Partial<ImovelResumo> = {}) => imovel(id, { lance: 90000, area: 60, ...s });
  const itens = [
    ALVO,
    naRua("r1"),
    naRua("r2", { bairro: "Tibery" }),
    naRua("r3"),
    naRua("outra-cidade", { cidade: "Uberaba" }),
    naRua("casa-na-rua", { tipo: "casa" }),
    ...BASE.slice(1),
    imovel("proj-1", { bairro: "Tibery" }),
    imovel("proj-2", { bairro: "Tibery" }),
    imovel("proj-3", { bairro: "Centro" }),
  ];
  const enderecos = itens.map((i) =>
    ["alvo", "r1", "r2", "r3", "outra-cidade", "casa-na-rua"].includes(i.id)
      ? `Rua Goiás, N. ${i.id.length}, Apto 1`
      : i.id.startsWith("proj-")
        ? "Rua Projetada C, N. Sn"
        : null,
  );
  const { ruas, contexto } = indiceDeRuas(itens, enderecos);
  assert.deepEqual(ruas[0], { chave: "goias", nome: "Rua Goiás" });
  const ctx = contexto(0);
  assert.deepEqual(ctx.rua, { chave: "goias", nome: "Rua Goiás" });
  assert.deepEqual(ctx.mesmaRua!.map((i) => i.id).sort(), ["alvo", "casa-na-rua", "r1", "r2", "r3"], "mesma cidade (outros tipos também: o filtro é da vizinhança)");
  const refs = referenciasM2(ALVO, itens, ctx);
  assert.deepEqual(refs.map((r) => [r.escopo, r.nome, r.amostra]).slice(0, 1), [["rua", "Rua Goiás, Uberlândia/MG", 3]], "rua com os 3 apartamentos (sem o próprio e sem a casa)");
  assert.deepEqual(refs[0]!.lanceM2, { mediana: 1500, p25: 1500, p75: 1500 });
  assert.equal(refs[0]!.fonte, "leiloes");
  assert.deepEqual(refs.map((r) => r.escopo), ["rua", "bairro", "cidade", "uf"]);
  // rua com nome que se repete na cidade: só junta quem é do mesmo bairro
  assert.equal(chaveRuaNaCidade(itens.at(-1)!, "projetada c"), "MG|uberlandia|projetada c|centro");
  const kProj = itens.findIndex((i) => i.id === "proj-1");
  assert.deepEqual(contexto(kProj).mesmaRua!.map((i) => i.id), ["proj-1", "proj-2"]);
  // sem endereço: sem rua
  assert.deepEqual(contexto(itens.findIndex((i) => i.id === "sem-area")), { rua: null, mesmaRua: [] });
  // parecidos: a mesma rua vem antes do mesmo bairro
  const p = parecidos(ALVO, itens, 6, new Date("2026-10-14T15:00:00Z"), ctx.mesmaRua).map((i) => i.id);
  assert.deepEqual(p.slice(0, 3), ["r1", "r2", "r3"], "mesma rua primeiro (r2 é de outro bairro, mas da mesma rua)");
  assert.ok(!p.slice(0, 3).some((id) => id.startsWith("centro-")), "os do mesmo bairro vêm depois");
});

test("rua e bairro com a mesma quantidade, mas imóveis diferentes: os dois entram (a avenida passa por outros bairros)", () => {
  // 5 apartamentos na mesma avenida, todos no bairro Tibery; o bairro do alvo (Centro) tem outros 5
  const naAvenida = [1000, 1500, 2000, 2500, 3000].map((m2, k) => imovel(`av-${k}`, { bairro: "Tibery", lance: m2 * 60, area: 60 }));
  const itens = [...BASE, ...naAvenida];
  const ctx = { rua: { chave: "longa", nome: "Avenida Longa" }, mesmaRua: [ALVO, ...naAvenida] };
  const refs = referenciasM2(ALVO, itens, ctx);
  assert.deepEqual(refs.map((r) => [r.escopo, r.amostra]), [["rua", 5], ["bairro", 5], ["cidade", 12], ["uf", 13]]);
  // a mesma lista (rua = bairro inteiro) não se repete
  const soCentro = { rua: { chave: "goias", nome: "Rua Goiás" }, mesmaRua: BASE.filter((i) => i.id.startsWith("centro-")) };
  assert.deepEqual(referenciasM2(ALVO, BASE, soCentro).map((r) => [r.escopo, r.amostra]), [["rua", 5], ["cidade", 7], ["uf", 8]]);
});

test("chaveRuaNaCidade: nome que se repete na cidade (Rua Três) leva o bairro, e sem bairro não tem chave", () => {
  assert.equal(chaveRuaNaCidade(imovel("a", { bairro: "Cabuçu" }), "tres"), "MG|uberlandia|tres|cabucu");
  assert.equal(chaveRuaNaCidade(imovel("b", { bairro: null }), "tres"), null);
  assert.equal(chaveRuaNaCidade(imovel("c", { bairro: null }), "goias"), "MG|uberlandia|goias");
  const itens = [imovel("t1", { bairro: "Cabuçu" }), imovel("t2", { bairro: "Ipiranga" }), imovel("t3", { bairro: "Cabuçu" })];
  const { contexto } = indiceDeRuas(itens, itens.map(() => "Rua Tres, N. 70, Lt 28, Qd 03"));
  assert.deepEqual(contexto(0).mesmaRua!.map((i) => i.id), ["t1", "t3"], "a Rua Três de outro loteamento não entra");
  assert.deepEqual(contexto(1).mesmaRua, []);
});

test("vizinhanca: junta as três partes", () => {
  const v = vizinhanca(ALVO, BASE);
  assert.equal(v.referencias.length, 3);
  assert.ok(v.parecidos.length > 0 && v.parecidos.length <= 6);
  assert.equal(v.buscasExternas.length, 12);
  const comRua = vizinhanca(ALVO, BASE, new Date(), { rua: { chave: "goias", nome: "Rua Goiás" }, mesmaRua: [] });
  assert.equal(comRua.buscasExternas.length, 18);
  assert.equal(comRua.referencias.length, 3, "rua sem amostra não entra");
});
