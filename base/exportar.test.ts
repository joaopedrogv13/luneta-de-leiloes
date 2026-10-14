import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { principal } from "./cli.ts";
import {
  ARQUIVO_AMOSTRA_SITE,
  ARQUIVO_CATALOGO_LISTA,
  areaPrincipal,
  ARQUIVO_ESTATISTICAS_UF,
  CAMPOS_LINHA,
  condicoesDePagamento,
  dataCurtaSite,
  deColunas,
  exportarSite,
  gravarCatalogo,
  montarCatalogo,
  montarExportacao,
  PASTA_CATALOGO,
  PASTA_CATALOGO_DETALHES,
  PASTA_SITE_PADRAO,
  paraListing,
  parteDoId,
  selecionarAmostra,
  unificarBairros,
  VERSAO_CATALOGO,
  type AmostraSite,
  type EstatisticasUf,
  type LinhaCatalogo,
  type ListaCatalogo,
  type ListingSite,
  type ParteCatalogo,
} from "./exportar.ts";
import { garantirFonte, gravarImoveis } from "./gravar.ts";
import { rodarRiscos } from "./riscos/motor.ts";
import { TAGS } from "./riscos/tags.ts";
import { bancoEmMemoria, conectorFalso, httpProibido, imovelExemplo } from "./testes/apoio.ts";
import type { ImovelNormalizado } from "./tipos.ts";
import { mascararDocumentos } from "./util/lgpd.ts";

const AGORA = new Date("2026-10-12T12:00:00Z");

/** Banco com uma "Caixa" e uma "Leilões Judiciais" falsas (ids reais, dados fictícios) e riscos rodados. */
function bancoComDuasFontes(caixa: ImovelNormalizado[], lj: ImovelNormalizado[]) {
  const db = bancoEmMemoria();
  garantirFonte(db, conectorFalso({ id: "caixa_csv", registros: () => [] }), AGORA);
  garantirFonte(db, conectorFalso({ id: "leiloesjudiciais_api", registros: () => [] }), AGORA);
  gravarImoveis(db, "caixa_csv", caixa, { agora: AGORA, geradoEm: "2026-10-08" });
  gravarImoveis(db, "leiloesjudiciais_api", lj, { agora: AGORA, geradoEm: "2026-10-11T01:35:00.000Z" });
  rodarRiscos(db, { agora: AGORA });
  return db;
}

const vendaDireta = (id: string, sobrepor: Partial<ImovelNormalizado> = {}): ImovelNormalizado =>
  imovelExemplo({
    id_na_fonte: id,
    url: `https://exemplo.test/caixa/${id}`,
    titulo: "Casa 2 quartos",
    tipo: "casa",
    uf: "AL",
    cidade: "MACEIO",
    bairro: "Tabuleiro do Martins",
    endereco: `Rua Exemplo, ${id}`,
    modalidade: "venda_direta",
    modalidade_fonte: "Venda Direta Online",
    judicial: false,
    valor_avaliacao: 200000,
    preco: 116000,
    pracas: [{ numero: 0, data: null, valor_minimo: 116000 }],
    descricao: "Casa, 2 quartos.",
    fotos: [{ url: `https://exemplo.test/fotos/F${id}21.jpg`, origem: "padrao_url", ordem: 0 }],
    documentos: [],
    ...sobrepor,
  });

test("dataCurtaSite: dia e mês em Brasília, como nos cartões do site", () => {
  assert.equal(dataCurtaSite("2026-10-19T19:00:00.000Z"), "19 out");
  assert.equal(dataCurtaSite("2026-11-01T02:00:00.000Z"), "31 out", "23h de 31/10 em Brasília");
  assert.equal(dataCurtaSite("2026-12-05"), "5 dez");
  assert.equal(dataCurtaSite(null), "data não informada");
});

