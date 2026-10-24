/**
 * Vitrine da demonstração (/assinante): os ~10 melhores imóveis REAIS da base, escolhidos no servidor a cada carga do
 * instantâneo, por um critério objetivo (rodada 5, decisão 4). PURO (sem fs, sem rede): recebe a lista da prévia, já
 * com a nota de localização no resumo, e devolve os escolhidos com o motivo de cada um.
 *
 * O critério, na ordem:
 * 1. Só entra quem passa em TODAS as regras de qualidade (ver `motivoFora`):
 *    - deságio entre 35% e 75% (alto, mas sem o desconto extremo que costuma ser erro da fonte);
 *    - avaliação coerente: o R$/m² da avaliação até 1,8 vez a mediana do mesmo tipo na cidade (ou no estado, com
 *      menos de 5 na cidade); avaliação inflada infla o deságio;
 *    - lance de R$ 40 mil a R$ 3 milhões e, em casa e apartamento, de R$ 500 a R$ 25 mil por m² (fora disso, quase
 *      sempre é fração, erro de digitação ou área errada);
 *    - nota de localização calculada de 70 para cima (a nota sai do endereço; a cidade sozinha não tem nota);
 *    - endereço achado no número ou na rua (precisão "exata" ou "rua"), nunca só no bairro ou na cidade;
 *    - cidade com 300 mil moradores ou mais, pelo IBGE (cidade grande: a nota compara muitos bairros e a revenda tem
 *      mais procura);
 *    - com foto na fonte, e que não esteja entre as fotos olhadas e recusadas (documento, mapa, colagem do laudo ou
 *      foto que a Caixa não publica: src/lib/catalogo/vitrine-fotos.ts);
 *    - sem nenhuma tag grave, nem em revisão (ex.: "Lance acima da avaliação", "Só direitos", "Ocupado");
 *    - modalidade com preço claro: venda direta, venda online, licitação, ou leilão com a praça informada (no Leilão
 *      SFI da Caixa sem ficha não se sabe se o preço é o da 1ª ou da 2ª praça);
 *    - praça ainda não passada, quando a fonte dá a data;
 *    - área informada (sem ela não há R$/m² nem simulador completo).
 * 2. Pontuação = deságio (em %) + metade da nota de localização + 3 pontos se o endereço foi achado no número.
 *    Ex.: 52% de deságio e nota 90 no número = 52 + 45 + 3 = 100. O deságio pesa mais (é o que a pessoa procura); a
 *    nota desempata entre descontos parecidos. Empate: mais dados (quartos, vagas, bairro), depois o id.
 * 3. Variedade, escolhendo do maior para o menor: no máximo 2 por UF, 1 por cidade, 4 apartamentos, 4 casas e 1 de
 *    cada outro tipo (sala ou loja, terreno, rural).
 * 4. Se faltar imóvel (base pequena, teste, instantâneo de outra época), as vagas que sobram são preenchidas com as
 *    regras afrouxadas por etapas (ver ETAPAS_VITRINE), sempre sem tag grave, com foto e com preço claro. Cada
 *    escolhido diz em que etapa entrou.
 */
import type { ImovelResumo, TipoImovel } from "./tipos";
import { FOTOS_RECUSADAS } from "./vitrine-fotos";

export const VITRINE_QUANTOS = 10;
export const VITRINE_MAX_POR_UF = 2;
export const VITRINE_MAX_POR_CIDADE = 1;
/** Máximo por tipo numa vitrine de 10 (proporcional se for outro tamanho). */
export const VITRINE_MAX_POR_TIPO: Readonly<Record<TipoImovel, number>> = { apartamento: 4, casa: 4, comercial: 1, terreno: 1, rural: 1, outro: 0 };

/** Regras de qualidade de uma etapa (a etapa 0 é a estrita; as outras só completam a vitrine). */
export interface RegrasVitrine {
  desagioMin: number;
  desagioMax: number;
  /** nota de localização mínima; null = não exige nota */
  notaMin: number | null;
  /** precisões do ponto aceitas */
  precisoes: readonly NonNullable<ImovelResumo["precisaoGeo"]>[];
  /** moradores da cidade (quando quem chama sabe); null = não exige */
  moradoresMin: number | null;
}

export const ETAPAS_VITRINE: readonly RegrasVitrine[] = [
  { desagioMin: 35, desagioMax: 75, notaMin: 70, precisoes: ["exata", "rua"], moradoresMin: 300_000 },
  { desagioMin: 30, desagioMax: 75, notaMin: 60, precisoes: ["exata", "rua"], moradoresMin: 100_000 },
  { desagioMin: 25, desagioMax: 75, notaMin: null, precisoes: ["exata", "rua", "bairro", "cep", "cidade"], moradoresMin: null },
];

