/**
 * Vitrine da demonstração (/assinante): o critério (vitrine.ts), a montagem do conjunto (conjuntos.ts › montarVitrine),
 * a página de cada imóvel pelo conjunto de origem (pagina.ts), os textos (vitrine-textos.ts) e as fotos ilustrativas dos
 * exemplos (sempre rotuladas). Roda com dados sintéticos (sempre) e com o instantâneo real (pula se base/saida/site não
 * estiver aqui).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createJiti } from "jiti";
import type { Listing } from "../../content/examples";
import { buscar } from "./consulta";
import { carregarExemplos, carregarPrevia, montarVitrine } from "./conjuntos";
import { pastaPadrao } from "./instantaneo";
import { lerItbi } from "./itbi";
import { dadosLocalizacao, moradoresDe } from "./localizacao";
import { montarPaginaImovel } from "./pagina";
import { estiloRecorte } from "./recorte";
import type { ImovelResumo } from "./tipos";
import {
  contarAtivos,
  escolherVitrine,
  ETAPAS_VITRINE,
  medianasAvaliacao,
  motivoFora,
  pontosVitrine,
  precoClaro,
  VITRINE_MAX_POR_UF,
  VITRINE_QUANTOS,
} from "./vitrine";
import { FOTOS_RECUSADAS } from "./vitrine-fotos";
import { areaVitrine, COMO_ESCOLHEMOS, CTA_VITRINE, faixaVitrine, fraseFiltrosVitrine, fraseImovelVitrine, fraseParecidosFora, fraseVitrine } from "./vitrine-textos";

const AGORA = new Date("2026-10-24T15:00:00Z");
const PASTA = pastaPadrao();
const TEM_PREVIA = existsSync(join(PASTA, "imoveis.json.gz"));

async function listings(): Promise<Listing[]> {
  const jiti = createJiti(__filename, { alias: { "@/": `${join(process.cwd(), "src")}/` } });
  return (await jiti.import<{ LISTINGS: Listing[] }>(join(process.cwd(), "src", "content", "examples.ts"))).LISTINGS;
}

let seq = 0;
/** Um imóvel que passa em todas as regras da etapa estrita (cada teste muda só o que quer testar). */
function imovel(p: Partial<ImovelResumo> = {}): ImovelResumo {
  seq++;
  const avaliacao = p.avaliacao ?? 400_000;
  const lance = p.lance ?? 200_000;
  const area = p.area === undefined ? 80 : p.area;
  return {
    id: `caixa-${String(seq).padStart(13, "0")}`,
    titulo: "Apartamento 2 quartos",
    tipo: "apartamento",
    uf: "SP",
    cidade: `Cidade ${seq}`,
    bairro: "Centro",
    lat: -23.5,
    lon: -46.6,
    precisaoGeo: "exata",
    area,
    areaTerreno: null,
    quartos: 2,
    vagas: 1,
    avaliacao,
    lance,
    desagio: Math.round(100 * (1 - lance / avaliacao)),
    lanceM2: area ? Math.round(lance / area) : null,
    avaliacaoM2: area ? Math.round(avaliacao / area) : null,
    modalidade: "venda_direta",
    modalidadeFonte: "Venda Direta Online",
    praca: "unica",
    dataPraca: null,
    financiamento: true,
    fgts: null,
    parcelamento: null,
    ocupacao: null,
    judicial: false,
    fonte: { id: "caixa_csv", nome: "Caixa" },
    foto: "https://venda-imoveis.caixa.gov.br/fotos/F000000000000021.jpg",
    totalFotos: 1,
    selo: 0,
    seloPendente: true,
    tags: [],
    coletadoEm: "2026-10-08",
    notaLocal: 85,
    ...p,
  };
}
const MUITOS = () => 1_000_000;

