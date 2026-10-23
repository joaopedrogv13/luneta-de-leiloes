import { test } from "node:test";
import assert from "node:assert/strict";
import { buscar, criarIndice, diaBrasilia, limitesLog, paraPlano, POR_PAGINA_MAXIMO } from "./consulta";
import type { Busca, Filtros, ImovelResumo, Ordem, TagResumo } from "./tipos";

const AGORA = new Date("2026-10-14T15:00:00Z");

const tag = (slug: string, severidade: TagResumo["severidade"], emRevisao = false): TagResumo => ({ slug, rotulo: slug, severidade, emRevisao });

/** Imóvel mínimo; o resto vem de `s`. */
function imovel(id: string, s: Partial<ImovelResumo> = {}): ImovelResumo {
  const base: ImovelResumo = {
    id,
    titulo: "Apartamento 2 quartos",
    tipo: "apartamento",
    uf: "MG",
    cidade: "Uberlândia",
    bairro: "Centro",
    lat: -18.91,
    lon: -48.27,
    precisaoGeo: "cidade",
    area: 60,
    areaTerreno: null,
    quartos: 2,
    vagas: 1,
    avaliacao: 200000,
    lance: 120000,
    desagio: 40,
    lanceM2: 2000,
    avaliacaoM2: 3333,
    modalidade: "venda_direta",
    modalidadeFonte: "Venda Direta Online",
    praca: "unica",
    dataPraca: null,
    financiamento: true,
    fgts: null,
    parcelamento: null,
    ocupacao: null,
    judicial: false,
    fonte: { id: "caixa_csv", nome: "Caixa" },
    foto: `https://exemplo.test/${id}.jpg`,
    totalFotos: 1,
    selo: 0,
    seloPendente: false,
    tags: [],
    coletadoEm: "2026-10-12",
    notaLocal: null,
  };
  return { ...base, ...s };
}

const ITENS: ImovelResumo[] = [
  imovel("caixa-01", { tags: [tag("desagio-alto", "positivo"), tag("ocupacao-nao-informada", "info")], selo: 3 }),
  imovel("caixa-02", { bairro: "Santa Mônica", lance: 90000, desagio: 55, lanceM2: 1500, tags: [tag("ocupado", "grave"), tag("desagio-alto", "positivo")], selo: 1 }),
  imovel("caixa-03", { titulo: "Casa 3 quartos", tipo: "casa", cidade: "Uberaba", bairro: "Centro", lat: -19.74, lon: -47.93, quartos: 3, vagas: 2, area: 120, lance: 300000, avaliacao: 280000, desagio: -7, lanceM2: 2500, financiamento: false, tags: [tag("preco-acima-mercado", "grave", true)], selo: 2 }),
  imovel("caixa-04", { uf: "SP", cidade: "São Paulo", bairro: "Vila Mariana", lat: -23.53, lon: -46.63, lance: 400000, avaliacao: 500000, desagio: 20, lanceM2: 5000, area: 80, modalidade: "leilao", modalidadeFonte: "Leilão SFI - Edital Único", praca: null, financiamento: false, tags: [tag("direito-preferencia", "atencao"), tag("desagio-baixo", "atencao")] }),
  imovel("caixa-05", { uf: "SP", cidade: "Campinas", bairro: "Cambuí", lat: -22.9, lon: -47.06, titulo: "Terreno 300 m²", tipo: "terreno", area: 300, areaTerreno: 300, quartos: null, vagas: null, lance: 150000, avaliacao: null, desagio: null, lanceM2: 500, avaliacaoM2: null, foto: null, totalFotos: 0, coletadoEm: "2026-10-13" }),
  imovel("lj-10", { uf: "SP", cidade: "São Paulo", bairro: null, lat: -23.6, lon: -46.7, precisaoGeo: "rua", titulo: "Direitos - Apartamento 160 m² - Morumbi", area: 160, quartos: null, lance: 900000, avaliacao: 1800000, desagio: 50, lanceM2: 5625, modalidade: "leilao", modalidadeFonte: null, praca: "2", dataPraca: "2026-10-20T01:00:00.000Z", financiamento: null, parcelamento: true, judicial: true, ocupacao: "ocupado", fonte: { id: "leiloesjudiciais_api", nome: "Leilões Judiciais" }, tags: [tag("so-direitos", "grave"), tag("segunda-praca", "positivo")], coletadoEm: "2026-10-13" }),
  imovel("lj-11", { uf: "PA", cidade: "Belém", bairro: "Nazaré", lat: -1.45, lon: -48.5, titulo: "Casa para reforma", tipo: "casa", area: null, lanceM2: null, avaliacaoM2: null, quartos: 4, lance: 250000, avaliacao: 300000, desagio: 17, modalidade: "leilao", praca: "1", dataPraca: "2026-10-14T16:00:00.000Z", judicial: null, ocupacao: "desocupado", fonte: { id: "leiloesjudiciais_api", nome: "Leilões Judiciais" }, tags: [tag("desocupado", "positivo"), tag("primeira-praca", "info")] }),
  imovel("caixa-12", { uf: "RJ", cidade: "Rio de Janeiro", bairro: "Minas Gerais", lat: -22.91, lon: -43.2, titulo: "Apartamento 1 quarto", quartos: 1, lance: 180000, desagio: 10, lanceM2: 3000, dataPraca: "2026-10-13T20:00:00.000Z", praca: "unica", modalidade: "licitacao_aberta", fgts: true, tags: [tag("ocupado", "grave", true)] }),
];

