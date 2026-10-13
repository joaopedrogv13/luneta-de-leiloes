import { test } from "node:test";
import assert from "node:assert/strict";
import type { Banco } from "./db.ts";
import { calcularDesconto, derivarPracaAtual, garantirFonte, gravarEditais, gravarImoveis, prepararImovel } from "./gravar.ts";
import { carregarImoveis } from "./consultas.ts";
import { bancoEmMemoria, conectorFalso, imovelExemplo, lote } from "./testes/apoio.ts";
import { validarImovel } from "./validar.ts";

const T1 = new Date("2026-10-12T12:00:00Z");
const T2 = new Date("2026-10-13T12:00:00Z");
const T3 = new Date("2026-10-14T12:00:00Z");

function novoBanco(): Banco {
  const db = bancoEmMemoria();
  garantirFonte(db, conectorFalso({ registros: () => [] }), T1);
  return db;
}

function linha(db: Banco, idNaFonte: string) {
  const l = db.prepare("SELECT * FROM imovel WHERE fonte_id = 'falso' AND id_na_fonte = ?").get(idNaFonte);
  assert.ok(l, `imóvel ${idNaFonte} não encontrado`);
  return l;
}

function historico(db: Banco, idNaFonte: string) {
  return db
    .prepare(
      `SELECT h.evento, h.campos, h.preco, h.status FROM preco_historico h JOIN imovel i ON i.id = h.imovel_id
       WHERE i.id_na_fonte = ? ORDER BY h.id`,
    )
    .all(idNaFonte)
    .map((h) => ({ evento: h.evento, campos: h.campos, preco: h.preco, status: h.status }));
}

test("praça atual, preço e desconto derivados", () => {
  const pracas = [
    { numero: 1 as const, data: "2026-10-10T13:00:00.000Z", valor_minimo: 400000 },
    { numero: 2 as const, data: "2026-10-20T13:00:00.000Z", valor_minimo: 240000 },
  ];
  assert.equal(derivarPracaAtual(pracas, T1), 2, "1ª já passou");
  assert.equal(derivarPracaAtual(pracas, new Date("2026-10-01T00:00:00Z")), 1);
  assert.equal(derivarPracaAtual(pracas, new Date("2026-12-01T00:00:00Z")), 2, "todas passaram: a última");
  assert.equal(derivarPracaAtual([{ numero: 0 }], T1), 0);
  assert.equal(derivarPracaAtual([{ numero: 1 }, { numero: 2 }], T1), null, "sem datas e com várias praças: não dá para saber");
  assert.equal(derivarPracaAtual([], T1), null);
  assert.equal(calcularDesconto(240000, 400000), 40);
  assert.equal(calcularDesconto(50074.26, 150000), 66.62);
  assert.equal(calcularDesconto(550000, 500000), -10, "preço acima da avaliação dá desconto negativo");
  assert.equal(calcularDesconto(100, null), null);

  const p = prepararImovel(imovelExemplo({ pracas, preco: undefined }), T1);
  assert.equal(p.linha.praca_atual, 2);
  assert.equal(p.linha.preco, 240000);
  assert.equal(p.linha.desconto_pct, 40);
  assert.equal(p.linha.data_praca, "2026-10-20T13:00:00.000Z");
  assert.equal(p.linha.cep, "04101000");
  assert.equal(p.linha.cidade_norm, "sao-paulo");
  assert.equal(p.linha.chave_endereco, "end:3550308:rua exemplo:100:ap 21");
  // Sem coordenada na fonte: sede do município (base/geo), com precisão "cidade".
  assert.deepEqual([p.linha.lat, p.linha.lon, p.linha.precisao_geo], [-23.5329, -46.6395, "cidade"]);
  assert.equal(p.alertaGeo, null);
  const explicito = prepararImovel(imovelExemplo({ pracas, preco: 300000, praca_atual: 1 }), T1);
  assert.equal(explicito.linha.preco, 300000, "preço informado pelo conector vence");
  assert.equal(explicito.linha.praca_atual, 1);
});

