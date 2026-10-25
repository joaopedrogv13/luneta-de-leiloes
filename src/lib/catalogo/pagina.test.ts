/**
 * Nada da Luneta vaza na página do imóvel do Lente: monta a PaginaImovel pelo mesmo caminho do servidor
 * (conjuntos.ts + pagina.ts › montarPaginaImovel, que servidor.ts chama), no Lente e na Luneta, e procura no Lente os
 * campos e os pedaços que só a Luneta tem (tags e evidências, selo e o porquê, nota de localização, preço da região
 * com o ITBI, buscas nos portais). O que é do Lente (fotos, registro, links, cobertura de preços, parecidos) tem de
 * continuar igual. Roda nos exemplos (sempre) e no instantâneo real (pula se base/saida/site não estiver aqui).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createJiti } from "jiti";
import type { Listing } from "../../content/examples";
import { carregarExemplos, carregarPrevia, type DadosConjunto } from "./conjuntos";
import { pastaPadrao } from "./instantaneo";
import { lerItbi, type DadosItbi } from "./itbi";
import { montarPaginaImovel } from "./pagina";
import { RECURSOS } from "./planos";
import { melhorRecorte, MINIMO_ITBI, MINIMO_LEILOES_REFERENCIA, recorteFraco, referenciaLeiloes, referenciaPrincipal } from "./referencia";
import type { PaginaImovel, ReferenciaM2 } from "./tipos";

const AGORA = new Date("2026-10-14T15:00:00Z");
const PASTA = pastaPadrao();
const TEM_PREVIA = existsSync(join(PASTA, "imoveis.json.gz"));

/** src/content/examples.ts usa "@/": carrega com o apelido. */
async function listings(): Promise<Listing[]> {
  const jiti = createJiti(__filename, { alias: { "@/": `${join(process.cwd(), "src")}/` } });
  const m = await jiti.import<{ LISTINGS: Listing[] }>(join(process.cwd(), "src", "content", "examples.ts"));
  return m.LISTINGS;
}

/** ITBI das prefeituras (vazio se a pasta não existir: a página sai sem ITBI). */
async function itbi(): Promise<DadosItbi> {
  try {
    return await lerItbi();
  } catch {
    return lerItbi(join(process.cwd(), "nao-existe"));
  }
}

/** Os pedaços que só a Luneta tem, tirados da página da Luneta (o que não pode aparecer no JSON do Lente). */
function pedacosDaLuneta(luneta: PaginaImovel): string[] {
  const p: string[] = ['"componentes":', '"indicadores":', '"alertas":[{', '"percentilLance":', '"fonte":"itbi"', '"fonte":"leiloes"', '"escopo":', '"evidencia":', '"confianca":', '"amostrasLeiloes"'];
  for (const t of luneta.imovel.tags) {
    p.push(`"slug":"${t.slug}"`);
    if (t.evidencia && t.evidencia.length > 12) p.push(JSON.stringify(t.evidencia).slice(1, -1));
  }
  if (luneta.imovel.porQueSelo.length > 12) p.push(JSON.stringify(luneta.imovel.porQueSelo).slice(1, -1));
  for (const b of luneta.vizinhanca.buscasExternas) p.push(b.url);
  return p;
}

/** A página do Lente sem nada da Luneta, e com tudo o que é do Lente igual ao da Luneta. */
function conferir(lente: PaginaImovel, luneta: PaginaImovel) {
  const id = lente.imovel.id;
  // os campos
  assert.equal(lente.localizacao, null, `${id}: nota de localização`);
  assert.equal(lente.imovel.notaLocal, null, `${id}: notaLocal`);
  assert.deepEqual(lente.imovel.tags, [], `${id}: tags`);
  assert.equal(lente.imovel.selo, 0, `${id}: selo`);
  assert.equal(lente.imovel.porQueSelo, "", `${id}: porquê do selo`);
  assert.deepEqual(lente.vizinhanca.referencias, [], `${id}: preço da região`);
  assert.equal("amostrasLeiloes" in lente.vizinhanca, false, `${id}: quantos imóveis cada recorte tem (é do preço da região)`);
  assert.ok(luneta.vizinhanca.amostrasLeiloes, `${id}: a Luneta tem as contagens de cada recorte`);
  assert.deepEqual(lente.vizinhanca.buscasExternas, [], `${id}: buscas nos portais`);
  for (const x of lente.vizinhanca.parecidos) assert.ok(x.tags.length === 0 && x.selo === 0 && x.notaLocal === null, `${id}: parecido ${x.id}`);
  assert.deepEqual(lente.travas, [...RECURSOS], `${id}: travas`);
  assert.deepEqual(luneta.travas, [], `${id}: a Luneta não tem travas`);

  // o que é do Lente continua (a página segue útil)
  for (const k of ["titulo", "endereco", "descricao", "fotos", "links", "registro", "pracas", "lance", "avaliacao", "lat", "lon", "precisaoGeo"] as const) {
    assert.deepEqual(lente.imovel[k], luneta.imovel[k], `${id}: ${k}`);
  }
  assert.deepEqual(lente.vizinhanca.cobertura, luneta.vizinhanca.cobertura, `${id}: cobertura de preços (pública)`);
  assert.deepEqual(
    lente.vizinhanca.parecidos.map((x) => x.id),
    luneta.vizinhanca.parecidos.map((x) => x.id),
    `${id}: os mesmos parecidos`,
  );

  // e nada da Luneta no JSON que vai ao navegador
  const json = JSON.stringify(lente);
  for (const pedaco of pedacosDaLuneta(luneta)) assert.ok(!json.includes(pedaco), `${id}: o Lente leva "${pedaco.slice(0, 60)}"`);
}

