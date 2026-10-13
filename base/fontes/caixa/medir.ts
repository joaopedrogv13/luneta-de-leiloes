/**
 * Mede o conector da Caixa num CSV inteiro, sem banco e sem rede:
 * cobertura do parser da "Descrição", modalidades, deságio e tempo.
 *
 *   node --experimental-strip-types base/fontes/caixa/medir.ts <Lista_imoveis_geral.csv> [--json]
 */
import { readFileSync } from "node:fs";
import { calcularDesconto } from "../../gravar.ts";
import { lerNumeroBR } from "../../util/numero.ts";
import { interpretarDescricao } from "./descricao.ts";
import { normalizarCaixa } from "./index.ts";
import { decodificarLista, interpretarLista } from "./lista.ts";

export interface Medicao {
  arquivo: string;
  gerado_em: string;
  linhas: number;
  invalidas: number;
  ms_leitura: number;
  ms_normalizacao: number;
  descricao: {
    campos: Record<string, { n: number; pct: number }>;
    linhas_com_pedaco_desconhecido: number;
    pedacos_desconhecidos: Record<string, number>;
  };
  modalidades: Record<string, { n: number; pct: number; preco_acima_avaliacao: number; desagio_mediano: number | null }>;
  tipos: Record<string, number>;
  financiamento: Record<string, number>;
  desagio: {
    com_avaliacao: number;
    media: number;
    /** Média só dos imóveis com preço até a avaliação (o Leilão SFI tem preço até 170× a avaliação). */
    media_sem_preco_acima: number;
    /** Preço maior que a avaliação (comparação em centavos, não pelo deságio arredondado). */
    preco_acima: number;
    /** Preço igual à avaliação, centavo a centavo. */
    preco_igual: number;
    p10: number;
    p25: number;
    mediana: number;
    p75: number;
    p90: number;
    minimo: number;
    maximo: number;
    faixas: Record<string, number>;
    /** Linhas em que a coluna Desconto difere do cálculo em mais de 0,05 ponto (ignorando preço > avaliação). */
    divergencias_coluna_desconto: number;
    coluna_desconto_zero_com_preco_acima: number;
  };
}

function quantil(ordenados: readonly number[], q: number): number {
  if (ordenados.length === 0) return Number.NaN;
  const pos = (ordenados.length - 1) * q;
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  const a = ordenados[baixo] ?? 0;
  const b = ordenados[alto] ?? 0;
  return Math.round((a + (b - a) * (pos - baixo)) * 100) / 100;
}

const media = (valores: readonly number[]): number =>
  Math.round((valores.reduce((s, d) => s + d, 0) / Math.max(1, valores.length)) * 100) / 100;

const pct = (n: number, total: number): number => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);

/** Preço contra avaliação, em centavos: o deságio arredondado esconde casos como 305.011,21 × 305.000,00 (−0,0037% → 0). */
export type Relacao = "acima" | "igual" | "abaixo";
export function relacaoPreco(preco: number, avaliacao: number): Relacao {
  const p = Math.round(preco * 100);
  const a = Math.round(avaliacao * 100);
  return p > a ? "acima" : p === a ? "igual" : "abaixo";
}

const FAIXAS: ReadonlyArray<readonly [string, (d: number, r: Relacao) => boolean]> = [
  ["< 0 (preço acima da avaliação)", (_, r) => r === "acima"],
  ["0 (preço igual à avaliação)", (_, r) => r === "igual"],
  ["0–10%", (d, r) => r === "abaixo" && d < 10],
  ["10–20%", (d) => d >= 10 && d < 20],
  ["20–30%", (d) => d >= 20 && d < 30],
  ["30–40%", (d) => d >= 30 && d < 40],
  ["40–50%", (d) => d >= 40 && d < 50],
  ["50–60%", (d) => d >= 50 && d < 60],
  ["60–70%", (d) => d >= 60 && d < 70],
  ["≥ 70%", (d) => d >= 70],
];

