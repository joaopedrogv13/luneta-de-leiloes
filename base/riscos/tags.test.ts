import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CATEGORIAS, TAGS, definicaoTag, ehSlugTag } from "./tags.ts";

test("26 tags com slug único e estável", () => {
  assert.equal(TAGS.length, 26);
  const slugs = TAGS.map((t) => t.slug);
  assert.equal(new Set(slugs).size, 26);
  for (const s of slugs) assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.deepEqual(slugs, [
    "ocupado", "desocupado", "ocupacao-nao-informada",
    "desagio-alto", "desagio-baixo", "preco-acima-mercado", "custos-extras-altos",
    "condominio-em-atraso", "iptu-em-atraso", "divida-passa-arrematante",
    "acao-judicial", "penhora-outros-credores", "leilao-com-recurso", "direito-preferencia",
    "matricula-pendencia", "construcao-irregular", "area-divergente",
    "imovel-inteiro", "cota-parte", "so-direitos",
    "sem-fotos", "sem-vistoria", "aceita-financiamento",
    "primeira-praca", "segunda-praca", "praca-unica",
  ]);
  assert.ok(ehSlugTag("ocupado"));
  assert.ok(!ehSlugTag("Ocupado"));
  assert.equal(definicaoTag("praca-unica")?.rotulo, "Praça única");
});

test("rótulo, categoria e severidade iguais aos do site (src/content/tags.ts)", () => {
  const caminho = fileURLToPath(new URL("../../src/content/tags.ts", import.meta.url));
  // só TAG_CATEGORIES: as tags de localização (TAGS_LOCALIZACAO, metrô, trem e VLT perto, rodada 5) são calculadas pelo
  // site com o OpenStreetMap, não pelo motor de regras da base
  const inteira = readFileSync(caminho, "utf8");
  const fimAnalise = inteira.indexOf("export const TAGS_LOCALIZACAO");
  const fonte = fimAnalise >= 0 ? inteira.slice(0, fimAnalise) : inteira;
  // Lê a estrutura do site como texto: cada categoria (name) seguida das suas tags (label, severity).
  const site: Array<{ categoria: string; rotulo: string; severidade: string }> = [];
  let categoria = "";
  for (const m of fonte.matchAll(/name: "([^"]+)"|label: "([^"]+)",\s*severity: "([^"]+)"/g)) {
    if (m[1]) categoria = m[1];
    else if (m[2] && m[3]) site.push({ categoria, rotulo: m[2], severidade: m[3] });
  }
  assert.equal(site.length, 26, "o site deve ter as mesmas 26 tags");
  assert.deepEqual(
    TAGS.map((t) => ({ categoria: CATEGORIAS[t.categoria], rotulo: t.rotulo, severidade: t.severidade })),
    site,
  );
});
