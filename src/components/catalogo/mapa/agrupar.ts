/**
 * Bolhas do mapa e agrupamento (funções puras, testadas em Node: sem "@/" nos imports).
 *
 * Cada cidade vira uma bolha com raio em px de TELA (não cresce com o zoom), pela raiz do total.
 * Bolhas que se encostam na tela viram uma bolha de grupo (soma dos imóveis, centro ponderado pelo total).
 * O agrupamento só depende do zoom (arrastar não muda a distância em px entre dois pontos), então é
 * recalculado ao fim de cada gesto de zoom, nunca a cada quadro.
 */
import type { PontoMapa } from "../../../lib/catalogo/tipos";

/** Um ponto do mapa já projetado no mundo (viewBox de brasil-ufs). */
export interface PontoProjetado extends PontoMapa {
  x: number;
  y: number;
}

export interface NoMapa {
  /** "c:MG|Uberlândia" (cidade) ou "g:MG|Uberlândia" (grupo, pela maior cidade dele) */
  id: string;
  grupo: boolean;
  /** posição no mundo (grupo: centro ponderado pelo total) */
  x: number;
  y: number;
  total: number;
  /** raio do desenho, em px de tela */
  r: number;
  /** cidades do nó, da maior para a menor */
  membros: PontoProjetado[];
  lanceMin: number;
  desagioMax: number | null;
}

export const RAIO_CIDADE_MIN = 6;
export const RAIO_CIDADE_MAX = 28;
/**
 * Grupos usam a mesma régua das cidades até o total da maior cidade; acima disso crescem devagar (log)
 * até 38 px. Assim o tamanho nunca mente: um grupo com 15 mil imóveis não sai menor que uma cidade com 900.
 */
const RAIO_GRUPO_MIN = 10;
export const RAIO_GRUPO_MAX = 38;
/**
 * Raio mínimo para a colisão: alvos de 24 px (WCAG 2.5.8) que não se sobrepõem. Duas bolhas pequenas a
 * menos de 24 px uma da outra viram grupo, mesmo sem o desenho se encostar.
 */
const RAIO_ALVO = 11;
const ESPACO = 2;

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Número dentro da bolha: "8", "312", "1.234", "12 mil". */
export function textoContagem(n: number): string {
  if (n >= 10_000) return `${NUM.format(Math.round(n / 1000))} mil`;
  return NUM.format(n);
}

/** Tamanho da fonte do número dentro da bolha (Space Grotesk 700). */
export function fonteContagem(texto: string): number {
  return texto.length >= 5 ? 10 : texto.length >= 4 ? 10.5 : 11.5;
}

/** Raio mínimo para o número caber (≈ 0,6 em por caractere, mais 4 px de respiro de cada lado). */
export function raioParaTexto(texto: string): number {
  return (texto.length * fonteContagem(texto) * 0.6) / 2 + 4;
}

/**
 * Raio de uma cidade: 6 a 28 px pela raiz do total (a maior cidade do conjunto tem o máximo).
 * `fator` (0,68 a 1) encolhe o máximo em mapas pequenos (celular, faixa baixa).
 */
export function raioCidade(total: number, maiorCidade: number, fator = 1): number {
  const f = Math.sqrt(Math.min(1, Math.max(0, total) / Math.max(1, maiorCidade)));
  return RAIO_CIDADE_MIN + (RAIO_CIDADE_MAX * fator - RAIO_CIDADE_MIN) * f;
}

/**
 * Raio de um grupo, monotônico no total: até o total da maior cidade, igual ao de uma cidade com esse total;
 * acima disso, de 28 a 38 px pelo logaritmo de total ÷ maior cidade (a soma de tudo leva ao máximo).
 * Sempre com espaço para o número.
 */
export function raioGrupo(total: number, maiorCidade: number, somaTotal: number, fator = 1): number {
  const maior = Math.max(1, maiorCidade);
  let r = raioCidade(total, maior, fator);
  if (total > maior) {
    const teto = RAIO_CIDADE_MAX * fator;
    const topo = Math.max(RAIO_GRUPO_MAX * fator, teto + 4);
    const amplitude = Math.log(Math.max(somaTotal, total) / maior);
    const t = amplitude > 0 ? Math.min(1, Math.log(total / maior) / amplitude) : 1;
    r = teto + (topo - teto) * t;
  }
  return Math.max(r, RAIO_GRUPO_MIN, raioParaTexto(textoContagem(total)));
}

/**
 * Fonte do número dentro de uma bolha de cidade: a padrão, ou 10 px se só assim couber; null quando nem
 * assim cabe com folga (bolhas pequenas ficam sem número; o cartão e o nome acessível dão a contagem).
 */
