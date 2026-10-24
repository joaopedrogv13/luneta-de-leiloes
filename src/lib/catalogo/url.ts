/**
 * Estado da busca na URL (página e API usam o mesmo formato), para o link ser compartilhável e o
 * "voltar" do navegador funcionar. Listas repetem a chave (`uf=MG&uf=SP`); faixas usam chaves próprias
 * (`lanceMin`, `lanceMax`); sim/não é `1`/`0`. Valores desconhecidos são ignorados, nunca quebram a página.
 *
 *   /previa?uf=MG&tipo=apartamento&tipo=casa&lanceMax=300000&ordem=lance-asc&vista=cards&pagina=2
 */
import { NAO_INFORMADO, ORDEM_PADRAO, type CaixaGeo, type Conjunto, type Filtros, type Modalidade, type Ordem, type Plano, type TipoImovel } from "./tipos";
import { lerPlano } from "./planos";

/**
 * Como ver os imóveis. "mapa": o mapa de verdade (ruas, aproximação, "Buscar nesta área") ocupa a tela, com a lista ao
 * lado (computador) ou numa folha embaixo (celular). Só lista e cards ficam salvos como preferência; o mapa é um modo de
 * explorar, aberto pelo botão ou pela URL (`vista=mapa`).
 */
export type Vista = "lista" | "cards" | "mapa";
export const VISTA_PADRAO: Vista = "lista";

/** Câmera do mapa de verdade na URL (`centro=-23.55,-46.63&zoom=12.5`): para voltar e compartilhar. */
export interface CameraMapa {
  lat: number;
  lon: number;
  zoom: number;
}

export interface EstadoBusca {
  filtros: Filtros;
  ordem: Ordem;
  pagina: number;
  /** null = a pessoa ainda não escolheu (o app decide pelo tamanho da tela ou pela preferência salva) */
  vista: Vista | null;
  /** mapa visível? null = padrão da vista */
  mapa: boolean | null;
  plano: Plano;
  /** câmera da vista de mapa (null = enquadra os resultados) */
  camera: CameraMapa | null;
}

const TIPOS: readonly TipoImovel[] = ["apartamento", "casa", "terreno", "comercial", "rural", "outro"];
const MODALIDADES: readonly Modalidade[] = ["leilao", "venda_direta", "venda_online", "licitacao_aberta", "outro"];
const PRACAS = ["1", "2", "unica", NAO_INFORMADO] as const;
const OCUPACOES = ["ocupado", "desocupado", NAO_INFORMADO] as const;
const NATUREZAS = ["judicial", "extrajudicial", NAO_INFORMADO] as const;
const ORDENS: readonly Ordem[] = ["desagio", "lance-asc", "lance-desc", "m2-asc", "area-desc", "data", "alertas", "selo", "localizacao", "recentes"];
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

/** Faixas numéricas: chave na URL = nome do campo em Filtros. */
export const CAMPOS_FAIXA = [
  "lanceMin", "lanceMax", "avaliacaoMin", "avaliacaoMax", "desagioMin", "desagioMax",
  "lanceM2Min", "lanceM2Max", "areaMin", "areaMax", "quartosMin", "vagasMin",
] as const satisfies readonly (keyof Filtros)[];

/** Pares mínimo/máximo das faixas. */
const FAIXAS_PARES = [
  ["lanceMin", "lanceMax"],
  ["avaliacaoMin", "avaliacaoMax"],
  ["desagioMin", "desagioMax"],
  ["lanceM2Min", "lanceM2Max"],
  ["areaMin", "areaMax"],
] as const satisfies readonly (readonly [keyof Filtros, keyof Filtros])[];

export const CAMPOS_SIM_NAO =["financiamento", "fgts", "parcelamento", "comFoto"] as const satisfies readonly (keyof Filtros)[];

type Entrada = URLSearchParams | Record<string, string | string[] | undefined>;

function todos(p: Entrada, chave: string): string[] {
  if (p instanceof URLSearchParams) return p.getAll(chave);
  const v = p[chave];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}
const um = (p: Entrada, chave: string) => todos(p, chave)[0];

function lista<T extends string>(p: Entrada, chave: string, aceitos?: readonly T[] | Set<string>, maximo = 200): T[] | undefined {
  const vistos = new Set<string>();
  for (const bruto of todos(p, chave)) {
    for (const v of bruto.split(",")) {
      const limpo = v.trim();
      if (!limpo || limpo.length > 160) continue;
      if (aceitos && !(aceitos instanceof Set ? aceitos.has(limpo) : (aceitos as readonly string[]).includes(limpo))) continue;
      vistos.add(limpo);
      if (vistos.size >= maximo) break;
    }
  }
  return vistos.size ? ([...vistos] as T[]) : undefined;
}

