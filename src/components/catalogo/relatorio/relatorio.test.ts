/**
 * Relatório em PDF: o que ele escreve sobre o imóvel, as premissas (com o padrão ao lado do que mudou), a
 * comparação com a região e as regras da página impressa. Os números da simulação são os de `simulacaoCompleta`
 * (testados em src/lib/simulador); aqui se confere que o relatório usa a mesma conta e escreve certo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ImovelDetalhe, ReferenciaM2 } from "../../../lib/catalogo/tipos";
import { simulacaoCompleta } from "../../../lib/simulador/completa";
import { ESTADO_INICIAL, type EstadoSimulador } from "../../../lib/simulador/estado";
import {
  AVISO_SIMULADOR_REL,
  capaImovel,
  compararRel,
  cssPaginas,
  dataCurtaRel,
  dataHoraExtensa,
  diferencaRel,
  entradaDoImovel,
  linhaLocal,
  logradouroRel,
  nomesRetirados,
  premissasUsadas,
  regiaoRel,
  registroRel,
  stringCss,
  tituloDocumento,
} from "./dados";

/** A casa de São Gonçalo/RJ do pedido do dono (venda direta, sem ficha lida ainda). */
const casa: ImovelDetalhe = {
  id: "caixa-1444419640129",
  titulo: "Casa 3 quartos",
  tipo: "casa",
  uf: "RJ",
  cidade: "São Gonçalo",
  bairro: "Tribobo",
  lat: null,
  lon: null,
  precisaoGeo: "cidade",
  area: 93.6,
  areaTerreno: 235,
  quartos: 3,
  vagas: 1,
  avaliacao: 251_000,
  lance: 25_100,
  desagio: 90,
  lanceM2: 268,
  avaliacaoM2: 2682,
  modalidade: "venda_direta",
  modalidadeFonte: "Venda Direta Online",
  praca: "unica",
  dataPraca: null,
  financiamento: false,
  fgts: null,
  parcelamento: null,
  ocupacao: null,
  judicial: false,
  fonte: { id: "caixa_csv", nome: "Caixa" },
  foto: "https://venda-imoveis.caixa.gov.br/fotos/F144441964012921.jpg",
  totalFotos: 1,
  selo: 0,
  seloPendente: true,
  coletadoEm: "2026-10-12",
  notaLocal: null,
  tags: [
    { slug: "desagio-alto", rotulo: "Deságio alto", severidade: "positivo", emRevisao: false, confianca: "alta", origem: "campo:preco", evidencia: null },
    { slug: "ocupado", rotulo: "Ocupado", severidade: "grave", emRevisao: true, confianca: "baixa", origem: "descricao", evidencia: "…ocupado…" },
  ],
  endereco: "Rua Expedicionario Benoni Falcao Gouveia, N. 338, Lt 28, Qd 08",
  areaTotal: null,
  areaPrivativa: 93.6,
  descricao: null,
  fotos: [],
  pracas: [],
  matricula: null,
  cartorio: null,
  numeroProcesso: null,
  leiloeiro: null,
  comitente: null,
  links: [{ tipo: "anuncio", rotulo: "Anúncio na Caixa", url: "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=1444419640129" }],
  condicoesPagamento: null,
  geradoNaFonteEm: "2026-10-08",
  porQueSelo: "",
  registro: {
    situacao: "pendente",
    matriculas: [],
    cartorio: null,
    comarca: null,
    oficio: null,
    inscricaoImobiliaria: null,
    averbacaoLeiloesNegativos: null,
    paginaFonte: "https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=1444419640129",
    lidoEm: null,
  },
};

const ref = (r: Partial<ReferenciaM2> & Pick<ReferenciaM2, "escopo" | "nome" | "amostra">): ReferenciaM2 => ({
  tipo: "casa",
  avaliacaoM2: { mediana: 3000, p25: 2500, p75: 3500 },
  lanceM2: { mediana: 1500, p25: 1200, p75: 1800 },
  imovel: { avaliacaoM2: 2682, lanceM2: 268 },
  percentilLance: 99,
  ...r,
});

test("entrada do simulador: o mesmo recorte da página do imóvel (tags só com slug e revisão)", () => {
  const e = entradaDoImovel(casa);
  assert.equal(e.id, casa.id);
  assert.equal(e.lance, 25_100);
  assert.equal(e.avaliacao, 251_000);
  assert.deepEqual(e.tags, [
    { slug: "desagio-alto", emRevisao: false },
    { slug: "ocupado", emRevisao: true },
  ]);
});

