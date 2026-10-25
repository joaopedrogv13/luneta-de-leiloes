/**
 * Página do imóvel: preço do m² na região, imóveis parecidos da base e buscas prontas em portais.
 * PURO (sem fs, sem rede).
 *
 * - Referências de R$/m² (fonte "leiloes"): imóveis do MESMO TIPO na base (outros leilões e vendas, não anúncios
 *   de mercado), sem o próprio imóvel. Cinco recortes, do mais perto ao mais longe: RUA (mesma cidade e mesma
 *   rua normalizada, n ≥ 3), PERTO (até 1 km, n ≥ 5; rodada 6), BAIRRO (n ≥ 5), CIDADE (n ≥ 5) e ESTADO (n ≥ 3);
 *   só entram os recortes com amostra suficiente, e um recorte com os mesmos imóveis do anterior não se repete
 *   (bairro que é a cidade inteira). Cada um traz a média de avaliação/m² sem os 10% de cada ponta (`media`),
 *   mediana e quartis de avaliação/m² e de lance/m², o imóvel e o percentil do lance. A rua sai do endereço
 *   (src/lib/catalogo/lugar.ts) e a lista dos imóveis da mesma rua vem pronta de quem chama (`indiceDeRuas`, montado
 *   uma vez no carregamento por src/lib/catalogo/dados.ts). As referências de preço pago (ITBI) vêm de
 *   src/lib/catalogo/itbi.ts.
 * - PERTO (raio de 1 km): pelas coordenadas do instantâneo, só quando a posição dos DOIS imóveis é a do número
 *   ("exata") ou a da rua ("rua"); posição no bairro ou no centro da cidade erra por quilômetros e não entra. Só a
 *   mesma cidade (o recorte fica dentro da cidade, como a rua e o bairro). Índice em grade de ~1 km por cidade e
 *   tipo, montado uma vez por lista e guardado (`gradePerto`): cada página consulta 9 células, não a base inteira.
 * - `amostrasLeiloes`: quantos imóveis comparáveis cada recorte tem, mesmo abaixo do mínimo (a tela diz "só 2 casas
 *   no bairro (mínimo 5)" em vez de "sem dados"). Ausente o recorte que não se aplica (sem rua, sem bairro,
 *   posição aproximada).
 * - Parecidos: mesmo tipo e mesma cidade, com área ±35% e quartos ±1 (quando os dois têm o dado; fora
 *   dessas faixas não entra); a mesma rua e o mesmo bairro primeiro, depois os com foto, depois os mais próximos
 *   em área, quartos e lance; praça já vencida não entra. Podem ser menos de 6, ou nenhum.
 * - Buscas externas: links de busca do Google com "site:" para os portais (sem API e sem raspagem), em três
 *   níveis: na mesma rua, no mesmo bairro e na cidade (`nivel`).
 */
import { chaveBairro, nomeDaRua, ruaDoEndereco, ruaGenerica } from "./lugar";
import { normalizar, quartosTexto } from "./texto";
import type { AmostrasRegiao, EscopoM2, FaixaM2, ImovelResumo, LinkImovel, PrecisaoGeo, ReferenciaM2, TipoImovel, Vizinhanca } from "./tipos";

export const AMOSTRA_MINIMA_RUA = 3;
export const AMOSTRA_MINIMA_LOCAL = 5;
export const AMOSTRA_MINIMA_UF = 3;
/** Recorte "perto": a mesma amostra mínima do bairro. */
export const AMOSTRA_MINIMA_PERTO = AMOSTRA_MINIMA_LOCAL;
export const MAXIMO_PARECIDOS = 6;
/** Raio do recorte "perto", em metros. */
export const RAIO_PERTO_M = 1000;

/** Rua do imóvel: a chave normalizada (para casar) e o nome como a fonte escreve (para mostrar). */
export interface RuaDoImovel {
  chave: string;
  nome: string;
}

/** O que só quem carregou a base sabe: a rua do imóvel e os imóveis da mesma rua (mesma cidade). */
export interface ContextoVizinhanca {
  rua?: RuaDoImovel | null;
  /** imóveis da mesma rua e cidade (pode incluir o próprio e outros tipos: o filtro é feito aqui) */
  mesmaRua?: readonly ImovelResumo[];
}

