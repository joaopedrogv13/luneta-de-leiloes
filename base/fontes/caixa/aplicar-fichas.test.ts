/**
 * `npm run base:fichas`: as 2 fichas reais de fixtures/ (Venda Direta Online de 2026 e Venda Online de 2023) aplicadas
 * num banco com a lista de 30 imóveis da fixture: matrícula, cartório, extras, documentos, FGTS, cache do conector e a
 * exportação para o site (registro "lido" com a data).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { executarColeta } from "../../coleta.ts";
import { abrirBanco } from "../../db.ts";
import { datasDasFichas, montarCatalogo, parteDoId, registroDaFicha } from "../../exportar.ts";
import { gravarImoveis } from "../../gravar.ts";
import { bancoEmMemoria, httpProibido, imovelExemplo } from "../../testes/apoio.ts";
import { aplicarFichas, lerArquivoFichas, lidaEmDaFicha, principal } from "./aplicar-fichas.ts";
import { abrirCacheDisco, cacheEmMemoria } from "./cache.ts";
import { interpretarFicha } from "./ficha.ts";
import { criarConectorCaixa } from "./index.ts";

const FIXTURES = join(import.meta.dirname, "fixtures");
const AGORA = new Date("2026-10-09T12:00:00Z");
const FICHA_2026 = interpretarFicha(readFileSync(join(FIXTURES, "ficha_0000010005120_2026-10-08.html"), "utf8"));
const FICHA_2023 = interpretarFicha(readFileSync(join(FIXTURES, "ficha_1444410505954_2023-12.html"), "utf8"));
const ARQUIVO = { lidas_em: "2026-10-17T17:22:30.000Z", fichas: { "0000010005120": FICHA_2026, "1444410505954": FICHA_2023, "9999999999999": { ...FICHA_2023, numero_imovel: "9999999999999" } } };

/** Banco com os 30 imóveis do CSV da fixture e mais o da ficha de 2023 (Angra dos Reis), com o preço dela. */
async function banco() {
  const db = bancoEmMemoria();
  const c = criarConectorCaixa({ cache: null, fichasLocais: null, verificarFotos: false, volumeMinimo: 10, ultimaUf: null, agora: () => AGORA, esperar: async () => undefined });
  const r = await executarColeta(db, c, { arquivo: join(FIXTURES, "Lista_imoveis_30.csv"), agora: AGORA, http: httpProibido() });
  assert.equal(r.status, "sucesso");
  gravarImoveis(db, "caixa_csv", [
    imovelExemplo({
      id_na_fonte: "1444410505954", url: "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=1444410505954",
      uf: "RJ", cidade: "Angra dos Reis", bairro: "Pontal", endereco: "Alameda dos Tucanos, Qd 28 Lt 46", modalidade: "venda_online", modalidade_fonte: "Venda Online",
      valor_avaliacao: FICHA_2023.valor_avaliacao, preco: FICHA_2023.valor_minimo, pracas: [{ numero: 0, data: null, valor_minimo: FICHA_2023.valor_minimo }], documentos: [], extras: { tipo_fonte: "Casa" },
    }),
  ], { agora: AGORA, geradoEm: "2026-10-08", completa: false });
  return db;
}

const linha = (db: ReturnType<typeof bancoEmMemoria>, id13: string) =>
  db.prepare("SELECT id, matricula, cartorio, extras, aceita_fgts, chave_dedup FROM imovel WHERE fonte_id = 'caixa_csv' AND id_na_fonte = ?").get(id13)!;

test("lerArquivoFichas: formato de baixar-fichas.ts; recusa sem lidas_em ou sem fichas", () => {
  assert.equal(lerArquivoFichas(JSON.stringify(ARQUIVO)).lidas_em, ARQUIVO.lidas_em);
  assert.throws(() => lerArquivoFichas("{"), /não é JSON/);
  assert.throws(() => lerArquivoFichas(JSON.stringify({ fichas: {} })), /lidas_em/);
  assert.throws(() => lerArquivoFichas(JSON.stringify({ lidas_em: "2026-10-17T00:00:00Z", fichas: [] })), /fichas/);
  // Date.parse aceita "Fri Oct 17 2026", mas o dia vai ao site como AAAA-MM-DD (e o site recusaria o pedaço)
  assert.throws(() => lerArquivoFichas(JSON.stringify({ lidas_em: "Fri Oct 17 2026 14:00:00", fichas: {} })), /AAAA-MM-DD/);
});

