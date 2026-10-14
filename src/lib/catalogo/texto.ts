/**
 * Texto da busca do catálogo: normalização, palavras, reconhecimento de estado pelo nome e o link do
 * Google Maps. Funções puras (servidor e navegador).
 *
 * A lógica de estado veio da /assinante antiga (`matchesQuery`, removida com ela),
 * agora separada em duas partes: `interpretarBusca` lê o texto uma vez, e o servidor casa o resultado
 * com um índice pronto (src/lib/catalogo/consulta.ts), sem reler 21 mil imóveis a cada tecla.
 */
import { normalizar, UF_NOME } from "./rotulos";
import type { TipoImovel } from "./tipos";

export { normalizar };

/** Palavras normalizadas, separadas por qualquer coisa que não seja letra ou número. */
export function palavras(texto: string): string[] {
  return normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Siglas de UF em minúsculas ("mg"). */
const UFS = new Set(Object.keys(UF_NOME).map((uf) => uf.toLowerCase()));

/**
 * Nomes de estado em palavras normalizadas, o mais longo primeiro ("mato grosso do sul" antes de
 * "mato grosso"). Apelidos: "minas" vale MG; "df" já é sigla.
 */
const ESTADOS: { palavras: string[]; uf: string }[] = [
  ...Object.entries(UF_NOME).map(([uf, nome]) => ({ palavras: palavras(nome), uf })),
  { palavras: ["minas"], uf: "MG" },
].sort((a, b) => b.palavras.length - a.palavras.length);

/**
 * Palavras que sozinhas não ajudam a achar nada ("apartamento em copacabana"): ficam de fora como
 * termo solto, mas continuam valendo dentro de nome de estado ("rio grande do sul", "rio de janeiro").
 */
const VAZIAS = new Set(["a", "o", "as", "os", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "com", "para", "por", "um", "uma"]);

/**
 * Tipo de imóvel pelo jeito que se escreve na busca ("ap 2 quartos", "sobrado", "lote", "chácara"). "ap" é
 * também a sigla do Amapá: vale como tipo quando vem com outras palavras; sozinho, é o estado.
 */
const TIPO_SINONIMOS: Record<string, TipoImovel> = {
  ap: "apartamento", apt: "apartamento", apto: "apartamento", aptos: "apartamento", apart: "apartamento",
  apartamento: "apartamento", apartamentos: "apartamento", flat: "apartamento", kitnet: "apartamento", kitinete: "apartamento",
  casa: "casa", casas: "casa", sobrado: "casa", sobrados: "casa",
  lote: "terreno", lotes: "terreno", terreno: "terreno", terrenos: "terreno",
  sala: "comercial", salas: "comercial", loja: "comercial", lojas: "comercial", galpao: "comercial", galpoes: "comercial",
  comercial: "comercial", comerciais: "comercial",
  sitio: "rural", sitios: "rural", chacara: "rural", chacaras: "rural", fazenda: "rural", fazendas: "rural", rural: "rural", rurais: "rural",
};

/** Palavras de quartos depois de um número: "2 quartos", "3 qts", "1 dorm", "2 dormitórios". */
const QUARTOS = new Set(["quarto", "quartos", "qto", "qtos", "qt", "qts", "dorm", "dorms", "dormitorio", "dormitorios"]);

/** Uma parte da busca já interpretada. Todas precisam casar (E). */
export type ClausulaBusca =
  /** Nome de estado: casa com a UF do imóvel ou com as mesmas palavras no texto (a cidade São Paulo, o bairro Minas Gerais). */
  | { tipo: "estado"; uf: string; palavras: string[]; parcial: boolean }
  /** Sigla de 2 letras que é UF ("BA", "sp"): compara só com a UF, para "ba" não trazer Curitiba. */
  | { tipo: "uf"; uf: string }
  /** Tipo de imóvel escrito na busca ("ap", "casa", "lote"): compara com o tipo do imóvel, não com o texto. */
  | { tipo: "imovel"; imovel: TipoImovel }
  /** "2 quartos" (exatamente 2) ou "2+ quartos" (pelo menos 2): compara com o número de quartos. */
  | { tipo: "quartos"; n: number; minimo: boolean }
  /**
   * Os demais termos casam pelo início de uma palavra ("cur" acha Curitiba; "itiba" não). Número sozinho
   * casa a palavra inteira (`exato`): "1" não acha 101 nem 1.004.
   */
  | { tipo: "termo"; termo: string; exato?: boolean };

/**
 * Lê o texto da busca. Nome de estado ("minas gerais", "São Paulo", "pará"; a última palavra pode estar
 * pela metade, "minas ge") vira cláusula de estado; sigla vira UF; "2 quartos" e "2+ qts" viram quartos;
 * "ap", "casa", "lote"... viram tipo; o resto vira termos.
 */
export function interpretarBusca(texto: string): ClausulaBusca[] {
  // "2+ quartos": o "+" some ao separar as palavras; anota antes quais números vieram com ele
  const comMais = new Set([...normalizar(texto).matchAll(/(\d+)\s*\+/g)].map((m) => m[1]!));
  // "para" sem acento no meio de uma frase é preposição ("casa para reforma"); "pará", ou "para" sozinho, é o estado.
  const termos: string[] = [];
  const para: boolean[] = [];
  for (const cru of texto.toLowerCase().normalize("NFC").split(/\s+/)) {
    for (const p of palavras(cru)) {
      termos.push(p);
      para.push(p === "para" && cru.includes("pará"));
    }
  }
  const ehPreposicao = (i: number) => termos[i] === "para" && termos.length > 1 && !para[i];
  const ultimo = termos.length - 1;
  const saida: ClausulaBusca[] = [];
  for (let i = 0; i < termos.length; ) {
    const estado = ESTADOS.find(
      (e) =>
        i + e.palavras.length <= termos.length &&
        !(e.uf === "PA" && ehPreposicao(i)) &&
        e.palavras.every((p, j) => termos[i + j] === p || (j > 0 && i + j === ultimo && p.startsWith(termos[i + j]!))),
    );
    if (estado) {
      const grupo = termos.slice(i, i + estado.palavras.length);
      saida.push({ tipo: "estado", uf: estado.uf, palavras: grupo, parcial: grupo.some((t, j) => t !== estado.palavras[j]) });
      i += grupo.length;
      continue;
    }
    const t = termos[i]!;
    const seguinte = termos[i + 1];
    if (/^\d+$/.test(t) && seguinte !== undefined && QUARTOS.has(seguinte)) {
      saida.push({ tipo: "quartos", n: Number(t), minimo: comMais.has(t) });
      i += 2;
      continue;
    }
    // "ap" sozinho (ou com "amapá") é o Amapá; com outras palavras ("ap 2 quartos", "ap centro"), apartamento
    const tipoImovel = TIPO_SINONIMOS[t];
    if (tipoImovel && !(t === "ap" && (termos.length === 1 || termos.includes("amapa")))) saida.push({ tipo: "imovel", imovel: tipoImovel });
    else if (t.length === 2 && UFS.has(t)) saida.push({ tipo: "uf", uf: t.toUpperCase() });
    else if (/^\d+$/.test(t)) saida.push({ tipo: "termo", termo: t, exato: true });
    else if (!VAZIAS.has(t)) saida.push({ tipo: "termo", termo: t });
    i += 1;
  }
  return saida;
}

/**
 * Casa um imóvel com a busca já interpretada, sem índice (lista pequena, testes). O servidor usa o
 * índice de consulta.ts, com a mesma regra.
 */
export function casaBusca(
  clausulas: readonly ClausulaBusca[],
  uf: string,
  texto: string,
  imovel: { tipo?: TipoImovel; quartos?: number | null } = {},
): boolean {
  if (clausulas.length === 0) return true;
  const tokens = palavras(texto);
  return clausulas.every((c) => {
    if (c.tipo === "uf") return c.uf === uf;
    if (c.tipo === "imovel") return imovel.tipo === c.imovel;
    if (c.tipo === "quartos") return imovel.quartos != null && (c.minimo ? imovel.quartos >= c.n : imovel.quartos === c.n);
    if (c.tipo === "termo") return tokens.some((w) => (c.exato ? w === c.termo : w.startsWith(c.termo)));
    if (c.uf === uf) return true;
    return c.palavras.every((t) => tokens.some((w) => (c.parcial ? w.startsWith(t) : w === t)));
  });
}

/**
 * Link "Ver endereço no Google Maps" (busca por texto, sem API): "endereço, bairro, cidade - UF". Quando o
 * endereço já termina com a cidade ("..., Presidente Prudente/SP"), não repete.
 */
export function linkGoogleMaps(i: { endereco: string | null; bairro: string | null; cidade: string; uf: string }): string {
  const partes: string[] = [];
  const endereco = i.endereco?.trim();
  const jaTemCidade = endereco ? normalizar(endereco).includes(normalizar(`${i.cidade}/${i.uf}`)) : false;
  if (endereco) partes.push(endereco);
  if (i.bairro && !(endereco && normalizar(endereco).includes(normalizar(i.bairro)))) partes.push(i.bairro);
  if (!jaTemCidade) partes.push(`${i.cidade} - ${i.uf}`);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes.join(", "))}`;
}

/** "1 quarto", "3 quartos". */
export function quartosTexto(n: number): string {
  return `${n} ${n === 1 ? "quarto" : "quartos"}`;
}