export const LANCE_MIN = 40_000;
export const LANCE_MAX = 3_000_000;
/** R$/m² plausível em casa e apartamento (abaixo ou acima, quase sempre é área ou preço errados na fonte). */
export const M2_MIN = 500;
export const M2_MAX = 25_000;
/** Avaliação por m² acima disto × a mediana do lugar: avaliação inflada (o deságio seria ilusão). */
export const AVALIACAO_M2_TETO = 1.8;
const AMOSTRA_MEDIANA = 5;

export interface OpcoesVitrine {
  agora?: Date;
  quantos?: number;
  /** moradores da cidade do imóvel (IBGE, pelos arquivos da nota); sem a função, a regra de moradores não vale */
  moradores?: (i: ImovelResumo) => number | null;
}

export interface EscolhidoVitrine {
  item: ImovelResumo;
  pontos: number;
  /** 0 = critério estrito; 1 e 2 = regras afrouxadas para completar a vitrine */
  etapa: number;
  /** frase curta com o porquê (para o log e o relatório da escolha) */
  motivo: string;
}

/** Preço claro: o valor mostrado é o que vale hoje (venda, licitação ou leilão com a praça conhecida). */
export function precoClaro(i: Pick<ImovelResumo, "modalidade" | "praca">): boolean {
  return i.modalidade !== "leilao" && i.modalidade !== "outro" ? true : i.praca !== null;
}

function mediana(v: number[]): number {
  const o = [...v].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
}

/** Mediana da avaliação/m² por cidade e tipo (com 5 ou mais) e por UF e tipo, para a regra da avaliação coerente. */
export function medianasAvaliacao(itens: readonly ImovelResumo[]): (i: ImovelResumo) => number | null {
  const porCidade = new Map<string, number[]>();
  const porUf = new Map<string, number[]>();
  for (const i of itens) {
    if (i.avaliacaoM2 === null || i.fonte.id === "exemplo") continue;
    const c = `${i.uf}|${i.cidade}|${i.tipo}`;
    const u = `${i.uf}|${i.tipo}`;
    (porCidade.get(c) ?? porCidade.set(c, []).get(c)!).push(i.avaliacaoM2);
    (porUf.get(u) ?? porUf.set(u, []).get(u)!).push(i.avaliacaoM2);
  }
  const cache = new Map<string, number | null>();
  const de = (mapa: Map<string, number[]>, chave: string) => {
    const k = `${mapa === porCidade ? "c" : "u"}:${chave}`;
    if (!cache.has(k)) {
      const v = mapa.get(chave);
      cache.set(k, v && v.length >= AMOSTRA_MEDIANA ? mediana(v) : null);
    }
    return cache.get(k)!;
  };
  return (i) => de(porCidade, `${i.uf}|${i.cidade}|${i.tipo}`) ?? de(porUf, `${i.uf}|${i.tipo}`);
}

/**
 * Por que o imóvel fica fora da vitrine numa etapa (null = passa). `medianaDe` é a de `medianasAvaliacao` (sem ela, a
 * regra da avaliação coerente não vale). Exportado para os testes.
 */
export function motivoFora(
  i: ImovelResumo,
  regras: RegrasVitrine,
  agora: Date,
  medianaDe?: (i: ImovelResumo) => number | null,
  moradores?: (i: ImovelResumo) => number | null,
): string | null {
  if (i.fonte.id === "exemplo") return "exemplo fictício";
  if (!i.foto) return "sem foto";
  if (FOTOS_RECUSADAS[i.id]) return "foto recusada";
  if (i.tags.some((t) => t.severidade === "grave")) return "tag grave";
  if (!precoClaro(i)) return "preço sem praça";
  if (i.dataPraca !== null && Date.parse(i.dataPraca) < agora.getTime()) return "praça passada";
  if (i.desagio === null || i.avaliacao === null) return "sem avaliação";
  if (i.desagio < regras.desagioMin || i.desagio > regras.desagioMax) return "deságio fora da faixa";
  if (i.lance < LANCE_MIN || i.lance > LANCE_MAX) return "lance fora da faixa";
  if (i.area === null || i.area <= 0) return "sem área";
  if ((i.tipo === "apartamento" || i.tipo === "casa") && (i.lanceM2 === null || i.lanceM2 < M2_MIN || i.lanceM2 > M2_MAX)) return "R$/m² fora do padrão";
  const med = medianaDe?.(i) ?? null;
  if (med !== null && i.avaliacaoM2 !== null && i.avaliacaoM2 > AVALIACAO_M2_TETO * med) return "avaliação acima do lugar";
  if (i.precisaoGeo === null || !regras.precisoes.includes(i.precisaoGeo)) return "endereço impreciso";
  if (regras.notaMin !== null && (i.notaLocal === null || i.notaLocal < regras.notaMin)) return "nota de localização baixa";
  if (regras.moradoresMin !== null && moradores) {
    const m = moradores(i);
    if (m === null || m < regras.moradoresMin) return "cidade pequena";
  }
  return null;
}

