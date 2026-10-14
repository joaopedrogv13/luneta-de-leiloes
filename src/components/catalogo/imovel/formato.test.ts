import { test } from "node:test";
import assert from "node:assert/strict";
import type { LinkImovel, ReferenciaM2 } from "../../../lib/catalogo/tipos";
import {
  deEstado,
  escalaM2,
  escalaRegiao,
  faltaParaPraca,
  fraseComparacao,
  fraseDesagio,
  frasePercentil,
  idNaFonte,
  lanceForaDaRegiao,
  legendaPosicao,
  localRepetido,
  numeroDaPraca,
  ondeRecorte,
  ordenarLinks,
  posicaoNaEscala,
  precoPorArea,
  rotuloNumeroPraca,
  textoPosicao,
} from "./formato";

// 14/10/2026 às 12:00 em Brasília
const AGORA = Date.parse("2026-10-14T15:00:00Z");

const ref = (r: Partial<ReferenciaM2>): ReferenciaM2 => ({
  escopo: "bairro",
  nome: "Centro, Uberlândia/MG",
  tipo: "apartamento",
  amostra: 14,
  avaliacaoM2: { mediana: 4000, p25: 3500, p75: 4600 },
  lanceM2: { mediana: 2800, p25: 2400, p75: 3300 },
  imovel: { avaliacaoM2: 3860, lanceM2: 3080 },
  percentilLance: 78,
  ...r,
});

test("id na fonte: Caixa e Leilões Judiciais; exemplo fictício não tem", () => {
  assert.equal(idNaFonte("caixa-8444402395965"), "8444402395965");
  assert.equal(idNaFonte("lj-222141"), "222141");
  assert.equal(idNaFonte("ex-alvo-sp"), null);
});

test("praça atual e rótulos das praças", () => {
  assert.equal(numeroDaPraca("1"), 1);
  assert.equal(numeroDaPraca("2"), 2);
  assert.equal(numeroDaPraca("unica"), 0);
  assert.equal(numeroDaPraca(null), null);
  assert.equal(rotuloNumeroPraca(0), "Praça única");
  assert.equal(rotuloNumeroPraca(2), "2ª praça");
});

test("deságio em frase, nos três sentidos", () => {
  assert.equal(fraseDesagio(40), "40% abaixo da avaliação");
  assert.equal(fraseDesagio(-12), "lance 12% acima da avaliação");
  assert.equal(fraseDesagio(0), "lance igual à avaliação");
  assert.equal(fraseDesagio(null), null);
});

test("quanto falta para a praça, no calendário de Brasília", () => {
  assert.deepEqual(faltaParaPraca("2026-10-19T19:00:00.000Z", AGORA), { texto: "em 5 dias", passou: false });
  assert.deepEqual(faltaParaPraca("2026-10-15T02:30:00.000Z", AGORA), { texto: "hoje", passou: false }); // 23:30 de Brasília
  assert.deepEqual(faltaParaPraca("2026-10-15T13:00:00.000Z", AGORA), { texto: "amanhã", passou: false });
  assert.deepEqual(faltaParaPraca("2026-10-14T13:00:00.000Z", AGORA), { texto: "já passou", passou: true });
  assert.deepEqual(faltaParaPraca("2026-10-14", AGORA), { texto: "hoje", passou: false }); // sem hora: vale o dia inteiro
  assert.equal(faltaParaPraca(null, AGORA), null);
});

test("preço por área: m² com centavos só abaixo de R$ 10; hectare a partir de 10 ha", () => {
  assert.equal(precoPorArea(3831, 240.8), "R$ 3.831/m²");
  assert.equal(precoPorArea(4.5, 50_000), "R$ 4,50/m²");
  assert.equal(precoPorArea(1.23, 250_000), "R$ 12.300/ha");
});

