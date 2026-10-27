/**
 * Contrato dos leiloeiros: esquemas, validador e relatório a partir do JSONL. A importação na base e o
 * relatório da base estão em base/fontes/leiloeiros/leiloeiros.test.ts. Dados fictícios.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TAGS } from "../riscos/tags.ts";
import { MODALIDADES, PRECISOES_GEO, TIPOS_IMOVEL, UFS } from "../tipos.ts";
import {
  avisoColetaDeclarada,
  enderecoEmTexto,
  erroDeclarado,
  FREQUENCIAS,
  fonteDoSlug,
  idNoSite,
  lerColetaDeclarada,
  lerJsonl,
  METODOS,
  RESPONSAVEIS_DEBITO,
  SAUDES,
  saudeDoErro,
  separarId,
  SITUACOES,
  SITUACOES_PRACA,
  slugDaFonte,
  TIPOS_COMITENTE,
  TIPOS_DOCUMENTO_LINHA,
} from "./contrato.ts";
import { carregarEsquema, ehDataHoraComFuso, palavrasNaoSuportadas, validarEsquema, type Esquema } from "./esquema.ts";
import { conferirRelatorio, relatorioDoJsonl } from "./relatorio.ts";
import { examinarImovel, formatarResultado, principal, validarJsonl, type Problema } from "./validar.ts";

const FIXTURE = new URL("../fontes/leiloeiros/fixtures/tres-leiloeiros.jsonl", import.meta.url);
const TEXTO = readFileSync(FIXTURE, "utf8");
const AGORA = new Date("2026-10-27T12:00:00Z");

/** Linhas da fixture como objetos (cópia funda, para alterar à vontade). */
function linhas(): Array<Record<string, unknown>> {
  return lerJsonl(TEXTO).map((l) => structuredClone(l.valor) as Record<string, unknown>);
}

function lote(id: string): Record<string, unknown> {
  const achado = linhas().find((l) => l.id === id);
  assert.ok(achado, id);
  return achado;
}

const jsonl = (objs: readonly unknown[]): string => objs.map((o) => JSON.stringify(o)).join("\n") + "\n";
const erros = (ps: readonly Problema[]) => ps.filter((p) => p.nivel === "erro");
const avisos = (ps: readonly Problema[]) => ps.filter((p) => p.nivel === "aviso");
const mensagens = (ps: readonly Problema[]) => ps.map((p) => `${p.campo}: ${p.mensagem}`).join("\n");

// ---------------------------------------------------------------------------
// Contrato e esquemas
// ---------------------------------------------------------------------------

test("ids: <slug>:<lote>, fonte ll_<slug>, id no site ll-<slug>-<lote> (sem colisão entre leiloeiros)", () => {
  assert.deepEqual(separarId("alfa-leiloes:48211"), { slug: "alfa-leiloes", lote: "48211" });
  assert.equal(separarId("alfa-leiloes:2026-001"), null, "lote com hífen é recusado (o hífen separa o slug no site)");
  assert.equal(separarId("Alfa:1"), null);
  assert.equal(separarId("alfa:1:2"), null);
  assert.equal(separarId("a:1"), null, "slug com 2 caracteres ou mais");
  assert.equal(fonteDoSlug("alfa-leiloes"), "ll_alfa_leiloes");
  assert.equal(slugDaFonte("ll_alfa_leiloes"), "alfa-leiloes");
  assert.equal(slugDaFonte("caixa_csv"), null);
  assert.equal(idNoSite("alfa-leiloes", "48211"), "ll-alfa-leiloes-48211");
  // "silva" com o lote "x" e "silva-x" com o lote "1" nunca dão o mesmo id: o lote não tem hífen.
  assert.notEqual(idNoSite("silva", "x1"), idNoSite("silva-x", "1"));
  // o site exige /^[a-z0-9-]+$/ e até 80 caracteres
  const maior = idNoSite("a".repeat(30), "9".repeat(40));
  assert.ok(/^[a-z0-9-]+$/.test(maior) && maior.length <= 80, maior);
});

test("endereço para a base: campos juntos, ou o texto; sem 's/n' inventado", () => {
  assert.equal(enderecoEmTexto({ logradouro: "Rua A", numero: "10", complemento: "Apto 2", texto: "outro" }), "Rua A, 10, Apto 2");
  assert.equal(enderecoEmTexto({ logradouro: "Rua A", numero: null, complemento: null }), "Rua A");
  assert.equal(enderecoEmTexto({ texto: " Av. B, 5 " }), "Av. B, 5");
  assert.equal(enderecoEmTexto({}), null);
});

