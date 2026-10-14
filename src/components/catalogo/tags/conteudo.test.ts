import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIAS, TAGS } from "../../../../base/riscos/tags";
import { join } from "node:path";
import { createJiti } from "jiti";
import type { Listing } from "../../../content/examples";
import { converterExemplos } from "../../../lib/catalogo/exemplos";
import { TAGS_BASE, conteudoTag, ordenarTags, origemTag, partesEvidencia } from "./conteudo";

test("as 26 tags espelham base/riscos/tags.ts (slug, rótulo, gravidade e categoria)", () => {
  assert.equal(TAGS_BASE.length, TAGS.length);
  TAGS.forEach((t, i) => {
    const c = TAGS_BASE[i];
    assert.deepEqual(
      { slug: c.slug, rotulo: c.rotulo, severidade: c.severidade, categoria: c.categoria },
      { slug: t.slug, rotulo: t.rotulo, severidade: t.severidade, categoria: CATEGORIAS[t.categoria] },
    );
  });
});

test("toda tag da base tem explicação própria vinda do site", () => {
  for (const t of TAGS_BASE) {
    const c = conteudoTag(t);
    assert.equal(c.generico, false, `${t.slug} caiu no texto genérico`);
    assert.ok(c.oQueE.length > 20 && c.naPratica.length > 20, t.slug);
    assert.equal(c.categoria, t.categoria);
  }
});

test("nenhuma tag dos exemplos da demonstração cai no texto genérico", async () => {
  // src/content/examples.ts usa o alias "@/" do Next: aqui ele aponta para src/
  const jiti = createJiti(__filename, { alias: { "@/": `${join(process.cwd(), "src")}/` } });
  const { LISTINGS } = await jiti.import<{ LISTINGS: Listing[] }>(join(process.cwd(), "src", "content", "examples.ts"));
  for (const d of converterExemplos(LISTINGS)) {
    for (const t of d.tags) {
      const c = conteudoTag(t);
      assert.equal(c.generico, false, `${d.id}: ${t.rotulo} caiu no texto genérico`);
      assert.ok(c.categoria, `${d.id}: ${t.rotulo} sem categoria`);
    }
  }
  assert.equal(origemTag("exemplo").rotulo, "exemplo fictício");
});

test("slug desconhecido ganha texto genérico pela gravidade, e o rótulo recebido vale", () => {
  const c = conteudoTag({ slug: "nova-tag", rotulo: "Nova tag", severidade: "atencao" });
  assert.equal(c.generico, true);
  assert.equal(c.rotulo, "Nova tag");
  assert.equal(c.categoria, null);
  assert.match(c.naPratica, /edital/);
});

test("rótulo com caixa ou acento diferente ainda casa com o texto do site", () => {
  const c = conteudoTag({ slug: "x", rotulo: "DESAGIO ALTO", severidade: "positivo" });
  assert.equal(c.generico, false);
  assert.match(c.oQueE, /Deságio/);
});

test("origem traduzida para leigos", () => {
  assert.deepEqual(origemTag("campo:modalidade_fonte"), { rotulo: "campo da fonte", detalhe: "modalidade da venda" });
  assert.deepEqual(origemTag("campo:qualquer_coisa"), { rotulo: "campo da fonte", detalhe: null });
  assert.equal(origemTag("descricao").rotulo, "descrição do anúncio");
  assert.equal(origemTag("ficha").rotulo, "ficha do imóvel");
  assert.equal(origemTag("edital").rotulo, "edital");
  assert.equal(origemTag("ausencia").rotulo, "a fonte não informa");
  assert.equal(origemTag("???").rotulo, "dados da fonte");
  // todos os campos que o motor de regras grava hoje têm nome em português
  for (const campo of ["modalidade", "judicial", "preco×valor_avaliacao", "preco>valor_avaliacao", "fotos", "aceita_financiamento", "pracas", "praca_atual", "regra_praca", "modalidade_fonte"]) {
    assert.ok(origemTag(`campo:${campo}`).detalhe, campo);
  }
});

test("evidência: só o trecho da fonte vai entre aspas; a frase da regra fica fora", () => {
  assert.deepEqual(partesEvidencia("…Ocupam o imóvel, como moradoras…", "descricao"), { nota: null, trecho: "…Ocupam o imóvel, como moradoras…" });
  assert.deepEqual(partesEvidencia("Só há sinal fraco de ocupação no texto: …servindo de depósito…", "descricao"), {
    nota: "Só há sinal fraco de ocupação no texto:",
    trecho: "…servindo de depósito…",
  });
  assert.deepEqual(partesEvidencia("Direitos - Apartamento - São Paulo/SP", "titulo"), { nota: null, trecho: "Direitos - Apartamento - São Paulo/SP" });
  assert.deepEqual(partesEvidencia("Preço mínimo R$ 50.074,26 sobre avaliação de R$ 150.000,00: deságio de 66,6%.", "campo:preco×valor_avaliacao"), {
    nota: "Preço mínimo R$ 50.074,26 sobre avaliação de R$ 150.000,00: deságio de 66,6%.",
    trecho: null,
  });
  assert.deepEqual(partesEvidencia("  ", "descricao"), { nota: null, trecho: null });
});

test("ordem: confirmadas antes das em revisão; grave, atenção, positivo, informativo; empate estável", () => {
  const t = (slug: string, severidade: "grave" | "atencao" | "positivo" | "info", emRevisao = false) => ({ slug, severidade, emRevisao });
  const entrada = [t("i", "info"), t("rg", "grave", true), t("p1", "positivo"), t("a", "atencao"), t("g", "grave"), t("p2", "positivo"), t("ra", "atencao", true)];
  assert.deepEqual(
    ordenarTags(entrada).map((x) => x.slug),
    ["g", "a", "p1", "p2", "i", "rg", "ra"],
  );
  assert.equal(entrada[0].slug, "i", "não altera a lista original");
});
