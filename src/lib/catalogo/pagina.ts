/**
 * Monta a página do imóvel (PaginaImovel) com o plano aplicado: o que o servidor manda ao navegador. Separado de
 * servidor.ts (server-only) para os testes montarem a página do Lente pelo mesmo caminho e conferirem que nada da
 * Luneta sai (src/lib/catalogo/pagina.test.ts). Sem imports com "@/".
 */
import type { DadosConjunto } from "./conjuntos";
import { coberturaPrecos, contarPorCidade, itbiDaCidade, referenciasItbi, type DadosItbi } from "./itbi";
import { aplicarPlanoPagina, pode } from "./planos";
import type { ImovelResumo, PaginaImovel, Plano } from "./tipos";
import { contarAtivos } from "./vitrine";
import { vizinhanca } from "./vizinhanca";

/** Imóveis da base por cidade (para a tabela de cobertura), contados uma vez por lista. */
const contagens = new WeakMap<readonly ImovelResumo[], Map<string, number>>();
function contagemPorCidade(itens: readonly ImovelResumo[]): Map<string, number> {
  let c = contagens.get(itens);
  if (!c) contagens.set(itens, (c = contarPorCidade(itens)));
  return c;
}

/**
 * Página do imóvel (detalhe, preço do m² na região, parecidos, buscas externas, cobertura de preços e nota de
 * localização), ou null se o id não existe. Referências: primeiro as da base (rua, até 1 km, bairro, cidade, UF; fonte
 * "leiloes", com quantos imóveis cada recorte tem em `amostrasLeiloes`), depois as do ITBI da cidade (rua, bairro,
 * cidade; fonte "itbi"). Nos exemplos, a cobertura sai sem a contagem da base.
 *
 * Plano (planos.ts): no Lente, sem tags, selo, explicação do selo, nota de localização (`localizacao: null`, e ela nem
 * é lida), preço da região (`referencias: []`, e o ITBI nem é calculado) e buscas nos portais (`buscasExternas: []`).
 * A cobertura de preços (de quais cidades a Luneta tem o dado) e os parecidos continuam: são do Lente. `travas` lista o
 * que falta.
 *
 * Vitrine da demonstração (`d.origemDe`): o imóvel é montado com os dados do conjunto de origem (o real, com a região,
 * o ITBI e a nota da base inteira; o fictício, com os exemplos). Os parecidos ficam só os que estão na vitrine (os
 * outros não têm página na demonstração): `parecidosForaDaVitrine` diz quantos ficaram de fora, e `vitrine`, quantos a
 * vitrine mostra e quantos a base tem.
 */
export async function montarPaginaImovel(
  d: DadosConjunto,
  id: string,
  plano: Plano,
  itbi: DadosItbi,
  agora: Date = new Date(),
): Promise<PaginaImovel | null> {
  if (!d.posicao.has(id)) return null;
  // a vitrine monta cada imóvel pelo conjunto de onde ele vem
  const o = d.origemDe?.(id) ?? d;
  const k = o.posicao.get(id);
  if (k === undefined) return null;
  const veRegiao = pode(plano, "regiao");
  const veLocal = pode(plano, "localizacao");
  const [detalhe, localizacao] = await Promise.all([o.detalhe(id), veLocal ? o.localizacao(id) : Promise.resolve(null)]);
  if (!detalhe) return null;
  const item = o.itens[k]!;
  const contexto = o.contexto(k);
  const viz = vizinhanca(item, o.itens, agora, contexto);
  const previa = o.conjunto === "previa";
  // ITBI também nos exemplos: o imóvel é fictício, mas o bairro e a cidade são reais (e a tela diz "Exemplo fictício")
  const precos = veRegiao ? referenciasItbi(itbiDaCidade(itbi, item), item, contexto.rua ?? null) : [];
  // na vitrine, só os parecidos que também estão nela têm página na demonstração
  const vitrine = o !== d && d.vitrine && o === d.vitrine.base;
  const parecidos = vitrine ? viz.parecidos.filter((p) => d.posicao.has(p.id)) : viz.parecidos;
  // o que o plano não vê sai aqui (planos.ts › aplicarPlanoPagina, testado em planos.test.ts e pagina.test.ts)
  return aplicarPlanoPagina(
    {
      imovel: detalhe,
      vizinhanca: {
        ...viz,
        parecidos,
        referencias: [...viz.referencias, ...precos],
        cobertura: coberturaPrecos(itbi, item, previa ? contagemPorCidade(o.itens) : null),
        ...(vitrine ? { parecidosForaDaVitrine: viz.parecidos.length - parecidos.length } : {}),
      },
      selosDesligados: o.selosDesligados,
      sobre: o.sobre,
      localizacao,
      travas: [],
      ...(vitrine ? { vitrine: { mostrados: contarAtivos(d.indice.itens, agora), totalBase: contarAtivos(o.itens, agora) } } : {}),
    },
    plano,
  );
}
