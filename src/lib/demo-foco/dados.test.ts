import { test } from "node:test";
import assert from "node:assert/strict";
import { CENTRO_UF, CIDADES, CIDADES_COM_METRO, METRO_PERTO, gerarImoveis, tituloImovel, type ImovelFoco } from "./dados";
import { LIMITES } from "./busca";
import { TOTAL_FICTICIOS } from "./total";

const LISTA = gerarImoveis();
const CIDADE = new Map(CIDADES.map((c) => [`${c.uf}|${c.nome}`, c]));

test("determinístico: a mesma lista a cada chamada (e os mesmos valores de sempre)", () => {
  assert.deepEqual(gerarImoveis(), LISTA);
  assert.notEqual(gerarImoveis(), LISTA, "uma lista nova a cada chamada (quem usa pode mexer nela)");
  // valores fixos: se mudarem, a semente, uma tabela ou o gerador mudou (atualize aqui de propósito)
  const f001 = LISTA[0];
  assert.deepEqual(
    [f001.id, f001.tipo, f001.cidade, f001.bairro, f001.quartos, f001.area, f001.avaliacao, f001.lance, f001.desagio, f001.praca],
    ["f001", "apartamento", "São Paulo", "Santana", 4, 206, 2454000, 932500, 62, "2"],
  );
});

test("150 imóveis com ids únicos, em várias cidades e estados reais", () => {
  assert.equal(LISTA.length, 150);
  assert.equal(TOTAL_FICTICIOS, LISTA.length, "a moldura da landing mostra o mesmo total");
  assert.equal(new Set(LISTA.map((i) => i.id)).size, 150);
  assert.equal(CIDADES.reduce((s, c) => s + c.n, 0), 150, "a soma de n das cidades é o total");
  const ufs = new Set(LISTA.map((i) => i.uf));
  const cidades = new Set(LISTA.map((i) => `${i.uf}|${i.cidade}`));
  assert.ok(ufs.size >= 15, `${ufs.size} UFs`);
  assert.ok(cidades.size >= 25, `${cidades.size} cidades`);
  for (const i of LISTA) {
    const c = CIDADE.get(`${i.uf}|${i.cidade}`);
    assert.ok(c, `cidade da tabela: ${i.cidade}`);
    assert.ok(
      c.bairros.some(([b]) => b === i.bairro),
      `${i.bairro} é bairro de ${i.cidade}`,
    );
  }
});

test("todos os tipos, praças, ocupações e as duas respostas de financiamento aparecem", () => {
  const de = (f: (i: ImovelFoco) => string) => new Set(LISTA.map(f));
  assert.deepEqual([...de((i) => i.tipo)].sort(), ["apartamento", "casa", "comercial", "terreno"]);
  assert.deepEqual([...de((i) => i.praca)].sort(), ["1", "2", "unica"]);
  assert.deepEqual([...de((i) => i.ocupacao)].sort(), ["desocupado", "nao_informado", "ocupado"]);
  assert.deepEqual([...de((i) => String(i.financiamento))].sort(), ["false", "true"]);
  const apartamentos = LISTA.filter((i) => i.tipo === "apartamento").length;
  assert.ok(apartamentos > 60 && apartamentos < 110, "a maioria é apartamento, como nos leilões de verdade");
});

test("preços coerentes: avaliação pelo m² da cidade e do bairro, lance abaixo dela, deságio pela praça", () => {
  const FATOR = { apartamento: 1, casa: 0.8, comercial: 1.05, terreno: 0.16 };
  for (const i of LISTA) {
    const c = CIDADE.get(`${i.uf}|${i.cidade}`)!;
    const nivel = c.bairros.find(([b]) => b === i.bairro)![1];
    const m2 = i.avaliacao / i.area;
    const esperado = c.m2 * nivel * FATOR[i.tipo];
    assert.ok(m2 > esperado * 0.85 && m2 < esperado * 1.15, `${i.id}: R$ ${Math.round(m2)}/m² perto de ${Math.round(esperado)}`);
    assert.ok(i.lance < i.avaliacao, `${i.id}: lance abaixo da avaliação`);
    assert.equal(i.desagio, Math.round((1 - i.lance / i.avaliacao) * 100), `${i.id}: deságio = 1 − lance/avaliação`);
    assert.equal(i.avaliacao % 1000, 0);
    assert.equal(i.lance % 100, 0);
    const faixa = { "1": [5, 30], "2": [35, 60], unica: [15, 50] }[i.praca];
    const extra = i.ocupacao === "ocupado" ? 4 : 0;
    assert.ok(i.desagio >= faixa[0] - 1 && i.desagio <= Math.min(65, faixa[1] + extra) + 1, `${i.id}: deságio ${i.desagio}% na ${i.praca}ª praça`);
    assert.ok(i.lance >= 30_000 && i.lance <= 3_000_000, `${i.id}: lance plausível (${i.lance})`);
  }
  const media = (l: ImovelFoco[]) => l.reduce((s, i) => s + i.desagio, 0) / l.length;
  assert.ok(media(LISTA.filter((i) => i.praca === "2")) > media(LISTA.filter((i) => i.praca === "1")) + 15, "a 2ª praça é bem mais funda que a 1ª");
  const sp = LISTA.filter((i) => i.cidade === "São Paulo" && i.tipo === "apartamento");
  const feira = CIDADE.get("BA|Feira de Santana")!;
  assert.ok(Math.min(...sp.map((i) => i.avaliacao / i.area)) > feira.m2 * 0.5, "o m² de São Paulo é de outro patamar");
});

