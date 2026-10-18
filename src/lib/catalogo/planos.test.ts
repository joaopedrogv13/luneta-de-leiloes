/**
 * Planos: o que o Lente não vê (pode, travas, página do imóvel com o plano aplicado) e a nota de localização na busca
 * (ordem "localizacao", filtro notaLocalMin, notaLocal fora do Lente).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buscar, criarIndice, paraPlano } from "./consulta";
import { ordemEfetiva, gruposIgnorados, pilulas } from "./filtros-rotulos";
import { aplicarPlanoPagina, FILTROS_LENTE, pode, RECURSOS, RECURSOS_LUNETA, travasDo } from "./planos";
import type { Busca, ImovelDetalhe, ImovelResumo, LocalizacaoImovel, PaginaImovel } from "./tipos";

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
});
