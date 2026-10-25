/**
 * Rodada 6 do simulador, renderizado no Node (react-dom/server, com o JSX transformado pelo jiti), como o servidor o
 * entrega na primeira pintura:
 *   (1) o cartão "Seu lance máximo" também na venda direta, com "lance máximo + custos = investidos" e "Editar custos ↓"
 *       nos dois cartões;
 *   (2) o "Meu lance" com as marcas do mínimo e do máximo e o "Considerado com despesas"; a avaliação e a referência da
 *       região sempre à vista no "% de venda sobre";
 *   (3) a conta linha a linha fechada ao carregar, com o resumo; aberta, a conta inteira.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import { lanceMaisCustos } from "../../lib/simulador/calculo";
import { simulacaoCompleta, type ResultadoCompleto } from "../../lib/simulador/completa";
import { ESTADO_INICIAL, type EstadoSimulador } from "../../lib/simulador/estado";
import { moeda } from "../../lib/simulador/formato";
import type { EntradaSimulador } from "../../lib/simulador/tipos";
import type { ReferenciaM2 } from "../../lib/catalogo/tipos";

const RAIZ = process.cwd();
const jiti = createJiti(__filename, { jsx: { runtime: "automatic" }, alias: { "@/": `${join(RAIZ, "src")}/` } });
const texto = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const semEspaco = (t: string) => t.replace(/[\s\u00a0]+/g, " ");
/** um valor em reais dentro de uma expressão regular ("R$ 1.234" tem "$" e ".") */
const re = (t: string) => semEspaco(t).replace(/[$.()]/g, "\\$&");

const comum = { fonte: { id: "caixa_csv", nome: "Caixa" }, condicoesPagamento: null, judicial: false, parcelamento: null, ocupacao: null } as const;

/** Casa em São Gonçalo/RJ, venda direta (recorte dos dados reais). */
const vendaDireta: EntradaSimulador = {
  ...comum,
  id: "caixa-1444419640129",
  tipo: "casa",
  titulo: "Casa 3 quartos",
  area: 93.6,
  areaTerreno: 235,
  areaPrivativa: 93.6,
  avaliacao: 251_000,
  lance: 25_100,
  modalidade: "venda_direta",
  modalidadeFonte: "Venda Direta Online",
  uf: "RJ",
  cidade: "São Gonçalo",
  financiamento: false,
  tags: [],
};

/** Apartamento em leilão (SFI). */
const leilao: EntradaSimulador = {
  ...comum,
  id: "caixa-teste-sfi",
  tipo: "apartamento",
  titulo: "Apartamento 2 quartos",
  area: 62,
  areaTerreno: null,
  areaPrivativa: 62,
  avaliacao: 300_000,
  lance: 150_000,
  modalidade: "leilao",
  modalidadeFonte: "Leilão SFI - Edital Único",
  uf: "SP",
  cidade: "São Paulo",
  financiamento: true,
  tags: [],
};

const referencia: ReferenciaM2 = {
  escopo: "bairro",
  fonte: "itbi",
  nome: "Centro, São Paulo/SP",
  tipo: "apartamento",
  amostra: 40,
  media: 5_200,
  avaliacaoM2: null,
  lanceM2: null,
  imovel: { avaliacaoM2: null, lanceM2: null },
  percentilLance: null,
};

const estado = (extra: Partial<EstadoSimulador> = {}): EstadoSimulador => ({ ...ESTADO_INICIAL, ...extra });
const nada = () => {};

async function componentes() {
  const cartao = await jiti.import<{ CartaoResposta: ComponentType<Record<string, unknown>> }>(join(RAIZ, "src/components/simulador/CartaoResposta.tsx"));
  const matriz = await jiti.import<{ Matriz: ComponentType<Record<string, unknown>> }>(join(RAIZ, "src/components/simulador/Matriz.tsx"));
  const detalhe = await jiti.import<{ Detalhe: ComponentType<Record<string, unknown>> }>(join(RAIZ, "src/components/simulador/Detalhe.tsx"));
  return { CartaoResposta: cartao.CartaoResposta, Matriz: matriz.Matriz, Detalhe: detalhe.Detalhe };
}

const htmlCartao = (C: ComponentType<Record<string, unknown>>, r: ResultadoCompleto) =>
  renderToStaticMarkup(
    createElement(C, { r, aoMudarMeta: nada, aoMudarCelula: nada, aoDefinirPersonalizado: nada, aoInformarDividas: nada, aoAbrirConta: nada }),
  );
const htmlMatriz = (C: ComponentType<Record<string, unknown>>, r: ResultadoCompleto) =>
  renderToStaticMarkup(
    createElement(C, {
      r,
      visao: r.visao,
      aoSelecionar: nada,
      aoMudarVisao: nada,
      aoMudarMeuLance: nada,
      aoAjustar: nada,
      aoComoUsar: nada,
      aoEditarVenda: nada,
      aoAbrirConta: nada,
    }),
  );