test("frase da região: menor, maior, igual; recorte com a preposição certa", () => {
  assert.equal(
    fraseComparacao(ref({ imovel: { avaliacaoM2: 3860, lanceM2: 3080 } })),
    "O lance por m² deste imóvel é 23% menor que a mediana de avaliação dos apartamentos em leilão no bairro Centro, Uberlândia/MG (n = 14).",
  );
  assert.match(fraseComparacao(ref({ imovel: { avaliacaoM2: null, lanceM2: 5000 } }))!, /25% maior que a mediana de avaliação/);
  assert.match(fraseComparacao(ref({ imovel: { avaliacaoM2: null, lanceM2: 4040 } }))!, /praticamente igual à mediana de avaliação/);
  assert.equal(fraseComparacao(ref({ imovel: { avaliacaoM2: null, lanceM2: null } })), null);
  // sem avaliação no recorte, compara com os lances
  assert.match(fraseComparacao(ref({ avaliacaoM2: null }))!, /mediana dos lances/);
  assert.equal(ondeRecorte({ escopo: "cidade", nome: "Uberlândia/MG" }), "na cidade de Uberlândia/MG");
  assert.equal(ondeRecorte({ escopo: "cidade", nome: "Rio de Janeiro/RJ" }), "na cidade do Rio de Janeiro/RJ");
  assert.equal(ondeRecorte({ escopo: "uf", nome: "PR" }), "no estado do Paraná");
  assert.equal(deEstado("BA"), "da Bahia");
  assert.equal(deEstado("SP"), "de São Paulo");
  assert.equal(
    frasePercentil(ref({ escopo: "uf", nome: "MG" })),
    "Por m², o lance deste imóvel é menor que o de 78% dos apartamentos em leilão no estado de Minas Gerais.",
  );
});

test("escala do gráfico: marcas redondas cobrindo todos os valores", () => {
  const e = escalaM2([2333, 3200, 3860, 4500])!;
  assert.ok(e.min <= 2333 && e.max >= 4500);
  assert.ok(e.marcas.length >= 3 && e.marcas.length <= 7);
  for (const m of e.marcas) assert.equal(m % 500, 0);
  assert.equal(escalaM2([]), null);
  const igual = escalaM2([1000, 1000])!;
  assert.ok(igual.min < 1000 && igual.max > 1000);
});

test("links em ordem de leitura: anúncio, edital, matrícula... mapa no fim", () => {
  const l = (tipo: LinkImovel["tipo"], rotulo: string = tipo): LinkImovel => ({ tipo, rotulo, url: `https://x.com/${rotulo}` });
  const ordem = ordenarLinks([l("mapa"), l("matricula", "m1"), l("anuncio"), l("matricula", "m2"), l("leiloeiro"), l("edital")]);
  assert.deepEqual(
    ordem.map((x) => x.rotulo),
    ["anuncio", "edital", "m1", "m2", "leiloeiro", "mapa"],
  );
});

test("a linha de local não repete a cidade que já está no endereço", () => {
  const sc = { bairro: null, cidade: "São Caetano do Sul", uf: "SP" };
  assert.equal(localRepetido({ ...sc, endereco: "Rua José Benedetti, nº 18, São Caetano do Sul/SP" }), true);
  assert.equal(localRepetido({ ...sc, endereco: "Rua José Benedetti, nº 18" }), false);
  assert.equal(localRepetido({ ...sc, bairro: "Centro", endereco: "Rua X, São Caetano do Sul/SP" }), false);
  assert.equal(localRepetido({ ...sc, endereco: null }), false);
});

test("texto da posição conforme a precisão", () => {
  assert.equal(textoPosicao({ precisaoGeo: "cidade", cidade: "Uberlândia", uf: "MG", bairro: "Centro" }), "Posição aproximada: centro de Uberlândia/MG");
  assert.equal(textoPosicao({ precisaoGeo: "rua", cidade: "São Caetano do Sul", uf: "SP", bairro: null }), "Posição aproximada: pela rua do endereço publicado");
});

