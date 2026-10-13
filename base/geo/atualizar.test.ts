import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarClienteHttp, USER_AGENT_PADRAO } from "../util/http.ts";
import {
  FONTES_GEO,
  formatarMunicipiosCsv,
  gravarJuntos,
  lerDistritosDtb,
  lerMalha,
  lerMunicipiosKelvins,
  prepararAtualizacao,
  principal,
  urlDaFonte,
  type EntradaAtualizacao,
} from "./atualizar.ts";
import { ARQUIVO_APELIDOS, ARQUIVO_MUNICIPIOS, CODIGO_UF, lerApelidos, tabelaCsv, tabelaPadrao, type Distrito, type Municipio } from "./municipios.ts";

const atuais = tabelaPadrao().municipios;

/** Os municípios atuais no formato do kelvins (o que o script baixa). */
function textoKelvins(municipios: readonly Municipio[]): string {
  const linhas = municipios.map((m) => [m.codigo_ibge, m.nome, m.lat, m.lon, m.capital ? 1 : 0, CODIGO_UF[m.uf], "0000", "11", "America/Sao_Paulo"].join(","));
  return ["codigo_ibge,nome,latitude,longitude,capital,codigo_uf,siafi_id,ddd,fuso_horario", ...linhas].join("\n") + "\n";
}

/** Dois distritos por município (sede e outro), como na DTB. */
function distritosFalsos(municipios: readonly Municipio[]): Distrito[] {
  return municipios.flatMap((m) => [
    { codigo_distrito: `${m.codigo_ibge}05`, codigo_ibge: m.codigo_ibge, nome: m.nome },
    { codigo_distrito: `${m.codigo_ibge}10`, codigo_ibge: m.codigo_ibge, nome: `Distrito ${m.codigo_ibge}` },
  ]);
}

/** Malha com um quadrado de ±0,05° em volta de cada sede. */
function malhaQuadrada(municipios: readonly Municipio[]): string {
  const features = municipios.map((m) => ({
    type: "Feature",
    properties: { id: m.codigo_ibge },
    geometry: {
      type: "Polygon",
      coordinates: [[[m.lon - 0.05, m.lat - 0.05], [m.lon + 0.05, m.lat - 0.05], [m.lon + 0.05, m.lat + 0.05], [m.lon - 0.05, m.lat + 0.05], [m.lon - 0.05, m.lat - 0.05]]],
    },
  }));
  return JSON.stringify({ type: "FeatureCollection", features });
}

function entrada(sobrepor: Partial<EntradaAtualizacao> = {}): EntradaAtualizacao {
  return {
    municipios: lerMunicipiosKelvins(textoKelvins(atuais)),
    distritos: distritosFalsos(atuais),
    malha: lerMalha(malhaQuadrada(atuais)),
    correcoes: [],
    atuais: [...atuais],
    ...sobrepor,
  };
}

test("leitura das fontes: cabeçalho e linhas conferidos", () => {
  assert.throws(() => lerMunicipiosKelvins("<html>desafio</html>"), /cabeçalho inesperado/);
  assert.throws(() => lerMunicipiosKelvins("codigo_ibge,nome,latitude,longitude,capital,codigo_uf\n123,X,1,2,0,35\n"), /linha 2 inválida/);
  assert.throws(() => lerMunicipiosKelvins("codigo_ibge,nome,latitude,longitude,capital,codigo_uf\n3304557,Rio,-22.9,-43.2,1,35\n"), /não é da UF/);
  const [m] = lerMunicipiosKelvins("\uFEFFcodigo_ibge,nome,latitude,longitude,capital,codigo_uf,siafi_id\n1100015,Alta Floresta D'Oeste,-11.9283,-61.9953,0,11,0001\n");
  assert.deepEqual(m, { codigo_ibge: "1100015", uf: "RO", nome: "Alta Floresta D'Oeste", lat: -11.9283, lon: -61.9953, capital: false, raio_km: null });
  assert.throws(() => lerDistritosDtb("id,nome\n"), /cabeçalho/);
  assert.throws(() => lerMalha("[]"), /FeatureCollection/);
  assert.equal(urlDaFonte(FONTES_GEO.municipios), "https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861/csv/municipios.csv");
});

test("preparação: tudo certo grava municípios com raio e só distritos de nome próprio", () => {
  const r = prepararAtualizacao(entrada());
  assert.deepEqual(r.erros, []);
  assert.equal(r.municipios.length, 5571);
  assert.equal(r.municipios[0]?.raio_km, 8, "quadrado de ±0,05°: canto a ~7,8 km");
  assert.equal(r.distritos.length, 5571, "o distrito-sede (mesmo nome) não é gravado");
  assert.match(r.relatorio.join("\n"), /malha: 5571 municípios conferidos/);
});

