import { test } from "node:test";
import assert from "node:assert/strict";
import type { LinkImovel, ReferenciaM2 } from "../../../lib/catalogo/tipos";
import {
  alvoDaReferencia,
  AVISO_RECORTE,
  compararComMedia,
  contagemTipo,
  criteriosBusca,
  ESCOPOS,
  faltaAmostra,
  motivoSemLocal,
  ROTULO_ESCOPO,
  deEstado,
  diferencaCurta,
  formaDeNome,
  linhasLeiloes,
  lugarDoRecorte,
  periodoCurto,
  predicadoComparacao,
  referenciaPrincipal,
  referenciaLeiloes,
  descricaoReferencia,
  referenciasItbi,
  registroNaTela,
  textoOficio,
  escalaM2,
  escalaRegiao,
  faltaParaPraca,
  mediaDe,
  fraseDesagio,
  frasePercentil,
  idNaFonte,
  legendaPosicao,
  linkPontoOsm,
  pontoDaSecao,
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

test("recorte com a preposição certa", () => {
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
  // o ponto exato do CNEFE não é "informado pela fonte"
  assert.equal(legendaPosicao("exata"), "Posição informada pela fonte");
  assert.equal(legendaPosicao("exata", true), "Endereço localizado no número");
  assert.match(textoPosicao({ precisaoGeo: "exata", cidade: "São Gonçalo", uf: "RJ", bairro: "Tribobó" }, true), /CNEFE 2022/);
});

test("ponto da seção: o mais preciso, e de onde veio o exato", () => {
  const caixa = { fonte: { id: "caixa_csv", nome: "Caixa" } };
  const lj = { fonte: { id: "leiloesjudiciais_api", nome: "Leilões Judiciais" } };
  // a Caixa com o ponto do número (instantâneo já com o geocode): exato do CNEFE
  assert.deepEqual(pontoDaSecao({ ...caixa, lat: -22.86, lon: -43.03, precisaoGeo: "exata" }, { lat: -22.86, lon: -43.03, precisao: "numero" }), {
    lat: -22.86,
    lon: -43.03,
    precisao: "exata",
    cnefe: true,
  });
  // o resumo ainda na sede e a nota com o ponto da rua: vale o da nota
  assert.deepEqual(pontoDaSecao({ ...caixa, lat: -22.8, lon: -43.0, precisaoGeo: "cidade" }, { lat: -22.86, lon: -43.03, precisao: "rua" }), {
    lat: -22.86,
    lon: -43.03,
    precisao: "rua",
    cnefe: false,
  });
  // a Leilões Judiciais com o ponto da própria fonte: continua "informada pela fonte"
  assert.equal(pontoDaSecao({ ...lj, lat: -23.6, lon: -46.7, precisaoGeo: "exata" }, null)!.cnefe, false);
  // Lente (sem nota): o ponto do resumo
  assert.deepEqual(pontoDaSecao({ ...caixa, lat: -22.86, lon: -43.03, precisaoGeo: "exata" }, null), { lat: -22.86, lon: -43.03, precisao: "exata", cnefe: true });
  assert.equal(pontoDaSecao({ ...caixa, lat: null, lon: null, precisaoGeo: null }, null), null);
  assert.equal(linkPontoOsm(-22.859741, -43.032906), "https://www.openstreetmap.org/?mlat=-22.85974&mlon=-43.03291#map=17/-22.85974/-43.03291");
  assert.match(linkPontoOsm(-22.8, -43, true), /#map=15\//);
});

test("concordância com o tipo: casas no feminino (\"das casas\", \"todas as\", \"nenhuma das\")", () => {
  const casa = (extra: Partial<ReferenciaM2> = {}) => ref({ tipo: "casa", ...extra });
  assert.match(frasePercentil(casa())!, /de 78% das casas em leilão/);
  assert.match(frasePercentil(casa({ amostra: 7, percentilLance: 100 }))!, /de todas as 7 casas em leilão/);
  assert.match(frasePercentil(casa({ amostra: 7, percentilLance: 0 }))!, /^Por m², nenhuma das 7 casas em leilão/);
  assert.match(frasePercentil(casa({ amostra: 476, percentilLance: 0 }))!, /praticamente nenhuma das casas/);
  assert.match(frasePercentil(casa({ amostra: 476, percentilLance: 100 }))!, /praticamente todas as casas/);
  // os outros tipos seguem no masculino
  assert.match(frasePercentil(ref({ tipo: "terreno", amostra: 7, percentilLance: 100 }))!, /todos os 7 terrenos/);
  assert.match(frasePercentil(ref({ tipo: "comercial" }))!, / dos imóveis comerciais /);
});

test("comparação com a média: % arredondado, 5 níveis sem contradizer o número", () => {
  assert.deepEqual(compararComMedia(2682, 3024), { pct: -11, razao: 2682 / 3024, nivel: 1 });
  assert.equal(compararComMedia(69, 100)!.nivel, 0); // −31%: muito abaixo
  assert.equal(compararComMedia(70, 100)!.nivel, 0); // −30%: muito abaixo
  assert.equal(compararComMedia(71, 100)!.nivel, 1); // −29%: abaixo
  assert.equal(compararComMedia(90, 100)!.nivel, 1); // −10%: abaixo
  assert.equal(compararComMedia(90.6, 100)!.nivel, 2); // −9,4% → −9%: na média
  assert.equal(compararComMedia(109.4, 100)!.nivel, 2);
  assert.equal(compararComMedia(110, 100)!.nivel, 3);
  assert.equal(compararComMedia(130, 100)!.nivel, 4);
  assert.equal(compararComMedia(null, 100), null);
  assert.equal(compararComMedia(100, null), null);
  assert.equal(compararComMedia(100, 0), null);
});

test("frase da comparação: abaixo, acima, igual e \"vezes\" a partir do dobro", () => {
  const bairro = alvoDaReferencia({ escopo: "bairro", fonte: "leiloes" });
  assert.equal(predicadoComparacao(compararComMedia(69, 100)!, bairro), "está 31% abaixo da média do bairro");
  assert.equal(predicadoComparacao(compararComMedia(112, 100)!, alvoDaReferencia({ escopo: "cidade" })), "está 12% acima da média da cidade");
  assert.equal(predicadoComparacao(compararComMedia(100.4, 100)!, bairro), "está praticamente igual à média do bairro");
  assert.equal(predicadoComparacao(compararComMedia(240, 100)!, alvoDaReferencia({ escopo: "uf" })), "é 2,4 vezes a média do estado");
  // o nome do número do ITBI depende da cidade (R4-VAZ-04): declarado (SP, Rio), base de cálculo (POA, Fortaleza),
  // avaliação da prefeitura (Recife); sem a informação, "valor médio registrado"
  const itbi = alvoDaReferencia({ escopo: "rua", fonte: "itbi", valorItbi: "declarado" });
  assert.equal(predicadoComparacao(compararComMedia(80, 100)!, itbi), "está 20% abaixo do preço médio declarado na rua");
  assert.equal(predicadoComparacao(compararComMedia(100, 100)!, itbi), "está praticamente igual ao preço médio declarado na rua");
  const base = alvoDaReferencia({ escopo: "bairro", fonte: "itbi", valorItbi: "base_calculo" });
  assert.equal(predicadoComparacao(compararComMedia(80, 100)!, base), "está 20% abaixo da base de cálculo média do ITBI no bairro");
  assert.equal(predicadoComparacao(compararComMedia(100, 100)!, base), "está praticamente igual à base de cálculo média do ITBI no bairro");
  const recife = alvoDaReferencia({ escopo: "cidade", fonte: "itbi", valorItbi: "avaliacao_prefeitura" });
  assert.equal(predicadoComparacao(compararComMedia(120, 100)!, recife), "está 20% acima da avaliação média da prefeitura para o ITBI na cidade");
  assert.equal(alvoDaReferencia({ escopo: "rua", fonte: "itbi" }).nome, "valor médio registrado no ITBI na rua");
  assert.equal(diferencaCurta(compararComMedia(69, 100)!), "31% abaixo");
  assert.equal(diferencaCurta(compararComMedia(101, 100)!), "igual");
  assert.equal(diferencaCurta(compararComMedia(1300, 100)!), "13 vezes");
});

test("referência da frase: o preço pago (ITBI) com compras suficientes; senão leilões mais local com n ≥ 5", () => {
  const rua = ref({ escopo: "rua", fonte: "leiloes", amostra: 3, media: 4100, nome: "Rua X, Uberlândia/MG" });
  const bairro = ref({ escopo: "bairro", fonte: "leiloes", amostra: 14, media: 4000 });
  const cidade = ref({ escopo: "cidade", fonte: "leiloes", amostra: 400, media: 3900, nome: "Uberlândia/MG" });
  const itbi = (escopo: "rua" | "bairro" | "cidade", amostra: number, media = 5200) =>
    ref({ escopo, fonte: "itbi", amostra, media, avaliacaoM2: { mediana: media, p25: media * 0.8, p75: media * 1.2 }, lanceM2: null });
  const itbiBairro = itbi("bairro", 300);
  // o ITBI do bairro (300 compras) vence a média de avaliação dos leilões
  assert.equal(referenciaPrincipal([rua, bairro, cidade, itbiBairro]), itbiBairro);
  // ITBI com poucas compras (rua 9, bairro 6, cidade 25) não vale: fica a média dos leilões
  assert.equal(referenciaPrincipal([rua, bairro, cidade, itbi("rua", 9), itbi("bairro", 6), itbi("cidade", 25)]), bairro);
  // o recorte mais local do ITBI com amostra suficiente (rua 12 > bairro)
  const itbiRua = itbi("rua", 12, 6000);
  assert.equal(referenciaPrincipal([itbiBairro, cidade, itbiRua]), itbiRua);
  assert.equal(referenciaPrincipal([itbi("cidade", 20_333), bairro])?.escopo, "cidade");
  // só leilões: o mais local com 5 ou mais
  assert.equal(referenciaPrincipal([rua, bairro, cidade]), bairro);
  assert.equal(referenciaLeiloes([rua, bairro, cidade, itbiBairro]), bairro);
  assert.equal(referenciaPrincipal([rua]), rua);
  // sem média de leilões: o ITBI mesmo com poucas compras
  assert.equal(referenciaPrincipal([{ ...bairro, media: null }, itbi("bairro", 4)])?.amostra, 4);
  assert.equal(referenciaPrincipal([]), null);
  // dados de antes do campo "media": a mediana da avaliação no lugar
  assert.equal(mediaDe(ref({})), 4000);
  assert.equal(mediaDe(ref({ media: null })), null);
  assert.equal(referenciaPrincipal([ref({ amostra: 14 })])?.escopo, "bairro");
  assert.deepEqual(referenciasItbi([cidade, itbiBairro, rua]), [itbiBairro]);
  // a descrição diz de onde vem o número
  assert.equal(descricaoReferencia(itbi("bairro", 10)), `valor médio registrado em 10 compras registradas na prefeitura (ITBI) no bairro ${itbi("bairro", 10).nome}`);
  assert.equal(
    descricaoReferencia({ ...itbi("bairro", 10), valorItbi: "base_calculo" }),
    `base de cálculo média em 10 compras registradas na prefeitura (ITBI) no bairro ${itbi("bairro", 10).nome}`,
  );
  assert.match(descricaoReferencia(bairro), /^avaliação média de 14 .* em leilão no bairro /);
});

test("tabela de leilões: rua, bairro, cidade e estado; recorte repetido vira \"os mesmos de\"", () => {
  const bairro = ref({ escopo: "bairro", fonte: "leiloes", amostra: 14, media: 4000 });
  const uf = ref({ escopo: "uf", fonte: "leiloes", amostra: 900, media: 3000, nome: "MG" });
  const linhas = linhasLeiloes([bairro, uf]);
  assert.deepEqual(
    linhas.map((l) => [l.escopo, l.ref?.amostra ?? null, l.igualA]),
    [
      ["rua", null, null],
      ["perto", null, null],
      ["bairro", 14, null],
      // a cidade contém o bairro, que tem amostra suficiente: é a mesma amostra (o servidor não repete)
      ["cidade", null, "bairro"],
      ["uf", 900, null],
    ],
  );
  // a rua pode atravessar bairros (e o raio também): bairro ausente depois da rua não é "o mesmo"
  const rua = ref({ escopo: "rua", fonte: "leiloes", amostra: 8, media: 4100, nome: "Rua X, Uberlândia/MG" });
  assert.deepEqual(
    linhasLeiloes([rua]).map((l) => l.igualA),
    [null, null, null, "rua", "rua"],
  );
  // rua com poucos: a cidade ausente é falta de dados
  assert.deepEqual(
    linhasLeiloes([{ ...rua, amostra: 3 }]).map((l) => l.igualA),
    [null, null, null, null, "rua"],
  );
  // com as contagens (rodada 6), a regra é exata: amostra suficiente e sem referência = os mesmos do recorte anterior
  const comContagem = linhasLeiloes([rua], { rua: 8, perto: 8, bairro: 2, cidade: 8, uf: 8 });
  assert.deepEqual(
    comContagem.map((l) => [l.escopo, l.igualA, l.amostra]),
    [
      ["rua", null, 8],
      ["perto", "rua", 8],
      ["bairro", null, 2],
      ["cidade", "rua", 8],
      ["uf", "rua", 8],
    ],
  );
  assert.equal(linhasLeiloes([rua], {})[1]!.amostra, null, "posição aproximada: sem a contagem do raio");
  assert.equal(lugarDoRecorte({ escopo: "rua", nome: "Rua X, Uberlândia/MG" }), "Rua X");
  assert.equal(lugarDoRecorte({ escopo: "bairro", nome: "Centro, Uberlândia/MG" }), "Centro");
  assert.equal(lugarDoRecorte({ escopo: "uf", nome: "MG" }), "Minas Gerais");
  assert.equal(ondeRecorte({ escopo: "rua", nome: "Rua X, Uberlândia/MG" }), "na Rua X, Uberlândia/MG");
  assert.equal(ondeRecorte({ escopo: "rua", nome: "Largo do Machado, Rio de Janeiro/RJ" }), "no Largo do Machado, Rio de Janeiro/RJ");
  assert.equal(periodoCurto(["2025-09-01", "2026-09-30"]), "set/2025 a set/2026");
  assert.equal(periodoCurto(null), null);
});

test("raio de 1 km (rodada 6): textos do recorte, contagens e o aviso de rua e bairro", () => {
  const perto = { escopo: "perto" as const, nome: "Até 1 km, Uberlândia/MG" };
  assert.equal(ondeRecorte(perto), "num raio de 1 km");
  assert.equal(lugarDoRecorte(perto), "deste imóvel", "curto: no celular, \"em volta deste imóvel\" saía cortado");
  assert.equal(ROTULO_ESCOPO.perto, "Até 1 km");
  assert.deepEqual(ESCOPOS, ["rua", "perto", "bairro", "cidade", "uf"]);
  assert.equal(predicadoComparacao(compararComMedia(90, 100)!, alvoDaReferencia({ escopo: "perto", fonte: "leiloes" })), "está 10% abaixo da média num raio de 1 km");
  assert.match(descricaoReferencia({ ...perto, fonte: "leiloes", amostra: 12, tipo: "casa" }), /^avaliação média de 12 casas em leilão num raio de 1 km$/);
  assert.equal(
    frasePercentil(ref({ ...perto, amostra: 12, percentilLance: 50 })),
    "Por m², o lance deste imóvel é menor que o de 50% dos apartamentos em leilão num raio de 1 km.",
  );

  // contagens: "12 casas", "1 apartamento"; o que falta: "nenhuma outra casa", "só 2 casas (mínimo 5)"
  assert.equal(contagemTipo(12, "casa"), "12 casas");
  assert.equal(contagemTipo(1, "apartamento"), "1 apartamento");
  assert.equal(contagemTipo(1, "comercial"), "1 imóvel comercial");
  assert.equal(faltaAmostra(0, 5, "casa"), "nenhuma outra casa");
  assert.equal(faltaAmostra(0, 5, "apartamento"), "nenhum outro apartamento");
  assert.equal(faltaAmostra(2, 5, "casa"), "só 2 casas (mínimo\u00a05)", "espaço que não quebra antes do número");
  assert.equal(faltaAmostra(1, 3, "terreno"), "só 1 terreno (mínimo\u00a03)");
  assert.equal(faltaAmostra(null, 5, "casa"), "sem dados suficientes", "resposta antiga, sem as contagens");

  // o aviso: o texto do dono e o motivo quando a melhor referência é a cidade ou o estado
  assert.equal(AVISO_RECORTE.titulo, "O ideal é comparar com a mesma rua ou o mesmo bairro.");
  assert.equal(AVISO_RECORTE.fraco, "Só cidade ou estado é uma comparação fraca: use com cuidado.");
  const casa = { tipo: "casa" as const, bairro: "Tribobo" };
  assert.equal(motivoSemLocal(casa, { bairro: 2, perto: 0 }), "Na base há só 2 casas em leilão no bairro Tribobo e nenhuma a até 1 km; o mínimo é 5.");
  assert.equal(motivoSemLocal(casa, { bairro: 1, perto: 3 }), "Na base há só 1 casa em leilão no bairro Tribobo e 3 a até 1 km; o mínimo é 5.");
  assert.equal(motivoSemLocal(casa, { bairro: 0, perto: 0 }), "Na base não há outras casas em leilão no bairro Tribobo nem a até 1 km; o mínimo é 5.");
  assert.equal(motivoSemLocal({ tipo: "apartamento", bairro: "Centro" }, { bairro: 0, perto: 2 }), "Na base não há outros apartamentos em leilão no bairro Centro, e só 2 a até 1 km; o mínimo é 5.");
  assert.equal(motivoSemLocal({ tipo: "apartamento", bairro: "Centro" }, { bairro: 3 }), "Na base há só 3 apartamentos em leilão no bairro Centro; o mínimo é 5.", "posição aproximada: sem o raio");
  assert.equal(motivoSemLocal({ tipo: "casa", bairro: null }, { cidade: 2 }), "A fonte não informa o bairro deste imóvel.");
  assert.equal(motivoSemLocal(casa, undefined), null);

  // revisão da rodada 6: a rua com média na tabela (3 ou 4), mas pouca para a frase (5), entra no motivo
  const apto = { tipo: "apartamento" as const, bairro: "Tiradentes" };
  assert.equal(
    motivoSemLocal(apto, { rua: 4, perto: 2, bairro: 4, cidade: 52, uf: 55 }),
    "Na base há só 4 apartamentos em leilão na mesma rua, 4 no bairro Tiradentes e 2 a até 1 km; o mínimo é 5.",
  );
  assert.equal(
    motivoSemLocal(apto, { rua: 3, perto: 0, bairro: 0 }),
    "Na base há só 3 apartamentos em leilão na mesma rua, nenhum no bairro Tiradentes e nenhum a até 1 km; o mínimo é 5.",
  );
  assert.equal(motivoSemLocal(apto, { rua: 2, bairro: 1 }), "Na base há só 1 apartamento em leilão no bairro Tiradentes; o mínimo é 5.", "rua com 1 ou 2: só na tabela");
  // sem bairro, mas com o raio
  assert.equal(
    motivoSemLocal({ tipo: "casa", bairro: null }, { perto: 2, cidade: 9 }),
    "A fonte não informa o bairro deste imóvel. Na base há só 2 casas em leilão a até 1 km; o mínimo é 5.",
  );
  assert.equal(motivoSemLocal({ tipo: "casa", bairro: null }, { perto: 0, cidade: 9 }), "A fonte não informa o bairro deste imóvel. Na base não há outras casas em leilão a até 1 km; o mínimo é 5.");
  // ITBI da rua ou do bairro com poucas compras (mínimo 10): na tabela, mas não na frase
  const itbi = (escopo: "rua" | "bairro" | "cidade", amostra: number) => ref({ escopo, fonte: "itbi", amostra, media: 6000, nome: "x" });
  const comercial = { tipo: "comercial" as const, bairro: "Praca da Bandeira" };
  assert.equal(
    motivoSemLocal(comercial, { rua: 0, perto: 0, bairro: 0, cidade: 19, uf: 47 }, [itbi("bairro", 8), itbi("cidade", 4005)]),
    "Na base não há outros imóveis comerciais em leilão no bairro Praca da Bandeira nem a até 1 km; o mínimo é 5. Na prefeitura (ITBI), só 8 compras registradas no bairro; o mínimo é 10.",
  );
  assert.match(motivoSemLocal(casa, { bairro: 0 }, [itbi("rua", 1), itbi("bairro", 7)])!, /Na prefeitura \(ITBI\), só 1 compra registrada na rua e 7 no bairro; o mínimo é 10\.$/);
  assert.doesNotMatch(motivoSemLocal(casa, { bairro: 0 }, [itbi("bairro", 12)])!, /prefeitura/, "com 10 ou mais, o ITBI do bairro valeria para a frase");
});

test("buscas nos portais: o resumo dos critérios (tipo, quartos, área e faixa de preço ± 20%)", () => {
  assert.deepEqual(criteriosBusca({ tipo: "apartamento", quartos: 2, area: 62, avaliacao: 200_000 }), ["Apartamento", "2 quartos", "50 a 75 m²", "R$ 160 mil a R$ 240 mil"]);
  assert.deepEqual(criteriosBusca({ tipo: "casa", quartos: 1, area: 24, avaliacao: null }), ["Casa", "1 quarto", "19 a 29 m²"]);
  assert.deepEqual(criteriosBusca({ tipo: "terreno", quartos: 3, area: 1200, avaliacao: 1_000_000 }), ["Terreno", "960 a 1.440 m²", "R$ 800 mil a R$ 1,2 mi"], "terreno sem quartos");
  assert.deepEqual(criteriosBusca({ tipo: "rural", quartos: null, area: 500_000, avaliacao: null }), ["Rural"], "gleba (10 ha ou mais): sem a faixa de área");
  assert.deepEqual(criteriosBusca({ tipo: "outro", quartos: null, area: null, avaliacao: null }), ["Imóvel"]);
});

test("registro na tela: ficha da Caixa lida, pendente, Leilões Judiciais e PDFs de matrícula", () => {
  const vazio = { matriculas: [], cartorio: null, comarca: null, oficio: null, inscricaoImobiliaria: null, averbacaoLeiloesNegativos: null, paginaFonte: null, lidoEm: null };
  const lido = registroNaTela({
    registro: { ...vazio, situacao: "lido", matriculas: ["868"], comarca: "SÃO GONÇALO-RJ", oficio: "06", inscricaoImobiliaria: "50334", averbacaoLeiloesNegativos: "AVERBADO", lidoEm: "2026-10-16" },
    matricula: null,
    cartorio: null,
    links: [{ tipo: "matricula", rotulo: "Matrícula do imóvel", url: "https://x/m.pdf" }],
  });
  assert.deepEqual(lido.matriculas, ["868"]);
  assert.equal(lido.cartorio, "Comarca de São Gonçalo/RJ · 6º Ofício");
  assert.equal(lido.inscricao, "50334");
  assert.equal(lido.averbacao, "Averbado");
  assert.equal(lido.pdfs.length, 1);
  const pendente = registroNaTela({ registro: { ...vazio, situacao: "pendente", paginaFonte: "https://caixa/ficha" }, matricula: null, cartorio: null, links: [] });
  assert.equal(pendente.situacao, "pendente");
  assert.equal(pendente.paginaFonte, "https://caixa/ficha");
  assert.equal(pendente.cartorio, null);
  // Leilões Judiciais: números do campo e dos rótulos dos PDFs, sem repetir; o cartório como a fonte escreve
  const lj = registroNaTela({
    registro: { ...vazio, situacao: "na_fonte", matriculas: ["13.941"], cartorio: "2º CRI" },
    matricula: "13.941",
    cartorio: "2º CRI",
    links: [
      { tipo: "matricula", rotulo: "Matrícula 13.941", url: "https://a" },
      { tipo: "matricula", rotulo: "Matrícula 13.942", url: "https://b" },
    ],
  });
  assert.deepEqual(lj.matriculas, ["13.941", "13.942"]);
  assert.equal(lj.cartorio, "2º CRI");
  // exemplo: o cartório já diz a cidade, a comarca não se repete
  const ex = registroNaTela({
    registro: { ...vazio, situacao: "na_fonte", matriculas: ["00.000 (fictícia)"], cartorio: "1º Ofício de Registro de Imóveis de Campinas/SP (exemplo)", comarca: "Campinas/SP", oficio: "1" },
    matricula: null,
    cartorio: null,
    links: [],
  });
  assert.equal(ex.cartorio, "1º Ofício de Registro de Imóveis de Campinas/SP (exemplo)");
  // o cartório da fonte sem o número do ofício: o ofício da ficha não se perde
  const semOficio = registroNaTela({ registro: { ...vazio, situacao: "lido", cartorio: "CRI de Niterói", oficio: "06" }, matricula: null, cartorio: null, links: [] });
  assert.equal(semOficio.cartorio, "CRI de Niterói · 6º Ofício");
  const comNumero = registroNaTela({ registro: { ...vazio, situacao: "na_fonte", cartorio: "2º CRI", oficio: "2" }, matricula: null, cartorio: null, links: [] });
  assert.equal(comNumero.cartorio, "2º CRI");
});

test("nomes em maiúsculas da ficha viram nomes; ofício por extenso", () => {
  assert.equal(formaDeNome("SÃO GONÇALO-RJ"), "São Gonçalo-RJ");
  assert.equal(formaDeNome("RIO DE JANEIRO/RJ"), "Rio de Janeiro/RJ");
  assert.equal(formaDeNome("AVERBADO"), "Averbado");
  assert.equal(formaDeNome("Não averbado"), "Não averbado");
  assert.equal(textoOficio("06"), "6º Ofício");
  assert.equal(textoOficio("2º"), "2º Ofício");
  assert.equal(textoOficio("2º OFÍCIO"), "2º Ofício");
});
