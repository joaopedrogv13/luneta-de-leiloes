/**
 * Chaves de deduplicação: o mesmo imóvel aparece no portal do banco, no do leiloeiro e em
 * agregadores. Cada imóvel guarda duas chaves e o site agrupa por elas:
 *
 * - chave_dedup: matrícula + cartório quando houver ("mat:3550308:6:147300"), senão a de endereço;
 * - chave_endereco: logradouro + número + unidades (+ bairro quando o endereço é fraco) no
 *   município ("end:1200203:rua purus:sn:lt 10 qd 272").
 *
 * O município é o código IBGE (base/geo), o que junta "SANT' ANA DO LIVRAMENTO" e "Santana do
 * Livramento". No DF, que é um município só, vale a região administrativa escrita na cidade
 * ("df-ceilandia"), porque endereços como "QR 1 CJ A LT 7" se repetem em cada região. Cidade
 * não reconhecida cai em "uf-slug" ("pe-terra-vermelha").
 *
 * Precisão primeiro: juntar dois imóveis diferentes esconde um anúncio, enquanto deixar passar
 * uma duplicata só mostra o mesmo imóvel duas vezes. Por isso não há chave de endereço quando
 * ele não separa imóveis: sem número e sem unidade ("RUA BOA VISTA, S/N"), fração de lote
 * ("LT 02 PARTE") ou logradouro vazio. O bairro entra na chave quando o logradouro é genérico
 * ("Rua A", "Rua 10", "Rua Projetada") e o resto do endereço é pouco específico (menos de 3 entre
 * número e unidades), porque bairro escrito de jeitos diferentes pelas fontes ("BELA VISTA" e
 * "TRES PONTES" para o mesmo apartamento, no CSV da Caixa) separaria duplicatas de verdade. Sem
 * bairro informado, vale o escrito no texto antes da cidade ("..., Vila Prudente, São Paulo/SP").
 *
 * Mesmo imóvel = mesma chave_dedup, ou mesma chave_endereco sem matrículas diferentes
 * (`mesmoImovel`, `agruparDuplicatas`): uma fonte com matrícula e outra sem nunca dividem a
 * chave_dedup. Medições em base/dedup/README.md.
 */
import { CODIGO_BRASILIA, tabelaPadrao, type TabelaMunicipios } from "../geo/municipios.ts";
import { normalizarTexto, slug } from "../util/texto.ts";
import { analisarEndereco, especificidade, logradouroComparavel, normalizarBairro, type ContextoEndereco, type EnderecoPartes } from "./endereco.ts";

export {
  analisarEndereco,
  especificidade,
  logradouroComparavel,
  normalizarBairro,
  type ContextoEndereco,
  type EnderecoPartes,
} from "./endereco.ts";

export interface DadosChave {
  uf: string;
  cidade: string;
  /** Código IBGE já resolvido (gravar.ts passa o da geocodificação); senão é procurado pela cidade. */
  codigo_ibge?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  matricula?: string | null;
  cartorio?: string | null;
}

/** Abaixo disto, endereço com logradouro genérico leva o bairro na chave. */
const ESPECIFICIDADE_SEM_BAIRRO = 3;

/**
 * Município da chave: código IBGE; cidade não reconhecida, "uf-slug". Com `regiaoDf`, o DF vira a
 * região administrativa escrita na cidade ("df-ceilandia"): serve para endereço, não para
 * matrícula (os ofícios de registro do DF valem para o DF inteiro).
 */
export function municipioDaChave(
  dados: Pick<DadosChave, "uf" | "cidade" | "codigo_ibge">,
  tabela?: TabelaMunicipios,
  opcoes: { regiaoDf?: boolean } = {},
): string {
  const uf = dados.uf.trim().toLowerCase();
  const codigo = dados.codigo_ibge ?? (tabela ?? tabelaPadrao()).encontrar(dados.uf, dados.cidade)?.municipio.codigo_ibge ?? null;
  if (opcoes.regiaoDf && (codigo === CODIGO_BRASILIA || uf === "df")) return `df-${slug(dados.cidade) || "brasilia"}`;
  return codigo ?? `${uf}-${slug(dados.cidade)}`;
}

/**
 * Primeira matrícula, só com dígitos e sem zeros à esquerda ("147.300" → "147300"); `null` se não
 * houver número. Só o ponto separa milhar: espaço, hífen, vírgula, barra e "e" separam matrículas
 * ("9740 9741", "9740 - 9741", "9740, 9741" → "9740"), e um número que junta duas não existe.
 */
