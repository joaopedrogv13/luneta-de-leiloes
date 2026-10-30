/**
 * Fontes do rodapé, da faixa da prévia e do PDF com muitos leiloeiros: uma linha "N leiloeiros" no lugar de ~500 nomes
 * (carga do PBCV de 29/10/2026: 507 fontes de leiloeiro, 425 com imóvel no site).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { codigoNaFonte, fontesDoRelatorio } from "../../components/catalogo/relatorio/dados";
import { ID_GRUPO_LEILOEIROS, periodoDaFonte, resumirFontes } from "./fontes-resumo";
import type { SobreConjunto } from "./tipos";

const FONTES: SobreConjunto["fontes"] = [
  { id: "caixa_csv", nome: "Caixa", geradoNaFonteEm: "2026-10-08", total: 21226 },
  { id: "leiloesjudiciais_api", nome: "Leilões Judiciais", geradoNaFonteEm: "2026-10-11T01:35:00.000Z", total: 2 },
  { id: "ll_123leiloes", nome: "123leiloes.com.br", geradoNaFonteEm: "2026-10-29T03:05:42.000Z", total: 9 },
  { id: "ll_abaleiloes", nome: "abaleiloes.com.br", geradoNaFonteEm: "2026-10-28T01:37:02.000Z", total: 0 },
  { id: "ll_portalzuk", nome: "portalzuk.com.br", geradoNaFonteEm: "2026-10-28T23:10:00.000Z", total: 770 },
  { id: "ll_semdata", nome: "semdata.com.br", geradoNaFonteEm: null, total: 1 },
];

test("os leiloeiros viram uma linha só, com a soma e o intervalo das datas; os sem imóvel não contam", () => {
  const r = resumirFontes(FONTES);
  assert.deepEqual(
    r.map((f) => f.id),
    ["caixa_csv", "leiloesjudiciais_api", ID_GRUPO_LEILOEIROS],
  );
  const g = r[2]!;
  assert.equal(g.nome, "3 leiloeiros");
  assert.equal(g.total, 9 + 770 + 1);
  assert.equal(g.leiloeiros, 3);
  assert.equal(g.geradoNaFonteEm, "2026-10-28T23:10:00.000Z");
  assert.equal(g.geradoAte, "2026-10-29T03:05:42.000Z");
  assert.equal(r[0]!.nome, "Caixa", "as outras fontes ficam como estão");
});

test("um leiloeiro só fica com o nome dele; sem leiloeiro, nada muda", () => {
  const um = resumirFontes([FONTES[0]!, FONTES[2]!, FONTES[3]!]);
  assert.deepEqual(um.map((f) => f.nome), ["Caixa", "123leiloes.com.br"]);
  assert.deepEqual(resumirFontes(FONTES.slice(0, 2)).map((f) => f.id), ["caixa_csv", "leiloesjudiciais_api"]);
});

test("período: um dia só quando as datas caem no mesmo dia; com dias diferentes, 'de a'", () => {
  const fmt = (iso: string) => iso.slice(0, 10);
  assert.equal(periodoDaFonte({ geradoNaFonteEm: "2026-10-28T01:00:00Z", geradoAte: "2026-10-29T03:00:00Z" }, fmt), "2026-10-28 a 2026-10-29");
  assert.equal(periodoDaFonte({ geradoNaFonteEm: "2026-10-29T01:00:00Z", geradoAte: "2026-10-29T03:00:00Z" }, fmt), "2026-10-29");
  assert.equal(periodoDaFonte({ geradoNaFonteEm: "2026-10-08", geradoAte: null }, fmt), "2026-10-08");
  assert.equal(periodoDaFonte({ geradoNaFonteEm: null, geradoAte: null }, fmt), null);
});

test("PDF: as fontes numa frase curta, com o horário de Brasília", () => {
  const t = fontesDoRelatorio(FONTES);
  // 23:10 UTC de 28/10 é 20:10 em Brasília; 03:05 UTC de 29/10 é 00:05 de 29/10
  assert.equal(t, "Caixa, 08/10/2026; Leilões Judiciais, 10/10/2026; 3 leiloeiros, 28/10/2026 a 29/10/2026");
  assert.ok(!t.includes("portalzuk"));
});

test("PDF: o código do imóvel na fonte, sem o prefixo da Luneta (no leiloeiro, o lote)", () => {
  assert.equal(codigoNaFonte("caixa-1444419640129"), "1444419640129");
  assert.equal(codigoNaFonte("lj-12345"), "12345");
  assert.equal(codigoNaFonte("ll-alvesleiloes-1264"), "1264");
  assert.equal(codigoNaFonte("ll-leiloei-com-121874"), "121874");
  assert.equal(codigoNaFonte("ex-alvo-sp"), "ex-alvo-sp");
});