const ENDERECOS = new Map([["caixa-01", "Rua das Acácias, 100"], ["caixa-04", "Rua Domingos de Morais, 2000"]]);
const IX = criarIndice(ITENS, { textoExtra: (i) => ENDERECOS.get(i.id) });

function busca(filtros: Filtros = {}, extra: Partial<Busca> = {}): Busca {
  return { conjunto: "previa", plano: "luneta", filtros, ordem: "desagio", pagina: 1, porPagina: 96, ...extra };
}
const ids = (f: Filtros, extra: Partial<Busca> = {}, opcoes = {}) => buscar(IX, busca(f, extra), { agora: AGORA, ...opcoes }).itens.map((i) => i.id).sort();
const faceta = (r: ReturnType<typeof buscar>, nome: "uf" | "cidade" | "bairro" | "tipo" | "modalidade" | "praca" | "ocupacao" | "natureza" | "fonte" | "tags" | "selo") =>
  Object.fromEntries(r.facetas[nome].map((o) => [o.valor, o.total]));

test("sem filtro: tudo, na ordem padrão (maior deságio, sem deságio no fim, desempate pelo id)", () => {
  const r = buscar(IX, busca(), { agora: AGORA });
  assert.equal(r.total, ITENS.length);
  assert.equal(r.totalConjunto, ITENS.length);
  assert.equal(r.selosDesligados, false);
  assert.deepEqual(r.itens.map((i) => i.id), ["caixa-02", "lj-10", "caixa-01", "caixa-04", "lj-11", "caixa-12", "caixa-03", "caixa-05"]);
});

test("texto: início de palavra em título, bairro, cidade, endereço e id; sem acento; nome e sigla de estado", () => {
  assert.deepEqual(ids({ q: "uberl" }), ["caixa-01", "caixa-02"]);
  assert.deepEqual(ids({ q: "santa monica" }), ["caixa-02"], "sem acento");
  assert.deepEqual(ids({ q: "acacias" }), ["caixa-01"], "endereço (índice do servidor)");
  assert.deepEqual(ids({ q: "lj-10" }), ["lj-10"], "id");
  assert.deepEqual(ids({ q: "berlandia" }), [], "meio de palavra não casa");
  assert.deepEqual(ids({ q: "terreno em campinas" }), ["caixa-05"], "palavra vazia ('em') não atrapalha");
  assert.deepEqual(ids({ q: "minas gerais" }), ["caixa-01", "caixa-02", "caixa-03", "caixa-12"], "estado pelo nome, ou o bairro Minas Gerais");
  assert.deepEqual(ids({ q: "minas ge" }), ["caixa-01", "caixa-02", "caixa-03", "caixa-12"], "última palavra pela metade");
  assert.deepEqual(ids({ q: "São Paulo" }), ["caixa-04", "caixa-05", "lj-10"], "estado SP (Campinas entra)");
  assert.deepEqual(ids({ q: "sp" }), ["caixa-04", "caixa-05", "lj-10"], "sigla só compara com a UF");
  assert.deepEqual(ids({ q: "pará" }), ["lj-11"]);
  assert.deepEqual(ids({ q: "para" }), ["lj-11"], "sozinho é o estado");
  assert.deepEqual(ids({ q: "casa para reforma" }), ["lj-11"], "no meio da frase é preposição");
  assert.deepEqual(ids({ q: "apartamento morumbi" }), ["lj-10"]);
  assert.deepEqual(ids({ q: "   " }), ITENS.map((i) => i.id).sort(), "só espaço não filtra");
});

test("texto: tipo e quartos pelos campos; nome de cidade ou bairro só na cidade ou no bairro, não no endereço", () => {
  assert.deepEqual(ids({ q: "ap 2 quartos" }), ["caixa-01", "caixa-02", "caixa-04"], "não vira Amapá nem casa com o '2' do endereço");
  assert.deepEqual(ids({ q: "apartamento 1 quarto" }), ["caixa-12"]);
  assert.deepEqual(ids({ q: "casa 3 qts" }), ["caixa-03"]);
  assert.deepEqual(ids({ q: "2+ quartos" }), ["caixa-01", "caixa-02", "caixa-03", "caixa-04", "lj-11"]);
  assert.deepEqual(ids({ q: "10" }), ["lj-10"], "número é palavra inteira: '10' não casa com o 100 do endereço nem com 160 m²");
  // a "Rua Uberaba" de um imóvel de Uberlândia não entra na busca pela cidade de Uberaba
  const ix = criarIndice(ITENS, { textoExtra: (i) => (i.id === "caixa-02" ? "Rua Uberaba, 50" : ENDERECOS.get(i.id)) });
  const so = (q: string) => buscar(ix, busca({ q }), { agora: AGORA }).itens.map((i) => i.id).sort();
  assert.deepEqual(so("uberaba"), ["caixa-03"]);
  assert.deepEqual(so("rua uberaba"), ["caixa-02"], "com mais palavras, o endereço vale");
  assert.deepEqual(so("vila mariana"), ["caixa-04"], "bairro");
  assert.deepEqual(so("bh"), [], "apelido de cidade (Belo Horizonte não está nestes dados)");
});

