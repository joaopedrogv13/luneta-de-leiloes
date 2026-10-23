import { test } from "node:test";
import assert from "node:assert/strict";
import { buscar, criarIndice } from "./consulta";
import { filtrosDoPlano, filtrosForaDoPlano, ordemDoPlano } from "./planos";
import type { Filtros, ImovelResumo } from "./tipos";
import { contarFiltros, escreverBusca, lerBusca, type EstadoBusca } from "./url";

const COMPLETO: EstadoBusca = {
  filtros: {
    q: "apartamento centro",
    uf: ["MG", "SP"],
    cidade: ["MG|Uberlândia", "SP|São Paulo"],
    bairro: ["MG|Uberlândia|Santa Mônica"],
    tipo: ["apartamento", "casa"],
    lanceMin: 50000,
    lanceMax: 300000,
    avaliacaoMin: 100000,
    avaliacaoMax: 900000,
    desagioMin: -10,
    desagioMax: 80,
    lanceM2Min: 500,
    lanceM2Max: 4000,
    areaMin: 40,
    areaMax: 120.5,
    quartosMin: 2,
    vagasMin: 1,
    modalidade: ["leilao", "venda_direta"],
    praca: ["2", "nd"],
    dataDe: "2026-10-14",
    dataAte: "2026-12-31",
    financiamento: true,
    fgts: false,
    parcelamento: true,
    ocupacao: ["desocupado", "nd"],
    natureza: ["judicial"],
    fonte: ["caixa_csv"],
    comFoto: true,
    comTags: ["desocupado"],
    semTags: ["ocupado", "acao-judicial"],
    selo: [3, 2],
    notaLocalMin: 60,
    bbox: [-44.06, -20.03, -43.85, -19.8],
  },
  ordem: "lance-asc",
  pagina: 3,
  vista: "cards",
  mapa: false,
  plano: "lente",
  camera: { lat: -19.91, lon: -43.93, zoom: 12.5 },
};

test("ida e volta: escrever e ler devolve o mesmo estado (todos os filtros)", () => {
  const p = escreverBusca(COMPLETO);
  assert.deepEqual(lerBusca(p), COMPLETO);
  assert.deepEqual(lerBusca(new URLSearchParams(p.toString())), COMPLETO, "pela string da URL");
  // formato de searchParams do Next (Record com arrays)
  const registro: Record<string, string | string[]> = {};
  for (const [k, v] of p) registro[k] = k in registro ? [registro[k]!].flat().concat(v) : v;
  assert.deepEqual(lerBusca(registro), COMPLETO);
});

test("padrões ficam fora da URL e voltam ao ler", () => {
  const vazio = escreverBusca({ filtros: {}, ordem: "desagio", pagina: 1, plano: "luneta", vista: null, mapa: null });
  assert.equal(vazio.toString(), "");
  assert.deepEqual(lerBusca(vazio), { filtros: {}, ordem: "desagio", pagina: 1, vista: null, mapa: null, plano: "luneta", camera: null });
  assert.equal(escreverBusca({ conjunto: "previa", filtros: { uf: ["MG"] } }).toString(), "conjunto=previa&uf=MG");
});

test("valores inválidos são ignorados, nunca quebram", () => {
  const e = lerBusca(
    new URLSearchParams("uf=ZZ&uf=mg&tipo=castelo&lanceMin=abc&areaMax=1e20&ordem=xyz&pagina=-4&vista=grade&selo=7&cidade=MG&cidade=XX|Y&dataDe=14/10/2026&financiamento=talvez"),
  );
  assert.deepEqual(e.filtros, {});
  assert.equal(e.ordem, "desagio");
  assert.equal(e.pagina, 1);
  assert.equal(e.vista, null);
  assert.deepEqual(lerBusca(new URLSearchParams("uf=MG,SP&tipo=casa,,terreno")).filtros, { uf: ["MG", "SP"], tipo: ["casa", "terreno"] }, "vírgula também separa");
});

test("faixa ao contrário num link: as pontas trocam (URL, pílula e campos iguais ao que o servidor aplica)", () => {
  const e = lerBusca(new URLSearchParams("lanceMin=300000&lanceMax=100000&desagioMin=80&desagioMax=20&areaMin=50"));
  assert.deepEqual(e.filtros, { lanceMin: 100000, lanceMax: 300000, desagioMin: 20, desagioMax: 80, areaMin: 50 });
});