test("matrícula: ficha ainda não lida aponta a página da fonte, nunca 'não informada pela fonte'", () => {
  const f = registroRel(casa);
  assert.match(f.valor, /página do imóvel no site da Caixa/);
  assert.doesNotMatch(f.valor, /não informad/);
  assert.ok(!f.vazio);

  const lido = registroRel({
    ...casa,
    registro: {
      ...casa.registro,
      situacao: "lido",
      matriculas: ["868"],
      comarca: "SÃO GONÇALO-RJ",
      oficio: "06",
      inscricaoImobiliaria: "50334",
      averbacaoLeiloesNegativos: "AVERBADO",
    },
  });
  assert.equal(lido.rotulo, "Matrícula");
  assert.equal(lido.valor, "868");
  // a ficha do pedido do dono: matrícula 868, comarca, ofício 06, inscrição 50334 e averbação dos leilões negativos
  assert.equal(lido.nota, "Comarca de São Gonçalo/RJ · 6º Ofício · inscrição 50334 · leilões negativos: averbado");
  // ficha lida sem matrícula: "não consta na ficha" (a Luneta leu), e não "não informada pela fonte"
  assert.equal(registroRel({ ...casa, registro: { ...casa.registro, situacao: "lido" } }).valor, "não consta na ficha");

  const varias = registroRel({ ...casa, matricula: "13.941", registro: { ...casa.registro, situacao: "na_fonte", matriculas: ["13.941", "13.942"] } });
  assert.equal(varias.rotulo, "Matrículas");
  assert.equal(varias.valor, "13.941 e 13.942");

  const nada = registroRel({ ...casa, registro: { ...casa.registro, situacao: "nao_publica", paginaFonte: null } });
  assert.equal(nada.valor, "a fonte não publica");
  assert.ok(nada.vazio);
  assert.equal(registroRel({ ...casa, registro: { ...casa.registro, situacao: "na_fonte", paginaFonte: null } }).valor, "não informada pela fonte");
});

test("capa: características numa linha, preços e detalhes, com 'não informado pela fonte' no que falta", () => {
  const c = capaImovel(casa);
  assert.equal(c.caracteristicas.join(" · "), "Casa · 93,6 m² de área privativa · 235 m² de terreno · 3 quartos · 1 vaga");
  assert.deepEqual(
    c.precos.map((p) => [p.rotulo, p.valor, p.nota ?? null]),
    [
      ["Avaliação", "R$ 251.000", null],
      ["Preço de venda", "R$ 25.100", "R$ 268/m²"],
      ["Deságio", "90%", "abaixo da avaliação"],
      ["Praça", "Praça única", "data não informada pela fonte"],
    ],
  );
  const detalhes = Object.fromEntries(c.detalhes.map((d) => [d.rotulo, d.valor]));
  assert.equal(detalhes.Modalidade, "Venda direta");
  assert.equal(detalhes.Pagamento, "Não aceita financiamento");
  assert.equal(detalhes["Ocupação"], "não informada pela fonte");

  const semDados = capaImovel({ ...casa, quartos: null, vagas: null, desagio: null, avaliacao: null, lanceM2: null });
  assert.ok(semDados.caracteristicas.includes("quartos não informados pela fonte"));
  assert.ok(semDados.caracteristicas.includes("vagas não informadas pela fonte"));
  assert.equal(semDados.precos[0]!.valor, "não informada pela fonte");
  assert.equal(semDados.precos[2]!.nota, "sem avaliação para comparar");

  const lanceAcima = capaImovel({ ...casa, desagio: -12 });
  assert.equal(lanceAcima.precos[2]!.valor, "+12%");
  assert.equal(lanceAcima.precos[2]!.nota, "lance acima da avaliação");
});

test("local: o bairro igual à cidade sai, e o lugar não repete a cidade que o endereço já traz", () => {
  assert.deepEqual(linhaLocal(casa), { endereco: casa.endereco, lugar: "Tribobo · São Gonçalo/RJ" });
  assert.deepEqual(linhaLocal({ ...casa, bairro: "São Gonçalo" }).lugar, "São Gonçalo/RJ");
  assert.equal(linhaLocal({ endereco: "Rua José Benedetti, nº 18, São Caetano do Sul/SP", bairro: null, cidade: "São Caetano do Sul", uf: "SP" }).lugar, null);
});

