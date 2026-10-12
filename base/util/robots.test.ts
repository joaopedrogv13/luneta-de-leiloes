import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarRobots, grupoPara, robotsPermite } from "./robots.ts";

// robots.txt da Leilões Judiciais arquivado na sonda de 11/10/2026 (trecho).
const LJ = `User-agent: *
Allow: /api/mcp/messages
Allow: /api/openapi.json
Allow: /auth.md
Disallow: /busca
Disallow: /*?pagina=
Content-Signal: ai-train=no, search=yes, ai-input=yes
Sitemap: https://www.leiloesjudiciais.com.br/sitemap.xml`;

test("robots da Leilões Judiciais", () => {
  const robots = analisarRobots(LJ);
  assert.deepEqual(robots.sitemaps, ["https://www.leiloesjudiciais.com.br/sitemap.xml"]);
  const g = grupoPara(robots, "LunetaDeLeiloes");
  assert.ok(robotsPermite(g, "/api/mcp/messages"));
  assert.ok(robotsPermite(g, "/imoveis"));
  assert.ok(!robotsPermite(g, "/busca"));
  assert.ok(!robotsPermite(g, "/busca/apartamento"));
  assert.ok(!robotsPermite(g, "/imoveis?pagina=2"));
  assert.ok(robotsPermite(g, "/robots.txt"));
});

test("regra mais longa vence, empate favorece Allow, curingas e âncora", () => {
  const g = grupoPara(
    analisarRobots(`User-agent: *
Disallow: /a
Allow: /a/b
Disallow: /*.pdf$
Allow: /x
Disallow: /x`),
    "LunetaDeLeiloes",
  );
  assert.ok(!robotsPermite(g, "/a/c"));
  assert.ok(robotsPermite(g, "/a/b/c"));
  assert.ok(!robotsPermite(g, "/editais/1.pdf"));
  assert.ok(robotsPermite(g, "/editais/1.pdf?v=2"), "$ ancora no fim");
  assert.ok(robotsPermite(g, "/x"), "empate: Allow");
});

test("grupo específico do robô substitui o *; Crawl-delay; Disallow vazio", () => {
  const robots = analisarRobots(`# comentário
User-agent: *
Disallow: /

User-agent: OutroBot
User-agent: lunetadeleiloes
Disallow: /privado
Crawl-delay: 5

User-agent: Livre
Disallow:`);
  const nosso = grupoPara(robots, "LunetaDeLeiloes");
  assert.ok(robotsPermite(nosso, "/publico"));
  assert.ok(!robotsPermite(nosso, "/privado/1"));
  assert.equal(nosso.crawlDelay, 5);
  const outro = grupoPara(robots, "Desconhecido");
  assert.ok(!robotsPermite(outro, "/qualquer"));
  assert.ok(robotsPermite(grupoPara(robots, "Livre"), "/tudo"));
  assert.ok(robotsPermite(grupoPara(analisarRobots(""), "LunetaDeLeiloes"), "/x"), "sem robots, tudo permitido");
});