export function medir(arquivo: string): Medicao {
  const t0 = performance.now();
  const lista = interpretarLista(decodificarLista(readFileSync(arquivo)));
  const t1 = performance.now();
  const total = lista.registros.length;
  const campos: Record<string, number> = {
    tipo: 0, area_total: 0, area_privativa: 0, area_terreno: 0, alguma_area: 0, quartos: 0, vagas: 0, salas: 0, lavabos: 0,
  };
  const desconhecidos = new Map<string, number>();
  let linhasDesconhecidas = 0;
  const modalidades = new Map<string, { n: number; acima: number; desagios: number[] }>();
  const tipos = new Map<string, number>();
  const financiamento = new Map<string, number>();
  const desagios: number[] = [];
  const relacoes: Array<{ d: number; r: Relacao }> = [];
  let divergencias = 0;
  let zeroComPrecoAcima = 0;
  let invalidas = 0;

  for (const r of lista.registros) {
    const d = interpretarDescricao(r.campos.descricao);
    if (d.tipo_fonte) campos.tipo = (campos.tipo ?? 0) + 1;
    for (const campo of ["area_total", "area_privativa", "area_terreno", "quartos", "vagas", "salas", "lavabos"] as const) {
      if (d[campo] !== null) campos[campo] = (campos[campo] ?? 0) + 1;
    }
    if (d.area_total !== null || d.area_privativa !== null || d.area_terreno !== null) campos.alguma_area = (campos.alguma_area ?? 0) + 1;
    if (d.desconhecidos.length > 0) linhasDesconhecidas++;
    for (const p of d.desconhecidos) desconhecidos.set(p, (desconhecidos.get(p) ?? 0) + 1);

    let imovel;
    try {
      imovel = normalizarCaixa({ linha: r.campos, linhaArquivo: r.linhaArquivo, problema: r.problema, detalhe: null });
    } catch {
      invalidas++;
      continue;
    }
    tipos.set(imovel.tipo, (tipos.get(imovel.tipo) ?? 0) + 1);
    financiamento.set(String(imovel.aceita_financiamento), (financiamento.get(String(imovel.aceita_financiamento)) ?? 0) + 1);
    const rotulo = imovel.modalidade_fonte ?? "?";
    const m = modalidades.get(rotulo) ?? { n: 0, acima: 0, desagios: [] };
    m.n++;
    const preco = imovel.preco ?? null;
    const avaliacao = imovel.valor_avaliacao ?? null;
    const desagio = calcularDesconto(preco, avaliacao);
    if (desagio !== null && preco !== null && avaliacao !== null) {
      const relacao = relacaoPreco(preco, avaliacao);
      desagios.push(desagio);
      relacoes.push({ d: desagio, r: relacao });
      m.desagios.push(desagio);
      if (relacao === "acima") m.acima++;
      const coluna = lerNumeroBR(r.campos.desconto, { decimal: "." });
      if (coluna !== null) {
        if (relacao === "acima") {
          if (coluna === 0) zeroComPrecoAcima++;
        } else if (Math.abs(coluna - desagio) > 0.05) divergencias++;
      }
    }
    modalidades.set(rotulo, m);
  }
  const t2 = performance.now();
  const ordenados = [...desagios].sort((a, b) => a - b);
  const faixas: Record<string, number> = {};
  for (const [nome, teste] of FAIXAS) faixas[nome] = relacoes.filter(({ d, r }) => teste(d, r)).length;

  return {
    arquivo,
    gerado_em: lista.geradoEm,
    linhas: total,
    invalidas,
    ms_leitura: Math.round(t1 - t0),
    ms_normalizacao: Math.round(t2 - t1),
    descricao: {
      campos: Object.fromEntries(Object.entries(campos).map(([k, n]) => [k, { n, pct: pct(n, total) }])),
      linhas_com_pedaco_desconhecido: linhasDesconhecidas,
      pedacos_desconhecidos: Object.fromEntries([...desconhecidos].sort((a, b) => b[1] - a[1]).slice(0, 30)),
    },
    modalidades: Object.fromEntries(
      [...modalidades].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [
        k,
        { n: v.n, pct: pct(v.n, total), preco_acima_avaliacao: v.acima, desagio_mediano: v.desagios.length ? quantil([...v.desagios].sort((a, b) => a - b), 0.5) : null },
      ]),
    ),
    tipos: Object.fromEntries([...tipos].sort((a, b) => b[1] - a[1])),
    financiamento: Object.fromEntries(financiamento),
    desagio: {
      com_avaliacao: ordenados.length,
      media: media(ordenados),
      media_sem_preco_acima: media(relacoes.filter(({ r }) => r !== "acima").map(({ d }) => d)),
      preco_acima: relacoes.filter(({ r }) => r === "acima").length,
      preco_igual: relacoes.filter(({ r }) => r === "igual").length,
      p10: quantil(ordenados, 0.1),
      p25: quantil(ordenados, 0.25),
      mediana: quantil(ordenados, 0.5),
      p75: quantil(ordenados, 0.75),
      p90: quantil(ordenados, 0.9),
      minimo: ordenados[0] ?? Number.NaN,
      maximo: ordenados[ordenados.length - 1] ?? Number.NaN,
      faixas,
      divergencias_coluna_desconto: divergencias,
      coluna_desconto_zero_com_preco_acima: zeroComPrecoAcima,
    },
  };
}

