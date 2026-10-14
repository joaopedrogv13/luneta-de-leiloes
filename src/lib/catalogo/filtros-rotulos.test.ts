import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  arredondarBonito,
  chaveFiltros,
  definirBairros,
  definirCidades,
  definirUfs,
  filtrosEfetivos,
  filtrosIguais,
  formatarDigitado,
  grupoAtivo,
  lerNumeroDigitado,
  limparVazios,
  mascararDigitando,
  nomeBairro,
  nomeCidade,
  ordemEfetiva,
  pilulas,
  removerFiltro,
  removerGrupos,
  resumoBotao,
  textoData,
  textoFaixa,
  valorCurto,
} from "./filtros-rotulos";
import type { Filtros } from "./tipos";

/** Os rótulos usam espaço que não quebra entre "R$" e o valor; nos testes, comparamos com espaço comum. */
const comum = <T,>(s: T): T => (typeof s === "string" ? (s.replace(/\u00a0/g, " ") as T) : s);
const rotulos = (f: Filtros) => pilulas(f).map((p) => comum(p.rotulo));

describe("pílulas", () => {
  it("dá os textos do combinado com o dono", () => {
    assert.deepEqual(rotulos({ uf: ["MG"] }), ["MG"]);
    assert.deepEqual(rotulos({ cidade: ["MG|Uberlândia"] }), ["Uberlândia/MG"]);
    assert.deepEqual(rotulos({ tipo: ["apartamento", "casa"] }), ["Apartamento, Casa"]);
    assert.deepEqual(rotulos({ lanceMax: 300_000 }), ["Lance até R$ 300 mil"]);
    assert.deepEqual(rotulos({ desagioMin: 30 }), ["Deságio ≥ 30%"]);
    assert.deepEqual(rotulos({ quartosMin: 2 }), ["2+ quartos"]);
    assert.deepEqual(rotulos({ praca: ["2"] }), ["Praça: 2ª"]);
    assert.deepEqual(rotulos({ semTags: ["ocupado"] }), ["Sem: Ocupado"]);
  });

  it("escreve faixas com mínimo, máximo ou os dois", () => {
    assert.deepEqual(rotulos({ lanceMin: 100_000 }), ["Lance a partir de R$ 100 mil"]);
    assert.deepEqual(rotulos({ lanceMin: 100_000, lanceMax: 1_500_000 }), ["Lance de R$ 100 mil a R$ 1,5 mi"]);
    assert.deepEqual(rotulos({ avaliacaoMax: 2_000_000 }), ["Avaliação até R$ 2 mi"]);
    assert.deepEqual(rotulos({ desagioMin: 30, desagioMax: 60 }), ["Deságio de 30% a 60%"]);
    // deságio negativo = lance acima da avaliação: em palavras, nunca "−5%" (que nos cartões quer dizer desconto)
    assert.deepEqual(rotulos({ desagioMax: -5 }), ["Lance 5% ou mais acima da avaliação"]);
    assert.deepEqual(rotulos({ desagioMin: -10 }), ["Lance até 10% acima da avaliação"]);
    assert.deepEqual(rotulos({ desagioMin: -10, desagioMax: 20 }), ["De 10% acima a 20% abaixo da avaliação"]);
    assert.deepEqual(rotulos({ desagioMax: 40 }), ["Deságio ≤ 40%"]);
    assert.deepEqual(rotulos({ lanceM2Max: 2000 }), ["Lance por m² até R$ 2 mil"]);
    assert.deepEqual(rotulos({ areaMin: 50, areaMax: 120 }), ["Área de 50 a 120 m²"]);
    assert.deepEqual(rotulos({ areaMin: 50 }), ["Área a partir de 50 m²"]);
  });

  it("cobre todos os grupos, na ordem da tela", () => {
    const f: Filtros = {
      q: "piscina",
      uf: ["MG"],
      cidade: ["MG|Uberlândia"],
      bairro: ["MG|Uberlândia|Centro"],
      tipo: ["casa"],
      vagasMin: 1,
      modalidade: ["leilao", "venda_online"],
      praca: ["1", "nd"],
      dataDe: "2026-10-14",
      dataAte: "2026-10-21",
      financiamento: true,
      fgts: false,
      parcelamento: true,
      ocupacao: ["desocupado", "nd"],
      natureza: ["judicial"],
      fonte: ["caixa_csv"],
      comFoto: true,
      comTags: ["desocupado"],
      selo: [2, 3],
    };
    assert.deepEqual(rotulos(f), [
      "Busca: “piscina”",
      "MG",
      "Uberlândia/MG",
      "Centro, Uberlândia/MG",
      "Casa",
      "1+ vaga",
      "Leilão, Venda online",
      "Praça: 1ª, não informada",
      "Praça de 14/10 a 21/10/2026",
      "Aceita financiamento",
      "Sem FGTS",
      "Aceita parcelamento",
      "Ocupação: desocupado, não informada",
      "Judicial",
      "Fonte: Caixa",
      "Com foto",
      "Com: Desocupado",
      "Selo: Alvo, Na Mira",
    ]);
  });

  it("junta listas longas e usa os nomes das facetas", () => {
    assert.deepEqual(rotulos({ tipo: ["apartamento", "casa", "terreno", "rural"] }), ["Apartamento, Casa e mais 2"]);
    assert.deepEqual(rotulos({ uf: ["MG", "SP", "RJ", "BA"] }), ["MG, SP e mais 2"]);
    assert.equal(pilulas({ uf: ["MG", "SP", "RJ", "BA"] })[0].valor, undefined);
    assert.equal(pilulas({ uf: ["MG", "SP"] })[1].valor, "SP");
    const nomes = { fonte: [{ valor: "x", rotulo: "Leiloeiro X", total: 3 }], tags: [{ valor: "t", rotulo: "Tag T", total: 1, severidade: "grave" as const }] };
    assert.deepEqual(pilulas({ fonte: ["x"], semTags: ["t", "sem-nome"] }, nomes).map((p) => p.rotulo), ["Fonte: Leiloeiro X", "Sem: Tag T", "Sem: sem-nome"]);
    assert.deepEqual(rotulos({ natureza: ["nd"] }), ["Natureza: não informada"]);
    assert.deepEqual(rotulos({ natureza: ["judicial", "extrajudicial"] }), ["Natureza: judicial, extrajudicial"]);
    assert.deepEqual(rotulos({ dataDe: "2026-12-20", dataAte: "2027-01-10" }), ["Praça de 20/12/2026 a 10/01/2027"]);
    assert.deepEqual(rotulos({ comFoto: false, financiamento: false }), ["Sem financiamento", "Sem foto"]);
  });

  it("não mostra nada sem filtro", () => {
    assert.deepEqual(pilulas({}), []);
  });

  it("ids únicos", () => {
    const ps = pilulas({ uf: ["MG", "SP"], cidade: ["MG|A", "SP|B"], semTags: ["ocupado", "cota-parte"], comTags: ["desocupado"] });
    assert.equal(new Set(ps.map((p) => p.id)).size, ps.length);
  });
});