test("vitrine: cada regra da etapa estrita tira o imóvel pelo motivo certo", () => {
  const r = ETAPAS_VITRINE[0]!;
  const fora = (p: Partial<ImovelResumo>) => motivoFora(imovel(p), r, AGORA, undefined, MUITOS);
  assert.equal(fora({}), null, "o imóvel padrão passa");
  assert.equal(fora({ foto: null }), "sem foto");
  assert.equal(fora({ tags: [{ slug: "preco-acima-mercado", rotulo: "Lance acima da avaliação", severidade: "grave", emRevisao: true }] }), "tag grave", "grave em revisão também tira");
  assert.equal(fora({ modalidade: "leilao", praca: null, modalidadeFonte: "Leilão SFI - Edital Único" }), "preço sem praça");
  assert.equal(fora({ modalidade: "leilao", praca: "2" }), null, "leilão com a praça informada tem preço claro");
  assert.equal(fora({ dataPraca: "2026-10-20T17:00:00Z" }), "praça passada");
  assert.equal(fora({ dataPraca: "2026-11-20T17:00:00Z" }), null, "praça ainda por vir");
  assert.equal(fora({ lance: 350_000 }), "deságio fora da faixa", "deságio de 13%");
  assert.equal(fora({ lance: 60_000, avaliacao: 400_000 }), "deságio fora da faixa", "deságio de 85% (absurdo)");
  assert.equal(fora({ lance: 30_000, avaliacao: 60_000 }), "lance fora da faixa");
  assert.equal(fora({ area: null }), "sem área");
  assert.equal(fora({ area: 2000 }), "R$/m² fora do padrão", "apartamento de R$ 100/m²");
  assert.equal(fora({ precisaoGeo: "bairro" }), "endereço impreciso");
  assert.equal(fora({ precisaoGeo: "rua" }), null);
  assert.equal(fora({ notaLocal: 60 }), "nota de localização baixa");
  assert.equal(fora({ notaLocal: null }), "nota de localização baixa");
  assert.equal(motivoFora(imovel(), r, AGORA, undefined, () => 120_000), "cidade pequena");
  assert.equal(motivoFora(imovel(), r, AGORA, undefined, () => null), "cidade pequena", "sem o dado de moradores não entra na etapa estrita");
  assert.equal(motivoFora(imovel(), r, AGORA), null, "sem a função de moradores, a regra não vale");
  assert.equal(fora({ fonte: { id: "exemplo", nome: "Exemplo fictício" } }), "exemplo fictício");
  const recusada = Object.keys(FOTOS_RECUSADAS)[0]!;
  assert.equal(fora({ id: recusada }), "foto recusada");
  // avaliação inflada: o R$/m² da avaliação muito acima da mediana do lugar
  const lugar = Array.from({ length: 6 }, () => imovel({ cidade: "Igual", avaliacao: 320_000, lance: 200_000 }));
  const inflado = imovel({ cidade: "Igual", avaliacao: 900_000, lance: 400_000 });
  const med = medianasAvaliacao([...lugar, inflado]);
  assert.equal(motivoFora(inflado, r, AGORA, med, MUITOS), "avaliação acima do lugar");
  assert.equal(motivoFora(lugar[0]!, r, AGORA, med, MUITOS), null);
});

test("vitrine: preço claro e pontuação", () => {
  assert.equal(precoClaro({ modalidade: "venda_online", praca: null }), true);
  assert.equal(precoClaro({ modalidade: "leilao", praca: null }), false);
  assert.equal(precoClaro({ modalidade: "outro", praca: "unica" }), true);
  // deságio + nota ÷ 2 + 3 no número
  assert.equal(pontosVitrine(imovel({ lance: 192_000, avaliacao: 400_000, notaLocal: 90 })), 52 + 45 + 3);
  assert.equal(pontosVitrine(imovel({ lance: 192_000, avaliacao: 400_000, notaLocal: 90, precisaoGeo: "rua" })), 52 + 45);
});

