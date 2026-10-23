import assert from "node:assert/strict";
import { test } from "node:test";
import { filtrosIguais } from "../../../lib/catalogo/filtros-rotulos";
import { lerBusca } from "../../../lib/catalogo/url";
import { canonico, chaveMapa, consultaContagem, consultaLista, consultaMapa, consultaPontos, enderecoPagina } from "./consultas";

const pedido = { filtros: { uf: ["SP", "MG"], tipo: ["casa" as const, "apartamento" as const], lanceMax: 300000 }, ordem: "lance-asc" as const, pagina: 2, plano: "luneta" as const };

test("lista: a mesma busca em outra ordem de escolha dá a mesma chave, sempre sem o mapa", () => {
  const a = consultaLista("previa", pedido);
  const b = consultaLista("previa", { ...pedido, filtros: { tipo: ["apartamento", "casa"], lanceMax: 300000, uf: ["MG", "SP"] } });
  assert.equal(a, b);
  const p = new URLSearchParams(a);
  assert.equal(p.get("conjunto"), "previa");
  assert.equal(p.get("mapa"), "0");
  assert.equal(p.get("pagina"), "2");
  assert.equal(p.get("ordem"), "lance-asc");
  assert.deepEqual(p.getAll("uf"), ["MG", "SP"]);
  // a API lê de volta os mesmos filtros
  assert.deepEqual(lerBusca(p).filtros, canonico(pedido.filtros));
});

test("lista: plano Lente vai na consulta; Luneta e ordem padrão ficam de fora", () => {
  const p = new URLSearchParams(consultaLista("exemplos", { filtros: {}, ordem: "desagio", pagina: 1, plano: "lente" }));
  assert.equal(p.get("plano"), "lente");
  assert.equal(p.get("ordem"), null);
  assert.equal(p.get("pagina"), null);
});

test("mapa: não muda com página, ordem nem com o plano quando não há filtro de tag", () => {
  const luneta = chaveMapa("previa", { uf: ["MG"] }, "luneta", true);
  assert.equal(chaveMapa("previa", { uf: ["MG"] }, "lente", true), luneta);
  assert.notEqual(chaveMapa("previa", { uf: ["MG"], semTags: ["ocupado"] }, "luneta", true), luneta, "Luneta com tag escondida: outro mapa");
  assert.equal(chaveMapa("previa", { uf: ["MG"], semTags: ["ocupado"] }, "lente", true).includes("semTags"), false, "no Lente o filtro de tag não vale");
  const q = new URLSearchParams(consultaMapa("previa", { uf: ["MG"] }, "luneta"));
  assert.equal(q.get("porPagina"), "1");
  assert.equal(q.get("mapa"), null, "o mapa vem junto");
});

test("mapa e pontos do Lente: '2 quartos' na busca não vira filtro da Luneta (o plano vai junto)", () => {
  // sem filtro que dependa do plano, Lente e Luneta pedem a mesma coisa (a CDN guarda uma só)
  assert.equal(consultaPontos("previa", { q: "casa", uf: ["MG"] }, "lente"), consultaPontos("previa", { q: "casa", uf: ["MG"] }, "luneta"));
  // "N quartos" no texto é o filtro de quartos da Luneta: no Lente o servidor precisa saber o plano para ignorá-lo
  const lente = new URLSearchParams(consultaPontos("previa", { q: "casa 2 quartos" }, "lente"));
  assert.equal(lente.get("plano"), "lente");
  assert.equal(lerBusca(lente).plano, "lente", "o servidor lê o Lente");
  assert.equal(new URLSearchParams(consultaPontos("previa", { q: "casa 2 quartos" }, "luneta")).get("plano"), null);
  assert.notEqual(chaveMapa("previa", { q: "casa 2 quartos" }, "lente", true), chaveMapa("previa", { q: "casa 2 quartos" }, "luneta", true));
  // a área do mapa nunca vai nos pontos (o mapa mostra tudo; a lista segue a área)
  assert.equal(new URLSearchParams(consultaPontos("previa", { bbox: [-47, -24, -46, -23] }, "luneta")).get("bbox"), null);
  // filtro da Luneta no Lente sai dos pontos (o servidor também o ignora)
  assert.equal(new URLSearchParams(consultaPontos("previa", { comTags: ["ocupado"] }, "lente")).get("comTags"), null);
});

test("contagem: uma página de 1, sem mapa", () => {
  const q = new URLSearchParams(consultaContagem("previa", { cidade: ["MG|Uberlândia"] }, "luneta"));
  assert.equal(q.get("porPagina"), "1");
  assert.equal(q.get("mapa"), "0");
  assert.deepEqual(q.getAll("cidade"), ["MG|Uberlândia"]);
});

test("endereço da página: vista e mapa só quando escolhidos; sem nada, o caminho puro", () => {
  const base = { filtros: {}, ordem: "desagio" as const, pagina: 1, plano: "luneta" as const, vista: null, mapa: null };
  assert.equal(enderecoPagina("/previa", base), "/previa");
  const url = enderecoPagina("/previa", { ...base, filtros: { uf: ["MG"] }, pagina: 3, vista: "cards", mapa: false, plano: "lente" });
  const p = new URLSearchParams(url.split("?")[1]);
  assert.equal(url.startsWith("/previa?"), true);
  assert.deepEqual([p.get("uf"), p.get("pagina"), p.get("vista"), p.get("mapa"), p.get("plano")], ["MG", "3", "cards", "0", "lente"]);
  // e a página lê de volta o mesmo estado
  const e = lerBusca(p);
  assert.deepEqual([e.pagina, e.vista, e.mapa, e.plano], [3, "cards", false, "lente"]);
});

test("área do mapa: a forma canônica não reordena o retângulo (nem o vira texto)", () => {
  const bbox: [number, number, number, number] = [-46.8, -23.7, -46.4, -23.4];
  assert.deepEqual(canonico({ bbox, uf: ["SP", "MG"] }), { bbox, uf: ["MG", "SP"] });
  assert.match(consultaLista("previa", { filtros: { bbox }, ordem: "desagio", pagina: 1, plano: "luneta" }), /bbox=-46\.8%2C-23\.7%2C-46\.4%2C-23\.4/);
  assert.ok(filtrosIguais({ bbox }, { bbox: [...bbox] }));
  assert.ok(!filtrosIguais({ bbox }, { bbox: [-46.8, -23.7, -46.5, -23.4] }));
  // a câmera da vista de mapa entra no endereço da página
  assert.match(enderecoPagina("/previa", { filtros: {}, ordem: "desagio", pagina: 1, plano: "luneta", vista: "mapa", mapa: null, camera: { lat: -23.5, lon: -46.6, zoom: 12 } }), /vista=mapa&centro=-23\.5%2C-46\.6&zoom=12$/);
});