test("paraListing: campos do tipo Listing do site, tags confirmadas separadas das que aguardam revisão", () => {
  const db = bancoComDuasFontes(
    [vendaDireta("100"), vendaDireta("101", { tipo: "rural", titulo: "Imóvel rural 10 ha" })],
    [
      imovelExemplo({
        id_na_fonte: "222141",
        url: "https://exemplo.test/lote/1/222141",
        titulo: "Apartamento 3 quartos",
        bairro: null,
        descricao: "Apartamento. Imóvel desocupado.",
        judicial: true,
        aceita_financiamento: null,
        valor_avaliacao: 400000,
        pracas: [
          { numero: 1, data: "2026-10-05T13:00:00.000Z", valor_minimo: 400000 },
          { numero: 2, data: "2026-10-19T19:00:00.000Z", valor_minimo: 200000 },
        ],
        fotos: [
          { url: "https://exemplo.test/fotos/b.webp", origem: "api", ordem: 1 },
          { url: "https://exemplo.test/fotos/a.webp", origem: "api", ordem: 0, verificada_em: "2026-10-11T00:00:00.000Z", ok: true },
        ],
      }),
    ],
  );
  const { imoveis } = montarExportacao(db, { agora: AGORA });
  const porId = new Map(imoveis.map((i) => [i.id_na_fonte, i]));

  const caixa = paraListing(porId.get("100")!);
  assert.ok(caixa);
  assert.equal(caixa.id, "caixa-100");
  assert.equal(caixa.title, "Casa 2 quartos");
  assert.equal(caixa.city, "Maceió", "nome oficial do IBGE quando é só a forma acentuada");
  assert.equal(caixa.place, "Tabuleiro do Martins · Maceió/AL");
  assert.equal(caixa.type, "casa");
  assert.deepEqual([caixa.avaliacao, caixa.lance, caixa.desagio], [200000, 116000, 42]);
  assert.equal(caixa.praca, "Praça única");
  assert.equal(caixa.date, "data não informada");
  assert.equal(caixa.seal, 0);
  assert.match(caixa.why, /critérios dos selos/);
  assert.equal(caixa.photo, "https://exemplo.test/fotos/F10021.jpg");
  assert.deepEqual(caixa.photoFonte, { origem: "padrao_url", verificadaEm: null });
  assert.deepEqual(caixa.source, { leiloeiro: "Caixa", url: "https://exemplo.test/caixa/100", coletadoEm: "2026-10-08" });
  assert.equal(caixa.point.length, 2);
  assert.equal(caixa.tags.find((t) => t.label === "Deságio alto")?.severity, "positivo");

  assert.equal(paraListing(porId.get("101")!), null, "rural não cabe nos quatro tipos do site");

  const lj = paraListing(porId.get("222141")!);
  assert.ok(lj);
  assert.equal(lj.id, "lj-222141");
  assert.equal(lj.place, "São Paulo/SP", "sem bairro");
  assert.equal(lj.praca, "2ª praça");
  assert.equal(lj.date, "19 out");
  assert.equal(lj.dataPraca, "2026-10-19T19:00:00.000Z");
  assert.equal(lj.lance, 200000);
  assert.equal(lj.desagio, 50);
  assert.equal(lj.photo, "https://exemplo.test/fotos/a.webp", "a de menor ordem");
  assert.deepEqual(lj.photoFonte, { origem: "api", verificadaEm: "2026-10-11T00:00:00.000Z" });
  assert.equal(lj.source.leiloeiro, "Leilões Judiciais");
  assert.equal(lj.source.coletadoEm, "2026-10-10", "01h35 UTC de 11/10 ainda é 10/10 em Brasília");
  // Severidade: graves primeiro, depois atenção, positivo e informativo.
  const ordem = { grave: 0, atencao: 1, positivo: 2, info: 3 } as const;
  const severidades = lj.tags.map((t) => ordem[t.severity]);
  assert.deepEqual(severidades, [...severidades].sort((a, b) => a - b));

  // Tag que aguarda leitura humana não vira fato: vai para tagsEmRevisao.
  const comRevisao = porId.get("100")!;
  const marcado = paraListing({
    ...comRevisao,
    tags: [
      ...comRevisao.tags,
      { slug: "ocupado", rotulo: "Ocupado", categoria: "Posse", severidade: "grave", confianca: "media", revisao_pendente: true, revisada: false, trecho: null, origem: "descricao" },
      { slug: "desocupado", rotulo: "Desocupado", categoria: "Posse", severidade: "positivo", confianca: "media", revisao_pendente: true, revisada: false, trecho: null, origem: "descricao" },
    ],
  });
  assert.ok(marcado);
  assert.deepEqual(marcado.tagsEmRevisao, [{ label: "Ocupado", severity: "grave" }, { label: "Desocupado", severity: "positivo" }]);
  assert.equal(marcado.desocupado, false, "desocupado só com a tag confirmada");
  assert.ok(!marcado.tags.some((t) => t.label === "Ocupado"));

  // Preço acima da avaliação: deságio negativo; sem praça informada: null.
  const acima = paraListing({ ...comRevisao, preco: 230000, desconto_pct: -15, praca_atual: null });
  assert.deepEqual([acima?.desagio, acima?.praca], [-15, null]);
  assert.equal(paraListing({ ...comRevisao, mapa: null }), null, "sem posição no mapa");
  assert.equal(paraListing({ ...comRevisao, valor_avaliacao: null, desconto_pct: null }), null, "sem avaliação");
});

