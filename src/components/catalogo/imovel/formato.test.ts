import { test } from "node:test";
import assert from "node:assert/strict";
import type { LinkImovel, ReferenciaM2 } from "../../../lib/catalogo/tipos";
import {
  alvoDaReferencia,
  compararComMedia,
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
  const itbi = alvoDaReferencia({ escopo: "rua", fonte: "itbi" });
  assert.equal(predicadoComparacao(compararComMedia(80, 100)!, itbi), "está 20% abaixo do preço médio pago na rua");
  assert.equal(predicadoComparacao(compararComMedia(100, 100)!, itbi), "está praticamente igual ao preço médio pago na rua");
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
  assert.equal(descricaoReferencia(itbi("bairro", 10)), `preço médio pago em 10 compras registradas na prefeitura (ITBI) no bairro ${itbi("bairro", 10).nome}`);
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
      ["bairro", 14, null],
      // a cidade contém o bairro, que tem amostra suficiente: é a mesma amostra (o servidor não repete)
      ["cidade", null, "bairro"],
      ["uf", 900, null],
    ],
  );
  // a rua pode atravessar bairros: bairro ausente depois da rua não é "o mesmo"
  const rua = ref({ escopo: "rua", fonte: "leiloes", amostra: 8, media: 4100, nome: "Rua X, Uberlândia/MG" });
  assert.deepEqual(
    linhasLeiloes([rua]).map((l) => l.igualA),
    [null, null, "rua", "rua"],
  );
  // rua com poucos: a cidade ausente é falta de dados
  assert.deepEqual(
    linhasLeiloes([{ ...rua, amostra: 3 }]).map((l) => l.igualA),
    [null, null, null, "rua"],
  );
  assert.equal(lugarDoRecorte({ escopo: "rua", nome: "Rua X, Uberlândia/MG" }), "Rua X");
  assert.equal(lugarDoRecorte({ escopo: "bairro", nome: "Centro, Uberlândia/MG" }), "Centro");
  assert.equal(lugarDoRecorte({ escopo: "uf", nome: "MG" }), "Minas Gerais");
  assert.equal(ondeRecorte({ escopo: "rua", nome: "Rua X, Uberlândia/MG" }), "na Rua X, Uberlândia/MG");
  assert.equal(ondeRecorte({ escopo: "rua", nome: "Largo do Machado, Rio de Janeiro/RJ" }), "no Largo do Machado, Rio de Janeiro/RJ");
  assert.equal(periodoCurto(["2025-09-01", "2026-09-30"]), "set/2025 a set/2026");
  assert.equal(periodoCurto(null), null);
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