test("contarFiltros: faixa conta uma vez", () => {
  const f: Filtros = { lanceMin: 1, lanceMax: 2, uf: ["MG"], q: "x", financiamento: false };
  assert.equal(contarFiltros(f), 4);
  // 12 listas + 5 faixas + quartos + vagas + nota de localização + datas + 4 sim/não + texto
  assert.equal(contarFiltros(COMPLETO.filtros), 26);
});

test("nota de localização: notaLocalMin (1 a 100, inteiro) e a ordem \"localizacao\" na URL", () => {
  const e = lerBusca(new URLSearchParams("notaLocalMin=70&ordem=localizacao"));
  assert.equal(e.filtros.notaLocalMin, 70);
  assert.equal(e.ordem, "localizacao");
  assert.equal(escreverBusca(e).toString(), "notaLocalMin=70&ordem=localizacao");
  assert.equal(lerBusca(new URLSearchParams("notaLocalMin=65.4")).filtros.notaLocalMin, 65);
  // 0,4 arredondava para 0: o filtro ficava "nota 0+" na pílula e contava como filtro sem filtrar nada
  assert.equal(lerBusca(new URLSearchParams("notaLocalMin=100.4")).filtros.notaLocalMin, 100);
  for (const ruim of ["0", "0.4", "-5", "150", "abc", ""]) {
    assert.equal(lerBusca(new URLSearchParams(`notaLocalMin=${ruim}`)).filtros.notaLocalMin, undefined, ruim);
  }
  assert.equal(contarFiltros({ notaLocalMin: 60 }), 1);
});

test("link da Luneta aberto no Lente: a URL guarda os filtros avançados (voltam na Luneta), a busca não os usa", () => {
  const url = "plano=lente&uf=SP&quartosMin=2&areaMin=50&modalidade=leilao&comFoto=1&semTags=ocupado&notaLocalMin=70&ordem=localizacao";
  const e = lerBusca(new URLSearchParams(url));
  assert.equal(e.plano, "lente");
  assert.deepEqual(e.filtros, { uf: ["SP"], areaMin: 50, quartosMin: 2, modalidade: ["leilao"], comFoto: true, semTags: ["ocupado"], notaLocalMin: 70 });
  assert.equal(e.ordem, "localizacao");
  // a URL reescrita não perde nada (trocar para a Luneta traz tudo de volta)
  assert.deepEqual(lerBusca(escreverBusca(e)), e);
  assert.deepEqual(lerBusca(escreverBusca({ ...e, plano: "luneta" })).filtros, e.filtros);
  // o que vale no Lente (o servidor busca só com isto; a tela avisa "este filtro é do plano Luneta")
  assert.deepEqual(filtrosDoPlano(e.filtros, e.plano), { uf: ["SP"] });
  assert.deepEqual(filtrosForaDoPlano(e.filtros, e.plano), ["areaMin", "quartosMin", "modalidade", "comFoto", "semTags", "notaLocalMin"]);
  assert.equal(ordemDoPlano(e.ordem, e.plano), "desagio");
  // e a busca de verdade: SP sem os filtros avançados
  const ix = criarIndice([
    { ...BASE, id: "caixa-1", uf: "SP", quartos: 1, area: 30 },
    { ...BASE, id: "caixa-2", uf: "SP", quartos: 3, area: 90 },
    { ...BASE, id: "caixa-3", uf: "MG", quartos: 3, area: 90 },
  ]);
  const b = { conjunto: "previa" as const, plano: e.plano, filtros: e.filtros, ordem: e.ordem, pagina: 1 };
  assert.deepEqual(buscar(ix, b).itens.map((i) => i.id).sort(), ["caixa-1", "caixa-2"]);
  assert.deepEqual(buscar(ix, { ...b, plano: "luneta", filtros: { uf: ["SP"], quartosMin: 2 } }).itens.map((i) => i.id), ["caixa-2"]);
});