test("percentil nas pontas: frase que se lê (e exata só quando o arredondamento permite)", () => {
  assert.equal(
    frasePercentil(ref({ amostra: 7, percentilLance: 100 })),
    "Por m², o lance deste imóvel é menor que o de todos os 7 apartamentos em leilão no bairro Centro, Uberlândia/MG.",
  );
  assert.equal(
    frasePercentil(ref({ amostra: 7, percentilLance: 0 })),
    "Por m², nenhum dos 7 apartamentos em leilão no bairro Centro, Uberlândia/MG tem lance maior que o deste imóvel.",
  );
  // 476 imóveis: 0% pode ser 0,4% arredondado
  assert.match(frasePercentil(ref({ amostra: 476, percentilLance: 0 }))!, /^Por m², praticamente nenhum dos apartamentos/);
  assert.match(frasePercentil(ref({ amostra: 476, percentilLance: 100 }))!, /praticamente todos os apartamentos/);
  assert.equal(frasePercentil(ref({ percentilLance: null })), null);
});

test("lance muito fora da região (erro provável na fonte)", () => {
  assert.equal(lanceForaDaRegiao(ref({})), false);
  assert.equal(lanceForaDaRegiao(ref({ imovel: { avaliacaoM2: 3060, lanceM2: 531_197 } })), true);
  assert.equal(lanceForaDaRegiao(ref({ imovel: { avaliacaoM2: null, lanceM2: 900 } })), true);
  assert.equal(lanceForaDaRegiao(ref({ imovel: { avaliacaoM2: null, lanceM2: null } })), false);
});

test("escala da região: um valor absurdo do imóvel não esmaga as faixas", () => {
  const faixas = [3356, 4703, 3975];
  const e = escalaRegiao(faixas, [531_197, 3060])!;
  assert.ok(e.max < 10_000, `max ${e.max}`);
  assert.ok(e.min <= 3060);
  assert.deepEqual(posicaoNaEscala(531_197, e.min, e.max), { pct: 100, fora: 1 });
  assert.equal(posicaoNaEscala(3975, e.min, e.max).fora, 0);
  // valores normais entram na escala
  const n = escalaRegiao(faixas, [2333, 3860])!;
  assert.ok(n.min <= 2333 && n.max >= 4703);
});

test("legenda do mapa mini conforme a precisão", () => {
  assert.equal(legendaPosicao("cidade"), "Posição aproximada (centro da cidade)");
  assert.equal(legendaPosicao(null), "Posição aproximada (centro da cidade)");
  assert.equal(legendaPosicao("rua"), "Posição aproximada (pela rua)");
});

test("concordância com o tipo: casas no feminino (\"das casas\", \"todas as\", \"nenhuma das\")", () => {
  const casa = (extra: Partial<ReferenciaM2> = {}) => ref({ tipo: "casa", ...extra });
  assert.match(fraseComparacao(casa())!, / das casas em leilão /);
  assert.doesNotMatch(fraseComparacao(casa())!, /dos casas/);
  assert.match(frasePercentil(casa())!, /de 78% das casas em leilão/);
  assert.match(frasePercentil(casa({ amostra: 7, percentilLance: 100 }))!, /de todas as 7 casas em leilão/);
  assert.match(frasePercentil(casa({ amostra: 7, percentilLance: 0 }))!, /^Por m², nenhuma das 7 casas em leilão/);
  assert.match(frasePercentil(casa({ amostra: 476, percentilLance: 0 }))!, /praticamente nenhuma das casas/);
  assert.match(frasePercentil(casa({ amostra: 476, percentilLance: 100 }))!, /praticamente todas as casas/);
  // os outros tipos seguem no masculino
  assert.match(frasePercentil(ref({ tipo: "terreno", amostra: 7, percentilLance: 100 }))!, /todos os 7 terrenos/);
  assert.match(fraseComparacao(ref({ tipo: "comercial" }))!, / dos imóveis comerciais /);
});