test("local em árvore: UF, cidade dentro da UF, bairro dentro da cidade", () => {
  assert.deepEqual(ids({ uf: ["MG"] }), ["caixa-01", "caixa-02", "caixa-03"]);
  assert.deepEqual(ids({ cidade: ["MG|Uberlândia"] }), ["caixa-01", "caixa-02"]);
  assert.deepEqual(ids({ uf: ["MG"], cidade: ["MG|Uberaba"] }), ["caixa-03"]);
  assert.deepEqual(ids({ uf: ["MG", "PA"], cidade: ["MG|Uberaba"] }), ["caixa-03", "lj-11"], "a cidade restringe só a própria UF");
  assert.deepEqual(ids({ cidade: ["MG|Uberlândia"], bairro: ["MG|Uberlândia|Santa Mônica"] }), ["caixa-02"]);
  assert.deepEqual(ids({ cidade: ["MG|Uberlândia", "MG|Uberaba"], bairro: ["MG|Uberlândia|Centro"] }), ["caixa-01", "caixa-03"], "Uberaba inteira continua");
  assert.deepEqual(ids({ bairro: ["SP|São Paulo|Vila Mariana"] }), ["caixa-04"]);
});

test("cada filtro: listas, faixas inclusivas (sem o dado não passa), sim/não, datas em Brasília, fonte e foto", () => {
  assert.deepEqual(ids({ tipo: ["casa", "terreno"] }), ["caixa-03", "caixa-05", "lj-11"]);
  assert.deepEqual(ids({ lanceMin: 180000, lanceMax: 300000 }), ["caixa-03", "caixa-12", "lj-11"], "inclusivo nas duas pontas");
  assert.deepEqual(ids({ avaliacaoMax: 200000 }), ["caixa-01", "caixa-02", "caixa-12"], "sem avaliação não passa");
  assert.deepEqual(ids({ desagioMin: 50 }), ["caixa-02", "lj-10"]);
  assert.deepEqual(ids({ desagioMax: 0 }), ["caixa-03"], "deságio negativo (lance acima da avaliação)");
  assert.deepEqual(ids({ lanceM2Max: 1500 }), ["caixa-02", "caixa-05"]);
  assert.deepEqual(ids({ areaMin: 120 }), ["caixa-03", "caixa-05", "lj-10"]);
  assert.deepEqual(ids({ lanceMin: 300000, lanceMax: 180000 }), ids({ lanceMin: 180000, lanceMax: 300000 }), "pontas trocadas valem como a faixa certa");
  assert.deepEqual(ids({ quartosMin: 3 }), ["caixa-03", "lj-11"], "sem quartos informados não passa");
  assert.equal(ids({ quartosMin: 0, vagasMin: 0 }).length, ITENS.length, "pelo menos 0 não filtra (nem esconde quem não informa)");
  assert.deepEqual(ids({ vagasMin: 2 }), ["caixa-03"]);
  assert.deepEqual(ids({ modalidade: ["leilao"] }), ["caixa-04", "lj-10", "lj-11"]);
  assert.deepEqual(ids({ praca: ["2", "nd"] }), ["caixa-04", "lj-10"], "nd = a fonte não diz a praça");
  assert.deepEqual(ids({ dataDe: "2026-10-19", dataAte: "2026-10-19" }), ["lj-10"], "01h UTC de 20/10 ainda é 19/10 em Brasília");
  assert.deepEqual(ids({ dataDe: "2026-10-14" }), ["lj-10", "lj-11"], "sem data não passa");
  assert.deepEqual(ids({ dataAte: "2026-99-99" }), ITENS.map((i) => i.id).sort(), "dia impossível não filtra");
  assert.deepEqual(ids({ financiamento: true }), ["caixa-01", "caixa-02", "caixa-05", "caixa-12", "lj-11"]);
  assert.deepEqual(ids({ financiamento: false }), ["caixa-03", "caixa-04"], "não aceita ≠ não informado");
  assert.deepEqual(ids({ fgts: true }), ["caixa-12"]);
  assert.deepEqual(ids({ parcelamento: true }), ["lj-10"]);
  assert.deepEqual(ids({ ocupacao: ["nd"] }), ["caixa-01", "caixa-02", "caixa-03", "caixa-04", "caixa-05", "caixa-12"]);
  assert.deepEqual(ids({ ocupacao: ["ocupado", "desocupado"] }), ["lj-10", "lj-11"]);
  assert.deepEqual(ids({ natureza: ["judicial"] }), ["lj-10"]);
  assert.deepEqual(ids({ natureza: ["nd"] }), ["lj-11"]);
  assert.deepEqual(ids({ natureza: ["extrajudicial"] }).length, 6);
  assert.deepEqual(ids({ fonte: ["leiloesjudiciais_api"] }), ["lj-10", "lj-11"]);
  assert.deepEqual(ids({ comFoto: false }), ["caixa-05"]);
  assert.deepEqual(ids({ tipo: ["casa"], uf: ["MG"], lanceMax: 280000 }), [], "E entre filtros");
});

test("tags e selo (Luneta): comTags exige confirmadas; semTags esconde confirmadas e em revisão", () => {
  assert.deepEqual(ids({ comTags: ["ocupado"] }), ["caixa-02"], "a de caixa-12 está em revisão");
  assert.deepEqual(ids({ comTags: ["desagio-alto", "ocupado"] }), ["caixa-02"], "todas");
  assert.deepEqual(ids({ comTags: ["nao-existe"] }), []);
  assert.deepEqual(ids({ semTags: ["ocupado"] }), ["caixa-01", "caixa-03", "caixa-04", "caixa-05", "lj-10", "lj-11"]);
  assert.deepEqual(ids({ semTags: ["ocupado", "preco-acima-mercado"] }).length, 5);
  assert.deepEqual(ids({ selo: [3, 2] }), ["caixa-01", "caixa-03"]);
  assert.deepEqual(ids({ selo: [3] }, {}, { selosDesligados: true }).length, ITENS.length, "selos desligados: filtro ignorado");
});