test("datas no horário de Brasília", () => {
  assert.equal(dataHoraExtensa(Date.parse("2026-10-17T18:32:00Z")), "17 de outubro de 2026, 15:32");
  assert.equal(dataCurtaRel("2026-10-12"), "12/10/2026");
  assert.equal(dataCurtaRel("2026-10-17T02:00:00Z"), "16/10/2026");
  assert.equal(dataCurtaRel(null), null);
});

test("premissas: no padrão não há coluna de padrão; o que mudou mostra o padrão, os custos criados e as linhas tiradas", () => {
  const entrada = entradaDoImovel(casa);
  const padrao = premissasUsadas(simulacaoCompleta(entrada, ESTADO_INICIAL));
  assert.ok(padrao.every((g) => g.linhas.every((l) => l.padrao === null && !l.criada && !l.retirada)));
  // sem ocupação confirmada (a tag "ocupado" está em revisão), nada de reserva de desocupação
  const desoc = padrao.flatMap((g) => g.linhas).find((l) => l.rotulo === "Desocupação")!;
  assert.equal(desoc.valor, "sem reserva (a fonte não confirma ocupação)");

  const estado: EstadoSimulador = {
    ...ESTADO_INICIAL,
    ajustes: {
      itbiPct: 0.02,
      itbiBase: "avaliacao",
      prazos: [6, 12, 24, 36],
      custosExtras: [{ id: "laudo1", nome: "Laudo de vistoria", modo: "fixo", valor: 1500 }],
      desligados: ["reserva", "extra:laudo1"],
    },
  };
  const r = simulacaoCompleta(entrada, estado);
  const linhas = premissasUsadas(r).flatMap((g) => g.linhas);
  const itbi = linhas.find((l) => l.rotulo === "ITBI")!;
  assert.equal(itbi.valor, "2% da avaliação");
  assert.equal(itbi.padrao, "3% do lance");
  assert.equal(linhas.find((l) => l.rotulo === "Prazos de venda da tabela")!.padrao, "6, 12, 18 e 24 meses");
  assert.equal(linhas.find((l) => l.rotulo === "Reserva para imprevistos")!.retirada, true);
  const laudo = linhas.find((l) => l.rotulo === "Laudo de vistoria")!;
  assert.equal(laudo.criada, true);
  assert.equal(laudo.retirada, true);
  assert.deepEqual(nomesRetirados(r.modelo.premissas), ["Reserva para imprevistos", "Laudo de vistoria"]);
  // a conta do relatório é a mesma da tela: as linhas somam o lucro
  const soma = r.detalhe!.conta.reduce((t, l) => t + l.valor, 0);
  assert.ok(Math.abs(soma - r.detalhe!.sim.lucro) < 1e-6);
});