export function fonteNumero(r: number, texto: string): number | null {
  if (r < 12) return null;
  for (const f of [fonteContagem(texto), 10]) if ((texto.length * f * 0.6) / 2 + 5 <= r) return f;
  return null;
}

export interface OpcoesAgrupar {
  /** px de tela por unidade do mundo (escala base × zoom) */
  escala: number;
  /** maior total de uma cidade no conjunto (régua das cidades) */
  maiorCidade: number;
  /** soma de todos os totais (régua dos grupos) */
  somaTotal: number;
  /** false: cada cidade é uma bolha (zoom máximo, mapa da página do imóvel) */
  agrupar?: boolean;
  /** 0,68 a 1: bolhas menores em mapas pequenos (ver `fatorRaio`) */
  fator?: number;
}

/** Fator dos raios pelo tamanho do mapa: 1 a partir de ~560 px no lado menor; 0,68 no celular. */
export function fatorRaio(largura: number, altura: number): number {
  return Math.min(1, Math.max(0.68, Math.min(largura, altura) / 560));
}

interface NoTrabalho {
  membros: PontoProjetado[];
  total: number;
  /** somas ponderadas para o centro (peso = total, mínimo 1) */
  sx: number;
  sy: number;
  peso: number;
  x: number;
  y: number;
  r: number;
  vivo: boolean;
}

const ordemPontos = (a: PontoMapa, b: PontoMapa) => b.total - a.total || (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0);

function fechar(n: NoTrabalho, o: OpcoesAgrupar): NoMapa {
  const membros = n.membros.length > 1 ? [...n.membros].sort(ordemPontos) : n.membros;
  const grupo = membros.length > 1;
  let lanceMin = Infinity;
  let desagioMax: number | null = null;
  for (const m of membros) {
    if (m.lanceMin < lanceMin) lanceMin = m.lanceMin;
    if (m.desagioMax !== null && (desagioMax === null || m.desagioMax > desagioMax)) desagioMax = m.desagioMax;
  }
  return {
    id: `${grupo ? "g" : "c"}:${membros[0].chave}`,
    grupo,
    x: n.x,
    y: n.y,
    total: n.total,
    r: grupo ? raioGrupo(n.total, o.maiorCidade, o.somaTotal, o.fator) : raioCidade(n.total, o.maiorCidade, o.fator),
    membros,
    lanceMin: Number.isFinite(lanceMin) ? lanceMin : 0,
    desagioMax,
  };
}

/**
 * Agrupa as cidades cujas bolhas se encostariam na tela nesta escala. Aglomerativo: a cada passada, cada
 * nó (do maior para o menor) engole os vizinhos que encostam nele; repete até nada mais encostar.
 * Uma grade de células evita comparar todos com todos (1.200 pontos: menos de 2 ms).
 */
export function agrupar(pontos: readonly PontoProjetado[], o: OpcoesAgrupar): NoMapa[] {
  const ordenados = [...pontos].sort(ordemPontos);
  const nos: NoTrabalho[] = ordenados.map((p) => ({
    membros: [p],
    total: p.total,
    sx: p.x * Math.max(1, p.total),
    sy: p.y * Math.max(1, p.total),
    peso: Math.max(1, p.total),
    x: p.x,
    y: p.y,
    r: raioCidade(p.total, o.maiorCidade, o.fator),
    vivo: true,
  }));
  if (o.agrupar === false || nos.length < 2) return nos.map((n) => fechar(n, o));

  const k = o.escala;
  const celula = 2 * Math.max(RAIO_GRUPO_MAX, RAIO_ALVO) + ESPACO;
  for (let passada = 0; passada < 12; passada++) {
    const grade = new Map<string, number[]>();
    nos.forEach((n, i) => {
      if (!n.vivo) return;
      const chave = `${Math.floor((n.x * k) / celula)},${Math.floor((n.y * k) / celula)}`;
      const lista = grade.get(chave);
      if (lista) lista.push(i);
      else grade.set(chave, [i]);
    });
    let mudou = false;
    for (let i = 0; i < nos.length; i++) {
      const a = nos[i];
      if (!a.vivo) continue;
      const gx = Math.floor((a.x * k) / celula);
      const gy = Math.floor((a.y * k) / celula);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const vizinhos = grade.get(`${gx + dx},${gy + dy}`);
          if (!vizinhos) continue;
          for (const j of vizinhos) {
            const b = nos[j];
            if (j === i || !b.vivo) continue;
            const d = Math.hypot((a.x - b.x) * k, (a.y - b.y) * k);
            if (d >= Math.max(a.r, RAIO_ALVO) + Math.max(b.r, RAIO_ALVO) + ESPACO) continue;
            // b entra em a
            a.membros = a.membros.concat(b.membros);
            a.total += b.total;
            a.sx += b.sx;
            a.sy += b.sy;
            a.peso += b.peso;
            a.x = a.sx / a.peso;
            a.y = a.sy / a.peso;
            a.r = raioGrupo(a.total, o.maiorCidade, o.somaTotal, o.fator);
            b.vivo = false;
            mudou = true;
          }
        }
      }
    }
    if (!mudou) break;
  }
  return nos.filter((n) => n.vivo).map((n) => fechar(n, o));
}