test("praça incerta: não deduz praca_atual, mas a data da praça única segue em data_praca", () => {
  const unica = [{ numero: 0 as const, data: "2026-11-04T13:06:00.000Z", valor_minimo: 871500 }];
  const incerta = prepararImovel(imovelExemplo({ pracas: unica, preco: undefined, praca_atual: null, praca_incerta: true }), T1);
  assert.equal(incerta.linha.praca_atual, null, "não afirma praça única");
  assert.equal(incerta.linha.data_praca, "2026-11-04T13:06:00.000Z");
  assert.equal(incerta.linha.preco, 871500);
  const deduzida = prepararImovel(imovelExemplo({ pracas: unica, preco: undefined, praca_atual: null }), T1);
  assert.equal(deduzida.linha.praca_atual, 0, "sem praca_incerta, o núcleo deduz como antes");
  assert.deepEqual(validarImovel(imovelExemplo({ pracas: unica, praca_incerta: true })), []);
  assert.match(validarImovel(imovelExemplo({ pracas: unica, praca_incerta: true, praca_atual: 0 })).join(";"), /praca_incerta com praca_atual/);
});

test("insere, reconhece inalterado e registra mudança de preço no histórico", () => {
  const db = novoBanco();
  const r1 = gravarImoveis(db, "falso", [imovelExemplo()], { agora: T1 });
  assert.deepEqual([r1.novos, r1.atualizados, r1.inalterados], [1, 0, 0]);
  const l1 = linha(db, "1001");
  assert.equal(l1.status, "ativo");
  assert.equal(l1.primeira_vez_em, T1.toISOString());
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM praca").get()?.n), 2);
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM foto").get()?.n), 1);
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM documento").get()?.n), 1);

  const r2 = gravarImoveis(db, "falso", [imovelExemplo()], { agora: T2 });
  assert.deepEqual([r2.novos, r2.atualizados, r2.inalterados], [0, 0, 1]);
  const l2 = linha(db, "1001");
  assert.equal(l2.ultima_vez_em, T2.toISOString());
  assert.equal(l2.atualizado_em, T1.toISOString(), "sem mudança de conteúdo");
  assert.equal(l2.hash_conteudo, l1.hash_conteudo);

  const pracasNovas = [
    { numero: 1 as const, data: "2026-11-10T13:00:00.000Z", valor_minimo: 380000 },
    { numero: 2 as const, data: "2026-11-24T13:00:00.000Z", valor_minimo: 228000 },
  ];
  const r3 = gravarImoveis(db, "falso", [imovelExemplo({ pracas: pracasNovas })], { agora: T3 });
  assert.equal(r3.atualizados, 1);
  const l3 = linha(db, "1001");
  assert.equal(l3.preco, 380000);
  assert.equal(l3.atualizado_em, T3.toISOString());
  assert.equal(l3.primeira_vez_em, T1.toISOString());
  assert.deepEqual(historico(db, "1001"), [
    { evento: "novo", campos: null, preco: 400000, status: "ativo" },
    { evento: "mudanca", campos: "preco", preco: 380000, status: "ativo" },
  ]);
  assert.deepEqual(
    db.prepare("SELECT valor_minimo FROM praca ORDER BY numero").all().map((p) => p.valor_minimo),
    [380000, 228000],
    "praças refletem o estado atual",
  );
});

test("coleta completa marca removido (sem apagar) e o imóvel pode reaparecer", () => {
  const db = novoBanco();
  gravarImoveis(db, "falso", lote(3), { agora: T1, completa: true });
  const r = gravarImoveis(db, "falso", lote(3).slice(0, 2), { agora: T2, completa: true });
  assert.equal(r.removidos, 1);
  assert.equal(r.remocao, "feita");
  const removido = linha(db, "3");
  assert.equal(removido.status, "removido");
  assert.equal(removido.removido_em, T2.toISOString());
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM imovel").get()?.n), 3, "nada é apagado");

  const r3 = gravarImoveis(db, "falso", lote(3), { agora: T3, completa: true });
  assert.equal(r3.reativados, 1);
  const reativado = linha(db, "3");
  assert.equal(reativado.status, "ativo");
  assert.equal(reativado.removido_em, null);
  assert.deepEqual(historico(db, "3").map((h) => h.evento), ["novo", "removido", "reativado"]);
});