test("plano Lente: sem tags nem selo em nada, filtros e ordens de tag/selo ignorados", () => {
  const r = buscar(IX, busca({ comTags: ["ocupado"], semTags: ["desagio-alto"], selo: [3] }, { plano: "lente", ordem: "alertas" }), { agora: AGORA });
  assert.equal(r.total, ITENS.length, "filtros de tag e selo ignorados");
  assert.ok(r.itens.every((i) => i.tags.length === 0 && i.selo === 0));
  assert.deepEqual(r.facetas.tags, []);
  assert.deepEqual(r.facetas.selo, []);
  assert.deepEqual(r.itens.map((i) => i.id), buscar(IX, busca(), { agora: AGORA }).itens.map((i) => i.id), "alertas cai no padrão");
  assert.equal(buscar(IX, busca({}, { plano: "lente", ordem: "selo" }), { agora: AGORA }).itens[0]!.id, "caixa-02");
  assert.ok(ITENS[0]!.tags.length > 0, "a lista guardada não é alterada");
  assert.deepEqual(paraPlano(ITENS[0]!, "lente").tags, []);
  assert.equal(paraPlano(ITENS[0]!, "luneta"), ITENS[0]);
});

test("plano Lente: os filtros avançados (fora dos 6 prometidos) e as ordens da Luneta são ignorados no servidor", () => {
  const todos = ids({});
  // cada filtro avançado sozinho filtra na Luneta e não filtra nada no Lente
  const avancados: Filtros[] = [
    { areaMin: 100 },
    { areaMax: 70 },
    { lanceM2Max: 2000 },
    { quartosMin: 3 },
    { vagasMin: 2 },
    { modalidade: ["leilao"] },
    { praca: ["2"] },
    { financiamento: true },
    { fgts: true },
    { parcelamento: true },
    { ocupacao: ["desocupado"] },
    { natureza: ["judicial"] },
    { fonte: ["leiloesjudiciais_api"] },
    { comFoto: false },
  ];
  for (const f of avancados) {
    const nome = JSON.stringify(f);
    assert.ok(ids(f).length < todos.length, `${nome} filtra na Luneta`);
    assert.deepEqual(ids(f, { plano: "lente" }), todos, `${nome} não filtra no Lente`);
  }
  // os 6 prometidos valem no Lente igual à Luneta
  const doLente: Filtros[] = [{ uf: ["SP"] }, { cidade: ["MG|Uberlândia"] }, { tipo: ["casa"] }, { lanceMax: 200000 }, { avaliacaoMin: 250000 }, { desagioMin: 30 }, { q: "morumbi" }];
  for (const f of doLente) assert.deepEqual(ids(f, { plano: "lente" }), ids(f), JSON.stringify(f));
  // misturados: só os do Lente valem
  assert.deepEqual(ids({ uf: ["SP"], quartosMin: 3, comFoto: true }, { plano: "lente" }), ids({ uf: ["SP"] }));
  // "2 quartos" escrito na busca é o mesmo filtro de quartos: no Lente, só o resto da busca vale (R4-VAZ-06)
  assert.deepEqual(ids({ q: "ap 2 quartos" }, { plano: "lente" }), ids({ tipo: ["apartamento"] }, { plano: "lente" }), "o \"ap\" continua apartamento");
  assert.deepEqual(ids({ q: "2+ quartos" }, { plano: "lente" }), todos, "só quartos na busca: nada filtra no Lente");
  assert.ok(ids({ q: "2+ quartos" }).length < todos.length, "na Luneta, filtra");

  // ordens: área e R$/m² são do Lente; alertas, selo e localização caem na padrão
  const ordem = (o: Ordem, plano: Busca["plano"]) => buscar(IX, busca({}, { ordem: o, plano }), { agora: AGORA }).itens.map((i) => i.id);
  for (const o of ["area-desc", "m2-asc", "lance-asc", "recentes"] as const) assert.deepEqual(ordem(o, "lente"), ordem(o, "luneta"), o);
  for (const o of ["alertas", "selo", "localizacao"] as const) assert.deepEqual(ordem(o, "lente"), ordem("desagio", "lente"), o);
});

test("plano Lente: as facetas dos filtros avançados não saem; as do Lente, sim", () => {
  const lente = buscar(IX, busca({}, { plano: "lente" }), { agora: AGORA });
  const luneta = buscar(IX, busca(), { agora: AGORA });
  for (const k of ["modalidade", "praca", "ocupacao", "natureza", "fonte", "tags", "selo"] as const) {
    assert.ok(luneta.facetas[k].length > 0, `${k} na Luneta`);
    assert.deepEqual(lente.facetas[k], [], `${k} vazia no Lente`);
  }
  assert.deepEqual([lente.facetas.lanceM2, lente.facetas.area], [null, null]);
  assert.deepEqual([lente.facetas.financiamento, lente.facetas.fgts, lente.facetas.parcelamento, lente.facetas.comFoto], [0, 0, 0, 0]);
  assert.deepEqual(lente.facetas.notaLocal, []);
  // as do Lente continuam iguais às da Luneta
  for (const k of ["uf", "cidade", "bairro", "tipo"] as const) assert.deepEqual(lente.facetas[k], luneta.facetas[k], k);
  for (const k of ["lance", "avaliacao", "desagio"] as const) assert.deepEqual(lente.facetas[k], luneta.facetas[k], k);
  assert.equal(lente.facetas.comData, luneta.facetas.comData);
});

