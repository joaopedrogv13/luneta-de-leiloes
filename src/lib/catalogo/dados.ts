/**
 * Dados do catálogo no servidor, carregados uma vez por instância (Vercel: por função fria) e
 * guardados em memória:
 * - "previa": o instantâneo do banco em base/saida/site (src/lib/catalogo/instantaneo.ts). A lista
 *   inteira vem na primeira busca; cada pedaço de detalhes só quando uma página de imóvel precisa dele.
 * - "exemplos": os 6 exemplos fictícios (src/lib/catalogo/exemplos.ts).
 *
 * SÓ SERVIDOR: lê arquivos e guarda o conjunto inteiro (com tags e selo, sem plano aplicado). O navegador
 * recebe só o que src/lib/catalogo/servidor.ts devolve, com o plano já aplicado.
 * Os arquivos entram nas funções da Vercel por `outputFileTracingIncludes` em next.config.ts.
 */
import "server-only";
import { LISTINGS } from "../../content/examples";
import { criarIndice, diaBrasilia, type IndiceCatalogo } from "./consulta";
import { converterExemplos, resumoDe } from "./exemplos";
import { lerLista, lerParte, montarDetalhe, parteDoId, pastaPadrao, type DetalheParcial } from "./instantaneo";
import type { Conjunto, ImovelDetalhe, ImovelResumo, SobreConjunto } from "./tipos";

export interface DadosConjunto {
  conjunto: Conjunto;
  itens: readonly ImovelResumo[];
  indice: IndiceCatalogo;
  sobre: SobreConjunto;
  /** Selos desligados neste conjunto (prévia: critérios pendentes com o advogado). */
  selosDesligados: boolean;
  /** Posição de cada id na lista. */
  posicao: ReadonlyMap<string, number>;
  /** Detalhe completo (sem plano aplicado), ou null se o id não existe. */
  detalhe(id: string): Promise<ImovelDetalhe | null>;
}

const carregados = new Map<Conjunto, Promise<DadosConjunto>>();

async function carregarPrevia(pasta: string): Promise<DadosConjunto> {
  const lista = await lerLista(pasta);
  const enderecos = lista.enderecos;
  const indice = criarIndice(lista.itens, { textoExtra: (_, k) => enderecos[k] });
  const posicao = new Map(lista.itens.map((i, k) => [i.id, k]));
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
    async detalhe(id) {
      const k = posicao.get(id);
      if (k === undefined) return null;
      const parcial = (await parte(parteDoId(id, lista.partes))).get(id);
      if (!parcial) return null;
      return montarDetalhe(lista.itens[k]!, enderecos[k] ?? null, parcial);
    },
  };
}

function carregarExemplos(): DadosConjunto {
  const agora = new Date();
  const detalhes = converterExemplos(LISTINGS, agora);
  const itens: ImovelResumo[] = detalhes.map(resumoDe);
  const porId = new Map(detalhes.map((d) => [d.id, d]));
  return {
    conjunto: "exemplos",
    itens,
    indice: criarIndice(itens),
    sobre: { geradoEm: agora.toISOString(), fontes: [{ id: "exemplo", nome: "Exemplo fictício", geradoNaFonteEm: null, total: itens.length }] },
    selosDesligados: false,
    posicao: new Map(itens.map((i, k) => [i.id, k])),
    async detalhe(id) {
      return porId.get(id) ?? null;
    },
  };
}

/** Dia (Brasília) em que os exemplos foram montados: as datas das praças são relativas a ele. */
let diaDosExemplos: string | null = null;

/** Os dados de um conjunto, carregados na primeira chamada desta instância. */
export function dadosDoConjunto(conjunto: Conjunto): Promise<DadosConjunto> {
  if (conjunto === "exemplos") {
    // Exemplos com praça sempre no futuro: remonta quando o dia vira (instância que fica no ar por semanas
    // não deixa a praça dos exemplos vencer, o que os tiraria da busca).
    const hoje = diaBrasilia(new Date());
    if (diaDosExemplos !== hoje) {
      carregados.delete("exemplos");
      diaDosExemplos = hoje;
    }
  }
  let pronto = carregados.get(conjunto);
  if (!pronto) {
    pronto = conjunto === "previa" ? carregarPrevia(pastaPadrao()) : Promise.resolve(carregarExemplos());
    // erro de leitura não fica guardado: a próxima requisição tenta de novo
    pronto.catch(() => carregados.delete(conjunto));
    carregados.set(conjunto, pronto);
  }
  return pronto;
}
