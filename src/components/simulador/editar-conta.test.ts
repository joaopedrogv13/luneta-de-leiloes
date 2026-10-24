/**
 * "Editar a conta" (rodada 5, decisão 7) e o aviso do favorito (decisão 8), renderizados no Node (react-dom/server, com o
 * JSX transformado pelo jiti), como o servidor os entrega na primeira pintura. Revisão final da rodada 5 (R5-TEC-11,
 * R5-TEC-15, CONT-03).
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

type Props = { editando: boolean; ajustada: boolean; aoAlternar: () => void };

test("Editar a conta: um botão de alternar com o nome fixo, o estado só no aria-pressed, e 'ajustada' com ajustes salvos", async () => {
  const { BotaoEditarConta } = await jiti.import<{ BotaoEditarConta: ComponentType<Props> }>(join(RAIZ, "src/components/simulador/Detalhe.tsx"));
  const html = (p: Omit<Props, "aoAlternar">) => renderToStaticMarkup(createElement(BotaoEditarConta, { ...p, aoAlternar: () => {} }));
  const texto = (h: string) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const fechada = html({ editando: false, ajustada: false });
  const aberta = html({ editando: true, ajustada: false });
  assert.match(fechada, /aria-pressed="false"/);
  assert.match(aberta, /aria-pressed="true"/);
  // o mesmo nome nos dois estados (a APG pede que o rótulo de um botão de alternar não mude com o estado)
  assert.equal(texto(fechada), "Editar a conta");
  assert.equal(texto(aberta), "Editar a conta");
  assert.doesNotMatch(aberta + fechada, /aria-expanded|Concluir/);
  // com ajustes salvos, abre igual e diz que a conta não é a padrão
  assert.equal(texto(html({ editando: false, ajustada: true })), "Editar a conta · ajustada");
  assert.equal(texto(html({ editando: true, ajustada: true })), "Editar a conta · ajustada");
});

test("aviso do favorito: na praça única, o texto fala do preço e da saída da venda (nunca da 2ª praça)", () => {
  assert.equal(textoAlerta(false).opcao, ALERTA_PRACA.opcao);
  assert.match(textoAlerta(false).explicacao, /2ª praça/);
  const unica = textoAlerta(true);
  assert.doesNotMatch(unica.opcao + unica.explicacao, /2ª praça (ou|\()|quando a praça mudar/);
  assert.match(unica.opcao, /preço/);
  assert.match(unica.explicacao, /vendido ou retirado/);
});