/** Cidades e bairros têm vírgula? Não nos dados de hoje; mesmo assim só a chave repetida separa listas deles. */
function listaChaves(p: Entrada, chave: string, partes: number): string[] | undefined {
  const saida = new Set<string>();
  for (const v of todos(p, chave)) {
    const limpo = v.trim();
    const pedacos = limpo.split("|");
    if (pedacos.length !== partes || !UFS.has(pedacos[0]) || pedacos.some((x) => !x) || limpo.length > 200) continue;
    saida.add(limpo);
    if (saida.size >= 300) break;
  }
  return saida.size ? [...saida] : undefined;
}

function numero(p: Entrada, chave: string): number | undefined {
  const v = um(p, chave);
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? n : undefined;
}

function simNao(p: Entrada, chave: string): boolean | undefined {
  const v = um(p, chave);
  return v === "1" ? true : v === "0" ? false : undefined;
}

/** "oeste,sul,leste,norte" válido (dentro do globo, com largura e altura) ou undefined. */
function caixa(p: Entrada, chave: string): CaixaGeo | undefined {
  const v = um(p, chave);
  if (!v || v.length > 120) return undefined;
  const n = v.split(",").map((x) => (x.trim() === "" ? NaN : Number(x)));
  if (n.length !== 4 || !n.every(Number.isFinite)) return undefined;
  const [o, s, l, no] = n as CaixaGeo;
  if (o < -180 || l > 180 || s < -90 || no > 90 || !(o < l) || !(s < no)) return undefined;
  return [o, s, l, no];
}

/** "lat,lon" + zoom (0 a 22) válidos, ou null. */
function camera(p: Entrada): CameraMapa | null {
  const c = um(p, "centro");
  const z = numero(p, "zoom");
  if (!c || z === undefined || c.length > 60) return null;
  const [lat, lon, ...resto] = c.split(",").map((x) => (x.trim() === "" ? NaN : Number(x)));
  if (resto.length || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat!) > 85 || Math.abs(lon!) > 180) return null;
  if (z < 0 || z > 22) return null;
  return { lat: lat!, lon: lon!, zoom: z };
}

/** Número curto para a URL: até `casas` decimais, sem zeros à direita ("-46.63", não "-46.630000"). */
export function curto(n: number, casas: number): string {
  const t = n.toFixed(casas);
  return t.includes(".") ? t.replace(/\.?0+$/, "") : t;
}

