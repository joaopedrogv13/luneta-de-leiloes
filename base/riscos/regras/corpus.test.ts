import { test } from "node:test";
import assert from "node:assert/strict";
import type { ImovelNormalizado } from "../../tipos.ts";
import { temDocumentoPessoal } from "../../util/lgpd.ts";
import { avaliarImovel, entradaPara, imovelDeTeste } from "../motor.ts";
import { TAGS } from "../tags.ts";
import { CORPUS, type CasoCorpus } from "./corpus.ts";
import { REGRAS } from "./index.ts";

const AGORA = new Date("2026-10-12T12:00:00Z");

/** Imóvel neutro (judicial, sem preço, sem fotos) com o que o caso pedir por cima. */
export function imovelDoCaso(caso: CasoCorpus): ImovelNormalizado {
  return {
    registro: "imovel",
    id_na_fonte: caso.id,
    url: `https://exemplo.test/${caso.id}`,
    titulo: caso.titulo ?? "Imóvel em leilão",
    tipo: "apartamento",
    uf: "SP",
    cidade: "São Paulo",
    descricao: caso.descricao ?? null,
    textos: caso.textos ?? [],
    modalidade: "leilao",
    modalidade_fonte: null,
    judicial: true,
    valor_avaliacao: null,
    preco: null,
    pracas: [],
    fotos: [],
    documentos: [],
    ...caso.imovel,
  };
}

function avaliarCaso(caso: CasoCorpus) {
  const fonte = {
    id: caso.fonteId ?? "teste",
    capacidades: { fotos: true, documentos: true, ocupacao: false, listaCompleta: true, ...caso.capacidades },
  };
  const imovel = imovelDeTeste(imovelDoCaso(caso), { fonteId: fonte.id, agora: AGORA });
  return avaliarImovel(entradaPara(imovel, fonte, AGORA), REGRAS);
}

test("corpus: ids únicos e textos já mascarados (sem CPF, CNPJ, e-mail ou IP)", () => {
  assert.equal(new Set(CORPUS.map((c) => c.id)).size, CORPUS.length);
  for (const caso of CORPUS) {
    for (const texto of [caso.titulo, caso.descricao, ...(caso.textos ?? []).map((t) => t.texto)]) {
      if (texto) assert.ok(!temDocumentoPessoal(texto), `${caso.id}: texto com documento pessoal`);
    }
  }
});

test("corpus: cobre todas as tags com evidência textual, com caso positivo e negativo/contrassinal", () => {
  const textuais = [
    "ocupado", "desocupado", "custos-extras-altos", "condominio-em-atraso", "iptu-em-atraso", "divida-passa-arrematante",
    "acao-judicial", "penhora-outros-credores", "leilao-com-recurso", "direito-preferencia", "matricula-pendencia",
    "construcao-irregular", "area-divergente", "cota-parte", "so-direitos", "sem-vistoria", "aceita-financiamento",
  ] as const;
  for (const tag of textuais) {
    const valores = new Set(CORPUS.map((c) => c.esperado[tag]).filter(Boolean));
    assert.ok(valores.has("sim"), `${tag}: falta caso positivo`);
    assert.ok(valores.has("nao") || valores.has("desconhecido"), `${tag}: falta caso negativo`);
  }
  const reais = CORPUS.filter((c) => c.real).length;
  assert.ok(reais >= 20, `poucos casos reais (${reais})`);
});

for (const caso of CORPUS) {
  test(`corpus ${caso.id} [${caso.fonte}${caso.real ? "" : ", construído"}]`, () => {
    const { riscos, erros } = avaliarCaso(caso);
    assert.deepEqual(erros, []);
    // Toda regra responde: as 26 tags saem em todo imóvel, uma vez cada.
    assert.deepEqual(new Set(riscos.map((r) => r.tag)).size, TAGS.length);
    assert.equal(riscos.length, TAGS.length);
    const porTag = new Map(riscos.map((r) => [r.tag, r]));
    for (const [tag, esperado] of Object.entries(caso.esperado)) {
      const r = porTag.get(tag as (typeof TAGS)[number]["slug"]);
      assert.equal(r?.valor, esperado, `${tag}: esperado ${esperado}, veio ${r?.valor} (${r?.origem}: ${r?.trecho ?? ""})`);
    }
    for (const [tag, revisar] of Object.entries(caso.revisao ?? {})) {
      assert.equal(porTag.get(tag as (typeof TAGS)[number]["slug"])?.precisa_revisao, revisar, `${tag}: revisão`);
    }
    for (const r of riscos) {
      // Evidência mascarada, com regra, e "sim" sempre com trecho.
      if (r.trecho) assert.ok(!temDocumentoPessoal(r.trecho), `${r.tag}: trecho com documento pessoal`);
      assert.ok(r.regra.includes("/"), `${r.tag}: sem id de regra`);
      if (r.valor === "sim") assert.ok(r.trecho && r.trecho.length > 0, `${r.tag}: "sim" sem trecho`);
    }
  });
}
