import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarDescricao, tipoDaCaixa, tituloDoImovel } from "./descricao.ts";

test("descrição completa da Caixa: tipo, áreas, quartos, vagas, salas e itens", () => {
  const d = interpretarDescricao(
    "Casa, 111.70 de área total, 111.70 de área privativa, 300.00 de área do terreno,  1 qto(s), a.serv, WC, 1 sala(s), cozinha, 1 vaga(s) de garagem.",
  );
  assert.equal(d.tipo_fonte, "Casa");
  assert.equal(d.tipo, "casa");
  assert.equal(d.area_total, 111.7);
  assert.equal(d.area_privativa, 111.7);
  assert.equal(d.area_terreno, 300);
  assert.equal(d.quartos, 1);
  assert.equal(d.vagas, 1);
  assert.equal(d.salas, 1);
  assert.deepEqual(d.itens, ["area de servico", "wc", "cozinha"]);
  assert.deepEqual(d.desconhecidos, []);
});

test("área 0.00 é 'não informado' e área com ponto decimal grande é lida certa", () => {
  const d = interpretarDescricao("Gleba, 0.00 de área total, 0.00 de área privativa, 49338.00 de área do terreno.");
  assert.equal(d.area_total, null);
  assert.equal(d.area_privativa, null);
  assert.equal(d.area_terreno, 49338);
  assert.equal(d.quartos, null, "sem 'qto(s)' não é zero quartos, é não informado");
  assert.equal(d.vagas, null);
  assert.equal(d.tipo, "rural");
});

test("área irrisória (0.01 m²) é marcador da Caixa, não área", () => {
  const d = interpretarDescricao("Casa, 0.00 de área total, 0.01 de área privativa, 144.00 de área do terreno,  1 qto(s), WC.");
  assert.equal(d.area_privativa, null);
  assert.equal(d.area_terreno, 144);
});

test("todos os pedaços vistos no CSV de 08/10/2026 são reconhecidos", () => {
  const d = interpretarDescricao(
    "Apartamento, 90.00 de área total, 70.00 de área privativa, 0.00 de área do terreno,  3 qto(s), varanda, a.serv, WC, WC Emp, 2 sala(s), 2 lavabo(s), DCE, sacada, cozinha, Terraco, piscina, 2 vaga(s) de garagem.",
  );
  assert.deepEqual(d.desconhecidos, []);
  assert.equal(d.lavabos, 2);
  assert.equal(d.salas, 2);
  assert.equal(d.vagas, 2);
  assert.ok(d.itens.includes("terraco") && d.itens.includes("piscina") && d.itens.includes("dependencia de empregada"));
});

test("pedaço desconhecido não quebra: vai para desconhecidos (mede a cobertura)", () => {
  const d = interpretarDescricao("Casa, 50.00 de área total, 2 qto(s), quadra de tênis, heliponto.");
  assert.equal(d.quartos, 2);
  assert.deepEqual(d.desconhecidos, ["quadra de tênis", "heliponto"]);
  assert.deepEqual(interpretarDescricao("").desconhecidos, []);
  assert.equal(interpretarDescricao(null).tipo, "outro");
});

test("descrição livre da ficha (sem tipo): '2  Quartos, 1 Vaga na Garagem, Área de Serviço, 2 Wc'", () => {
  const d = interpretarDescricao("2  Quartos, 1 Vaga na Garagem,  Varanda/sacada,  Área de Serviço, 2 Wc,  Sala,  Cozinha. .");
  assert.equal(d.tipo_fonte, null);
  assert.equal(d.quartos, 2);
  assert.equal(d.vagas, 1);
  assert.deepEqual(d.desconhecidos, []);
});

test("tipos da Caixa no vocabulário da base", () => {
  const casos: Record<string, string> = {
    Apartamento: "apartamento", Casa: "casa", Sobrado: "casa", Terreno: "terreno", "Gleba Urbana": "terreno",
    Gleba: "rural", "Imóvel rural": "rural", Prédio: "comercial", Comercial: "comercial", Sala: "comercial",
    Loja: "comercial", Galpão: "comercial", Outros: "outro",
  };
  for (const [rotulo, tipo] of Object.entries(casos)) assert.equal(tipoDaCaixa(rotulo), tipo, rotulo);
});

test("título curto no estilo do site", () => {
  const titulo = (descricao: string): string => tituloDoImovel(interpretarDescricao(descricao));
  assert.equal(titulo("Apartamento, 50.00 de área total, 40.54 de área privativa, 0.00 de área do terreno,  2 qto(s), WC."), "Apartamento 2 quartos");
  assert.equal(titulo("Casa, 0.00 de área total, 60.00 de área privativa, 0.00 de área do terreno,  1 qto(s)."), "Casa 1 quarto");
  assert.equal(titulo("Terreno, 0.00 de área total, 0.00 de área privativa, 600.00 de área do terreno."), "Terreno 600 m²");
  assert.equal(titulo("Sala, 0.00 de área total, 35.50 de área privativa, 0.00 de área do terreno."), "Sala comercial 35,5 m²");
  assert.equal(titulo("Gleba Urbana, 0.00 de área total, 0.00 de área privativa, 18856.00 de área do terreno."), "Gleba urbana 18.856 m²");
  assert.equal(titulo("Outros, 0.00 de área total, 0.00 de área privativa, 0.00 de área do terreno."), "Imóvel");
});
