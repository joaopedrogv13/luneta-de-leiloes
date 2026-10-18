/**
 * Textos da nota de localização: a frase do percentil (nunca 0% nem 100%), a faixa da aproximada, o selo curto da
 * lista, a precisão, os terços da cidade pequena e a área de risco (nunca "sem risco" nem "risco zero").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cidadePequena,
  daCidade,
  desvioTexto,
  fraseFaixa,
  frasePartePercentil,
  frasePercentil,
  idDeImovelValido,
  linhaResumoNota,
  motivoCurto,
  NOTA_NAO_GARANTIA,
  notaCurta,
  notaGrande,
  ondeRisco,
  resumoTercos,
  tercosEmFrase,
  rotaMetodoLocal,
  SEM_DADO_COMPONENTE,
  seloPrecisao,
  SOBRE_COMPONENTE,
  textoIndicador,
  textoRiscoSemAlerta,
  valorComponente,
} from "./nota-texto";
import type { LocalizacaoImovel } from "./tipos";

const proibidos = /sem risco|risco zero|100%|\b0%/i;

test("frase do percentil: entre 1 e 99, nunca 0% nem 100%", () => {
  assert.equal(frasePercentil(78, "São Gonçalo/RJ"), "Melhor localizado que 78% dos moradores de São Gonçalo/RJ");
  assert.equal(frasePercentil(22.4, "São Gonçalo/RJ"), "Melhor localizado que 22% dos moradores de São Gonçalo/RJ");
  assert.equal(frasePercentil(99, "São Paulo/SP"), "Entre os 1% mais bem localizados de São Paulo/SP");
  assert.equal(frasePercentil(100, "São Paulo/SP"), "Entre os 1% mais bem localizados de São Paulo/SP");
  assert.equal(frasePercentil(98.6, "São Paulo/SP"), "Entre os 1% mais bem localizados de São Paulo/SP");
  assert.equal(frasePercentil(0, "Patos/PB"), "Melhor localizado que menos de 1% dos moradores de Patos/PB");
  assert.equal(frasePercentil(1, "Patos/PB"), "Melhor localizado que 1% dos moradores de Patos/PB");
  // fora da escala não estoura
  assert.equal(frasePercentil(140, "Patos/PB"), "Entre os 1% mais bem localizados de Patos/PB");
  assert.equal(frasePercentil(-3, "Patos/PB"), "Melhor localizado que menos de 1% dos moradores de Patos/PB");
  for (let n = 0; n <= 100; n++) assert.doesNotMatch(frasePercentil(n, "Patos/PB"), proibidos, `nota ${n}`);
});

test("cidade com artigo na frase", () => {
  assert.equal(daCidade("Rio de Janeiro/RJ"), "do Rio de Janeiro/RJ");
  assert.equal(daCidade("Recife/PE"), "do Recife/PE");
  assert.equal(daCidade("Porto Alegre/RS"), "de Porto Alegre/RS");
  // o uso comum (M18)
  assert.equal(daCidade("Serra/ES"), "da Serra/ES");
  assert.equal(daCidade("Praia Grande/SP"), "da Praia Grande/SP");
  assert.equal(daCidade("Guarujá/SP"), "do Guarujá/SP");
  assert.equal(frasePercentil(55, "Rio de Janeiro/RJ"), "Melhor localizado que 55% dos moradores do Rio de Janeiro/RJ");
});

test("faixa da nota aproximada: a faixa do meio, nunca o intervalo inteiro (M4)", () => {
  assert.equal(fraseFaixa([41, 76], "Santos/SP"), "Nota provável entre 41 e 76 (faixa do meio), comparada com os moradores de Santos/SP");
  assert.equal(fraseFaixa([76, 41], "Santos/SP"), "Nota provável entre 41 e 76 (faixa do meio), comparada com os moradores de Santos/SP");
  assert.equal(fraseFaixa([0, 100], "Santos/SP"), "Nota provável entre 1 e 99 (faixa do meio), comparada com os moradores de Santos/SP");
  assert.equal(fraseFaixa([50, 50], "Santos/SP"), "Melhor localizado que 50% dos moradores de Santos/SP");
  assert.doesNotMatch(fraseFaixa([0, 100], "Santos/SP"), proibidos);
});

test("nota grande e selo curto da lista", () => {
  assert.equal(notaGrande({ situacao: "calculada", nota: 78 }), "78");
  assert.equal(notaGrande({ situacao: "aproximada", nota: 59 }), "~59");
  assert.equal(notaGrande({ situacao: "sem_nota", nota: null }), null);
  assert.deepEqual(notaCurta({ notaLocal: 78, precisaoGeo: "exata" }), { texto: "78", aproximada: false, sr: "Nota de localização: 78 de 100" });
  assert.deepEqual(notaCurta({ notaLocal: 45, precisaoGeo: "bairro" }), {
    texto: "~45",
    aproximada: true,
    sr: "Nota de localização aproximada: cerca de 45 de 100",
  });
  assert.equal(notaCurta({ notaLocal: null, precisaoGeo: "exata" }), null);
});

test("selo da precisão", () => {
  assert.equal(desvioTexto(10), "±10\u00a0m");
  assert.equal(desvioTexto(870), "±870\u00a0m");
  assert.equal(desvioTexto(1240), "±1,2\u00a0km");
  const numero = seloPrecisao({ precisao: "numero", desvioM: 10, situacao: "calculada", faixa: null })!;
  assert.equal(numero.rotulo, "Endereço localizado no número (±10\u00a0m)");
  assert.equal(numero.nivel, "boa");
  assert.match(numero.explicacao, /CNEFE 2022/);
  assert.equal(seloPrecisao({ precisao: "rua", desvioM: 120, situacao: "calculada", faixa: null })!.rotulo, "Endereço localizado na rua (±120\u00a0m)");
  const bairro = seloPrecisao({ precisao: "bairro", desvioM: 870, situacao: "aproximada", faixa: [41, 76] })!;
  assert.equal(bairro.rotulo, "Só no bairro: nota aproximada");
  assert.match(bairro.explicacao, /entre 41 e 76/);
  assert.match(bairro.explicacao, /faixa do meio/);
  assert.doesNotMatch(bairro.explicacao, /menos bem localizadas às mais bem/, "a faixa não é o intervalo inteiro (M4)");
  // a rua achada, mas espalhada: o meio da rua, nunca "centro do bairro" (M3)
  const espalhada = seloPrecisao({ precisao: "bairro", desvioM: 1545, situacao: "aproximada", faixa: [41, 76], pontoRuaEspalhada: true })!;
  assert.equal(espalhada.rotulo, "Rua espalhada: nota aproximada");
  assert.match(espalhada.explicacao, /se espalham por cerca de 1,5\u00a0km/);
  assert.doesNotMatch(espalhada.explicacao, /centro do bairro/);
  assert.equal(seloPrecisao({ precisao: "cidade", desvioM: null, situacao: "sem_nota", faixa: null })!.nivel, "sem");
  assert.equal(seloPrecisao({ precisao: "numero", desvioM: null, situacao: "calculada", faixa: null }, true)!.rotulo, "Exemplo fictício");
});

test("cidade pequena: terços, sem número de 0 a 100", () => {
  const c = (terco: "baixo" | "medio" | "alto" | null) => ({ terco });
  assert.equal(cidadePequena({ componentes: [{ ...c("alto"), chave: "servicos", rotulo: "", nota: null, peso: 25, indicadores: [] }] }), true);
  assert.equal(cidadePequena({ componentes: [{ chave: "servicos", rotulo: "", nota: 40, peso: 25, indicadores: [] }] }), false);
  // as três contagens, sempre (M5): nada de escolher um lado no empate
  assert.equal(
    resumoTercos([c("alto"), c("medio"), c("alto"), c("alto"), c("alto"), c("alto")], "Cocal do Sul/SC"),
    "Comparado com o resto de Cocal do Sul/SC, das 6 partes: 5 partes acima da maioria e 1 no meio.",
  );
  assert.equal(resumoTercos([c("alto"), c("alto")], "Cocal do Sul/SC"), "Comparado com o resto de Cocal do Sul/SC, das 2 partes: 2 partes acima da maioria.");
  assert.equal(resumoTercos([c("baixo"), c("baixo"), c("medio")], "Patos/PB"), "Comparado com o resto de Patos/PB, das 3 partes: 1 parte no meio e 2 abaixo da maioria.");
  assert.equal(resumoTercos([c("medio"), c("medio")], "Patos/PB"), "Comparado com o resto de Patos/PB, das 2 partes: 2 partes no meio.");
  // Canitar: 1 acima, 3 no meio, 2 abaixo; Demerval Lobão: 3 e 3 (o empate não vira "acima")
  const canitar = [c("alto"), c("medio"), c("medio"), c("medio"), c("baixo"), c("baixo")];
  assert.equal(tercosEmFrase(canitar), "1 parte acima da maioria, 3 no meio e 2 abaixo");
  assert.equal(tercosEmFrase([c("alto"), c("alto"), c("alto"), c("baixo"), c("baixo"), c("baixo")]), "3 partes acima da maioria e 3 abaixo");
  assert.match(resumoTercos([c(null)], "Patos/PB"), /Não há dados/);
  assert.equal(valorComponente({ nota: null, terco: "alto" }), "acima da maioria da cidade");
  assert.equal(valorComponente({ nota: null, terco: "baixo" }), "abaixo da maioria da cidade");
  for (const t of ["baixo", "medio", "alto"] as const) assert.doesNotMatch(valorComponente({ nota: null, terco: t }), /\d/);
});

test("componente sem dado e indicadores com o comum na cidade", () => {
  assert.equal(valorComponente({ nota: null }), SEM_DADO_COMPONENTE);
  assert.equal(SEM_DADO_COMPONENTE, "sem dado nesta cidade, peso redistribuído");
  assert.equal(valorComponente({ nota: 26 }), "26 de 100");
  assert.equal(frasePartePercentil(26), "26 de 100: melhor que o entorno de 26% dos moradores");
  assert.equal(frasePartePercentil(100), "100 de 100: entre os 1% melhores da cidade nesta parte");
  assert.equal(frasePartePercentil(0), "0 de 100: melhor que o entorno de menos de 1% dos moradores");
  for (let n = 0; n <= 100; n++) assert.doesNotMatch(frasePartePercentil(n).split(":")[1]!, proibidos);
  assert.equal(textoIndicador({ rotulo: "Mercados a até 500 m", valor: "12", comum: "5" }), "Mercados a até 500 m: 12 · comum na cidade: 5");
  assert.equal(textoIndicador({ rotulo: "Mercados a até 500 m", valor: "12", comum: null }), "Mercados a até 500 m: 12");
  for (const s of Object.values(SOBRE_COMPONENTE)) {
    assert.ok(s.curto && s.oQueMede && s.raio && s.fontes);
    assert.doesNotMatch(`${s.curto} ${s.oQueMede}`, /\d+%/); // os pesos vêm do dado, nunca do texto
  }
  assert.match(SOBRE_COMPONENTE.renda.oQueMede, /renda típica/);
  assert.match(SOBRE_COMPONENTE.renda.fontes, /valores de 2022/);
});

test("área de risco: sem alerta nunca vira 'sem risco'", () => {
  // a rua: "do ponto da rua do endereço", nunca "do imóvel" (M2)
  const rua = textoRiscoSemAlerta({ coberturaRisco: true, riscoRaioM: 230, precisao: "rua" });
  assert.equal(rua.titulo, "Nenhuma área de risco mapeada a menos de 230 m do ponto da rua do endereço");
  const espalhada = textoRiscoSemAlerta({ coberturaRisco: true, riscoRaioM: 500, precisao: "bairro", pontoRuaEspalhada: true });
  assert.equal(espalhada.titulo, "Nenhuma área de risco mapeada a menos de 500 m do meio da rua do endereço");
  // cidade fora da base e imóvel rural: "não conferida", não "sem mapeamento" (M16)
  const fora = textoRiscoSemAlerta({ coberturaRisco: false, riscoRaioM: null, precisao: "cidade", referencia: null, situacao: "sem_nota", motivo: "A cidade deste imóvel não foi encontrada" });
  assert.match(fora.texto, /a cidade deste imóvel não foi encontrada nas bases/);
  assert.doesNotMatch(fora.texto, /não tem mapeamento/);
  const rural = textoRiscoSemAlerta({ coberturaRisco: true, riscoRaioM: null, precisao: "cidade", referencia: { nome: "Atibaia/SP", moradores: 1, celulas: 1 }, situacao: "sem_nota", motivo: "Imóvel rural: a nota mede..." });
  assert.match(rural.texto, /^Imóvel rural: não conferimos a área de risco/);
  const sem = textoRiscoSemAlerta({ coberturaRisco: false, riscoRaioM: null, precisao: "numero" });
  assert.match(sem.texto, /Esta cidade não tem mapeamento de risco nessa base/);
  assert.match(sem.texto, /isso não quer dizer que não haja risco/);
  const perto = textoRiscoSemAlerta({ coberturaRisco: true, riscoRaioM: 100, precisao: "numero" });
  assert.equal(perto.titulo, "Nenhuma área de risco mapeada a menos de 100 m do imóvel");
  assert.match(perto.texto, /base de 2010/);
  const bairro = textoRiscoSemAlerta({ coberturaRisco: true, riscoRaioM: 500, precisao: "bairro" });
  assert.equal(bairro.titulo, "Nenhuma área de risco mapeada a menos de 500 m do centro do bairro");
  const naoConferido = textoRiscoSemAlerta({ coberturaRisco: true, riscoRaioM: null, precisao: "cidade" });
  assert.match(naoConferido.titulo, /não deu para conferir/);
  for (const t of [sem, perto, bairro, naoConferido]) assert.doesNotMatch(`${t.titulo} ${t.texto}`, /sem risco|risco zero/i);
  assert.equal(ondeRisco(0, { precisao: "numero" }), "dentro de área de risco mapeada");
  assert.equal(ondeRisco(260, { precisao: "bairro" }), "área de risco mapeada a cerca de 260 m do centro do bairro");
  assert.equal(ondeRisco(0, { precisao: "rua" }), "ponto da rua do endereço dentro de área de risco mapeada");
  assert.equal(ondeRisco(120, { precisao: "rua" }), "área de risco mapeada a cerca de 120 m do ponto da rua do endereço");
});

test("linha do resumo lateral e motivo curto", () => {
  const base: Pick<LocalizacaoImovel, "motivo" | "componentes" | "faixa"> = { motivo: null, componentes: [], faixa: null };
  assert.equal(linhaResumoNota({ ...base, situacao: "calculada", precisao: "numero", nota: 78 }), "Melhor localizado que 78% dos moradores");
  assert.equal(linhaResumoNota({ ...base, situacao: "calculada", precisao: "numero", nota: 100 }), "Entre os 1% mais bem localizados da cidade");
  assert.equal(linhaResumoNota({ ...base, situacao: "calculada", precisao: "numero", nota: 0 }), "Melhor localizado que menos de 1% dos moradores");
  assert.equal(linhaResumoNota({ ...base, situacao: "aproximada", precisao: "bairro", nota: 59, faixa: [76, 41] }), "Aproximada, entre 41 e 76 (só o bairro)");
  assert.equal(linhaResumoNota({ ...base, situacao: "sem_nota", precisao: "cidade", nota: null }), "Sem nota: endereço só na cidade");
  assert.equal(linhaResumoNota({ ...base, situacao: "sem_nota", precisao: "cidade", nota: null, motivo: "Imóvel rural: a nota mede..." }), "Sem nota: imóvel rural");
  assert.equal(linhaResumoNota({ ...base, situacao: "pendente", precisao: null, nota: null }), "Ainda não calculada");
  const pequena = [
    { chave: "servicos" as const, rotulo: "", nota: null, peso: 25, indicadores: [], terco: "alto" as const },
    { chave: "infra" as const, rotulo: "", nota: null, peso: 25, indicadores: [], terco: "medio" as const },
  ];
  assert.equal(linhaResumoNota({ ...base, situacao: "sem_nota", precisao: "rua", nota: null, componentes: pequena }), "Cidade pequena: 1 parte acima da maioria e 1 no meio");
  assert.equal(motivoCurto({ situacao: "sem_nota", precisao: "rua", motivo: "x", componentes: pequena }), "cidade pequena");
  for (let n = 0; n <= 100; n++) assert.doesNotMatch(linhaResumoNota({ ...base, situacao: "calculada", precisao: "numero", nota: n }), proibidos);
});

test("nota não é garantia e rota do método", () => {
  assert.match(NOTA_NAO_GARANTIA, /não é garantia/);
  assert.equal(rotaMetodoLocal(), "/metodologia/localizacao");
  assert.equal(rotaMetodoLocal("caixa-1444419640129"), "/metodologia/localizacao?de=caixa-1444419640129");
  assert.equal(rotaMetodoLocal("a b"), "/metodologia/localizacao?de=a%20b");
  assert.equal(rotaMetodoLocal("ex-alvo-sp", "lente"), "/metodologia/localizacao?de=ex-alvo-sp&plano=lente");
  assert.equal(idDeImovelValido("caixa-1444419640129"), true);
  assert.equal(idDeImovelValido("ex-alvo-sp"), true);
  assert.equal(idDeImovelValido("lj-222141"), true);
  assert.equal(idDeImovelValido("javascript:alert(1)"), false);
  assert.equal(idDeImovelValido("caixa-1/../../x"), false);
  assert.equal(idDeImovelValido(null), false);
});