export function normalizarMatricula(matricula: string): string | null {
  const primeira = /\d+(?:\.\d{3})*/.exec(matricula);
  if (!primeira) return null;
  const digitos = primeira[0].replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digitos === "" || digitos === "0" ? null : digitos;
}

/**
 * Identifica o cartório pelo número do ofício ("6º Cartório de Registro de Imóveis",
 * "Ofício: 01", "2º RI", "6º Oficial de Registro de Imóveis", como os de São Paulo se chamam)
 * ou "u" quando o texto não traz número (cartório único da comarca).
 */
export function normalizarCartorio(cartorio: string | null | undefined): string {
  if (!cartorio) return "u";
  const texto = normalizarTexto(cartorio);
  const numero = /(\d{1,2})\s*(?:º|o|ª|a)?\s*(?:oficio|oficial|cartorio|ri\b|cri\b|registro|serventia|circunscricao|zona)/.exec(texto)
    ?? /(?:oficio|oficial|cartorio|registro|cri|ri)\D{0,30}?(\d{1,2})(?!\d)/.exec(texto)
    ?? /^\s*(\d{1,2})\s*$/.exec(texto);
  return numero?.[1] ? String(Number(numero[1])) : "u";
}

/**
 * Endereço comparável em uma linha (logradouro, número, unidades), sem município:
 * "RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10" → "rua purus sn lt 10 qd 272".
 */
export function normalizarEndereco(endereco: string, contexto: ContextoEndereco = {}): string {
  const p = analisarEndereco(endereco, contexto);
  return [logradouroComparavel(p), p.numero ?? "", ...p.unidades].filter((s) => s !== "").join(" ");
}

/** Chave forte por matrícula; `null` sem matrícula. */
export function chaveMatricula(dados: DadosChave, tabela?: TabelaMunicipios): string | null {
  if (!dados.matricula) return null;
  const matricula = normalizarMatricula(dados.matricula);
  if (!matricula) return null;
  return `mat:${municipioDaChave(dados, tabela)}:${normalizarCartorio(dados.cartorio)}:${matricula}`;
}

/**
 * Quando o bairro entra na chave de endereço. "quando_fraco" (padrão) é o que a base grava;
 * "nunca" e "sempre" existem para medir (base/dedup/medir.ts).
 */
export type ModoBairro = "quando_fraco" | "nunca" | "sempre";

export type MotivoSemChave = "sem_endereco" | "fracao" | "sem_numero_nem_unidade" | "sem_logradouro";

/**
 * Por que as partes não viram chave. Rua sem nome ("RUA, N. SN, CS 03 LT 20A QD 20") só vira
 * chave com o bairro, que então entra sempre: duas "RUA, N. 10, AP 1" de bairros diferentes não
 * podem se juntar.
 */
function motivoDasPartes(p: EnderecoPartes, bairro: string): MotivoSemChave | null {
  const logradouro = logradouroComparavel(p);
  if (p.fracao) return "fracao";
  if (especificidade(p) === 0) return "sem_numero_nem_unidade";
  if (p.nome === "" && (p.tipo === "" || bairro === "")) return "sem_logradouro";
  if (logradouro.length < 3 || !/[a-z]/.test(logradouro)) return "sem_logradouro";
  return null;
}

function contextoDe(dados: Pick<DadosChave, "uf" | "cidade" | "bairro">): ContextoEndereco {
  return { uf: dados.uf, cidade: dados.cidade, bairro: dados.bairro ?? null };
}

/** Bairro da chave: o informado pela fonte; senão o escrito no texto do endereço ("..., Vila Prudente, São Paulo/SP"). */
function bairroDaChave(dados: Pick<DadosChave, "bairro">, p: EnderecoPartes): string {
  return normalizarBairro(dados.bairro) || p.bairro;
}

/** Por que um endereço não vira chave (ou null se vira). */
export function motivoSemChave(endereco: string | null | undefined, contexto: ContextoEndereco = {}): MotivoSemChave | null {
  if (!endereco) return "sem_endereco";
  const p = analisarEndereco(endereco, contexto);
  return motivoDasPartes(p, bairroDaChave({ bairro: contexto.bairro ?? null }, p));
}

/** Chave por endereço; `null` quando o endereço não basta para separar imóveis. */
export function chaveEndereco(dados: DadosChave, tabela?: TabelaMunicipios, modoBairro: ModoBairro = "quando_fraco"): string | null {
  if (!dados.endereco) return null;
  const p = analisarEndereco(dados.endereco, contextoDe(dados));
  const bairro = bairroDaChave(dados, p);
  if (motivoDasPartes(p, bairro) !== null) return null;
  const partes = [`end:${municipioDaChave(dados, tabela, { regiaoDf: true })}`, logradouroComparavel(p), p.numero ?? "sn", p.unidades.join(" ")];
  const fraco = p.generico && especificidade(p) < ESPECIFICIDADE_SEM_BAIRRO;
  if (p.nome === "" || modoBairro === "sempre" || (modoBairro === "quando_fraco" && fraco)) partes.push(`b=${bairro}`);
  return partes.join(":");
}

