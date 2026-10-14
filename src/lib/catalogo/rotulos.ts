/**
 * Rótulos e formatação do catálogo (pt-BR). Funções puras, iguais no servidor e no navegador
 * (fuso fixo de Brasília, UTC−3: o Brasil não tem horário de verão desde 2019).
 */
import type { Modalidade, Ocupacao, Ordem, Praca, Selo, Severidade, TipoImovel } from "./tipos";

export const TIPO_ROTULO: Record<TipoImovel, string> = {
  apartamento: "Apartamento",
  casa: "Casa",
  terreno: "Terreno",
  comercial: "Comercial",
  rural: "Rural",
  outro: "Outro",
};

export const TIPO_PLURAL: Record<TipoImovel, string> = {
  apartamento: "Apartamentos",
  casa: "Casas",
  terreno: "Terrenos",
  comercial: "Comerciais",
  rural: "Rurais",
  outro: "Outros",
};

export const MODALIDADE_ROTULO: Record<Modalidade, string> = {
  leilao: "Leilão",
  venda_direta: "Venda direta",
  venda_online: "Venda online",
  licitacao_aberta: "Licitação aberta",
  outro: "Outra",
};

export const PRACA_ROTULO: Record<Praca, string> = { "1": "1ª praça", "2": "2ª praça", unica: "Praça única" };

export const OCUPACAO_ROTULO: Record<Ocupacao, string> = { ocupado: "Ocupado", desocupado: "Desocupado" };

export const SEVERIDADE_ROTULO: Record<Severidade, string> = {
  grave: "Risco grave",
  atencao: "Atenção",
  positivo: "Ponto positivo",
  info: "Informativo",
};

export const SELO_ROTULO: Record<Selo, string> = { 0: "Sem selo", 1: "Promissor", 2: "Na Mira", 3: "Alvo" };

export const ORDEM_ROTULO: Record<Ordem, string> = {
  desagio: "Maior deságio",
  "lance-asc": "Menor lance",
  "lance-desc": "Maior lance",
  "m2-asc": "Menor R$/m²",
  "area-desc": "Maior área",
  data: "Praça mais próxima",
  alertas: "Menos alertas",
  selo: "Melhor selo",
  recentes: "Mais recentes",
};

/** Ordens que dependem de tags ou selo: só no plano Luneta. */
export const ORDENS_LUNETA: readonly Ordem[] = ["alertas", "selo"];

export const UF_NOME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const BRL_CENTAVOS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const NUM1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "R$ 1.234.567" (sem centavos). Use `centavos` só onde o centavo importa. */
export function moeda(v: number, centavos = false) {
  return (centavos ? BRL_CENTAVOS : BRL).format(v).replace(/ /g, " ");
}

/** "R$ 1,2 mi", "R$ 350 mil", "R$ 900": para rótulos curtos (mapa, histogramas, pílulas). */
export function moedaCurta(v: number) {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `R$ ${NUM1.format(v / 1_000_000)} mi`;
  if (a >= 10_000) return `R$ ${NUM.format(v / 1000)} mil`;
  if (a >= 1000) return `R$ ${NUM1.format(v / 1000)} mil`;
  return `R$ ${NUM.format(v)}`;
}

export function numero(v: number) {
  return NUM.format(v);
}

/** "48 m²", "1.234 m²", "12,5 ha" (áreas rurais a partir de 10 ha). */
export function area(m2: number) {
  if (m2 >= 100_000) return `${NUM1.format(m2 / 10_000)} ha`;
  return `${NUM.format(m2)} m²`;
}

/** "−48%" (deságio), "+12%" quando o lance passa da avaliação, "0%". */
export function desagio(pct: number) {
  if (pct > 0) return `−${pct}%`;
  if (pct < 0) return `+${Math.abs(pct)}%`;
  return "0%";
}

const dois = (n: number) => String(n).padStart(2, "0");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function brasilia(iso: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T12:00:00Z`);
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t - 3 * 3600 * 1000);
}

/** "16/10/2026" */
export function data(iso: string | null | undefined) {
  if (!iso) return "não informada";
  const d = brasilia(iso);
  return d ? `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : "não informada";
}

/** "16/10/2026 às 14:00" (só a data quando a fonte não dá a hora) */
export function dataHora(iso: string | null | undefined) {
  if (!iso) return "não informada";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return data(iso);
  const d = brasilia(iso);
  return d ? `${data(iso)} às ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}` : "não informada";
}

/** "16 out" (cartões) */
export function dataCurta(iso: string | null | undefined) {
  if (!iso) return "data não informada";
  const d = brasilia(iso);
  return d ? `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` : "data não informada";
}

/** "Centro · Uberlândia/MG" ou "Uberlândia/MG" */
export function local(i: { bairro: string | null; cidade: string; uf: string }) {
  return i.bairro ? `${i.bairro} · ${i.cidade}/${i.uf}` : `${i.cidade}/${i.uf}`;
}

/** Plural simples: plural(3, "imóvel", "imóveis") → "3 imóveis" */
export function plural(n: number, um: string, varios: string) {
  return `${numero(n)} ${n === 1 ? um : varios}`;
}

/** Minúsculas e sem acento, para busca ("São Paulo" → "sao paulo"). */
export function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