test("coleta declarada vai e volta pelos avisos; erro declarado leva a saúde", () => {
  const aviso = avisoColetaDeclarada({ saude: "parcial", frequencia: "semanal", completa: false, versao_coletor: "x-1", erro: "tempo esgotado" });
  assert.deepEqual(lerColetaDeclarada(aviso), { saude: "parcial", frequencia: "semanal", completa: false });
  assert.equal(lerColetaDeclarada("outro aviso"), null);
  assert.equal(saudeDoErro(erroDeclarado("bloqueado", "403 em todas as páginas")), "bloqueado");
  assert.equal(saudeDoErro("A fonte não devolveu nenhum registro."), null);
});

test("os esquemas só usam palavras que o validador conhece", () => {
  for (const nome of ["imovel", "coleta", "relatorio-leiloeiros"] as const) {
    assert.deepEqual(palavrasNaoSuportadas(carregarEsquema(nome)), [], nome);
  }
});

test("os enums dos esquemas batem com os da base e do contrato", () => {
  const imovel = carregarEsquema("imovel") as Record<string, Record<string, Esquema>>;
  const p = imovel.properties!;
  const defs = imovel.$defs!;
  const props = (def: Esquema) => (def as { properties: Record<string, { enum?: unknown[] }> }).properties;
  const semNull = (lista: unknown[] | undefined) => (lista ?? []).filter((v) => v !== null);
  assert.deepEqual(p.tipo!.enum, [...TIPOS_IMOVEL]);
  assert.deepEqual(p.modalidade!.enum, [...MODALIDADES]);
  assert.deepEqual(p.situacao!.enum, [...SITUACOES]);
  assert.deepEqual(semNull(p.precisao_geo!.enum as unknown[]), [...PRECISOES_GEO]);
  assert.deepEqual(props(defs.endereco!).uf!.enum, [...UFS]);
  assert.deepEqual(props(p.comitente!).tipo!.enum, [...TIPOS_COMITENTE]);
  assert.deepEqual(props(defs.documento!).tipo!.enum, [...TIPOS_DOCUMENTO_LINHA]);
  assert.deepEqual(semNull(props(defs.praca!).situacao!.enum), [...SITUACOES_PRACA]);
  assert.deepEqual(semNull(props(defs.debito!).responsavel!.enum), [...RESPONSAVEIS_DEBITO]);
  const coleta = carregarEsquema("coleta") as Record<string, Record<string, Esquema>>;
  assert.deepEqual(coleta.properties!.saude!.enum, [...SAUDES]);
  assert.deepEqual(semNull(coleta.properties!.frequencia!.enum as unknown[]), [...FREQUENCIAS]);
  assert.deepEqual(semNull(coleta.properties!.metodo!.enum as unknown[]), [...METODOS]);
  assert.deepEqual(coleta.$defs!.leiloeiro, defs.leiloeiro, "o leiloeiro é o mesmo nos dois esquemas");
});

test("validador de esquema: tipo, obrigatório, campo desconhecido, padrão, formato e $ref", () => {
  const esquema = carregarEsquema("imovel");
  const l = lote("alfa-leiloes:48211");
  assert.deepEqual(validarEsquema(l, esquema), []);
  const ruim = { ...l, avaliacao: "R$ 520.000,00", url: "www.alfa.example/1", campo_novo: 1, titulo: undefined };
  const achados = validarEsquema(ruim, esquema).map((e) => `${e.caminho}: ${e.mensagem}`);
  assert.ok(achados.some((a) => a.startsWith("avaliacao: tipo errado")), achados.join("\n"));
  assert.ok(achados.some((a) => a.startsWith("url: URL inválida")), achados.join("\n"));
  assert.ok(achados.some((a) => a.startsWith("campo_novo: campo desconhecido")), achados.join("\n"));
  assert.ok(achados.some((a) => a.startsWith("titulo: obrigatório")), achados.join("\n"));
  const praca = { ...l, pracas: [{ numero: 1, data: "2026-11-10T14:00:00", valor_minimo: 1 }] };
  assert.match(validarEsquema(praca, esquema).map((e) => `${e.caminho}: ${e.mensagem}`).join("\n"), /pracas\[0\]\.data: data e hora fora do padrão/);
  assert.ok(ehDataHoraComFuso("2026-11-10T14:00:00-03:00"));
  assert.ok(ehDataHoraComFuso("2026-11-10T17:00:00.000Z"));
  assert.ok(!ehDataHoraComFuso("2026-11-10T14:00:00-03"));
  assert.ok(!ehDataHoraComFuso("2026-02-30T14:00:00Z"));
  assert.ok(!ehDataHoraComFuso("10/11/2026 14:00"));
});