test("facetas: cada uma conta com os OUTROS filtros; zero só aparece se escolhido", () => {
  const r = buscar(IX, busca({ uf: ["MG"], tipo: ["casa"] }), { agora: AGORA });
  assert.equal(r.total, 1);
  assert.deepEqual(faceta(r, "tipo"), { apartamento: 2, casa: 1 }, "tipos em MG, ignorando o filtro de tipo");
  assert.deepEqual(faceta(r, "uf"), { MG: 1, PA: 1 }, "casas por UF, ignorando o filtro de UF");
  assert.deepEqual(faceta(r, "cidade"), { "MG|Uberaba": 1 }, "cidades das UFs escolhidas");
  assert.deepEqual(r.facetas.cidade[0]!.rotulo, "Uberaba/MG");
  assert.deepEqual(r.facetas.bairro, [], "sem cidade escolhida, sem bairros");
  assert.deepEqual(faceta(r, "modalidade"), { venda_direta: 1 });
  assert.equal(r.facetas.financiamento, 0);

  const r2 = buscar(IX, busca({ tipo: ["rural"], praca: ["nd"] }), { agora: AGORA });
  assert.equal(r2.total, 0);
  assert.deepEqual(faceta(r2, "tipo"), { apartamento: 1, rural: 0 }, "rural escolhido aparece com 0");
  assert.deepEqual(faceta(r2, "praca"), { nd: 0 }, "nenhum rural em praça nenhuma; nd escolhido aparece com 0");

  const r3 = buscar(IX, busca({ cidade: ["MG|Uberlândia"] }), { agora: AGORA });
  assert.deepEqual(faceta(r3, "bairro"), { "MG|Uberlândia|Centro": 1, "MG|Uberlândia|Santa Mônica": 1 });
  assert.deepEqual(
    faceta(r3, "cidade"),
    { "MG|Uberlândia": 2, "MG|Uberaba": 1, "SP|São Paulo": 2, "SP|Campinas": 1, "PA|Belém": 1, "RJ|Rio de Janeiro": 1 },
    "sem UF escolhida, todas as cidades continuam na lista para acrescentar (de qualquer UF)",
  );
  assert.deepEqual(
    faceta(buscar(IX, busca({ uf: ["SP"], cidade: ["MG|Uberlândia"] }), { agora: AGORA }), "cidade"),
    { "MG|Uberlândia": 2, "SP|São Paulo": 2, "SP|Campinas": 1 },
    "com UF escolhida: as cidades dela e as já escolhidas",
  );
  assert.equal(r3.facetas.uf.find((o) => o.valor === "MG")!.total, 2, "UF já refinada conta só as cidades escolhidas");
  assert.equal(r3.facetas.uf.find((o) => o.valor === "SP")!.total, 3, "outra UF conta inteira");

  const r4 = buscar(IX, busca({ cidade: ["MG|Uberlândia", "SP|São Paulo"] }), { agora: AGORA });
  assert.equal(r4.facetas.bairro.find((b) => b.valor === "SP|São Paulo|Vila Mariana")!.rotulo, "Vila Mariana · São Paulo", "com 2 cidades o bairro diz a cidade");

  const r5 = buscar(IX, busca({ financiamento: true }), { agora: AGORA });
  assert.equal(r5.facetas.financiamento, 5);
  assert.equal(r5.facetas.comFoto, 4);
  assert.equal(r5.facetas.fgts, 1);
  assert.deepEqual(faceta(r5, "fonte"), { caixa_csv: 4, leiloesjudiciais_api: 1 });
  assert.deepEqual(faceta(r5, "natureza"), { extrajudicial: 4, nd: 1 });
  assert.deepEqual(faceta(r5, "ocupacao"), { desocupado: 1, nd: 4 });
});

test("faceta de tags: confirmadas nos resultados; tag escondida conta quantos voltariam", () => {
  const r = buscar(IX, busca({ uf: ["MG"] }), { agora: AGORA });
  assert.deepEqual(
    faceta(r, "tags"),
    { ocupado: 1, "preco-acima-mercado": 0, "desagio-alto": 2, "ocupacao-nao-informada": 1 },
    "total = confirmadas; a que só existe em revisão aparece com 0 (para dar para escondê-la)",
  );
  const comRevisao = Object.fromEntries(r.facetas.tags.map((t) => [t.valor, t.comRevisao]));
  assert.deepEqual(comRevisao, { ocupado: 1, "preco-acima-mercado": 1, "desagio-alto": 2, "ocupacao-nao-informada": 1 }, "comRevisao = o que esconder tira");
  assert.deepEqual(r.facetas.tags.map((t) => t.severidade), ["grave", "grave", "positivo", "info"], "graves primeiro");
  const r2 = buscar(IX, busca({ uf: ["MG"], semTags: ["ocupado"] }), { agora: AGORA });
  assert.equal(r2.total, 2);
  assert.equal(faceta(r2, "tags").ocupado, 1, "caixa-02 volta se deixar de esconder");
  const r2b = buscar(IX, busca({ uf: ["MG"], semTags: ["preco-acima-mercado"] }), { agora: AGORA });
  assert.equal(r2b.total, 2, "esconder também tira a em revisão");
  const preco = r2b.facetas.tags.find((t) => t.valor === "preco-acima-mercado")!;
  assert.deepEqual([preco.total, preco.comRevisao], [1, 1], "escondida: quantos voltariam");
  const r3 = buscar(IX, busca({ comTags: ["desagio-alto"] }), { agora: AGORA });
  assert.equal(faceta(r3, "tags")["desagio-alto"], r3.total);
  assert.deepEqual(faceta(buscar(IX, busca(), { agora: AGORA }), "selo"), { 3: 1, 2: 1, 1: 1 });
  assert.deepEqual(buscar(IX, busca(), { agora: AGORA, selosDesligados: true }).facetas.selo, []);
});

