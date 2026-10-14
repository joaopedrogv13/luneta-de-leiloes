import { test } from "node:test";
import assert from "node:assert/strict";
import type { Filtros } from "./tipos";
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
  },
  ordem: "lance-asc",
  pagina: 3,
  vista: "cards",
  mapa: false,
  plano: "lente",
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
  assert.deepEqual(lerBusca(vazio), { filtros: {}, ordem: "desagio", pagina: 1, vista: null, mapa: null, plano: "luneta" });
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

test("contarFiltros: faixa conta uma vez", () => {
  const f: Filtros = { lanceMin: 1, lanceMax: 2, uf: ["MG"], q: "x", financiamento: false };
  assert.equal(contarFiltros(f), 4);
  // 12 listas + 5 faixas + quartos + vagas + datas + 4 sim/não + texto
  assert.equal(contarFiltros(COMPLETO.filtros), 25);
});