test("vitrine: a melhor pontuação primeiro, com variedade de estado, cidade e tipo", () => {
  const itens: ImovelResumo[] = [];
  // 8 apartamentos ótimos em SP (cidades diferentes), 3 em RJ, 3 em MG; casas em PR, SC e numa cidade só da BA
  for (let k = 0; k < 8; k++) itens.push(imovel({ uf: "SP", lance: 160_000 - k * 1000 }));
  for (let k = 0; k < 3; k++) itens.push(imovel({ uf: "RJ", lance: 180_000 }));
  for (let k = 0; k < 3; k++) itens.push(imovel({ uf: "MG", lance: 190_000 }));
  for (let k = 0; k < 3; k++) itens.push(imovel({ uf: "PR", tipo: "casa", lance: 195_000 }));
  for (let k = 0; k < 3; k++) itens.push(imovel({ uf: "SC", tipo: "casa", lance: 196_000 }));
  for (let k = 0; k < 3; k++) itens.push(imovel({ uf: "BA", tipo: "casa", cidade: "Salvador", lance: 150_000 }));
  for (let k = 0; k < 4; k++) itens.push(imovel({ uf: ["PE", "CE", "GO", "RS"][k]!, tipo: "comercial", titulo: "Sala", quartos: null, lance: 120_000 }));
  for (let k = 0; k < 2; k++) itens.push(imovel({ uf: ["DF", "MT"][k]!, tipo: "terreno", titulo: "Terreno", quartos: null, area: 400, lance: 210_000 }));
  const v = escolherVitrine(itens, { agora: AGORA, moradores: MUITOS });
  assert.equal(v.length, VITRINE_QUANTOS);
  const porUf = new Map<string, number>();
  for (const e of v) porUf.set(e.item.uf, (porUf.get(e.item.uf) ?? 0) + 1);
  assert.ok([...porUf.values()].every((n) => n <= VITRINE_MAX_POR_UF), "no máximo 2 por estado");
  assert.equal(new Set(v.map((e) => `${e.item.uf}|${e.item.cidade}`)).size, v.length, "uma por cidade");
  assert.equal(v.filter((e) => e.item.uf === "BA").length, 1, "Salvador entra uma vez só");
  assert.ok(v.filter((e) => e.item.tipo === "apartamento").length <= 4, "no máximo 4 apartamentos");
  assert.equal(v.filter((e) => e.item.tipo === "comercial").length, 1, "1 sala ou loja");
  assert.equal(v.filter((e) => e.item.tipo === "terreno").length, 1, "1 terreno");
  assert.ok(v.some((e) => e.item.tipo === "casa"));
  // ordem: pontuação decrescente
  for (let k = 1; k < v.length; k++) assert.ok(v[k - 1]!.pontos >= v[k]!.pontos);
  assert.ok(v.every((e) => e.etapa === 0 && e.motivo.includes("deságio")));
  // determinística
  assert.deepEqual(escolherVitrine(itens, { agora: AGORA, moradores: MUITOS }).map((e) => e.item.id), v.map((e) => e.item.id));
});

test("vitrine: com poucos imóveis bons, as regras afrouxadas completam (e dizem a etapa)", () => {
  const itens = [
    imovel({ uf: "SP" }),
    imovel({ uf: "RJ", notaLocal: 62 }), // etapa 1
    imovel({ uf: "MG", precisaoGeo: "bairro", notaLocal: null, lance: 280_000 }), // etapa 2 (deságio 30%)
    imovel({ uf: "PR", foto: null }), // nunca
    imovel({ uf: "BA", tags: [{ slug: "ocupado", rotulo: "Ocupado", severidade: "grave", emRevisao: false }] }), // nunca
  ];
  const v = escolherVitrine(itens, { agora: AGORA, moradores: MUITOS });
  assert.deepEqual(v.map((e) => [e.item.uf, e.etapa]), [["SP", 0], ["RJ", 1], ["MG", 2]]);
  assert.match(v[2]!.motivo, /etapa 2/);
  assert.deepEqual(escolherVitrine([], { agora: AGORA }), []);
});

test("vitrine: contagem de ativos (o N de \"10 de N\") tira as praças vencidas há mais de um dia", () => {
  const itens = [imovel(), imovel({ dataPraca: "2026-10-24T10:00:00Z" }), imovel({ dataPraca: "2026-10-20T10:00:00Z" })];
  assert.equal(contarAtivos(itens, AGORA), 2);
});