test("ordens: todas, com desempate estável pelo id", () => {
  const ordem = (o: Ordem, opcoes = {}) => buscar(IX, busca({}, { ordem: o }), { agora: AGORA, ...opcoes }).itens.map((i) => i.id);
  assert.deepEqual(ordem("lance-asc"), ["caixa-02", "caixa-01", "caixa-05", "caixa-12", "lj-11", "caixa-03", "caixa-04", "lj-10"]);
  assert.deepEqual(ordem("lance-desc"), [...ordem("lance-asc")].reverse());
  assert.deepEqual(ordem("m2-asc").slice(0, 3), ["caixa-05", "caixa-02", "caixa-01"]);
  assert.equal(ordem("m2-asc").at(-1), "lj-11", "sem R$/m² no fim");
  assert.deepEqual(ordem("area-desc").slice(0, 2), ["caixa-05", "lj-10"]);
  assert.equal(ordem("area-desc").at(-1), "lj-11");
  // data: de hoje em diante (a de hoje primeiro), depois as que já passaram, sem data no fim
  assert.deepEqual(ordem("data").slice(0, 3), ["lj-11", "lj-10", "caixa-12"]);
  // alertas: menos graves e de atenção confirmadas primeiro (em revisão não conta)
  assert.deepEqual(ordem("alertas").slice(0, 3), ["caixa-01", "lj-11", "caixa-12"]);
  assert.deepEqual(ordem("alertas").slice(-1), ["caixa-04"], "duas de atenção");
  assert.deepEqual(ordem("selo").slice(0, 3), ["caixa-01", "caixa-03", "caixa-02"]);
  assert.deepEqual(ordem("selo", { selosDesligados: true }), ordem("desagio"), "selos desligados: padrão");
  assert.deepEqual(ordem("recentes").slice(0, 2), ["lj-10", "caixa-05"], "coletados por último; empate pelo deságio");
  const dobro = criarIndice([...ITENS].reverse());
  assert.deepEqual(buscar(dobro, busca(), { agora: AGORA }).itens.map((i) => i.id), ordem("desagio"), "mesma ordem com a lista invertida");
});

test("paginação: 24 por padrão, máximo 96, página fora do fim vai para a última", () => {
  const muitos = Array.from({ length: 130 }, (_, k) => imovel(`caixa-${String(k).padStart(3, "0")}`, { desagio: k % 7 }));
  const ix = criarIndice(muitos);
  const r = buscar(ix, { conjunto: "previa", plano: "luneta", filtros: {}, ordem: "desagio", pagina: 1 }, { agora: AGORA });
  assert.deepEqual([r.total, r.porPagina, r.totalPaginas, r.itens.length], [130, 24, 6, 24]);
  const ultima = buscar(ix, { ...busca(), porPagina: undefined, pagina: 99 }, { agora: AGORA });
  assert.deepEqual([ultima.pagina, ultima.itens.length], [6, 10]);
  const grande = buscar(ix, { ...busca(), porPagina: 500 }, { agora: AGORA });
  assert.equal(grande.porPagina, POR_PAGINA_MAXIMO);
  const todas = new Set<string>();
  for (let p = 1; p <= 6; p++) for (const i of buscar(ix, { ...busca(), porPagina: 24, pagina: p }, { agora: AGORA }).itens) todas.add(i.id);
  assert.equal(todas.size, 130, "as páginas cobrem tudo, sem repetir");
  const vazio = buscar(ix, busca({ uf: ["AC"] }), { agora: AGORA });
  assert.deepEqual([vazio.total, vazio.pagina, vazio.totalPaginas, vazio.itens.length], [0, 1, 1, 0]);
});

test("histogramas: sobre os itens dos OUTROS filtros, limites redondos e crescentes", () => {
  const r = buscar(IX, busca({ lanceMax: 100000, uf: ["MG", "SP"] }), { agora: AGORA });
  assert.equal(r.total, 1);
  const h = r.facetas.lance!;
  assert.equal(h.totais.reduce((a, b) => a + b, 0), 6, "lance: os 6 de MG e SP, ignorando a faixa de lance");
  assert.equal(h.min, 90000);
  assert.equal(h.max, 900000);
  for (let k = 1; k < h.limites.length; k++) assert.ok(h.limites[k]! > h.limites[k - 1]!);
  assert.equal(h.limites.length, h.totais.length + 1);
  assert.equal(r.facetas.avaliacao!.totais.reduce((a, b) => a + b, 0), 1, "avaliação: só o que passa no filtro de lance");
  const d = buscar(IX, busca(), { agora: AGORA }).facetas.desagio!;
  assert.equal(d.limites[0], -10);
  assert.equal(d.limites.at(-1), 55, "a régua termina no maior deságio que existe (55%), não em 100");
  assert.ok(d.limites.every((x, k) => k === 0 || x - d.limites[k - 1]! === 5));
  assert.equal(d.totais.reduce((a, b) => a + b, 0), 7, "sem deságio fica fora");
  assert.equal(buscar(IX, busca({ uf: ["AC"] }), { agora: AGORA }).facetas.lance, null);
  const l = limitesLog(18000, 1850000);
  assert.ok(l[0]! <= 18000 && l.at(-1)! >= 1850000);
  assert.ok(l.length - 1 >= 12 && l.length - 1 <= 36, `${l.length - 1} barras`);
  assert.ok(l.every((x) => Number(x.toPrecision(2)) === x), `redondos: ${l.join(", ")}`);
});