test("coleta parcial não remove; escopo por UF só remove dentro da UF; ids protegidos ficam", () => {
  const db = novoBanco();
  const base = [
    ...lote(2, () => ({ uf: "SP" })),
    imovelExemplo({ id_na_fonte: "rj1", uf: "RJ", cidade: "Rio de Janeiro", url: "https://exemplo.test/rj1" }),
    imovelExemplo({ id_na_fonte: "rj2", uf: "RJ", cidade: "Rio de Janeiro", url: "https://exemplo.test/rj2" }),
  ];
  gravarImoveis(db, "falso", base, { agora: T1, completa: true });

  const parcial = gravarImoveis(db, "falso", [base[0]!], { agora: T2 });
  assert.equal(parcial.removidos, 0);
  assert.equal(parcial.remocao, "nao_pedida");

  const soRj = gravarImoveis(db, "falso", [base[2]!], { agora: T2, completa: true, escopoUf: "RJ" });
  assert.equal(soRj.removidos, 1, "só rj2 sai; os de SP não estavam no escopo");
  assert.equal(linha(db, "rj2").status, "removido");
  assert.equal(linha(db, "2").status, "ativo");

  const protegido = gravarImoveis(db, "falso", [base[0]!], { agora: T3, completa: true, escopoUf: "SP", idsProtegidos: ["2"] });
  assert.equal(protegido.removidos, 0, "o id 2 veio da fonte, só não passou na validação");
});

test("trava de remoção: lista truncada não derruba a base", () => {
  const db = novoBanco();
  gravarImoveis(db, "falso", lote(40), { agora: T1, completa: true });
  const r = gravarImoveis(db, "falso", lote(40).slice(0, 10), { agora: T2, completa: true });
  assert.equal(r.remocao, "bloqueada");
  assert.equal(r.removidos, 0);
  assert.match(r.avisos.join(" "), /30 de 40 ativos \(75%\)/);
  assert.equal(Number(db.prepare("SELECT count(*) AS n FROM imovel WHERE status = 'ativo'").get()?.n), 40);
  const liberada = gravarImoveis(db, "falso", lote(40).slice(0, 10), { agora: T3, completa: true, maxFracaoRemocao: 0.8 });
  assert.equal(liberada.removidos, 30, "o conector pode subir o limite");
});

test("geração mais antiga na fonte nunca sobrescreve, reativa nem remove dado mais novo", () => {
  const db = novoBanco();
  gravarImoveis(db, "falso", lote(4), { agora: T1, completa: true, geradoEm: "2026-10-09" });
  gravarImoveis(db, "falso", lote(4, () => ({ preco: 1000 })).slice(0, 3), { agora: T2, completa: true, geradoEm: "2026-10-10" });
  assert.equal(linha(db, "4").status, "removido");
  const velho = gravarImoveis(db, "falso", lote(4, () => ({ preco: 9999 })), { agora: T3, completa: true, geradoEm: "2026-10-08" });
  assert.equal(velho.antigos, 4);
  assert.equal(velho.atualizados + velho.reativados + velho.removidos, 0);
  assert.equal(linha(db, "1").preco, 1000);
  assert.equal(linha(db, "4").status, "removido");
  assert.equal(linha(db, "1").gerado_na_fonte_em, "2026-10-10");
});

