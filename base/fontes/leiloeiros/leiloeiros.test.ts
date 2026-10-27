/**
 * Conector leiloeiros_arquivo: normalização, uma fonte por leiloeiro, remoção pela carga completa,
 * tags, deduplicação com a Caixa, exportação para o site e relatório da base. Fixture fictícia de 12
 * lotes de 3 leiloeiros (fixtures/tres-leiloeiros.jsonl): sem avaliação, praça única, judicial com
 * processo, endereço só em texto, vendido, suspenso, cancelado, carga incompleta.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { principal } from "../../cli.ts";
import { carregarImoveis } from "../../consultas.ts";
import { abrirBanco, lerTexto, type Banco } from "../../db.ts";
import { deColunas, parteDoId, type ListaCatalogo, type ParteCatalogo } from "../../exportar.ts";
import { garantirFonte, gravarImoveis } from "../../gravar.ts";
import { lerJsonl } from "../../leiloeiros/contrato.ts";
import { examinarImovel } from "../../leiloeiros/validar.ts";
import { conferirRelatorio, relatorioDaBase, principal as relatorioCli } from "../../leiloeiros/relatorio.ts";
import { rodarRiscos } from "../../riscos/motor.ts";
import { conectorFalso, httpProibido, imovelExemplo } from "../../testes/apoio.ts";
import type { ImovelGravado, ImovelNormalizado } from "../../tipos.ts";
import { validarImovel } from "../../validar.ts";
import { obterConector } from "../index.ts";
import { agruparPorLeiloeiro, conectorDoLeiloeiro, leiloeirosArquivo } from "./index.ts";
import { cidadeOficial, fraseDebito, normalizarLinha } from "./normalizar.ts";

const FIXTURE = new URL("./fixtures/tres-leiloeiros.jsonl", import.meta.url);
const TEXTO = readFileSync(FIXTURE, "utf8");
const AGORA = new Date("2026-10-27T12:00:00Z");

const linhas = (): Array<Record<string, unknown>> => lerJsonl(TEXTO).map((l) => structuredClone(l.valor) as Record<string, unknown>);
const jsonl = (objs: readonly unknown[]): string => objs.map((o) => JSON.stringify(o)).join("\n") + "\n";
function normalizado(id: string): ImovelNormalizado {
  const l = linhas().find((x) => x.id === id);
  assert.ok(l, id);
  return normalizarLinha(l);
}

// ---------------------------------------------------------------------------
// Normalização (pura)
// ---------------------------------------------------------------------------

test("os 12 lotes da fixture viram imóveis válidos para o núcleo", () => {
  const imoveis = linhas().filter((l) => l.registro === "imovel").map((l) => normalizarLinha(l));
  assert.equal(imoveis.length, 12);
  for (const i of imoveis) assert.deepEqual(validarImovel(i), [], i.id_na_fonte);
});

test("apartamento extrajudicial: endereço por campos, praças em UTC, praça pela situação, matrícula e extras do site", () => {
  const i = normalizado("alfa-leiloes:48211");
  assert.equal(i.id_na_fonte, "48211");
  assert.equal(i.url, "https://alfa-leiloes.example/lote/48211");
  assert.equal(i.endereco, "Rua Vergueiro, 1000, Apto 82");
  assert.equal(i.bairro, "Vila Mariana");
  assert.equal(i.cep, "04101000");
  assert.deepEqual(i.pracas, [
    { numero: 1, data: "2026-11-10T17:00:00.000Z", valor_minimo: 520000 },
    { numero: 2, data: "2026-11-24T17:00:00.000Z", valor_minimo: 312000 },
  ]);
  assert.equal(i.praca_atual, 1, "a primeira praça marcada como futura");
  assert.equal(i.preco, undefined, "o núcleo usa o mínimo da praça atual");
  assert.equal(i.judicial, false);
  assert.equal(i.aceita_financiamento, true);
  assert.equal(i.ocupacao, "desocupado", "campo estruturado da fonte");
  assert.equal(i.leiloeiro, "Alfa Leilões (fictício)");
  assert.equal(i.comitente, "Banco Fictício S.A.");
  assert.equal(i.matricula, "123.456");
  assert.equal(i.cartorio, "6º Oficial de Registro de Imóveis de São Paulo");
  assert.equal(i.extras?.site_leiloeiro, "https://alfa-leiloes.example");
  assert.equal(i.extras?.plataforma, "Plataforma Fictícia X");
  assert.equal(i.extras?.inscricao_imobiliaria, "039.123.0045-1");
  assert.equal(i.extras?.comissao_pct, 5);
  assert.equal(i.extras?.praca_1_situacao, "futura");
  assert.ok(!("versao_coletor" in (i.extras ?? {})) && !("coletado_em" in (i.extras ?? {})), "nada que muda a cada coleta nos extras");
  assert.deepEqual(i.textos, [{ origem: "campo:comissao_pct", texto: "Comissão do leiloeiro: 5% sobre o valor do lance." }]);
  assert.deepEqual(i.fotos.map((f) => [f.url, f.ordem, f.origem]), [
    ["https://alfa-leiloes.example/fotos/48211-1.jpg", 0, "ficha"],
    ["https://alfa-leiloes.example/fotos/48211-2.jpg", 1, "ficha"],
  ]);
});

test("judicial com processo: comitente, ocupação, dívida em frase para as regras, parcelamento e documento do processo", () => {
  const i = normalizado("alfa-leiloes:48212");
  assert.equal(i.judicial, true);
  assert.equal(i.numero_processo, "0012345-67.2024.8.26.0114");
  assert.equal(i.comitente, "TJSP – 2ª Vara Cível de Campinas");
  assert.equal(i.ocupacao, "ocupado");
  assert.equal(i.aceita_parcelamento, true);
  assert.equal(i.aceita_financiamento, false);
  assert.deepEqual([i.extras?.nu_parcelas, i.extras?.vl_percentualentrada, i.extras?.indice_correcao], [30, 25, "IPCA"]);
  assert.deepEqual([i.extras?.debito_iptu_valor, i.extras?.debito_iptu_responsavel], [8500, "pago_com_o_lance"]);
  const origens = Object.fromEntries((i.textos ?? []).map((t) => [t.origem, t.texto]));
  assert.equal(origens.titulo_leilao, "2ª Vara Cível de Campinas/SP – Leilão Judicial nº 12/2026");
  assert.match(origens.debitos ?? "", /sub-rogam-se no preço/);
  assert.equal(origens["campo:debitos"], "Débito de IPTU declarado pelo leiloeiro: R$ 8.500,00, pago com o valor do lance (sub-roga-se no preço).");
  assert.match(origens.pagamento ?? "", /art\. 895/);
  assert.deepEqual(i.documentos.map((d) => [d.tipo, d.titulo]), [["edital", "Edital"], ["laudo", "Laudo de avaliação"], ["outro", "Processo"]]);
});

test("terreno sem avaliação em venda direta (praça única), vendido, endereço só em texto, 2ª praça pela situação", () => {
  const terreno = normalizado("alfa-leiloes:48213");
  assert.equal(terreno.valor_avaliacao, null);
  assert.equal(terreno.preco, 95000);
  assert.equal(terreno.praca_atual, 0);
  assert.equal(terreno.endereco, "Rua Projetada 5, Lote 12, Quadra B");
  assert.equal(normalizado("alfa-leiloes:48214").status, "encerrado");
  assert.equal(normalizado("alfa-leiloes:48214").extras?.status_fonte, "Arrematado");
  const soTexto = normalizado("alfa-leiloes:48215");
  assert.equal(soTexto.endereco, "Av. Presidente Vargas, 1500, apto 1203, Jardim América, Ribeirão Preto/SP");
  assert.equal(soTexto.bairro, null);
  assert.equal(soTexto.praca_atual, undefined, "sem situação nas praças: o núcleo deduz pelas datas");
  assert.equal(normalizado("beta-leiloes:9001").praca_atual, 2, "1ª deserta, 2ª futura");
  const niteroi = normalizado("beta-leiloes:9002");
  assert.deepEqual([niteroi.lat, niteroi.lon, niteroi.precisao_geo], [-22.9035, -43.1096, "rua"]);
  assert.equal(normalizado("beta-leiloes:9003").status, "encerrado", "suspenso sai do site");
  const curitiba = normalizado("gama-leiloes:771");
  assert.equal(curitiba.ocupacao, null, "ocupação achada no texto não vai para o campo");
  assert.ok(curitiba.textos?.some((t) => t.origem === "ocupacao" && /desocupado/.test(t.texto)));
});

test("frases de dívida: valor, quem paga, e nada quando a fonte não diz", () => {
  assert.equal(fraseDebito("condominio", { valor: 12000, responsavel: "arrematante" }), "Débito de condomínio declarado pelo leiloeiro: R$ 12.000,00, por conta do arrematante.");
  assert.equal(fraseDebito("iptu", { valor: null, responsavel: "vendedor" }), "Débito de IPTU declarado pelo leiloeiro (valor não informado), a cargo do vendedor.");
  assert.equal(fraseDebito("iptu", { valor: null, responsavel: null }), null);
  assert.equal(fraseDebito("iptu", null), null);
});

test("LGPD na importação: lote com CPF é recusado; endereço e comitente com pessoa são cortados", () => {
  const l = linhas().find((x) => x.id === "alfa-leiloes:48212")!;
  l.descricao = "Executado: FULANO DE TAL, CPF 123.456.789-09.";
  assert.throws(() => normalizarLinha(l), /alfa-leiloes:48212: descricao: LGPD: o texto tem CPF/);
  const m = linhas().find((x) => x.id === "alfa-leiloes:48211")!;
  (m.comitente as Record<string, unknown>).nome = "Banco Fictício S.A., credor fiduciário";
  (m.endereco as Record<string, unknown>).bairro = "Vila Mariana";
  assert.equal(normalizarLinha(m).comitente, "Banco Fictício S.A");
  m.extras = { codigo_interno: "A-77", contato: "fulano@exemplo.com" };
  // e-mail num campo que vai sem máscara é erro no exame
  assert.throws(() => normalizarLinha(m), /extras\.contato: LGPD: o texto tem E-MAIL/);
  m.extras = { codigo_interno: "A-77", visitas: 10 };
  assert.deepEqual([normalizarLinha(m).extras?.x_codigo_interno, normalizarLinha(m).extras?.x_visitas], ["A-77", 10]);
});

test("agrupa por leiloeiro: uma fonte ll_<slug> com o nome, o site, as capacidades e a lista completa da linha de coleta", () => {
  const { grupos, ilegiveis } = agruparPorLeiloeiro(TEXTO);
  assert.equal(ilegiveis, 0);
  assert.deepEqual(grupos.map((g) => [g.slug, g.linhas.length, g.coleta?.saude]), [["alfa-leiloes", 5, "ok"], ["beta-leiloes", 4, "ok"], ["gama-leiloes", 3, "parcial"]]);
  const [alfa, beta, gama] = grupos.map((g) => conectorDoLeiloeiro(g, "fixture.jsonl"));
  assert.equal(alfa!.id, "ll_alfa_leiloes");
  assert.equal(alfa!.nome, "Alfa Leilões (fictício)");
  assert.equal(alfa!.url, "https://alfa-leiloes.example");
  assert.equal(alfa!.acesso, "html");
  assert.equal(beta!.acesso, "endpoint_interno");
  assert.deepEqual(alfa!.capacidades, { fotos: true, documentos: true, ocupacao: true, listaCompleta: true });
  assert.deepEqual(gama!.capacidades, { fotos: true, documentos: true, ocupacao: false, listaCompleta: false }, "sem 'extrai': deduz pelos lotes; carga parcial");
  // linha ilegível desliga a remoção de todos
  const comQuebra = agruparPorLeiloeiro(TEXTO + "{quebrado\n");
  assert.equal(comQuebra.ilegiveis, 1);
  assert.equal(conectorDoLeiloeiro(comQuebra.grupos[0]!, "x", comQuebra.ilegiveis).capacidades.listaCompleta, false);
  assert.equal(obterConector("leiloeiros")?.id, "leiloeiros_arquivo");
});

// ---------------------------------------------------------------------------
// Na base (CLI de verdade, banco em arquivo temporário)
// ---------------------------------------------------------------------------

async function rodar(args: string[], agora = AGORA) {
  const saida: string[] = [];
  const erro: string[] = [];
  const codigo = await principal(args, { http: httpProibido(), agora, saida: (t) => saida.push(t), erro: (t) => erro.push(t) });
  return { codigo, saida: saida.join("\n"), erro: erro.join("\n") };
}

function status(db: Banco): Record<string, string> {
  return Object.fromEntries(
    db.prepare("SELECT fonte_id, id_na_fonte, status FROM imovel WHERE fonte_id LIKE 'll\\_%' ESCAPE '\\' ORDER BY fonte_id, id_na_fonte").all().map((l) => [`${String(l.fonte_id)}:${String(l.id_na_fonte)}`, String(l.status)]),
  );
}

function porId(imoveis: readonly ImovelGravado[]): Record<string, ImovelGravado> {
  return Object.fromEntries(imoveis.map((i) => [`${i.fonte_id}:${i.id_na_fonte}`, i]));
}

test("ponta a ponta: importa, tira do ar o que sumiu da carga completa, recusa carga velha, roda as tags e exporta", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-leiloeiros-base-"));
  const banco = join(dir, "luneta.db");
  const arquivo = join(dir, "carga1.jsonl");
  writeFileSync(arquivo, TEXTO);
  try {
    assert.equal((await rodar(["migrar", "--banco", banco])).codigo, 0);
    // uma Caixa com o mesmo apartamento da Alfa (mesma matrícula e cartório): deduplicação
    const db0 = abrirBanco(banco);
    try {
      garantirFonte(db0, conectorFalso({ id: "caixa_csv", registros: () => [] }), AGORA);
      gravarImoveis(db0, "caixa_csv", [
        imovelExemplo({
          id_na_fonte: "0000000000001",
          url: "https://exemplo.test/caixa/1",
          cidade: "Sao Paulo",
          endereco: "RUA VERGUEIRO, 1000, APTO 82",
          matricula: "123456",
          cartorio: "06º OFICIO DE REGISTRO DE IMOVEIS DE SAO PAULO",
          pracas: [{ numero: 0, data: null, valor_minimo: 300000 }],
          praca_atual: 0,
          modalidade: "venda_direta",
        }),
      ], { agora: AGORA });
    } finally {
      db0.close();
    }

    const c1 = await rodar(["coletar", "leiloeiros", "--banco", banco, "--arquivo", arquivo]);
    assert.equal(c1.codigo, 0, c1.erro + c1.saida);
    assert.match(c1.erro, /3 leiloeiro\(s\)/);
    assert.match(c1.saida, /Coleta #\d+ de ll_alfa_leiloes: sucesso \(completa: removidos marcados\)/);
    assert.match(c1.saida, /de ll_gama_leiloes: sucesso\n/);
    assert.match(c1.saida, /novos 5/);

    let db = abrirBanco(banco);
    try {
      const fontes = db.prepare("SELECT id, nome, tipo, url, lista_completa FROM fonte WHERE id LIKE 'll\\_%' ESCAPE '\\' ORDER BY id").all();
      assert.deepEqual(fontes.map((f) => [f.id, f.nome, f.tipo, f.url, f.lista_completa]), [
        ["ll_alfa_leiloes", "Alfa Leilões (fictício)", "leiloeiro", "https://alfa-leiloes.example", 1],
        ["ll_beta_leiloes", "Beta Leilões Oficiais (fictício)", "leiloeiro", "https://www.beta-leiloes.example", 1],
        ["ll_gama_leiloes", "Gama Leiloeira (fictícia)", "leiloeiro", "https://gama-leiloes.example", 0],
      ]);
      const s = status(db);
      assert.equal(s["ll_alfa_leiloes:48214"], "encerrado", "vendido");
      assert.equal(s["ll_beta_leiloes:9003"], "encerrado", "suspenso");
      assert.equal(s["ll_gama_leiloes:773"], "encerrado", "cancelado");
      assert.equal(Object.values(s).filter((v) => v === "ativo").length, 9);
      // a saúde declarada fica nos avisos da coleta (o relatório lê de volta)
      const avisos = lerTexto(db.prepare("SELECT avisos FROM coleta WHERE fonte_id = 'll_gama_leiloes'").get()?.avisos) ?? "";
      assert.match(avisos, /Coleta declarada pelo coletor: saúde parcial, frequência manual, completa não/);

      // Deduplicação: a chave por matrícula + cartório é a mesma da Caixa
      const todos = porId(carregarImoveis(db));
      const alfa = todos["ll_alfa_leiloes:48211"]!;
      assert.equal(alfa.chave_dedup, todos["caixa_csv:0000000000001"]!.chave_dedup);
      assert.match(alfa.chave_dedup ?? "", /^mat:3550308:6:123456$/);
      assert.equal(alfa.praca_atual, 1);
      assert.equal(alfa.preco, 520000);
      assert.equal(alfa.data_praca, "2026-11-10T17:00:00.000Z");
      assert.equal(todos["ll_beta_leiloes:9001"]!.preco, 480000, "a 2ª praça");
      assert.equal(todos["ll_alfa_leiloes:48215"]!.praca_atual, 1, "o núcleo deduziu pela data");

      // Tags: as regras de texto e de campo que já existem
      rodarRiscos(db, { agora: AGORA });
      const sim = (fonte: string, id: string) =>
        db
          .prepare("SELECT r.tag, r.confianca, r.precisa_revisao, r.origem FROM risco r JOIN imovel i ON i.id = r.imovel_id WHERE i.fonte_id = ? AND i.id_na_fonte = ? AND r.valor = 'sim' ORDER BY r.tag")
          .all(fonte, id)
          .map((r) => String(r.tag));
      const valor = (fonte: string, id: string, tag: string) =>
        String(db.prepare("SELECT r.valor FROM risco r JOIN imovel i ON i.id = r.imovel_id WHERE i.fonte_id = ? AND i.id_na_fonte = ? AND r.tag = ?").get(fonte, id, tag)?.valor);
      const casa = sim("ll_alfa_leiloes", "48212");
      for (const tag of ["ocupado", "iptu-em-atraso", "penhora-outros-credores", "primeira-praca"]) assert.ok(casa.includes(tag), `48212 sem ${tag}: ${casa.join(", ")}`);
      assert.notEqual(valor("ll_alfa_leiloes", "48212", "divida-passa-arrematante"), "sim", "o IPTU é pago com o lance");
      const niteroi = sim("ll_beta_leiloes", "9002");
      for (const tag of ["condominio-em-atraso", "divida-passa-arrematante", "custos-extras-altos", "praca-unica"]) assert.ok(niteroi.includes(tag), `9002 sem ${tag}: ${niteroi.join(", ")}`);
      assert.ok(sim("ll_beta_leiloes", "9001").includes("segunda-praca"));
      assert.ok(sim("ll_alfa_leiloes", "48213").includes("praca-unica"));
      assert.ok(sim("ll_alfa_leiloes", "48211").includes("desocupado"));
      assert.ok(sim("ll_alfa_leiloes", "48211").includes("aceita-financiamento"));
      assert.ok(sim("ll_beta_leiloes", "9004").includes("sem-fotos"), "a Beta publica fotos e a fazenda não tem");
      assert.ok(sim("ll_gama_leiloes", "771").includes("desocupado"), "achado no texto da ocupação");
    } finally {
      db.close();
    }

    // Exportação: id ll-<slug>-<lote>, nome do leiloeiro como fonte, links e condições de pagamento
    const pasta = join(dir, "saida");
    const e = await rodar(["exportar", "--site", "--banco", banco, "--pasta", pasta]);
    assert.equal(e.codigo, 0, e.erro);
    const lista = JSON.parse(gunzipSync(readFileSync(join(pasta, "site", "imoveis.json.gz"))).toString("utf8")) as ListaCatalogo;
    const linhasCatalogo = deColunas(lista.colunas, lista.total);
    const ids = linhasCatalogo.map((l) => l.id).filter((id) => id.startsWith("ll-")).sort();
    assert.deepEqual(ids, [
      "ll-alfa-leiloes-48211", "ll-alfa-leiloes-48212", "ll-alfa-leiloes-48213", "ll-alfa-leiloes-48215",
      "ll-beta-leiloes-9001", "ll-beta-leiloes-9002", "ll-beta-leiloes-9004",
      "ll-gama-leiloes-771", "ll-gama-leiloes-772",
    ]);
    for (const id of ids) assert.ok(/^[a-z0-9-]+$/.test(id) && id.length <= 80, id);
    const casa = linhasCatalogo.find((l) => l.id === "ll-alfa-leiloes-48212")!;
    assert.deepEqual(casa.fonte, { id: "ll_alfa_leiloes", nome: "Alfa Leilões (fictício)" });
    assert.equal(casa.judicial, true);
    assert.equal(casa.ocupacao, "ocupado");
    assert.ok(lista.fontes.some((f) => f.id === "ll_gama_leiloes" && f.nome === "Gama Leiloeira (fictícia)" && f.total === 2));
    const parte = JSON.parse(gunzipSync(readFileSync(join(pasta, "site", "detalhes", `${parteDoId(casa.id)}.json.gz`))).toString("utf8")) as ParteCatalogo;
    const detalhe = parte.detalhes[casa.id]!;
    assert.equal(detalhe.leiloeiro, "Alfa Leilões (fictício)");
    assert.equal(detalhe.numeroProcesso, "0012345-67.2024.8.26.0114");
    assert.equal(detalhe.condicoesPagamento, "Entrada de 25% e o restante em até 30 parcelas (IPCA)");
    assert.deepEqual(detalhe.links.find((l) => l.tipo === "anuncio"), {
      tipo: "anuncio",
      rotulo: "Ver lote no site do leiloeiro",
      url: "https://alfa-leiloes.example/lote/48212",
      descricao: "Página do lote no site de Alfa Leilões (fictício)",
    });
    assert.ok(detalhe.links.some((l) => l.tipo === "leiloeiro" && l.url === "https://alfa-leiloes.example"));
    assert.equal(detalhe.links.find((l) => l.tipo === "edital")?.descricao, "PDF publicado no site do leiloeiro");

    // Segunda carga, mais nova: a Alfa sem o 48215 (sai do ar), a Gama (incompleta) sem o 772 (fica)
    const segunda = linhas()
      .filter((l) => l.id !== "alfa-leiloes:48215" && l.id !== "gama-leiloes:772")
      .map((l) => {
        if (l.registro === "coleta") {
          const slug = String((l.leiloeiro as Record<string, unknown>).slug);
          return { ...l, coletado_em: "2026-10-27T22:10:00-03:00", total_enviados: slug === "alfa-leiloes" ? 4 : slug === "gama-leiloes" ? 2 : l.total_enviados };
        }
        return l;
      });
    const arquivo2 = join(dir, "carga2.jsonl");
    writeFileSync(arquivo2, jsonl(segunda));
    const c2 = await rodar(["coletar", "leiloeiros", "--banco", banco, "--arquivo", arquivo2], new Date("2026-10-28T12:00:00Z"));
    assert.equal(c2.codigo, 0, c2.erro + c2.saida);
    assert.match(c2.saida, /de ll_alfa_leiloes: sucesso \(completa: removidos marcados\)[\s\S]*?removidos 1/);
    db = abrirBanco(banco);
    try {
      const s = status(db);
      assert.equal(s["ll_alfa_leiloes:48215"], "removido");
      assert.equal(s["ll_gama_leiloes:772"], "ativo", "carga incompleta não remove");
      assert.equal(s["ll_beta_leiloes:9001"], "ativo");
    } finally {
      db.close();
    }

    // A primeira carga de novo (mais velha): recusada, nada muda
    const c3 = await rodar(["coletar", "leiloeiros", "--banco", banco, "--arquivo", arquivo], new Date("2026-10-28T13:00:00Z"));
    assert.equal(c3.codigo, 1);
    assert.match(c3.saida, /de ll_alfa_leiloes: invalida[\s\S]*mais antigo que o já gravado/);
    db = abrirBanco(banco);
    try {
      assert.equal(status(db)["ll_alfa_leiloes:48215"], "removido");
    } finally {
      db.close();
    }

    // Coletor bloqueado, sem lotes: a coleta fica em erro "[bloqueado]" e os lotes publicados continuam
    const bloqueada = linhas()
      .filter((l) => l.registro === "coleta" && (l.leiloeiro as Record<string, unknown>).slug === "beta-leiloes")
      .map((l) => ({ ...l, coletado_em: "2026-10-28T20:00:00-03:00", completa: false, saude: "bloqueado", total_enviados: 0, erro: "403 em todas as páginas" }));
    const arquivo3 = join(dir, "carga3.jsonl");
    writeFileSync(arquivo3, jsonl(bloqueada));
    const c4 = await rodar(["coletar", "leiloeiros", "--banco", banco, "--arquivo", arquivo3], new Date("2026-10-29T12:00:00Z"));
    assert.equal(c4.codigo, 1);
    assert.match(c4.saida, /de ll_beta_leiloes: erro[\s\S]*\[bloqueado\] 403 em todas as páginas/);

    // Relatório da base: esquema, contagens, saúde, frequência declarada e repetidos da Caixa
    db = abrirBanco(banco);
    try {
      const r = relatorioDaBase(db, { agora: new Date("2026-10-29T12:00:00Z") });
      conferirRelatorio(r);
      assert.equal(r.origem, "base");
      assert.deepEqual(r.leiloeiros.map((l) => [l.slug, l.ativos, l.coleta.saude, l.coleta.frequencia]), [
        ["alfa-leiloes", 3, "ok", "diaria"],
        ["beta-leiloes", 3, "bloqueado", "semanal"],
        ["gama-leiloes", 2, "parcial", "manual"],
      ]);
      const alfa = r.leiloeiros[0]!;
      assert.deepEqual(alfa.situacao, { ativos_na_fonte: 3, encerrados: 1, removidos: 1, praca_vencida: 0, sem_lance: 0 });
      assert.equal(alfa.repetidos_caixa, 1);
      assert.equal(alfa.plataforma, "Plataforma Fictícia X");
      assert.equal(alfa.coleta.completa, true);
      assert.equal(alfa.coleta.gerado_na_fonte_em, "2026-10-28T01:10:00.000Z");
      assert.equal(alfa.coleta.dias_sem_coleta_valida, 1);
      const beta = r.leiloeiros[1]!;
      assert.equal(beta.coleta.erro, "[bloqueado] 403 em todas as páginas");
      assert.deepEqual(r.totais, { leiloeiros: 3, leiloeiros_com_ativos: 3, ativos: 8, leiloes_ativos: 2, ativos_todas_as_fontes: 9, por_saude: { bloqueado: 1, ok: 1, parcial: 1 } });
      assert.equal(alfa.leiloes_ativos, 2, "pelo leilao_id guardado nos extras");
      assert.deepEqual(r.outras_fontes.map((f) => [f.fonte_id, f.ativos]), [["caixa_csv", 1]]);
    } finally {
      db.close();
    }

    // Linha de comando do relatório: --site grava em <pasta>/site/relatorio-leiloeiros.json
    const saida: string[] = [];
    assert.equal(relatorioCli(["--banco", banco, "--site", "--pasta", pasta, "--agora", "2026-10-29T12:00:00Z"], (t) => saida.push(t), () => undefined), 0);
    const gravado = JSON.parse(readFileSync(join(pasta, "site", "relatorio-leiloeiros.json"), "utf8")) as { formato: string; leiloeiros: unknown[] };
    assert.equal(gravado.formato, "luneta-relatorio-leiloeiros");
    assert.equal(gravado.leiloeiros.length, 3);
    assert.match(saida.join("\n"), /3 leiloeiro\(s\) com coletor, 3 com imóveis no site/);
    assert.match(saida.join("\n"), /Alfa Leilões \(fictício\) \(alfa-leiloes\) · 2 leilão\(ões\) · Plataforma Fictícia X · saúde ok · diaria/);
    assert.equal(relatorioCli(["--banco", join(dir, "nao-existe.db")], () => undefined, () => undefined), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("comitente do tipo outro sem cara de empresa ou órgão (pode ser pessoa física) fica fora; aviso no validador", () => {
  const com = (nome: string, tipo: string) => {
    const l = linhas().find((x) => x.id === "alfa-leiloes:48211")!;
    l.comitente = { nome, tipo };
    return l;
  };
  assert.equal(normalizarLinha(com("Fulano de Tal", "outro")).comitente, null);
  assert.equal(normalizarLinha(com("José Carlos da Silva", "outro")).comitente, null);
  assert.equal(normalizarLinha(com("Construtora Alfa Ltda.", "outro")).comitente, "Construtora Alfa Ltda.");
  assert.equal(normalizarLinha(com("Condomínio Edifício Aurora", "outro")).comitente, "Condomínio Edifício Aurora");
  assert.equal(normalizarLinha(com("Alfa Comércio S/A", "outro")).comitente, "Alfa Comércio S/A");
  assert.equal(normalizarLinha(com("Banco Fictício S.A.", "banco")).comitente, "Banco Fictício S.A.");
  const avisosDe = (l: Record<string, unknown>) => examinarImovel(l, { tabela: null, agora: AGORA }).filter((p) => p.nivel === "aviso").map((p) => p.campo);
  assert.deepEqual(avisosDe(com("Fulano de Tal", "outro")), ["comitente.nome"]);
  assert.deepEqual(avisosDe(com("Prefeitura Municipal de Campinas", "outro")), []);
});

test("cidade: a importação grava o nome do IBGE (acento, maiúsculas, grafia antiga); distrito fica como veio", () => {
  assert.equal(cidadeOficial("SP", "SÃO PAULO"), "São Paulo");
  assert.equal(cidadeOficial("SP", "Sao  Paulo"), "São Paulo");
  assert.equal(cidadeOficial("SP", "Moji das Cruzes"), "Mogi das Cruzes");
  assert.equal(cidadeOficial("SP", "Embu"), "Embu das Artes");
  assert.equal(cidadeOficial("DF", "Taguatinga"), "Taguatinga");
  assert.equal(cidadeOficial("SP", "Cidade Inexistente"), "Cidade Inexistente");
  const l = linhas().find((x) => x.id === "alfa-leiloes:48211")!;
  (l.endereco as Record<string, unknown>).cidade = "SAO PAULO";
  assert.equal(normalizarLinha(l).cidade, "São Paulo");
});

test("cargas separadas: só o leiloeiro do arquivo muda; leiloeiro novo vira fonte nova; vendido encerra só o lote dele", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-leiloeiros-cargas-"));
  const banco = join(dir, "luneta.db");
  try {
    assert.equal((await rodar(["migrar", "--banco", banco])).codigo, 0);
    const c1 = join(dir, "c1.jsonl");
    writeFileSync(c1, TEXTO);
    assert.equal((await rodar(["coletar", "leiloeiros", "--banco", banco, "--arquivo", c1])).codigo, 0);
    const antes = (() => {
      const db = abrirBanco(banco);
      try {
        return status(db);
      } finally {
        db.close();
      }
    })();

    // Carga 2: só a Beta (completa, com o 9001 vendido e sem o 9004) e um leiloeiro novo, a Delta.
    const beta = linhas()
      .filter((l) => String((l.leiloeiro as Record<string, unknown>).slug) === "beta-leiloes" && l.id !== "beta-leiloes:9004")
      .map((l) => (l.registro === "coleta" ? { ...l, coletado_em: "2026-10-27T20:00:00-03:00", total_enviados: 3 } : l.id === "beta-leiloes:9001" ? { ...l, situacao: "vendido", situacao_fonte: "Arrematado" } : l));
    const delta = { slug: "delta-leiloes", nome: "Delta Leilões (fictício)", site: "https://delta.example", matricula_junta: null };
    const modelo = linhas().find((l) => l.id === "alfa-leiloes:48211")!;
    const novo = { ...modelo, id: "delta-leiloes:1", leiloeiro: delta, url: "https://delta.example/lote/1" };
    const coletaDelta = { ...linhas()[0]!, leiloeiro: delta, plataforma: null, total_enviados: 1, total_na_fonte: 1, coletado_em: "2026-10-27T20:00:00-03:00" };
    const c2 = join(dir, "c2.jsonl");
    writeFileSync(c2, jsonl([...beta, coletaDelta, novo]));
    const r2 = await rodar(["coletar", "leiloeiros", "--banco", banco, "--arquivo", c2], new Date("2026-10-28T12:00:00Z"));
    assert.equal(r2.codigo, 0, r2.erro + r2.saida);
    assert.match(r2.erro, /2 leiloeiro\(s\)/);
    assert.match(r2.saida, /de ll_beta_leiloes: sucesso \(completa: removidos marcados\)[\s\S]*?removidos 1/);
    assert.match(r2.saida, /de ll_delta_leiloes: sucesso[\s\S]*?novos 1/);

    const db = abrirBanco(banco);
    try {
      const depois = status(db);
      assert.equal(depois["ll_beta_leiloes:9001"], "encerrado", "vendido");
      assert.equal(depois["ll_beta_leiloes:9004"], "removido", "sumiu da carga completa da Beta");
      assert.equal(depois["ll_delta_leiloes:1"], "ativo");
      // Alfa e Gama não estavam no arquivo: nada mudou nelas
      for (const [id, s] of Object.entries(antes)) if (!id.startsWith("ll_beta_leiloes:")) assert.equal(depois[id], s, id);
      // o mesmo apartamento na Alfa e na Delta: mesma chave de deduplicação, ids diferentes no site
      const todos = porId(carregarImoveis(db));
      assert.equal(todos["ll_delta_leiloes:1"]!.chave_dedup, todos["ll_alfa_leiloes:48211"]!.chave_dedup);
      assert.ok(db.prepare("SELECT 1 FROM fonte WHERE id = 'll_delta_leiloes' AND nome = 'Delta Leilões (fictício)'").get());
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("coletar leiloeiros sem --arquivo, ou com arquivo sem leiloeiro, falha sem gravar", async () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-leiloeiros-vazio-"));
  try {
    const banco = join(dir, "luneta.db");
    const sem = await rodar(["coletar", "leiloeiros", "--banco", banco]);
    assert.equal(sem.codigo, 1);
    assert.match(sem.erro, /Informe o arquivo/);
    const vazio = join(dir, "vazio.jsonl");
    writeFileSync(vazio, "{quebrado\n");
    const r = await rodar(["coletar", "leiloeiros", "--banco", banco, "--arquivo", vazio]);
    assert.equal(r.codigo, 1);
    assert.match(r.erro, /Nenhum leiloeiro reconhecido/);
    const db = abrirBanco(banco);
    try {
      assert.equal(Number(db.prepare("SELECT count(*) AS n FROM coleta").get()?.n), 0);
    } finally {
      db.close();
    }
    // o conector de origem não é coletado direto
    assert.throws(() => leiloeirosArquivo.coletar({} as never), /se desdobra em uma fonte por leiloeiro/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
