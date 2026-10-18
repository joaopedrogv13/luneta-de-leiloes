import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lerCsv } from "../util/csv.ts";
import { dentroDoBrasil } from "./coordenadas.ts";
import { medirCasamento } from "./medir.ts";
import { ARQUIVO_APELIDOS, CODIGO_UF, aplicarRaios, carregarTabela, lerRaios, montarTabela, tabelaPadrao, type Municipio } from "./municipios.ts";

const tabela = tabelaPadrao();

test("tabela do IBGE: 5.571 municípios, 27 capitais, códigos e sedes coerentes", () => {
  assert.equal(tabela.municipios.length, 5571);
  assert.equal(new Set(tabela.municipios.map((m) => m.codigo_ibge)).size, 5571);
  const capitais = tabela.municipios.filter((m) => m.capital);
  assert.equal(capitais.length, 27);
  assert.equal(new Set(capitais.map((m) => m.uf)).size, 27);
  for (const m of tabela.municipios) {
    assert.ok(m.codigo_ibge.startsWith(CODIGO_UF[m.uf]), `${m.nome}: código ${m.codigo_ibge} fora da UF ${m.uf}`);
    assert.ok(dentroDoBrasil(m.lat, m.lon), `${m.nome}/${m.uf} fora do Brasil`);
  }
  assert.equal(tabela.porCodigo("5101837")?.nome, "Boa Esperança do Norte", "município criado em 2025");
  // Sedes corrigidas (correcoes.csv): o kelvins punha Cerro Azul/PR no oeste do estado.
  const cerroAzul = tabela.porCodigo("4105201");
  assert.ok(cerroAzul && cerroAzul.lon > -49.6 && cerroAzul.lon < -49.0, "Cerro Azul corrigido");
  assert.ok((tabela.porCodigo("1500602")?.raio_km ?? 0) > 700, "Altamira/PA tem raio de mais de 700 km");
});

test("cidades reais do CSV da Caixa de 08/10/2026 (grafias que não são o nome oficial)", () => {
  const casos: Array<[string, string, string, string]> = [
    ["RN", "ASSU", "2400208", "apelido"],
    ["PA", "SANTA ISABEL DO PARA", "1506500", "apelido"],
    ["RS", "SANT' ANA DO LIVRAMENTO", "4317103", "grafia"],
    ["PR", "ALEXANDRA", "4118204", "distrito"], // distrito de Paranaguá
    ["DF", "CEILANDIA", "5300108", "df"],
    ["DF", "TAGUATINGA", "5300108", "df"],
    ["MT", "MIRASSOL D'OESTE", "5105622", "nome"],
    ["RO", "ALTA FLORESTA D'OESTE", "1100015", "nome"],
    ["AL", "OLHO D'AGUA DAS FLORES", "2705705", "nome"],
    ["BA", "DIAS D'AVILA", "2910057", "nome"],
    ["GO", "SAO JOAO D'ALIANCA", "5220009", "nome"],
    ["PA", "TOME-ACU", "1508001", "nome"],
    ["RN", "CEARA-MIRIM", "2402600", "nome"],
    ["RS", "XANGRI-LA", "4323804", "nome"],
    ["RO", "JI-PARANA", "1100122", "nome"],
  ];
  for (const [uf, cidade, codigo, metodo] of casos) {
    const achado = tabela.encontrar(uf, cidade);
    assert.equal(achado?.municipio.codigo_ibge, codigo, `${cidade}/${uf}`);
    assert.equal(achado?.metodo, metodo, `${cidade}/${uf}: método`);
  }
  // As três que não casam: localidades fora da tabela; nenhum palpite.
  for (const [uf, cidade] of [["CE", "QUEIMADAS"], ["PE", "TERRA VERMELHA"], ["PA", "SAO LUIZ DO TAPAJOS"]] as const) {
    assert.equal(tabela.encontrar(uf, cidade), null, `${cidade}/${uf}`);
  }
});