test("aplicarFichas: matrícula, cartório, extras, PDF da matrícula, FGTS da ficha atual, chave por matrícula e o cache", async () => {
  const db = await banco();
  const cache = cacheEmMemoria();
  const antes = linha(db, "0000010005120");
  assert.equal(antes.matricula, null, "o CSV não traz matrícula");
  const r = aplicarFichas(db, { ...ARQUIVO, fichas: { ...ARQUIVO.fichas, "123": FICHA_2026, "1444420699441": FICHA_2026 } }, { cache, agora: AGORA });
  assert.deepEqual(r.aplicadas, ["0000010005120", "1444410505954"]);
  assert.deepEqual(r.semImovel, ["9999999999999"]);
  assert.deepEqual(r.invalidas.map((i) => i.id), ["123", "1444420699441"], "id curto e ficha de outro imóvel ficam de fora");
  assert.equal(r.noCache, 2);

  const a = linha(db, "0000010005120");
  assert.equal(a.matricula, "9740");
  assert.equal(a.cartorio, "1º Ofício de Registro de Imóveis de Cruzeiro do Sul/AC");
  const extras = JSON.parse(String(a.extras)) as Record<string, unknown>;
  assert.equal(extras.comarca, "CRUZEIRO DO SUL-AC");
  assert.equal(extras.oficio, "01");
  assert.equal(extras.averbacao_leiloes_negativos, "Averbado");
  assert.equal(extras.ficha_lida_em, "2026-10-17");
  assert.ok(extras.desconto_fonte !== undefined, "os extras do CSV continuam");
  assert.equal(a.aceita_fgts, 0, "a ficha descreve a oferta do CSV: o FGTS dela vale");
  const textos = JSON.parse(String(db.prepare("SELECT textos FROM imovel WHERE id = ?").get(Number(a.id))!.textos)) as { origem: string; texto: string }[];
  assert.deepEqual(textos.map((t) => t.origem), ["ficha"], "o texto da ficha vai para as regras de risco (base:riscos)");
  assert.match(textos[0]!.texto, /Condom[íi]nio|Tributos|FORMAS DE PAGAMENTO/i);
  assert.match(String(a.chave_dedup), /^mat:/, "com a matrícula, a chave de deduplicação é a da matrícula");
  const docs = db.prepare("SELECT tipo, url FROM documento WHERE imovel_id = ?").all(Number(a.id));
  assert.deepEqual(docs.map((d) => d.tipo), ["matricula"]);

  const b = linha(db, "1444410505954");
  assert.equal(b.matricula, "22029");
  assert.equal(b.cartorio, "1º Ofício de Registro de Imóveis de Angra dos Reis/RJ");
  assert.equal((JSON.parse(String(b.extras)) as Record<string, unknown>).inscricao_imobiliaria, "02180820318002");
  assert.equal(b.aceita_fgts, null, "a ficha não fala de FGTS: fica como estava");

  // o cache do conector guarda a ficha: a próxima coleta do CSV não apaga o que veio dela
  assert.deepEqual(cache.ler("0000010005120")?.ficha?.matriculas, ["9740"]);
  assert.equal(cache.ler("0000010005120")?.ficha_em, ARQUIVO.lidas_em);

  // aplicar de novo não duplica documento nem muda o resultado
  aplicarFichas(db, ARQUIVO, { cache, agora: AGORA });
  assert.equal(db.prepare("SELECT count(*) AS n FROM documento WHERE imovel_id = ?").get(Number(a.id))!.n, 1);
});