/** Listing mínimo para testar a seleção. */
function listing(id: string, uf: string, modalidade: string, type: ListingSite["type"], grave = false): ListingSite {
  return {
    id, title: "x", place: `${uf}`, uf, city: "c", point: [1, 1], type, avaliacao: 1, lance: 1, desagio: 0, praca: null,
    date: "", dataPraca: null, seal: 0, desocupado: false, tags: grave ? [{ label: "Ocupado", severity: "grave" }] : [],
    tagsEmRevisao: [], why: "", modalidade, source: { leiloeiro: id.startsWith("lj") ? "Leilões Judiciais" : "Caixa", url: "", coletadoEm: "" },
  };
}

test("selecionarAmostra: varia fonte, modalidade, risco, UF e tipo; determinística em qualquer ordem de entrada", () => {
  const ufs = ["SP", "RJ", "MG", "BA", "PR", "RS"];
  const modalidades = ["venda_direta", "leilao", "venda_online", "licitacao_aberta"];
  const tipos: ListingSite["type"][] = ["apartamento", "casa", "terreno", "comercial"];
  const candidatos: ListingSite[] = [];
  // Muitos de SP/venda direta/apartamento, poucos dos outros: a amostra precisa equilibrar.
  for (let k = 0; k < 500; k++) candidatos.push(listing(`caixa-sp-${k}`, "SP", "venda_direta", "apartamento"));
  ufs.forEach((uf, a) => modalidades.forEach((m, b) => tipos.forEach((t, c) => candidatos.push(listing(`caixa-${uf}-${m}-${t}`, uf, m, t, (a + b + c) % 3 === 0)))));
  candidatos.push(listing("lj-1", "SP", "leilao", "apartamento", true), listing("lj-2", "SP", "leilao", "casa"));

  const amostra = selecionarAmostra(candidatos, 24);
  assert.equal(amostra.length, 24);
  const contar = (f: (l: ListingSite) => string) => {
    const m = new Map<string, number>();
    for (const l of amostra) m.set(f(l), (m.get(f(l)) ?? 0) + 1);
    return m;
  };
  assert.equal(contar((l) => l.source.leiloeiro).get("Leilões Judiciais"), 2, "as duas da fonte menor entram");
  assert.deepEqual([...contar((l) => l.modalidade).values()].sort(), [6, 6, 6, 6]);
  assert.equal(contar((l) => l.uf).size, ufs.length, "todas as UFs");
  assert.equal(contar((l) => l.type).size, tipos.length);
  assert.ok((contar((l) => (l.tags.some((t) => t.severity === "grave") ? "grave" : "sem")).get("grave") ?? 0) >= 6);
  // Mesma escolha com a entrada invertida; saída ordenada por UF e id.
  assert.deepEqual(selecionarAmostra([...candidatos].reverse(), 24).map((l) => l.id), amostra.map((l) => l.id));
  assert.deepEqual(amostra.map((l) => `${l.uf} ${l.id}`), amostra.map((l) => `${l.uf} ${l.id}`).sort((a, b) => a.localeCompare(b)));
  assert.equal(selecionarAmostra(candidatos.slice(0, 3), 60).length, 3, "menos candidatos que o tamanho pedido");
});