test("taxa de casamento com as cidades do CSV completo da Caixa (21.226 linhas)", () => {
  const caminho = fileURLToPath(new URL("./fixtures/cidades_caixa_2026-10-08.csv", import.meta.url));
  const pares: Array<[string, string]> = [];
  for (const [uf, cidade, n] of lerCsv(readFileSync(caminho, "utf8")).slice(1)) {
    if (!uf || !cidade) continue;
    for (let i = 0; i < Number(n); i++) pares.push([uf, cidade]);
  }
  const m = medirCasamento(pares, tabela);
  assert.equal(m.linhas, 21226);
  assert.equal(m.cidades, 1161);
  assert.equal(m.linhasCasadas, 21223, "99,99% das linhas");
  assert.deepEqual(m.naoCasaram.map(([c]) => c).sort(), ["CE|QUEIMADAS", "PA|SAO LUIZ DO TAPAJOS", "PE|TERRA VERMELHA"]);
  assert.equal(m.porMetodo.nome, 21176);
});

test("variações de escrita e homônimos", () => {
  assert.equal(tabela.encontrar("", "São Paulo/SP")?.municipio.codigo_ibge, "3550308", "UF no texto da cidade");
  assert.equal(tabela.encontrar("sp", "  sao paulo ")?.municipio.codigo_ibge, "3550308");
  assert.equal(tabela.encontrar("RN", "Campo Grande")?.municipio.codigo_ibge, "2401305", "nome entre parênteses no IBGE");
  assert.equal(tabela.encontrar("RN", "Augusto Severo")?.municipio.codigo_ibge, "2401305");
  assert.equal(tabela.encontrar("MS", "Campo Grande")?.municipio.codigo_ibge, "5002704", "a UF separa homônimos");
  assert.equal(tabela.encontrar("SP", "Embu")?.municipio.nome, "Embu das Artes", "nome antigo");
  assert.equal(tabela.encontrar("SC", "Picarras")?.municipio.nome, "Balneário Piçarras");
  assert.equal(tabela.encontrar("XX", "São Paulo"), null, "UF inválida");
  assert.equal(tabela.encontrar("SP", ""), null);
});

test("grafias usuais fora do CSV da Caixa (revisão de 13/10/2026)", () => {
  const casos: Array<[string, string, string, string]> = [
    ["MA", "GOVERNADOR EDSON LOBAO", "2104552", "apelido"],
    ["RJ", "TRAJANO DE MORAIS", "3305901", "grafia"],
    ["MG", "GOUVEA", "3127602", "grafia"],
    ["SC", "ERVAL D OESTE", "4206702", "grafia"],
    ["SC", "ERVAL D'OESTE", "4206702", "grafia"],
    ["SP", "S J DOS CAMPOS", "3549904", "grafia"],
    ["SP", "S J DO RIO PRETO", "3549805", "grafia"],
    ["MG", "S J DEL REI", "3162500", "grafia"],
    ["SP", "SAO PAULO (CAPITAL)", "3550308", "nome"],
    ["RJ", "NITEROI RJ", "3303302", "nome"],
  ];
  for (const [uf, cidade, codigo, metodo] of casos) {
    const achado = tabela.encontrar(uf, cidade);
    assert.equal(achado?.municipio.codigo_ibge, codigo, `${cidade}/${uf}`);
    assert.equal(achado?.metodo, metodo, `${cidade}/${uf}: método`);
  }
  // "S J DO PIAUI": São José do Piauí e São João do Piauí existem; nenhuma leitura vence.
  assert.equal(tabela.encontrar("PI", "S J DO PIAUI"), null);
});

test("erro de digitação não casa sozinho; só vira sugestão", () => {
  // "Itupiranga" é do PA; no AM existe "Itapiranga" (1 letra de diferença). Casar seria erro.
  assert.equal(tabela.encontrar("AM", "Itupiranga"), null);
  assert.equal(tabela.sugerir("AM", "Itupiranga")?.nome, "Itapiranga");
  assert.equal(tabela.encontrar("SP", "Piracicapa"), null);
  assert.equal(tabela.sugerir("SP", "Piracicapa")?.nome, "Piracicaba");
  assert.equal(tabela.sugerir("SP", "Xyzwq"), null);
});