function formatar(m: Medicao): string {
  const l: string[] = [];
  l.push(`Arquivo: ${m.arquivo} (gerado em ${m.gerado_em})`);
  l.push(`Linhas: ${m.linhas} · inválidas: ${m.invalidas} · leitura ${m.ms_leitura} ms · normalização ${m.ms_normalizacao} ms`);
  l.push("", "Cobertura do parser da Descrição (linhas com o campo preenchido):");
  for (const [k, v] of Object.entries(m.descricao.campos)) l.push(`  ${k.padEnd(15)} ${String(v.n).padStart(6)}  ${v.pct.toFixed(2)}%`);
  l.push(`  linhas com pedaço não reconhecido: ${m.descricao.linhas_com_pedaco_desconhecido}`);
  for (const [p, n] of Object.entries(m.descricao.pedacos_desconhecidos)) l.push(`    ${n}× ${JSON.stringify(p)}`);
  l.push("", "Modalidades:");
  for (const [k, v] of Object.entries(m.modalidades)) {
    l.push(`  ${k.padEnd(26)} ${String(v.n).padStart(6)}  ${v.pct.toFixed(2)}%  preço > avaliação: ${v.preco_acima_avaliacao}  deságio mediano: ${v.desagio_mediano ?? "-"}%`);
  }
  l.push("", `Tipos: ${Object.entries(m.tipos).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  l.push(`Financiamento: ${Object.entries(m.financiamento).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  const d = m.desagio;
  l.push("", `Deságio calculado (100 × (1 − preço/avaliação)), ${d.com_avaliacao} imóveis:`);
  l.push(`  média ${d.media}% (só preço ≤ avaliação: ${d.media_sem_preco_acima}%) · p10 ${d.p10}% · p25 ${d.p25}% · mediana ${d.mediana}% · p75 ${d.p75}% · p90 ${d.p90}% · mín ${d.minimo}% · máx ${d.maximo}%`);
  for (const [faixa, n] of Object.entries(d.faixas)) l.push(`  ${faixa.padEnd(32)} ${String(n).padStart(6)}  ${pct(n, d.com_avaliacao).toFixed(2)}%`);
  l.push(`  preço acima da avaliação: ${d.preco_acima} · igual: ${d.preco_igual} (comparação em centavos)`);
  l.push(`  coluna Desconto = 0 com preço acima da avaliação: ${d.coluna_desconto_zero_com_preco_acima}`);
  l.push(`  coluna Desconto diferente do cálculo (> 0,05 ponto, preço ≤ avaliação): ${d.divergencias_coluna_desconto}`);
  return l.join("\n");
}

const caminho = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}` && caminho) {
  const m = medir(caminho);
  process.stdout.write((process.argv.includes("--json") ? JSON.stringify(m, null, 2) : formatar(m)) + "\n");
}
