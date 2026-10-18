/**
 * ITBI na página do imóvel: leitura e conferência dos arquivos, referências por rua/bairro/cidade, a tabela de
 * cobertura e, com os arquivos de verdade (base/saida/site/itbi), quantos imóveis da base casam.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { lerLista, pastaPadrao } from "./instantaneo";
import { areaComComum, coberturaPrecos, conferirArquivoItbi, contarPorCidade, itbiDaCidade, lerItbi, mesAno, PASTA_ITBI, referenciasItbi, type ArquivoItbi, type DadosItbi } from "./itbi";
import type { ImovelResumo } from "./tipos";
import { indiceDeRuas } from "./vizinhanca";

const e = (n: number, mediana: number) => ({ n, media: mediana + 50, mediana, p25: mediana - 1000, p75: mediana + 1000 });

/** Arquivo de teste com os números de SP; nos testes gerais ele é de Porto Alegre (área privativa). */
const SP: ArquivoItbi = {
  formato: "luneta-itbi",
  versao: 1,
  cidade: "São Paulo",
  uf: "SP",
  fonte: { nome: "Prefeitura de São Paulo", url: "https://prefeitura.sp.gov.br/x", periodo: ["2025-09-08", "2026-09-07"], transacoes: 95084 },
  cidade_tipos: { apartamento: e(66626, 5079), casa: e(20333, 4437) },
  bairros: { "jardim paulista": { nome: "JD PAULISTA", tipos: { apartamento: e(694, 12000) } } },
  ruas: {
    abagiba: { nome: "R ABAGIBA", tipos: { apartamento: e(39, 3889) } },
    "projetada c": { nome: "R PROJETADA C", tipos: { apartamento: e(9, 2000) } },
  },
};

function imovel(s: Partial<ImovelResumo> = {}): ImovelResumo {
  return {
    id: "caixa-1", titulo: "Apartamento", tipo: "apartamento", uf: "SP", cidade: "São Paulo", bairro: "Jd. Paulista", lat: null, lon: null,
    precisaoGeo: "cidade", area: 50, areaTerreno: null, quartos: 2, vagas: 1, avaliacao: 300000, lance: 200000, desagio: 33,
    lanceM2: 4000, avaliacaoM2: 6000, modalidade: "venda_direta", modalidadeFonte: null, praca: "unica", dataPraca: null,
    financiamento: true, fgts: null, parcelamento: null, ocupacao: null, judicial: false, fonte: { id: "caixa_csv", nome: "Caixa" },
    foto: null, totalFotos: 0, selo: 0, seloPendente: true, tags: [], coletadoEm: "2026-10-14", notaLocal: null, ...s,
  };
}

const dados = (...arquivos: ArquivoItbi[]): DadosItbi => ({
  porCidade: new Map(arquivos.map((a) => [`${a.uf}|${a.cidade.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}`, a])),
  recusados: [],
});

test("conferirArquivoItbi: aceita o formato e recusa o resto com o motivo", () => {
  assert.equal(conferirArquivoItbi(SP), null);
  assert.match(conferirArquivoItbi({ ...SP, versao: 2 })!, /formato 2/);
  assert.match(conferirArquivoItbi({ ...SP, fonte: { ...SP.fonte, url: "http://x" } })!, /url https/);
  assert.match(conferirArquivoItbi({ ...SP, fonte: { ...SP.fonte, periodo: ["2025", "2026"] } })!, /período/);
  assert.match(conferirArquivoItbi({ ...SP, cidade_tipos: { mansao: e(5, 1) } })!, /cidade/);
  assert.match(conferirArquivoItbi({ ...SP, ruas: { x: { nome: "X", tipos: { apartamento: { ...e(5, 1000), p25: 5000 } } } } })!, /ruas: "x"/);
  assert.match(conferirArquivoItbi(null)!, /não é/);
});

const POA: ArquivoItbi = { ...SP, cidade: "Porto Alegre", uf: "RS" };
const naPoa = (s: Partial<ImovelResumo> = {}) => imovel({ cidade: "Porto Alegre", uf: "RS", ...s });