function dia(p: Entrada, chave: string): string | undefined {
  const v = um(p, chave);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

/** Lê os filtros (e o resto do estado) de uma URL. Nunca lança. */
export function lerBusca(p: Entrada): EstadoBusca {
  const f: Filtros = {};
  const q = um(p, "q")?.trim().slice(0, 120);
  if (q) f.q = q;
  const uf = lista(p, "uf", UFS);
  if (uf) f.uf = uf;
  const cidade = listaChaves(p, "cidade", 2);
  if (cidade) f.cidade = cidade;
  const bairro = listaChaves(p, "bairro", 3);
  if (bairro) f.bairro = bairro;
  const tipo = lista(p, "tipo", TIPOS);
  if (tipo) f.tipo = tipo;
  for (const c of CAMPOS_FAIXA) {
    const n = numero(p, c);
    if (n !== undefined) f[c] = n;
  }
  // Faixa ao contrário num link ("lanceMin=300000&lanceMax=100000"): o servidor já a aplica como a faixa certa;
  // aqui ela é corrigida para a URL reescrita, as pílulas e os campos dizerem o mesmo.
  for (const [a, b] of FAIXAS_PARES) {
    const lo = f[a];
    const hi = f[b];
    if (lo !== undefined && hi !== undefined && lo > hi) {
      f[a] = hi;
      f[b] = lo;
    }
  }
  const modalidade = lista(p, "modalidade", MODALIDADES);
  if (modalidade) f.modalidade = modalidade;
  const praca = lista(p, "praca", PRACAS);
  if (praca) f.praca = praca;
  const ocupacao = lista(p, "ocupacao", OCUPACOES);
  if (ocupacao) f.ocupacao = ocupacao;
  const natureza = lista(p, "natureza", NATUREZAS);
  if (natureza) f.natureza = natureza;
  const fonte = lista<string>(p, "fonte", undefined, 30);
  if (fonte) f.fonte = fonte;
  const de = dia(p, "dataDe");
  if (de) f.dataDe = de;
  const ate = dia(p, "dataAte");
  if (ate) f.dataAte = ate;
  for (const c of CAMPOS_SIM_NAO) {
    const b = simNao(p, c);
    if (b !== undefined) f[c] = b;
  }
  const comTags = lista<string>(p, "comTags", undefined, 30);
  if (comTags) f.comTags = comTags;
  const semTags = lista<string>(p, "semTags", undefined, 30);
  if (semTags) f.semTags = semTags;
  const selo = lista(p, "selo", ["1", "2", "3"] as const);
  if (selo) f.selo = selo.map(Number) as Filtros["selo"];
  // nota de localização mínima (Luneta): 1 a 100 depois de arredondar; 0 (ou 0,4) e fora da faixa não filtram
  const notaLocalBruta = numero(p, "notaLocalMin");
  const notaLocalMin = notaLocalBruta === undefined ? undefined : Math.round(notaLocalBruta);
  if (notaLocalMin !== undefined && notaLocalMin >= 1 && notaLocalMin <= 100) f.notaLocalMin = notaLocalMin;
  // metrô a até 1 km (Luneta): só "metro=1" filtra; "metro=0" e outro valor não querem dizer nada (não há "sem metrô")
  if (um(p, "metro") === "1") f.metroPerto = true;
  const bbox = caixa(p, "bbox");
  if (bbox) f.bbox = bbox;

  const ordemBruta = um(p, "ordem");
  const ordem = ORDENS.includes(ordemBruta as Ordem) ? (ordemBruta as Ordem) : ORDEM_PADRAO;
  const pagina = Math.min(10_000, Math.max(1, Math.floor(numero(p, "pagina") ?? 1)));
  const vistaBruta = um(p, "vista");
  const vista = vistaBruta === "lista" || vistaBruta === "cards" || vistaBruta === "mapa" ? vistaBruta : null;
  const mapaBruto = um(p, "mapa");
  const mapa = mapaBruto === "1" ? true : mapaBruto === "0" ? false : null;
  // sem o parâmetro, a Luneta (a demonstração); valor desconhecido ou mal escrito, o Lente (planos.ts)
  const plano: Plano = lerPlano(um(p, "plano"));
  return { filtros: f, ordem, pagina, vista, mapa, plano, camera: camera(p) };
}

/** Escreve o estado numa URLSearchParams, sem os valores padrão (URL curta). */
export function escreverBusca(e: Partial<EstadoBusca> & { conjunto?: Conjunto }): URLSearchParams {
  const p = new URLSearchParams();
  if (e.conjunto) p.set("conjunto", e.conjunto);
  const f = e.filtros ?? {};
  if (f.q) p.set("q", f.q);
  for (const chave of ["uf", "cidade", "bairro", "tipo", "modalidade", "praca", "ocupacao", "natureza", "fonte", "comTags", "semTags"] as const) {
    for (const v of f[chave] ?? []) p.append(chave, v);
  }
  for (const s of f.selo ?? []) p.append("selo", String(s));
  for (const c of CAMPOS_FAIXA) if (f[c] !== undefined) p.set(c, String(f[c]));
  if (f.dataDe) p.set("dataDe", f.dataDe);
  if (f.dataAte) p.set("dataAte", f.dataAte);
  for (const c of CAMPOS_SIM_NAO) if (f[c] !== undefined) p.set(c, f[c] ? "1" : "0");
  if (f.notaLocalMin !== undefined) p.set("notaLocalMin", String(f.notaLocalMin));
  if (f.metroPerto) p.set("metro", "1");
  // 5 casas: ~1 m (a área muda a cada arrasto; a URL não precisa de mais)
  if (f.bbox) p.set("bbox", f.bbox.map((x) => curto(x, 5)).join(","));
  if (e.ordem && e.ordem !== ORDEM_PADRAO) p.set("ordem", e.ordem);
  if (e.pagina && e.pagina > 1) p.set("pagina", String(e.pagina));
  if (e.vista) p.set("vista", e.vista);
  if (e.mapa !== undefined && e.mapa !== null) p.set("mapa", e.mapa ? "1" : "0");
  if (e.plano === "lente") p.set("plano", "lente");
  if (e.camera) {
    p.set("centro", `${curto(e.camera.lat, 5)},${curto(e.camera.lon, 5)}`);
    p.set("zoom", curto(e.camera.zoom, 2));
  }
  return p;
}

/** Quantos filtros estão ativos (uma faixa com mínimo e máximo conta como um). */
export function contarFiltros(f: Filtros): number {
  let n = 0;
  for (const chave of ["uf", "cidade", "bairro", "tipo", "modalidade", "praca", "ocupacao", "natureza", "fonte", "comTags", "semTags", "selo"] as const) {
    if (f[chave]?.length) n++;
  }
  for (const [a, b] of [["lanceMin", "lanceMax"], ["avaliacaoMin", "avaliacaoMax"], ["desagioMin", "desagioMax"], ["lanceM2Min", "lanceM2Max"], ["areaMin", "areaMax"]] as const) {
    if (f[a] !== undefined || f[b] !== undefined) n++;
  }
  if (f.quartosMin !== undefined) n++;
  if (f.vagasMin !== undefined) n++;
  if (f.notaLocalMin !== undefined) n++;
  if (f.metroPerto) n++;
  if (f.dataDe || f.dataAte) n++;
  for (const c of CAMPOS_SIM_NAO) if (f[c] !== undefined) n++;
  if (f.q) n++;
  return n;
}