test("exportarSite: amostra sem anúncios do mesmo imóvel e estatísticas por UF e do Brasil", () => {
  const caixa = [
    vendaDireta("200"),
    // Mesmo endereço que o 200: outro anúncio do mesmo imóvel, fica fora da amostra.
    vendaDireta("201", { endereco: "Rua Exemplo, 200" }),
    vendaDireta("202", { uf: "RJ", cidade: "RIO DE JANEIRO", bairro: "Tijuca", preco: 250000, modalidade: "leilao", modalidade_fonte: "Leilão SFI - Edital Único", pracas: [] }),
    vendaDireta("203", { tipo: "rural", titulo: "Imóvel rural" }),
  ];
  const db = bancoComDuasFontes(caixa, []);
  const dir = mkdtempSync(join(tmpdir(), "luneta-site-"));
  try {
    const r = exportarSite(db, dir, { agora: AGORA });
    assert.deepEqual(r.arquivos, [join(dir, ARQUIVO_AMOSTRA_SITE), join(dir, ARQUIVO_ESTATISTICAS_UF)]);
    const amostra = JSON.parse(readFileSync(r.arquivos[0]!, "utf8")) as AmostraSite;
    const estat = JSON.parse(readFileSync(r.arquivos[1]!, "utf8")) as EstatisticasUf;
    assert.equal(amostra.versao, 1);
    assert.deepEqual(amostra.imoveis.map((i) => i.id), ["caixa-200", "caixa-202"], "201 é o mesmo imóvel do 200; 203 é rural");
    const rj = amostra.imoveis[1]!;
    assert.deepEqual([rj.praca, rj.desagio], [null, -25], "Leilão SFI sem ficha: praça não informada; preço acima da avaliação");
    assert.ok(rj.tagsEmRevisao.some((t) => t.label === "Lance acima da avaliação"));
    assert.deepEqual(amostra.fontes.map((f) => [f.id, f.gerado_na_fonte_em]), [["caixa_csv", null], ["leiloesjudiciais_api", null]], "sem coleta registrada");

    assert.equal(estat.brasil.uf, "BR");
    assert.equal(estat.brasil.ativos, 4);
    assert.deepEqual(estat.ufs.map((u) => [u.uf, u.ativos]), [["AL", 3], ["RJ", 1]]);
    const al = estat.ufs[0]!;
    assert.deepEqual(al.porTipo, { casa: 2, rural: 1 });
    assert.deepEqual(al.maioresCidades, [{ cidade: "Maceió", ativos: 3 }]);
    assert.deepEqual(al.desagio, { mediana: 42, p25: 42, p75: 42, acimaDaAvaliacao: 0 });
    assert.equal(al.lanceMediano, 116000);
    assert.deepEqual([al.comFoto, al.comFotoVerificada, al.geocodificados], [3, 0, 3]);
    assert.deepEqual(al.porPrecisaoGeo, { cidade: 3 });
    assert.deepEqual(al.porPraca, { "Praça única": 3 });
    assert.equal(al.tags["praca-unica"], 3);
    assert.ok(al.centro && al.centro[0] > 300, "Maceió fica no leste do mapa");
    assert.equal(estat.ufs[1]!.desagio.acimaDaAvaliacao, 1);
    assert.equal(estat.ufs[1]!.tagsEmRevisao["preco-acima-mercado"], 1);
    for (const slug of Object.keys(estat.brasil.tags)) assert.ok(TAGS.some((t) => t.slug === slug), slug);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: exportar --site grava os dois arquivos na pasta pedida; --amostra limita", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-site-cli-"));
  const banco = join(dir, "luneta.db");
  try {
    const registros = [vendaDireta("300"), vendaDireta("301", { uf: "PE", cidade: "RECIFE", bairro: "Boa Viagem" })];
    const conectores = [conectorFalso({ id: "caixa_csv", registros: () => registros, geradoEm: "2026-10-08" })];
    const saida: string[] = [];
    const erro: string[] = [];
    const rodar = (args: string[]) => principal([...args, "--banco", banco], { http: httpProibido(), agora: AGORA, conectores, saida: (t) => saida.push(t), erro: (t) => erro.push(t) });
    assert.equal(await rodar(["coletar", "caixa", "--fixture", "x"]), 0, erro.join("\n"));
    assert.match(saida.join("\n"), /Coleta #1 de caixa_csv: sucesso/, "apelido 'caixa' resolve para caixa_csv");
    assert.equal(await rodar(["riscos", "--fonte", "caixa"]), 0);
    assert.match(saida.join("\n"), /Riscos: 52 tag\(s\) gravada\(s\) em 2 imóvel\(is\)/, "--fonte também aceita o apelido");
    const pasta = join(dir, "site");
    assert.equal(await rodar(["exportar", "--site", "--pasta", pasta, "--amostra", "1"]), 0, erro.join("\n"));
    assert.match(saida.join("\n"), /Amostra para o site: 1 imóvel\(is\) de 1 UF\(s\)/);
    const amostra = JSON.parse(readFileSync(join(pasta, ARQUIVO_AMOSTRA_SITE), "utf8")) as AmostraSite;
    assert.equal(amostra.total, 1);
    assert.deepEqual(amostra.fontes.map((f) => f.gerado_na_fonte_em), ["2026-10-08"]);
    assert.ok(existsSync(join(pasta, ARQUIVO_ESTATISTICAS_UF)));
    assert.equal(await rodar(["exportar", "--site", "--amostra", "0"]), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("instantâneo versionado em base/saida: formato do site e sem documento pessoal", () => {
  const arquivo = join(PASTA_SITE_PADRAO, ARQUIVO_AMOSTRA_SITE);
  if (!existsSync(arquivo)) return;
  const amostra = JSON.parse(readFileSync(arquivo, "utf8")) as AmostraSite;
  assert.ok(amostra.total > 0 && amostra.total <= 60);
  assert.equal(amostra.imoveis.length, amostra.total);
  const severidades = new Set(["grave", "atencao", "positivo", "info"]);
  const ids = new Set<string>();
  for (const l of amostra.imoveis) {
    assert.ok(!ids.has(l.id), `id repetido: ${l.id}`);
    ids.add(l.id);
    assert.ok(["apartamento", "casa", "comercial", "terreno"].includes(l.type), l.id);
    assert.ok(l.praca === null || ["1ª praça", "2ª praça", "Praça única"].includes(l.praca), l.id);
    assert.equal(l.seal, 0);
    assert.ok(l.point[0] >= 0 && l.point[0] <= 400 && l.point[1] >= 0 && l.point[1] <= 400, l.id);
    assert.ok(Number.isInteger(l.desagio) && l.avaliacao > 0 && l.lance > 0, l.id);
    for (const t of [...l.tags, ...l.tagsEmRevisao]) {
      assert.ok(severidades.has(t.severity), `${l.id}: ${t.severity}`);
      assert.ok(TAGS.some((d) => d.rotulo === t.label), `${l.id}: rótulo fora das 26 tags: ${t.label}`);
    }
    assert.match(l.source.coletadoEm, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(l.source.url, /^https:\/\//);
    if (l.photo) assert.match(l.photo, /^https:\/\//, "só a URL na fonte");
    for (const texto of [l.title, l.place, l.city]) assert.equal(mascararDocumentos(texto), texto, `${l.id}: ${texto}`);
  }
});

// ---------------------------------------------------------------------------
// Catálogo completo do site (base/saida/site)
// ---------------------------------------------------------------------------

/** Lote da LJ com parcelamento, documentos, site do leiloeiro e nome sintético de leiloeiro. */
const loteLj = (id: string, sobrepor: Partial<ImovelNormalizado> = {}): ImovelNormalizado =>
  imovelExemplo({
    id_na_fonte: id,
    url: `http://exemplo.test/lote/1/${id}`,
    titulo: "Apartamento 3 quartos",
    bairro: null,
    endereco: "Rua Exemplo, 18, São Paulo/SP",
    descricao: "Apartamento. Imóvel desocupado.",
    judicial: true,
    aceita_financiamento: null,
    aceita_parcelamento: true,
    leiloeiro: "Leiloeiro Exemplo Dois",
    comitente: "TJSP",
    valor_avaliacao: 400000,
    area_privativa: 80,
    area_total: 100,
    pracas: [
      { numero: 1, data: "2026-10-05T13:00:00.000Z", valor_minimo: 400000 },
      { numero: 2, data: "2026-10-19T19:00:00.000Z", valor_minimo: 200000 },
    ],
    fotos: [
      { url: "https://exemplo.test/fotos/b.webp", origem: "api", ordem: 1 },
      { url: "https://exemplo.test/fotos/a.webp", origem: "api", ordem: 0 },
    ],
    documentos: [
      { tipo: "matricula", url: "https://exemplo.test/docs/m.pdf", titulo: "MATRÍCULA 13.941" },
      { tipo: "edital", url: "javascript:alert(1)", titulo: "Edital" },
    ],
    extras: { nu_parcelas: 30, vl_percentualentrada: 25, indice_correcao: "IPCA (IBGE)", site_leiloeiro: "http://www.leiloeiro.test/" },
    ...sobrepor,
  });

test("condicoesDePagamento: parcelamento da fonte em frase; à vista e campos ausentes não viram frase", () => {
  assert.equal(
    condicoesDePagamento({ nu_parcelas: 30, vl_percentualentrada: 25, indice_correcao: "IPCA (IBGE)" }),
    "Entrada de 25% e o restante em até 30 parcelas (IPCA)",
  );
  assert.equal(condicoesDePagamento({ nu_parcelas: "12", vl_percentualentrada: "30,5" }), "Entrada de 30,5% e o restante em até 12 parcelas");
  assert.equal(condicoesDePagamento({ nu_parcelas: 1, vl_percentualentrada: 100 }), null, "padrão da fonte: não dá para afirmar à vista");
  assert.equal(condicoesDePagamento({}), null);
});

test("areaPrincipal: privativa, total, terreno; terreno e rural pela do terreno; privativa impossível cai fora", () => {
  const a = (tipo: string, area_privativa: number | null, area_total: number | null, area_terreno: number | null) =>
    areaPrincipal({ tipo, area_privativa, area_total, area_terreno });
  assert.equal(a("apartamento", 60, 80, null), 60);
  assert.equal(a("casa", null, 120, 250), 120);
  assert.equal(a("casa", null, null, 250), 250);
  assert.equal(a("terreno", null, 1, 800), 800, "total de 1 m² num terreno de 800 m²");
  assert.equal(a("rural", 558, null, 217463), 217463, "a casa da gleba não é a área da gleba");
  assert.equal(a("terreno", 7200, null, null), 7200);
  assert.equal(a("apartamento", 5.69, 71.35, null), 71.35, "vírgula fora do lugar na fonte");
  assert.equal(a("casa", 14.06, 140.6, 240), 140.6);
  assert.equal(a("apartamento", 12, null, null), 12, "sem alternativa, fica a que há");
  assert.equal(a("outro", 12, null, null), 12, "box e vaga podem ter 12 m²");
  assert.equal(a("casa", 0, null, null), null);
});

test("unificarBairros: uma grafia por bairro e cidade (a acentuada, depois a mais usada)", () => {
  const l = (uf: string, cidade: string, bairro: string | null) => ({ uf, cidade, bairro }) as LinhaCatalogo;
  const linhas = [
    ...Array.from({ length: 3 }, () => l("SP", "São Paulo", "Saude")),
    l("SP", "São Paulo", "Saúde"),
    l("SP", "Santos", "Saude"),
    l("RJ", "Itaboraí", "Gebara (Itambi)"),
    l("RJ", "Itaboraí", "Gebara (Itambi)"),
    l("RJ", "Itaboraí", "Gebara Itambi"),
    l("MG", "Uberlândia", "CENTRO"),
    l("MG", "Uberlândia", "Centro"),
    l("MG", "Uberlândia", null),
  ];
  unificarBairros(linhas);
  assert.deepEqual(
    linhas.map((x) => x.bairro),
    ["Saúde", "Saúde", "Saúde", "Saúde", "Saude", "Gebara (Itambi)", "Gebara (Itambi)", "Gebara (Itambi)", "Centro", "Centro", null],
    "outra cidade não muda; sem bairro continua sem",
  );
});

/** Pedaços de "a", "lj-1" e "caixa-1": src/lib/catalogo/instantaneo.test.ts confere os mesmos valores. */
const PARTES_FIXAS = ["0c", "11", "19"];

test("parteDoId: FNV-1a módulo 32, estável, em 2 dígitos hexadecimais", () => {
  assert.equal(parteDoId("caixa-0000010005120"), parteDoId("caixa-0000010005120"));
  assert.match(parteDoId("lj-222141"), /^[0-9a-f]{2}$/);
  // valores fixos: o site (src/lib/catalogo/instantaneo.ts) repete a conta e o teste de lá confere os mesmos
  assert.equal(parteDoId(""), (0x811c9dc5 % 32).toString(16).padStart(2, "0"));
  assert.deepEqual(["a", "lj-1", "caixa-1"].map((id) => parteDoId(id)), PARTES_FIXAS);
  const usados = new Set(Array.from({ length: 2000 }, (_, k) => parteDoId(`caixa-${k}`)));
  assert.equal(usados.size, 32, "espalha pelos 32 pedaços");
});

test("paraCatalogo e montarCatalogo: resumo, detalhe, links só https, tags com evidência, rural entra", () => {
  const db = bancoComDuasFontes(
    [vendaDireta("100"), vendaDireta("101", { tipo: "rural", titulo: "Imóvel rural 10 ha", area_privativa: null, area_terreno: 100000 }), vendaDireta("102", { preco: 250000 })],
    [loteLj("222141")],
  );
  const catalogo = montarCatalogo(db, { agora: AGORA });
  const linhas = deColunas(catalogo.lista.colunas, catalogo.lista.total);
  assert.equal(catalogo.lista.formato, "luneta-catalogo");
  assert.equal(catalogo.lista.versao, VERSAO_CATALOGO);
  assert.equal(catalogo.lista.partes, 32);
  assert.equal(catalogo.partes.length, 32);
  assert.deepEqual(linhas.map((l) => l.id), ["caixa-100", "caixa-101", "caixa-102", "lj-222141"], "ordenado por id; rural entra");
  assert.deepEqual(catalogo.lista.fontes.map((f) => [f.id, f.nome, f.total]), [["caixa_csv", "Caixa", 3], ["leiloesjudiciais_api", "Leilões Judiciais", 1]]);
  for (const campo of CAMPOS_LINHA) assert.equal(catalogo.lista.colunas[campo].length, 4, campo);

  const caixa = linhas[0]!;
  assert.equal(caixa.cidade, "Maceió");
  assert.equal(caixa.tipo, "casa");
  assert.deepEqual([caixa.avaliacao, caixa.lance, caixa.desagio], [200000, 116000, 42]);
  assert.equal(caixa.praca, "unica");
  assert.equal(caixa.financiamento, true);
  assert.equal(caixa.judicial, false);
  assert.equal(caixa.fonte.nome, "Caixa");
  assert.equal(caixa.foto, "https://exemplo.test/fotos/F10021.jpg");
  assert.equal(caixa.totalFotos, 1);
  assert.deepEqual([caixa.selo, caixa.seloPendente], [0, true]);
  assert.equal(caixa.coletadoEm, "2026-10-12", "dia (Brasília) em que apareceu na base");
  assert.equal(caixa.endereco, "Rua Exemplo, 100");
  assert.ok(caixa.tags.some((t) => t.slug === "desagio-alto" && t.severidade === "positivo" && !t.emRevisao));
  const sev = { grave: 0, atencao: 1, positivo: 2, info: 3 } as const;
  assert.deepEqual(caixa.tags.map((t) => sev[t.severidade]), [...caixa.tags.map((t) => sev[t.severidade])].sort((a, b) => a - b));

  const rural = linhas[1]!;
  assert.equal(rural.tipo, "rural");
  assert.equal(rural.area, 100000, "sem área privativa nem total: a do terreno");

  const acima = linhas[2]!;
  assert.equal(acima.desagio, -25, "lance acima da avaliação");
  assert.ok(acima.tags.some((t) => t.slug === "preco-acima-mercado" && t.emRevisao), "em revisão continua marcada");

  const lj = linhas[3]!;
  assert.deepEqual([lj.praca, lj.lance, lj.desagio, lj.area, lj.lanceM2, lj.avaliacaoM2], ["2", 200000, 50, 80, 2500, 5000]);
  assert.equal(lj.dataPraca, "2026-10-19T19:00:00.000Z");
  assert.equal(lj.foto, "https://exemplo.test/fotos/a.webp", "a de menor ordem");
  assert.equal(lj.totalFotos, 2);
  assert.equal(lj.judicial, true);
  assert.equal(lj.parcelamento, true);

  const parte = catalogo.partes.find((p) => p.parte === parteDoId("lj-222141"))!;
  const d = parte.detalhes["lj-222141"]!;
  assert.ok(d, "o detalhe está no pedaço do hash do id");
  assert.equal(parte.gerado_em, catalogo.lista.gerado_em);
  assert.deepEqual(d.fotos, ["https://exemplo.test/fotos/a.webp", "https://exemplo.test/fotos/b.webp"]);
  assert.deepEqual([d.areaPrivativa, d.areaTotal], [80, 100]);
  assert.equal(d.condicoesPagamento, "Entrada de 25% e o restante em até 30 parcelas (IPCA)");
  assert.equal(d.leiloeiro, null, "nome sintético da fixture não vai para o site");
  assert.equal(d.comitente, "TJSP");
  assert.deepEqual(d.pracas.map((p) => p.numero), [1, 2]);
  assert.match(d.porQueSelo, /critérios dos selos/);
  assert.deepEqual(
    d.links.map((l) => [l.tipo, l.rotulo, l.url]),
    [
      ["anuncio", "Ver lote na Leilões Judiciais", "https://exemplo.test/lote/1/222141"],
      ["matricula", "Matrícula 13.941", "https://exemplo.test/docs/m.pdf"],
      ["leiloeiro", "Site do leiloeiro", "https://www.leiloeiro.test/"],
    ],
    "http vira https; javascript: cai fora; o Google Maps é montado pelo site",
  );
  assert.deepEqual(d.tags.map((t) => t.slug), lj.tags.map((t) => t.slug), "mesmas tags, mesma ordem da linha");
  assert.ok(d.tags.every((t) => ["alta", "media", "baixa"].includes(t.confianca) && typeof t.origem === "string"));
  assert.ok(d.tags.find((t) => t.slug === "desagio-alto")?.evidencia?.includes("deságio"));
  for (const p of catalogo.partes) for (const id of Object.keys(p.detalhes)) assert.equal(parteDoId(id), p.parte, id);
});

test("gravarCatalogo: .json.gz legíveis, mesma saída para a mesma base, pedaço velho removido", () => {
  const db = bancoComDuasFontes([vendaDireta("400"), vendaDireta("401", { uf: "PE", cidade: "RECIFE", bairro: "Boa Viagem" })], [loteLj("9")]);
  const dir = mkdtempSync(join(tmpdir(), "luneta-catalogo-"));
  try {
    mkdirSync(join(dir, PASTA_CATALOGO_DETALHES), { recursive: true });
    writeFileSync(join(dir, PASTA_CATALOGO_DETALHES, "ff.json.gz"), "velho");
    const r = gravarCatalogo(dir, montarCatalogo(db, { agora: AGORA }));
    assert.equal(r.total, 3);
    assert.equal(r.arquivos.length, 33);
    assert.ok(!existsSync(join(dir, PASTA_CATALOGO_DETALHES, "ff.json.gz")), "pedaço de outra divisão sai");
    const lista = JSON.parse(gunzipSync(readFileSync(join(dir, ARQUIVO_CATALOGO_LISTA))).toString("utf8")) as ListaCatalogo;
    assert.equal(lista.total, 3);
    assert.deepEqual(lista.colunas.uf, ["AL", "PE", "SP"]);
    const antes = readFileSync(join(dir, ARQUIVO_CATALOGO_LISTA));
    gravarCatalogo(dir, montarCatalogo(db, { agora: AGORA }));
    assert.ok(antes.equals(readFileSync(join(dir, ARQUIVO_CATALOGO_LISTA))), "gzip determinístico");
    const parte = JSON.parse(gunzipSync(readFileSync(join(dir, PASTA_CATALOGO_DETALHES, `${parteDoId("lj-9")}.json.gz`))).toString("utf8")) as ParteCatalogo;
    assert.equal(parte.formato, "luneta-catalogo-detalhes");
    assert.ok(parte.detalhes["lj-9"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: exportar --site também grava o catálogo em site/", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-catalogo-cli-"));
  const banco = join(dir, "luneta.db");
  try {
    const conectores = [conectorFalso({ id: "caixa_csv", registros: () => [vendaDireta("500")], geradoEm: "2026-10-08" })];
    const saida: string[] = [];
    const erro: string[] = [];
    const rodar = (args: string[]) => principal([...args, "--banco", banco], { http: httpProibido(), agora: AGORA, conectores, saida: (t) => saida.push(t), erro: (t) => erro.push(t) });
    assert.equal(await rodar(["coletar", "caixa", "--fixture", "x"]), 0, erro.join("\n"));
    assert.equal(await rodar(["exportar", "--site", "--pasta", join(dir, "saida")]), 0, erro.join("\n"));
    assert.match(saida.join("\n"), /Catálogo do site: 1 imóvel\(is\) em .*site \(lista \d+ KB, detalhes \d+ KB em 32 pedaços\)/);
    assert.ok(existsSync(join(dir, "saida", PASTA_CATALOGO, ARQUIVO_CATALOGO_LISTA)));
    assert.ok(existsSync(join(dir, "saida", ARQUIVO_AMOSTRA_SITE)), "a amostra antiga continua");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("catálogo versionado em base/saida/site: formato, até 4 MB e sem documento pessoal", () => {
  const pasta = join(PASTA_SITE_PADRAO, PASTA_CATALOGO);
  const arquivo = join(pasta, ARQUIVO_CATALOGO_LISTA);
  if (!existsSync(arquivo)) return;
  const bytesLista = readFileSync(arquivo);
  const lista = JSON.parse(gunzipSync(bytesLista).toString("utf8")) as ListaCatalogo;
  assert.equal(lista.versao, VERSAO_CATALOGO);
  let bytes = bytesLista.length;
  const linhas = deColunas(lista.colunas, lista.total);
  const porId = new Map(linhas.map((l) => [l.id, l]));
  let detalhes = 0;
  for (let k = 0; k < lista.partes; k++) {
    const nome = `${k.toString(16).padStart(2, "0")}.json.gz`;
    const bruto = readFileSync(join(pasta, PASTA_CATALOGO_DETALHES, nome));
    bytes += bruto.length;
    const parte = JSON.parse(gunzipSync(bruto).toString("utf8")) as ParteCatalogo;
    assert.equal(parte.gerado_em, lista.gerado_em, `${nome}: mesma geração da lista`);
    for (const [id, d] of Object.entries(parte.detalhes)) {
      detalhes++;
      assert.ok(porId.has(id), `${id} sem linha na lista`);
      for (const l of d.links) assert.match(l.url, /^https:\/\//, id);
      for (const texto of [d.descricao, ...d.tags.map((t) => t.evidencia)]) {
        if (texto) assert.equal(mascararDocumentos(texto), texto, `${id}: documento pessoal em ${texto.slice(0, 60)}`);
      }
    }
  }
  assert.equal(detalhes, lista.total, "cada linha tem detalhe");
  assert.ok(bytes <= 4 * 1024 * 1024, `catálogo com ${bytes} bytes passa de 4 MB`);
  const grafias = new Map<string, string>();
  for (const l of linhas) {
    if (!l.bairro) continue;
    const k = `${l.uf}|${l.cidade}|${l.bairro.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    assert.equal(grafias.get(k) ?? l.bairro, l.bairro, `${k}: duas grafias do mesmo bairro`);
    grafias.set(k, l.bairro);
  }
  for (const l of linhas) {
    assert.ok(l.lance > 0, l.id);
    if (l.foto) assert.match(l.foto, /^https:\/\//, l.id);
    for (const t of l.tags) assert.ok(TAGS.some((d) => d.slug === t.slug && d.rotulo === t.rotulo), `${l.id}: ${t.slug}`);
    for (const texto of [l.titulo, l.bairro ?? "", l.endereco ?? ""]) assert.equal(mascararDocumentos(texto), texto, `${l.id}: ${texto}`);
  }
});
