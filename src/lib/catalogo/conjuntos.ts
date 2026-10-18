/**
 * Os conjuntos do catálogo montados a partir dos arquivos (sem cache e sem nada do Next): o servidor os guarda em
 * memória por src/lib/catalogo/dados.ts (server-only), e os testes montam a página do imóvel com eles
 * (src/lib/catalogo/pagina.ts), pelo mesmo caminho do servidor.
 * - "previa": o instantâneo do banco em base/saida/site (src/lib/catalogo/instantaneo.ts). A lista inteira vem de uma
 *   vez; cada pedaço de detalhes só quando uma página de imóvel precisa dele.
 * - "exemplos": os 6 exemplos fictícios (src/lib/catalogo/exemplos.ts).
 *
 * A nota de localização (src/lib/catalogo/localizacao.ts) entra no resumo de cada imóvel (`notaLocal`) antes do índice
 * e, por imóvel, em `localizacao(id)`: na prévia, dos arquivos base/saida/site/localizacao*.json.gz; nos exemplos,
 * a nota fictícia de src/content/examples.ts.
 *
 * Os dados ficam inteiros (com tags e selo, sem plano aplicado): o navegador recebe só o que src/lib/catalogo/servidor.ts
 * devolve, com o plano já aplicado. Sem imports com "@/".
 */
import type { Listing } from "../../content/examples";
import { criarIndice, type IndiceCatalogo } from "./consulta";
import { converterExemplos, localizacaoDosExemplos, resumoDe } from "./exemplos";
import { lerLista, lerParte, montarDetalhe, parteDoId, type DetalheParcial } from "./instantaneo";
import { dadosLocalizacao, montarLocalizacao, notaLocalDe } from "./localizacao";
import type { Conjunto, ImovelDetalhe, ImovelResumo, LocalizacaoImovel, SobreConjunto } from "./tipos";
import { indiceDeRuas, type ContextoVizinhanca, type RuaDoImovel } from "./vizinhanca";

export interface DadosConjunto {
  conjunto: Conjunto;
  itens: readonly ImovelResumo[];
  indice: IndiceCatalogo;
  sobre: SobreConjunto;
  /** Selos desligados neste conjunto (prévia: critérios pendentes com o advogado). */
  selosDesligados: boolean;
  /** Posição de cada id na lista. */
  posicao: ReadonlyMap<string, number>;
  /** Rua de cada item (mesma posição), tirada do endereço; null sem endereço ou sem nome que identifique a rua. */
  ruas: readonly (RuaDoImovel | null)[];
  /** Rua e imóveis da mesma rua (mesma cidade) do item na posição k, para a vizinhança. */
  contexto(k: number): ContextoVizinhanca;
  /** Detalhe completo (sem plano aplicado), ou null se o id não existe. */
  detalhe(id: string): Promise<ImovelDetalhe | null>;
  /**
   * Nota de localização do imóvel (sem plano aplicado): null quando o conjunto não tem o dado; "pendente" quando o
   * imóvel ainda não foi calculado.
   */
  localizacao(id: string): Promise<LocalizacaoImovel | null>;
}

/** A prévia: o instantâneo da pasta (base/saida/site) com a nota de localização. */
export async function carregarPrevia(pasta: string): Promise<DadosConjunto> {
  const [lista, loc] = await Promise.all([lerLista(pasta), dadosLocalizacao()]);
  // a nota entra no resumo antes do índice (a ordem e o filtro por nota usam o índice)
  for (const i of lista.itens) i.notaLocal = notaLocalDe(loc, i.id);
  const enderecos = lista.enderecos;
  const indice = criarIndice(lista.itens, { textoExtra: (_, k) => enderecos[k] });
  const posicao = new Map(lista.itens.map((i, k) => [i.id, k]));
  const { ruas, contexto } = indiceDeRuas(lista.itens, enderecos);
  const partes = new Map<string, Promise<Map<string, DetalheParcial>>>();
  const parte = (p: string) => {
    let pronta = partes.get(p);
    if (!pronta) {
      pronta = lerParte(pasta, p, lista.geradoEm);
      // falhou (arquivo faltando no deploy?): tenta de novo na próxima página, sem guardar o erro
      pronta.catch(() => partes.delete(p));
      partes.set(p, pronta);
    }
    return pronta;
  };
  return {
    conjunto: "previa",
    itens: lista.itens,
    indice,
    sobre: lista.sobre,
    selosDesligados: true,
    posicao,
    ruas,
    contexto,
    async detalhe(id) {
      const k = posicao.get(id);
      if (k === undefined) return null;
      const parcial = (await parte(parteDoId(id, lista.partes))).get(id);
      if (!parcial) return null;
      return montarDetalhe(lista.itens[k]!, enderecos[k] ?? null, parcial);
    },
    async localizacao(id) {
      const k = posicao.get(id);
      if (k === undefined) return null;
      const i = lista.itens[k]!;
      return montarLocalizacao(loc, id, { cidade: i.cidade, uf: i.uf });
    },
  };
}

/** Os exemplos fictícios (a lista vem de src/content/examples.ts, que usa "@/": quem chama a passa). */
export function carregarExemplos(listings: readonly Listing[], agora: Date = new Date()): DadosConjunto {
  const detalhes = converterExemplos(listings, agora);
  const itens: ImovelResumo[] = detalhes.map(resumoDe);
  const porId = new Map(detalhes.map((d) => [d.id, d]));
  const locs = localizacaoDosExemplos(listings, agora);
  return {
    conjunto: "exemplos",
    itens,
    indice: criarIndice(itens),
    sobre: { geradoEm: agora.toISOString(), fontes: [{ id: "exemplo", nome: "Exemplo fictício", geradoNaFonteEm: null, total: itens.length }] },
    selosDesligados: false,
    posicao: new Map(itens.map((i, k) => [i.id, k])),
    // os exemplos não têm endereço: sem rua
    ruas: itens.map(() => null),
    contexto: () => ({}),
    async detalhe(id) {
      return porId.get(id) ?? null;
    },
    async localizacao(id) {
      return locs.get(id) ?? null;
    },
  };
}