/** A melhor chave disponível: matrícula, senão endereço. */
export function chaveDedup(dados: DadosChave, tabela?: TabelaMunicipios): string | null {
  return chaveMatricula(dados, tabela) ?? chaveEndereco(dados, tabela);
}

/** As duas chaves gravadas de um anúncio. */
export interface ChavesImovel {
  chave_dedup: string | null;
  chave_endereco: string | null;
}

const ehMatricula = (chave: string | null): boolean => chave?.startsWith("mat:") === true;

/**
 * Dois anúncios são o mesmo imóvel? A mesma `chave_dedup` basta. Sem ela, vale a mesma
 * `chave_endereco`, desde que os dois não tenham matrículas diferentes. É o caso de uma fonte com
 * matrícula e outra sem (a Caixa só dá a matrícula na ficha; a Leilões Judiciais quase sempre
 * dá): a `chave_dedup` de uma é `mat:...` e a da outra `end:...`, e só o endereço as junta.
 */
export function mesmoImovel(a: ChavesImovel, b: ChavesImovel): boolean {
  if (a.chave_dedup !== null && a.chave_dedup === b.chave_dedup) return true;
  if (ehMatricula(a.chave_dedup) && ehMatricula(b.chave_dedup)) return false;
  return a.chave_endereco !== null && a.chave_endereco === b.chave_endereco;
}

export interface AnuncioParaAgrupar extends ChavesImovel {
  id: number | string;
  fonte: string;
}

export interface ResumoDuplicatas {
  /** Grupos com 2 ou mais anúncios do mesmo imóvel, e quantos anúncios somam. */
  grupos: number;
  imoveis: number;
  /** Grupos com anúncios de mais de uma fonte. */
  gruposEntreFontes: number;
  /** Endereços (chave_endereco) com matrículas diferentes: não foram juntados pelo endereço. */
  enderecosComMatriculasDiferentes: number;
  /** Os grupos, com os ids dos anúncios. */
  lista: Array<Array<number | string>>;
}

/**
 * Agrupa anúncios do mesmo imóvel pela regra de `mesmoImovel`: junta pela `chave_dedup` e, dentro
 * de cada `chave_endereco`, junta tudo, menos quando o endereço tem duas matrículas diferentes
 * (aí só a matrícula separa, e o endereço não junta ninguém).
 */
export function agruparDuplicatas(anuncios: readonly AnuncioParaAgrupar[]): ResumoDuplicatas {
  const pai = anuncios.map((_, i) => i);
  const raiz = (i: number): number => {
    while (pai[i] !== i) {
      pai[i] = pai[pai[i] as number] as number;
      i = pai[i] as number;
    }
    return i;
  };
  const unir = (a: number, b: number): void => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) pai[rb] = ra;
  };
  const porChave = (campo: keyof ChavesImovel): Map<string, number[]> => {
    const mapa = new Map<string, number[]>();
    anuncios.forEach((a, i) => {
      const chave = a[campo];
      if (chave !== null) mapa.set(chave, [...(mapa.get(chave) ?? []), i]);
    });
    return mapa;
  };
  for (const indices of porChave("chave_dedup").values()) for (const i of indices.slice(1)) unir(indices[0] as number, i);
  let enderecosComMatriculasDiferentes = 0;
  for (const indices of porChave("chave_endereco").values()) {
    if (indices.length < 2) continue;
    const matriculas = new Set(indices.map((i) => anuncios[i]?.chave_dedup ?? null).filter((c) => ehMatricula(c)));
    if (matriculas.size > 1) {
      enderecosComMatriculasDiferentes++;
      continue;
    }
    for (const i of indices.slice(1)) unir(indices[0] as number, i);
  }
  const grupos = new Map<number, number[]>();
  anuncios.forEach((_, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), i]));
  const lista = [...grupos.values()].filter((g) => g.length > 1);
  return {
    grupos: lista.length,
    imoveis: lista.reduce((soma, g) => soma + g.length, 0),
    gruposEntreFontes: lista.filter((g) => new Set(g.map((i) => anuncios[i]?.fonte)).size > 1).length,
    enderecosComMatriculasDiferentes,
    lista: lista.map((g) => g.map((i) => anuncios[i]?.id as number | string)),
  };
}