const htmlDetalhe = (C: ComponentType<Record<string, unknown>>, r: ResultadoCompleto, contaAberta: boolean) =>
  renderToStaticMarkup(createElement(C, { r, aoEditar: nada, atualizar: nada, contaAberta, aoAlternarConta: nada }));

test("(1) venda direta: o cartão vira 'Seu lance máximo', com lance + custos = investidos, o link dos custos e o preço pedido comparado", async () => {
  const { CartaoResposta } = await componentes();
  const r = simulacaoCompleta(vendaDireta, ESTADO_INICIAL);
  const t = semEspaco(texto(htmlCartao(CartaoResposta, r)));
  assert.match(t, /Seu lance máximo/);
  assert.doesNotMatch(t, /Comprando pelo preço pedido/);
  assert.match(t, /Pague no máximo/);
  assert.ok(t.includes(semEspaco(moeda(r.teto!))), "o número grande é o lance máximo");
  // a decomposição fecha com a conta e diz que os custos se editam abaixo
  const d = lanceMaisCustos(r.comTeto!);
  for (const v of [d.lance, d.custos, d.total]) assert.ok(t.includes(semEspaco(moeda(v))), `falta ${moeda(v)}`);
  assert.match(t, /lance máximo \+ R\$ [\d.]+ custos = R\$ [\d.]+ investidos/);
  assert.match(t, /Editar custos/);
  // o preço pedido comparado com o máximo; o lucro pelo preço pedido e a margem continuam
  assert.match(t, new RegExp(`O preço pedido \\( ?${re(moeda(vendaDireta.lance))} ?\\) está R\\$ [\\d.]+ abaixo do seu máximo`));
  assert.match(t, /Pelo preço pedido: lucro de/);
  assert.match(t, /Margem de segurança/);
});

test("(1) leilão: o cartão ganha a mesma decomposição e o mesmo link", async () => {
  const { CartaoResposta } = await componentes();
  const r = simulacaoCompleta(leilao, ESTADO_INICIAL);
  const t = semEspaco(texto(htmlCartao(CartaoResposta, r)));
  assert.match(t, /Dê no máximo/);
  const d = lanceMaisCustos(r.comTeto!);
  assert.ok(t.includes(semEspaco(moeda(d.custos))));
  assert.match(t, /investidos/);
  assert.match(t, /Editar custos/);
});

test("(1) venda direta: a tabela mostra o lance máximo na outra visão (antes, a margem), com a margem na leitura", async () => {
  const { Matriz } = await componentes();
  const r = simulacaoCompleta(vendaDireta, estado({ visao: "teto" }));
  const t = semEspaco(texto(htmlMatriz(Matriz, r)));
  assert.match(t, /Lance máximo para a meta/);
  assert.doesNotMatch(t, /Margem para imprevistos/);
  assert.match(t, /O maior preço a pagar/);
  assert.match(t, /margem de R\$ [\d.]+/);
});

test("(2) Meu lance: marcas do mínimo e do máximo, 'Considerado com despesas' com o link da conta", async () => {
  const { Matriz } = await componentes();
  const r = simulacaoCompleta(leilao, ESTADO_INICIAL, [referencia]);
  const h = htmlMatriz(Matriz, r);
  const t = semEspaco(texto(h));
  assert.equal((h.match(/data-rotulo-marca/g) ?? []).length, 2);
  assert.match(t, /mínimo R\$ [\d.,]+ mil/);
  assert.match(t, /máximo R\$ [\d.,]+ mil/);
  assert.match(t, /Considerado com despesas · base, 12 meses/);
  const d = lanceMaisCustos(r.tabela![r.linhas.indexOf("base")]![r.colunas.indexOf(12)]!.comMeuLance);
  assert.ok(t.includes(semEspaco(moeda(d.total))));
  assert.match(t, /custos editáveis na conta abaixo/);
  // a régua é só visual; o leitor de tela ouve o máximo na ajuda do campo
  assert.match(t, new RegExp(`Seu lance máximo para a meta, no cenário base, 12 meses: ${re(moeda(r.teto!))}`));
});

test("(2) % de venda sobre: a avaliação (R$ e R$/m²) e a referência da região (R$/m², nível e fonte) sempre à vista", async () => {
  const { Matriz } = await componentes();
  // com a base na avaliação, na região e num valor informado: as duas aparecem sempre
  for (const ajustes of [{}, { baseVenda: "regiao" as const }, { valorVenda: 320_000 }]) {
    const r = simulacaoCompleta(leilao, estado({ ajustes }), [referencia]);
    const t = semEspaco(texto(htmlMatriz(Matriz, r)));
    assert.match(t, /Avaliação da fonte R\$ 300\.000 · R\$ 4\.839\/m²/, JSON.stringify(ajustes));
    assert.match(t, /Referência da região R\$ 5\.200\/m² · bairro · ITBI/, JSON.stringify(ajustes));
  }
  // sem referência e sem área: diz o que falta
  const semRef = simulacaoCompleta({ ...leilao, area: null, areaPrivativa: null }, ESTADO_INICIAL);
  const t = semEspaco(texto(htmlMatriz(Matriz, semRef)));
  assert.match(t, /R\$\/m²: área não informada/);
  assert.match(t, /sem referência para este tipo de imóvel/);
});

