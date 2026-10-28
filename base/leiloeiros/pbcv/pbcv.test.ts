/**
 * O lado TypeScript dos casos compartilhados com o exportador do PBCV (Python): a máscara de dados pessoais, o corte
 * de pessoa dos campos de lugar e o tipo do imóvel dão, em casos-compartilhados.json, a saída gravada lá. O lado
 * Python é o testar.py (python3 base/leiloeiros/pbcv/testar.py), que lê o mesmo arquivo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNCOES, lerCasos } from "./casos.ts";

test("casos compartilhados com o Python: o TypeScript dá a saída gravada (se mudou de propósito, rode gerar-casos.ts)", () => {
  const { casos } = lerCasos();
  assert.ok(casos.length >= 150, `só ${casos.length} casos`);
  for (const caso of casos) {
    assert.ok(caso.funcao in FUNCOES, `função desconhecida: ${caso.funcao}`);
    assert.equal(FUNCOES[caso.funcao](caso.entrada), caso.saida, `${caso.funcao}(${JSON.stringify(caso.entrada)})`);
  }
});

test("casos compartilhados: cobrem as cinco funções, mascaram nomes e documentos e têm caractere fora do plano básico", () => {
  const { casos } = lerCasos();
  for (const funcao of Object.keys(FUNCOES)) assert.ok(casos.some((c) => c.funcao === funcao), funcao);
  const mascarados = casos.filter((c) => c.funcao === "mascararDadosPessoais" && c.saida !== c.entrada);
  assert.ok(mascarados.some((c) => c.saida?.includes("[NOME]")) && mascarados.some((c) => c.saida?.includes("[CPF]")));
  assert.ok(casos.some((c) => /[\u{10000}-\u{10FFFF}]/u.test(c.entrada)), "emoji ou letra matemática (UTF-16 no TypeScript)");
});