test("mapa: resultados por cidade, posição da sede, até 3 destaques de maior deságio", () => {
  const r = buscar(IX, busca({ uf: ["SP", "MG"] }), { agora: AGORA });
  const sp = r.mapa.find((p) => p.chave === "SP|São Paulo")!;
  assert.deepEqual([sp.total, sp.lanceMin, sp.desagioMax], [2, 400000, 50]);
  assert.deepEqual([sp.lat, sp.lon], [-23.53, -46.63], "a da sede (precisão cidade), não a do lote com rua");
  assert.deepEqual(sp.destaques.map((d) => d.id), ["lj-10", "caixa-04"]);
  const camp = r.mapa.find((p) => p.chave === "SP|Campinas")!;
  assert.equal(camp.desagioMax, null);
  assert.equal(r.mapa.reduce((a, p) => a + p.total, 0), r.total);
  assert.deepEqual(r.mapa[0]!.chave, "MG|Uberlândia", "maiores primeiro");
  const muitos = criarIndice(Array.from({ length: 6 }, (_, k) => imovel(`caixa-9${k}`, { desagio: 10 * k, foto: k === 2 ? null : "https://x.test/f.jpg" })));
  const p = buscar(muitos, busca(), { agora: AGORA }).mapa[0]!;
  assert.deepEqual(p.destaques.map((d) => d.id), ["caixa-95", "caixa-94", "caixa-93"]);
  assert.deepEqual(Object.keys(p.destaques[0]!).sort(), ["bairro", "desagio", "foto", "id", "lance", "tipo", "titulo"]);
  assert.deepEqual(buscar(IX, busca(), { agora: AGORA, mapa: false }).mapa, []);
});

test("valor fora do padrão (lance > 5× a avaliação): no fim de toda ordem e fora das réguas de lance e deságio", () => {
  const itens = [...ITENS, imovel("caixa-99", { lance: 69_703_640, avaliacao: 401_534, desagio: -17259, lanceM2: 531_197 })];
  const ix = criarIndice(itens);
  for (const ordem of ["lance-desc", "desagio", "lance-asc"] as const) {
    const r = buscar(ix, busca({}, { ordem }), { agora: AGORA });
    assert.equal(r.itens.at(-1)!.id, "caixa-99", ordem);
  }
  const f = buscar(ix, busca(), { agora: AGORA }).facetas;
  assert.ok(f.lance!.max < 1_000_000, "a régua do lance não vai a R$ 70 milhões");
  assert.ok(f.desagio!.min >= -50);
  // o filtro continua achando o imóvel (só a régua e a ordem o deixam de lado)
  assert.deepEqual(buscar(ix, busca({ lanceMin: 10_000_000 }), { agora: AGORA }).itens.map((i) => i.id), ["caixa-99"]);
});

test("facetas para as ordens: com data da praça e coleta num dia só; sem facetas no pedido do mapa", () => {
  const r = buscar(IX, busca(), { agora: AGORA });
  assert.equal(r.facetas.comData, 3);
  assert.equal(r.facetas.coletaUnica, false);
  assert.equal(buscar(IX, busca({ uf: ["MG"] }), { agora: AGORA }).facetas.coletaUnica, true);
  const m = buscar(IX, busca({}, { porPagina: 1 }), { agora: AGORA, facetas: false });
  assert.deepEqual(m.facetas.cidade, []);
  assert.equal(m.facetas.lance, null);
  assert.ok(m.mapa.length > 0);
});

test("faceta da nota de localização: quantos a partir de cada nota, com os OUTROS filtros; vazia no Lente", () => {
  const lista = [
    imovel("n-1", { notaLocal: 85 }),
    imovel("n-2", { notaLocal: 60 }),
    imovel("n-3", { notaLocal: 40, tipo: "casa" }),
    imovel("n-4", { notaLocal: 12 }),
    imovel("n-5", { notaLocal: null }),
  ];
  const ix = criarIndice(lista);
  const r = buscar(ix, busca(), { agora: AGORA });
  assert.equal(r.facetas.notaLocal!.length, 101);
  assert.equal(r.facetas.notaLocal![0], 4); // com nota
  assert.equal(r.facetas.notaLocal![40], 3);
  assert.equal(r.facetas.notaLocal![60], 2);
  assert.equal(r.facetas.notaLocal![80], 1);
  assert.equal(r.facetas.notaLocal![100], 0);
  // o próprio filtro da nota não muda a contagem dela (como uma faixa); os outros, sim
  const comFiltro = buscar(ix, busca({ notaLocalMin: 60 }), { agora: AGORA });
  assert.equal(comFiltro.total, 2);
  assert.equal(comFiltro.facetas.notaLocal![40], 3);
  assert.equal(buscar(ix, busca({ tipo: ["apartamento"] }), { agora: AGORA }).facetas.notaLocal![40], 2);
  // Lente: nada da nota sai
  assert.deepEqual(buscar(ix, busca({}, { plano: "lente" }), { agora: AGORA }).facetas.notaLocal, []);
});

