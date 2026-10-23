/**
 * Imóveis FICTÍCIOS da demonstração "Ajuste o foco" da landing (rodada 5, ponto 9): 150 imóveis gerados de forma
 * determinística (mesma semente, mesma lista, no servidor, no navegador e nos testes), para mostrar os filtros da
 * prévia funcionando sem rede. Cidades e bairros são reais; preço, deságio, praça, ocupação, nota de localização e
 * distância do metrô são inventados, mas coerentes:
 * - o preço sai do R$/m² típico da cidade × o nível do bairro × o tipo do imóvel;
 * - o deságio depende da praça (2ª praça mais funda; ocupado um pouco mais);
 * - a nota de localização acompanha o nível do bairro (e a estação perto);
 * - "metrô" só existe nas 7 capitais com metrô (SP, RJ, BH, DF, Recife, Salvador e Fortaleza), nos bairros que têm
 *   estação de verdade, e só para imóvel com endereço preciso (o mesmo que tem nota).
 * A tela marca tudo como fictício. Este módulo é carregado sob demanda, quando a seção chega perto da tela.
 *
 * Sem imports com "@/": os testes rodam em Node puro (src/lib/demo-foco/*.test.ts).
 */
import { latLonToMap } from "../brazil";

export type TipoFoco = "apartamento" | "casa" | "comercial" | "terreno";
export type PracaFoco = "1" | "2" | "unica";
export type OcupacaoFoco = "desocupado" | "ocupado" | "nao_informado";

export interface ImovelFoco {
  /** "f001" … "f150" */
  id: string;
  tipo: TipoFoco;
  uf: string;
  cidade: string;
  bairro: string;
  /** null em comercial e terreno */
  quartos: number | null;
  /** m² (privativa; no terreno, a do lote) */
  area: number;
  avaliacao: number;
  /** lance mínimo da praça atual */
  lance: number;
  /** % inteiro (1 − lance/avaliação) */
  desagio: number;
  praca: PracaFoco;
  ocupacao: OcupacaoFoco;
  financiamento: boolean;
  /** nota de localização fictícia (0 a 100); null quando o "endereço" não é preciso */
  nota: number | null;
  /** metros até a estação de metrô mais perto (até 3 km); null sem metrô na cidade ou sem endereço preciso */
  metro: number | null;
}

/** Bairro: nome real, nível de preço (1 = média da cidade) e estação de metrô: "p" perto, "m" a 1–3 km. */
type Bairro = readonly [nome: string, nivel: number, metro?: "p" | "m"];

interface Cidade {
  uf: string;
  nome: string;
  lat: number;
  lon: number;
  /** R$/m² típico da avaliação de um apartamento na cidade (referência fictícia, arredondada) */
  m2: number;
  /** quantos imóveis da demonstração ficam nela */
  n: number;
  /** a cidade tem metrô (só as capitais com metrô de verdade) */
  metro?: true;
  bairros: readonly Bairro[];
}

/**
 * As cidades da demonstração. 17 UFs, escolhidas também para que as bolhas por estado do mapinha não se encostem
 * (sem GO, perto do DF; sem RN, PB e AL, perto de PE): o teste confere a distância entre elas.
 */
