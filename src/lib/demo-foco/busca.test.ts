import { test } from "node:test";
import assert from "node:assert/strict";
import { METRO_PERTO, gerarImoveis } from "./dados";
import {
  GRUPOS,
  GRUPOS_LUNETA,
  LIMITES,
  barraDe,
  buscar,
  definirUfs,
  gruposAtivos,
  removerGrupo,
  resumoGrupo,
  sugestaoParaVazio,
  type FiltrosFoco,
  type GrupoFoco,
} from "./busca";

const LISTA = gerarImoveis();
const total = (f: FiltrosFoco) => buscar(LISTA, f).total;

test("sem filtro: os 150, do maior deságio para o menor", () => {
  const r = buscar(LISTA, {});
  assert.equal(r.total, 150);
  for (let k = 1; k < r.itens.length; k++) assert.ok(r.itens[k - 1].desagio >= r.itens[k].desagio);
  assert.equal(gruposAtivos({}).length, 0);
});

test("cada filtro corta o que deve", () => {
  const casos: [FiltrosFoco, (i: (typeof LISTA)[number]) => boolean][] = [
    [{ uf: ["SP", "RJ"] }, (i) => i.uf === "SP" || i.uf === "RJ"],
    [{ cidade: ["SP|Campinas"] }, (i) => i.cidade === "Campinas"],
    [{ tipo: ["casa", "terreno"] }, (i) => i.tipo === "casa" || i.tipo === "terreno"],
    [{ lanceMin: 200_000, lanceMax: 400_000 }, (i) => i.lance >= 200_000 && i.lance <= 400_000],
    [{ desagioMin: 40 }, (i) => i.desagio >= 40],
    [{ areaMax: 60 }, (i) => i.area <= 60],
    [{ praca: ["2"] }, (i) => i.praca === "2"],
    [{ quartosMin: 3 }, (i) => i.quartos !== null && i.quartos >= 3],
    [{ ocupacao: ["desocupado"] }, (i) => i.ocupacao === "desocupado"],
    [{ financiamento: true }, (i) => i.financiamento],
    [{ financiamento: false }, (i) => !i.financiamento],
    [{ notaMin: 60 }, (i) => i.nota !== null && i.nota >= 60],
    [{ metro: true }, (i) => i.metro !== null && i.metro <= METRO_PERTO],
  ];
  for (const [f, esperado] of casos) {
    const r = buscar(LISTA, f);
    assert.equal(r.total, LISTA.filter(esperado).length, JSON.stringify(f));
    assert.ok(r.total > 0 && r.total < 150, `${JSON.stringify(f)} filtra algo (${r.total})`);
  }
  // metrô: só nas capitais com metrô
  assert.ok(buscar(LISTA, { metro: true }).itens.every((i) => ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Brasília", "Recife", "Salvador", "Fortaleza"].includes(i.cidade)));
});

test("busca por texto sem acento e com várias palavras", () => {
  assert.equal(total({ q: "tatuape" }), LISTA.filter((i) => i.bairro === "Tatuapé").length);
  assert.ok(total({ q: "tatuape" }) > 0);
  assert.equal(total({ q: "SAO PAULO" }), total({ q: "são paulo" }), "sem acento e sem caixa");
  assert.ok(total({ q: "são paulo" }) >= LISTA.filter((i) => i.cidade === "São Paulo").length);
  // "são paulo" acha a cidade e o estado; "2 quartos" é dos quartos (não da "2ª praça")
  const r = buscar(LISTA, { q: "  sao paulo 2 quartos " });
  assert.ok(r.total > 0 && r.itens.every((i) => i.uf === "SP" && i.quartos === 2));
  assert.ok(r.itens.some((i) => i.cidade === "São Paulo") && r.itens.some((i) => i.cidade !== "São Paulo"));
  assert.equal(total({ q: "campinas 3 quartos" }), LISTA.filter((i) => i.cidade === "Campinas" && i.quartos === 3).length);
  assert.ok(total({ q: "bahia" }) === LISTA.filter((i) => i.uf === "BA").length, "o nome do estado também acha");
  assert.equal(total({ q: "zzz" }), 0);
  assert.equal(total({ q: "   " }), 150, "só espaços não filtra");
});

test("filtros juntos: E entre grupos, OU dentro do grupo", () => {
  const f: FiltrosFoco = { uf: ["SP", "MG"], tipo: ["apartamento"], praca: ["2"], desagioMin: 40 };
  assert.equal(total(f), LISTA.filter((i) => ["SP", "MG"].includes(i.uf) && i.tipo === "apartamento" && i.praca === "2" && i.desagio >= 40).length);
});

/** A contagem de cada opção é o total que a pessoa veria ao escolher só ela (com os outros filtros). */
test("contagens das opções: valem com os OUTROS filtros aplicados", () => {
  const filtros: FiltrosFoco[] = [{}, { uf: ["SP"] }, { tipo: ["casa"], praca: ["2"] }, { desagioMin: 30, metro: true }, { uf: ["RJ", "SP"], ocupacao: ["ocupado"], notaMin: 40 }];
  for (const f of filtros) {
    const { facetas } = buscar(LISTA, f);
    for (const uf of new Set(LISTA.map((i) => i.uf))) assert.equal(facetas.uf[uf] ?? 0, total({ ...f, uf: [uf] }), `uf ${uf} em ${JSON.stringify(f)}`);
    for (const t of ["apartamento", "casa", "comercial", "terreno"] as const) assert.equal(facetas.tipo[t], total({ ...f, tipo: [t] }), `tipo ${t}`);
    for (const p of ["1", "2", "unica"] as const) assert.equal(facetas.praca[p], total({ ...f, praca: [p] }), `praça ${p}`);
    for (const o of ["desocupado", "ocupado", "nao_informado"] as const) assert.equal(facetas.ocupacao[o], total({ ...f, ocupacao: [o] }), `ocupação ${o}`);
    for (const n of [1, 2, 3, 4]) assert.equal(facetas.quartos[n], total({ ...f, quartosMin: n }), `quartos ${n}+`);
    for (const t of [40, 60, 80]) assert.equal(facetas.nota[t], total({ ...f, notaMin: t }), `nota ${t}+`);
    assert.equal(facetas.financiamento, total({ ...f, financiamento: true }));
    assert.equal(facetas.metro, total({ ...f, metro: true }));
    for (const c of ["SP|São Paulo", "SP|Campinas", "RJ|Niterói"]) assert.equal(facetas.cidade[c] ?? 0, total({ ...f, cidade: [c] }), `cidade ${c}`);
    // histogramas: a soma das barras é o total sem a própria faixa
    for (const g of ["lance", "desagio", "area"] as const) {
      const h = facetas[g];
      assert.deepEqual(h.limites, [...LIMITES[g]]);
      assert.equal(h.totais.length, LIMITES[g].length - 1);
      assert.equal(
        h.totais.reduce((s, x) => s + x, 0),
        total(removerGrupo(f, g)),
        `histograma de ${g}`,
      );
    }
  }
});

test("barraDe: abaixo do 1º limite vai na 1ª barra, acima do último na última", () => {
  const l = [10, 20, 30, 40];
  assert.equal(barraDe(l, 5), 0);
  assert.equal(barraDe(l, 10), 0);
  assert.equal(barraDe(l, 20), 1);
  assert.equal(barraDe(l, 39.9), 2);
  assert.equal(barraDe(l, 40), 2);
  assert.equal(barraDe(l, 99), 2);
});

test("ordens", () => {
  const asc = buscar(LISTA, {}, "lance-asc").itens;
  for (let k = 1; k < asc.length; k++) assert.ok(asc[k - 1].lance <= asc[k].lance);
  const desc = buscar(LISTA, {}, "lance-desc").itens;
  assert.equal(desc[0].lance, Math.max(...LISTA.map((i) => i.lance)));
  const area = buscar(LISTA, {}, "area-desc").itens;
  assert.equal(area[0].area, Math.max(...LISTA.map((i) => i.area)));
  const loc = buscar(LISTA, {}, "localizacao").itens;
  const primeiroSemNota = loc.findIndex((i) => i.nota === null);
  assert.ok(primeiroSemNota > 0 && loc.slice(primeiroSemNota).every((i) => i.nota === null), "sem nota vai para o fim");
  assert.equal(loc[0].nota, Math.max(...LISTA.map((i) => i.nota ?? -1)));
  assert.deepEqual(
    buscar(LISTA, {}, "desagio").itens.map((i) => i.id),
    buscar([...LISTA].reverse(), {}, "desagio").itens.map((i) => i.id),
    "ordem estável, independente da ordem de entrada",
  );
});

test("estados: tirar um estado tira as cidades dele", () => {
  const f = definirUfs({ cidade: ["SP|Campinas", "RJ|Niterói"], tipo: ["casa"] }, ["RJ"]);
  assert.deepEqual(f, { cidade: ["RJ|Niterói"], tipo: ["casa"], uf: ["RJ"] });
  assert.deepEqual(definirUfs({ uf: ["RJ"], cidade: ["RJ|Niterói"] }, []), { cidade: ["RJ|Niterói"] });
  assert.deepEqual(definirUfs({ cidade: ["SP|Campinas"] }, ["MG"]), { uf: ["MG"] });
});

test("lista vazia: sugere tirar o filtro que mais devolve imóveis", () => {
  const f: FiltrosFoco = { uf: ["AM"], metro: true, tipo: ["apartamento"] };
  assert.equal(total(f), 0, "Manaus não tem metrô");
  const s = sugestaoParaVazio(LISTA, f);
  assert.ok(s);
  assert.equal(s.grupo, "uf", "sem o estado, sobram os apartamentos perto do metrô");
  assert.equal(s.total, total(removerGrupo(f, "uf")));
  assert.equal(sugestaoParaVazio(LISTA, {}), null);
});

test("resumos curtos dos filtros (botões e pílulas)", () => {
  const r = (f: FiltrosFoco, g: GrupoFoco) => resumoGrupo(f, g);
  assert.equal(r({}, "uf"), null);
  assert.equal(r({ uf: ["SP", "RJ"] }, "uf"), "SP, RJ");
  assert.equal(r({ uf: ["SP", "RJ", "MG", "BA"] }, "uf"), "SP, RJ, MG +1");
  assert.equal(r({ cidade: ["SP|Campinas", "SP|Santos", "RJ|Niterói"] }, "cidade"), "Campinas, Santos +1");
  assert.equal(r({ lanceMax: 300_000 }, "lance"), "Até R$ 300 mil");
  assert.equal(r({ desagioMin: 40 }, "desagio"), "Deságio ≥ 40%");
  assert.equal(r({ areaMin: 50, areaMax: 100 }, "area"), "Área de 50 a 100 m²");
  assert.equal(r({ quartosMin: 1 }, "quartos"), "1+ quarto");
  assert.equal(r({ quartosMin: 3 }, "quartos"), "3+ quartos");
  assert.equal(r({ praca: ["2"] }, "praca"), "2ª praça");
  assert.equal(r({ financiamento: true }, "financiamento"), "Aceita financiamento");
  assert.equal(r({ notaMin: 60 }, "nota"), "Nota 60+");
  assert.equal(r({ metro: true }, "metro"), "Metrô a até 1 km");
  assert.equal(r({ metro: false }, "metro"), null);
  assert.equal(r({ q: " tatuapé " }, "q"), "“tatuapé”");
  for (const g of GRUPOS) assert.equal(r({}, g), null, `${g} sem filtro`);
});

test("selo da Luneta: os filtros que não são do plano Lente (a regra do produto) e o metrô", () => {
  assert.deepEqual([...GRUPOS_LUNETA].sort(), ["area", "financiamento", "metro", "nota", "ocupacao", "praca", "quartos"]);
});

test("responde na hora: filtrar, ordenar e contar os 150 leva menos de 1 ms em média", () => {
  const f: FiltrosFoco = { uf: ["SP", "RJ", "MG"], desagioMin: 30, quartosMin: 2, q: "apartamento" };
  const t0 = performance.now();
  for (let k = 0; k < 300; k++) buscar(LISTA, { ...f, lanceMax: 200_000 + k * 1000 });
  const ms = (performance.now() - t0) / 300;
  assert.ok(ms < 1, `${ms.toFixed(3)} ms por busca`);
});
