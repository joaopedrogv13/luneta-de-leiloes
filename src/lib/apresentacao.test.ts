/**
 * "Voltar à apresentação" (rodada 5, ponto 10): o registro da saída da landing (sessionStorage) e a conta da volta.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { alvoDaVolta, CHAVE_APRESENTACAO, ehDestinoDaApresentacao, lerSaida, SELETOR_LINKS, VALIDADE_MS, type SaidaApresentacao } from "./apresentacao";

const AGORA = Date.UTC(2026, 9, 23, 15);

function armazenamento(valor: unknown) {
  const bruto = typeof valor === "string" ? valor : JSON.stringify(valor);
  return { getItem: (k: string) => (k === CHAVE_APRESENTACAO ? bruto : null) };
}

const BOA: SaidaApresentacao = {
  v: 1,
  em: AGORA - 60_000,
  y: 5234,
  link: 7,
  destino: "/assinante/imovel/ex-alvo-sp#simulador",
  linkTopo: 412,
  fixo: false,
  secao: "decida",
  token: "abc123",
};

test("destinos: a demonstração e o método contam; a landing, a prévia e outros sites não", () => {
  for (const href of ["/assinante", "/assinante?plano=lente", "/assinante/imovel/ex-alvo-sp#simulador", "/metodologia/localizacao"]) {
    assert.ok(ehDestinoDaApresentacao(href), href);
  }
  for (const href of ["/", "/#planos", "/previa", "/previa/imovel/1", "/assinantes", "https://exemplo.com/assinante", "#assinante"]) {
    assert.ok(!ehDestinoDaApresentacao(href), href);
  }
  assert.equal(SELETOR_LINKS, 'a[href^="/assinante"],a[href^="/metodologia"]');
});

test("registro: lê o que a landing gravou, e ignora o vencido, o quebrado e o de outro formato", () => {
  assert.deepEqual(lerSaida(AGORA, armazenamento(BOA)), { ...BOA, voltando: false });
  assert.equal(lerSaida(AGORA, armazenamento({ ...BOA, voltando: true }))?.voltando, true);
  // vencido (a pessoa saiu da apresentação faz mais de 12 h) ou do futuro (relógio mexido)
  assert.equal(lerSaida(AGORA, armazenamento({ ...BOA, em: AGORA - VALIDADE_MS - 1 })), null);
  assert.equal(lerSaida(AGORA, armazenamento({ ...BOA, em: AGORA + 5 * 60_000 })), null);
  // quebrado, de outra versão ou sem os campos que a volta usa
  assert.equal(lerSaida(AGORA, armazenamento("{não é json")), null);
  assert.equal(lerSaida(AGORA, armazenamento({ ...BOA, v: 2 })), null);
  assert.equal(lerSaida(AGORA, armazenamento({ ...BOA, destino: undefined })), null);
  assert.equal(lerSaida(AGORA, { getItem: () => null }), null);
  // sem armazenamento (aba privada com bloqueio): o botão não aparece
  assert.equal(lerSaida(AGORA, null), null);
  assert.equal(
    lerSaida(AGORA, {
      getItem: () => {
        throw new Error("bloqueado");
      },
    }),
    null,
  );
  // rolagem negativa vira 0; link sem índice vira -1 (a volta usa a rolagem)
  const s = lerSaida(AGORA, armazenamento({ ...BOA, y: -40, link: "x" }));
  assert.equal(s?.y, 0);
  assert.equal(s?.link, -1);
});

test("volta: o link clicado volta ao mesmo lugar da tela; menu fixo ou link sumido usam a rolagem guardada", () => {
  // o link está agora a 5.700 px do topo do documento e estava a 412 px do topo da tela: rola até 5.288
  assert.equal(alvoDaVolta(BOA, 5700, 20_000), 5288);
  // a página mudou de altura acima do link (seção que abriu, fonte que carregou): o link é que manda
  assert.equal(alvoDaVolta(BOA, 6100, 20_000), 5688);
  // link no menu fixo: a posição dele na tela não diz nada; vale a rolagem
  assert.equal(alvoDaVolta({ ...BOA, fixo: true }, 30, 20_000), 5234);
  // o link sumiu (outra versão da página)
  assert.equal(alvoDaVolta(BOA, null, 20_000), 5234);
  // nunca antes do topo nem depois do fim
  assert.equal(alvoDaVolta(BOA, 100, 20_000), 0);
  assert.equal(alvoDaVolta(BOA, null, 3000), 3000);
});