async function paginas(d: DadosConjunto, dadosItbi: DadosItbi, id: string) {
  const [lente, luneta] = await Promise.all([montarPaginaImovel(d, id, "lente", dadosItbi, AGORA), montarPaginaImovel(d, id, "luneta", dadosItbi, AGORA)]);
  assert.ok(lente && luneta, `${id} existe`);
  return { lente, luneta };
}

test("exemplos (a /assinante): a página do Lente não leva nada da Luneta", async () => {
  const d = carregarExemplos(await listings(), AGORA);
  const dadosItbi = await itbi();
  let comNota = 0;
  let comTags = 0;
  let comRegiao = 0;
  for (const i of d.itens) {
    const { lente, luneta } = await paginas(d, dadosItbi, i.id);
    conferir(lente, luneta);
    if (luneta.localizacao) comNota++;
    if (luneta.imovel.tags.length) comTags++;
    if (luneta.vizinhanca.referencias.length) comRegiao++;
  }
  // a conferência só vale se a Luneta tiver mesmo o que o Lente não pode ver
  assert.ok(comNota > 0 && comTags > 0 && comRegiao > 0, `Luneta com nota ${comNota}, tags ${comTags}, região ${comRegiao}`);
  assert.equal(await montarPaginaImovel(d, "nao-existe", "lente", dadosItbi, AGORA), null);
});

test("instantâneo real: caixa-1444419640129 e um imóvel de São Paulo com ITBI, no Lente, sem nada da Luneta", { skip: !TEM_PREVIA }, async () => {
  const [d, dadosItbi] = await Promise.all([carregarPrevia(PASTA), itbi()]);
  const ids = ["caixa-1444419640129"].filter((id) => d.posicao.has(id));
  // um apartamento de São Paulo cuja página da Luneta tem o preço pago (ITBI)
  let sp: string | null = null;
  for (const i of d.itens) {
    if (i.uf !== "SP" || i.cidade !== "São Paulo" || i.tipo !== "casa") continue;
    const luneta = await montarPaginaImovel(d, i.id, "luneta", dadosItbi, AGORA);
    if (luneta?.vizinhanca.referencias.some((r) => r.fonte === "itbi")) {
      sp = i.id;
      break;
    }
  }
  if (existsSync(join(PASTA, "itbi", "sp-sao-paulo.json.gz"))) assert.ok(sp, "uma casa de São Paulo com o preço pago (ITBI) na Luneta");
  if (sp) ids.push(sp);
  assert.ok(ids.length > 0, "há imóvel para conferir");
  for (const id of ids) {
    const { lente, luneta } = await paginas(d, dadosItbi, id);
    conferir(lente, luneta);
  }
});