/** Percentil (0 a 1) por interpolação linear numa lista ordenada. */
function percentil(ordenados: readonly number[], p: number): number {
  const pos = (ordenados.length - 1) * p;
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  return ordenados[baixo]! + (ordenados[alto]! - ordenados[baixo]!) * (pos - baixo);
}

function faixa(valores: number[]): FaixaM2 | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  return { mediana: Math.round(percentil(v, 0.5)), p25: Math.round(percentil(v, 0.25)), p75: Math.round(percentil(v, 0.75)) };
}

/** Média sem os 10% mais baixos e os 10% mais altos (a mesma conta do ITBI em base/fontes/itbi/agregar.py). */
export function mediaAparada(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const corte = Math.floor(v.length * 0.1);
  const miolo = v.length - 2 * corte > 0 ? v.slice(corte, v.length - corte) : v;
  return Math.round(miolo.reduce((s, x) => s + x, 0) / miolo.length);
}

export const chaveCidade = (t: string | null) => (t === null ? null : normalizar(t).replace(/\s+/g, " ").trim());

/**
 * Chave do índice "mesma rua": UF, cidade e rua; nome de rua que se repete na cidade ("Projetada C", "Rua A",
 * "Rua Três") leva também o bairro (ver `ruaGenerica`), e sem o bairro não tem chave. null sem rua.
 */
export function chaveRuaNaCidade(i: Pick<ImovelResumo, "uf" | "cidade" | "bairro">, rua: string | null): string | null {
  if (!rua) return null;
  if (!ruaGenerica(rua)) return `${i.uf}|${chaveCidade(i.cidade)}|${rua}`;
  const bairro = chaveBairro(i.bairro);
  return bairro === null ? null : `${i.uf}|${chaveCidade(i.cidade)}|${rua}|${bairro}`;
}
/** Compara com um valor já normalizado (o do imóvel da página), sem normalizar duas vezes. */
const igualA = (alvo: string | null, chave: (t: string | null) => string | null) => (t: string | null) =>
  alvo !== null && t !== null && (t === alvo || chave(t) === alvo);

/**
 * Rua de cada imóvel e o índice "mesma rua" por (UF, cidade, rua): montados uma vez no carregamento (21 mil
 * endereços: algumas dezenas de ms). Só entra no índice a rua que aparece em mais de um imóvel.
 */
export function indiceDeRuas(itens: readonly ImovelResumo[], enderecos: readonly (string | null)[]) {
  const ruas: (RuaDoImovel | null)[] = itens.map((_, k) => {
    const endereco = enderecos[k] ?? null;
    const chave = ruaDoEndereco(endereco);
    return chave && endereco ? { chave, nome: nomeDaRua(endereco) } : null;
  });
  const grupos = new Map<string, ImovelResumo[]>();
  itens.forEach((i, k) => {
    const chave = chaveRuaNaCidade(i, ruas[k]?.chave ?? null);
    if (chave === null) return;
    const g = grupos.get(chave);
    if (g) g.push(i);
    else grupos.set(chave, [i]);
  });
  for (const [chave, g] of grupos) if (g.length < 2) grupos.delete(chave);
  const contexto = (k: number): ContextoVizinhanca => {
    const rua = ruas[k] ?? null;
    const chave = rua ? chaveRuaNaCidade(itens[k]!, rua.chave) : null;
    return { rua, mesmaRua: (chave && grupos.get(chave)) || [] };
  };
  return { ruas, contexto };
}

function mesmosImoveis(a: readonly ImovelResumo[], b: readonly ImovelResumo[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((i) => i.id));
  return b.every((i) => ids.has(i.id));
}

// ---------------------------------------------------------------------------
// Perto (raio de 1 km): índice em grade por cidade e tipo
// ---------------------------------------------------------------------------

/** Posições que valem para o raio: a do número e a da rua (bairro e cidade erram por quilômetros). */
const PRECISOES_PERTO: ReadonlySet<PrecisaoGeo> = new Set(["exata", "rua"]);

