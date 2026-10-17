/**
 * Catálogo no servidor: o que as páginas (/previa, /assinante e as páginas de imóvel) e a API
 * (/api/catalogo) chamam. Aplica o plano antes de devolver: no Lente, nada de tags, selo nem a
 * explicação do selo sai daqui (o conteúdo bloqueado nunca chega ao navegador).
 *
 *   const busca = buscaDaUrl("previa", await searchParams);
 *   const resultado = await buscar(busca);                     // primeira pintura da lista
 *   const pagina = await paginaImovel("previa", id, plano);    // null → notFound()
 */
import "server-only";
import { buscar as buscarNoIndice, paraPlano, POR_PAGINA_MAXIMO } from "./consulta";
import { dadosDoConjunto } from "./dados";
import { coberturaPrecos, contarPorCidade, itbiDaCidade, lerItbi, referenciasItbi, type DadosItbi } from "./itbi";
import type { Busca, Conjunto, ImovelResumo, PaginaImovel, Plano, ResultadoBusca, SobreConjunto } from "./tipos";
import { lerBusca } from "./url";
import { vizinhanca } from "./vizinhanca";

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
  return { ...r, sobre: d.sobre };
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

/** Imóveis da base por cidade (para a tabela de cobertura), contados uma vez por lista. */
const contagens = new WeakMap<readonly ImovelResumo[], Map<string, number>>();
function contagemPorCidade(itens: readonly ImovelResumo[]): Map<string, number> {
  let c = contagens.get(itens);
  if (!c) contagens.set(itens, (c = contarPorCidade(itens)));
  return c;
}

/**
 * Página do imóvel (detalhe, preço do m² na região, parecidos, buscas externas e cobertura de preços), ou null
 * se o id não existe. Referências: primeiro as da base (rua, bairro, cidade, UF; fonte "leiloes"), depois as do
 * ITBI da cidade (rua, bairro, cidade; fonte "itbi"). Nos exemplos, a cobertura sai sem a contagem da base.
 */
export async function paginaImovel(conjunto: Conjunto, id: string, plano: Plano): Promise<PaginaImovel | null> {
  const d = await dadosDoConjunto(conjunto);
  const k = d.posicao.get(id);
  if (k === undefined) return null;
  const [detalhe, itbi] = await Promise.all([d.detalhe(id), dadosItbi()]);
  if (!detalhe) return null;
  const item = d.itens[k]!;
  const contexto = d.contexto(k);
  const viz = vizinhanca(item, d.itens, new Date(), contexto);
  const previa = conjunto === "previa";
  // ITBI também nos exemplos: o imóvel é fictício, mas o bairro e a cidade são reais (e a tela diz "Exemplo fictício")
  const precos = referenciasItbi(itbiDaCidade(itbi, item), item, contexto.rua ?? null);
  return {
    imovel: plano === "lente" ? { ...detalhe, tags: [], selo: 0, porQueSelo: "" } : detalhe,
    vizinhanca: {
      ...viz,
      referencias: [...viz.referencias, ...precos],
      parecidos: viz.parecidos.map((p) => paraPlano(p, plano)),
      cobertura: coberturaPrecos(itbi, item, previa ? contagemPorCidade(d.itens) : null),
    },
    selosDesligados: d.selosDesligados,
    sobre: d.sobre,
  };
}

/** Quando e de que fontes o conjunto foi gerado (rodapé, faixa da prévia). */
export async function sobreConjunto(conjunto: Conjunto): Promise<SobreConjunto & { total: number; selosDesligados: boolean }> {
  const d = await dadosDoConjunto(conjunto);
  // mesmo total que a busca sem filtro (totalConjunto): sem as praças vencidas há mais de 1 dia
  const vencidoAntesDe = Date.now() - 24 * 3600 * 1000;
  const total = d.itens.reduce((n, i) => (i.dataPraca !== null && Date.parse(i.dataPraca) < vencidoAntesDe ? n : n + 1), 0);
  return { ...d.sobre, total, selosDesligados: d.selosDesligados };
}