// ---------------------------------------------------------------------------
// Validador
// ---------------------------------------------------------------------------

test("a fixture de 3 leiloeiros passa sem erros nem avisos", () => {
  const r = validarJsonl(TEXTO, { agora: AGORA });
  assert.equal(r.erros, 0, mensagens(r.problemas));
  assert.equal(r.avisos, 0, mensagens(r.problemas));
  assert.equal(r.linhasColeta, 3);
  assert.equal(r.linhasImovel, 12);
  const porSlug = Object.fromEntries(r.leiloeiros.map((l) => [l.slug, l]));
  assert.deepEqual(Object.keys(porSlug), ["alfa-leiloes", "beta-leiloes", "gama-leiloes"]);
  assert.deepEqual(porSlug["alfa-leiloes"]!.porSituacao, { ativo: 4, vendido: 1 });
  assert.equal(porSlug["alfa-leiloes"]!.agregado.ativos, 4);
  assert.equal(porSlug["alfa-leiloes"]!.agregado.qualidade.com_avaliacao_pct, 75, "o terreno 48213 não tem avaliação");
  assert.equal(porSlug["beta-leiloes"]!.agregado.ativos, 3, "o suspenso fica fora");
  assert.equal(porSlug["beta-leiloes"]!.agregado.qualidade.com_foto_pct, 67, "a fazenda 9004 não tem foto");
  assert.equal(porSlug["gama-leiloes"]!.plataforma, "Plataforma Fictícia Y");
  assert.match(porSlug["alfa-leiloes"]!.importacao, /o que sumiu desde a última carga sai do site/);
  assert.match(porSlug["gama-leiloes"]!.importacao, /carga incompleta: nada sai do site/);
  const texto = formatarResultado(r, { arquivo: "fixture" });
  assert.match(texto, /Resultado: OK para importar/);
  assert.match(texto, /alfa-leiloes · Alfa Leilões \(fictício\)/);
  assert.match(texto, /no site: 4/);
});

test("coerência: praças fora de ordem, 2ª maior que a 1ª, praça atual que não existe, coordenada sem precisão", () => {
  const l = lote("alfa-leiloes:48211");
  const pracas = l.pracas as Array<Record<string, unknown>>;
  pracas[1]!.data = "2026-11-01T14:00:00-03:00";
  pracas[1]!.valor_minimo = 600000;
  l.praca_atual = 3;
  l.lat = -23.58;
  l.lon = -46.63;
  const msgs = mensagens(erros(examinarImovel(l, { agora: AGORA, tabela: null })));
  assert.match(msgs, /pracas: a data da 2ª praça não é depois da 1ª praça/);
  assert.match(msgs, /pracas: o valor mínimo da 2ª praça \(600000\) é maior que o da 1ª praça \(520000\)/);
  assert.match(msgs, /praca_atual: a praça 3 não está em pracas/);
  assert.match(msgs, /precisao_geo: coordenada sem precisao_geo/);
});

test("coerência: UF fora da lista é erro; cidade que não casa com o IBGE é aviso com sugestão", () => {
  const l = lote("alfa-leiloes:48212");
  (l.endereco as Record<string, unknown>).uf = "XX";
  assert.match(mensagens(erros(examinarImovel(l, { agora: AGORA }))), /endereco\.uf: valor fora da lista/);
  const m = lote("alfa-leiloes:48212");
  (m.endereco as Record<string, unknown>).cidade = "Cmpinas";
  const ps = examinarImovel(m, { agora: AGORA });
  assert.equal(erros(ps).length, 0, mensagens(ps));
  assert.match(mensagens(avisos(ps)), /"Cmpinas" não casa com um município do IBGE em SP: fica fora do mapa \(quis dizer "Campinas"\?\)/);
  // grafia sem acento casa (a tabela do IBGE aceita), e cidade desconhecida pede apelido
  (m.endereco as Record<string, unknown>).cidade = "Cidade Inexistente";
  assert.match(mensagens(avisos(examinarImovel(m, { agora: AGORA }))), /base\/geo\/apelidos\.csv/);
});