/** A posição do imóvel serve para o recorte "perto" (no número ou na rua, com coordenadas)? */
export function posicaoParaRaio(i: Pick<ImovelResumo, "lat" | "lon" | "precisaoGeo">): boolean {
  return i.precisaoGeo !== null && PRECISOES_PERTO.has(i.precisaoGeo) && Number.isFinite(i.lat) && Number.isFinite(i.lon) && i.lat !== null && i.lon !== null;
}

const RAIO_TERRA_M = 6_371_008.8;
const RAD = Math.PI / 180;

/** Distância em metros entre dois pontos (haversine). */
export function distanciaM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Metros por grau de latitude. */
const M_POR_GRAU = RAIO_TERRA_M * RAD;
/**
 * Lado da célula (m): um pouco maior que o raio, para as 9 células em volta cobrirem o círculo mesmo com a projeção da
 * cidade (o cosseno da latitude média) um pouco diferente da do ponto, em cidades grandes.
 */
const CELULA_M = RAIO_PERTO_M * 1.1;

interface GrupoGrade {
  /** cosseno da latitude média do grupo (a projeção plana da cidade) */
  cos: number;
  celulas: Map<string, ImovelResumo[]>;
}

const celula = (lat: number, lon: number, cos: number): [number, number] => [Math.floor((lat * M_POR_GRAU) / CELULA_M), Math.floor((lon * M_POR_GRAU * cos) / CELULA_M)];
const chaveGrupo = (i: Pick<ImovelResumo, "uf" | "cidade" | "tipo">) => `${i.uf}|${chaveCidade(i.cidade)}|${i.tipo}`;

/** As grades já montadas, por lista (a lista do conjunto é a mesma a cada página: monta uma vez). */
const grades = new WeakMap<readonly ImovelResumo[], Map<string, GrupoGrade>>();

/**
 * Índice em grade dos imóveis com posição para o raio, por UF, cidade e tipo (células de ~1,1 km). Montado uma vez por
 * lista e guardado (21 mil imóveis: alguns ms); `imoveisPerto` consulta só as 9 células em volta.
 */
export function gradePerto(itens: readonly ImovelResumo[]): Map<string, GrupoGrade> {
  const pronta = grades.get(itens);
  if (pronta) return pronta;
  const porGrupo = new Map<string, ImovelResumo[]>();
  for (const i of itens) {
    if (!posicaoParaRaio(i)) continue;
    const k = chaveGrupo(i);
    const g = porGrupo.get(k);
    if (g) g.push(i);
    else porGrupo.set(k, [i]);
  }
  const grade = new Map<string, GrupoGrade>();
  for (const [k, lista] of porGrupo) {
    const cos = Math.cos((lista.reduce((s, i) => s + i.lat!, 0) / lista.length) * RAD);
    const celulas = new Map<string, ImovelResumo[]>();
    for (const i of lista) {
      const [y, x] = celula(i.lat!, i.lon!, cos);
      const c = `${y}|${x}`;
      const l = celulas.get(c);
      if (l) l.push(i);
      else celulas.set(c, [i]);
    }
    grade.set(k, { cos, celulas });
  }
  grades.set(itens, grade);
  return grade;
}

/**
 * Os imóveis do mesmo tipo e da mesma cidade a até 1 km deste (sem ele), com posição no número ou na rua dos dois
 * lados; null quando a posição DESTE imóvel não serve para o raio (o recorte não se aplica).
 */
