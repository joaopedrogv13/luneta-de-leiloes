/**
 * Testes das regras que decidem por campo estruturado (preço, fotos, financiamento, praça,
 * modalidade) e do registro. Os textos reais estão em corpus.ts / corpus.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { garantirFonte, gravarImoveis } from "../../gravar.ts";
import { montarExportacao } from "../../exportar.ts";
import { bancoEmMemoria, conectorFalso, imovelExemplo } from "../../testes/apoio.ts";
import type { CapacidadesFonte, ImovelNormalizado, RiscoDetectado } from "../../tipos.ts";
import { avaliarImovel, entradaPara, imovelDeTeste, rodarRiscos, type RegraRisco } from "../motor.ts";
import { TAGS, type SlugTag } from "../tags.ts";
import { CONFIG_RISCOS } from "./config.ts";
import { REGRAS } from "./index.ts";
import { criarRegraDesagio } from "./preco.ts";

const AGORA = new Date("2026-10-12T12:00:00Z");
const CAP: CapacidadesFonte = { fotos: true, documentos: true, ocupacao: false, listaCompleta: true };

function avaliar(sobrepor: Partial<ImovelNormalizado>, fonte: { id: string; capacidades: CapacidadesFonte } | null = { id: "teste", capacidades: CAP }, regras: readonly RegraRisco[] = REGRAS) {
  const imovel = imovelDeTeste(imovelExemplo({ descricao: null, ...sobrepor }), { fonteId: fonte?.id ?? "teste", agora: AGORA });
  const r = avaliarImovel(entradaPara(imovel, fonte, AGORA), regras);
  assert.deepEqual(r.erros, []);
  return new Map<SlugTag, RiscoDetectado>(r.riscos.map((x) => [x.tag, x]));
}

function valor(m: Map<SlugTag, RiscoDetectado>, tag: SlugTag): string | undefined {
  return m.get(tag)?.valor;
}

test("registro: cada uma das 26 tags é declarada por exatamente uma regra, ids únicos", () => {
  assert.equal(new Set(REGRAS.map((r) => r.id)).size, REGRAS.length);
  const declaradas = REGRAS.flatMap((r) => r.tags);
  assert.equal(declaradas.length, TAGS.length);
  assert.deepEqual(new Set(declaradas), new Set(TAGS.map((t) => t.slug)));
});

test("deságio: limiares da configuração, preço acima da avaliação e avaliação ausente", () => {
  const caixa = { id: "caixa_csv", capacidades: CAP };
  let m = avaliar({ preco: 240000, valor_avaliacao: 400000, praca_atual: 2 }, caixa); // 40%
  assert.equal(valor(m, "desagio-alto"), "sim");
  assert.equal(m.get("desagio-alto")?.confianca, "alta");
  assert.equal(valor(m, "desagio-baixo"), "nao");
  m = avaliar({ preco: 360000, valor_avaliacao: 400000, praca_atual: 1 }); // 10%
  assert.equal(valor(m, "desagio-baixo"), "sim");
  assert.equal(m.get("desagio-baixo")?.confianca, "media", "fonte fora da tabela: média");
  m = avaliar({ preco: 500000, valor_avaliacao: 400000, praca_atual: 1 });
  assert.equal(valor(m, "desagio-baixo"), "sim");
  assert.match(m.get("desagio-baixo")?.trecho ?? "", /acima da avaliação/);
  m = avaliar({ preco: 300000, valor_avaliacao: null, praca_atual: 1 });
  assert.equal(valor(m, "desagio-alto"), "desconhecido");
  assert.equal(valor(m, "desagio-baixo"), "desconhecido");
  // Limiar parametrizável.
  const regra = criarRegraDesagio({ ...CONFIG_RISCOS, desagioAltoMinPct: 55 });
  m = avaliar({ preco: 200000, valor_avaliacao: 400000, praca_atual: 2 }, undefined, [regra]);
  assert.equal(valor(m, "desagio-alto"), "nao");
  // Avaliação que a própria fonte contradiz: confiança baixa e revisão.
  m = avaliar({ preco: 100000, valor_avaliacao: 400000, praca_atual: 2, extras: { avaliacao_confere: false } });
  assert.equal(m.get("desagio-alto")?.confianca, "baixa");
  assert.equal(m.get("desagio-alto")?.precisa_revisao, true);
});

test("preço acima do mercado: só 'acima da avaliação', sempre com revisão; nunca 'não'", () => {
  let m = avaliar({ preco: 460000, valor_avaliacao: 400000, praca_atual: 1 });
  const r = m.get("preco-acima-mercado");
  assert.equal(r?.valor, "sim");
  assert.equal(r?.precisa_revisao, true);
  assert.equal(r?.confianca, "media");
  assert.match(r?.trecho ?? "", /não é preço de mercado/);
  m = avaliar({ preco: 4000000, valor_avaliacao: 400000, praca_atual: 1 });
  assert.equal(m.get("preco-acima-mercado")?.confianca, "baixa", "10× a avaliação: provável erro de cadastro");
  m = avaliar({ preco: 200000, valor_avaliacao: 400000, praca_atual: 2 });
  assert.equal(valor(m, "preco-acima-mercado"), "desconhecido");
});

test("sem fotos: só em fonte que publica fotos; capa por padrão de URL não verificada não decide", () => {
  const semCapacidade = { id: "csv", capacidades: { ...CAP, fotos: false } };
  assert.equal(valor(avaliar({ fotos: [] }, semCapacidade), "sem-fotos"), "desconhecido");
  assert.equal(valor(avaliar({ fotos: [] }, null), "sem-fotos"), "desconhecido");
  assert.equal(valor(avaliar({ fotos: [] }), "sem-fotos"), "sim");
  const capa = { url: "https://exemplo.test/fotos/F000000100512021.jpg", origem: "padrao_url" };
  assert.equal(valor(avaliar({ fotos: [capa] }), "sem-fotos"), "desconhecido");
  assert.equal(valor(avaliar({ fotos: [{ ...capa, ok: false, verificada_em: "2026-10-10" }] }), "sem-fotos"), "sim");
  assert.equal(valor(avaliar({ fotos: [{ ...capa, ok: true, verificada_em: "2026-10-10" }] }), "sem-fotos"), "nao");
  assert.equal(valor(avaliar({ fotos: [{ url: "https://s3.test/a.webp", origem: "api" }] }), "sem-fotos"), "nao");
});

test("financiamento: campo da fonte vale mais; parcelamento judicial não é financiamento", () => {
  let m = avaliar({ aceita_financiamento: true, descricao: "Exclusivamente à vista." });
  assert.equal(valor(m, "aceita-financiamento"), "sim");
  assert.equal(m.get("aceita-financiamento")?.confianca, "alta");
  m = avaliar({ aceita_financiamento: false });
  assert.equal(valor(m, "aceita-financiamento"), "nao");
  m = avaliar({ aceita_financiamento: null, aceita_parcelamento: true, descricao: "O IMÓVEL PODE SER PARCELADO COM 25% DE ENTRADA E O RESTANTE EM ATÉ 30 MESES." });
  assert.equal(valor(m, "aceita-financiamento"), "desconhecido");
});

test("vistoria: laudo de vistoria entre os documentos é contrassinal", () => {
  const m = avaliar({ documentos: [{ tipo: "laudo", titulo: "Laudo de vistoria", url: "https://exemplo.test/vistoria.pdf" }] });
  assert.equal(valor(m, "sem-vistoria"), "nao");
  assert.equal(valor(avaliar({ documentos: [{ tipo: "avaliacao", titulo: "AVALIAÇÃO", url: "https://exemplo.test/a.pdf" }] }), "sem-vistoria"), "desconhecido");
});

test("praça: oferta única pela modalidade, praça em vigor, regra 'seg_nulo' e leilão sem praças", () => {
  let m = avaliar({ modalidade: "venda_direta", modalidade_fonte: "Venda Direta Online", pracas: [{ numero: 0, valor_minimo: 100000 }], praca_atual: 0 });
  assert.deepEqual([valor(m, "primeira-praca"), valor(m, "segunda-praca"), valor(m, "praca-unica")], ["nao", "nao", "sim"]);
  // Praças com data: o núcleo deduz a 1ª (data futura) e a regra lê.
  m = avaliar({});
  assert.deepEqual([valor(m, "primeira-praca"), valor(m, "segunda-praca"), valor(m, "praca-unica")], ["sim", "nao", "nao"]);
  assert.match(m.get("primeira-praca")?.trecho ?? "", /1ª praça em vigor \(data 10\/11\/2026, lance mínimo R\$ 400\.000,00\)/);
  m = avaliar({ praca_atual: 2 });
  assert.equal(valor(m, "segunda-praca"), "sim");
  m = avaliar({ pracas: [{ numero: 0, valor_minimo: 300000 }], praca_atual: 0, extras: { regra_praca: "seg_nulo" } });
  assert.equal(valor(m, "praca-unica"), "sim");
  assert.equal(m.get("praca-unica")?.confianca, "baixa");
  assert.equal(m.get("praca-unica")?.precisa_revisao, true);
  m = avaliar({ modalidade: "leilao", modalidade_fonte: "Leilão SFI - Edital Único", pracas: [], praca_atual: null });
  assert.deepEqual([valor(m, "primeira-praca"), valor(m, "segunda-praca"), valor(m, "praca-unica")], ["desconhecido", "desconhecido", "desconhecido"]);
  m = avaliar({ pracas: [], praca_atual: null, textos: [{ origem: "titulo_leilao", texto: "2º Leilão Judicial - Vara Cível" }] });
  assert.equal(valor(m, "segunda-praca"), "sim");
  assert.equal(m.get("segunda-praca")?.confianca, "baixa");
  // Ordinal feminino (ª), a forma mais comum em "Praça".
  m = avaliar({ pracas: [], praca_atual: null, textos: [{ origem: "titulo_leilao", texto: "1ª Praça - Leilão Judicial - Vara Cível de Santos" }] });
  assert.deepEqual([valor(m, "primeira-praca"), valor(m, "segunda-praca"), valor(m, "praca-unica")], ["sim", "desconhecido", "desconhecido"]);
  m = avaliar({ pracas: [], praca_atual: null, textos: [{ origem: "titulo_leilao", texto: "2ª Praça - Leilão Judicial" }] });
  assert.deepEqual([valor(m, "primeira-praca"), valor(m, "segunda-praca"), valor(m, "praca-unica")], ["desconhecido", "sim", "desconhecido"]);
  assert.equal(m.get("segunda-praca")?.precisa_revisao, true);
  // "1ª Vara" não é praça; "711ª Leilão" não é 1º leilão.
  m = avaliar({ pracas: [], praca_atual: null, textos: [{ origem: "titulo_leilao", texto: "711ª LEILÃO JUDICIAL UNIFICADO DO TRT DA 2ª REGIÃO - 1ª Vara" }] });
  assert.equal(valor(m, "primeira-praca"), "desconhecido");
});

test("preferência: Leilão SFI (alta), venda direta da Caixa (não), alienação fiduciária só no extrajudicial", () => {
  const caixa = { id: "caixa_csv", capacidades: CAP };
  let m = avaliar({ modalidade: "leilao", modalidade_fonte: "Leilão SFI - Edital Único", judicial: false, pracas: [], praca_atual: null }, caixa);
  assert.equal(valor(m, "direito-preferencia"), "sim");
  assert.equal(m.get("direito-preferencia")?.confianca, "alta");
  assert.equal(m.get("direito-preferencia")?.origem, "campo:modalidade_fonte");
  m = avaliar({ modalidade: "venda_direta", modalidade_fonte: "Venda Direta Online", judicial: false, praca_atual: 0, pracas: [{ numero: 0 }] }, caixa);
  assert.equal(valor(m, "direito-preferencia"), "nao");
  m = avaliar({ judicial: false, comitente: "Banco Exemplo S.A.", descricao: "Leilão extrajudicial nos termos da Lei nº 9.514/97, após a consolidação da propriedade." });
  assert.equal(valor(m, "direito-preferencia"), "sim");
  assert.equal(m.get("direito-preferencia")?.confianca, "media");
  m = avaliar({ judicial: true, descricao: "Consta na Av. 3 Alienação Fiduciária, Não Baixada." });
  assert.equal(valor(m, "direito-preferencia"), "desconhecido");
});

test("posse: campo estruturado vence o texto, mas texto contrário vai para revisão", () => {
  let m = avaliar({ ocupacao: "ocupado", descricao: null });
  assert.equal(valor(m, "ocupado"), "sim");
  assert.equal(m.get("ocupado")?.confianca, "alta");
  assert.equal(m.get("ocupado")?.precisa_revisao, false);
  assert.equal(valor(m, "desocupado"), "nao");
  assert.equal(valor(m, "ocupacao-nao-informada"), "nao");
  m = avaliar({ ocupacao: "ocupado", descricao: "Imóvel desocupado." });
  assert.equal(m.get("ocupado")?.precisa_revisao, true);
  assert.equal(valor(m, "desocupado"), "sim");
});

test("imóvel inteiro: venda de banco (média); judicial sem texto suficiente fica desconhecido", () => {
  let m = avaliar({ judicial: false, descricao: "Apartamento, 50 m²." });
  assert.equal(valor(m, "imovel-inteiro"), "sim");
  assert.equal(m.get("imovel-inteiro")?.confianca, "media");
  assert.equal(valor(m, "cota-parte"), "nao");
  m = avaliar({ judicial: true, descricao: "Apartamento." });
  assert.equal(valor(m, "imovel-inteiro"), "desconhecido");
});

test("área: título com área que não bate com nenhum campo vai para revisão", () => {
  let m = avaliar({ titulo: "Apartamento c/ 165,555m² - São Paulo/SP", area_privativa: 165.555, area_total: 435.416 });
  assert.equal(valor(m, "area-divergente"), "desconhecido");
  m = avaliar({ titulo: "Apartamento c/ 90m²", area_privativa: 60, area_total: null });
  assert.equal(valor(m, "area-divergente"), "sim");
  assert.equal(m.get("area-divergente")?.precisa_revisao, true);
});

test("rodarRiscos com as regras reais: 26 tags por imóvel, exportação só com 'sim'", () => {
  const db = bancoEmMemoria();
  garantirFonte(db, conectorFalso({ registros: () => [] }), AGORA);
  gravarImoveis(db, "falso", [
    imovelExemplo({ descricao: "Imóvel ocupado pelo executado. Há outras penhoras." }),
    imovelExemplo({ id_na_fonte: "1002", url: "https://exemplo.test/imovel/1002", endereco: "Rua Exemplo, 2", descricao: null }),
  ], { agora: AGORA });
  const r = rodarRiscos(db, { agora: AGORA });
  assert.equal(r.totalErros, 0);
  assert.equal(r.riscos, 2 * TAGS.length);
  const exp = montarExportacao(db, { agora: AGORA });
  const primeiro = exp.imoveis.find((i) => i.id_na_fonte === "1001");
  assert.ok(primeiro);
  const slugs = primeiro.tags.map((t) => t.slug);
  assert.ok(slugs.includes("ocupado") && slugs.includes("penhora-outros-credores"));
  assert.ok(!slugs.includes("ocupacao-nao-informada"));
  const segundo = exp.imoveis.find((i) => i.id_na_fonte === "1002");
  assert.ok(segundo?.tags.some((t) => t.slug === "ocupacao-nao-informada"));
});