test("região: níveis da comparação e a frase com a referência principal (ITBI com compras suficientes, senão leilões)", () => {
  assert.deepEqual(compararRel(70, 100)?.nivel, 0);
  assert.deepEqual(compararRel(71, 100)?.nivel, 1);
  assert.deepEqual(compararRel(91, 100)?.nivel, 2);
  assert.deepEqual(compararRel(109, 100)?.nivel, 2);
  assert.deepEqual(compararRel(110, 100)?.nivel, 3);
  assert.deepEqual(compararRel(130, 100)?.nivel, 4);
  assert.equal(compararRel(null, 100), null);
  assert.equal(diferencaRel(compararRel(69, 100)!), "31% abaixo");
  assert.equal(diferencaRel(compararRel(240, 100)!), "2,4 vezes");
  assert.equal(diferencaRel(compararRel(101, 100)!), "igual");

  const refs = [
    ref({ escopo: "rua", nome: "Rua X, São Gonçalo/RJ", amostra: 3, media: 2000 }),
    ref({ escopo: "bairro", nome: "Tribobo, São Gonçalo/RJ", amostra: 9, media: 3050 }),
    ref({ escopo: "cidade", nome: "São Gonçalo/RJ", amostra: 813 }),
    ref({ escopo: "bairro", nome: "Tribobo, São Gonçalo/RJ", amostra: 120, fonte: "itbi", media: 4000, periodo: ["2025-09-01", "2026-08-31"], lanceM2: null }),
  ];
  const r = regiaoRel(casa, refs);
  assert.deepEqual(
    r.leiloes.map((l) => [l.escopo, l.media]),
    [
      ["rua", 2000],
      ["bairro", 3050],
      ["cidade", 3000],
    ],
  );
  assert.equal(r.itbi.length, 1);
  assert.equal(r.itbi[0]!.periodo, "set/2025 a ago/2026");
  // o bairro tem 120 compras registradas (ITBI): a frase usa o preço pago, e os leilões vêm em segunda linha
  assert.equal(r.frase, "A avaliação deste imóvel (R$ 2.682/m²) está 33% abaixo do preço médio pago no bairro (R$ 4.000/m²).");
  assert.equal(r.nivel, 0);
  assert.equal(r.fontePrincipal, "itbi");
  // a rua tem só 3 imóveis em leilão: a segunda linha usa o bairro
  assert.equal(r.fraseLeiloes, "Entre os imóveis em leilão, a avaliação deste imóvel está 12% abaixo da média de avaliação do bairro (R$ 3.050/m², 9 imóveis).");
  // sem o ITBI: a frase volta à média de leilões mais local com 5 ou mais imóveis
  const semItbi = regiaoRel(casa, refs.slice(0, 3));
  assert.equal(semItbi.frase, "A avaliação deste imóvel (R$ 2.682/m²) está 12% abaixo da média do bairro (R$ 3.050/m²).");
  assert.equal(semItbi.nivel, 1);
  assert.equal(semItbi.fraseLeiloes, null);

  // a tabela dos leilões tem sempre os quatro recortes; o estado sem média diz por quê
  assert.deepEqual(
    r.recortes.map((c) => [c.escopo, c.linha?.media ?? null, c.falta]),
    [
      ["rua", 2000, null],
      ["bairro", 3050, null],
      ["cidade", 3000, null],
      ["uf", null, "os mesmos imóveis da cidade"],
    ],
  );
  // sem rua nem bairro na base: o lugar vem do endereço e o motivo é a falta de imóveis (ou de bairro na fonte)
  const so2 = regiaoRel({ ...casa, bairro: "São Gonçalo" }, [refs[2]!]);
  assert.deepEqual(
    so2.recortes.map((c) => [c.escopo, c.lugar, c.falta]),
    [
      ["rua", "Rua Expedicionario Benoni Falcao Gouveia", "menos de 3 imóveis do mesmo tipo em leilão"],
      ["bairro", null, "a fonte não informa o bairro"],
      ["cidade", "São Gonçalo/RJ", null],
      ["uf", "Rio de Janeiro", "os mesmos imóveis da cidade"],
    ],
  );
  assert.equal(regiaoRel({ ...casa, endereco: null }, [refs[2]!]).recortes[0]!.falta, "a fonte não informa a rua");
  assert.equal(logradouroRel("R. das Perolas, N. 1109, Cs 13"), "R. das Perolas");
  assert.equal(logradouroRel(", 123"), null);

  // só ITBI: compara com o preço pago
  const so = regiaoRel(casa, [refs[3]!]);
  assert.equal(so.frase, "A avaliação deste imóvel (R$ 2.682/m²) está 33% abaixo do preço médio pago no bairro (R$ 4.000/m²).");
  // sem área: diz que não dá para comparar por m²
  const semArea = regiaoRel({ ...casa, avaliacaoM2: null, lanceM2: null }, refs);
  assert.match(semArea.frase!, /não informa a área/);
  assert.equal(regiaoRel(casa, []).frase, null);
});

test("página impressa: A4, número de página e textos seguros dentro do CSS", () => {
  const css = cssPaginas({ cabecalho: 'Casa "boa" · São Gonçalo/RJ', rodape: "a</style><b>" });
  assert.match(css, /size: A4/);
  assert.match(css, /counter\(page\) " de " counter\(pages\)/);
  assert.match(css, /@page :first/);
  assert.ok(css.includes('"Casa \\"boa\\" · São Gonçalo/RJ"'));
  assert.ok(!css.includes("</style>"));
  assert.equal(stringCss("a\\b"), '"a\\\\b"');
  assert.equal(tituloDocumento(casa), "Relatório Luneta - Casa em São Gonçalo-RJ - 1444419640129");
});

test("o aviso do simulador no relatório é o mesmo da tela", () => {
  const tela = readFileSync(join(process.cwd(), "src/components/simulador/Simulador.tsx"), "utf8");
  const m = /AVISO_SIMULADOR\s*=\s*"([^"]+)"/.exec(tela);
  assert.ok(m, "AVISO_SIMULADOR não encontrado em Simulador.tsx");
  assert.equal(AVISO_SIMULADOR_REL, m![1]);
});