export function imoveisPerto(imovel: ImovelResumo, itens: readonly ImovelResumo[], raioM: number = RAIO_PERTO_M): ImovelResumo[] | null {
  if (!posicaoParaRaio(imovel)) return null;
  const g = gradePerto(itens).get(chaveGrupo(imovel));
  if (!g) return [];
  const [y, x] = celula(imovel.lat!, imovel.lon!, g.cos);
  const alcanceY = Math.ceil(raioM / CELULA_M);
  // a leste e a oeste, a célula mede CELULA_M × cos(latitude deste) / cos(latitude média do grupo): quase sempre ~1,1 km,
  // mas um ponto do grupo geocodificado longe (outra latitude) muda a média; aí a conta pede mais colunas, e nenhum
  // vizinho a até 1 km fica de fora (revisão da rodada 6)
  const ladoX = (CELULA_M * Math.cos(imovel.lat! * RAD)) / g.cos;
  const alcanceX = Math.ceil(raioM / ladoX);
  const saida: ImovelResumo[] = [];
  for (let dy = -alcanceY; dy <= alcanceY; dy++) {
    for (let dx = -alcanceX; dx <= alcanceX; dx++) {
      for (const i of g.celulas.get(`${y + dy}|${x + dx}`) ?? []) {
        if (i.id !== imovel.id && distanciaM(imovel.lat!, imovel.lon!, i.lat!, i.lon!) <= raioM) saida.push(i);
      }
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Recortes
// ---------------------------------------------------------------------------

interface Recorte {
  escopo: EscopoM2;
  nome: string;
  lista: ImovelResumo[];
  minimo: number;
  /** o recorte se aplica a este imóvel? (sem rua conhecida, sem bairro ou com posição aproximada, não) */
  aplica: boolean;
}

/** Os cinco recortes dos leilões (rua, perto, bairro, cidade, UF), com as listas de imóveis comparáveis. */
function recortesLeiloes(imovel: ImovelResumo, itens: readonly ImovelResumo[], contexto: ContextoVizinhanca): Recorte[] {
  const comparavel = (i: ImovelResumo) => i.tipo === imovel.tipo && i.uf === imovel.uf && i.id !== imovel.id && i.lanceM2 !== null;
  const doTipo = itens.filter(comparavel);
  const daCidade = igualA(chaveCidade(imovel.cidade), chaveCidade);
  const doBairro = igualA(chaveBairro(imovel.bairro), chaveBairro);
  const naCidade = doTipo.filter((i) => daCidade(i.cidade));
  const noBairro = imovel.bairro ? naCidade.filter((i) => doBairro(i.bairro)) : [];
  const rua = contexto.rua ?? null;
  const naRua = rua ? (contexto.mesmaRua ?? []).filter((i) => comparavel(i) && daCidade(i.cidade)) : [];
  const perto = imoveisPerto(imovel, itens);
  const lugar = `${imovel.cidade}/${imovel.uf}`;
  return [
    { escopo: "rua", nome: `${rua?.nome}, ${lugar}`, lista: naRua, minimo: AMOSTRA_MINIMA_RUA, aplica: rua !== null },
    { escopo: "perto", nome: `Até 1 km, ${lugar}`, lista: (perto ?? []).filter(comparavel), minimo: AMOSTRA_MINIMA_PERTO, aplica: perto !== null },
    { escopo: "bairro", nome: `${imovel.bairro}, ${lugar}`, lista: noBairro, minimo: AMOSTRA_MINIMA_LOCAL, aplica: !!imovel.bairro },
    { escopo: "cidade", nome: lugar, lista: naCidade, minimo: AMOSTRA_MINIMA_LOCAL, aplica: true },
    { escopo: "uf", nome: imovel.uf, lista: doTipo, minimo: AMOSTRA_MINIMA_UF, aplica: true },
  ];
}

/** Quantos imóveis comparáveis cada recorte que se aplica tem (com ou sem o mínimo). */
function amostrasDe(recortes: readonly Recorte[]): AmostrasRegiao {
  const saida: AmostrasRegiao = {};
  for (const r of recortes) if (r.aplica) saida[r.escopo] = r.lista.length;
  return saida;
}

/** Quantos imóveis comparáveis da base cada recorte tem (rua, perto, bairro, cidade, UF), mesmo abaixo do mínimo. */
export function amostrasLeiloes(imovel: ImovelResumo, itens: readonly ImovelResumo[], contexto: ContextoVizinhanca = {}): AmostrasRegiao {
  return amostrasDe(recortesLeiloes(imovel, itens, contexto));
}

/** Referências de R$/m² para o imóvel (rua, perto, bairro, cidade, UF), do recorte mais local ao mais amplo. */
export function referenciasM2(imovel: ImovelResumo, itens: readonly ImovelResumo[], contexto: ContextoVizinhanca = {}): ReferenciaM2[] {
  return referenciasDosRecortes(imovel, recortesLeiloes(imovel, itens, contexto));
}

function referenciasDosRecortes(imovel: ImovelResumo, recortes: readonly Recorte[]): ReferenciaM2[] {
  const saida: ReferenciaM2[] = [];
  let anterior: ImovelResumo[] | null = null;
  for (const r of recortes) {
    if (!r.aplica || r.lista.length < r.minimo) continue;
    // os mesmos imóveis do recorte anterior não acrescentam nada (bairro = cidade inteira; rua = bairro; perto = rua).
    // A rua não está dentro do bairro (uma avenida passa por vários), nem o raio: por isso compara os imóveis, não só a
    // quantidade.
    if (anterior && mesmosImoveis(anterior, r.lista)) continue;
    anterior = r.lista;
    const lances = r.lista.map((i) => i.lanceM2!);
    const avaliacoes = r.lista.flatMap((i) => (i.avaliacaoM2 === null ? [] : [i.avaliacaoM2]));
    const comAvaliacao = avaliacoes.length >= r.minimo;
    saida.push({
      escopo: r.escopo,
      fonte: "leiloes",
      nome: r.nome,
      tipo: imovel.tipo,
      amostra: r.lista.length,
      media: comAvaliacao ? mediaAparada(avaliacoes) : null,
      avaliacaoM2: comAvaliacao ? faixa(avaliacoes) : null,
      lanceM2: faixa(lances),
      imovel: { avaliacaoM2: imovel.avaliacaoM2, lanceM2: imovel.lanceM2 },
      percentilLance: imovel.lanceM2 === null ? null : Math.round((100 * lances.filter((x) => x > imovel.lanceM2!).length) / lances.length),
    });
  }
  return saida;
}

/** Praça vencida há mais de 1 dia (a busca também esconde esses; ver consulta.ts). */
const vencido = (i: ImovelResumo, agora: number) => i.dataPraca !== null && Date.parse(i.dataPraca) < agora - 24 * 3600 * 1000;

/** Até 6 imóveis parecidos, do mais parecido ao menos; nunca o próprio nem um de praça já vencida. */
export function parecidos(
  imovel: ImovelResumo,
  itens: readonly ImovelResumo[],
  maximo: number = MAXIMO_PARECIDOS,
  agora: Date = new Date(),
  mesmaRua: readonly ImovelResumo[] = [],
): ImovelResumo[] {
  const daCidade = igualA(chaveCidade(imovel.cidade), chaveCidade);
  const doBairro = igualA(chaveBairro(imovel.bairro), chaveBairro);
  const naRua = new Set(mesmaRua.map((i) => i.id));
  const t = agora.getTime();
  const candidatos = itens.filter((i) => i.id !== imovel.id && i.tipo === imovel.tipo && i.uf === imovel.uf && daCidade(i.cidade) && !vencido(i, t));
  const dentroDasFaixas = (i: ImovelResumo) =>
    (imovel.area === null || i.area === null || Math.abs(i.area - imovel.area) <= 0.35 * imovel.area) &&
    (imovel.quartos === null || i.quartos === null || Math.abs(i.quartos - imovel.quartos) <= 1);
  const distancia = (i: ImovelResumo) =>
    (imovel.area !== null && i.area !== null ? Math.abs(Math.log(i.area / imovel.area)) : 0.5) +
    (imovel.quartos !== null && i.quartos !== null ? 0.25 * Math.abs(i.quartos - imovel.quartos) : 0.25) +
    0.5 * Math.abs(Math.log(i.lance / imovel.lance));
  const pontuar = (i: ImovelResumo) => ({
    i,
    perto: naRua.has(i.id) ? 0 : doBairro(i.bairro) ? 1 : 2,
    foto: i.foto ? 0 : 1,
    d: distancia(i),
  });
  // Fora das faixas não é "parecido": melhor mostrar menos (ou nenhum) do que um de 200 m² ao lado de um de 50 m².
  return candidatos
    .filter(dentroDasFaixas)
    .map(pontuar)
    .sort((a, b) => a.perto - b.perto || a.foto - b.foto || a.d - b.d || (a.i.id < b.i.id ? -1 : 1))
    .slice(0, maximo)
    .map((p) => p.i);
}

const PORTAIS: readonly { site: string; nome: string }[] = [
  { site: "zapimoveis.com.br", nome: "Zap Imóveis" },
  { site: "vivareal.com.br", nome: "Viva Real" },
  { site: "olx.com.br", nome: "OLX" },
  { site: "quintoandar.com.br", nome: "QuintoAndar" },
  { site: "imovelweb.com.br", nome: "Imovelweb" },
];

const TIPO_NA_BUSCA: Record<TipoImovel, string> = {
  apartamento: "apartamento",
  casa: "casa",
  terreno: "terreno",
  comercial: "imóvel comercial",
  rural: "imóvel rural",
  outro: "imóvel",
};

export type NivelBusca = "rua" | "bairro" | "cidade";

const ONDE: Record<NivelBusca, string> = { rua: "na mesma rua", bairro: "no mesmo bairro", cidade: "na cidade" };

/**
 * "apartamento 2 quartos à venda Centro Uberlândia MG" (sem quartos em terreno, comercial, rural e outro).
 * Nível "rua": com o nome da rua antes do bairro; "cidade": sem bairro.
 */
export function consultaExterna(
  i: Pick<ImovelResumo, "tipo" | "quartos" | "bairro" | "cidade" | "uf">,
  nivel: NivelBusca = "bairro",
  rua: string | null = null,
): string {
  const comQuartos = (i.tipo === "apartamento" || i.tipo === "casa") && i.quartos !== null && i.quartos > 0;
  const onde = nivel === "cidade" ? [] : nivel === "rua" ? [rua, i.bairro] : [i.bairro];
  return [TIPO_NA_BUSCA[i.tipo], comQuartos ? quartosTexto(i.quartos!) : null, "à venda", ...onde, i.cidade, i.uf].filter(Boolean).join(" ");
}

/**
 * Buscas prontas no Google, por nível (rua, quando a rua é conhecida; bairro, quando há bairro; cidade), cada
 * uma com os 5 portais e uma busca geral. Só links: nada é consultado daqui.
 */
export function buscasExternas(
  i: Pick<ImovelResumo, "tipo" | "quartos" | "bairro" | "cidade" | "uf">,
  rua: RuaDoImovel | null = null,
): (LinkImovel & { nivel: NivelBusca })[] {
  const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  const niveis: NivelBusca[] = [...(rua ? (["rua"] as const) : []), ...(i.bairro ? (["bairro"] as const) : []), "cidade"];
  return niveis.flatMap((nivel) => {
    const consulta = consultaExterna(i, nivel, rua?.nome ?? null);
    const onde = ONDE[nivel];
    return [
      ...PORTAIS.map((p) => ({
        tipo: "outro" as const,
        rotulo: p.nome,
        url: google(`${consulta} site:${p.site}`),
        descricao: `Anúncios ${onde} no ${p.nome} (busca no Google)`,
        nivel,
      })),
      { tipo: "outro" as const, rotulo: "Google", url: google(consulta), descricao: `Busca geral por anúncios ${onde}`, nivel },
    ];
  });
}

/** Tudo da vizinhança de uma vez. Os parecidos saem como estão na lista: o plano é aplicado por quem chama. */
export function vizinhanca(imovel: ImovelResumo, itens: readonly ImovelResumo[], agora: Date = new Date(), contexto: ContextoVizinhanca = {}): Vizinhanca {
  const rua = contexto.rua ?? null;
  const recortes = recortesLeiloes(imovel, itens, contexto);
  return {
    referencias: referenciasDosRecortes(imovel, recortes),
    amostrasLeiloes: amostrasDe(recortes),
    parecidos: parecidos(imovel, itens, MAXIMO_PARECIDOS, agora, rua ? (contexto.mesmaRua ?? []) : []),
    buscasExternas: buscasExternas(imovel, rua),
  };
}