test("fotos: verificação preservada, foto que sumiu sai, reverificar não é mudança de conteúdo", () => {
  const db = novoBanco();
  const fotos = [
    { url: "https://exemplo.test/f1.jpg", origem: "padrao_url", verificada_em: "2026-10-12T10:00:00.000Z", ok: true },
    { url: "https://exemplo.test/f2.jpg", origem: "padrao_url" },
  ];
  gravarImoveis(db, "falso", [imovelExemplo({ fotos })], { agora: T1 });
  const semVerificacao = fotos.map((f) => ({ url: f.url, origem: f.origem }));
  const r = gravarImoveis(db, "falso", [imovelExemplo({ fotos: semVerificacao })], { agora: T2 });
  assert.equal(r.inalterados, 1, "verificação fica fora do hash");
  const f1 = db.prepare("SELECT * FROM foto WHERE url LIKE '%f1.jpg'").get();
  assert.equal(f1?.ok, 1);
  assert.equal(f1?.verificada_em, "2026-10-12T10:00:00.000Z");

  const reverificada = [{ url: "https://exemplo.test/f2.jpg", origem: "padrao_url", verificada_em: "2026-10-13T10:00:00.000Z", ok: false }];
  gravarImoveis(db, "falso", [imovelExemplo({ fotos: reverificada })], { agora: T3 });
  const restantes = db.prepare("SELECT url, ok FROM foto").all();
  assert.deepEqual(restantes.map((f) => [f.url, f.ok]), [["https://exemplo.test/f2.jpg", 0]]);

  const [carregado] = carregarImoveis(db);
  assert.equal(carregado?.fotos[0]?.ok, false);
});

test("LGPD na gravação: HTML limpo, nomes e documentos mascarados", () => {
  const db = novoBanco();
  gravarImoveis(
    db,
    "falso",
    [
      imovelExemplo({
        titulo: "Execução - JOÃO DA SILVA x BANCO EXEMPLO S.A.",
        descricao: "<p>Executado: <b>JOÃO DA SILVA</b>, CPF 123.456.789-09.</p><p>Imóvel ocupado.</p>",
        textos: [{ origem: "edital", texto: "Depositário: Sr. Carlos Alberto Nunes, e-mail carlos@exemplo.com" }],
        comitente: "Credor CNPJ 12.345.678/0001-95",
      }),
    ],
    { agora: T1 },
  );
  const l = linha(db, "1001");
  assert.equal(l.titulo, "Execução - [NOME] x [NOME].");
  assert.equal(l.descricao, "Executado: [NOME], CPF [CPF].\nImóvel ocupado.");
  assert.equal(l.textos, JSON.stringify([{ origem: "edital", texto: "Depositário: Sr. [NOME], e-mail [E-MAIL]" }]));
  assert.equal(l.comitente, "Credor CNPJ [CNPJ]");
  const tudo = JSON.stringify(db.prepare("SELECT * FROM imovel").all());
  for (const proibido of ["JOÃO", "Carlos", "123.456.789", "carlos@"]) assert.ok(!tudo.includes(proibido), proibido);
});

test("registros repetidos no lote: vale o último; status encerrado entra no histórico", () => {
  const db = novoBanco();
  const r = gravarImoveis(db, "falso", [imovelExemplo({ titulo: "Primeiro" }), imovelExemplo({ titulo: "Último" })], { agora: T1 });
  assert.equal(r.duplicados, 1);
  assert.equal(r.novos, 1);
  assert.equal(linha(db, "1001").titulo, "Último");
  gravarImoveis(db, "falso", [imovelExemplo({ titulo: "Último", status: "encerrado" })], { agora: T2 });
  assert.deepEqual(historico(db, "1001").at(-1), { evento: "mudanca", campos: "status", preco: 400000, status: "encerrado" });
});