/** Imóvel mínimo para a busca acima. */
const BASE: ImovelResumo = {
  id: "x", titulo: "Apartamento", tipo: "apartamento", uf: "SP", cidade: "São Paulo", bairro: "Centro", lat: null, lon: null, precisaoGeo: null,
  area: 50, areaTerreno: null, quartos: 2, vagas: null, avaliacao: 200000, lance: 100000, desagio: 50, lanceM2: 2000, avaliacaoM2: 4000,
  modalidade: "leilao", modalidadeFonte: null, praca: null, dataPraca: null, financiamento: null, fgts: null, parcelamento: null, ocupacao: null,
  judicial: null, fonte: { id: "caixa_csv", nome: "Caixa" }, foto: "https://x.test/f.jpg", totalFotos: 1, selo: 0, seloPendente: false, tags: [],
  coletadoEm: "2026-10-12", notaLocal: null,
};

test("plano na URL: LENTE, espaço, vazio ou desconhecido ficam no Lente; sem o parâmetro, a Luneta (R4-VAZ-07)", () => {
  for (const q of ["plano=LENTE", "plano=Lente", "plano=lente%20", "plano=%20lente", "plano=", "plano=telescopio", "plano=lente&plano=luneta"]) {
    assert.equal(lerBusca(new URLSearchParams(q)).plano, "lente", q);
    assert.equal(lerBusca({ plano: new URLSearchParams(q).getAll("plano") }).plano, "lente", q + " (searchParams do Next)");
  }
  assert.equal(lerBusca(new URLSearchParams("plano=luneta")).plano, "luneta");
  assert.equal(lerBusca(new URLSearchParams("uf=SP")).plano, "luneta");
  assert.equal(lerBusca({}).plano, "luneta");
});

test("vista de mapa: vista=mapa, a câmera (centro e zoom) e a área do mapa (bbox) na URL", () => {
  const e = lerBusca(new URLSearchParams("vista=mapa&centro=-23.55052,-46.633308&zoom=12.25&bbox=-46.8,-23.7,-46.4,-23.4&uf=SP"));
  assert.equal(e.vista, "mapa");
  assert.deepEqual(e.camera, { lat: -23.55052, lon: -46.633308, zoom: 12.25 });
  assert.deepEqual(e.filtros, { uf: ["SP"], bbox: [-46.8, -23.7, -46.4, -23.4] });
  // 5 casas (~1 m) e sem zeros à direita: a URL fica curta a cada arrasto
  assert.equal(
    escreverBusca(e).toString(),
    "uf=SP&bbox=-46.8%2C-23.7%2C-46.4%2C-23.4&vista=mapa&centro=-23.55052%2C-46.63331&zoom=12.25",
  );
  assert.deepEqual(escreverBusca({ filtros: { bbox: [-46.123456789, -23.5, -46.1, -23.4] } }).get("bbox"), "-46.12346,-23.5,-46.1,-23.4");
  // a área não conta como filtro do painel (tem a chave "Buscar ao mover o mapa")
  assert.equal(contarFiltros({ bbox: [-46.8, -23.7, -46.4, -23.4] }), 0);
});

test("vista de mapa: câmera e área inválidas são ignoradas, nunca quebram", () => {
  for (const ruim of ["", "1,2,3", "a,b,c,d", "-46,-23,-47,-22", "-46,-22,-45,-23", "-200,-23,-45,-22", "-46,-95,-45,-22", "-46,-23,-46,-22", "1,2,3,4,5", ",-23,-45,-22"]) {
    assert.equal(lerBusca(new URLSearchParams({ bbox: ruim })).filtros.bbox, undefined, ruim);
  }
  for (const q of ["centro=-23.5,-46.6", "zoom=12", "centro=-23.5&zoom=12", "centro=abc,def&zoom=3", "centro=-91,0&zoom=3", "centro=-23,-46&zoom=30", "centro=-23,-46&zoom=-1", "centro=1,2,3&zoom=4"]) {
    assert.equal(lerBusca(new URLSearchParams(q)).camera, null, q);
  }
  assert.equal(lerBusca(new URLSearchParams("vista=mapas")).vista, null);
});

test("área do mapa vale nos dois planos (não é filtro avançado)", () => {
  const f: Filtros = { uf: ["SP"], bbox: [-47, -24, -46, -23] };
  assert.deepEqual(filtrosDoPlano(f, "lente"), f);
  assert.deepEqual(filtrosForaDoPlano(f, "lente"), []);
});