test("apelidos.csv: cada apelido aponta para o município certo e não colide com nome oficial", () => {
  const apelidos = lerCsv(readFileSync(ARQUIVO_APELIDOS, "utf8"), { separador: "," }).slice(1).filter((l) => l.length > 2);
  assert.ok(apelidos.length >= 30);
  for (const [uf = "", nome = "", codigo = ""] of apelidos) {
    const achado = tabela.encontrar(uf, nome);
    assert.equal(achado?.municipio.codigo_ibge, codigo, `${nome}/${uf}`);
    assert.equal(achado?.metodo, "apelido", `${nome}/${uf} deve casar como apelido, não como outro município`);
  }
});

test("chave ambígua na UF não casa; distrito nunca vence município", () => {
  const m = (codigo_ibge: string, nome: string, uf: Municipio["uf"] = "SP"): Municipio => ({ codigo_ibge, uf, nome, lat: -23, lon: -46, capital: false, raio_km: 10 });
  const t = montarTabela({
    municipios: [m("3500001", "Santa Luzia"), m("3500002", "Santa Lúcia"), m("3500003", "Bom Jardim"), m("3500004", "Alvorada")],
    distritos: [
      { codigo_distrito: "350000305", codigo_ibge: "3500003", nome: "Alvorada" },
      { codigo_distrito: "350000310", codigo_ibge: "3500003", nome: "Vila Nova" },
      { codigo_distrito: "350000405", codigo_ibge: "3500004", nome: "Vila Nova" },
      { codigo_distrito: "350000410", codigo_ibge: "3500004", nome: "Capão" },
    ],
  });
  assert.equal(t.encontrar("SP", "Santa Luzia")?.municipio.codigo_ibge, "3500001");
  assert.equal(t.encontrar("SP", "Santa Lúcia")?.municipio.codigo_ibge, "3500002");
  assert.equal(t.encontrar("SP", "SANTA LUSIA"), null, "fonética igual para os dois: ambígua");
  assert.equal(t.encontrar("SP", "Alvorada")?.municipio.codigo_ibge, "3500004", "município vence distrito homônimo");
  assert.equal(t.encontrar("SP", "Vila Nova"), null, "distrito com o mesmo nome em dois municípios");
  assert.deepEqual([t.encontrar("SP", "CAPAO")?.municipio.codigo_ibge, t.encontrar("SP", "CAPAO")?.metodo], ["3500004", "distrito"]);
  assert.throws(() => montarTabela({ municipios: [m("3500001", "A")], apelidos: [{ uf: "SP", nome: "B", codigo_ibge: "9999999", tipo: "", observacao: "" }] }), /inexistente/);
});

test("raios-cnefe.csv: o raio medido no CNEFE vale quando a malha fica curta (Rio de Janeiro)", () => {
  // malha simplificada: 19 km; Santa Cruz e Sepetiba ficam a mais de 50 km do Centro
  assert.ok((tabela.porCodigo("3304557")?.raio_km ?? 0) >= 50, "Rio de Janeiro com o raio do CNEFE");
  const semRaios = carregarTabela({ raios: null });
  assert.equal(semRaios.porCodigo("3304557")?.raio_km, 19, "sem o arquivo, fica o da malha");
  assert.equal(tabela.porCodigo("3550308")?.raio_km, semRaios.porCodigo("3550308")?.raio_km, "São Paulo não muda");
  const m: Municipio = { codigo_ibge: "3500001", uf: "SP", nome: "A", lat: -23, lon: -46, capital: false, raio_km: 30 };
  assert.equal(aplicarRaios([m], new Map([["3500001", 20]]))[0]?.raio_km, 30, "nunca diminui");
  assert.equal(aplicarRaios([{ ...m, raio_km: null }], new Map([["3500001", 20]]))[0]?.raio_km, 20);
  assert.throws(() => lerRaios([{ codigo_ibge: "123", raio_km: "5" }]), /linha 2/);
});

test("carregarTabela lê caminhos alternativos", () => {
  const t = carregarTabela();
  assert.equal(t.municipios.length, tabela.municipios.length);
});