test("referenciasItbi: rua, bairro e cidade do mesmo tipo, com período e preço pago no lugar da avaliação", () => {
  const i = naPoa();
  const refs = referenciasItbi(POA, i, { chave: "abagiba", nome: "Rua Abagiba" });
  assert.deepEqual(refs.map((r) => [r.escopo, r.nome, r.amostra, r.fonte]), [
    ["rua", "Rua Abagiba, Porto Alegre/RS", 39, "itbi"],
    ["bairro", "Jd. Paulista, Porto Alegre/RS", 694, "itbi"],
    ["cidade", "Porto Alegre/RS", 66626, "itbi"],
  ]);
  const rua = refs[0]!;
  assert.deepEqual(rua.periodo, ["2025-09-08", "2026-09-07"]);
  assert.equal(rua.media, 3939);
  assert.deepEqual(rua.avaliacaoM2, { mediana: 3889, p25: 2889, p75: 4889 });
  assert.equal(rua.lanceM2, null);
  assert.equal(rua.percentilLance, null);
  assert.deepEqual(rua.imovel, { avaliacaoM2: 6000, lanceM2: 4000 });
  // rua que não está no ITBI, nome genérico, sem rua e sem bairro
  assert.deepEqual(referenciasItbi(POA, i, { chave: "inexistente", nome: "Rua X" }).map((r) => r.escopo), ["bairro", "cidade"]);
  assert.deepEqual(referenciasItbi(POA, i, { chave: "projetada c", nome: "Rua Projetada C" }).map((r) => r.escopo), ["bairro", "cidade"], "nome que se repete na cidade não casa");
  const comTres = { ...POA, ruas: { ...POA.ruas, tres: { nome: "R TRES", tipos: { apartamento: e(12, 2500) } } } };
  assert.deepEqual(referenciasItbi(comTres, i, { chave: "tres", nome: "Rua Três" }).map((r) => r.escopo), ["bairro", "cidade"], "Rua Três: cada loteamento tem a sua");
  assert.deepEqual(referenciasItbi(POA, naPoa({ bairro: null })).map((r) => r.escopo), ["cidade"]);
  // tipo sem ITBI, cidade sem arquivo, chave que lembra propriedade de objeto
  assert.deepEqual(referenciasItbi(POA, naPoa({ tipo: "rural" })), []);
  assert.deepEqual(referenciasItbi(POA, naPoa({ tipo: "terreno" })), [], "terreno sem estatística na cidade");
  assert.deepEqual(referenciasItbi(null, i), []);
  assert.deepEqual(referenciasItbi(POA, naPoa({ bairro: "constructor" }), { chave: "constructor", nome: "Rua Constructor" }).map((r) => r.escopo), ["cidade"]);
});

test("área com a parte comum do prédio (SP e Fortaleza): apartamento e sala ficam sem ITBI, casa e terreno comparam", () => {
  assert.ok(areaComComum(SP, "apartamento") && areaComComum(SP, "comercial"));
  assert.ok(!areaComComum(SP, "casa") && !areaComComum(SP, "terreno"));
  assert.ok(areaComComum({ uf: "CE", cidade: "Fortaleza" }, "apartamento"));
  assert.ok(!areaComComum(POA, "apartamento") && !areaComComum({ uf: "RJ", cidade: "Rio de Janeiro" }, "apartamento"));
  assert.deepEqual(referenciasItbi(SP, imovel(), { chave: "abagiba", nome: "Rua Abagiba" }), [], "apartamento em SP: a comparação enganaria");
  assert.deepEqual(referenciasItbi(SP, imovel({ tipo: "casa" })).map((r) => [r.escopo, r.nome]), [["cidade", "São Paulo/SP"]]);
  const cob = coberturaPrecos(dados(SP), imovel(), null);
  assert.equal(cob.cidadeTemItbi, true);
  assert.match(cob.semComparacao!, /prefeitura de São Paulo publica para apartamentos inclui a parte comum do prédio/);
  assert.equal(coberturaPrecos(dados(SP), imovel({ tipo: "casa" }), null).semComparacao, null, "casa em SP compara");
  assert.equal(coberturaPrecos(dados(POA), naPoa(), null).semComparacao, null);
  assert.equal(coberturaPrecos(dados(), imovel(), null).semComparacao, null, "sem arquivo, o motivo é outro (a tabela diz)");
});