test("a próxima coleta do CSV (sem rede, sem --detalhes) mantém o que veio da ficha, pelo cache do conector", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fichas-cache-"));
  try {
    const db = await banco();
    const caminho = join(dir, "detalhes.db");
    const cache = abrirCacheDisco(caminho);
    aplicarFichas(db, ARQUIVO, { cache, agora: AGORA });
    cache.fechar();
    const c = criarConectorCaixa({ cache: caminho, fichasLocais: null, verificarFotos: false, volumeMinimo: 10, ultimaUf: null, agora: () => AGORA, esperar: async () => undefined });
    const r = await executarColeta(db, c, { arquivo: join(FIXTURES, "Lista_imoveis_30.csv"), agora: new Date("2026-10-18T12:00:00Z"), http: httpProibido() });
    assert.equal(r.status, "sucesso");
    const a = linha(db, "0000010005120");
    assert.equal(a.matricula, "9740");
    assert.equal(a.cartorio, "1º Ofício de Registro de Imóveis de Cruzeiro do Sul/AC");
    assert.equal((JSON.parse(String(a.extras)) as Record<string, unknown>).comarca, "CRUZEIRO DO SUL-AC");
    // a data da leitura não fica no imóvel (de propósito: entraria no hash); a exportação a lê do cache
    assert.equal(datasDasFichas(caminho).get("0000010005120"), "2026-10-17");
    const cat = montarCatalogo(db, { agora: AGORA, cacheCaixa: caminho });
    assert.equal(cat.partes.find((p) => p.parte === parteDoId("caixa-0000010005120"))!.detalhes["caixa-0000010005120"]!.registro?.lidoEm, "2026-10-17");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("exportação: registro lido (comarca, ofício, inscrição, averbação, matrículas e dia da leitura); sem ficha, nada", async () => {
  const db = await banco();
  aplicarFichas(db, ARQUIVO, { cache: null, agora: AGORA });
  const cat = montarCatalogo(db, { agora: AGORA, cacheCaixa: null });
  const detalhe = (id: string) => cat.partes.find((p) => p.parte === parteDoId(id))!.detalhes[id]!;
  assert.deepEqual(detalhe("caixa-0000010005120").registro, {
    matriculas: ["9740"], comarca: "CRUZEIRO DO SUL-AC", oficio: "01", inscricaoImobiliaria: null, averbacaoLeiloesNegativos: "Averbado", lidoEm: "2026-10-17",
  });
  assert.equal(detalhe("caixa-0000010005120").matricula, "9740");
  assert.deepEqual(detalhe("caixa-1444410505954").registro?.inscricaoImobiliaria, "02180820318002");
  const semFicha = cat.lista.colunas.id.find((id) => id.startsWith("caixa-") && id !== "caixa-0000010005120" && id !== "caixa-1444410505954")!;
  assert.equal(detalhe(semFicha).registro, undefined, "sem ficha o detalhe não leva registro (o site mostra \"pendente\")");
});

test("registroDaFicha: data pelo cache quando os extras não têm; fora da Caixa, nada", () => {
  assert.deepEqual(registroDaFicha({ fonte: "caixa_csv", matricula: "868" }, { comarca: "SÃO GONÇALO-RJ", oficio: "06", inscricao_imobiliaria: "50334", averbacao_leiloes_negativos: "Averbado" }, "2026-10-17T17:22:30Z"), {
    matriculas: ["868"], comarca: "SÃO GONÇALO-RJ", oficio: "06", inscricaoImobiliaria: "50334", averbacaoLeiloesNegativos: "Averbado", lidoEm: "2026-10-17",
  });
  assert.deepEqual(registroDaFicha({ fonte: "caixa_csv", matricula: "1" }, { matriculas: "10, 11" })?.matriculas, ["10", "11"]);
  assert.equal(registroDaFicha({ fonte: "caixa_csv", matricula: null }, { tipo_fonte: "Casa" }), undefined);
  assert.equal(registroDaFicha({ fonte: "leiloesjudiciais_api", matricula: "5" }, { comarca: "X" }), undefined);
  // data fora do formato (extras gravados à mão ou por versão antiga): o registro sai sem a data, sem quebrar o pedaço
  assert.equal(registroDaFicha({ fonte: "caixa_csv", matricula: "868" }, { ficha_lida_em: "17/10/2026" })?.lidoEm, null);
});

test("linha de comando: --arquivo, banco e cache em disco; datasDasFichas lê o cache", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fichas-cli-"));
  try {
    const caminhoBanco = join(dir, "luneta.db");
    const db = abrirBanco(caminhoBanco);
    const memoria = await banco();
    // copia o banco em memória para o arquivo (o comando abre pelo caminho)
    memoria.exec(`VACUUM INTO '${caminhoBanco.replace(/'/g, "''")}.tmp'`);
    db.close();
    rmSync(caminhoBanco);
    writeFileSync(caminhoBanco, readFileSync(`${caminhoBanco}.tmp`));
    const arquivo = join(dir, "fichas.json");
    writeFileSync(arquivo, JSON.stringify(ARQUIVO));
    const saida: string[] = [];
    const erro: string[] = [];
    const caminhoCache = join(dir, "detalhes.db");
    assert.equal(principal(["--arquivo", arquivo, "--banco", caminhoBanco, "--cache", caminhoCache], (t) => saida.push(t), (t) => erro.push(t)), 0, erro.join("\n"));
    assert.match(saida.join("\n"), /2 aplicada\(s\) no banco e no cache/);
    assert.match(saida.join("\n"), /Sem imóvel da Caixa no banco: 9999999999999/);
    const cache = abrirCacheDisco(caminhoCache);
    assert.deepEqual(cache.ler("1444410505954")?.ficha?.matriculas, ["22029"]);
    cache.fechar();
    assert.deepEqual(datasDasFichas(caminhoCache), new Map([["0000010005120", "2026-10-17"], ["1444410505954", "2026-10-17"]]));
    assert.deepEqual(datasDasFichas(join(dir, "nao-existe.db")), new Map());
    assert.deepEqual(datasDasFichas(null), new Map());
    assert.equal(principal([], () => undefined, () => undefined), 2, "sem --arquivo: uso");
    const ruim = join(dir, "ruim.json");
    writeFileSync(ruim, "{");
    const erros: string[] = [];
    assert.equal(principal(["--arquivo", ruim, "--banco", caminhoBanco, "--cache", "off"], () => undefined, (t) => erros.push(t)), 1, "arquivo ruim: código 1, sem pilha");
    assert.match(erros.join("\n"), /não é JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fichas.json da coleta no PC: dia de cada ficha (lida_em_por_id), CEP da ficha, e o .gz pela linha de comando", async () => {
  assert.equal(FICHA_2026.cep?.length, 8, "a ficha real de 2026 traz o CEP");
  const db = await banco();
  const cache = cacheEmMemoria();
  const doPc = {
    lidas_em: "2026-10-17T10:00:00.000Z",
    total: 2,
    lida_em_por_id: { "0000010005120": "2026-10-19T02:15:00.000Z", "1444410505954": "data ruim" },
    fichas: { "0000010005120": FICHA_2026, "1444410505954": { ...FICHA_2023, cep: "123" } },
  };
  assert.equal(lidaEmDaFicha(lerArquivoFichas(JSON.stringify(doPc)), "0000010005120"), "2026-10-19T02:15:00.000Z");
  assert.equal(lidaEmDaFicha(doPc, "1444410505954"), doPc.lidas_em, "data inválida: vale a do arquivo");
  assert.equal(lidaEmDaFicha(doPc, "0000000000001"), doPc.lidas_em);
  assert.throws(() => lerArquivoFichas(JSON.stringify({ ...doPc, lida_em_por_id: [] })), /lida_em_por_id/);

  const cep = (id13: string) => db.prepare("SELECT cep FROM imovel WHERE fonte_id = 'caixa_csv' AND id_na_fonte = ?").get(id13)!.cep;
  const cepAntes = cep("1444410505954");
  const r = aplicarFichas(db, doPc, { cache, agora: AGORA });
  assert.deepEqual(r.aplicadas, ["0000010005120", "1444410505954"], "CEP fora do formato não derruba a transação");
  assert.equal((JSON.parse(String(linha(db, "0000010005120").extras)) as Record<string, unknown>).ficha_lida_em, "2026-10-19");
  assert.equal((JSON.parse(String(linha(db, "1444410505954").extras)) as Record<string, unknown>).ficha_lida_em, "2026-10-17");
  assert.equal(cache.ler("0000010005120")?.ficha_em, "2026-10-19T02:15:00.000Z");
  assert.equal(cep("0000010005120"), FICHA_2026.cep);
  assert.equal(cep("1444410505954"), cepAntes, "CEP inválido não substitui o que havia");

  const dir = mkdtempSync(join(tmpdir(), "fichas-gz-"));
  try {
    const gz = join(dir, "fichas.json.gz");
    writeFileSync(gz, gzipSync(JSON.stringify(doPc)));
    const saida: string[] = [];
    const erro: string[] = [];
    assert.equal(principal(["--arquivo", gz, "--banco", join(dir, "vazio.db"), "--cache", "off"], (t) => saida.push(t), (t) => erro.push(t)), 0, erro.join("\n"));
    assert.match(saida.join("\n"), /Fichas lidas desde 2026-10-17T10:00:00.000Z: 0 aplicada/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
