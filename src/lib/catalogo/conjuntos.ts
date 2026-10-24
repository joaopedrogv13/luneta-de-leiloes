/**
 * Os conjuntos do catálogo montados a partir dos arquivos (sem cache e sem nada do Next): o servidor os guarda em
 * memória por src/lib/catalogo/dados.ts (server-only), e os testes montam a página do imóvel com eles
 * (src/lib/catalogo/pagina.ts), pelo mesmo caminho do servidor.
 * - "previa": o instantâneo do banco em base/saida/site (src/lib/catalogo/instantaneo.ts). A lista inteira vem de uma
 *   vez; cada pedaço de detalhes só quando uma página de imóvel precisa dele.
 * - "exemplos" (a /assinante): a VITRINE (`montarVitrine`) com os ~10 melhores imóveis reais da prévia, escolhidos por
 *   src/lib/catalogo/vitrine.ts, e os 6 exemplos fictícios (src/lib/catalogo/exemplos.ts) à parte. A lista, os filtros,
 *   o mapa e as facetas usam só os reais; a página de cada um (real ou fictício) é montada com os dados do conjunto de
 *   origem (`origemDe`): o imóvel real tem a região, o ITBI e a nota da base inteira.
 *
 * A nota de localização (src/lib/catalogo/localizacao.ts) entra no resumo de cada imóvel (`notaLocal`) antes do índice
 * e, por imóvel, em `localizacao(id)`: na prévia, dos arquivos base/saida/site/localizacao*.json.gz; nos exemplos,
 * a nota fictícia de src/content/examples.ts. A tag de estação ("Metrô a 450 m", src/lib/catalogo/estacoes.ts) entra
 * nas tags do resumo da prévia, também antes do índice, e no detalhe com a evidência.
 *
 * Os dados ficam inteiros (com tags e selo, sem plano aplicado): o navegador recebe só o que src/lib/catalogo/servidor.ts
 * devolve, com o plano já aplicado. Sem imports com "@/".
 */
import type { Listing } from "../../content/examples";
import { criarIndice, type IndiceCatalogo } from "./consulta";
import { converterExemplos, localizacaoDosExemplos, resumoDe } from "./exemplos";
import { lerLista, lerParte, montarDetalhe, parteDoId, type DetalheParcial } from "./instantaneo";
import { eTagEstacao, tagDetalheEstacao, tagsDeEstacoes } from "./estacoes";
import { contextoEstacoes, dadosLocalizacao, estacoesDe, montarLocalizacao, notaLocalDe } from "./localizacao";
import type { Conjunto, ImovelDetalhe, ImovelResumo, LocalizacaoImovel, SobreConjunto } from "./tipos";
import { escolherVitrine, type EscolhidoVitrine, type OpcoesVitrine } from "./vitrine";
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
  /**
   * Desvio do ponto de cada item (mesma posição), em metros: a incerteza do geocode (no número ~10 m, na rua até 500 m,
   * no bairro até ~2,5 km). NaN sem o dado (só cidade, ou o conjunto não tem a localização). O mapa de verdade desenha
   * o círculo de incerteza com ele (src/lib/catalogo/pontos.ts).
   */
  desvios: Float32Array;
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
  /**
   * De que conjunto o imóvel vem, quando não é deste (a vitrine mostra imóveis da prévia e os exemplos fictícios): a
   * página dele é montada com os dados daquele conjunto. Ausente (ou null) = deste mesmo.
   */
  origemDe?(id: string): DadosConjunto | null;
  /** Só na vitrine: quem foi escolhido (e por quê), os exemplos fictícios à parte e a base inteira (para as contagens). */
  vitrine?: DadosVitrine;
}

export interface DadosVitrine {
  escolhidos: readonly EscolhidoVitrine[];
  /** os exemplos fictícios (sem plano aplicado), fora da lista e dos filtros */
  exemplos: readonly ImovelResumo[];
  /** a base inteira (a prévia): o total e "com estes filtros, a base tem N" */
  base: DadosConjunto;
}

