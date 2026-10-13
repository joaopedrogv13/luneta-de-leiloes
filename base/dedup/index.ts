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
 * "TRES PONTES" para o mesmo apartamento, no CSV da Caixa) separaria duplicatas de verdade.
 * Medições em base/dedup/README.md.
 */
import { CODIGO_BRASILIA, tabelaPadrao, type TabelaMunicipios } from "../geo/municipios.ts";
import { normalizarTexto, slug } from "../util/texto.ts";
import { analisarEndereco, especificidade, logradouroComparavel, normalizarBairro, type EnderecoPartes } from "./endereco.ts";

export { analisarEndereco, especificidade, logradouroComparavel, normalizarBairro, type EnderecoPartes } from "./endereco.ts";

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

/** Matrícula só com dígitos e sem zeros à esquerda ("147.300" → "147300"); `null` se não houver número. */
export function normalizarMatricula(matricula: string): string | null {
  const primeira = /\d[\d.\s-]*/.exec(matricula);
  if (!primeira) return null;
  const digitos = primeira[0].replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digitos === "" || digitos === "0" ? null : digitos;
}

/**
 * Identifica o cartório pelo número do ofício ("6º Cartório de Registro de Imóveis",
 * "Ofício: 01", "2º RI") ou "u" quando o texto não traz número (cartório único da comarca).
 */
export function normalizarCartorio(cartorio: string | null | undefined): string {
  if (!cartorio) return "u";
  const texto = normalizarTexto(cartorio);
  const numero = /(\d{1,2})\s*(?:º|o|ª|a)?\s*(?:oficio|cartorio|ri\b|cri\b|registro|serventia|circunscricao|zona)/.exec(texto)
    ?? /(?:oficio|cartorio|registro|cri|ri)\D{0,30}?(\d{1,2})(?!\d)/.exec(texto)
    ?? /^\s*(\d{1,2})\s*$/.exec(texto);
  return numero?.[1] ? String(Number(numero[1])) : "u";
}

/**
 * Endereço comparável em uma linha (logradouro, número, unidades), sem município:
 * "RUA DO PURUS, N. S/N, QUARTEIRÃO 272, LOTE 10" → "rua purus sn lt 10 qd 272".
 */
export function normalizarEndereco(endereco: string): string {
  const p = analisarEndereco(endereco);
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

function motivoDasPartes(p: EnderecoPartes): MotivoSemChave | null {
  const logradouro = logradouroComparavel(p);
  if (p.fracao) return "fracao";
  if (especificidade(p) === 0) return "sem_numero_nem_unidade";
  if (logradouro.length < 3 || !/[a-z]/.test(logradouro)) return "sem_logradouro";
  return null;
}

/** Por que um endereço não vira chave (ou null se vira). */
export function motivoSemChave(endereco: string | null | undefined): MotivoSemChave | null {
  return endereco ? motivoDasPartes(analisarEndereco(endereco)) : "sem_endereco";
}

/** Chave por endereço; `null` quando o endereço não basta para separar imóveis. */
export function chaveEndereco(dados: DadosChave, tabela?: TabelaMunicipios, modoBairro: ModoBairro = "quando_fraco"): string | null {
  if (!dados.endereco) return null;
  const p = analisarEndereco(dados.endereco);
  if (motivoDasPartes(p) !== null) return null;
  const partes = [`end:${municipioDaChave(dados, tabela, { regiaoDf: true })}`, logradouroComparavel(p), p.numero ?? "sn", p.unidades.join(" ")];
  const fraco = p.generico && especificidade(p) < ESPECIFICIDADE_SEM_BAIRRO;
  if (modoBairro === "sempre" || (modoBairro === "quando_fraco" && fraco)) partes.push(`b=${normalizarBairro(dados.bairro)}`);
  return partes.join(":");
}

/** A melhor chave disponível: matrícula, senão endereço. */
export function chaveDedup(dados: DadosChave, tabela?: TabelaMunicipios): string | null {
  return chaveMatricula(dados, tabela) ?? chaveEndereco(dados, tabela);
}