test("coberturaPrecos: SP com arquivo, as outras 5 cidades pendentes, as sem dado aberto e o FipeZAP", () => {
  const contagem = contarPorCidade([imovel(), imovel({ id: "b" }), imovel({ id: "c", cidade: "Rio de Janeiro", uf: "RJ" }), imovel({ id: "d", cidade: "Niterói", uf: "RJ" })]);
  const c = coberturaPrecos(dados(SP), imovel(), contagem);
  assert.equal(c.cidadeTemItbi, true);
  const por = new Map(c.fontes.map((f) => [f.nome, f]));
  assert.deepEqual(por.get("São Paulo/SP"), {
    nome: "São Paulo/SP", tipo: "itbi", situacao: "temos",
    detalhe: "transações de set/2025 a set/2026 (95.084); valor declarado; apartamentos e imóveis comerciais ficam fora da comparação (a área publicada inclui a parte comum do prédio)",
    url: "https://prefeitura.sp.gov.br/web/fazenda/w/acesso_a_informacao/31501", licenca: null, imoveisNaBase: 2,
  });
  for (const nome of ["Rio de Janeiro/RJ", "Porto Alegre/RS", "Fortaleza/CE", "Belo Horizonte/MG", "Recife/PE"]) assert.equal(por.get(nome)?.situacao, "coleta_pendente", nome);
  assert.match(por.get("Belo Horizonte/MG")!.detalhe, /fora do Brasil/);
  const rioMapServer = coberturaPrecos(dados(SP, { ...SP, cidade: "Rio de Janeiro", uf: "RJ", fonte: { ...SP.fonte, via: "MapServer da prefeitura" } }), imovel(), contagem);
  assert.match(rioMapServer.fontes.find((f) => f.nome === "Rio de Janeiro/RJ")!.detalhe, /^médias por trecho de rua, transações de set\/2025/);
  assert.equal(por.get("Rio de Janeiro/RJ")!.imoveisNaBase, 1);
  assert.equal(por.get("Recife/PE")!.licenca, "ODbL");
  assert.equal(por.get("Fortaleza/CE")!.licenca, "CC-BY");
  for (const nome of ["Salvador/BA", "Goiânia/GO", "Brasília/DF", "Curitiba/PR", "Florianópolis/SC", "Campinas/SP", "Niterói/RJ"]) {
    assert.equal(por.get(nome)?.situacao, "sem_dado_aberto", nome);
    assert.match(por.get(nome)!.detalhe, /Lei de Acesso à Informação/);
  }
  assert.equal(por.get("Niterói/RJ")!.imoveisNaBase, 1);
  assert.deepEqual([c.fontes.at(-1)!.nome, c.fontes.at(-1)!.situacao, c.fontes.at(-1)!.tipo], ["FipeZAP", "precisa_autorizacao", "indice"]);
  assert.equal(coberturaPrecos(dados(SP), imovel({ cidade: "Recife", uf: "PE" }), contagem).cidadeTemItbi, false);
  assert.ok(coberturaPrecos(dados(SP), imovel(), null).fontes.every((f) => f.imoveisNaBase === null), "demonstração: sem contagem da base");
  // cidade com arquivo fora da lista entra como "temos", antes do FipeZAP
  const outra = coberturaPrecos(dados(SP, { ...SP, cidade: "Santos" }), imovel(), contagem).fontes;
  assert.deepEqual(outra.slice(-2).map((f) => [f.nome, f.situacao]), [["Santos/SP", "temos"], ["FipeZAP", "precisa_autorizacao"]]);
  assert.equal(mesAno("2026-01-31"), "jan/2026");
});

test("lerItbi: lê os .json.gz da pasta, recusa o inválido sem derrubar os outros; sem pasta, nada", async () => {
  const dir = mkdtempSync(join(tmpdir(), "itbi-"));
  const erro = console.error;
  console.error = () => {};
  try {
    assert.deepEqual((await lerItbi(join(dir, "nao-existe"))).porCidade.size, 0);
    writeFileSync(join(dir, "sp-sao-paulo.json.gz"), gzipSync(JSON.stringify(SP)));
    writeFileSync(join(dir, "rj-rio-de-janeiro.json.gz"), gzipSync(JSON.stringify({ ...SP, versao: 9 })));
    writeFileSync(join(dir, "quebrado.json.gz"), "não é gzip");
    writeFileSync(join(dir, "leiame.txt"), "ignorado");
    const d = await lerItbi(dir);
    assert.deepEqual([...d.porCidade.keys()], ["SP|sao paulo"]);
    assert.deepEqual(d.recusados.map((r) => r.arquivo).sort(), ["quebrado.json.gz", "rj-rio-de-janeiro.json.gz"]);
    assert.equal(itbiDaCidade(d, { uf: "SP", cidade: "SÃO PAULO" })?.cidade, "São Paulo", "casa a cidade sem acento e sem caixa");
    assert.equal(itbiDaCidade(d, { uf: "RJ", cidade: "Rio de Janeiro" }), null);
  } finally {
    console.error = erro;
    rmSync(dir, { recursive: true, force: true });
  }
});

