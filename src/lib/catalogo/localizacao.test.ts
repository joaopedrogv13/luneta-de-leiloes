/**
 * Nota de localização: leitura dos arquivos de verdade (base/saida/site/localizacao*.json.gz), montagem de
 * LocalizacaoImovel (calculada, aproximada, sem nota, cidade pequena, pendente, alerta de risco), pesos redistribuídos,
 * textos e os exemplos fictícios.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createJiti } from "jiti";
import type { Listing } from "../../content/examples";
import { converterExemplos, localizacaoDosExemplos, resumoDe } from "./exemplos";
import { lerLista, pastaPadrao } from "./instantaneo";
import {
  conferirArquivoLocalizacao, distancia, lerLocalizacao, montarLocalizacao, notaLocalDe, pesosEfetivos, raioRisco, terco,
  type ArquivoLocalizacao, type ArquivoLocalizacaoCidades, type ArquivoLocalizacaoOsm, type DadosLocalizacao,
} from "./localizacao";
import type { ChaveComponenteLocal, LocalizacaoImovel } from "./tipos";

const PESOS: Record<ChaveComponenteLocal, number> = { servicos: 25, transporte: 20, renda: 20, infra: 25, comercio: 5, lazer: 5 };
const somaPesos = (l: LocalizacaoImovel) => l.componentes.filter((c) => c.nota !== null).reduce((s, c) => s + c.peso, 0);
const textoTodo = (l: LocalizacaoImovel) => JSON.stringify(l);

// ---------------------------------------------------------------------------
// Arquivo sintético (5 imóveis, 2 cidades)
// ---------------------------------------------------------------------------

function fixture(): { principal: ArquivoLocalizacao; osm: ArquivoLocalizacaoOsm; cidades: ArquivoLocalizacaoCidades } {
  const ids = ["caixa-1", "caixa-2", "caixa-3", "caixa-4", "caixa-5"];
  const principal: ArquivoLocalizacao = {
    formato: "luneta-localizacao", versao: 1, gerado_em: "2026-10-18", pesos: PESOS,
    situacoes: ["calculada", "aproximada", "sem_nota"], motivos: ["cidade", "rural", "pequena", "sem_cidade", "poucas_celulas", "sem_ponto"],
    precisoes: ["numero", "rua", "bairro", "cidade"],
    renda: { variavel: "V06006", rotulo: "renda típica", valores: "R$ de 2022" },
    fontes: [{ nome: "IBGE, CNEFE 2022", detalhe: "x", licenca: "dados públicos", url: "https://www.ibge.gov.br/" }],
    colunas: {
      id: ids,
      situacao: [0, 1, 2, 2, 0],
      motivo: [null, null, 0, 2, null],
      nota: [72, 41, null, null, 55],
      faixa_min: [null, 33, null, null, null],
      faixa_max: [null, 49, null, null, null],
      precisao: [0, 2, 3, 0, 1],
      desvio_m: [10, 1200, null, 20, 300],
      lat: [-22.86, -22.87, null, -20.1, -22.85],
      lon: [-43.03, -43.04, null, -44.1, -43.02],
      cidade: [3304904, 3304904, 3304904, 3100104, 3304904],
      c_servicos: [80, 40, null, 20, 60],
      c_renda: [60, 30, null, 90, null],
      c_infra: [70, 50, null, 50, 55],
      c_comercio: [50, 45, null, 10, 40],
      mercados_500: [8, 3, null, 1, 5],
      farmacias_500: [2, 1, null, 0, 1],
      padarias_500: [2, 1, null, 0, 1],
      escolas_1k: [6, 4, null, 2, 5],
      saude_1k: [2, 1, null, 1, 2],
      comercio_1k: [356, 200, null, 40, 300],
      renda: [1310, 900, null, 2100, null],
      pavimentacao: [79, 60, null, 90, 80],
      calcada: [75, 55, null, 80, 70],
      iluminacao: [92, 90, null, 95, 90],
      esgoto: [65, 40, null, 70, 60],
      onibus_face: [0, 5, null, 2, 3],
      incompleto_renda: [0, 1, 0, 0, 0],
      risco_m: [null, 0, null, null, 60],
    },
  };
  const osm: ArquivoLocalizacaoOsm = {
    formato: "luneta-localizacao-osm", versao: 1, gerado_em: "2026-10-18", licenca: "ODbL-1.0",
    aviso: "Contém dados do OpenStreetMap, © contribuidores do OpenStreetMap; ODbL.", dados_osm_de: "2026-10-17T20:20:51Z", com_osm: true,
    fonte: { nome: "OpenStreetMap", detalhe: "estações e parques", licenca: "ODbL 1.0, © contribuidores do OpenStreetMap", url: "https://www.openstreetmap.org/copyright" },
    colunas: { id: ids, c_transporte: [62, 50, null, 30, 40], c_lazer: [31, null, null, 70, 20], onibus_500: [1, 0, null, null, 4], estacao_m: [5000, 2400, null, 700, 950], parque_m: [800, 1000, null, 120, 3000] },
    cidades: { "3304904": { comum: { onibus_500: 0, estacao_m: 3470, parque_m: 560 } } },
  };
  const cidades: ArquivoLocalizacaoCidades = {
    formato: "luneta-localizacao-cidades", versao: 1, gerado_em: "2026-10-18",
    cidades: {
      "3304904": { nome: "São Gonçalo", uf: "RJ", moradores: 895560, celulas: 3920, pequena: false, bater: false, imoveis: 1527, fora: {},
        indicadores: { servicos: ["mercados_500", "farmacias_500", "padarias_500", "escolas_1k", "saude_1k"], transporte: ["estacao_m", "onibus_500", "onibus_face"], renda: ["renda"], infra: ["pavimentacao", "calcada", "iluminacao", "esgoto"], comercio: ["comercio_1k"], lazer: ["parque_m"] },
        comum: { mercados_500: 10, farmacias_500: 2, renda: 1510, pavimentacao: 94, comercio_1k: 1127 } },
      "3100104": { nome: "Abadia dos Dourados", uf: "MG", moradores: 6900, celulas: 40, pequena: true, bater: true, imoveis: 1, fora: { lazer: "sem_parque" },
        indicadores: { servicos: ["mercados_500", "escolas_1k", "saude_1k"], transporte: ["estacao_m", "onibus_face"], renda: ["renda"], infra: ["pavimentacao", "calcada", "iluminacao", "esgoto"], comercio: ["comercio_1k"] },
        comum: {} },
    },
  };
  return { principal, osm, cidades };
}

function dados(f = fixture()): DadosLocalizacao {
  return {
    principal: f.principal, osm: f.osm, cidades: f.cidades,
    posicao: new Map((f.principal.colunas.id as string[]).map((id, k) => [id, k])),
    posicaoOsm: new Map((f.osm.colunas.id as string[]).map((id, k) => [id, k])),
    recusados: [],
  };
}

const SG = { cidade: "São Gonçalo", uf: "RJ" };

test("calculada: nota, os 6 componentes na ordem dos pesos, pesos somando 100, indicadores com o comum e as fontes (com o OSM)", () => {
  const l = montarLocalizacao(dados(), "caixa-1", SG)!;
  assert.equal(l.situacao, "calculada");
  assert.equal(l.nota, 72);
  assert.equal(l.faixa, null);
  assert.equal(l.precisao, "numero");
  assert.deepEqual(l.referencia, { nome: "São Gonçalo/RJ", moradores: 895560, celulas: 3920 });
  assert.deepEqual(l.componentes.map((c) => c.chave), ["servicos", "infra", "transporte", "renda", "comercio", "lazer"]);
  assert.deepEqual(l.componentes.map((c) => c.nota), [80, 70, 62, 60, 50, 31]);
  assert.equal(somaPesos(l), 100);
  assert.deepEqual(l.componentes.map((c) => c.peso), [25, 25, 20, 20, 5, 5]);
  const mercados = l.componentes[0]!.indicadores.find((i) => i.chave === "mercados_500")!;
  assert.deepEqual(mercados, { chave: "mercados_500", rotulo: "Mercados a até 500 m", valor: "8", numero: 8, comum: "10" });
  const renda = l.componentes.find((c) => c.chave === "renda")!.indicadores[0]!;
  assert.equal(renda.valor, "R$ 1.310");
  assert.equal(renda.comum, "R$ 1.510");
  const estacao = l.componentes.find((c) => c.chave === "transporte")!.indicadores.find((i) => i.chave === "estacao_m")!;
  assert.equal(estacao.valor, "mais de 5 km");
  assert.equal(estacao.comum, "3,5 km");
  assert.ok(l.fontes.some((f) => f.nome === "OpenStreetMap" && f.licenca.includes("ODbL") && f.detalhe.includes("17/10/2026")));
  assert.equal(l.motivo, null);
  assert.equal(l.alertas.length, 0);
  assert.equal(l.coberturaRisco, false);
  assert.equal(notaLocalDe(dados(), "caixa-1"), 72);
});

test("aproximada (bairro): faixa, nota no meio, renda incompleta e alerta de risco do bairro com a frase obrigatória", () => {
  const l = montarLocalizacao(dados(), "caixa-2", SG)!;
  assert.equal(l.situacao, "aproximada");
  assert.deepEqual(l.faixa, [33, 49]);
  assert.equal(l.nota, 41);
  assert.equal(notaLocalDe(dados(), "caixa-2"), 41);
  assert.match(l.motivo!, /só no bairro.*1,2 km/);
  // lazer sem dado neste ponto: o peso vai para os outros
  assert.equal(l.componentes.find((c) => c.chave === "lazer")!.nota, null);
  assert.equal(somaPesos(l), 100);
  assert.equal(l.componentes.find((c) => c.chave === "renda")!.incompleto, true);
  assert.equal(l.alertas.length, 1);
  assert.equal(l.alertas[0]!.titulo, "Área de risco mapeada no bairro");
  assert.equal(l.alertas[0]!.distanciaM, 0);
  assert.match(l.alertas[0]!.texto, /A ausência de área mapeada não quer dizer que não haja risco/);
});

test("rua com alerta a 60 m; sem renda no ponto o peso dela é redistribuído", () => {
  const l = montarLocalizacao(dados(), "caixa-5", SG)!;
  assert.equal(l.situacao, "calculada");
  assert.equal(l.precisao, "rua");
  assert.equal(l.componentes.find((c) => c.chave === "renda")!.nota, null);
  assert.equal(somaPesos(l), 100);
  assert.equal(l.alertas[0]!.titulo, "Área de risco mapeada perto");
  // na rua, o alerta fala do ponto do endereço, nunca "do imóvel" (M2)
  assert.match(l.alertas[0]!.texto, /a cerca de 60 m do ponto da rua do endereço \(a posição do imóvel é aproximada\)/);
  assert.doesNotMatch(l.alertas[0]!.texto, /do imóvel\./);
  const parque = l.componentes.find((c) => c.chave === "lazer")!.indicadores[0]!;
  assert.equal(parque.valor, "mais de 3 km");
});

test("sem nota: endereço só na cidade (sem ponto, sem indicadores, com o motivo) e cidade pequena (terços, sem número de 0 a 100)", () => {
  const c = montarLocalizacao(dados(), "caixa-3", SG)!;
  assert.equal(c.situacao, "sem_nota");
  assert.equal(c.nota, null);
  assert.equal(c.lat, null);
  assert.match(c.motivo!, /só na cidade/);
  assert.ok(c.componentes.every((x) => x.nota === null && x.indicadores.length === 0));
  assert.equal(c.componentes.length, 6);
  assert.equal(notaLocalDe(dados(), "caixa-3"), null);

  const p = montarLocalizacao(dados(), "caixa-4", { cidade: "Abadia dos Dourados", uf: "MG" })!;
  assert.equal(p.situacao, "sem_nota");
  assert.equal(p.nota, null);
  assert.match(p.motivo!, /6\.900 moradores e 40 áreas habitadas/);
  assert.ok(p.componentes.every((x) => x.nota === null));
  assert.deepEqual(p.componentes.map((x) => x.terco), ["baixo", "medio", "baixo", "alto", "baixo", "alto"]);
  // só os indicadores que entraram na nota da cidade (sem padarias nem farmácias; sem os pontos de ônibus do OSM)
  assert.deepEqual(p.componentes[0]!.indicadores.map((i) => i.chave), ["mercados_500", "escolas_1k", "saude_1k"]);
  assert.deepEqual(p.componentes.find((x) => x.chave === "transporte")!.indicadores.map((i) => i.chave), ["estacao_m", "onibus_face"]);
  assert.equal(p.coberturaRisco, true);
});

test("risco: o raio que foi conferido; imóvel sem ponto numa cidade mapeada não passa por \"conferido\"", () => {
  // São Gonçalo sem mapeamento (fixture): nada foi conferido
  assert.equal(montarLocalizacao(dados(), "caixa-1", SG)!.riscoRaioM, null);
  // cidade pequena com mapeamento, ponto no número: 100 m
  assert.equal(montarLocalizacao(dados(), "caixa-4", { cidade: "Abadia dos Dourados", uf: "MG" })!.riscoRaioM, 100);
  // a mesma cidade com mapeamento
  const f = fixture();
  f.cidades.cidades["3304904"]!.bater = true;
  const d = dados(f);
  assert.equal(montarLocalizacao(d, "caixa-1", SG)!.riscoRaioM, 100);
  // rua com ±300 m: a procura vai até a margem do ponto, não 100 m fixos (revisão final da rodada 4, M2)
  assert.equal(montarLocalizacao(d, "caixa-5", SG)!.riscoRaioM, 300);
  assert.equal(raioRisco(undefined, "rua", 230, true, true), 230);
  assert.equal(raioRisco(undefined, "numero", 40, true, true), 100);
  assert.equal(raioRisco(undefined, "numero", 150, true, true), 150);
  assert.equal(montarLocalizacao(d, "caixa-2", SG)!.riscoRaioM, 500); // bairro: desvio de 1,2 km, no máximo 500 m
  const semPonto = montarLocalizacao(d, "caixa-3", SG)!;
  assert.equal(semPonto.coberturaRisco, true);
  assert.equal(semPonto.riscoRaioM, null);
  assert.equal(semPonto.alertas.length, 0);
  // os raios vêm das regras do arquivo quando existem
  assert.equal(raioRisco({ risco_perto_m: 150, risco_aprox_max_m: 800 }, "bairro", 2000, true, true), 800);
  assert.equal(raioRisco(undefined, "bairro", 300, true, true), 300);
  assert.equal(raioRisco(undefined, "bairro", null, true, true), 100);
  assert.equal(raioRisco(undefined, "cidade", null, true, true), null);
  assert.equal(raioRisco(undefined, "numero", 6, false, true), null);
  assert.equal(montarLocalizacao(d, "caixa-999", SG)!.riscoRaioM, null);
});

test("textos da aproximada e da cidade pequena: as partes são do centro do bairro; a grade tem quadrados de 200 m e de 1 km", () => {
  assert.match(montarLocalizacao(dados(), "caixa-2", SG)!.motivo!, /medidos no centro do bairro, não no imóvel/);
  const p = montarLocalizacao(dados(), "caixa-4", { cidade: "Abadia dos Dourados", uf: "MG" })!;
  assert.match(p.motivo!, /quadrados de 200 m na cidade e de 1 km no campo/);
});

test("rua espalhada (bairro rebaixado por desvio alto): o meio da rua, nunca o centro do bairro (M3)", () => {
  const f = fixture();
  f.principal.colunas.rua_espalhada = [null, 1, null, null, null];
  f.cidades.cidades["3304904"]!.bater = true;
  const l = montarLocalizacao(dados(f), "caixa-2", SG)!;
  assert.equal(l.pontoRuaEspalhada, true);
  assert.match(l.motivo!, /A rua do endereço foi encontrada, mas os endereços dela se espalham por cerca de 1,2 km/);
  assert.doesNotMatch(l.motivo!, /centro do bairro/);
  assert.match(l.alertas[0]!.texto, /^O meio da rua do endereço fica dentro de uma área de risco mapeada/);
  assert.equal(l.alertas[0]!.titulo, "Área de risco mapeada perto");
  // sem a coluna (arquivo antigo), o bairro de sempre
  assert.equal(montarLocalizacao(dados(), "caixa-2", SG)!.pontoRuaEspalhada, undefined);
});

test("cidade pequena: o porquê é o critério que valeu, não \"tão poucas áreas\" (M6)", () => {
  const p = montarLocalizacao(dados(), "caixa-4", { cidade: "Abadia dos Dourados", uf: "MG" })!;
  assert.match(p.motivo!, /com menos de 20\.000 moradores, poucas casas mudariam muito a posição de 0 a 100/);
  assert.doesNotMatch(p.motivo!, /tão poucas áreas/);
});

test("pendente: imóvel fora do arquivo; sem o arquivo principal, null", () => {
  const l = montarLocalizacao(dados(), "caixa-999", SG)!;
  assert.equal(l.situacao, "pendente");
  assert.equal(l.nota, null);
  assert.equal(l.componentes.length, 6);
  assert.match(l.motivo!, /ainda não foi calculada/);
  // o recálculo é manual: a data do último, sem prometer "a cada atualização" (M7)
  assert.match(l.motivo!, /depois do último cálculo \(18\/10\/2026\)\. A nota é recalculada de tempos em tempos\./);
  assert.equal(montarLocalizacao({ ...dados(), principal: null }, "caixa-1", SG), null);
  assert.equal(notaLocalDe({ ...dados(), principal: null }, "caixa-1"), null);
});

test("sem o arquivo do OSM: transporte e lazer sem nota, sem a fonte do OSM, pesos redistribuídos", () => {
  const l = montarLocalizacao({ ...dados(), osm: null, posicaoOsm: new Map() }, "caixa-1", SG)!;
  assert.equal(l.componentes.find((c) => c.chave === "transporte")!.nota, null);
  assert.equal(l.componentes.find((c) => c.chave === "lazer")!.nota, null);
  assert.equal(somaPesos(l), 100);
  assert.ok(!l.fontes.some((f) => f.nome === "OpenStreetMap"));
  // o ponto de ônibus na face (Censo) continua no transporte
  assert.deepEqual(l.componentes.find((c) => c.chave === "transporte")!.indicadores.map((i) => i.chave), ["onibus_face"]);
});

test("textos: nunca \"risco zero\" nem \"sem risco\"; a cidade sem mapeamento vem como coberturaRisco false", () => {
  for (const id of ["caixa-1", "caixa-2", "caixa-3", "caixa-4", "caixa-5", "caixa-999"]) {
    const t = textoTodo(montarLocalizacao(dados(), id, SG)!).toLowerCase();
    assert.ok(!t.includes("risco zero") && !t.includes("sem risco"), id);
  }
});

test("pesosEfetivos, terco e distancia", () => {
  assert.deepEqual(pesosEfetivos(PESOS, ["servicos", "transporte", "renda", "infra", "comercio", "lazer"]), PESOS);
  const sem = pesosEfetivos(PESOS, ["servicos", "transporte", "renda", "infra", "comercio"]);
  assert.equal(Object.values(sem).reduce((a, b) => a + b, 0), 100);
  assert.equal(sem.lazer, 0);
  assert.deepEqual(pesosEfetivos(PESOS, ["renda"]), { servicos: 0, transporte: 0, renda: 100, infra: 0, comercio: 0, lazer: 0 });
  assert.equal(terco(10), "baixo");
  assert.equal(terco(50), "medio");
  assert.equal(terco(90), "alto");
  assert.equal(terco(null), null);
  assert.equal(distancia(654), "650 m");
  assert.equal(distancia(1234), "1,2 km");
  assert.equal(distancia(5000, 5000), "mais de 5 km");
});

test("conferência dos arquivos: formato, versão e aviso da ODbL", () => {
  const f = fixture();
  assert.equal(conferirArquivoLocalizacao(f.principal, "luneta-localizacao"), null);
  assert.equal(conferirArquivoLocalizacao(f.osm, "luneta-localizacao-osm"), null);
  assert.equal(conferirArquivoLocalizacao(f.cidades, "luneta-localizacao-cidades"), null);
  assert.match(conferirArquivoLocalizacao({ ...f.principal, versao: 2 }, "luneta-localizacao")!, /formato 2/);
  assert.match(conferirArquivoLocalizacao({ ...f.osm, aviso: "" }, "luneta-localizacao-osm")!, /ODbL/);
  const quebrado = { ...f.principal, colunas: { ...f.principal.colunas, nota: [1] } };
  assert.match(conferirArquivoLocalizacao(quebrado, "luneta-localizacao")!, /nota/);
});

test("lerLocalizacao numa pasta: arquivo recusado fica de fora sem derrubar; pasta vazia não é erro", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "loc-"));
  try {
    const vazia = await lerLocalizacao(pasta);
    assert.equal(vazia.principal, null);
    const f = fixture();
    writeFileSync(join(pasta, "localizacao.json.gz"), gzipSync(JSON.stringify(f.principal)));
    writeFileSync(join(pasta, "localizacao-osm.json.gz"), gzipSync(JSON.stringify({ ...f.osm, versao: 9 })));
    writeFileSync(join(pasta, "localizacao-cidades.json.gz"), gzipSync(JSON.stringify(f.cidades)));
    const d = await lerLocalizacao(pasta);
    assert.ok(d.principal);
    assert.equal(d.osm, null);
    assert.equal(d.recusados.length, 1);
    assert.equal(montarLocalizacao(d, "caixa-1", SG)!.nota, 72);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Arquivos de verdade
// ---------------------------------------------------------------------------

test("arquivos reais: todo imóvel do instantâneo tem linha; o caso do dono (São Gonçalo) monta com nota e fontes", async () => {
  const [d, lista] = await Promise.all([lerLocalizacao(pastaPadrao()), lerLista()]);
  assert.ok(d.principal && d.osm && d.cidades, `arquivos ausentes ou recusados: ${JSON.stringify(d.recusados)}`);
  assert.equal(d.recusados.length, 0);
  const semLinha = lista.itens.filter((i) => !d.posicao.has(i.id));
  assert.equal(semLinha.length, 0, `${semLinha.length} imóveis sem linha (o instantâneo mudou: rode base/fontes/localizacao/nota.py)`);
  assert.deepEqual([...d.posicaoOsm.keys()], [...d.posicao.keys()]);
  const k = lista.itens.findIndex((i) => i.id === "caixa-1444419640129");
  if (k >= 0) {
    const i = lista.itens[k]!;
    const l = montarLocalizacao(d, i.id, i)!;
    assert.equal(l.situacao, "calculada");
    assert.ok(l.nota !== null && l.nota >= 0 && l.nota <= 100);
    assert.equal(l.referencia?.nome, "São Gonçalo/RJ");
    assert.equal(somaPesos(l), 100);
    assert.ok(l.fontes.some((f) => f.nome.startsWith("IBGE")));
    assert.ok(l.fontes.some((f) => f.nome === "OpenStreetMap"));
  }
  // situações e distribuição: calculadas entre 0 e 100; aproximadas com faixa; sem nota sem número
  let calc = 0;
  let aprox = 0;
  for (const i of lista.itens.slice(0, 4000)) {
    const l = montarLocalizacao(d, i.id, i)!;
    if (l.situacao === "calculada") {
      calc++;
      assert.ok(l.nota! >= 0 && l.nota! <= 100);
      assert.equal(somaPesos(l), 100, i.id);
    } else if (l.situacao === "aproximada") {
      aprox++;
      assert.ok(l.faixa && l.faixa[0] <= l.nota! && l.nota! <= l.faixa[1], i.id);
    } else assert.equal(l.nota, null);
    assert.ok(!textoTodo(l).toLowerCase().includes("risco zero"));
  }
  assert.ok(calc > 1000 && aprox > 100, `calculadas ${calc}, aproximadas ${aprox}`);
});

// ---------------------------------------------------------------------------
// Exemplos fictícios
// ---------------------------------------------------------------------------

/** src/content/examples.ts usa o alias "@/" do Next: aqui ele aponta para src/ (como em exemplos.test.ts). */
async function carregarExemplos(): Promise<Listing[]> {
  const jiti = createJiti(__filename, { alias: { "@/": `${join(process.cwd(), "src")}/` } });
  return (await jiti.import<{ LISTINGS: Listing[] }>(join(process.cwd(), "src", "content", "examples.ts"))).LISTINGS;
}

test("exemplos: nota fictícia coerente, marcada como exemplo, e a mesma no resumo", async () => {
  const LISTINGS = await carregarExemplos();
  const agora = new Date("2026-10-18T12:00:00Z");
  const locs = localizacaoDosExemplos(LISTINGS, agora);
  const resumos = converterExemplos(LISTINGS, agora).map(resumoDe);
  assert.equal(locs.size, LISTINGS.length);
  for (const r of resumos) {
    const l = locs.get(r.id)!;
    assert.equal(l.situacao, "calculada");
    assert.equal(r.notaLocal, l.nota);
    assert.equal(l.componentes.length, 6);
    assert.equal(somaPesos(l), 100);
    assert.match(l.motivo!, /Exemplo fictício/);
    assert.deepEqual(l.fontes.map((f) => f.nome), ["Exemplo fictício"]);
    // coerência: a nota fica perto da média pelos pesos (não é um número solto)
    const media = l.componentes.reduce((s, c) => s + c.peso * c.nota!, 0) / 100;
    assert.ok(Math.abs(l.nota! - media) <= 6, `${r.id}: nota ${l.nota}, média ${media}`);
  }
});