test("quartos e área conforme o tipo", () => {
  for (const i of LISTA) {
    if (i.tipo === "comercial" || i.tipo === "terreno") assert.equal(i.quartos, null, `${i.id}: ${i.tipo} sem quartos`);
    else assert.ok(i.quartos !== null && i.quartos >= 1 && i.quartos <= 4, `${i.id}: quartos`);
    if (i.tipo === "apartamento") assert.ok(i.area >= 32 && i.area <= 210, `${i.id}: área de apartamento`);
    if (i.tipo === "terreno") assert.ok(i.area >= 160 && i.area <= 900 && i.area % 10 === 0, `${i.id}: lote`);
    if (i.tipo === "apartamento" && i.quartos === 1) assert.ok(i.area <= 52, `${i.id}: 1 quarto pequeno`);
    if (i.tipo === "apartamento" && i.quartos === 4) assert.ok(i.area >= 110, `${i.id}: 4 quartos grande`);
  }
  assert.equal(tituloImovel({ tipo: "apartamento", quartos: 1, area: 40 }), "Apartamento 1 quarto");
  assert.equal(tituloImovel({ tipo: "casa", quartos: 3, area: 120 }), "Casa 3 quartos");
  assert.equal(tituloImovel({ tipo: "comercial", quartos: null, area: 40 }), "Sala comercial");
  assert.equal(tituloImovel({ tipo: "comercial", quartos: null, area: 150 }), "Loja");
  assert.equal(tituloImovel({ tipo: "terreno", quartos: null, area: 400 }), "Terreno");
});

test("metrô só nas capitais com metrô, nos bairros com estação e com endereço preciso", () => {
  assert.deepEqual([...CIDADES_COM_METRO].sort(), ["Belo Horizonte", "Brasília", "Fortaleza", "Recife", "Rio de Janeiro", "Salvador", "São Paulo"]);
  for (const i of LISTA) {
    if (i.metro === null) continue;
    const c = CIDADE.get(`${i.uf}|${i.cidade}`)!;
    assert.ok(c.metro, `${i.id}: ${i.cidade} tem metrô`);
    const estacao = c.bairros.find(([b]) => b === i.bairro)![2];
    assert.ok(estacao, `${i.id}: ${i.bairro} tem estação`);
    if (estacao === "m") assert.ok(i.metro > METRO_PERTO, `${i.id}: bairro sem estação perto não fica "perto"`);
    assert.ok(i.nota !== null, `${i.id}: metrô só com endereço preciso (o mesmo que tem nota)`);
    assert.ok(i.metro >= 100 && i.metro <= 3000 && i.metro % 10 === 0, `${i.id}: ${i.metro} m`);
  }
  const perto = LISTA.filter((i) => i.metro !== null && i.metro <= METRO_PERTO).length;
  assert.ok(perto >= 20 && perto <= 60, `${perto} imóveis a até 1 km do metrô`);
});

test("nota de localização de 0 a 100, maior nos bairros mais valorizados; ~1 em 10 sem nota", () => {
  const semNota = LISTA.filter((i) => i.nota === null).length;
  assert.ok(semNota >= 5 && semNota <= 30, `${semNota} sem nota`);
  for (const i of LISTA) if (i.nota !== null) assert.ok(Number.isInteger(i.nota) && i.nota >= 0 && i.nota <= 100);
  const nivel = (i: ImovelFoco) => CIDADE.get(`${i.uf}|${i.cidade}`)!.bairros.find(([b]) => b === i.bairro)![1];
  const comNota = LISTA.filter((i) => i.nota !== null);
  const media = (l: ImovelFoco[]) => l.reduce((s, i) => s + i.nota!, 0) / l.length;
  assert.ok(media(comNota.filter((i) => nivel(i) >= 1.2)) > media(comNota.filter((i) => nivel(i) <= 0.8)) + 15);
  for (const t of [40, 60, 80]) assert.ok(comNota.some((i) => i.nota! >= t), `alguém com nota ${t}+`);
});

test("as escalas fixas das faixas cobrem todos os valores", () => {
  const cobre = (limites: readonly number[], valores: number[]) => Math.min(...valores) >= limites[0] && Math.max(...valores) <= limites[limites.length - 1];
  assert.ok(cobre(LIMITES.lance, LISTA.map((i) => i.lance)));
  assert.ok(cobre(LIMITES.desagio, LISTA.map((i) => i.desagio)));
  assert.ok(cobre(LIMITES.area, LISTA.map((i) => i.area)));
  for (const l of Object.values(LIMITES)) for (let k = 1; k < l.length; k++) assert.ok(l[k] > l[k - 1], "limites crescentes");
});

test("mapinha: as bolhas dos estados ficam no contorno e não se encostam", () => {
  const ufs = Object.entries(CENTRO_UF);
  assert.equal(ufs.length, new Set(LISTA.map((i) => i.uf)).size);
  for (const [uf, [x, y]] of ufs) assert.ok(x > 20 && x < 390 && y > 20 && y < 390, `${uf} dentro do mapa`);
  let menor = Infinity;
  for (let a = 0; a < ufs.length; a++)
    for (let b = a + 1; b < ufs.length; b++) menor = Math.min(menor, Math.hypot(ufs[a][1][0] - ufs[b][1][0], ufs[a][1][1] - ufs[b][1][1]));
  // a maior bolha (SP, 39 imóveis) tem 25 unidades de diâmetro; duas médias vizinhas somam menos de 24
  assert.ok(menor >= 24, `menor distância entre estados: ${menor.toFixed(1)}`);
});