const PASTA = join(pastaPadrao(), PASTA_ITBI);
const TEM = existsSync(PASTA) && readdirSync(PASTA).some((n) => n.endsWith(".json.gz"));

test("arquivos reais: todos válidos, os imóveis da base casam por bairro e por rua, e a área compara com a da base", { skip: !TEM }, async () => {
  const d = await lerItbi(PASTA);
  assert.deepEqual(d.recusados, []);
  assert.ok(d.porCidade.size >= 1);
  const lista = await lerLista();
  const { contexto } = indiceDeRuas(lista.itens, lista.enderecos);
  const mediana = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
  for (const [chave, arquivo] of d.porCidade) {
    const daCidade = lista.itens
      .map((i, k) => [i, k] as const)
      .filter(([i]) => `${i.uf}|${i.cidade.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}` === chave);
    // os tipos que comparam (sem os de área com a parte comum do prédio, nem rural e outro)
    const comparam = daCidade.filter(([i]) => ["apartamento", "casa", "terreno", "comercial"].includes(i.tipo) && !areaComComum(arquivo, i.tipo));
    const n = comparam.length;
    let rua = 0;
    let bairro = 0;
    let cidade = 0;
    // avaliação/m² do imóvel ÷ preço pago/m² da mesma rua ou do mesmo bairro, por tipo
    const razoes = new Map<string, number[]>();
    for (const [i, k] of comparam) {
      const refs = referenciasItbi(arquivo, i, contexto(k).rua ?? null);
      const escopos = refs.map((r) => r.escopo);
      if (escopos.includes("rua")) rua++;
      if (escopos.includes("bairro")) bairro++;
      if (escopos.includes("cidade")) cidade++;
      const local = refs.find((r) => r.escopo !== "cidade");
      if (local?.avaliacaoM2 && i.avaliacaoM2) razoes.set(i.tipo, [...(razoes.get(i.tipo) ?? []), i.avaliacaoM2 / local.avaliacaoM2.mediana]);
    }
    // registro para o relatório: quantos casam em cada nível e a razão por tipo
    const r = [...razoes].map(([t, v]) => `${t} ${mediana(v).toFixed(2)} (n=${v.length})`).join(", ");
    console.log(`ITBI ${arquivo.cidade}/${arquivo.uf}: ${daCidade.length} imóveis da base, ${n} dos tipos que comparam; rua ${rua}, bairro ${bairro}, cidade ${cidade}; avaliação ÷ preço pago: ${r}`);
    // área privativa x área com a parte comum: a razão típica fica perto de 1 (SP e Fortaleza davam 2,0 e 1,6
    // nos apartamentos); fora de 0,6 a 1,5 com amostra boa, a área do arquivo não compara com a da base
    for (const [tipo, v] of razoes) {
      if (v.length < 15) continue;
      const m = mediana(v);
      assert.ok(m >= 0.6 && m <= 1.5, `${chave} ${tipo}: avaliação ÷ preço pago = ${m.toFixed(2)} (n=${v.length}); a área do arquivo é comparável?`);
    }
    if (n < 20) continue;
    assert.ok(cidade >= 0.8 * n, `${chave}: só ${cidade} de ${n} com referência da cidade`);
    assert.ok(bairro >= 0.3 * n, `${chave}: só ${bairro} de ${n} casam o bairro`);
    // a rua só com amostra grande (as casas de Fortaleza, por exemplo, quase nunca têm 3 compras na mesma rua)
    if (n >= 100) assert.ok(rua >= 0.05 * n, `${chave}: só ${rua} de ${n} casam a rua`);
  }
});

test("pasta do ITBI existe no instantâneo (pode estar vazia)", { skip: !existsSync(pastaPadrao()) }, () => {
  mkdirSync(PASTA, { recursive: true });
  assert.ok(existsSync(PASTA));
});
