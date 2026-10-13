import { test } from "node:test";
import assert from "node:assert/strict";
import type { ImovelNormalizado } from "../../tipos.ts";
import { temDocumentoPessoal } from "../../util/lgpd.ts";
import { avaliarImovel, entradaPara, imovelDeTeste } from "../motor.ts";
import { TAGS, type SlugTag } from "../tags.ts";
import { CORPUS, SO_POSITIVO_CONSTRUIDO, type CasoCorpus } from "./corpus.ts";
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

test("corpus: ids únicos e textos já mascarados (sem CPF, CNPJ, e-mail ou IP; nomes só inventados, nos casos lgpd-*)", () => {
  assert.equal(new Set(CORPUS.map((c) => c.id)).size, CORPUS.length);
  for (const caso of CORPUS) {
    if (caso.semNomes) assert.equal(caso.real, false, `${caso.id}: caso com nome sem máscara precisa ser construído`);
    for (const texto of [caso.titulo, caso.descricao, ...(caso.textos ?? []).map((t) => t.texto)]) {
      if (texto) assert.ok(!temDocumentoPessoal(texto), `${caso.id}: texto com documento pessoal`);
    }
  }
});

/**
 * Tags com evidência textual e caminho de contrassinal ("não") na regra. "Ocupação não
 * informada" fica de fora: é sempre "sim" ou "não" (nunca "desconhecido").
 */
const COM_CONTRASSINAL = [
  "ocupado", "desocupado", "condominio-em-atraso", "iptu-em-atraso", "divida-passa-arrematante",
  "acao-judicial", "penhora-outros-credores", "leilao-com-recurso", "direito-preferencia", "matricula-pendencia",
  "cota-parte", "so-direitos", "sem-vistoria", "aceita-financiamento",
] as const satisfies readonly SlugTag[];
/** Tags com evidência textual SEM caminho de "não" na regra (o dicionário não dá contrassinal). */
const SEM_CONTRASSINAL = ["custos-extras-altos", "construcao-irregular", "area-divergente"] as const satisfies readonly SlugTag[];

test("corpus: cada tag de texto tem positivo, caso sem sinal (desconhecido) e, se a regra tem, contrassinal (não)", () => {
  for (const tag of [...COM_CONTRASSINAL, ...SEM_CONTRASSINAL]) {
    const valores = new Set(CORPUS.map((c) => c.esperado[tag]).filter(Boolean));
    assert.ok(valores.has("sim"), `${tag}: falta caso positivo`);
    assert.ok(valores.has("desconhecido"), `${tag}: falta caso sem sinal (desconhecido)`);
  }
  for (const tag of COM_CONTRASSINAL) {
    assert.ok(CORPUS.some((c) => c.esperado[tag] === "nao"), `${tag}: falta caso de contrassinal (não)`);
  }
});

test("corpus: tags só com positivo construído batem com SO_POSITIVO_CONSTRUIDO (e com o README)", () => {
  const soConstruido = [...COM_CONTRASSINAL, ...SEM_CONTRASSINAL].filter(
    (tag) => !CORPUS.some((c) => c.real && c.esperado[tag] === "sim"),
  );
  assert.deepEqual(new Set(soConstruido), new Set(SO_POSITIVO_CONSTRUIDO));
  const reais = CORPUS.filter((c) => c.real).length;
  assert.ok(reais >= 30, `poucos casos reais (${reais})`);
});

/** Compara sem acento e sem caixa, palavra inteira. */
function contemNome(texto: string, nome: string): boolean {
  const dobrar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return new RegExp(`(?<![\\p{L}])${dobrar(nome)}(?![\\p{L}])`, "u").test(dobrar(texto));
}

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
      // Evidência mascarada (documentos e nomes), com regra, e "sim" sempre com trecho.
      if (r.trecho) assert.ok(!temDocumentoPessoal(r.trecho), `${r.tag}: trecho com documento pessoal`);
      for (const nome of caso.semNomes ?? []) {
        assert.ok(!contemNome(r.trecho ?? "", nome), `${r.tag}: trecho com o nome "${nome}": ${r.trecho}`);
      }
      assert.ok(r.regra.includes("/"), `${r.tag}: sem id de regra`);
      if (r.valor === "sim") assert.ok(r.trecho && r.trecho.length > 0, `${r.tag}: "sim" sem trecho`);
    }
  });
}