test("sede fora do município bloqueia (e sugere a correção); correção resolve", () => {
  const municipios = lerMunicipiosKelvins(textoKelvins(atuais));
  const alvo = municipios.find((m) => m.codigo_ibge === "3550308");
  assert.ok(alvo);
  const original = { lat: alvo.lat, lon: alvo.lon };
  alvo.lat -= 3; // ~330 km ao sul, no mar
  const r = prepararAtualizacao(entrada({ municipios }));
  assert.equal(r.erros.length, 2, "fora da malha e mudou mais de 50 km");
  assert.match(r.erros.join("\n"), /São Paulo\/SP \(3550308\) a \d+ km do município\. Corrija em correcoes\.csv, por exemplo: 3550308,-23\.53\d*,-46\.63\d*/);
  const forcado = prepararAtualizacao(entrada({ municipios, forcar: true }));
  assert.equal(forcado.erros.length, 1, "--forcar não passa por cima de sede fora do município");
  const corrigido = prepararAtualizacao(entrada({ municipios, correcoes: [{ codigo_ibge: "3550308", ...original, motivo: "teste" }] }));
  assert.deepEqual(corrigido.erros, []);
  assert.match(corrigido.relatorio[0] ?? "", /1 sedes corrigidas/);
});

test("volume, capitais e comparação com o arquivo atual", () => {
  const poucos = prepararAtualizacao(entrada({ municipios: lerMunicipiosKelvins(textoKelvins(atuais.slice(0, 5000))), malha: null }));
  assert.ok(poucos.erros.some((e) => /5000 municípios/.test(e)));
  assert.ok(poucos.erros.some((e) => /sumiram/.test(e)));
  const semCapital = lerMunicipiosKelvins(textoKelvins(atuais)).map((m) => ({ ...m, capital: m.codigo_ibge === "5300108" ? false : m.capital }));
  assert.ok(prepararAtualizacao(entrada({ municipios: semCapital, malha: null })).erros.some((e) => /27 capitais/.test(e)));
  const renomeado = lerMunicipiosKelvins(textoKelvins(atuais)).map((m) => (m.codigo_ibge === "3515004" ? { ...m, nome: "Embu das Artes Nova" } : m));
  const r = prepararAtualizacao(entrada({ municipios: renomeado, malha: null }));
  assert.deepEqual(r.erros, []);
  assert.match(r.relatorio.join("\n"), /renomeados: Embu das Artes → Embu das Artes Nova\/SP/);
  assert.match(r.relatorio.join("\n"), /raio_km mantido/);
  assert.equal(r.municipios.find((m) => m.codigo_ibge === "1500602")?.raio_km, 753, "sem malha, o raio vem do arquivo atual");
  const poucosDistritos = prepararAtualizacao(entrada({ distritos: distritosFalsos(atuais).slice(0, 100), malha: null }));
  assert.ok(poucosDistritos.erros.some((e) => /distritos/.test(e)));
});

test("apelido ou correção com código que sumiu da fonte bloqueia (a tabela não carregaria depois)", () => {
  const apelidos = lerApelidos(tabelaCsv(readFileSync(ARQUIVO_APELIDOS, "utf8")));
  assert.deepEqual(prepararAtualizacao(entrada({ apelidos })).erros, [], "os apelidos de hoje passam");
  // Açu (2400208, apelido "Assu") some da fonte: menos de 10 remoções, então só o apelido bloqueia.
  const semAcu = lerMunicipiosKelvins(textoKelvins(atuais.filter((m) => m.codigo_ibge !== "2400208")));
  const r = prepararAtualizacao(entrada({ municipios: semAcu, apelidos, forcar: true }));
  assert.deepEqual(r.erros, ['apelidos.csv: "Assu"/RN aponta para 2400208, que sumiu da fonte; corrija o apelido antes de atualizar.']);
  const outraUf = prepararAtualizacao(entrada({ apelidos: [{ uf: "SP", nome: "Assu", codigo_ibge: "2400208", tipo: "", observacao: "" }] }));
  assert.match(outraUf.erros.join("\n"), /de outra UF/);
  const correcaoOrfa = prepararAtualizacao(entrada({ municipios: semAcu, correcoes: [{ codigo_ibge: "2400208", lat: -5.57, lon: -36.9, motivo: "teste" }] }));
  assert.match(correcaoOrfa.erros.join("\n"), /correcoes\.csv: 2400208 sumiu da fonte/);
});