test("vitrine: textos", () => {
  assert.equal(fraseVitrine(10, 21230), "Você está vendo 10 de 21.230 imóveis reais da base.");
  assert.equal(CTA_VITRINE, "Para ver todos, com filtros, mapa e alertas, assine.");
  assert.equal(fraseFiltrosVitrine(2, 10, 1234), "Com estes filtros: 2 dos 10 aqui e 1.234 imóveis na base completa.");
  assert.equal(fraseFiltrosVitrine(0, 10, 1), "Com estes filtros: nenhum dos 10 aqui e 1 imóvel na base completa.");
  assert.equal(areaVitrine(10, 21230), "Área do assinante · vitrine com 10 de 21.230 imóveis reais");
  assert.match(faixaVitrine(10).completa, /^Demonstração · 10 imóveis reais da base/);
  assert.equal(fraseImovelVitrine(10, 21230), "Este é um dos 10 imóveis reais da vitrine, de 21.230 imóveis na base.");
  assert.equal(fraseParecidosFora(6, 6), "Na base completa há pelo menos 6 imóveis parecidos com este, fora da vitrine.");
  assert.equal(fraseParecidosFora(1, 6), "Na base completa há 1 imóvel parecido com este, fora da vitrine.");
  const todos = [fraseVitrine(10, 21230), CTA_VITRINE, ...COMO_ESCOLHEMOS].join(" ");
  assert.doesNotMatch(todos, /vendendo|risco zero|garant/i);
});

test("fotos ilustrativas dos exemplos: uma por caso, sempre rotuladas, recorte válido e de imóvel real compatível", async () => {
  const ls = await listings();
  assert.equal(ls.length, 6);
  const ficticios = carregarExemplos(ls, AGORA);
  const urls = new Set<string>();
  for (const l of ls) {
    const f = l.photoIlustrativa;
    assert.ok(f, `${l.id}: tem foto ilustrativa`);
    assert.equal(l.photo, undefined, `${l.id}: exemplo fictício não tem foto própria`);
    assert.equal(f.url, `https://venda-imoveis.caixa.gov.br/fotos/F${f.de.replace("caixa-", "")}21.jpg`, `${l.id}: a URL é a da foto do imóvel "de"`);
    assert.ok(!urls.has(f.url), `${l.id}: uma foto diferente por caso`);
    urls.add(f.url);
    if (f.recorte) assert.ok(estiloRecorte(f.recorte), `${l.id}: recorte com zoom`);
    const i = ficticios.itens.find((x) => x.id === `ex-${l.id}`)!;
    assert.equal(i.fotoIlustrativa, true, `${l.id}: o resumo rotula a foto`);
    assert.deepEqual(i.fotoRecorte ?? null, f.recorte ?? null);
  }
  // o mapa não leva a foto ilustrativa (na miniatura não cabe o rótulo)
  const r = buscar(ficticios.indice, { conjunto: "exemplos", plano: "luneta", filtros: {}, ordem: "desagio", pagina: 1 }, { agora: AGORA });
  assert.ok(r.mapa.every((p) => p.destaques.every((d) => d.foto === null)));
  assert.equal(estiloRecorte(null), undefined);
  assert.equal(estiloRecorte({ escala: 1, origem: "left bottom" }), undefined);
  assert.deepEqual(estiloRecorte({ escala: 1.3, origem: "left bottom" }), { transform: "scale(1.3)", transformOrigin: "left bottom" });

  if (!TEM_PREVIA) return;
  // com a base: cada foto é de um imóvel real do mesmo tipo, da mesma UF, sem tag grave e fora da vitrine
  const previa = await carregarPrevia(PASTA);
  for (const l of ls) {
    const k = previa.posicao.get(l.photoIlustrativa!.de);
    assert.ok(k !== undefined, `${l.id}: o imóvel da foto está na base (${l.photoIlustrativa!.de})`);
    const real = previa.itens[k]!;
    assert.equal(real.tipo, l.type, `${l.id}: mesmo tipo`);
    assert.equal(real.uf, l.uf, `${l.id}: mesma UF`);
    assert.equal(real.foto, l.photoIlustrativa!.url, `${l.id}: a foto é a dele`);
    assert.ok(!real.tags.some((t) => t.severidade === "grave"), `${l.id}: o imóvel real não tem tag grave`);
  }
});

