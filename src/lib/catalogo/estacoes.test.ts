/**
 * Estação de metrô, trem e VLT perto (rodada 5, decisão 11): textos da tag, leitura das colunas do arquivo do OSM, a tag
 * no resumo e no detalhe (com a evidência), o filtro "Metrô a até 1 km" (contagem, URL, plano Lente) e os dados reais.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buscar, criarIndice } from "./consulta";
import {
  distanciaCurta, estacoesComTag, fraseEstacao, LIMITE_TAG_M, rotuloTagEstacao, ROTULO_FILTRO_METRO, SLUG_ESTACAO, tagDetalheEstacao,
  tagsDeEstacoes, temMetroPerto, type EstacaoPerto,
} from "./estacoes";
import { pilulas, removerFiltro } from "./filtros-rotulos";
import { lerLista, pastaPadrao } from "./instantaneo";
import {
  conferirArquivoLocalizacao, contextoEstacoes, estacoesDe, lerLocalizacao, montarLocalizacao,
  type ArquivoLocalizacao, type ArquivoLocalizacaoOsm, type DadosLocalizacao,
} from "./localizacao";
import { filtrosDoPlano, paraPlano } from "./planos";
import type { Busca, Filtros, ImovelResumo } from "./tipos";
import { contarFiltros, escreverBusca, lerBusca } from "./url";

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

test("textos: rótulo da tag, frase da seção e distância de 10 em 10 m", () => {
  const metro: EstacaoPerto = { modo: "metro", distanciaM: 450, nome: "Botafogo" };
  assert.equal(rotuloTagEstacao(metro), "Metrô a 450 m");
  assert.equal(fraseEstacao(metro), "Estação de metrô Botafogo a 450 m");
  assert.equal(fraseEstacao({ ...metro, nome: null }), "Estação de metrô a 450 m");
  assert.equal(fraseEstacao({ ...metro, monotrilho: true, nome: "Oratório" }), "Estação de monotrilho Oratório a 450 m");
  assert.equal(rotuloTagEstacao({ modo: "trem", distanciaM: 990 }), "Trem a 990 m");
  assert.equal(rotuloTagEstacao({ modo: "vlt", distanciaM: 0 }), "VLT a 10 m");
  assert.equal(fraseEstacao({ modo: "vlt", distanciaM: 20, nome: "Emmerich" }), "Estação de VLT Emmerich a 20 m");
  assert.equal(distanciaCurta(1240), "1,2 km");
  assert.equal(ROTULO_FILTRO_METRO, "Metrô a até 1 km");
});

test("tags: só abaixo de 1 km, na ordem metrô, trem, VLT, positivas e confirmadas", () => {
  const lista: EstacaoPerto[] = [
    { modo: "vlt", distanciaM: 300, nome: "Carioca" },
    { modo: "trem", distanciaM: LIMITE_TAG_M, nome: "Central" }, // 1 km exato: fora
    { modo: "metro", distanciaM: 990, nome: "Cinelândia" },
  ];
  assert.deepEqual(estacoesComTag(lista).map((e) => e.modo), ["metro", "vlt"]);
  const tags = tagsDeEstacoes(lista);
  assert.deepEqual(tags, [
    { slug: "metro-perto", rotulo: "Metrô a 990 m", severidade: "positivo", emRevisao: false },
    { slug: "vlt-perto", rotulo: "VLT a 300 m", severidade: "positivo", emRevisao: false },
  ]);
  assert.equal(temMetroPerto(tags), true);
  assert.equal(temMetroPerto(tagsDeEstacoes([{ modo: "trem", distanciaM: 200, nome: null }])), false);
});

test("detalhe da tag: confiança pela precisão, evidência com a estação, a regra e a fonte (ODbL)", () => {
  const e: EstacaoPerto = { modo: "metro", distanciaM: 450, nome: "Botafogo" };
  const numero = tagDetalheEstacao(e, "numero", "2026-10-23T20:20:51Z");
  assert.equal(numero.confianca, "alta");
  assert.equal(numero.origem, "osm");
  assert.match(numero.evidencia!, /Estação de metrô Botafogo a 450 m, em linha reta do ponto do endereço/);
  assert.match(numero.evidencia!, /OpenStreetMap \(© contribuidores do OpenStreetMap, ODbL, dados de 23\/10\/2026\)/);
  const rua = tagDetalheEstacao(e, "rua", null);
  assert.equal(rua.confianca, "media");
  assert.match(rua.evidencia!, /meio da rua/);
  assert.doesNotMatch(rua.evidencia!, /risco zero|garant/i);
});

// ---------------------------------------------------------------------------
// Arquivo do OSM com as colunas das estações
// ---------------------------------------------------------------------------

function dados(): DadosLocalizacao {
  const ids = ["caixa-1", "caixa-2", "caixa-3"];
  const principal: ArquivoLocalizacao = {
    formato: "luneta-localizacao", versao: 1, gerado_em: "2026-10-18",
    pesos: { servicos: 25, transporte: 20, renda: 20, infra: 25, comercio: 5, lazer: 5 },
    situacoes: ["calculada", "aproximada", "sem_nota"], motivos: ["cidade"], precisoes: ["numero", "rua", "bairro", "cidade"],
    renda: { variavel: "V06006", rotulo: "renda típica", valores: "R$ de 2022" }, fontes: [],
    colunas: {
      id: ids, situacao: [0, 0, 1], motivo: [null, null, null], nota: [70, 60, 40], faixa_min: [null, null, 30], faixa_max: [null, null, 50],
      precisao: [0, 1, 2], desvio_m: [10, 300, 1200], lat: [-22.95, -22.9, -22.8], lon: [-43.18, -43.2, -43.3], cidade: [3304557, 3304557, 3304557],
      c_servicos: [70, 60, 40], c_renda: [70, 60, 40], c_infra: [70, 60, 40], c_comercio: [70, 60, 40], incompleto_renda: [0, 0, 0], risco_m: [null, null, null],
    },
  };
  const osm: ArquivoLocalizacaoOsm = {
    formato: "luneta-localizacao-osm", versao: 1, gerado_em: "2026-10-18", licenca: "ODbL-1.0",
    aviso: "Contém dados do OpenStreetMap, © contribuidores do OpenStreetMap; ODbL.", dados_osm_de: "2026-10-17T20:20:51Z", com_osm: true,
    fonte: { nome: "OpenStreetMap", detalhe: "estações, pontos de ônibus, parques e praças", licenca: "ODbL 1.0", url: "https://www.openstreetmap.org/copyright" },
    colunas: {
      id: ids, c_transporte: [80, 70, 50], c_lazer: [50, 50, 50],
      // imóvel 1: metrô a 450 m (Botafogo) e trem a 1,4 km; imóvel 2: VLT a 300 m sem nome; imóvel 3 (bairro): nada
      metro_m: [450, 1600, null], metro_nome: [0, 1, null], metro_mono: [null, null, null],
      trem_m: [1400, null, null], trem_nome: [2, null, null],
      vlt_m: [null, 300, null], vlt_nome: [null, null, null],
    },
    cidades: {},
    estacoes: { dados_osm_de: "2026-10-23T20:20:51Z", nomes: ["Botafogo", "Uruguai", "Central do Brasil"], limite_m: 2000, tag_m: 1000 },
  };
  return {
    principal, osm, cidades: null,
    posicao: new Map(ids.map((id, k) => [id, k])), posicaoOsm: new Map(ids.map((id, k) => [id, k])), recusados: [],
  };
}

test("leitura: só o que vira tag (abaixo de 1 km), com o nome; até 2 km com `todas`; a precisão e a data para a evidência", () => {
  const d = dados();
  assert.deepEqual(estacoesDe(d, "caixa-1"), [{ modo: "metro", distanciaM: 450, nome: "Botafogo" }]);
  assert.deepEqual(estacoesDe(d, "caixa-1", { todas: true }).map((e) => e.modo), ["metro", "trem"]);
  assert.deepEqual(estacoesDe(d, "caixa-2"), [{ modo: "vlt", distanciaM: 300, nome: null }]);
  assert.deepEqual(estacoesDe(d, "caixa-3"), []);
  assert.deepEqual(estacoesDe(d, "nao-existe"), []);
  assert.deepEqual(contextoEstacoes(d, "caixa-2"), { precisao: "rua", dadosOsmDe: "2026-10-23T20:20:51Z" });
  // arquivo antigo, sem as colunas: nada
  assert.deepEqual(estacoesDe({ ...d, osm: { ...d.osm!, estacoes: undefined } }, "caixa-1"), []);
});

test("seção de localização: a estação entra na LocalizacaoImovel e a fonte do OSM cita as duas datas", () => {
  const d = dados();
  const loc = montarLocalizacao(d, "caixa-1", { cidade: "Rio de Janeiro", uf: "RJ" })!;
  assert.deepEqual(loc.estacoes, [{ modo: "metro", distanciaM: 450, nome: "Botafogo" }]);
  const osm = loc.fontes.find((f) => f.nome === "OpenStreetMap")!;
  assert.match(osm.detalhe, /dados de 17\/10\/2026; estações de metrô, trem e VLT, de 23\/10\/2026/);
  assert.equal(montarLocalizacao(d, "caixa-3", { cidade: "Rio de Janeiro", uf: "RJ" })!.estacoes, undefined);
});

test("conferência: lista de nomes inválida recusa o arquivo do OSM; sem a lista, o arquivo vale (antigo)", () => {
  const d = dados();
  assert.equal(conferirArquivoLocalizacao(d.osm, "luneta-localizacao-osm"), null);
  assert.equal(conferirArquivoLocalizacao({ ...d.osm, estacoes: undefined }, "luneta-localizacao-osm"), null);
  assert.match(conferirArquivoLocalizacao({ ...d.osm, estacoes: { dados_osm_de: null, nomes: [1, 2] } }, "luneta-localizacao-osm")!, /nomes/);
  // coluna de nome com texto (em vez do índice) também é recusada: as colunas são só números
  assert.match(
    conferirArquivoLocalizacao({ ...d.osm, colunas: { ...d.osm!.colunas, metro_nome: ["Botafogo", null, null] } }, "luneta-localizacao-osm")!,
    /metro_nome/,
  );
});

// ---------------------------------------------------------------------------
// Filtro "Metrô a até 1 km"
// ---------------------------------------------------------------------------

const AGORA = new Date("2026-10-14T15:00:00Z");

function imovel(id: string, tags: ImovelResumo["tags"]): ImovelResumo {
  return {
    id, titulo: "Apartamento", tipo: "apartamento", uf: "RJ", cidade: "Rio de Janeiro", bairro: "Centro", lat: -22.9, lon: -43.2, precisaoGeo: "exata",
    area: 60, areaTerreno: null, quartos: 2, vagas: 1, avaliacao: 300000, lance: 200000, desagio: 33, lanceM2: 3333, avaliacaoM2: 5000,
    modalidade: "venda_direta", modalidadeFonte: null, praca: "unica", dataPraca: null, financiamento: true, fgts: null, parcelamento: null,
    ocupacao: null, judicial: false, fonte: { id: "caixa_csv", nome: "Caixa" }, foto: null, totalFotos: 0, selo: 0, seloPendente: false,
    tags, coletadoEm: "2026-10-12", notaLocal: null,
  };
}

const ITENS = [
  imovel("caixa-a", tagsDeEstacoes([{ modo: "metro", distanciaM: 450, nome: "Botafogo" }])),
  imovel("caixa-b", tagsDeEstacoes([{ modo: "metro", distanciaM: 800, nome: "Flamengo" }, { modo: "trem", distanciaM: 300, nome: "Central" }])),
  imovel("caixa-c", tagsDeEstacoes([{ modo: "trem", distanciaM: 200, nome: "Méier" }])),
  imovel("caixa-d", []),
];
const IX = criarIndice(ITENS);
const busca = (filtros: Filtros, plano: Busca["plano"] = "luneta"): Busca => ({ conjunto: "previa", plano, filtros, ordem: "desagio", pagina: 1, porPagina: 96 });

test("filtro: só os com metrô a menos de 1 km; a contagem com os outros filtros; Lente ignora e não vê a contagem", () => {
  const todos = buscar(IX, busca({}), { agora: AGORA });
  assert.equal(todos.total, 4);
  assert.equal(todos.facetas.metroPerto, 2);
  const comMetro = buscar(IX, busca({ metroPerto: true }), { agora: AGORA });
  assert.deepEqual(comMetro.itens.map((i) => i.id).sort(), ["caixa-a", "caixa-b"]);
  assert.equal(comMetro.facetas.metroPerto, 2);
  // com outro filtro (só os com trem), a contagem do metrô acompanha
  const comTrem = buscar(IX, busca({ comTags: [SLUG_ESTACAO.trem] }), { agora: AGORA });
  assert.equal(comTrem.total, 2);
  assert.equal(comTrem.facetas.metroPerto, 1);
  // a faceta de tags tem o rótulo fixo, não o "Metrô a 450 m" do primeiro imóvel
  const metroFaceta = todos.facetas.tags.find((t) => t.valor === SLUG_ESTACAO.metro)!;
  assert.equal(metroFaceta.rotulo, "Metrô a até 1 km");
  assert.equal(metroFaceta.total, 2);
  // Lente: o filtro avançado é ignorado, a contagem não sai e as tags não chegam
  const lente = buscar(IX, busca({ metroPerto: true }, "lente"), { agora: AGORA });
  assert.equal(lente.total, 4);
  assert.equal(lente.facetas.metroPerto, undefined);
  assert.ok(lente.itens.every((i) => i.tags.length === 0));
  assert.deepEqual(filtrosDoPlano({ metroPerto: true }, "lente"), {});
  assert.equal(paraPlano(ITENS[0]!, "lente").tags.length, 0);
});

test("URL, contagem e pílula do filtro", () => {
  const p = escreverBusca({ filtros: { metroPerto: true } });
  assert.equal(p.get("metro"), "1");
  assert.deepEqual(lerBusca(p).filtros, { metroPerto: true });
  assert.deepEqual(lerBusca(new URLSearchParams("metro=0")).filtros, {});
  assert.deepEqual(lerBusca(new URLSearchParams("metro=sim")).filtros, {});
  assert.equal(contarFiltros({ metroPerto: true, uf: ["RJ"] }), 2);
  assert.deepEqual(pilulas({ metroPerto: true }).map((x) => x.rotulo), ["Metrô a até 1 km"]);
  assert.deepEqual(removerFiltro({ metroPerto: true, uf: ["RJ"] }, "metro"), { uf: ["RJ"] });
});

test("um estado só para o metrô: comTags=metro-perto vira metro=1; trem e VLT com o próprio nome na pílula (R5P-03)", () => {
  // link antigo, de quando a tag aparecia também em "Riscos › Só imóveis com"
  assert.deepEqual(lerBusca(new URLSearchParams("comTags=metro-perto")).filtros, { metroPerto: true });
  assert.deepEqual(lerBusca(new URLSearchParams("comTags=metro-perto&comTags=desocupado&metro=1")).filtros, { comTags: ["desocupado"], metroPerto: true });
  // a busca dá o mesmo com a tag e com o filtro (as duas contam o mesmo: metrô a menos de 1 km)
  const pelaTag = buscar(IX, busca(lerBusca(new URLSearchParams("comTags=metro-perto")).filtros), { agora: AGORA });
  assert.equal(pelaTag.total, buscar(IX, busca({ metroPerto: true }), { agora: AGORA }).total);
  // as pílulas: uma por filtro, sem duplicar o metrô; trem e VLT sem o "Com:"
  assert.deepEqual(
    pilulas({ metroPerto: true, comTags: [SLUG_ESTACAO.trem, SLUG_ESTACAO.vlt, "desocupado"] }).map((x) => x.rotulo),
    ["Metrô a até 1 km", "Trem a até 1 km", "VLT a até 1 km", "Com: Desocupado"],
  );
});

// ---------------------------------------------------------------------------
// Dados reais (base/saida/site)
// ---------------------------------------------------------------------------

test("dados reais: as colunas estão no arquivo do OSM, só para número ou rua, e as distâncias da tag ficam abaixo de 1 km", async () => {
  const d = await lerLocalizacao();
  if (!d.osm?.estacoes) return; // instantâneo sem as estações (antes da rodada 5)
  assert.equal(d.recusados.length, 0);
  const lista = await lerLista(pastaPadrao());
  let comTag = 0;
  for (const i of lista.itens) {
    const est = estacoesDe(d, i.id);
    if (!est.length) continue;
    comTag++;
    assert.ok(est.every((e) => e.distanciaM >= 0 && e.distanciaM < 1000), i.id);
    const { precisao } = contextoEstacoes(d, i.id);
    assert.ok(precisao === "numero" || precisao === "rua", `${i.id}: ${precisao}`);
  }
  // a medição de 24/10/2026 deu 907 imóveis com pelo menos uma das três tags
  assert.ok(comTag > 500 && comTag < 2000, String(comTag));
});