describe("remover filtro", () => {
  it("tira o grupo inteiro ou um valor da lista", () => {
    assert.deepEqual(removerFiltro({ lanceMin: 1, lanceMax: 2, uf: ["MG"] }, "lance"), { uf: ["MG"] });
    assert.deepEqual(removerFiltro({ tipo: ["casa", "terreno"] }, "tipo", "casa"), { tipo: ["terreno"] });
    assert.deepEqual(removerFiltro({ tipo: ["casa"] }, "tipo", "casa"), {});
    assert.deepEqual(removerFiltro({ selo: [1, 3] }, "selo", "3"), { selo: [1] });
    assert.deepEqual(removerFiltro({ dataDe: "2026-01-01", dataAte: "2026-02-01" }, "data"), {});
    assert.deepEqual(removerFiltro({ financiamento: false }, "financiamento"), {});
  });

  it("não muda o objeto original", () => {
    const f: Filtros = { uf: ["MG", "SP"], lanceMax: 5 };
    const copia = structuredClone(f);
    removerFiltro(f, "uf", "MG");
    removerFiltro(f, "lance");
    assert.deepEqual(f, copia);
  });

  it("remove cidades e bairros do estado que saiu", () => {
    const f: Filtros = { uf: ["MG", "SP"], cidade: ["MG|Uberlândia", "SP|Campinas"], bairro: ["MG|Uberlândia|Centro", "SP|Campinas|Cambuí"] };
    assert.deepEqual(removerFiltro(f, "uf", "MG"), { uf: ["SP"], cidade: ["SP|Campinas"], bairro: ["SP|Campinas|Cambuí"] });
    assert.deepEqual(removerFiltro(f, "cidade", "SP|Campinas"), { uf: ["MG", "SP"], cidade: ["MG|Uberlândia"], bairro: ["MG|Uberlândia|Centro"] });
    assert.deepEqual(removerFiltro(f, "uf"), {});
  });

  it("remove grupos de um botão rápido", () => {
    assert.deepEqual(removerGrupos({ quartosMin: 2, vagasMin: 1, uf: ["MG"] }, ["quartos", "vagas"]), { uf: ["MG"] });
  });
});