test("gravarJuntos: os dois arquivos trocam juntos; se uma escrita falha, nenhum troca", () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-geo-juntos-"));
  try {
    const a = join(pasta, "a.csv");
    const b = join(pasta, "b.csv");
    writeFileSync(a, "A0");
    writeFileSync(b, "B0");
    gravarJuntos([[a, "A1"], [b, "B1"]]);
    assert.deepEqual([readFileSync(a, "utf8"), readFileSync(b, "utf8")], ["A1", "B1"]);
    // Destino numa pasta que não existe: a segunda escrita falha antes de qualquer rename.
    assert.throws(() => gravarJuntos([[a, "A2"], [join(pasta, "nao-existe", "b.csv"), "B2"]]));
    assert.equal(readFileSync(a, "utf8"), "A1", "o primeiro arquivo não foi trocado");
    assert.deepEqual(readdirSync(pasta).filter((n) => n.endsWith(".tmp")), [], "sem temporários sobrando");
    assert.equal(existsSync(join(pasta, "nao-existe")), false);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("principal: falha de rede ou conteúdo ruim não toca nos arquivos; sucesso grava", async () => {
  const pasta = mkdtempSync(join(tmpdir(), "luneta-geo-"));
  try {
    const destinoMunicipios = join(pasta, "municipios.csv");
    const destinoDistritos = join(pasta, "distritos.csv");
    writeFileSync(destinoMunicipios, "ORIGINAL");
    writeFileSync(destinoDistritos, "ORIGINAL");
    const saida: string[] = [];
    const urls: string[] = [];
    const http = (resposta: (url: string) => Response | Promise<Response>) =>
      criarClienteHttp({
        tentativas: 1,
        intervaloMinimoMs: 0,
        esperar: async () => undefined,
        fetch: async (entradaFetch, init) => {
          const url = String(entradaFetch);
          urls.push(url);
          assert.equal(new Headers(init?.headers).get("user-agent"), USER_AGENT_PADRAO);
          if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
          return resposta(url);
        },
      });
    const deps = { destinoMunicipios, destinoDistritos, saida: (t: string) => void saida.push(t) };

    // Arquivo truncado (página de erro no lugar do CSV).
    assert.equal(await principal(["--sem-malha"], { ...deps, http: http(() => new Response("<html>Rate limit</html>")) }), 1);
    assert.equal(readFileSync(destinoMunicipios, "utf8"), "ORIGINAL");
    assert.match(saida.join("\n"), /conteúdo inesperado[\s\S]*Nada foi gravado/);
    assert.ok(urls.includes(urlDaFonte(FONTES_GEO.municipios)), "baixa da URL fixada por commit");

    // Rede caiu.
    saida.length = 0;
    assert.equal(await principal(["--sem-malha"], { ...deps, http: http(() => Promise.reject(new Error("ECONNRESET"))) }), 1);
    assert.equal(readFileSync(destinoMunicipios, "utf8"), "ORIGINAL");
    assert.equal(readFileSync(destinoDistritos, "utf8"), "ORIGINAL");

    // CSV válido mas com só 10 municípios: reprovado na conferência.
    saida.length = 0;
    const pequeno = textoKelvins(atuais.slice(0, 10));
    const dtb = ["id,id_municipio,id_microrregiao,id_mesorregiao,id_estado,nome", ...distritosFalsos(atuais).map((d) => `${d.codigo_distrito},${d.codigo_ibge},0,0,0,${d.nome}`)].join("\n");
    const servir = (municipios: string) => (url: string) => new Response(url.includes("distritos") ? dtb : municipios);
    assert.equal(await principal(["--sem-malha"], { ...deps, http: http(servir(pequeno)) }), 1);
    assert.equal(readFileSync(destinoMunicipios, "utf8"), "ORIGINAL");
    assert.match(saida.join("\n"), /10 municípios; o esperado/);

    // Arquivos locais (--arquivo-*) com os dados de hoje: grava e o resultado é o arquivo atual.
    writeFileSync(destinoMunicipios, readFileSync(ARQUIVO_MUNICIPIOS, "utf8"));
    const arquivoKelvins = join(pasta, "kelvins.csv");
    const arquivoDtb = join(pasta, "dtb.csv");
    writeFileSync(arquivoKelvins, textoKelvins(atuais));
    writeFileSync(arquivoDtb, dtb);
    const codigo = await principal(["--sem-malha", "--arquivo-municipios", arquivoKelvins, "--arquivo-distritos", arquivoDtb], {
      ...deps,
      http: http(() => {
        throw new Error("não devia usar a rede");
      }),
    });
    assert.equal(codigo, 0, saida.join("\n"));
    assert.equal(readFileSync(destinoMunicipios, "utf8"), formatarMunicipiosCsv(atuais));
    assert.equal(readFileSync(destinoMunicipios, "utf8"), readFileSync(ARQUIVO_MUNICIPIOS, "utf8"), "ida e volta sem perda");
    assert.equal(readFileSync(destinoDistritos, "utf8").split("\n").length, 5571 + 2);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