test("editais do radar: upsert, inalterado e vínculo com imóvel", () => {
  const db = novoBanco();
  gravarImoveis(db, "falso", [imovelExemplo()], { agora: T1 });
  const imovelId = Number(linha(db, "1001").id);
  const edital = {
    registro: "edital" as const,
    id_na_fonte: "pncp-1",
    titulo: "Leilão de imóveis",
    orgao: "Prefeitura Exemplo",
    uf: "SP" as const,
    cidade: "São Paulo",
    publicado_em: "2026-10-01",
    url: "https://exemplo.test/edital/1",
    resumo: "<p>Leilão de imóvel. Executado: JOÃO DA SILVA.</p>",
  };
  const r1 = gravarEditais(db, "falso", [edital, { ...edital, id_na_fonte: "pncp-2", imovel_id: 999999 }], { agora: T1 });
  assert.equal(r1.novos, 2);
  assert.match(r1.avisos.join(" "), /999999 não existe/);
  const r2 = gravarEditais(db, "falso", [edital], { agora: T2 });
  assert.equal(r2.inalterados, 1);
  const r3 = gravarEditais(db, "falso", [{ ...edital, imovel_id: imovelId }], { agora: T3 });
  assert.equal(r3.atualizados, 1);
  const e = db.prepare("SELECT * FROM edital WHERE id_na_fonte = 'pncp-1'").get();
  assert.equal(e?.imovel_id, imovelId);
  assert.equal(e?.resumo, "Leilão de imóvel. Executado: [NOME].");
  assert.equal(e?.cidade_norm, "sao-paulo");
});

test("arquivos do edital: só trocam quando a coleta os consultou; sem consulta, ficam os gravados", () => {
  const db = novoBanco();
  const edital = {
    registro: "edital" as const,
    id_na_fonte: "pncp-9",
    titulo: "Leilão de imóvel",
    url: "https://exemplo.test/edital/9",
    resumo: "Alienação de terreno urbano.",
  };
  const docs = [
    { tipo: "edital" as const, titulo: "Edital do Leilão nº 3/2026", url: "https://exemplo.test/arquivos/1", publicado_em: "2026-10-08" },
    { tipo: "outro" as const, titulo: "Laudo", url: "https://exemplo.test/arquivos/2" },
    { tipo: "outro" as const, titulo: "Repetido", url: "https://exemplo.test/arquivos/2" },
  ];
  const ler = (): unknown => JSON.parse(String(db.prepare("SELECT documentos FROM edital WHERE id_na_fonte = 'pncp-9'").get()?.documentos ?? "null"));

  assert.equal(gravarEditais(db, "falso", [edital], { agora: T1 }).novos, 1);
  assert.equal(ler(), null, "nunca consultados");
  assert.equal(gravarEditais(db, "falso", [{ ...edital, documentos: docs }], { agora: T2 }).atualizados, 1, "só os arquivos mudaram");
  const gravados = [
    { tipo: "edital", titulo: "Edital do Leilão nº 3/2026", url: "https://exemplo.test/arquivos/1", publicado_em: "2026-10-08" },
    { tipo: "outro", titulo: "Laudo", url: "https://exemplo.test/arquivos/2", publicado_em: null },
  ];
  assert.deepEqual(ler(), gravados);
  // Coleta comum, sem consultar os arquivos: nada se perde.
  assert.equal(gravarEditais(db, "falso", [edital], { agora: T3 }).inalterados, 1);
  assert.equal(gravarEditais(db, "falso", [{ ...edital, resumo: "Alienação de terreno urbano com 300 m²." }], { agora: T3 }).atualizados, 1);
  assert.deepEqual(ler(), gravados, "resumo novo não apaga os arquivos");
  assert.equal(gravarEditais(db, "falso", [{ ...edital, documentos: docs }], { agora: T3 }).atualizados, 1, "resumo voltou ao anterior");
  assert.equal(gravarEditais(db, "falso", [{ ...edital, documentos: docs }], { agora: T3 }).inalterados, 1);
  // Consultados e vazios: a fonte tirou os arquivos.
  gravarEditais(db, "falso", [{ ...edital, documentos: [] }], { agora: T3 });
  assert.deepEqual(ler(), []);
});