test("(3) a conta linha a linha vem fechada: o resumo e 'Ver e editar a conta'; aberta, a conta inteira com os lápis", async () => {
  const { Detalhe } = await componentes();
  const r = simulacaoCompleta(leilao, ESTADO_INICIAL);
  const fechada = htmlDetalhe(Detalhe, r, false);
  const tf = semEspaco(texto(fechada));
  assert.match(fechada, /aria-expanded="false"/);
  assert.match(tf, /Ver e editar a conta/);
  assert.doesNotMatch(fechada, /id="sim-conta"|Restaurar tudo|Adicionar custo/);
  const d = lanceMaisCustos(r.detalhe!.sim);
  for (const v of [d.lance, d.custos, d.total]) assert.ok(tf.includes(semEspaco(moeda(v))));
  assert.match(tf, /investidos/);
  assert.match(tf, /lucro em 12 meses/);
  assert.doesNotMatch(tf, /conta ajustada/);
  // o título da conta recebe o foco quando um "Editar custos ↓" a abre
  assert.match(fechada, /id="sim-conta-titulo" tabindex="-1"/);

  const aberta = htmlDetalhe(Detalhe, r, true);
  assert.match(aberta, /aria-expanded="true"/);
  assert.match(aberta, /id="sim-conta-corpo"/);
  assert.match(texto(aberta), /Restaurar tudo/);
  assert.match(texto(aberta), /Adicionar custo/);
  assert.match(aberta, /aria-label="Editar itbi"/);

  // com ajustes salvos, o resumo diz "conta ajustada"
  const ajustada = simulacaoCompleta(leilao, estado({ ajustes: { itbiPct: 0.05 } }));
  assert.match(texto(htmlDetalhe(Detalhe, ajustada, false)), /conta ajustada/);
});

test("(2) revisão: o 'Meu lance' chama o lance como a conta fechada e não repete o mínimo que já está na régua", async () => {
  const { Matriz } = await componentes();
  // sem lance digitado: é o lance mínimo (o mesmo nome do resumo da conta fechada)
  const r = simulacaoCompleta(leilao, ESTADO_INICIAL);
  const h = htmlMatriz(Matriz, r);
  assert.match(semEspaco(texto(h)), /Considerado com despesas · base, 12 meses R\$ [\d.]+ lance mínimo \+/);
  // o "Lance mínimo atual" do texto de ajuda fica só para o leitor de tela (a marca "mínimo" da régua já o mostra)
  assert.match(h, /<span class="sr-only">Lance mínimo atual: R\$/);
  // com um lance digitado: "seu lance"; na venda direta: "preço pedido" / "seu preço"
  assert.match(semEspaco(texto(htmlMatriz(Matriz, simulacaoCompleta(leilao, estado({ meuLance: 180_000 }))))), /R\$ 180\.000 seu lance \+/);
  assert.match(semEspaco(texto(htmlMatriz(Matriz, simulacaoCompleta(vendaDireta, ESTADO_INICIAL)))), /R\$ 25\.100 preço pedido \+/);
  assert.match(semEspaco(texto(htmlMatriz(Matriz, simulacaoCompleta(vendaDireta, estado({ meuLance: 30_000 }))))), /R\$ 30\.000 seu preço \+/);
});

test("(2) revisão: a régua do 'Meu lance' vai até o seu lance máximo (cenário personalizado acima do otimista)", async () => {
  const { Matriz } = await componentes();
  const r = simulacaoCompleta(vendaDireta, estado({ ajustes: { vendaPersonalizada: { modo: "pct", valor: 2.5 } }, celula: { cenario: "personalizado", meses: 12 } }));
  assert.ok(r.teto! > 276_100, "o máximo passa da maior venda dos cenários fixos");
  const h = htmlMatriz(Matriz, r);
  const input = /<input[^>]*type="range"[^>]*>/.exec(h)?.[0] ?? "";
  const max = Number(/max="(\d+)"/.exec(input)?.[1]);
  assert.ok(max >= r.teto!, `fim da régua ${max} × máximo ${r.teto}`);
  // as duas marcas ficam antes da ponta (fração < 1)
  const fracoes = [...h.matchAll(/\(100% - 20px\) \* ([\d.]+)\)/g)].map((m) => Number(m[1]));
  assert.equal(fracoes.length, 2);
  assert.ok(fracoes.every((f) => f < 1), JSON.stringify(fracoes));
});