/** A prévia: o instantâneo da pasta (base/saida/site) com a nota de localização. */
export async function carregarPrevia(pasta: string): Promise<DadosConjunto> {
  const [lista, loc] = await Promise.all([lerLista(pasta), dadosLocalizacao()]);
  // a nota e a tag de estação ("Metrô a 450 m", rodada 5) entram no resumo antes do índice (a ordem, o filtro por nota e o
  // filtro "Metrô a até 1 km" usam o índice)
  for (const i of lista.itens) {
    i.notaLocal = notaLocalDe(loc, i.id);
    const estacoes = tagsDeEstacoes(estacoesDe(loc, i.id));
    // na frente das outras positivas: o cartão mostra poucas tags (as graves e de atenção vêm antes de qualquer jeito)
    if (estacoes.length) i.tags = [...estacoes, ...i.tags];
  }
  const enderecos = lista.enderecos;
  const indice = criarIndice(lista.itens, { textoExtra: (_, k) => enderecos[k] });
  const posicao = new Map(lista.itens.map((i, k) => [i.id, k]));
  const { ruas, contexto } = indiceDeRuas(lista.itens, enderecos);
  const desvios = desviosDe(loc, lista.itens);
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
    desvios,
    ruas,
    contexto,
    async detalhe(id) {
      const k = posicao.get(id);
      if (k === undefined) return null;
      const parcial = (await parte(parteDoId(id, lista.partes))).get(id);
      if (!parcial) return null;
      const detalhe = montarDetalhe(lista.itens[k]!, enderecos[k] ?? null, parcial);
      // a tag de estação ganha a evidência (a estação, a distância, a regra e a fonte) e a confiança pela precisão
      if (!detalhe.tags.some((t) => eTagEstacao(t.slug))) return detalhe;
      const { precisao, dadosOsmDe } = contextoEstacoes(loc, id);
      const porModo = new Map(
        estacoesDe(loc, id).map((e) => {
          const t = tagDetalheEstacao(e, precisao, dadosOsmDe);
          return [t.slug, t] as const;
        }),
      );
      return { ...detalhe, tags: detalhe.tags.map((t) => porModo.get(t.slug) ?? t) };
    },
    async localizacao(id) {
      const k = posicao.get(id);
      if (k === undefined) return null;
      const i = lista.itens[k]!;
      return montarLocalizacao(loc, id, { cidade: i.cidade, uf: i.uf });
    },
  };
}

/** Desvio do ponto de cada item, da coluna `desvio_m` da localização (NaN sem o dado). */
function desviosDe(loc: Awaited<ReturnType<typeof dadosLocalizacao>>, itens: readonly ImovelResumo[]): Float32Array {
  const coluna = loc.principal?.colunas.desvio_m;
  return Float32Array.from(itens, (i) => {
    const k = loc.posicao.get(i.id);
    const v = k === undefined ? null : coluna?.[k];
    return typeof v === "number" && Number.isFinite(v) ? v : NaN;
  });
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
    desvios: Float32Array.from(itens, (i) => locs.get(i.id)?.desvioM ?? NaN),
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

/**
 * A vitrine da demonstração (/assinante): os melhores imóveis reais da prévia (src/lib/catalogo/vitrine.ts), na ordem da
 * pontuação, e os exemplos fictícios à parte. Só os reais entram no índice (lista, filtros, facetas, mapa); a posição, o
 * detalhe e a nota valem para os dois, cada um pelo conjunto de origem.
 */
export function montarVitrine(previa: DadosConjunto, ficticios: DadosConjunto, opcoes: OpcoesVitrine = {}): DadosConjunto {
  const escolhidos = escolherVitrine(previa.itens, opcoes);
  const reais = escolhidos.map((e) => e.item);
  const itens = [...reais, ...ficticios.itens];
  const deReais = new Set(reais.map((i) => i.id));
  const origemDe = (id: string): DadosConjunto | null => (deReais.has(id) ? previa : ficticios.posicao.has(id) ? ficticios : null);
  return {
    conjunto: "exemplos",
    itens,
    indice: criarIndice(reais),
    sobre: previa.sobre,
    // os selos da base real estão em análise (critérios pendentes); os exemplos fictícios mostram os deles na página
    selosDesligados: previa.selosDesligados,
    posicao: new Map(itens.map((i, k) => [i.id, k])),
    // a incerteza do ponto de cada um, do conjunto de origem (o mapa de verdade desenha o círculo com ela)
    desvios: Float32Array.from(itens, (i) => {
      const origem = deReais.has(i.id) ? previa : ficticios;
      const k = origem.posicao.get(i.id);
      return k === undefined ? NaN : (origem.desvios[k] ?? NaN);
    }),
    ruas: itens.map((i) => {
      const k = previa.posicao.get(i.id);
      return k === undefined ? null : (previa.ruas[k] ?? null);
    }),
    contexto: (k) => {
      const i = itens[k];
      const kp = i ? previa.posicao.get(i.id) : undefined;
      return kp === undefined ? {} : previa.contexto(kp);
    },
    async detalhe(id) {
      return (await origemDe(id)?.detalhe(id)) ?? null;
    },
    async localizacao(id) {
      return (await origemDe(id)?.localizacao(id)) ?? null;
    },
    origemDe,
    vitrine: { escolhidos, exemplos: ficticios.itens, base: previa },
  };
}
