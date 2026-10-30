/**
 * As fontes do instantâneo para a faixa da prévia, o rodapé "Sobre os dados" e o relatório em PDF. Com o PBCV, cada
 * leiloeiro é uma fonte (`ll_<slug>`, base/leiloeiros/README.md): são ~500, e listar um por um enchia a primeira tela da
 * prévia e uma página do PDF. Aqui os leiloeiros viram uma linha só ("425 leiloeiros"), com a soma dos imóveis e o
 * intervalo das datas; as outras fontes (Caixa, Leilões Judiciais) ficam como estão. PURO (sem fs, sem rede).
 */
import type { SobreConjunto } from "./tipos";

/** Prefixo do id de fonte de cada leiloeiro na base (`ll_<slug com _>`). */
export const PREFIXO_FONTE_LEILOEIRO = "ll_";
/** id da linha que junta os leiloeiros. */
export const ID_GRUPO_LEILOEIROS = "leiloeiros";

export interface FonteResumida {
  id: string;
  nome: string;
  total: number;
  /** data dos dados na fonte; no grupo, a mais antiga */
  geradoNaFonteEm: string | null;
  /** só no grupo: a data mais nova (igual à mais antiga quando todas são do mesmo dia) */
  geradoAte: string | null;
  /** só no grupo: quantos leiloeiros têm imóvel no instantâneo */
  leiloeiros: number | null;
}

type Fonte = SobreConjunto["fontes"][number];

const ehLeiloeiro = (f: Pick<Fonte, "id">) => f.id.startsWith(PREFIXO_FONTE_LEILOEIRO);

/**
 * Junta os leiloeiros numa linha, no lugar do primeiro deles. Leiloeiro sem imóvel no instantâneo (coleta quebrada,
 * bloqueada ou só com praça vencida) não conta. Um leiloeiro só continua com o próprio nome.
 */
export function resumirFontes(fontes: readonly Fonte[]): FonteResumida[] {
  const leiloeiros = fontes.filter((f) => ehLeiloeiro(f) && f.total > 0);
  const saida: FonteResumida[] = [];
  let grupoPosto = false;
  for (const f of fontes) {
    if (!ehLeiloeiro(f)) {
      saida.push({ ...f, geradoAte: null, leiloeiros: null });
      continue;
    }
    if (grupoPosto || f.total <= 0) continue;
    grupoPosto = true;
    if (leiloeiros.length === 1) {
      saida.push({ ...f, geradoAte: null, leiloeiros: null });
      continue;
    }
    const datas = leiloeiros
      .map((l) => l.geradoNaFonteEm)
      .filter((d): d is string => !!d && !Number.isNaN(Date.parse(d)))
      .sort((a, b) => Date.parse(a) - Date.parse(b));
    saida.push({
      id: ID_GRUPO_LEILOEIROS,
      nome: `${new Intl.NumberFormat("pt-BR").format(leiloeiros.length)} leiloeiros`,
      total: leiloeiros.reduce((s, l) => s + l.total, 0),
      geradoNaFonteEm: datas[0] ?? null,
      geradoAte: datas.at(-1) ?? null,
      leiloeiros: leiloeiros.length,
    });
  }
  return saida;
}

/**
 * "08/10/2026", ou "28/10/2026 a 29/10/2026" no grupo com dias diferentes. `formatar` é o formatador de data de quem
 * chama (o do catálogo ou o do relatório); null = sem data.
 */
export function periodoDaFonte(f: Pick<FonteResumida, "geradoNaFonteEm" | "geradoAte">, formatar: (iso: string) => string | null): string | null {
  const de = f.geradoNaFonteEm ? formatar(f.geradoNaFonteEm) : null;
  const ate = f.geradoAte ? formatar(f.geradoAte) : null;
  if (!de) return ate;
  return ate && ate !== de ? `${de} a ${ate}` : de;
}