test("praça vencida há mais de 1 dia sai de tudo (o instantâneo fica no ar por dias)", () => {
  const ix = criarIndice([
    imovel("caixa-a", { dataPraca: "2026-10-12T13:00:00.000Z", desagio: 90 }),
    imovel("caixa-b", { dataPraca: "2026-10-13T20:00:00.000Z" }),
    imovel("caixa-c"),
  ]);
  const r = buscar(ix, busca(), { agora: AGORA });
  assert.deepEqual(r.itens.map((i) => i.id).sort(), ["caixa-b", "caixa-c"], "ontem ainda aparece; anteontem não");
  assert.equal(r.totalConjunto, 2);
  assert.equal(r.facetas.desagio!.max, 40, "nem nos histogramas");
  assert.equal(r.mapa[0]!.total, 2, "nem no mapa");
  assert.equal(buscar(ix, busca({ tipo: ["casa"] }), { agora: AGORA }).facetas.tipo.find((o) => o.valor === "apartamento")!.total, 2, "nem nas facetas");
  assert.equal(buscar(ix, busca(), { agora: new Date("2026-10-01T00:00:00Z") }).total, 3, "antes da praça, todos");
});

test("diaBrasilia: UTC−3", () => {
  assert.equal(diaBrasilia("2026-10-20T01:00:00.000Z"), "2026-10-19");
  assert.equal(diaBrasilia("2026-10-20"), "2026-10-20");
  assert.equal(diaBrasilia("lixo"), null);
});

test("desempenho: 21 mil imóveis, todas as facetas, abaixo de 60 ms", () => {
  const n = 21000;
  const ufs = ["SP", "RJ", "MG", "BA", "PR", "RS", "GO", "PE"];
  const grandes = Array.from({ length: n }, (_, k) =>
    imovel(`caixa-${k}`, {
      uf: ufs[k % ufs.length]!,
      cidade: `Cidade ${k % 900}`,
      bairro: `Bairro ${k % 4000}`,
      tipo: k % 3 ? "apartamento" : "casa",
      lance: 30000 + ((k * 7919) % 2000000),
      desagio: ((k * 31) % 140) - 40,
      area: 30 + (k % 400),
      tags: k % 2 ? [tag("desagio-alto", "positivo"), tag("ocupacao-nao-informada", "info")] : [tag("preco-acima-mercado", "grave", true)],
    }),
  );
  const ix = criarIndice(grandes);
  const b = busca({ uf: ["SP", "MG"], tipo: ["apartamento"], lanceMax: 500000, semTags: ["ocupado"] }, { porPagina: 24 });
  buscar(ix, b, { agora: AGORA });
  const tempos: number[] = [];
  for (let k = 0; k < 7; k++) {
    const t = performance.now();
    buscar(ix, k % 2 ? b : busca({}, { porPagina: 24 }), { agora: AGORA });
    tempos.push(performance.now() - t);
  }
  tempos.sort((a, b) => a - b);
  assert.ok(tempos[3]! < 60, `mediana ${tempos[3]!.toFixed(1)} ms`);
});

test("área do mapa (bbox): só o ponto dentro do retângulo; sem ponto não passa; inválida não filtra; vale no Lente", () => {
  // São Paulo capital (caixa-04 em -23,53/-46,63 e lj-10 em -23,6/-46,7); Campinas (-22,9/-47,06) fica de fora
  const sp: Filtros = { bbox: [-46.8, -23.7, -46.5, -23.4] };
  assert.deepEqual(ids(sp), ["caixa-04", "lj-10"]);
  assert.deepEqual(ids(sp, { plano: "lente" }), ["caixa-04", "lj-10"], "a área vale no Lente");
  // borda inclusiva
  assert.deepEqual(ids({ bbox: [-46.63, -23.53, -46.6, -23.5] }), ["caixa-04"]);
  // E com os outros filtros; a faceta de UF conta dentro da área
  const r = buscar(IX, busca({ ...sp, tipo: ["apartamento"] }), { agora: AGORA });
  assert.deepEqual(r.itens.map((i) => i.id).sort(), ["caixa-04", "lj-10"]);
  assert.deepEqual(faceta(r, "uf"), { SP: 2 });
  // imóvel sem coordenada nunca está numa área
  const semPonto = criarIndice([...ITENS, { ...ITENS[3]!, id: "caixa-99", lat: null, lon: null }]);
  assert.deepEqual(buscar(semPonto, busca(sp), { agora: AGORA }).itens.map((i) => i.id).sort(), ["caixa-04", "lj-10"]);
  // retângulo ao contrário ou com NaN: não filtra (a URL já recusa; aqui é a defesa do servidor)
  assert.equal(ids({ bbox: [-46.5, -23.7, -46.8, -23.4] }).length, ITENS.length);
  assert.equal(ids({ bbox: [NaN, -23.7, -46.5, -23.4] }).length, ITENS.length);
  // o mapa agregado por cidade (SVG) também segue a área
  assert.deepEqual(buscar(IX, busca(sp), { agora: AGORA }).mapa.map((p) => p.chave), ["SP|São Paulo"]);
});

test("aoFiltrar: recebe a máscara de cada imóvel (0 = no resultado), a mesma regra da lista", () => {
  const recebidas: Int32Array[] = [];
  const r = buscar(IX, busca({ uf: ["SP"] }, { porPagina: 1 }), { agora: AGORA, facetas: false, mapa: false, aoFiltrar: (m) => recebidas.push(m) });
  assert.equal(recebidas.length, 1);
  const dentro = ITENS.filter((_, k) => recebidas[0]![k] === 0).map((i) => i.id).sort();
  assert.deepEqual(dentro, ["caixa-04", "caixa-05", "lj-10"]);
  assert.equal(r.total, 3);
});
