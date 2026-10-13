import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { principal } from "./cli.ts";
import {
  ARQUIVO_AMOSTRA_SITE,
  ARQUIVO_ESTATISTICAS_UF,
  dataCurtaSite,
  exportarSite,
  montarExportacao,
  PASTA_SITE_PADRAO,
  paraListing,
  selecionarAmostra,
  type AmostraSite,
  type EstatisticasUf,
  type ListingSite,
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
    assert.ok(rj.tagsEmRevisao.some((t) => t.label === "Preço acima do mercado"));
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
