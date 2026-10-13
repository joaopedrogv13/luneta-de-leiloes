import { test } from "node:test";
import assert from "node:assert/strict";
import { montarExportacao } from "../exportar.ts";
import { garantirFonte, gravarImoveis } from "../gravar.ts";
import { formatarStatus, relatorioStatus } from "../status.ts";
import { bancoEmMemoria, conectorFalso, imovelExemplo } from "../testes/apoio.ts";

const AGORA = new Date("2026-10-12T12:00:00Z");

test("gravação geocodifica e gera a mesma chave em fontes diferentes; exportação leva mapa e código IBGE", () => {
  const db = bancoEmMemoria();
  garantirFonte(db, conectorFalso({ id: "banco", registros: () => [] }), AGORA);
  garantirFonte(db, conectorFalso({ id: "leiloeiro", registros: () => [] }), AGORA);

  // Caixa: sem coordenada, cidade em caixa alta e sem acento.
  const daCaixa = imovelExemplo({
    id_na_fonte: "10005120", uf: "AC", cidade: "CRUZEIRO DO SUL", bairro: "BAIRRO COHAB",
    endereco: "RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10", cep: null, lat: null, lon: null,
  });
  const semCidade = imovelExemplo({ id_na_fonte: "8444435692870", uf: "CE", cidade: "QUEIMADAS", endereco: "RUA MANOEL MANDUCA DA SILVA, N. 626, QD 09," });
  const r1 = gravarImoveis(db, "banco", [daCaixa, semCidade], { agora: AGORA });
  assert.equal(r1.novos, 2);
  assert.match(r1.avisos.join("\n"), /Geo: 1 imóvel\(is\) com alerta \(8444435692870: cidade não reconhecida: "QUEIMADAS"\/CE/);

  // Leiloeiro: o mesmo terreno, outra grafia, com coordenada de Street View.
  const doLeiloeiro = imovelExemplo({
    id_na_fonte: "lote-77", uf: "AC", cidade: "Cruzeiro do Sul", bairro: "Cohab",
    endereco: "R. do Purus, s/nº, Qd. 272, Lt. 10", lat: -7.6301, lon: -72.6702, precisao_geo: "rua",
  });
  const r2 = gravarImoveis(db, "leiloeiro", [doLeiloeiro], { agora: AGORA });
  assert.deepEqual(r2.avisos, []);

  const linhas = db.prepare("SELECT fonte_id, id_na_fonte, lat, lon, precisao_geo, chave_dedup, chave_endereco FROM imovel ORDER BY id").all();
  const [caixa, queimadas, leiloeiro] = linhas;
  assert.equal(caixa?.precisao_geo, "cidade");
  assert.equal(caixa?.lat, -7.62762, "sede de Cruzeiro do Sul");
  assert.equal(leiloeiro?.precisao_geo, "rua");
  assert.equal(leiloeiro?.lat, -7.6301);
  assert.equal(caixa?.chave_endereco, "end:1200203:rua purus:sn:lt 10 qd 272");
  assert.equal(leiloeiro?.chave_endereco, caixa?.chave_endereco, "mesma chave nas duas fontes");
  assert.equal(leiloeiro?.chave_dedup, caixa?.chave_dedup);
  assert.equal(queimadas?.lat, null);
  assert.match(String(queimadas?.chave_endereco), /^end:ce-queimadas:rua manoel manduca silva:626:qd 9$/);

  const status = relatorioStatus(db);
  assert.deepEqual(status.geo, [{ precisao: "cidade", ativos: 1 }, { precisao: "rua", ativos: 1 }, { precisao: "sem", ativos: 1 }]);
  assert.deepEqual(status.duplicatas, { grupos: 1, imoveis: 2, gruposEntreFontes: 1 });
  assert.deepEqual(status.mesmoImovel, { grupos: 1, imoveis: 2, gruposEntreFontes: 1, enderecosComMatriculasDiferentes: 0 });
  assert.match(formatarStatus(status), /Coordenadas \(ativos, por precisão\): cidade 1 · rua 1 · sem 1\nDuplicatas \(mesma chave_dedup\): 1 grupo\(s\) com 2 anúncios, 1 entre fontes diferentes/);
  assert.match(formatarStatus(status), /Mesmo imóvel \(chave_dedup ou chave_endereco\): 1 grupo\(s\) com 2 anúncios, 1 entre fontes diferentes\n/);

  // Linha gravada antes da geocodificação: a exportação resolve pela cidade.
  db.prepare("UPDATE imovel SET lat = NULL, lon = NULL, precisao_geo = NULL WHERE id_na_fonte = '10005120'").run();
  const exportacao = montarExportacao(db, { agora: AGORA });
  const porId = new Map(exportacao.imoveis.map((i) => [i.id_na_fonte, i]));
  const e1 = porId.get("10005120");
  assert.deepEqual([e1?.lat, e1?.precisao_geo, e1?.codigo_ibge], [-7.62762, "cidade", "1200203"]);
  assert.equal(e1?.chave_endereco, "end:1200203:rua purus:sn:lt 10 qd 272", "a exportação leva as duas chaves");
  assert.deepEqual(e1?.mapa, [39.9, 132.8], "x = 8,7411 × lon + 675,197; y pela Mercator do site");
  const e2 = porId.get("lote-77");
  assert.deepEqual([e2?.precisao_geo, e2?.codigo_ibge], ["rua", "1200203"]);
  assert.ok(e2?.mapa);
  const e3 = porId.get("8444435692870");
  assert.deepEqual([e3?.lat, e3?.mapa, e3?.codigo_ibge], [null, null, null], "sem cidade reconhecida, fora do mapa");
});

test("status: fonte com matrícula e fonte sem matrícula se juntam pelo endereço; apartamentos diferentes, não", () => {
  const db = bancoEmMemoria();
  garantirFonte(db, conectorFalso({ id: "caixa", registros: () => [] }), AGORA);
  garantirFonte(db, conectorFalso({ id: "leiloeiro", registros: () => [] }), AGORA);
  // Caixa sem --detalhes: sem matrícula.
  const caixa = imovelExemplo({ id_na_fonte: "c1", cidade: "SAO PAULO", bairro: "VILA PRUDENTE", endereco: "RUA FREI ANTONIO DE GUADALUPE, N. 67, Apto 21" });
  gravarImoveis(db, "caixa", [caixa], { agora: AGORA });
  // Leiloeiro: o mesmo apartamento, com matrícula; e dois apartamentos do mesmo prédio ("apartamento nº").
  const comMatricula = imovelExemplo({
    id_na_fonte: "l1", url: "https://exemplo.test/imovel/l1", bairro: null, matricula: "147.300", cartorio: "6º Cartório de Registro de Imóveis de São Paulo/SP",
    endereco: "Rua Frei Antônio de Guadalupe, nº 67, apto 21, Vila Prudente, São Paulo/SP",
  });
  const ap91 = imovelExemplo({ id_na_fonte: "l2", url: "https://exemplo.test/imovel/l2", bairro: null, endereco: "Rua Doutor Melo Alves, nº 640, apartamento nº 91, Cerqueira César, São Paulo/SP" });
  const ap12 = imovelExemplo({ id_na_fonte: "l3", url: "https://exemplo.test/imovel/l3", bairro: null, endereco: "Rua Doutor Melo Alves, nº 640, apartamento nº 12, Cerqueira César, São Paulo/SP" });
  gravarImoveis(db, "leiloeiro", [comMatricula, ap91, ap12], { agora: AGORA });

  const chaves = db.prepare("SELECT id_na_fonte, chave_dedup, chave_endereco FROM imovel ORDER BY id_na_fonte").all();
  const porId = new Map(chaves.map((l) => [String(l.id_na_fonte), l]));
  assert.equal(porId.get("l1")?.chave_dedup, "mat:3550308:6:147300");
  assert.equal(porId.get("l1")?.chave_endereco, porId.get("c1")?.chave_endereco);
  assert.notEqual(porId.get("l2")?.chave_dedup, porId.get("l3")?.chave_dedup);

  const status = relatorioStatus(db);
  assert.deepEqual(status.duplicatas, { grupos: 0, imoveis: 0, gruposEntreFontes: 0 }, "a chave_dedup sozinha não junta matrícula com endereço");
  assert.deepEqual(status.mesmoImovel, { grupos: 1, imoveis: 2, gruposEntreFontes: 1, enderecosComMatriculasDiferentes: 0 });
});