/** Pontuação: deságio + nota ÷ 2 + 3 no número. */
export function pontosVitrine(i: ImovelResumo): number {
  return (i.desagio ?? 0) + (i.notaLocal ?? 0) / 2 + (i.precisaoGeo === "exata" ? 3 : 0);
}

/** Desempate: quantos dados de apoio o imóvel tem. */
function completude(i: ImovelResumo): number {
  return (i.quartos !== null ? 1 : 0) + (i.vagas !== null ? 1 : 0) + (i.bairro ? 1 : 0) + (i.areaTerreno !== null ? 1 : 0);
}

const chaveCidade = (i: ImovelResumo) => `${i.uf}|${i.cidade}`;

/**
 * Os escolhidos, na ordem da pontuação (maior primeiro), com o motivo. `agora` decide as praças passadas. Determinístico:
 * a mesma lista e o mesmo dia dão a mesma vitrine.
 */
export function escolherVitrine(itens: readonly ImovelResumo[], opcoes: OpcoesVitrine = {}): EscolhidoVitrine[] {
  const agora = opcoes.agora ?? new Date();
  const quantos = opcoes.quantos ?? VITRINE_QUANTOS;
  const medianaDe = medianasAvaliacao(itens);
  const escolhidos: EscolhidoVitrine[] = [];
  const porUf = new Map<string, number>();
  const cidades = new Set<string>();
  const porTipo = new Map<TipoImovel, number>();
  const maxTipo = (t: TipoImovel) => Math.ceil((VITRINE_MAX_POR_TIPO[t] * quantos) / VITRINE_QUANTOS);
  const usados = new Set<string>();

  ETAPAS_VITRINE.forEach((regras, etapa) => {
    if (escolhidos.length >= quantos) return;
    const aptos = itens
      .filter((i) => !usados.has(i.id) && motivoFora(i, regras, agora, medianaDe, opcoes.moradores) === null)
      .map((item) => ({ item, pontos: pontosVitrine(item) }))
      .sort((a, b) => b.pontos - a.pontos || completude(b.item) - completude(a.item) || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
    for (const { item, pontos } of aptos) {
      if (escolhidos.length >= quantos) break;
      if ((porUf.get(item.uf) ?? 0) >= VITRINE_MAX_POR_UF) continue;
      if (cidades.has(chaveCidade(item))) continue;
      if ((porTipo.get(item.tipo) ?? 0) >= maxTipo(item.tipo)) continue;
      porUf.set(item.uf, (porUf.get(item.uf) ?? 0) + 1);
      cidades.add(chaveCidade(item));
      porTipo.set(item.tipo, (porTipo.get(item.tipo) ?? 0) + 1);
      usados.add(item.id);
      escolhidos.push({ item, pontos: Math.round(pontos * 10) / 10, etapa, motivo: motivoDe(item, etapa) });
    }
  });
  return escolhidos;
}

/** "deságio de 52%, nota de localização 90, endereço no número, venda direta online" */
function motivoDe(i: ImovelResumo, etapa: number): string {
  const partes = [
    `deságio de ${i.desagio}%`,
    i.notaLocal !== null ? `nota de localização ${i.notaLocal}` : "sem nota de localização",
    i.precisaoGeo === "exata" ? "endereço no número" : i.precisaoGeo === "rua" ? "endereço na rua" : `endereço só ${i.precisaoGeo === "bairro" ? "no bairro" : "na cidade"}`,
    (i.modalidadeFonte ?? i.modalidade).toLowerCase(),
  ];
  return `${partes.join(", ")}${etapa > 0 ? ` (regras afrouxadas, etapa ${etapa})` : ""}`;
}

const UM_DIA = 24 * 3600 * 1000;

/**
 * Imóveis ativos agora: sem as praças vencidas há mais de 1 dia (a mesma regra da busca e da exportação). É o "N" de
 * "Você está vendo 10 de N imóveis reais".
 */
export function contarAtivos(itens: readonly Pick<ImovelResumo, "dataPraca">[], agora: Date = new Date()): number {
  const vencidoAntesDe = agora.getTime() - UM_DIA;
  return itens.reduce((n, i) => (i.dataPraca !== null && Date.parse(i.dataPraca) < vencidoAntesDe ? n : n + 1), 0);
}
