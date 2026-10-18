/**
 * Os números da página pública "Como a nota é calculada" (/metodologia/localizacao), tirados dos próprios arquivos da
 * nota (base/saida/site/localizacao*.json.gz): pesos, quantos imóveis em cada precisão e situação, quantas cidades
 * pequenas, com mapeamento de risco e com os pontos de ônibus do OpenStreetMap, as regras (raios) e as fontes. Nada
 * digitado à mão: quando o cálculo roda de novo, a página acompanha.
 *
 * A validação com o ITBI (Spearman) é uma medição feita uma vez por cálculo e fica em
 * base/saida/localizacao/medicao-nota.md; os números dela estão em VALIDACAO_ITBI, com a data.
 *
 * Sem imports com "@/" (os testes rodam em Node puro).
 */
import { PESOS_PADRAO, type DadosLocalizacao } from "./localizacao";
import type { ChaveComponenteLocal, PrecisaoLocal } from "./tipos";

export interface ResumoBaseLocal {
  /** AAAA-MM-DD do cálculo */
  geradoEm: string;
  pesos: Record<ChaveComponenteLocal, number>;
  /** imóveis no arquivo */
  total: number;
  porPrecisao: Record<PrecisaoLocal, number>;
  porSituacao: { calculada: number; aproximada: number; semNota: number; pequena: number; cidade: number; rural: number; foraDaBase: number };
  cidades: { total: number; pequenas: number; imoveisPequenas: number; comRisco: number; comOnibusOsm: number; semLazer: number };
  regras: { raioComercioM: number; raioServicoM: number; raioEntornoM: number; pequenaMoradores: number; pequenaCelulas: number; riscoPertoM: number; riscoAproxMaxM: number };
  renda: { variavel: string; valores: string } | null;
  /** data dos dados do OpenStreetMap (AAAA-MM-DD), quando usados */
  osmDe: string | null;
  fontes: { nome: string; detalhe: string; licenca: string; url: string | null }[];
}

/** Resumo da base para a página do método; null sem o arquivo principal. */
export function resumoDaBase(d: DadosLocalizacao): ResumoBaseLocal | null {
  const p = d.principal;
  if (!p) return null;
  const c = p.colunas;
  const n = (c.id as string[]).length;
  const porPrecisao: Record<PrecisaoLocal, number> = { numero: 0, rua: 0, bairro: 0, cidade: 0 };
  const porSituacao = { calculada: 0, aproximada: 0, semNota: 0, pequena: 0, cidade: 0, rural: 0, foraDaBase: 0 };
  for (let k = 0; k < n; k++) {
    const pr = p.precisoes[(c.precisao?.[k] as number | null) ?? 3] as PrecisaoLocal | undefined;
    porPrecisao[pr ?? "cidade"]++;
    const s = p.situacoes[(c.situacao?.[k] as number | null) ?? 2];
    if (s === "calculada") porSituacao.calculada++;
    else if (s === "aproximada") porSituacao.aproximada++;
    else {
      porSituacao.semNota++;
      const m = c.motivo?.[k];
      const motivo = typeof m === "number" ? p.motivos[m] : null;
      if (motivo === "pequena") porSituacao.pequena++;
      else if (motivo === "rural") porSituacao.rural++;
      else if (motivo === "cidade") porSituacao.cidade++;
      else porSituacao.foraDaBase++;
    }
  }
  const lista = Object.values(d.cidades?.cidades ?? {});
  const cidades = {
    total: lista.length,
    pequenas: lista.filter((x) => x.pequena).length,
    imoveisPequenas: porSituacao.pequena,
    comRisco: lista.filter((x) => x.bater).length,
    comOnibusOsm: lista.filter((x) => x.indicadores?.transporte?.includes("onibus_500")).length,
    semLazer: lista.filter((x) => x.fora?.lazer).length,
  };
  const r = (p.regras ?? {}) as Record<string, unknown>;
  const num = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? v : padrao);
  const pesos = { ...PESOS_PADRAO, ...p.pesos };
  return {
    geradoEm: p.gerado_em,
    pesos,
    total: n,
    porPrecisao,
    porSituacao,
    cidades,
    regras: {
      raioComercioM: num(r.raio_comercio_m, 500),
      raioServicoM: num(r.raio_servico_m, 1000),
      raioEntornoM: num(r.raio_entorno_m, 500),
      pequenaMoradores: num(r.cidade_pequena_moradores, 20000),
      pequenaCelulas: num(r.cidade_pequena_celulas, 50),
      riscoPertoM: num(r.risco_perto_m, 100),
      riscoAproxMaxM: num(r.risco_aprox_max_m, 500),
    },
    renda: p.renda ? { variavel: p.renda.variavel, valores: p.renda.valores } : null,
    osmDe: d.osm?.com_osm && d.osm.dados_osm_de ? d.osm.dados_osm_de.slice(0, 10) : null,
    fontes: [
      ...p.fontes.map((f) => ({ nome: f.nome, detalhe: f.detalhe, licenca: f.licenca, url: f.url ?? null })),
      ...(d.osm ? [{ nome: d.osm.fonte.nome, detalhe: d.osm.fonte.detalhe, licenca: d.osm.fonte.licenca, url: d.osm.fonte.url ?? null }] : []),
    ],
  };
}

/** "49,4%" de `parte` em `total` (uma casa decimal). */
export function pctTexto(parte: number, total: number): string {
  if (total <= 0) return "0%";
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format((100 * parte) / total)}%`;
}

/**
 * A conferência dos pesos com o preço pago nas compras registradas (ITBI) em 5 capitais: correlação de postos de
 * Spearman entre a nota no ponto de cada rua e o preço mediano por m² pago nela. Medição de 18/10/2026
 * (base/saida/localizacao/medicao-nota.md); vale para as 5 capitais e não valida o interior.
 */
export const VALIDACAO_ITBI = {
  medidoEm: "2026-10-18",
  cidades: ["São Paulo", "Rio de Janeiro", "Porto Alegre", "Fortaleza", "Recife"],
  pares: 5108,
  recortes: 8,
  mediana: 0.32,
  negativos: 1,
  /** mediana por parte, entre os 8 recortes (cidade e tipo) */
  porParte: { renda: 0.5, infra: 0.29, transporte: 0.18, lazer: 0.02, servicos: 0.0, comercio: -0.07 } satisfies Record<ChaveComponenteLocal, number>,
  /** alguns recortes, para a tabela */
  exemplos: [
    { cidade: "São Paulo", tipo: "apartamentos", ruas: 2333, rho: 0.55 },
    { cidade: "Porto Alegre", tipo: "apartamentos", ruas: 561, rho: 0.39 },
    { cidade: "Rio de Janeiro", tipo: "apartamentos", ruas: 813, rho: 0.32 },
    { cidade: "São Paulo", tipo: "casas", ruas: 455, rho: 0.32 },
    { cidade: "Fortaleza", tipo: "apartamentos", ruas: 364, rho: 0.06 },
    { cidade: "Rio de Janeiro", tipo: "casas", ruas: 97, rho: -0.1 },
  ],
  /** os pesos da decisão inicial e o resultado com eles */
  antes: { pesos: { servicos: 30, transporte: 20, renda: 20, infra: 15, comercio: 10, lazer: 5 } satisfies Record<ChaveComponenteLocal, number>, mediana: 0.24, negativos: 3 },
} as const;