describe("lugares em cascata", () => {
  it("cidade nova leva o estado quando já há estados escolhidos", () => {
    assert.deepEqual(definirCidades({ uf: ["SP"] }, ["MG|Uberlândia"]), { uf: ["SP", "MG"], cidade: ["MG|Uberlândia"] });
    assert.deepEqual(definirCidades({}, ["MG|Uberlândia"]), { cidade: ["MG|Uberlândia"] });
  });

  it("bairro novo leva a cidade quando já há cidades", () => {
    assert.deepEqual(definirBairros({ cidade: ["SP|Campinas"] }, ["MG|Uberlândia|Centro"]), {
      cidade: ["SP|Campinas", "MG|Uberlândia"],
      bairro: ["MG|Uberlândia|Centro"],
    });
  });

  it("estado sai: cidades e bairros dele saem", () => {
    assert.deepEqual(definirUfs({ uf: ["MG"], cidade: ["MG|Uberlândia"], bairro: ["MG|Uberlândia|Centro"] }, ["SP"]), { uf: ["SP"] });
    assert.deepEqual(definirUfs({ cidade: ["MG|Uberlândia"] }, ["SP"]), { uf: ["SP"], cidade: ["MG|Uberlândia"] });
  });

  it("nomes de lugar", () => {
    assert.equal(nomeCidade("MG|Uberlândia"), "Uberlândia/MG");
    assert.equal(nomeBairro("MG|Uberlândia|Centro"), "Centro, Uberlândia/MG");
  });
});

describe("comparação e limpeza", () => {
  it("ignora a ordem das listas e chaves vazias", () => {
    assert.ok(filtrosIguais({ uf: ["MG", "SP"] }, { uf: ["SP", "MG"], tipo: [] }));
    assert.ok(!filtrosIguais({ uf: ["MG"] }, { uf: ["SP"] }));
    assert.equal(chaveFiltros({}), "");
    assert.deepEqual(limparVazios({ q: "", uf: [], lanceMin: undefined, comFoto: false }), { comFoto: false });
    assert.ok(grupoAtivo({ comFoto: false }, "comFoto"));
    assert.ok(!grupoAtivo({ uf: [] }, "uf"));
  });
});

describe("botões rápidos", () => {
  it("resume o valor escolhido", () => {
    assert.equal(resumoBotao({}, "uf"), null);
    assert.equal(resumoBotao({ uf: ["MG", "SP"] }, "uf"), "MG, SP");
    assert.equal(resumoBotao({ uf: ["MG", "SP", "RJ", "BA"] }, "uf"), "4 estados");
    assert.equal(resumoBotao({ cidade: ["MG|Uberlândia"] }, "cidade"), "Uberlândia");
    assert.equal(resumoBotao({ cidade: ["MG|Uberlândia", "MG|Uberaba"], bairro: ["MG|Uberaba|Centro"] }, "cidade"), "2 cidades · 1 bairro");
    assert.equal(resumoBotao({ tipo: ["apartamento", "casa"] }, "tipo"), "Apartamento +1");
    assert.equal(comum(resumoBotao({ lanceMax: 300_000 }, "preco")), "Até R$ 300 mil");
    assert.equal(comum(resumoBotao({ lanceMin: 100_000, lanceMax: 1_500_000 }, "preco")), "R$ 100 mil a 1,5 mi");
    assert.equal(comum(resumoBotao({ lanceMin: 100_000 }, "preco")), "A partir de R$ 100 mil");
    assert.equal(resumoBotao({ desagioMin: 40 }, "desagio"), "Deságio ≥ 40%");
    assert.equal(resumoBotao({ quartosMin: 2, vagasMin: 1 }, "quartos"), "2+ quartos · 1+ vaga");
  });
});