test("instantâneo real: o raio de 1 km (rodada 6) entra entre a rua e o bairro, com as contagens de cada recorte", { skip: !TEM_PREVIA }, async () => {
  const [d, dadosItbi] = await Promise.all([carregarPrevia(PASTA), itbi()]);
  let achou = 0;
  for (const i of d.itens) {
    if (i.cidade !== "Rio de Janeiro" || i.precisaoGeo !== "exata") continue;
    const { lente, luneta } = await paginas(d, dadosItbi, i.id);
    const leiloes = luneta.vizinhanca.referencias.filter((r) => r.fonte === "leiloes");
    const perto = leiloes.find((r) => r.escopo === "perto");
    if (!perto) continue;
    // a ordem: rua → perto → bairro → cidade → UF
    const ordem = ["rua", "perto", "bairro", "cidade", "uf"];
    const escopos = leiloes.map((r) => ordem.indexOf(r.escopo));
    assert.deepEqual(escopos, [...escopos].sort((a, b) => a - b), `${i.id}: ordem dos recortes`);
    assert.ok(perto.amostra >= 5, `${i.id}: mínimo do bairro`);
    assert.equal(luneta.vizinhanca.amostrasLeiloes?.perto, perto.amostra, `${i.id}: a contagem do raio é a amostra`);
    assert.equal(perto.nome, `Até 1 km, ${i.cidade}/${i.uf}`);
    conferir(lente, luneta);
    if (++achou >= 3) break;
  }
  assert.ok(achou > 0, "algum imóvel do Rio com o raio de 1 km");
  // posição aproximada: sem o raio e sem a contagem dele
  const aprox = d.itens.find((i) => i.precisaoGeo === "bairro" && i.cidade === "Rio de Janeiro");
  if (aprox) {
    const p = await montarPaginaImovel(d, aprox.id, "luneta", dadosItbi, AGORA);
    assert.ok(!p!.vizinhanca.referencias.some((r) => r.escopo === "perto"));
    assert.equal(p!.vizinhanca.amostrasLeiloes?.perto, undefined);
  }
});

test("instantâneo real: o aviso de rua e bairro segue a frase (revisão da rodada 6)", { skip: !TEM_PREVIA }, async (t) => {
  const [d, dadosItbi] = await Promise.all([carregarPrevia(PASTA), itbi()]);
  // Campo Grande/MS: 4 apartamentos na mesma rua (média na tabela) e a frase na cidade (52); Praça da Bandeira, Rio: um
  // imóvel comercial com 8 compras do ITBI no bairro (mínimo 10) e a frase no preço pago da cidade. Antes, os dois
  // ficavam com o aviso discreto. Confere só se o instantâneo ainda tem esse desenho (ele muda a cada atualização).
  const casos = [
    { id: "caixa-1444403509516", tem: (r: ReferenciaM2) => r.fonte === "leiloes" && r.escopo === "rua" && r.amostra < MINIMO_LEILOES_REFERENCIA },
    { id: "caixa-0000010218366", tem: (r: ReferenciaM2) => r.fonte === "itbi" && r.escopo === "bairro" && r.amostra < MINIMO_ITBI.bairro },
  ];
  let conferidos = 0;
  for (const { id, tem } of casos) {
    if (!d.posicao.has(id)) continue;
    const p = (await montarPaginaImovel(d, id, "luneta", dadosItbi, AGORA))!;
    const refs = p.vizinhanca.referencias;
    const principal = referenciaPrincipal(refs);
    if (!refs.some(tem) || !principal || principal.escopo !== "cidade") continue;
    const segunda = principal.fonte === "itbi" ? referenciaLeiloes(refs) : null;
    if (segunda && !recorteFraco(segunda.escopo)) continue;
    assert.equal(recorteFraco(melhorRecorte(refs)!), true, `${id}: a frase compara com a cidade, o aviso fica em destaque`);
    conferidos++;
  }
  // o instantâneo mudou e nenhum dos dois casos tem mais esse desenho: a regra continua coberta em vizinhanca.test.ts
  if (conferidos === 0) t.diagnostic("nenhum dos dois casos do instantâneo confere mais (atualizar os ids)");
});

test("instantâneo real: a tag de metrô (rodada 5) chega à Luneta com a evidência e à seção de localização; o Lente não leva nada", { skip: !TEM_PREVIA }, async () => {
  const [d, dadosItbi] = await Promise.all([carregarPrevia(PASTA), itbi()]);
  const comMetro = d.itens.find((i) => i.tags.some((t) => t.slug === "metro-perto"));
  if (!comMetro) return; // instantâneo sem as estações (antes da rodada 5)
  const { lente, luneta } = await paginas(d, dadosItbi, comMetro.id);
  const tag = luneta.imovel.tags.find((t) => t.slug === "metro-perto")!;
  assert.match(tag.rotulo, /^Metrô a \d+ m$/);
  assert.equal(tag.origem, "osm");
  assert.ok(tag.confianca === "alta" || tag.confianca === "media");
  assert.match(tag.evidencia ?? "", /^Estação de (metrô|monotrilho).* a \d+ m, em linha reta do ponto do endereço/);
  assert.match(tag.evidencia ?? "", /OpenStreetMap/);
  assert.ok(luneta.localizacao?.estacoes?.some((e) => e.modo === "metro" && e.distanciaM < 1000), "a seção diz a estação");
  conferir(lente, luneta);
  assert.ok(!JSON.stringify(lente).includes('"estacoes"'), "o Lente não leva as estações");
});
