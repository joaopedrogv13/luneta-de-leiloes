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
import type { PaginaImovel } from "./tipos";

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
  const p: string[] = ['"componentes":', '"indicadores":', '"alertas":[{', '"percentilLance":', '"fonte":"itbi"', '"fonte":"leiloes"', '"escopo":', '"evidencia":', '"confianca":'];
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