describe("números digitados", () => {
  it("lê o jeito brasileiro de escrever", () => {
    assert.equal(lerNumeroDigitado("300.000"), 300_000);
    assert.equal(lerNumeroDigitado("R$ 300.000"), 300_000);
    assert.equal(lerNumeroDigitado("300 mil"), 300_000);
    assert.equal(lerNumeroDigitado("300k"), 300_000);
    assert.equal(lerNumeroDigitado("1,5 mi"), 1_500_000);
    assert.equal(lerNumeroDigitado("1.5 mi"), 1_500_000);
    assert.equal(lerNumeroDigitado("2 milhões"), 2_000_000);
    assert.equal(lerNumeroDigitado("R$ 2.500,50"), 2500.5);
    assert.equal(lerNumeroDigitado("-10%"), -10);
    assert.equal(lerNumeroDigitado("−10"), -10);
    assert.equal(lerNumeroDigitado("1.200 m²"), 1200);
    assert.equal(lerNumeroDigitado(""), undefined);
    assert.equal(lerNumeroDigitado("abc"), undefined);
    assert.equal(lerNumeroDigitado("12 xyz"), undefined);
  });

  it("formata e mascara enquanto digita", () => {
    assert.equal(formatarDigitado(300000), "300.000");
    assert.equal(formatarDigitado(-12), "-12");
    assert.equal(formatarDigitado(undefined), "");
    assert.equal(mascararDigitando("3000"), "3.000");
    assert.equal(mascararDigitando("30.0000"), "300.000");
    assert.equal(mascararDigitando("0012"), "12");
    assert.equal(mascararDigitando("300 mil"), "300 mil");
    // o espaço antes de "mil" não some enquanto digita
    assert.equal(mascararDigitando("3000 "), "3.000 ");
    assert.equal(mascararDigitando("-15", true), "-15");
    assert.equal(mascararDigitando("-", true), "-");
    assert.equal(mascararDigitando(""), "");
  });

  it("arredonda para números redondos", () => {
    assert.equal(arredondarBonito(123_456, "moeda"), 125_000);
    assert.equal(arredondarBonito(7_321, "moeda"), 7_500);
    assert.equal(arredondarBonito(1_234_567, "moeda"), 1_250_000);
    assert.equal(arredondarBonito(33.4, "pct"), 33);
    assert.equal(arredondarBonito(2_345, "moedaM2"), 2_350);
    assert.equal(arredondarBonito(87.6, "m2"), 88);
  });

  it("texto de faixa e de data", () => {
    assert.equal(textoFaixa(undefined, undefined, "moeda"), null);
    assert.equal(comum(textoFaixa(undefined, 2500, "moedaM2")), "até R$ 2,5 mil/m²");
    assert.equal(textoFaixa(-10, undefined, "pct"), "≥ −10%");
    assert.equal(textoFaixa(30, undefined, "desagio"), "Deságio ≥ 30%");
    assert.equal(valorCurto(-50, "desagio"), "50% acima");
    assert.equal(valorCurto(100, "desagio"), "100% abaixo");
    assert.equal(valorCurto(0, "desagio"), "na avaliação");
    assert.equal(textoData(undefined, undefined), null);
    assert.equal(textoData("2026-10-14"), "Praça a partir de 14/10/2026");
    assert.equal(textoData(undefined, "2026-10-21"), "Praça até 21/10/2026");
  });
});

describe("o que vale em cada plano", () => {
  it("Lente ignora tags e selo; selos desligados ignoram o selo", () => {
    const f: Filtros = { uf: ["MG"], semTags: ["ocupado"], comTags: ["desocupado"], selo: [3] };
    assert.deepEqual(filtrosEfetivos(f, "lente", false), { uf: ["MG"] });
    assert.deepEqual(filtrosEfetivos(f, "luneta", true), { uf: ["MG"], semTags: ["ocupado"], comTags: ["desocupado"] });
    assert.equal(filtrosEfetivos(f, "luneta", false), f);
    assert.equal(ordemEfetiva("alertas", "lente", false), "desagio");
    assert.equal(ordemEfetiva("selo", "luneta", true), "desagio");
    assert.equal(ordemEfetiva("alertas", "luneta", true), "alertas");
    assert.equal(ordemEfetiva("lance-asc", "lente", true), "lance-asc");
  });
});