test("coerência: avisos de lote ativo com praça vencida, sem lance, judicial sem processo e sem endereço", () => {
  const l = lote("alfa-leiloes:48215");
  l.pracas = [{ numero: 1, data: "2026-10-01T15:00:00-03:00", valor_minimo: null, situacao: null }];
  l.natureza = "judicial";
  l.endereco = { cidade: "Ribeirão Preto", uf: "SP" };
  const msgs = mensagens(avisos(examinarImovel(l, { agora: AGORA, tabela: null })));
  assert.match(msgs, /situacao: ativo, mas a praça em vigor \(1ª praça\) já passou/);
  assert.match(msgs, /lance_minimo: sem lance mínimo/);
  assert.match(msgs, /processo: leilão judicial sem o número do processo/);
  assert.match(msgs, /endereco: sem endereço/);
});

test("LGPD: CPF é erro em qualquer campo; nome depois de papel é aviso na descrição e erro no endereço", () => {
  const l = lote("alfa-leiloes:48212");
  l.descricao = "Casa. Executado: FULANO DE TAL SILVA, CPF 123.456.789-09.";
  (l.endereco as Record<string, unknown>).complemento = "fundos, proprietário José Fictício";
  (l.comitente as Record<string, unknown>).nome = "Exequente: Banco Fictício";
  const ps = examinarImovel(l, { agora: AGORA, tabela: null });
  const e = mensagens(erros(ps));
  assert.match(e, /descricao: LGPD: o texto tem CPF/);
  assert.match(e, /endereco\.complemento: LGPD: "proprietário"/);
  assert.match(e, /comitente\.nome: LGPD: "Exequente"/);
  assert.match(mensagens(avisos(ps)), /descricao: LGPD: parece haver nome de pessoa/);
  // o nome do leiloeiro (profissional público) não é tratado como dado pessoal
  const ok = lote("alfa-leiloes:48211");
  (ok.leiloeiro as Record<string, unknown>).nome = "Leiloeiro Oficial Fulano de Tal";
  assert.equal(problemasDeLgpd(examinarImovel(ok, { agora: AGORA, tabela: null })), 0);
});

function problemasDeLgpd(ps: readonly Problema[]): number {
  return ps.filter((p) => p.mensagem.startsWith("LGPD")).length;
}

test("arquivo: JSON quebrado, registro desconhecido, id repetido, slug diferente, segunda coleta e não UTF-8", () => {
  const base = linhas();
  const repetido = structuredClone(base[1]!);
  const outroSlug = { ...structuredClone(base[2]!), id: "beta-leiloes:48212" };
  const texto = jsonl([...base, repetido, outroSlug, { registro: "edital" }, structuredClone(base[0]!)]) + "{quebrado\n";
  const r = validarJsonl(texto, { agora: AGORA, tabela: null });
  const msgs = mensagens(erros(r.problemas));
  assert.match(msgs, /id: id repetido \(já usado na linha 2\)/);
  assert.match(msgs, /id: o slug do id \(beta-leiloes\) é diferente de leiloeiro\.slug \(alfa-leiloes\)/);
  assert.match(msgs, /registro: registro deve ser "imovel" ou "coleta"/);
  assert.match(msgs, /segunda linha de coleta do leiloeiro alfa-leiloes/);
  assert.match(msgs, /linha: JSON inválido/);
  assert.match(mensagens(avisos(r.problemas)), /total_enviados = 5, mas o arquivo tem 7 lote\(s\) de alfa-leiloes/);
  assert.match(mensagens(validarJsonl("�" + TEXTO, { agora: AGORA, tabela: null }).problemas), /não está em UTF-8/);
  assert.match(mensagens(validarJsonl("\n\n", { agora: AGORA }).problemas), /arquivo vazio/);
});