export const CIDADES: readonly Cidade[] = [
  {
    uf: "SP",
    nome: "São Paulo",
    lat: -23.55,
    lon: -46.63,
    m2: 10500,
    n: 20,
    metro: true,
    bairros: [
      ["Pinheiros", 1.45, "p"],
      ["Vila Mariana", 1.3, "p"],
      ["Moema", 1.4, "p"],
      ["Perdizes", 1.3, "m"],
      ["Santana", 1.05, "p"],
      ["Tatuapé", 1.1, "p"],
      ["Mooca", 1.0, "p"],
      ["Butantã", 0.95, "p"],
      ["Jabaquara", 0.85, "p"],
      ["Vila Prudente", 0.9, "p"],
      ["Penha", 0.85, "p"],
      ["Itaquera", 0.7, "p"],
      ["Campo Limpo", 0.7, "p"],
      ["Freguesia do Ó", 0.85],
      ["Grajaú", 0.55],
      ["Cidade Tiradentes", 0.5],
    ],
  },
  { uf: "SP", nome: "Campinas", lat: -22.91, lon: -47.06, m2: 7200, n: 5, bairros: [["Cambuí", 1.35], ["Taquaral", 1.15], ["Barão Geraldo", 1.1], ["Centro", 0.85], ["Ponte Preta", 0.85], ["Campo Grande", 0.6]] },
  { uf: "SP", nome: "Santos", lat: -23.96, lon: -46.33, m2: 7600, n: 4, bairros: [["Gonzaga", 1.25], ["Ponta da Praia", 1.15], ["Boqueirão", 1.15], ["Embaré", 1.1], ["Vila Mathias", 0.8]] },
  { uf: "SP", nome: "Ribeirão Preto", lat: -21.18, lon: -47.81, m2: 6000, n: 4, bairros: [["Jardim Botânico", 1.2], ["Ribeirânia", 1.0], ["Centro", 0.8], ["Vila Tibério", 0.8], ["Ipiranga", 0.7]] },
  { uf: "SP", nome: "São José dos Campos", lat: -23.18, lon: -45.89, m2: 6800, n: 3, bairros: [["Jardim Aquarius", 1.3], ["Vila Ema", 1.1], ["Jardim Satélite", 0.9], ["Centro", 0.85]] },
  { uf: "SP", nome: "Sorocaba", lat: -23.5, lon: -47.46, m2: 5300, n: 3, bairros: [["Campolim", 1.25], ["Vila Hortência", 0.9], ["Centro", 0.85], ["Éden", 0.7]] },
  {
    uf: "RJ",
    nome: "Rio de Janeiro",
    lat: -22.91,
    lon: -43.17,
    m2: 9800,
    n: 14,
    metro: true,
    bairros: [
      ["Copacabana", 1.3, "p"],
      ["Botafogo", 1.25, "p"],
      ["Flamengo", 1.25, "p"],
      ["Tijuca", 1.0, "p"],
      ["Centro", 0.9, "p"],
      ["Barra da Tijuca", 1.3, "m"],
      ["Vila Isabel", 0.85, "m"],
      ["Pavuna", 0.5, "p"],
      ["Recreio dos Bandeirantes", 1.0],
      ["Méier", 0.8],
      ["Madureira", 0.65],
      ["Campo Grande", 0.55],
    ],
  },
  { uf: "RJ", nome: "Niterói", lat: -22.88, lon: -43.1, m2: 8400, n: 3, bairros: [["Icaraí", 1.3], ["Charitas", 1.2], ["Santa Rosa", 0.95], ["Centro", 0.8], ["Fonseca", 0.75]] },
  {
    uf: "MG",
    nome: "Belo Horizonte",
    lat: -19.92,
    lon: -43.94,
    m2: 8200,
    n: 9,
    metro: true,
    bairros: [
      ["Lourdes", 1.45],
      ["Savassi", 1.4],
      ["Buritis", 1.1],
      ["Pampulha", 1.05],
      ["Castelo", 1.0],
      ["Santa Efigênia", 0.95, "p"],
      ["Centro", 0.9, "p"],
      ["São Gabriel", 0.65, "p"],
      ["Venda Nova", 0.65, "p"],
      ["Barreiro", 0.6],
    ],
  },
  { uf: "MG", nome: "Uberlândia", lat: -18.92, lon: -48.28, m2: 5600, n: 4, bairros: [["Jardim Karaíba", 1.3], ["Santa Mônica", 1.0], ["Centro", 0.95], ["Martins", 0.95], ["Tibery", 0.8]] },
  { uf: "MG", nome: "Juiz de Fora", lat: -21.76, lon: -43.35, m2: 5000, n: 3, bairros: [["Cascatinha", 1.2], ["São Mateus", 1.1], ["Centro", 1.0], ["Benfica", 0.7]] },
  { uf: "ES", nome: "Vitória", lat: -20.32, lon: -40.34, m2: 9000, n: 3, bairros: [["Praia do Canto", 1.35], ["Jardim da Penha", 1.1], ["Jardim Camburi", 1.0], ["Centro", 0.75]] },
  { uf: "ES", nome: "Vila Velha", lat: -20.33, lon: -40.29, m2: 7600, n: 3, bairros: [["Praia da Costa", 1.25], ["Itapuã", 1.05], ["Coqueiral de Itaparica", 0.85], ["Glória", 0.75]] },
  {
    uf: "PR",
    nome: "Curitiba",
    lat: -25.43,
    lon: -49.27,
    m2: 8600,
    n: 6,
    bairros: [["Batel", 1.4], ["Água Verde", 1.2], ["Portão", 1.0], ["Santa Felicidade", 0.95], ["Centro", 0.95], ["Boqueirão", 0.8], ["Cidade Industrial", 0.6]],
  },
  { uf: "PR", nome: "Londrina", lat: -23.31, lon: -51.16, m2: 6200, n: 3, bairros: [["Gleba Palhano", 1.3], ["Jardim Higienópolis", 1.0], ["Centro", 0.9], ["Cinco Conjuntos", 0.6]] },
  {
    uf: "SC",
    nome: "Florianópolis",
    lat: -27.59,
    lon: -48.55,
    m2: 10500,
    n: 4,
    bairros: [["Centro", 1.15], ["Itacorubi", 1.1], ["Campeche", 1.1], ["Trindade", 1.05], ["Estreito", 0.95], ["Ingleses do Rio Vermelho", 0.9]],
  },
  { uf: "SC", nome: "Joinville", lat: -26.3, lon: -48.85, m2: 6900, n: 3, bairros: [["América", 1.2], ["Centro", 1.0], ["Glória", 0.95], ["Costa e Silva", 0.8]] },
  {
    uf: "RS",
    nome: "Porto Alegre",
    lat: -30.03,
    lon: -51.23,
    m2: 7300,
    n: 5,
    bairros: [["Moinhos de Vento", 1.45], ["Petrópolis", 1.2], ["Menino Deus", 1.1], ["Cristal", 0.95], ["Centro Histórico", 0.85], ["Sarandi", 0.65], ["Restinga", 0.5]],
  },
  { uf: "RS", nome: "Caxias do Sul", lat: -29.17, lon: -51.18, m2: 5600, n: 3, bairros: [["São Pelegrino", 1.1], ["Exposição", 1.05], ["Centro", 1.0], ["Santa Catarina", 0.75]] },
  {
    uf: "DF",
    nome: "Brasília",
    lat: -15.79,
    lon: -47.88,
    m2: 9500,
    n: 8,
    metro: true,
    bairros: [
      ["Sudoeste", 1.4],
      ["Asa Sul", 1.35, "p"],
      ["Asa Norte", 1.35],
      ["Águas Claras", 1.0, "p"],
      ["Guará", 0.9, "p"],
      ["Taguatinga", 0.75, "p"],
      ["Sobradinho", 0.6],
      ["Ceilândia", 0.55, "p"],
      ["Samambaia", 0.55, "p"],
    ],
  },
  { uf: "MS", nome: "Campo Grande", lat: -20.47, lon: -54.62, m2: 5900, n: 3, bairros: [["Jardim dos Estados", 1.3], ["Carandá Bosque", 1.2], ["Centro", 0.95], ["Tiradentes", 0.75]] },
  { uf: "MT", nome: "Cuiabá", lat: -15.6, lon: -56.1, m2: 6300, n: 3, bairros: [["Goiabeiras", 1.25], ["Jardim das Américas", 1.0], ["Centro Norte", 0.85], ["Morada da Serra", 0.65]] },
  {
    uf: "BA",
    nome: "Salvador",
    lat: -12.97,
    lon: -38.5,
    m2: 6800,
    n: 6,
    metro: true,
    bairros: [
      ["Barra", 1.25],
      ["Pituba", 1.2, "m"],
      ["Stella Maris", 0.95],
      ["Imbuí", 0.95, "p"],
      ["Brotas", 0.85, "p"],
      ["Itapuã", 0.8],
      ["Pernambués", 0.75, "p"],
      ["Cabula", 0.7, "m"],
    ],
  },
  { uf: "BA", nome: "Feira de Santana", lat: -12.27, lon: -38.97, m2: 4300, n: 2, bairros: [["Santa Mônica", 1.1], ["Centro", 0.95], ["Tomba", 0.7]] },
  {
    uf: "PE",
    nome: "Recife",
    lat: -8.05,
    lon: -34.88,
    m2: 7400,
    n: 5,
    metro: true,
    bairros: [
      ["Boa Viagem", 1.25, "m"],
      ["Espinheiro", 1.15],
      ["Madalena", 1.0],
      ["Imbiribeira", 0.9, "p"],
      ["Casa Amarela", 0.85],
      ["Várzea", 0.75],
      ["Afogados", 0.65, "p"],
    ],
  },
  { uf: "PE", nome: "Jaboatão dos Guararapes", lat: -8.11, lon: -35.01, m2: 5600, n: 2, bairros: [["Piedade", 1.1], ["Candeias", 1.05], ["Prazeres", 0.75]] },
  {
    uf: "CE",
    nome: "Fortaleza",
    lat: -3.73,
    lon: -38.53,
    m2: 7000,
    n: 6,
    metro: true,
    bairros: [
      ["Meireles", 1.45],
      ["Aldeota", 1.3],
      ["Cocó", 1.2],
      ["Benfica", 0.85, "p"],
      ["Centro", 0.75, "p"],
      ["Parangaba", 0.7, "p"],
      ["Messejana", 0.7],
    ],
  },
  { uf: "MA", nome: "São Luís", lat: -2.53, lon: -44.3, m2: 5800, n: 3, bairros: [["Renascença", 1.25], ["Calhau", 1.2], ["Cohama", 0.9], ["Centro", 0.7]] },
  { uf: "PI", nome: "Teresina", lat: -5.09, lon: -42.8, m2: 5300, n: 2, bairros: [["Jóquei", 1.25], ["Fátima", 1.2], ["Centro", 0.85], ["Dirceu Arcoverde", 0.6]] },
  { uf: "AM", nome: "Manaus", lat: -3.12, lon: -60.02, m2: 5900, n: 4, bairros: [["Ponta Negra", 1.3], ["Adrianópolis", 1.25], ["Flores", 0.85], ["Centro", 0.75], ["Cidade Nova", 0.65]] },
  { uf: "PA", nome: "Belém", lat: -1.46, lon: -48.5, m2: 6400, n: 4, bairros: [["Umarizal", 1.3], ["Nazaré", 1.25], ["Marco", 0.95], ["Pedreira", 0.85], ["Marambaia", 0.7]] },
];