test("vitrine com o instantâneo real: 10 imóveis que passam no critério estrito, a lista só com eles e a página de cada um", { skip: !TEM_PREVIA }, async () => {
  const [previa, loc, ls, itbi] = await Promise.all([carregarPrevia(PASTA), dadosLocalizacao(), listings(), lerItbi()]);
  const ficticios = carregarExemplos(ls, AGORA);
  const d = montarVitrine(previa, ficticios, { agora: AGORA, moradores: (i) => moradoresDe(loc, i.id) });
  const v = d.vitrine!;
  assert.equal(v.escolhidos.length, VITRINE_QUANTOS);
  const ids = new Set(v.escolhidos.map((e) => e.item.id));
  for (const { item: i, etapa } of v.escolhidos) {
    assert.equal(etapa, 0, `${i.id}: critério estrito`);
    assert.ok(i.foto && !FOTOS_RECUSADAS[i.id], `${i.id}: com foto boa`);
    assert.ok(!i.tags.some((t) => t.severidade === "grave"), `${i.id}: sem tag grave`);
    assert.ok(i.precisaoGeo === "exata" || i.precisaoGeo === "rua", `${i.id}: endereço no número ou na rua`);
    assert.ok((i.notaLocal ?? 0) >= 70, `${i.id}: nota`);
    assert.ok(i.desagio! >= 35 && i.desagio! <= 75, `${i.id}: deságio`);
    assert.ok((moradoresDe(loc, i.id) ?? 0) >= 300_000, `${i.id}: cidade grande`);
  }
  const porUf = new Map<string, number>();
  for (const e of v.escolhidos) porUf.set(e.item.uf, (porUf.get(e.item.uf) ?? 0) + 1);
  assert.ok([...porUf.values()].every((n) => n <= 2));

  // a lista (índice) só com os reais; a posição e a página valem também para os fictícios
  assert.equal(d.indice.n, VITRINE_QUANTOS);
  assert.equal(d.itens.length, VITRINE_QUANTOS + ls.length);
  const r = buscar(d.indice, { conjunto: "exemplos", plano: "luneta", filtros: {}, ordem: "desagio", pagina: 1 }, { agora: AGORA, selosDesligados: d.selosDesligados });
  assert.equal(r.total, VITRINE_QUANTOS);
  assert.ok(r.itens.every((i) => ids.has(i.id)));
  const sp = buscar(d.indice, { conjunto: "exemplos", plano: "luneta", filtros: { uf: ["SP"] }, ordem: "desagio", pagina: 1 }, { agora: AGORA });
  assert.ok(sp.total <= 2, "filtros valem só dentro da vitrine");
  const naBase = buscar(previa.indice, { conjunto: "previa", plano: "luneta", filtros: { uf: ["SP"] }, ordem: "desagio", pagina: 1, porPagina: 1 }, { agora: AGORA, mapa: false, facetas: false });
  assert.ok(naBase.total > 100, "a base inteira tem muito mais");
  assert.equal(contarAtivos(previa.itens, AGORA), naBase.totalConjunto);

  // página de um real: dados da base inteira (região, nota), parecidos só da vitrine, e o convite
  const real = v.escolhidos[0]!.item;
  const pagina = (await montarPaginaImovel(d, real.id, "luneta", itbi, AGORA))!;
  assert.equal(pagina.imovel.id, real.id);
  assert.equal(pagina.selosDesligados, true, "selos da base real em análise");
  assert.deepEqual(pagina.vitrine, { mostrados: VITRINE_QUANTOS, totalBase: contarAtivos(previa.itens, AGORA) });
  assert.ok(pagina.vizinhanca.parecidos.every((p) => d.posicao.has(p.id)), "parecido sem página na demonstração não aparece");
  assert.ok(typeof pagina.vizinhanca.parecidosForaDaVitrine === "number");
  assert.ok(pagina.localizacao && pagina.localizacao.situacao === "calculada", "nota da base inteira");
  // página de um fictício: os exemplos (selos ligados, foto ilustrativa), sem o convite da vitrine
  const ex = (await montarPaginaImovel(d, "ex-alvo-sp", "luneta", itbi, AGORA))!;
  assert.equal(ex.selosDesligados, false);
  assert.equal(ex.imovel.fotoIlustrativa, true);
  assert.equal(ex.vitrine, undefined);
  assert.equal(await montarPaginaImovel(d, "caixa-0000000000000", "luneta", itbi, AGORA), null, "fora da vitrine: 404 na demonstração");
  // o Lente continua sem nada da Luneta, também no imóvel real da vitrine
  const lente = (await montarPaginaImovel(d, real.id, "lente", itbi, AGORA))!;
  assert.equal(lente.localizacao, null);
  assert.deepEqual(lente.imovel.tags, []);
  assert.deepEqual(lente.vizinhanca.referencias, []);
});
