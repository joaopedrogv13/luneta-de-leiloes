/**
 * Lê o instantâneo de verdade (base/saida/site) como o servidor lê: formato, pedaços, detalhe completo,
 * a contagem de MG e o tempo da busca com os 21 mil imóveis. Sem o instantâneo, os testes de arquivo
 * são pulados (o de formato inválido roda sempre).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { buscar, criarIndice } from "./consulta";
import { ARQUIVO_LISTA, ErroInstantaneo, lerLista, lerParte, linkMatriculaCaixa, montarDetalhe, parteDoId, pastaPadrao, VERSAO_CATALOGO } from "./instantaneo";
import type { Busca } from "./tipos";
import { vizinhanca } from "./vizinhanca";

const PASTA = pastaPadrao();
const TEM = existsSync(join(PASTA, ARQUIVO_LISTA));
const AGORA = new Date("2026-10-14T15:00:00Z");

test("parteDoId: mesma conta da exportação (base/exportar.ts)", () => {
  assert.deepEqual(["a", "lj-1", "caixa-1"].map((id) => parteDoId(id, 32)), ["0c", "11", "19"]);
  assert.equal(parteDoId("", 32), (0x811c9dc5 % 32).toString(16).padStart(2, "0"));
});

test("lista inválida ou de outra versão: erro claro, com o comando para gerar de novo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "catalogo-"));
  try {
    await assert.rejects(lerLista(dir), (e: Error) => e instanceof ErroInstantaneo && /não consegui ler/.test(e.message) && /base:exportar -- --site/.test(e.message));
    writeFileSync(join(dir, ARQUIVO_LISTA), gzipSync(JSON.stringify({ formato: "luneta-catalogo", versao: 99 })));
    await assert.rejects(lerLista(dir), /formato 99/);
    writeFileSync(join(dir, ARQUIVO_LISTA), "não é gzip");
    await assert.rejects(lerLista(dir), /JSON gzip válido/);
    const colunas = { id: ["x-1"], titulo: [7] };
    writeFileSync(join(dir, ARQUIVO_LISTA), gzipSync(JSON.stringify({ formato: "luneta-catalogo", versao: VERSAO_CATALOGO, gerado_em: "x", fontes: [], total: 1, partes: 32, colunas })));
    await assert.rejects(lerLista(dir), /coluna/);
    mkdirSync(join(dir, "detalhes"));
    writeFileSync(join(dir, "detalhes", "00.json.gz"), gzipSync(JSON.stringify({ formato: "luneta-catalogo-detalhes", versao: VERSAO_CATALOGO, gerado_em: "outra", parte: "00", detalhes: {} })));
    await assert.rejects(lerParte(dir, "00", "esta"), /outra geração/);
    await assert.rejects(lerParte(dir, "../x", "esta"), /pedaço inválido/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("instantâneo real: lista conferida, cada id no pedaço do hash, detalhe completo com link do mapa", { skip: !TEM }, async () => {
  const lista = await lerLista(PASTA);
  assert.ok(lista.itens.length > 1000);
  assert.equal(lista.enderecos.length, lista.itens.length);
  assert.ok(lista.sobre.fontes.length >= 1);
  assert.equal(lista.sobre.fontes.reduce((s, f) => s + f.total, 0), lista.itens.length);
  assert.ok(lista.itens.every((i) => !("endereco" in i)), "o endereço não vai no resumo");
  const vistos = new Set<string>();
  for (let k = 0; k < lista.partes; k++) {
    const parte = k.toString(16).padStart(2, "0");
    const detalhes = await lerParte(PASTA, parte, lista.geradoEm);
    for (const id of detalhes.keys()) {
      assert.equal(parteDoId(id, lista.partes), parte, id);
      vistos.add(id);
    }
  }
  assert.equal(vistos.size, lista.itens.length, "todo imóvel tem detalhe");
  const k = Math.max(0, lista.itens.findIndex((i) => i.id.startsWith("lj-") && i.tags.length > 0));
  const resumo = lista.itens[k]!;
  const parcial = (await lerParte(PASTA, parteDoId(resumo.id, lista.partes), lista.geradoEm)).get(resumo.id)!;
  const d = montarDetalhe(resumo, lista.enderecos[k] ?? null, parcial);
  assert.equal(d.id, resumo.id);
  assert.deepEqual(d.tags.map((t) => t.slug), resumo.tags.map((t) => t.slug));
  assert.ok(d.tags.every((t) => ["alta", "media", "baixa"].includes(t.confianca)));
  assert.equal(d.links.at(-1)!.tipo, "mapa");
  assert.match(d.links.at(-1)!.url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.equal(d.links[0]!.tipo, "anuncio");

  // Caixa sem matrícula na coleta: o PDF no endereço padrão, antes do mapa
  const kc = lista.itens.findIndex((i) => i.id.startsWith("caixa-"));
  const rc = lista.itens[kc]!;
  const pc = (await lerParte(PASTA, parteDoId(rc.id, lista.partes), lista.geradoEm)).get(rc.id)!;
  const dc = montarDetalhe(rc, lista.enderecos[kc] ?? null, { ...pc, links: pc.links.filter((l) => l.tipo !== "matricula") });
  const mat = dc.links.filter((l) => l.tipo === "matricula");
  assert.equal(mat.length, 1);
  assert.equal(mat[0]!.url, `https://venda-imoveis.caixa.gov.br/editais/matricula/${rc.uf}/${rc.id.slice(6)}.pdf`);
  assert.equal(dc.links.at(-1)!.tipo, "mapa");
  // com matrícula da coleta, não duplica
  const comMat = montarDetalhe(rc, null, { ...pc, links: [{ tipo: "matricula", rotulo: "Matrícula 123", url: "https://exemplo/m.pdf" }] });
  assert.equal(comMat.links.filter((l) => l.tipo === "matricula").length, 1);
  assert.equal(comMat.links.find((l) => l.tipo === "matricula")!.url, "https://exemplo/m.pdf");
});

test("matrícula da Caixa: só Caixa e só id de 13 dígitos", () => {
  const f = { id: "caixa_csv", nome: "Caixa" };
  assert.equal(linkMatriculaCaixa({ id: "caixa-8444402395965", uf: "SP", fonte: f })!.url, "https://venda-imoveis.caixa.gov.br/editais/matricula/SP/8444402395965.pdf");
  assert.equal(linkMatriculaCaixa({ id: "caixa-123", uf: "SP", fonte: f }), null);
  assert.equal(linkMatriculaCaixa({ id: "lj-222141", uf: "SP", fonte: { id: "leiloesjudiciais_api", nome: "Leilões Judiciais" } }), null);
});

test("instantâneo real: MG, Lente, estado por nome, e a busca abaixo de 60 ms", { skip: !TEM }, async () => {
  const lista = await lerLista(PASTA);
  const ix = criarIndice(lista.itens, { textoExtra: (_, k) => lista.enderecos[k] });
  const b = (filtros: Busca["filtros"], extra: Partial<Busca> = {}): Busca => ({ conjunto: "previa", plano: "luneta", filtros, ordem: "desagio", pagina: 1, ...extra });
  const mg = buscar(ix, b({ uf: ["MG"] }), { agora: AGORA, selosDesligados: true });
  const mgPorNome = buscar(ix, b({ q: "minas gerais" }), { agora: AGORA, selosDesligados: true });
  assert.equal(mg.total, lista.itens.filter((i) => i.uf === "MG").length);
  assert.ok(mgPorNome.total >= mg.total, "nome do estado acha MG (e bairros com o nome)");
  const lente = buscar(ix, b({}, { plano: "lente" }), { agora: AGORA, selosDesligados: true });
  assert.ok(lente.itens.every((i) => i.tags.length === 0 && i.selo === 0));
  assert.deepEqual([lente.facetas.tags, lente.facetas.selo], [[], []]);
  const viz = vizinhanca(mg.itens[0]!, lista.itens);
  assert.ok(viz.referencias.length > 0, "há referência de R$/m² para o primeiro de MG");

  const casos = [b({}), b({ uf: ["SP", "RJ"], tipo: ["apartamento"], lanceMax: 300000, desagioMin: 20, semTags: ["preco-acima-mercado"] }, { ordem: "lance-asc" }), b({ q: "apartamento rio de janeiro" })];
  const tempos: number[] = [];
  for (const c of casos) buscar(ix, c, { agora: AGORA, selosDesligados: true });
  for (let r = 0; r < 5; r++) {
    for (const c of casos) {
      const t = performance.now();
      buscar(ix, c, { agora: AGORA, selosDesligados: true });
      tempos.push(performance.now() - t);
    }
  }
  tempos.sort((a, b) => a - b);
  const mediana = tempos[Math.floor(tempos.length / 2)]!;
  assert.ok(mediana < 60, `mediana ${mediana.toFixed(1)} ms com ${lista.itens.length} imóveis`);
});