/** Semente da demonstração: trocar muda todos os imóveis (e os testes de valores fixos). */
export const SEMENTE = 2026;
/** Distância (m) que conta como "metrô perto" (o filtro e a etiqueta). */
export const METRO_PERTO = 1000;

/** Gerador de números pseudoaleatórios (mulberry32): rápido, pequeno e igual em qualquer motor JS. */
function gerador(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash FNV-1a (32 bits) do texto: a semente de cada cidade (mexer numa cidade não muda as outras). */
function hash(texto: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

type Sorteio = () => number;

/** Escolhe por peso: [[valor, peso], …]. */
function porPeso<T>(r: Sorteio, opcoes: readonly (readonly [T, number])[]): T {
  const total = opcoes.reduce((s, [, p]) => s + p, 0);
  let x = r() * total;
  for (const [v, p] of opcoes) {
    x -= p;
    if (x < 0) return v;
  }
  return opcoes[opcoes.length - 1][0];
}

const entre = (r: Sorteio, a: number, b: number) => a + r() * (b - a);
const arred = (v: number, passo: number) => Math.round(v / passo) * passo;

const TIPOS: readonly (readonly [TipoFoco, number])[] = [
  ["apartamento", 55],
  ["casa", 30],
  ["comercial", 8],
  ["terreno", 7],
];

/** Quartos por tipo (só apartamento e casa). */
const QUARTOS: Record<"apartamento" | "casa", readonly (readonly [number, number])[]> = {
  apartamento: [
    [1, 15],
    [2, 45],
    [3, 32],
    [4, 8],
  ],
  casa: [
    [1, 8],
    [2, 37],
    [3, 40],
    [4, 15],
  ],
};

/** Área (m²) por tipo e quartos: [mínimo, máximo]. */
const AREA: Record<string, readonly [number, number]> = {
  "apartamento-1": [32, 52],
  "apartamento-2": [44, 72],
  "apartamento-3": [68, 120],
  "apartamento-4": [110, 210],
  "casa-1": [40, 75],
  "casa-2": [55, 110],
  "casa-3": [85, 190],
  "casa-4": [140, 320],
  comercial: [28, 320],
  terreno: [160, 900],
};

/** O m² de cada tipo em relação ao do apartamento (terreno: m² do lote). */
const FATOR_TIPO: Record<TipoFoco, number> = { apartamento: 1, casa: 0.8, comercial: 1.05, terreno: 0.16 };

/** Chance de aceitar financiamento, por tipo. */
const FINANCIA: Record<TipoFoco, number> = { apartamento: 0.62, casa: 0.58, comercial: 0.25, terreno: 0.1 };

/** Deságio (%) por praça: [mínimo, máximo]. */
const DESAGIO: Record<PracaFoco, readonly [number, number]> = { "1": [5, 30], "2": [35, 60], unica: [15, 50] };

function gerarCidade(c: Cidade, inicio: number): ImovelFoco[] {
  const r = gerador(hash(`${c.uf}|${c.nome}`) ^ SEMENTE);
  const saida: ImovelFoco[] = [];
  for (let k = 0; k < c.n; k++) {
    const [bairro, nivel, estacao] = c.bairros[Math.floor(r() * c.bairros.length)];
    const tipo = porPeso(r, TIPOS);
    const quartos = tipo === "apartamento" || tipo === "casa" ? porPeso(r, QUARTOS[tipo]) : null;
    const [aMin, aMax] = AREA[quartos === null ? tipo : `${tipo}-${quartos}`];
    // comercial: muitas salas pequenas, poucas lojas grandes (a área sorteada pende para o mínimo)
    const u = tipo === "comercial" ? r() ** 2 : r();
    const area = arred(aMin + u * (aMax - aMin), tipo === "terreno" ? 10 : 1);
    const m2 = c.m2 * nivel * FATOR_TIPO[tipo] * entre(r, 0.88, 1.12);
    const avaliacao = arred(area * m2, 1000);
    const praca = porPeso<PracaFoco>(r, [
      ["1", 30],
      ["2", 45],
      ["unica", 25],
    ]);
    const ocupacao = porPeso<OcupacaoFoco>(r, [
      ["desocupado", 40],
      ["ocupado", 40],
      ["nao_informado", 20],
    ]);
    const [dMin, dMax] = DESAGIO[praca];
    // ocupado sai um pouco mais barato (quem compra paga a desocupação)
    const alvo = Math.min(65, Math.round(entre(r, dMin, dMax)) + (ocupacao === "ocupado" ? 4 : 0));
    const lance = arred(avaliacao * (1 - alvo / 100), 100);
    const desagio = Math.round((1 - lance / avaliacao) * 100);
    const financiamento = r() < FINANCIA[tipo];
    // ~12% sem endereço preciso: sem nota e sem distância do metrô (como na base real)
    const preciso = r() >= 0.12;
    let metro: number | null = null;
    if (preciso && c.metro && estacao) {
      const perto = estacao === "p" && r() < 0.85;
      metro = arred(perto ? entre(r, 120, 950) : entre(r, 1100, 2600), 10);
    }
    const ruido = (r() - 0.5) * 20;
    const nota = preciso ? Math.max(5, Math.min(98, Math.round(30 + (nivel - 0.5) * 55 + ruido + (metro !== null && metro <= METRO_PERTO ? 6 : 0)))) : null;
    saida.push({
      id: `f${String(inicio + k + 1).padStart(3, "0")}`,
      tipo,
      uf: c.uf,
      cidade: c.nome,
      bairro,
      quartos,
      area,
      avaliacao,
      lance,
      desagio,
      praca,
      ocupacao,
      financiamento,
      nota,
      metro,
    });
  }
  return saida;
}

/** Os 150 imóveis fictícios, sempre os mesmos. */
export function gerarImoveis(): ImovelFoco[] {
  const saida: ImovelFoco[] = [];
  for (const c of CIDADES) saida.push(...gerarCidade(c, saida.length));
  return saida;
}

/** "Apartamento 2 quartos", "Casa 3 quartos", "Sala comercial", "Loja", "Terreno". */
export function tituloImovel(i: Pick<ImovelFoco, "tipo" | "quartos" | "area">): string {
  if (i.tipo === "terreno") return "Terreno";
  if (i.tipo === "comercial") return i.area < 80 ? "Sala comercial" : "Loja";
  const nome = i.tipo === "apartamento" ? "Apartamento" : "Casa";
  return i.quartos ? `${nome} ${i.quartos} ${i.quartos === 1 ? "quarto" : "quartos"}` : nome;
}

/** Chave da cidade, no formato do catálogo: "SP|São Paulo". */
export const chaveCidade = (i: Pick<ImovelFoco, "uf" | "cidade">) => `${i.uf}|${i.cidade}`;

/**
 * Onde fica a bolha de cada estado no mapinha (viewBox 400×400 de src/lib/brazil.ts): a média das cidades da
 * demonstração, pesada pelo número de imóveis de cada uma.
 */
export const CENTRO_UF: Readonly<Record<string, readonly [number, number]>> = (() => {
  const soma = new Map<string, { lat: number; lon: number; n: number }>();
  for (const c of CIDADES) {
    const s = soma.get(c.uf) ?? { lat: 0, lon: 0, n: 0 };
    s.lat += c.lat * c.n;
    s.lon += c.lon * c.n;
    s.n += c.n;
    soma.set(c.uf, s);
  }
  const saida: Record<string, readonly [number, number]> = {};
  for (const [uf, s] of soma) saida[uf] = latLonToMap(s.lat / s.n, s.lon / s.n);
  return saida;
})();

/** As cidades com metrô (para o texto de ajuda do filtro). */
export const CIDADES_COM_METRO = CIDADES.filter((c) => c.metro).map((c) => c.nome);
