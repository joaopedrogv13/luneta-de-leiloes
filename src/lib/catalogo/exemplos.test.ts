import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createJiti } from "jiti";
import { TAGS } from "../../../base/riscos/tags";
import { buscar, criarIndice } from "./consulta";
import { converterExemplos, proximaData, resumoDe } from "./exemplos";
import type { Listing } from "../../content/examples";

const AGORA = new Date("2026-10-14T15:00:00Z");

/** src/content/examples.ts usa o alias "@/" do Next: aqui ele aponta para src/. */
async function carregarExemplos(): Promise<Listing[]> {
  const jiti = createJiti(__filename, { alias: { "@/": `${join(process.cwd(), "src")}/` } });
  const m = await jiti.import<{ LISTINGS: Listing[] }>(join(process.cwd(), "src", "content", "examples.ts"));
  return m.LISTINGS;
}

test("proximaData: próxima ocorrência do dia, às 14h de Brasília", () => {
  assert.equal(proximaData("14 nov", AGORA), "2026-11-14T17:00:00.000Z");
  assert.equal(proximaData("14 out", AGORA), "2026-10-14T17:00:00.000Z", "hoje ainda vale");
  assert.equal(proximaData("3 jan", AGORA), "2027-01-03T17:00:00.000Z", "já passou este ano: o próximo");
  assert.equal(proximaData("data não informada", AGORA), null);
});

test("exemplos: os 6 da /assinante no formato do catálogo", async () => {
  const listings = await carregarExemplos();
  const detalhes = converterExemplos(listings, AGORA);
  assert.equal(detalhes.length, 6);
  const porId = new Map(detalhes.map((d) => [d.id, d]));
  const sp = porId.get("ex-alvo-sp")!;
  assert.deepEqual([sp.uf, sp.cidade, sp.bairro, sp.lat, sp.lon], ["SP", "São Paulo", "Vila Mariana", -23.5329, -46.6395]);
  assert.deepEqual([sp.selo, sp.seloPendente, sp.praca, sp.desagio], [3, false, "2", 48]);
  assert.equal(sp.fonte.nome, "Exemplo fictício");
  assert.equal(sp.ocupacao, "desocupado");
  assert.equal(sp.lanceM2, Math.round(sp.lance / sp.area!));
  assert.ok(sp.dataPraca && Date.parse(sp.dataPraca) > AGORA.getTime(), "praça no futuro");
  assert.deepEqual(sp.pracas.map((p) => p.numero), [1, 2]);
  assert.match(sp.porQueSelo, /deságio alto/);
  assert.equal(porId.get("ex-semselo-rj")!.praca, "unica");
  assert.equal(porId.get("ex-semselo-rj")!.ocupacao, "ocupado");
  assert.equal(porId.get("ex-semselo-go")!.tipo, "terreno");
  assert.equal(porId.get("ex-semselo-go")!.quartos, null);
  for (const d of detalhes) {
    assert.match(d.descricao ?? "", /^Exemplo fictício/, d.id);
    assert.ok(d.links.every((l) => l.url.startsWith("https://")), d.id);
    // foto ilustrativa (rodada 5): de um imóvel real da Caixa, sempre marcada como tal, uma por exemplo; o exemplo com
    // risco grave fica sem (o desenho), para não ligar os riscos a um prédio real reconhecível
    if (d.tags.some((t) => t.severidade === "grave")) {
      assert.equal(d.foto, null, d.id);
      assert.deepEqual(d.fotos, [], d.id);
      assert.equal(d.fotoIlustrativa, undefined, d.id);
    } else {
      assert.match(d.foto ?? "", /^https:\/\/venda-imoveis\.caixa\.gov\.br\/fotos\/F\d{13}21\.jpg$/, d.id);
      assert.equal(d.fotoIlustrativa, true, `${d.id}: rotulada como ilustrativa`);
      assert.deepEqual(d.fotos, [d.foto], d.id);
      assert.equal(d.totalFotos, 1, d.id);
      assert.equal(resumoDe(d).fotoIlustrativa, true, `${d.id}: o resumo (cartões) leva o rótulo`);
    }
    // tags: slugs da base (fora as duas sem equivalente), na ordem de gravidade
    for (const t of d.tags) {
      assert.ok(TAGS.some((x) => x.slug === t.slug) || ["sem-dividas-identificadas", "documentacao-regular"].includes(t.slug), `${d.id}: ${t.slug}`);
      assert.equal(t.emRevisao, false);
    }
    const ordem = { grave: 0, atencao: 1, positivo: 2, info: 3 } as const;
    assert.deepEqual(d.tags.map((t) => ordem[t.severidade]), [...d.tags.map((t) => ordem[t.severidade])].sort((a, b) => a - b), d.id);
  }
  const pr = porId.get("ex-namira-pr")!;
  const condominio = pr.tags.find((t) => t.slug === "condominio-em-atraso")!;
  assert.equal(condominio.rotulo, "Condomínio em atraso", "rótulo do catálogo; o valor vai na evidência");
  assert.match(condominio.evidencia ?? "", /R\$ 4\.300/);
});

test("exemplos na busca: selos funcionam, Lente esconde, ordem por selo", async () => {
  const itens = converterExemplos(await carregarExemplos(), AGORA).map(resumoDe);
  assert.ok(itens.every((i) => !("evidencia" in i.tags[0]!)), "resumo sem evidência");
  const ix = criarIndice(itens);
  const r = buscar(ix, { conjunto: "exemplos", plano: "luneta", filtros: {}, ordem: "selo", pagina: 1 }, { agora: AGORA });
  assert.equal(r.total, 6);
  assert.equal(r.itens[0]!.id, "ex-alvo-sp");
  assert.deepEqual(r.facetas.selo.map((s) => [s.valor, s.total]), [["3", 1], ["2", 2], ["1", 1]]);
  const selo = buscar(ix, { conjunto: "exemplos", plano: "luneta", filtros: { selo: [2, 3] }, ordem: "desagio", pagina: 1 }, { agora: AGORA });
  assert.equal(selo.total, 3);
  assert.equal(r.mapa.length, 6, "uma cidade por exemplo");
  const lente = buscar(ix, { conjunto: "exemplos", plano: "lente", filtros: {}, ordem: "selo", pagina: 1 }, { agora: AGORA });
  assert.ok(lente.itens.every((i) => i.selo === 0 && i.tags.length === 0));
});
