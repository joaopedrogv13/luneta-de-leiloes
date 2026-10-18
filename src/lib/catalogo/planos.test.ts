/**
 * Planos: o que o Lente não vê (pode, travas, página do imóvel com o plano aplicado) e a nota de localização na busca
 * (ordem "localizacao", filtro notaLocalMin, notaLocal fora do Lente).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buscar, criarIndice, paraPlano } from "./consulta";
import { filtrosEfetivos, gruposForaDoPlano, gruposIgnorados, grupoPermitido, ordemEfetiva, pilulas, recursoDoGrupo } from "./filtros-rotulos";
import {
  aplicarPlanoPagina,
  filtroPermitido,
  filtrosDoPlano,
  filtrosForaDoPlano,
  FILTROS_LENTE,
  lerPlano,
  MINIMO,
  ordemDoPlano,
  ordemPermitida,
  pode,
  RECURSO_DA_ORDEM,
  recursoDoFiltro,
  RECURSOS,
  RECURSOS_LUNETA,
  travasDo,
} from "./planos";
import type { Busca, Filtros, ImovelDetalhe, ImovelResumo, LocalizacaoImovel, Ordem, PaginaImovel, Plano } from "./tipos";

const AGORA = new Date("2026-10-14T15:00:00Z");

function imovel(id: string, s: Partial<ImovelResumo> = {}): ImovelResumo {
  return {
    id, titulo: "Apartamento", tipo: "apartamento", uf: "RJ", cidade: "São Gonçalo", bairro: "Centro", lat: -22.8, lon: -43.0,
    precisaoGeo: "exata", area: 50, areaTerreno: null, quartos: 2, vagas: 1, avaliacao: 200000, lance: 100000, desagio: 50,
    lanceM2: 2000, avaliacaoM2: 4000, modalidade: "venda_direta", modalidadeFonte: null, praca: null, dataPraca: null,
    financiamento: null, fgts: null, parcelamento: null, ocupacao: null, judicial: null, fonte: { id: "caixa_csv", nome: "Caixa" },
    foto: null, totalFotos: 0, selo: 2, seloPendente: false, tags: [{ slug: "ocupado", rotulo: "Ocupado", severidade: "grave", emRevisao: false }],
    coletadoEm: "2026-10-12", notaLocal: null, ...s,
  };
}

const ITENS = [
  imovel("caixa-1", { notaLocal: 40, desagio: 60 }),
  imovel("caixa-2", { notaLocal: 90, desagio: 10 }),
  imovel("caixa-3", { notaLocal: null, desagio: 70 }),
  imovel("caixa-4", { notaLocal: 65, desagio: 30 }),
];
const IX = criarIndice(ITENS);
const busca = (extra: Partial<Busca>): Busca => ({ conjunto: "previa", plano: "luneta", filtros: {}, ordem: "desagio", pagina: 1, porPagina: 96, ...extra });
const ids = (b: Busca) => buscar(IX, b, { agora: AGORA }).itens.map((i) => i.id);

test("pode e travas: o Lente não vê nenhum recurso do Luneta; o Luneta vê tudo", () => {
  for (const r of RECURSOS) {
    assert.equal(pode("luneta", r), true, r);
    assert.equal(pode("lente", r), false, r);
    assert.ok(RECURSOS_LUNETA[r].rotulo && RECURSOS_LUNETA[r].chamada, r);
  }
  const t = travasDo("lente");
  for (const r of ["localizacao", "regiao", "portais", "simulador", "relatorio"] as const) assert.ok(t.includes(r), r);
  assert.deepEqual(travasDo("luneta"), []);
  assert.ok(FILTROS_LENTE.includes("uf") && FILTROS_LENTE.includes("desagioMin") && !FILTROS_LENTE.includes("notaLocalMin"));
});

test("ordem \"localizacao\": maior nota primeiro, sem nota por último; no Lente cai na padrão (maior deságio)", () => {
  assert.deepEqual(ids(busca({ ordem: "localizacao" })), ["caixa-2", "caixa-4", "caixa-1", "caixa-3"]);
  assert.deepEqual(ids(busca({ ordem: "localizacao", plano: "lente" })), ids(busca({ ordem: "desagio", plano: "lente" })));
  assert.equal(ordemEfetiva("localizacao", "lente", false), "desagio");
  assert.equal(ordemEfetiva("localizacao", "luneta", false), "localizacao");
});

test("filtro notaLocalMin: só quem tem nota igual ou maior (sem nota não passa); ignorado no Lente", () => {
  assert.deepEqual(ids(busca({ filtros: { notaLocalMin: 60 } })).sort(), ["caixa-2", "caixa-4"]);
  assert.deepEqual(ids(busca({ filtros: { notaLocalMin: 60 }, plano: "lente" })).sort(), ["caixa-1", "caixa-2", "caixa-3", "caixa-4"]);
  assert.ok(gruposIgnorados("lente", false).includes("notaLocal"));
  assert.deepEqual(pilulas({ notaLocalMin: 60 }).map((p) => p.rotulo), ["Localização: nota 60+"]);
});

test("notaLocal fora do Lente: lista e paraPlano", () => {
  const r = buscar(IX, busca({ plano: "lente" }), { agora: AGORA });
  assert.ok(r.itens.every((i) => i.notaLocal === null && i.selo === 0 && i.tags.length === 0));
  const l = buscar(IX, busca({}), { agora: AGORA });
  assert.equal(l.itens.find((i) => i.id === "caixa-2")!.notaLocal, 90);
  assert.equal(paraPlano(ITENS[1]!, "lente").notaLocal, null);
  assert.equal(paraPlano(ITENS[1]!, "luneta").notaLocal, 90);
});

test("página do imóvel no Lente: sem nota de localização, preço da região e portais; travas preenchidas", () => {
  const detalhe = { ...ITENS[1]!, endereco: null, areaTotal: null, areaPrivativa: 50, descricao: null, fotos: [], pracas: [], matricula: null, cartorio: null,
    numeroProcesso: null, leiloeiro: null, comitente: null, links: [], condicoesPagamento: null, geradoNaFonteEm: null, porQueSelo: "porque sim",
    tags: [{ slug: "ocupado", rotulo: "Ocupado", severidade: "grave", emRevisao: false, confianca: "alta", origem: "x", evidencia: "trecho" }],
    registro: { situacao: "pendente", matriculas: [], cartorio: null, comarca: null, oficio: null, inscricaoImobiliaria: null, averbacaoLeiloesNegativos: null, paginaFonte: null, lidoEm: null },
  } as ImovelDetalhe;
  const loc = { situacao: "calculada", nota: 90 } as LocalizacaoImovel;
  const ref = { escopo: "cidade", fonte: "itbi", nome: "São Gonçalo/RJ", tipo: "apartamento", amostra: 10, avaliacaoM2: null, lanceM2: null, imovel: { avaliacaoM2: null, lanceM2: null }, percentilLance: null } as const;
  const pagina: PaginaImovel = {
    imovel: detalhe,
    vizinhanca: {
      referencias: [ref], parecidos: [ITENS[0]!], buscasExternas: [{ tipo: "outro", rotulo: "Portal", url: "https://x.test" }],
      cobertura: { cidadeTemItbi: false, fontes: [] },
    },
    selosDesligados: false,
    sobre: { geradoEm: "2026-10-18", fontes: [] },
    localizacao: loc,
    travas: [],
  };
  const lente = aplicarPlanoPagina(pagina, "lente");
  assert.equal(lente.localizacao, null);
  assert.equal(lente.imovel.notaLocal, null);
  assert.deepEqual(lente.imovel.tags, []);
  assert.equal(lente.imovel.selo, 0);
  assert.equal(lente.imovel.porQueSelo, "");
  assert.deepEqual(lente.vizinhanca.referencias, []);
  assert.deepEqual(lente.vizinhanca.buscasExternas, []);
  assert.ok(lente.vizinhanca.cobertura, "a cobertura de preços é pública");
  assert.equal(lente.vizinhanca.parecidos[0]!.notaLocal, null);
  assert.deepEqual(lente.vizinhanca.parecidos[0]!.tags, []);
  for (const r of ["localizacao", "regiao", "portais", "simulador", "relatorio"] as const) assert.ok(lente.travas.includes(r), r);
  // nada do Luneta no JSON que vai ao navegador
  const json = JSON.stringify(lente);
  assert.ok(!json.includes("\"nota\":90") && !json.includes("Portal") && !json.includes("trecho"));

  const luneta = aplicarPlanoPagina(pagina, "luneta");
  assert.equal(luneta.localizacao, loc);
  assert.equal(luneta.vizinhanca.referencias.length, 1);
  assert.equal(luneta.vizinhanca.buscasExternas.length, 1);
  assert.deepEqual(luneta.travas, []);
  assert.equal(luneta.imovel, pagina.imovel, "na Luneta o detalhe passa como veio");
});

// ---------------------------------------------------------------------------
// Rodada 4, frente D1: a regra inteira (filtros avançados, ordens, Telescópio)
// ---------------------------------------------------------------------------

test("MINIMO e pode: toda trava é 'pelo menos a Luneta'; plano desconhecido vale como o Lente", () => {
  for (const r of RECURSOS) assert.equal(MINIMO[r], "luneta", r);
  // um 3º plano (Telescópio) entra no tipo Plano e em NIVEL; até lá, um valor estranho em tempo de execução não abre nada
  assert.equal(pode("telescopio" as Plano, "simulador"), false);
  assert.deepEqual(travasDo("telescopio" as Plano), [...RECURSOS]);
});

test("recursoDoFiltro: os 6 filtros prometidos (e a busca por texto) são do Lente; o resto é da Luneta", () => {
  for (const k of FILTROS_LENTE) {
    assert.equal(recursoDoFiltro(k), null, k);
    assert.equal(filtroPermitido(k, "lente"), true, k);
  }
  const avancados: (keyof Filtros)[] = [
    "lanceM2Min", "lanceM2Max", "areaMin", "areaMax", "quartosMin", "vagasMin", "modalidade", "praca", "financiamento", "fgts", "parcelamento", "ocupacao", "natureza", "fonte", "comFoto",
  ];
  for (const k of avancados) {
    assert.equal(recursoDoFiltro(k), "filtrosAvancados", k);
    assert.equal(filtroPermitido(k, "lente"), false, k);
    assert.equal(filtroPermitido(k, "luneta"), true, k);
  }
  assert.equal(recursoDoFiltro("comTags"), "tags");
  assert.equal(recursoDoFiltro("semTags"), "tags");
  assert.equal(recursoDoFiltro("selo"), "selos");
  assert.equal(recursoDoFiltro("notaLocalMin"), "localizacao");
});

test("filtrosDoPlano e filtrosForaDoPlano: o Lente fica só com os filtros dele; a Luneta, com tudo (o mesmo objeto)", () => {
  const f: Filtros = {
    q: "centro", uf: ["MG"], tipo: ["casa"], lanceMax: 300000, desagioMin: 20, dataDe: "2026-11-01",
    areaMin: 50, quartosMin: 2, modalidade: ["leilao"], comFoto: true, semTags: ["ocupado"], selo: [3], notaLocalMin: 60, praca: [],
  };
  assert.deepEqual(filtrosDoPlano(f, "lente"), { q: "centro", uf: ["MG"], tipo: ["casa"], lanceMax: 300000, desagioMin: 20, dataDe: "2026-11-01", praca: [] });
  assert.deepEqual(filtrosForaDoPlano(f, "lente"), ["areaMin", "quartosMin", "modalidade", "comFoto", "semTags", "selo", "notaLocalMin"], "lista vazia (praca: []) não conta");
  assert.equal(filtrosDoPlano(f, "luneta"), f);
  assert.deepEqual(filtrosForaDoPlano(f, "luneta"), []);
  const soLente: Filtros = { uf: ["SP"], lanceMin: 1 };
  assert.equal(filtrosDoPlano(soLente, "lente"), soLente, "nada a tirar: o mesmo objeto");
});

test("ordens: no Lente, preço, deságio, data, área, m² e recentes; as da Luneta caem na padrão", () => {
  const doLente: Ordem[] = ["desagio", "lance-asc", "lance-desc", "m2-asc", "area-desc", "data", "recentes"];
  for (const o of doLente) {
    assert.equal(ordemPermitida(o, "lente"), true, o);
    assert.equal(ordemDoPlano(o, "lente"), o, o);
  }
  for (const o of ["alertas", "selo", "localizacao"] as const) {
    assert.equal(ordemPermitida(o, "lente"), false, o);
    assert.equal(ordemDoPlano(o, "lente"), "desagio", o);
    assert.equal(ordemDoPlano(o, "luneta"), o, o);
  }
  assert.deepEqual(RECURSO_DA_ORDEM, { alertas: "tags", selo: "selos", localizacao: "localizacao" });
});

test("paraPlano na Luneta: o mesmo item; no Lente, uma cópia sem tags, selo e nota", () => {
  assert.equal(paraPlano(ITENS[0]!, "luneta"), ITENS[0]);
  const lente = paraPlano(ITENS[0]!, "lente");
  assert.notEqual(lente, ITENS[0]);
  assert.deepEqual([lente.tags, lente.selo, lente.notaLocal], [[], 0, null]);
  assert.equal(ITENS[0]!.tags.length, 1, "o item guardado não muda");
});

test("filtros-rotulos espelha a regra: grupos ignorados, fora do plano e o recurso de cada grupo", () => {
  const ign = gruposIgnorados("lente", false);
  for (const g of ["lanceM2", "area", "quartos", "vagas", "modalidade", "praca", "financiamento", "fgts", "parcelamento", "ocupacao", "natureza", "fonte", "comFoto", "semTags", "comTags", "selo", "notaLocal"] as const) {
    assert.ok(ign.includes(g), g);
  }
  for (const g of ["q", "uf", "cidade", "bairro", "tipo", "lance", "avaliacao", "desagio", "data"] as const) {
    assert.ok(!ign.includes(g), g);
    assert.equal(grupoPermitido(g, "lente"), true, g);
  }
  assert.deepEqual(gruposIgnorados("luneta", false), []);
  assert.deepEqual(gruposIgnorados("luneta", true), ["selo"]);
  assert.deepEqual(gruposForaDoPlano({ uf: ["MG"], quartosMin: 2, areaMax: 90, notaLocalMin: 70 }, "lente"), ["area", "quartos", "notaLocal"]);
  assert.deepEqual(gruposForaDoPlano({ uf: ["MG"], quartosMin: 2 }, "luneta"), []);
  assert.equal(recursoDoGrupo("quartos"), "filtrosAvancados");
  assert.equal(recursoDoGrupo("semTags"), "tags");
  assert.equal(recursoDoGrupo("notaLocal"), "localizacao");
  assert.equal(recursoDoGrupo("lance"), null);
  assert.deepEqual(filtrosEfetivos({ uf: ["MG"], quartosMin: 2, comFoto: true }, "lente", false), { uf: ["MG"] });
  assert.equal(ordemEfetiva("localizacao", "lente", false), "desagio");
  assert.equal(ordemEfetiva("m2-asc", "lente", false), "m2-asc");
});

test("lerPlano: sem valor, o padrão da demonstração; valor presente vale pelo nome; desconhecido vale como o Lente", () => {
  assert.equal(lerPlano(undefined), "luneta");
  assert.equal(lerPlano(null), "luneta");
  assert.equal(lerPlano(undefined, "lente"), "lente", "o padrão é de quem chama (com login, o plano da sessão)");
  for (const v of ["lente", "LENTE", "Lente", " lente", "lente ", ["lente", "luneta"]]) assert.equal(lerPlano(v), "lente", JSON.stringify(v));
  for (const v of ["luneta", "LUNETA", " Luneta ", ["luneta"]]) assert.equal(lerPlano(v), "luneta", JSON.stringify(v));
  // valor explícito desconhecido nunca abre tudo (R4-VAZ-07)
  for (const v of ["", "telescopio", "luneta2", "x", []]) assert.equal(lerPlano(v), "lente", JSON.stringify(v));
});

