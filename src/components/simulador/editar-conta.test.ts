/**
 * O botão da conta linha a linha (rodada 6, decisão 3; antes, "Editar a conta" da rodada 5, decisão 7) e o aviso do
 * favorito (rodada 5, decisão 8), renderizados no Node (react-dom/server, com o JSX transformado pelo jiti), como o
 * servidor os entrega na primeira pintura. Revisão final da rodada 5 (R5-TEC-11, R5-TEC-15, CONT-03).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { ALERTA_PRACA, textoAlerta } from "../../lib/catalogo/produto";

const RAIZ = process.cwd();
const jiti = createJiti(__filename, { jsx: { runtime: "automatic" }, alias: { "@/": `${join(RAIZ, "src")}/` } });

type Props = { aberta: boolean; aoAlternar: () => void };

test("Ver e editar a conta: um botão de mostrar e esconder (aria-expanded e aria-controls), o mesmo elemento nos dois estados", async () => {
  const { BotaoEditarConta } = await jiti.import<{ BotaoEditarConta: ComponentType<Props> }>(join(RAIZ, "src/components/simulador/Detalhe.tsx"));
  const html = (aberta: boolean) => renderToStaticMarkup(createElement(BotaoEditarConta, { aberta, aoAlternar: () => {} }));
  const texto = (h: string) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const fechada = html(false);
  const aberta = html(true);
  assert.match(fechada, /aria-expanded="false"/);
  assert.match(aberta, /aria-expanded="true"/);
  assert.match(fechada + aberta, /aria-controls="sim-conta-corpo"/);
  // não é mais um botão de alternar: nada de aria-pressed
  assert.doesNotMatch(fechada + aberta, /aria-pressed/);
  assert.equal(texto(fechada), "Ver e editar a conta");
  assert.equal(texto(aberta), "Fechar a conta");
});

test("aviso do favorito: na praça única, o texto fala do preço e da saída da venda (nunca da 2ª praça)", () => {
  assert.equal(textoAlerta(false).opcao, ALERTA_PRACA.opcao);
  assert.match(textoAlerta(false).explicacao, /2ª praça/);
  const unica = textoAlerta(true);
  assert.doesNotMatch(unica.opcao + unica.explicacao, /2ª praça (ou|\()|quando a praça mudar/);
  assert.match(unica.opcao, /preço/);
  assert.match(unica.explicacao, /vendido ou retirado/);
});