test("coleta: completa só com saúde ok; data no futuro; leiloeiro sem linha de coleta", () => {
  const [alfa, ...resto] = linhas();
  const r = validarJsonl(jsonl([{ ...alfa, saude: "parcial" }, ...resto]), { agora: AGORA, tabela: null });
  assert.match(mensagens(erros(r.problemas)), /completa: completa=true com saúde parcial/);
  const futuro = validarJsonl(jsonl([{ ...alfa, coletado_em: "2026-12-01T10:00:00-03:00" }]), { agora: AGORA, tabela: null });
  assert.match(mensagens(erros(futuro.problemas)), /coletado_em: data de coleta no futuro/);
  const sem = validarJsonl(jsonl(resto.filter((l) => l.registro === "imovel" && String(l.id).startsWith("alfa"))), { agora: AGORA, tabela: null });
  assert.match(mensagens(avisos(sem.problemas)), /alfa-leiloes: sem linha de coleta/);
  assert.match(sem.leiloeiros[0]!.importacao, /sem linha de coleta: nada sai do site/);
});

test("previsão da importação: mais de 2 lotes (ou 5%) com erro recusa o leiloeiro inteiro", () => {
  const todas = linhas();
  const alfa = todas.filter((l) => String((l.leiloeiro as Record<string, unknown>).slug) === "alfa-leiloes");
  const quebrados = alfa.map((l) => (l.registro === "imovel" && l.id !== "alfa-leiloes:48211" ? { ...l, url: "sem-url" } : l));
  const r = validarJsonl(jsonl(quebrados), { agora: AGORA, tabela: null });
  assert.equal(r.leiloeiros[0]!.lotesComErro, 4);
  assert.match(r.leiloeiros[0]!.importacao, /^RECUSADA: 4 de 5 lotes com erro/);
});

