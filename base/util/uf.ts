/**
 * Unidades da federação: validação e conversão de nome por extenso para sigla.
 */
import { UFS, type Uf } from "../tipos.ts";
import { slug } from "./texto.ts";

const NOMES: Readonly<Record<string, Uf>> = {
  acre: "AC", alagoas: "AL", amazonas: "AM", amapa: "AP", bahia: "BA", ceara: "CE",
  "distrito-federal": "DF", "espirito-santo": "ES", goias: "GO", maranhao: "MA",
  "minas-gerais": "MG", "mato-grosso-do-sul": "MS", "mato-grosso": "MT", para: "PA",
  paraiba: "PB", pernambuco: "PE", piaui: "PI", parana: "PR", "rio-de-janeiro": "RJ",
  "rio-grande-do-norte": "RN", rondonia: "RO", roraima: "RR", "rio-grande-do-sul": "RS",
  "santa-catarina": "SC", sergipe: "SE", "sao-paulo": "SP", tocantins: "TO",
};

const SIGLAS: ReadonlySet<string> = new Set(UFS);

export function ehUf(valor: unknown): valor is Uf {
  return typeof valor === "string" && SIGLAS.has(valor);
}

/** "sp", " SP ", "São Paulo" → "SP". Devolve `null` se não reconhecer. */
export function normalizarUf(valor: unknown): Uf | null {
  if (typeof valor !== "string") return null;
  const sigla = valor.trim().toUpperCase();
  if (SIGLAS.has(sigla)) return sigla as Uf;
  return NOMES[slug(valor)] ?? null;
}