/**
 * Zoom em que um grupo "abre": vira pelo menos 4 bolhas (ou todas as cidades, se forem menos) ou nenhuma
 * parte fica com mais da metade das cidades. Pelo menos 1,5× o zoom atual; no zoom máximo não há
 * agrupamento, então sempre termina.
 */
export function zoomParaSeparar(
  membros: readonly PontoProjetado[],
  escalaBase: number,
  zAtual: number,
  zMax: number,
  o: Omit<OpcoesAgrupar, "escala" | "agrupar">,
): number {
  const alvoPartes = Math.min(4, membros.length);
  let z = Math.min(zMax, zAtual * 1.5);
  for (let i = 0; i < 30 && z < zMax; i++) {
    const partes = agrupar(membros, { ...o, escala: escalaBase * z });
    const maior = Math.max(...partes.map((n) => n.membros.length));
    if (partes.length >= alvoPartes || maior <= membros.length / 2) return z;
    z = Math.min(zMax, z * 1.25);
  }
  return zMax;
}

export interface RotuloCidade {
  id: string;
  texto: string;
  /** ponto de ancoragem na tela (centro da bolha) e lado do texto */
  x: number;
  y: number;
  r: number;
  lado: "dir" | "esq";
}

export interface CandidatoRotulo {
  id: string;
  sx: number;
  sy: number;
  r: number;
  total: number;
  /** nome a escrever; null = só ocupa espaço (grupo sem cidade dominante) */
  texto: string | null;
}

/** Nome para o rótulo de um nó: a cidade, ou a cidade que tem ≥ 60% dos imóveis do grupo. */
export function nomeDoNo(n: Pick<NoMapa, "grupo" | "total" | "membros">): string | null {
  const maior = n.membros[0];
  if (!n.grupo) return maior.cidade;
  return maior.total >= n.total * 0.6 ? maior.cidade : null;
}

export interface OpcoesRotulos {
  /** quantos nomes no máximo */
  maximo?: number;
  /** só as N cidades com mais imóveis disputam um nome (as pequenas da borda não ganham no lugar delas) */
  considerar?: number;
  totalMinimo?: number;
  /** limite direito dos nomes (px): a coluna de botões fica à direita */
  limiteDir?: number;
}

/**
 * Nomes das cidades ao lado das bolhas (só com zoom suficiente), das que têm mais imóveis para as que têm
 * menos, sem encostar em outro nome nem em outra bolha. Coordenadas de tela.
 */
export function escolherRotulos(
  nos: readonly CandidatoRotulo[],
  largura: number,
  altura: number,
  o: OpcoesRotulos = {},
): RotuloCidade[] {
  const maximo = o.maximo ?? 24;
  const totalMinimo = o.totalMinimo ?? 0;
  const direita = Math.min(largura, o.limiteDir ?? largura) - 2;
  type Ret = [number, number, number, number];
  const ocupados: Ret[] = nos.map((n) => [n.sx - n.r, n.sy - n.r, n.sx + n.r, n.sy + n.r]);
  const cruza = (a: Ret, b: Ret) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const saida: RotuloCidade[] = [];
  const ordem = nos
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.texto && n.total >= totalMinimo && n.sx > 0 && n.sx < largura && n.sy > 0 && n.sy < altura)
    .sort((a, b) => b.n.total - a.n.total)
    .slice(0, o.considerar ?? Infinity);
  for (const { n, i } of ordem) {
    if (saida.length >= maximo) break;
    const texto = n.texto!;
    const largTexto = texto.length * 6.4 + 4;
    for (const lado of ["dir", "esq"] as const) {
      const x0 = lado === "dir" ? n.sx + n.r + 3 : n.sx - n.r - 3 - largTexto;
      const ret: Ret = [x0, n.sy - 8, x0 + largTexto, n.sy + 8];
      if (ret[0] < 2 || ret[2] > direita || ret[1] < 2 || ret[3] > altura - 2) continue;
      if (ocupados.some((oc, j) => j !== i && cruza(oc, ret))) continue;
      ocupados.push(ret);
      saida.push({ id: n.id, texto, x: n.sx, y: n.sy, r: n.r, lado });
      break;
    }
  }
  return saida;
}
