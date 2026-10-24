/**
 * Catálogo no servidor: o que as páginas (/previa, /assinante e as páginas de imóvel) e a API
 * (/api/catalogo) chamam. Aplica o plano antes de devolver (src/lib/catalogo/planos.ts): no Lente, nada de tags,
 * selo, explicação do selo, nota de localização, preço da região (leilões e ITBI) nem buscas nos portais sai daqui
 * (o conteúdo bloqueado nunca chega ao navegador); `travas` diz o que o plano não vê.
 *
 *   const busca = buscaDaUrl("previa", await searchParams);
 *   const resultado = await buscar(busca);                     // primeira pintura da lista
 *   const pagina = await paginaImovel("previa", id, plano);    // null → notFound()
 */
import "server-only";
import { buscar as buscarNoIndice, POR_PAGINA_MAXIMO } from "./consulta";
import { dadosDoConjunto } from "./dados";
import { lerItbi, type DadosItbi } from "./itbi";
import { montarPaginaImovel } from "./pagina";
import { paraPlano } from "./planos";
import type { Busca, Conjunto, ImovelResumo, PaginaImovel, Plano, ResultadoBusca, ResumoVitrine, SobreConjunto } from "./tipos";
import { contarAtivos } from "./vitrine";
import { lerBusca } from "./url";

export { lerBusca };

type Entrada = URLSearchParams | Record<string, string | string[] | undefined>;

/** "previa" | "exemplos", ou null para qualquer outra coisa. */
export function lerConjunto(valor: string | string[] | null | undefined): Conjunto | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v === "previa" || v === "exemplos" ? v : null;
}

/**
 * Busca a partir dos parâmetros da URL (mesmo formato da página e da API; ver src/lib/catalogo/url.ts).
 * Valores desconhecidos são ignorados; `porPagina` (só da API) vai de 1 a 96.
 */
export function buscaDaUrl(conjunto: Conjunto, entrada: Entrada): Busca {
  const e = lerBusca(entrada);
  const bruto = entrada instanceof URLSearchParams ? entrada.get("porPagina") : [entrada.porPagina].flat()[0];
  const porPagina = bruto ? Math.floor(Number(bruto)) : NaN;
  return {
    conjunto,
    plano: e.plano,
    filtros: e.filtros,
    ordem: e.ordem,
    pagina: e.pagina,
    ...(Number.isFinite(porPagina) && porPagina >= 1 ? { porPagina: Math.min(POR_PAGINA_MAXIMO, porPagina) } : {}),
  };
}

/**
 * Filtra, ordena, pagina e agrega no servidor; devolve só a página pedida, com o plano aplicado.
 * `{ mapa: false }` devolve `mapa: []` (o mapa escondido não precisa dos pontos; ver `?mapa=0` na API);
 * `{ facetas: false }`, facetas vazias (o pedido do mapa não as usa; `?facetas=0`).
 */
export async function buscar(busca: Busca, opcoes: { mapa?: boolean; facetas?: boolean } = {}): Promise<ResultadoBusca> {
  const d = await dadosDoConjunto(busca.conjunto);
  const r = buscarNoIndice(d.indice, busca, { selosDesligados: d.selosDesligados, mapa: opcoes.mapa, facetas: opcoes.facetas });
  return { ...r, sobre: d.sobre, ...(d.vitrine ? { vitrine: resumoVitrine(d, busca) } : {}) };
}

/**
 * A vitrine na resposta: quantos a vitrine mostra, quantos a base inteira tem e quantos ela daria com os mesmos filtros
 * e o mesmo plano (uma busca de 1 item na prévia, sem facetas nem mapa: poucos milissegundos), e os exemplos
 * fictícios com o plano aplicado (no Lente, sem tags, selo e nota).
 */
function resumoVitrine(d: Awaited<ReturnType<typeof dadosDoConjunto>>, busca: Busca): ResumoVitrine {
  const v = d.vitrine!;
  const base = buscarNoIndice(v.base.indice, { ...busca, conjunto: "previa", pagina: 1, porPagina: 1 }, {
    selosDesligados: v.base.selosDesligados,
    mapa: false,
    facetas: false,
  });
  return {
    mostrados: d.indice.n,
    totalBase: base.totalConjunto,
    naBase: base.total,
    exemplos: v.exemplos.map((x) => paraPlano(x, busca.plano)),
  };
}

/** ITBI (base/saida/site/itbi), lido uma vez por instância; um erro não fica guardado. */
let itbiCarregado: Promise<DadosItbi> | null = null;
function dadosItbi(): Promise<DadosItbi> {
  if (!itbiCarregado) {
    itbiCarregado = lerItbi();
    itbiCarregado.catch(() => (itbiCarregado = null));
  }
  return itbiCarregado;
}

/**
 * Página do imóvel com o plano aplicado (src/lib/catalogo/pagina.ts › montarPaginaImovel), ou null se o id não existe.
 * No Lente, sem tags, selo, explicação do selo, nota de localização, preço da região (leilões e ITBI) e buscas nos
 * portais; a cobertura de preços e os parecidos continuam. `travas` lista o que falta.
 */
export async function paginaImovel(conjunto: Conjunto, id: string, plano: Plano): Promise<PaginaImovel | null> {
  const [d, itbi] = await Promise.all([dadosDoConjunto(conjunto), dadosItbi()]);
  return montarPaginaImovel(d, id, plano, itbi);
}

/**
 * O id existe no conjunto? Para o layout da página do imóvel (404 antes do esqueleto): só a lista e o detalhe, sem
 * plano, sem ler a nota nem calcular o ITBI (antes o layout montava a página inteira da Luneta em todo pedido, também
 * no Lente; revisão final da rodada 4, R4-VAZ-08).
 */
export async function existeImovel(conjunto: Conjunto, id: string): Promise<boolean> {
  const d = await dadosDoConjunto(conjunto);
  return d.posicao.has(id) && (await d.detalhe(id)) !== null;
}

/** Quando e de que fontes o conjunto foi gerado (rodapé, faixa da prévia). */
export async function sobreConjunto(
  conjunto: Conjunto,
): Promise<SobreConjunto & { total: number; selosDesligados: boolean; vitrine?: { mostrados: number; totalBase: number } }> {
  const d = await dadosDoConjunto(conjunto);
  // mesmo total que a busca sem filtro (totalConjunto): sem as praças vencidas há mais de 1 dia
  const ativos = (itens: readonly ImovelResumo[]) => contarAtivos(itens);
  // na vitrine, o total é o dos imóveis reais da lista (os exemplos fictícios ficam à parte)
  const total = ativos(d.vitrine ? d.indice.itens : d.itens);
  return {
    ...d.sobre,
    total,
    selosDesligados: d.selosDesligados,
    ...(d.vitrine ? { vitrine: { mostrados: total, totalBase: ativos(d.vitrine.base.itens) } } : {}),
  };
}
