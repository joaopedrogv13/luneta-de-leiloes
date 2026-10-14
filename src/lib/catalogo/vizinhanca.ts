/**
 * Página do imóvel: preço do m² na região, imóveis parecidos da base e buscas prontas em portais.
 * PURO (sem fs, sem rede).
 *
 * - Referências de R$/m²: imóveis do MESMO TIPO na base (outros leilões e vendas, não anúncios de
 *   mercado), sem o próprio imóvel. Recortes do menor para o maior: bairro (n ≥ 5), cidade (n ≥ 5) e UF
 *   (n ≥ 3); só entram os recortes com amostra suficiente. A primeira referência é a mais local.
 * - Parecidos: mesmo tipo e mesma cidade, com área ±35% e quartos ±1 (quando os dois têm o dado; fora
 *   dessas faixas não entra); o mesmo bairro primeiro, depois os com foto, depois os mais próximos em
 *   área, quartos e lance; praça já vencida não entra. Podem ser menos de 6, ou nenhum.
 * - Buscas externas: links de busca do Google com "site:" para os portais (sem API e sem raspagem).
 */
import { normalizar, quartosTexto } from "./texto";
import type { FaixaM2, ImovelResumo, LinkImovel, ReferenciaM2, TipoImovel, Vizinhanca } from "./tipos";

export const AMOSTRA_MINIMA_LOCAL = 5;
export const AMOSTRA_MINIMA_UF = 3;
export const MAXIMO_PARECIDOS = 6;

/** Percentil (0 a 1) por interpolação linear numa lista ordenada. */
function percentil(ordenados: readonly number[], p: number): number {
  const pos = (ordenados.length - 1) * p;
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  return ordenados[baixo]! + (ordenados[alto]! - ordenados[baixo]!) * (pos - baixo);
}

function faixa(valores: number[]): FaixaM2 | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  return { mediana: Math.round(percentil(v, 0.5)), p25: Math.round(percentil(v, 0.25)), p75: Math.round(percentil(v, 0.75)) };
}

const chave = (t: string | null) => (t === null ? null : normalizar(t).replace(/\s+/g, " ").trim());
/** Compara com um valor já normalizado (o do imóvel da página), sem normalizar duas vezes. */
const igualA = (alvo: string | null) => (t: string | null) => alvo !== null && t !== null && (t === alvo || chave(t) === alvo);

/** Referências de R$/m² para o imóvel (bairro, cidade, UF), do recorte mais local ao mais amplo. */
export function referenciasM2(imovel: ImovelResumo, itens: readonly ImovelResumo[]): ReferenciaM2[] {
  const doTipo = itens.filter((i) => i.tipo === imovel.tipo && i.uf === imovel.uf && i.id !== imovel.id && i.lanceM2 !== null);
  const daCidade = igualA(chave(imovel.cidade));
  const doBairro = igualA(chave(imovel.bairro));
  const naCidade = doTipo.filter((i) => daCidade(i.cidade));
  const noBairro = imovel.bairro ? naCidade.filter((i) => doBairro(i.bairro)) : [];
  const recortes: { escopo: ReferenciaM2["escopo"]; nome: string; lista: ImovelResumo[]; minimo: number }[] = [
    { escopo: "bairro", nome: `${imovel.bairro}, ${imovel.cidade}/${imovel.uf}`, lista: noBairro, minimo: AMOSTRA_MINIMA_LOCAL },
    { escopo: "cidade", nome: `${imovel.cidade}/${imovel.uf}`, lista: naCidade, minimo: AMOSTRA_MINIMA_LOCAL },
    { escopo: "uf", nome: imovel.uf, lista: doTipo, minimo: AMOSTRA_MINIMA_UF },
  ];
  const saida: ReferenciaM2[] = [];
  for (const r of recortes) {
    if (r.lista.length < r.minimo) continue;
    // o mesmo recorte de um nível acima não acrescenta nada (bairro = cidade inteira)
    if (saida.length && saida[saida.length - 1]!.amostra === r.lista.length) continue;
    const lances = r.lista.map((i) => i.lanceM2!);
    const avaliacoes = r.lista.flatMap((i) => (i.avaliacaoM2 === null ? [] : [i.avaliacaoM2]));
    saida.push({
      escopo: r.escopo,
      nome: r.nome,
      tipo: imovel.tipo,
      amostra: r.lista.length,
      avaliacaoM2: avaliacoes.length >= r.minimo ? faixa(avaliacoes) : null,
      lanceM2: faixa(lances),
      imovel: { avaliacaoM2: imovel.avaliacaoM2, lanceM2: imovel.lanceM2 },
      percentilLance: imovel.lanceM2 === null ? null : Math.round((100 * lances.filter((x) => x > imovel.lanceM2!).length) / lances.length),
    });
  }
  return saida;
}