test("previsão da importação: linha sem leiloeiro reconhecível desliga a remoção de todos, como na importação", () => {
  const limpo = validarJsonl(TEXTO, { agora: AGORA, tabela: null });
  assert.match(limpo.leiloeiros[0]!.importacao, /o que sumiu desde a última carga sai do site/);
  for (const sujeira of ["{quebrado\n", jsonl([{ registro: "edital" }]), jsonl([{ registro: "imovel", id: "SEM SLUG" }]), jsonl([[1, 2]])]) {
    const r = validarJsonl(TEXTO + sujeira, { agora: AGORA, tabela: null });
    const alfa = r.leiloeiros.find((l) => l.slug === "alfa-leiloes")!;
    assert.match(alfa.importacao, /grava 5 lote\(s\); remoção desligada nesta carga \(1 linha\(s\) do arquivo sem leiloeiro reconhecível/, sujeira);
  }
});

test("casos estranhos: data sem fuso, dinheiro em texto, UF minúscula, lote com barra, rótulo longo, URL relativa e campo inventado", () => {
  const casos: Array<[string, (l: Record<string, unknown>) => void, RegExp]> = [
    ["data sem fuso", (l) => ((l.pracas as Array<Record<string, unknown>>)[0]!.data = "2026-11-10T14:00:00"), /pracas\[0\]\.data: data e hora fora do padrão/],
    ["fuso sem minutos", (l) => ((l.pracas as Array<Record<string, unknown>>)[0]!.data = "2026-11-10T14:00:00-03"), /pracas\[0\]\.data: data e hora fora do padrão/],
    ["data brasileira", (l) => ((l.pracas as Array<Record<string, unknown>>)[0]!.data = "10/11/2026 14:00"), /pracas\[0\]\.data: data e hora fora do padrão/],
    ["dinheiro em texto", (l) => (l.avaliacao = "R$ 1.234,56"), /avaliacao: tipo errado: esperado número ou null, veio texto/],
    ["UF minúscula", (l) => ((l.endereco as Record<string, unknown>).uf = "sp"), /endereco\.uf: valor fora da lista: "sp"/],
    ["lote com barra", (l) => (l.id = "alfa-leiloes:2026/001-A"), /id: fora do padrão/],
    ["rótulo longo", (l) => (l.modalidade_fonte = "x".repeat(81)), /modalidade_fonte: texto longo demais \(81 caracteres; máximo 80\)/],
    ["URL relativa", (l) => (l.url = "/lote/48211"), /url: URL inválida/],
    ["campo inventado", (l) => (l.preco = 10), /preco: campo desconhecido/],
    ["processo com partes", (l) => (l.processo = "0012345-67.2024.8.26.0114 (Banco x Fulano)"), /processo: fora do padrão/],
  ];
  for (const [nome, mudar, esperado] of casos) {
    const l = lote("alfa-leiloes:48211");
    mudar(l);
    assert.match(mensagens(erros(examinarImovel(l, { agora: AGORA, tabela: null }))), esperado, nome);
  }
});

test("cidade com grafia antiga ou variante: aviso com o nome do IBGE", () => {
  for (const [cidade, oficial] of [["Moji das Cruzes", "Mogi das Cruzes"], ["Embu", "Embu das Artes"]] as const) {
    const l = lote("alfa-leiloes:48211");
    (l.endereco as Record<string, unknown>).cidade = cidade;
    const ps = examinarImovel(l, { agora: AGORA });
    assert.equal(erros(ps).length, 0, mensagens(ps));
    assert.match(mensagens(avisos(ps)), new RegExp(`endereco\\.cidade: "${cidade}" é grafia antiga ou variante: o IBGE escreve "${oficial}"`));
  }
  // só acento ou maiúsculas não é aviso (a importação grava o nome do IBGE)
  for (const cidade of ["Sao Paulo", "SÃO PAULO"]) {
    const l = lote("alfa-leiloes:48211");
    (l.endereco as Record<string, unknown>).cidade = cidade;
    assert.deepEqual(avisos(examinarImovel(l, { agora: AGORA })), [], cidade);
  }
});

test("linha de comando: 0 sem erros, 1 com erros, 2 sem --arquivo", () => {
  const dir = mkdtempSync(join(tmpdir(), "luneta-leiloeiros-"));
  try {
    const bom = join(dir, "bom.jsonl");
    const ruim = join(dir, "ruim.jsonl");
    writeFileSync(bom, TEXTO);
    writeFileSync(ruim, TEXTO + "{quebrado\n");
    const saida: string[] = [];
    const erro: string[] = [];
    const rodar = (args: string[]) => principal(args, (t) => saida.push(t), (t) => erro.push(t));
    assert.equal(rodar(["--arquivo", bom, "--agora", AGORA.toISOString()]), 0, erro.join("\n"));
    assert.match(saida.join("\n"), /OK para importar/);
    assert.equal(rodar(["--arquivo", ruim, "--agora", AGORA.toISOString(), "--sem-ibge"]), 1);
    assert.match(saida.join("\n"), /1 erro\(s\)/);
    assert.equal(rodar(["--arquivo", bom, "--json", "--agora", AGORA.toISOString()]), 0);
    assert.equal(JSON.parse(saida.at(-1)!).linhasImovel, 12);
    assert.equal(rodar([]), 2);
    assert.equal(rodar(["--arquivo", join(dir, "nao-existe.jsonl")]), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Documentação em dia com os esquemas
// ---------------------------------------------------------------------------

/** Nomes de campo de um esquema (raiz e $defs, com o caminho "pai.filho"). */
function camposDoEsquema(esquema: Esquema): string[] {
  const nomes: string[] = [];
  const visitar = (no: unknown, prefixo: string): void => {
    if (typeof no !== "object" || no === null) return;
    const props = (no as { properties?: Record<string, unknown> }).properties;
    for (const [nome, sub] of Object.entries(props ?? {})) {
      nomes.push(prefixo ? `${prefixo}.${nome}` : nome);
      visitar(sub, prefixo ? `${prefixo}.${nome}` : nome);
    }
  };
  visitar(esquema, "");
  for (const [nome, def] of Object.entries((esquema as { $defs?: Record<string, unknown> }).$defs ?? {})) visitar(def, nome);
  return nomes;
}

const lerAqui = (nome: string): string => readFileSync(new URL(`./${nome}`, import.meta.url), "utf8");
const ANEXOS = lerAqui("ANEXOS-PROMPT.md");
const secao = (texto: string, de: string, ate: string): string => texto.slice(texto.indexOf(de), texto.indexOf(ate));

test("CONTRATO.md e o Anexo A citam todos os campos dos esquemas", () => {
  const contrato = lerAqui("CONTRATO.md");
  const anexoA = secao(ANEXOS, "## Anexo A", "## Anexo B");
  for (const nome of ["imovel", "coleta"] as const) {
    for (const campo of camposDoEsquema(carregarEsquema(nome))) {
      const folha = campo.split(".").at(-1)!;
      // em código: `campo`, `pai.campo`, `campo.filho` ou `lista[].campo`
      assert.match(contrato, new RegExp(`[\`.]${folha}[\`.\\[]`), `CONTRATO.md não cita ${nome}: ${campo}`);
      assert.ok(anexoA.includes(folha), `o Anexo A não cita ${nome}: ${campo}`);
    }
  }
});

/** Resolve o $ref local de um nó do esquema (as palavras do nó valem por cima). */
function resolvido(no: Esquema, defs: Readonly<Record<string, Esquema>>): Esquema {
  const ref = typeof no.$ref === "string" ? defs[no.$ref.replace("#/$defs/", "")] : undefined;
  return ref ? { ...ref, ...no } : no;
}

/** Visita cada campo de um esquema (com $ref resolvido), com o caminho "pai.filho" ("pracas[].data"). */
function visitarCampos(esquema: Esquema, visita: (caminho: string, no: Esquema) => void): void {
  const defs = ((esquema as { $defs?: Record<string, Esquema> }).$defs ?? {}) as Record<string, Esquema>;
  const ir = (bruto: Esquema, caminho: string): void => {
    const no = resolvido(bruto, defs);
    if (caminho) visita(caminho, no);
    for (const [k, sub] of Object.entries((no.properties ?? {}) as Record<string, Esquema>)) ir(sub, caminho ? `${caminho}.${k}` : k);
    if (no.items && typeof no.items === "object") ir(no.items as Esquema, `${caminho}[]`);
  };
  ir(esquema, "");
}

test("o Anexo A lista todos os valores aceitos de cada enum dos esquemas", () => {
  const anexoA = secao(ANEXOS, "## Anexo A", "## Anexo B");
  for (const nome of ["imovel", "coleta"] as const) {
    visitarCampos(carregarEsquema(nome), (campo, no) => {
      if (!Array.isArray(no.enum) || no.enum.length > 20) return; // as 27 UFs: "sigla"
      for (const v of no.enum) if (v !== null) assert.ok(anexoA.includes(`\`${String(v)}\``), `Anexo A sem o valor ${String(v)} de ${nome}.${campo}`);
    });
  }
});

test("os limites de tamanho do Anexo A.1 batem com os esquemas", () => {
  const maximos = new Map<string, number>();
  for (const nome of ["imovel", "coleta"] as const) {
    visitarCampos(carregarEsquema(nome), (campo, no) => {
      if (typeof no.maxLength === "number") maximos.set(campo, no.maxLength);
    });
  }
  const bloco = /Corte os textos no limite[\s\S]*?Listas:/.exec(ANEXOS)?.[0];
  assert.ok(bloco, "o parágrafo dos limites no Anexo A.1");
  // "80 caracteres nos rótulos (`a`, `b`), 120 em `c` e `d`, ..." → um trecho por número
  const trechos = bloco.replace(/\s+/g, " ").split(/(?<![\d.])(?=\d{1,3}(?:\.\d{3})? (?:caracteres )?(?:n[oa]s?|em) )/);
  let conferidos = 0;
  for (const trecho of trechos) {
    const m = /^(\d{1,3}(?:\.\d{3})?) /.exec(trecho);
    if (!m) continue;
    const limite = Number(m[1]!.replace(".", ""));
    for (const [, nome] of trecho.matchAll(/`([a-z_.]+)`/g)) {
      const caminhos = [...maximos.keys()].filter((c) => c === nome || c.replace(/\[\]/g, "").endsWith(`.${nome}`) || c.split(".").at(-1) === nome);
      assert.ok(caminhos.length > 0, `campo ${nome} do Anexo A.1 não existe nos esquemas`);
      assert.ok(caminhos.some((c) => maximos.get(c) === limite), `${nome}: Anexo A.1 diz ${limite}, esquema diz ${caminhos.map((c) => `${c}=${maximos.get(c)}`).join(", ")}`);
      conferidos++;
    }
  }
  assert.ok(conferidos >= 20, `só ${conferidos} campos conferidos`);
});

test("os exemplos dos anexos passam no validador e no esquema do relatório; as 26 tags são as da base", () => {
  const exemplos = ANEXOS.split("\n").filter((l) => l.startsWith('{"registro":'));
  assert.equal(exemplos.length, 2, "um exemplo de coleta e um de imóvel");
  for (const linha of exemplos) {
    const valor = JSON.parse(linha) as Record<string, unknown>;
    const ps = valor.registro === "imovel" ? examinarImovel(valor, { agora: AGORA }) : validarJsonl(linha, { agora: AGORA }).problemas.filter((p) => p.campo !== "total_enviados");
    assert.deepEqual(ps, [], `${String(valor.registro)}: ${mensagens(ps)}`);
  }
  const bloco = /### A\.4[\s\S]*?```json\n([\s\S]*?)```/.exec(ANEXOS)?.[1];
  assert.ok(bloco, "o exemplo do relatório no Anexo A.4");
  assert.deepEqual(validarEsquema(JSON.parse(bloco), carregarEsquema("relatorio-leiloeiros")), []);
  const anexoB = secao(ANEXOS, "## Anexo B", "## Anexo C");
  const slugs = [...anexoB.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual([...slugs].sort(), [...TAGS.map((t) => t.slug)].sort());
});

test("o prompt cabe num chat (até 25 mil caracteres), aponta os anexos e pede todos os entregáveis", () => {
  const arquivo = lerAqui("PROMPT-AUDITORIA.md");
  const inicio = arquivo.indexOf("===== COPIE DAQUI =====");
  const fim = arquivo.indexOf("===== ATÉ AQUI =====");
  assert.ok(inicio > 0 && fim > inicio, "marcadores do trecho a colar");
  const prompt = arquivo.slice(inicio, fim);
  assert.ok(prompt.length <= 25_000, `prompt com ${prompt.length} caracteres`);
  assert.ok(!prompt.includes("## Anexo A"), "os anexos ficam no arquivo à parte");
  assert.match(prompt, /ANEXOS-LUNETA\.md/);
  assert.match(arquivo.slice(0, inicio), /ANEXOS-PROMPT\.md[\s\S]*ANEXOS-LUNETA\.md/, "o como usar diz como salvar os anexos");
  for (const entregavel of ["RELATORIO-LEILOEIROS.md", "inventario.csv", "relatorio-leiloeiros.json", "amostra-luneta.jsonl", "validacao.txt", "matriz-tags.csv", "PLANO-ATUALIZACAO.md", "README-CODIGO.md", "LEIA-ME.md", "ESTADO.md"]) {
    assert.ok(prompt.includes(entregavel), `o prompt não pede ${entregavel}`);
  }
  // as paradas para o OK do dono
  assert.match(prompt, /Pare e peça o OK do dono\*\* antes de: instalar programa; abrir páginas na internet/);
  assert.match(prompt, /Pare e mostre o plano de reforma/);
  // "risco zero" só na regra que o proíbe
  assert.equal(prompt.split("risco zero").length - 1, 1);
});

// ---------------------------------------------------------------------------
// Relatório a partir do JSONL
// ---------------------------------------------------------------------------

test("relatório do JSONL: segue o esquema, ordena por ativos e soma os totais", () => {
  const r = relatorioDoJsonl(TEXTO, { agora: AGORA });
  conferirRelatorio(r);
  assert.equal(r.origem, "jsonl");
  assert.deepEqual(r.leiloeiros.map((l) => [l.slug, l.ativos]), [["alfa-leiloes", 4], ["beta-leiloes", 3], ["gama-leiloes", 2]]);
  assert.deepEqual(r.totais, { leiloeiros: 3, leiloeiros_com_ativos: 3, ativos: 9, leiloes_ativos: 2, ativos_todas_as_fontes: 9, por_saude: { ok: 2, parcial: 1 } });
  // leilões (eventos) por leiloeiro: a Alfa informa o leilao_id em 2 dos 4 ativos (2 leilões); Beta e Gama não informam
  assert.deepEqual(r.leiloeiros.map((l) => [l.slug, l.leiloes_ativos]), [["alfa-leiloes", 2], ["beta-leiloes", null], ["gama-leiloes", null]]);
  const alfa = r.leiloeiros[0]!;
  assert.equal(alfa.fonte_id, "ll_alfa_leiloes");
  assert.equal(alfa.prefixo_id_site, "ll-alfa-leiloes");
  assert.deepEqual(alfa.por_natureza, { extrajudicial: 3, judicial: 1 });
  assert.deepEqual(alfa.situacao, { ativos_na_fonte: 4, encerrados: 1, removidos: null, praca_vencida: 0, sem_lance: 0 });
  assert.equal(alfa.coleta.saude, "ok");
  assert.equal(alfa.coleta.frequencia, "diaria");
  assert.equal(alfa.coleta.gerado_na_fonte_em, "2026-10-27T01:10:00.000Z");
  assert.equal(alfa.coleta.dias_sem_coleta_valida, 0);
  assert.equal(alfa.repetidos_caixa, null);
  const gama = r.leiloeiros[2]!;
  assert.equal(gama.coleta.saude, "parcial");
  assert.equal(gama.coleta.completa, false);
  assert.match(gama.coleta.erro ?? "", /paginação parou/);
});
