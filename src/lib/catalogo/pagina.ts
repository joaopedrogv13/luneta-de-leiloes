/**
 * Monta a página do imóvel (PaginaImovel) com o plano aplicado: o que o servidor manda ao navegador. Separado de
 * servidor.ts (server-only) para os testes montarem a página do Lente pelo mesmo caminho e conferirem que nada da
 * Luneta sai (src/lib/catalogo/pagina.test.ts). Sem imports com "@/".
 */
import type { DadosConjunto } from "./conjuntos";
import { coberturaPrecos, contarPorCidade, itbiDaCidade, referenciasItbi, type DadosItbi } from "./itbi";
import { aplicarPlanoPagina, pode } from "./planos";
import type { ImovelResumo, PaginaImovel, Plano } from "./tipos";
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
 * localização), ou null se o id não existe. Referências: primeiro as da base (rua, bairro, cidade, UF; fonte
 * "leiloes"), depois as do ITBI da cidade (rua, bairro, cidade; fonte "itbi"). Nos exemplos, a cobertura sai sem a
 * contagem da base.
 *
 * Plano (planos.ts): no Lente, sem tags, selo, explicação do selo, nota de localização (`localizacao: null`, e ela nem
 * é lida), preço da região (`referencias: []`, e o ITBI nem é calculado) e buscas nos portais (`buscasExternas: []`).
 * A cobertura de preços (de quais cidades a Luneta tem o dado) e os parecidos continuam: são do Lente. `travas` lista o
 * que falta.
 */
export async function montarPaginaImovel(
  d: DadosConjunto,
  id: string,
  plano: Plano,
  itbi: DadosItbi,
  agora: Date = new Date(),
): Promise<PaginaImovel | null> {
  const k = d.posicao.get(id);
  if (k === undefined) return null;
  const veRegiao = pode(plano, "regiao");
  const veLocal = pode(plano, "localizacao");
  const [detalhe, localizacao] = await Promise.all([d.detalhe(id), veLocal ? d.localizacao(id) : Promise.resolve(null)]);
  if (!detalhe) return null;
  const item = d.itens[k]!;
  const contexto = d.contexto(k);
  const viz = vizinhanca(item, d.itens, agora, contexto);
  const previa = d.conjunto === "previa";
  // ITBI também nos exemplos: o imóvel é fictício, mas o bairro e a cidade são reais (e a tela diz "Exemplo fictício")
  const precos = veRegiao ? referenciasItbi(itbiDaCidade(itbi, item), item, contexto.rua ?? null) : [];
  // o que o plano não vê sai aqui (planos.ts › aplicarPlanoPagina, testado em planos.test.ts e pagina.test.ts)
  return aplicarPlanoPagina(
    {
      imovel: detalhe,
      vizinhanca: { ...viz, referencias: [...viz.referencias, ...precos], cobertura: coberturaPrecos(itbi, item, previa ? contagemPorCidade(d.itens) : null) },
      selosDesligados: d.selosDesligados,
      sobre: d.sobre,
      localizacao,
      travas: [],
    },
    plano,
  );
}