/** Praça vencida há mais de 1 dia (a busca também esconde esses; ver consulta.ts). */
const vencido = (i: ImovelResumo, agora: number) => i.dataPraca !== null && Date.parse(i.dataPraca) < agora - 24 * 3600 * 1000;

/** Até 6 imóveis parecidos, do mais parecido ao menos; nunca o próprio nem um de praça já vencida. */
export function parecidos(imovel: ImovelResumo, itens: readonly ImovelResumo[], maximo: number = MAXIMO_PARECIDOS, agora: Date = new Date()): ImovelResumo[] {
  const daCidade = igualA(chave(imovel.cidade));
  const doBairro = igualA(chave(imovel.bairro));
  const t = agora.getTime();
  const candidatos = itens.filter((i) => i.id !== imovel.id && i.tipo === imovel.tipo && i.uf === imovel.uf && daCidade(i.cidade) && !vencido(i, t));
  const dentroDasFaixas = (i: ImovelResumo) =>
    (imovel.area === null || i.area === null || Math.abs(i.area - imovel.area) <= 0.35 * imovel.area) &&
    (imovel.quartos === null || i.quartos === null || Math.abs(i.quartos - imovel.quartos) <= 1);
  const distancia = (i: ImovelResumo) =>
    (imovel.area !== null && i.area !== null ? Math.abs(Math.log(i.area / imovel.area)) : 0.5) +
    (imovel.quartos !== null && i.quartos !== null ? 0.25 * Math.abs(i.quartos - imovel.quartos) : 0.25) +
    0.5 * Math.abs(Math.log(i.lance / imovel.lance));
  const pontuar = (i: ImovelResumo) => ({
    i,
    bairro: doBairro(i.bairro) ? 0 : 1,
    foto: i.foto ? 0 : 1,
    d: distancia(i),
  });
  // Fora das faixas não é "parecido": melhor mostrar menos (ou nenhum) do que um de 200 m² ao lado de um de 50 m².
  return candidatos
    .filter(dentroDasFaixas)
    .map(pontuar)
    .sort((a, b) => a.bairro - b.bairro || a.foto - b.foto || a.d - b.d || (a.i.id < b.i.id ? -1 : 1))
    .slice(0, maximo)
    .map((p) => p.i);
}

const PORTAIS: readonly { site: string; nome: string }[] = [
  { site: "zapimoveis.com.br", nome: "Zap Imóveis" },
  { site: "vivareal.com.br", nome: "Viva Real" },
  { site: "olx.com.br", nome: "OLX" },
  { site: "quintoandar.com.br", nome: "QuintoAndar" },
  { site: "imovelweb.com.br", nome: "Imovelweb" },
];

const TIPO_NA_BUSCA: Record<TipoImovel, string> = {
  apartamento: "apartamento",
  casa: "casa",
  terreno: "terreno",
  comercial: "imóvel comercial",
  rural: "imóvel rural",
  outro: "imóvel",
};

/** "apartamento 2 quartos à venda Centro Uberlândia MG" (sem quartos em terreno, comercial, rural e outro). */
export function consultaExterna(i: Pick<ImovelResumo, "tipo" | "quartos" | "bairro" | "cidade" | "uf">): string {
  const comQuartos = (i.tipo === "apartamento" || i.tipo === "casa") && i.quartos !== null && i.quartos > 0;
  return [TIPO_NA_BUSCA[i.tipo], comQuartos ? quartosTexto(i.quartos!) : null, "à venda", i.bairro, i.cidade, i.uf].filter(Boolean).join(" ");
}

/** Buscas prontas no Google, uma por portal e uma geral. Só links: nada é consultado daqui. */
export function buscasExternas(i: Pick<ImovelResumo, "tipo" | "quartos" | "bairro" | "cidade" | "uf">): LinkImovel[] {
  const consulta = consultaExterna(i);
  const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  return [
    ...PORTAIS.map((p) => ({
      tipo: "outro" as const,
      rotulo: p.nome,
      url: google(`${consulta} site:${p.site}`),
      descricao: `Anúncios parecidos no ${p.nome} (busca no Google)`,
    })),
    { tipo: "outro", rotulo: "Google", url: google(consulta), descricao: "Busca geral por anúncios parecidos" },
  ];
}

/** Tudo da vizinhança de uma vez. Os parecidos saem como estão na lista: o plano é aplicado por quem chama. */
export function vizinhanca(imovel: ImovelResumo, itens: readonly ImovelResumo[], agora: Date = new Date()): Vizinhanca {
  return { referencias: referenciasM2(imovel, itens), parecidos: parecidos(imovel, itens, MAXIMO_PARECIDOS, agora), buscasExternas: buscasExternas(imovel) };
}
