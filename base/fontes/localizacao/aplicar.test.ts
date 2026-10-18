/**
 * `npm run base:geocode`: o geocode.json de geocodificar.py aplicado no banco (lat, lon, precisão e extras.geo),
 * sem piorar o ponto da fonte, idempotente, conferido no município, mantido pela coleta seguinte enquanto o endereço
 * for o mesmo, e levado ao catálogo do site pela exportação (sem apagar os outros arquivos da pasta).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { gravarCatalogo, montarCatalogo } from "../../exportar.ts";
import { assinaturaEndereco, lerGeoAplicado, manterGeocode } from "../../geo/aplicado.ts";
import { garantirFonte, gravarImoveis } from "../../gravar.ts";
import { bancoEmMemoria, conectorFalso, imovelExemplo } from "../../testes/apoio.ts";
import { aplicarGeocode, lerArquivoGeocode, principal, type ArquivoGeocode } from "./aplicar.ts";

const AGORA = new Date("2026-10-18T12:00:00Z");
const TRIBOBO = { lat: -22.859741, lon: -43.032906 };

function banco() {
  const db = bancoEmMemoria();
  garantirFonte(db, { ...conectorFalso({ registros: () => [] }), id: "caixa_csv", nome: "Caixa" }, AGORA);
  garantirFonte(db, { ...conectorFalso({ registros: () => [] }), id: "leiloesjudiciais_api", nome: "Leilões Judiciais" }, AGORA);
  const base = { uf: "RJ" as const, cidade: "São Gonçalo", modalidade: "venda_online" as const, pracas: [{ numero: 0 as const, data: null, valor_minimo: 25100 }], valor_avaliacao: 251000 };
  gravarImoveis(db, "caixa_csv", [
    imovelExemplo({ ...base, id_na_fonte: "1444419640129", bairro: "Tribobo", endereco: "Rua Expedicionario Benoni Falcao Gouveia, N. 338, Lt 28, Qd 08", cep: null, extras: { tipo_fonte: "Casa" } }),
    imovelExemplo({ ...base, id_na_fonte: "1444419640130", bairro: "Tribobo", endereco: "Rua 06, N. Sn", cep: null }),
    imovelExemplo({ ...base, id_na_fonte: "1444419640131", bairro: "Centro", endereco: "Rua Feliciano Sodre, N. 100", cep: null }),
  ], { agora: AGORA, geradoEm: "2026-10-08" });
  // lote da Leilões Judiciais com coordenada do Street View ("exata", conferida)
  gravarImoveis(db, "leiloesjudiciais_api", [
    imovelExemplo({ ...base, id_na_fonte: "222069", bairro: "Tribobo", endereco: "Rua Dalva Raposo, 260", lat: -22.8601, lon: -43.0335, precisao_geo: "exata" }),
  ], { agora: AGORA });
  return db;
}

const ARQUIVO: ArquivoGeocode = {
  formato: "luneta-geocode",
  versao: 1,
  gerado_em: "2026-10-18T03:00:00Z",
  imoveis: {
    "caixa-1444419640129": { precisao: "numero", ...TRIBOBO, desvio_m: 6, setor: "330490425000112", motivo: null, degrau: "pn03" },
    "caixa-1444419640130": { precisao: "bairro", lat: -22.861, lon: -43.031, desvio_m: 700, setor: null, motivo: "nome_generico_sem_bairro", degrau: "bairro" },
    "caixa-1444419640131": { precisao: "rua", lat: -23.5505, lon: -46.6333, desvio_m: 50, setor: null, motivo: null, degrau: "dl03" },
    "lj-222069": { precisao: "rua", lat: -22.86, lon: -43.03, desvio_m: 90, setor: null, motivo: null, degrau: "dl03" },
    "caixa-9999999999999": { precisao: "numero", lat: -22.86, lon: -43.03, desvio_m: 6, setor: null, motivo: null, degrau: "dn03" },
    "outra-1": { precisao: "numero", lat: -22.86, lon: -43.03, desvio_m: 6, setor: null, motivo: null, degrau: "dn03" },
  },
};

const linha = (db: ReturnType<typeof banco>, fonte: string, id: string) =>
  db.prepare("SELECT id, uf, cidade, bairro, endereco, lat, lon, precisao_geo, extras, hash_conteudo, atualizado_em FROM imovel WHERE fonte_id = ? AND id_na_fonte = ?").get(fonte, id)!;

test("lerArquivoGeocode: formato, versão, gerado_em e imoveis", () => {
  assert.equal(lerArquivoGeocode(JSON.stringify(ARQUIVO)).versao, 1);
  assert.throws(() => lerArquivoGeocode("{"), /não é JSON/);
  assert.throws(() => lerArquivoGeocode(JSON.stringify({ ...ARQUIVO, formato: "x" })), /formato/);
  assert.throws(() => lerArquivoGeocode(JSON.stringify({ ...ARQUIVO, versao: 2 })), /versão 2/);
  assert.throws(() => lerArquivoGeocode(JSON.stringify({ ...ARQUIVO, gerado_em: "ontem" })), /gerado_em/);
  assert.throws(() => lerArquivoGeocode(JSON.stringify({ ...ARQUIVO, imoveis: [] })), /imoveis/);
});

test("aplicarGeocode: precisão do banco, extras.geo, ponto da fonte mantido, conferência no município e idempotência", () => {
  const db = banco();
  const antes = linha(db, "caixa_csv", "1444419640129");
  assert.equal(antes.precisao_geo, "cidade", "a Caixa não traz coordenada: sede do município");
  const r = aplicarGeocode(db, ARQUIVO);
  assert.deepEqual(r.aplicados, { exata: 1, bairro: 1, cidade: 1 });
  assert.deepEqual(r.mantidosDaFonte, ["lj-222069"], "o Street View da Leilões Judiciais é melhor que um ponto de rua");
  assert.deepEqual(r.recusados, ["caixa-1444419640131"], "um ponto em São Paulo não é de São Gonçalo");
  assert.deepEqual(r.semImovel, ["caixa-9999999999999"]);
  assert.deepEqual(r.invalidos.map((i) => i.id), ["outra-1"]);

  const a = linha(db, "caixa_csv", "1444419640129");
  assert.deepEqual([a.lat, a.lon, a.precisao_geo], [TRIBOBO.lat, TRIBOBO.lon, "exata"]);
  const geo = lerGeoAplicado(String(a.extras))!;
  assert.deepEqual({ ...geo, assinatura: "-" }, { precisao: "numero", desvio_m: 6, setor: "330490425000112", motivo: null, degrau: "pn03", gerado_em: "2026-10-18", assinatura: "-" });
  assert.equal(geo.assinatura, assinaturaEndereco({ uf: "RJ", cidade: "São Gonçalo", bairro: "Tribobo", endereco: String(a.endereco) }));
  assert.equal(JSON.parse(String(a.extras)).tipo_fonte, "Casa", "os extras da fonte continuam");
  assert.equal(a.hash_conteudo, antes.hash_conteudo, "o hash do conteúdo não muda");
  assert.equal(a.atualizado_em, antes.atualizado_em, "nem a data da última mudança de conteúdo");

  assert.equal(linha(db, "caixa_csv", "1444419640130").precisao_geo, "bairro");
  const sp = linha(db, "caixa_csv", "1444419640131");
  assert.equal(sp.precisao_geo, "cidade");
  assert.equal(lerGeoAplicado(String(sp.extras))?.motivo, "fora_do_municipio");
  assert.equal(linha(db, "leiloesjudiciais_api", "222069").precisao_geo, "exata");

  const de_novo = aplicarGeocode(db, ARQUIVO);
  assert.deepEqual(de_novo.aplicados, {}, "idempotente");
  assert.equal(de_novo.inalterados, 3);

  // geocode novo rebaixou para cidade: volta a sede
  const rebaixado = aplicarGeocode(db, { ...ARQUIVO, imoveis: { "caixa-1444419640129": { precisao: "cidade", lat: null, lon: null, desvio_m: null, setor: null, motivo: "rural", degrau: "municipio" } } });
  assert.deepEqual(rebaixado.aplicados, { cidade: 1 });
  const c = linha(db, "caixa_csv", "1444419640129");
  assert.equal(c.precisao_geo, "cidade");
  assert.notEqual(c.lat, TRIBOBO.lat);
  assert.equal(lerGeoAplicado(String(c.extras))?.motivo, "rural");
});

test("a coleta seguinte mantém o geocode enquanto o endereço for o mesmo (gravar.ts + manterGeocode)", () => {
  const db = banco();
  aplicarGeocode(db, ARQUIVO);
  // preço novo no CSV: a linha é regravada (hash muda), sem coordenada da fonte
  const base = { uf: "RJ" as const, cidade: "São Gonçalo", modalidade: "venda_online" as const, valor_avaliacao: 251000, cep: null };
  const r = gravarImoveis(db, "caixa_csv", [
    imovelExemplo({ ...base, id_na_fonte: "1444419640129", bairro: "Tribobo", endereco: "Rua Expedicionario Benoni Falcao Gouveia, N. 338, Lt 28, Qd 08", pracas: [{ numero: 0 as const, data: null, valor_minimo: 20000 }], extras: { tipo_fonte: "Casa" } }),
    imovelExemplo({ ...base, id_na_fonte: "1444419640130", bairro: "Tribobo", endereco: "Rua 07, N. Sn", pracas: [{ numero: 0 as const, data: null, valor_minimo: 20000 }] }),
  ], { agora: new Date("2026-10-20T12:00:00Z"), geradoEm: "2026-10-19" });
  assert.equal(r.atualizados, 2);
  const mesmo = linha(db, "caixa_csv", "1444419640129");
  assert.deepEqual([mesmo.lat, mesmo.lon, mesmo.precisao_geo], [TRIBOBO.lat, TRIBOBO.lon, "exata"], "mesmo endereço: o ponto fica");
  assert.equal(lerGeoAplicado(String(mesmo.extras))?.degrau, "pn03");
  const mudou = linha(db, "caixa_csv", "1444419640130");
  assert.equal(mudou.precisao_geo, "cidade", "endereço mudou: volta a sede até o próximo geocode");
  assert.equal(lerGeoAplicado(String(mudou.extras)), null);
  // a fonte passou a trazer coordenada: vale a da fonte
  const fonte = manterGeocode({ uf: "RJ", cidade: "São Gonçalo", bairro: "Tribobo", endereco: "x", lat: -22.86, lon: -43.03, precisao_geo: "exata", extras: null }, { lat: 1, lon: 1, precisao_geo: "exata", extras: mesmo.extras as string });
  assert.equal(fonte, null);
});

test("exportar --site leva lat/lon/precisaoGeo do geocode e não apaga os outros arquivos da pasta", () => {
  const db = banco();
  aplicarGeocode(db, ARQUIVO);
  const pasta = mkdtempSync(join(tmpdir(), "luneta-geocode-"));
  try {
    writeFileSync(join(pasta, "localizacao.json.gz"), "de outra etapa");
    writeFileSync(join(pasta, "localizacao-cidades.json.gz"), "de outra etapa");
    gravarCatalogo(pasta, montarCatalogo(db, { agora: AGORA, cacheCaixa: null }));
    const lista = JSON.parse(gunzipSync(readFileSync(join(pasta, "imoveis.json.gz"))).toString("utf8")) as { colunas: Record<string, unknown[]> };
    const k = lista.colunas.id!.indexOf("caixa-1444419640129");
    assert.ok(k >= 0);
    assert.deepEqual([lista.colunas.lat![k], lista.colunas.lon![k], lista.colunas.precisaoGeo![k]], [TRIBOBO.lat, TRIBOBO.lon, "exata"]);
    const b = lista.colunas.id!.indexOf("caixa-1444419640130");
    assert.equal(lista.colunas.precisaoGeo![b], "bairro");
    assert.ok(existsSync(join(pasta, "localizacao.json.gz")) && existsSync(join(pasta, "localizacao-cidades.json.gz")), "os arquivos da localização ficam");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("principal: uso, arquivo ruim e resumo", () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-geocode-cli-"));
  try {
    const saida: string[] = [];
    const erros: string[] = [];
    assert.equal(principal([], (t) => saida.push(t), (t) => erros.push(t)), 2);
    writeFileSync(join(pasta, "ruim.json"), "{}");
    assert.equal(principal(["--arquivo", join(pasta, "ruim.json"), "--banco", join(pasta, "banco.db")], (t) => saida.push(t), (t) => erros.push(t)), 1);
    assert.match(erros.join("\n"), /formato/);
    writeFileSync(join(pasta, "geocode.json"), JSON.stringify(ARQUIVO));
    assert.equal(principal(["--arquivo", join(pasta, "geocode.json"), "--banco", join(pasta, "banco.db")], (t) => saida.push(t), (t) => erros.push(t)), 0);
    assert.match(saida.join("\n"), /0 imóvel\(is\) gravado\(s\)/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
