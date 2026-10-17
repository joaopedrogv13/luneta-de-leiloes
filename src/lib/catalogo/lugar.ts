/**
 * Chaves de rua e de bairro para casar endereços da base com as referências de preço (ITBI das prefeituras e os
 * outros imóveis da base). PURO, sem dependências: servidor, navegador e testes.
 *
 * É a MESMA regra de base/fontes/itbi/normalizar.py (que gera as chaves dos arquivos de ITBI): mude as duas
 * juntas. Os casos de base/fontes/itbi/casos-normalizacao.json são conferidos pelos dois lados (lugar.test.ts e
 * testar_normalizacao.py); para mudar a regra, mude aqui e lá e regenere o esperado com
 * `python3 base/fontes/itbi/testar_normalizacao.py --gerar`.
 *
 * Regra: minúsculas, sem acento e pontuação, sem o que vem entre parênteses ("(antiga Rua 5)"); "N. Sra.",
 * "Nsa. Sra." e "N. S." viram "nossa senhora" (o "S/N" de sem número fica). Rua: para no número, em "nº", "s/n",
 * km, lote, quadra, complemento; tira o tipo de logradouro do começo (só o primeiro token: "Rua Vila Rica" fica
 * "vila rica") e expande títulos (Dr → doutor, Pres → presidente). Bairro: expande abreviações (Jd → jardim).
 */

const TIPOS_LOGRADOURO = new Set([
  "r", "rua", "av", "ave", "avenida", "al", "alameda", "tv", "trav", "travessa", "pc", "pca", "praca", "est", "estr",
  "estrada", "rod", "rodovia", "lgo", "largo", "vd", "viaduto", "pq", "parque", "bc", "beco", "via", "vl", "vila",
  "vie", "viela", "ld", "ladeira", "pass", "passagem", "srv", "servidao", "q", "qd", "quadra", "conj", "cj",
]);

const TITULOS: Readonly<Record<string, string>> = {
  dr: "doutor", dra: "doutora", prof: "professor", profa: "professora", gen: "general", gal: "general",
  cel: "coronel", cap: "capitao", ten: "tenente", maj: "major", mal: "marechal", sgt: "sargento",
  brig: "brigadeiro", alm: "almirante", cmte: "comandante", pres: "presidente", gov: "governador",
  sen: "senador", dep: "deputado", ver: "vereador", min: "ministro", des: "desembargador", eng: "engenheiro",
  pe: "padre", fr: "frei", d: "dom", sto: "santo", sta: "santa", s: "sao", ns: "nossa senhora",
  nsa: "nossa senhora", nsra: "nossa senhora", sra: "senhora",
};

const PARADAS = new Set([
  "n", "no", "num", "numero", "nr", "km", "lote", "lt", "quadra", "qd", "casa", "apto", "ap", "apartamento", "bloco",
  "bl", "sala", "loja", "esquina", "esq", "entre", "proximo", "prox", "conjunto", "conj", "cj",
]);

const ABREV_BAIRRO: Readonly<Record<string, string>> = {
  jd: "jardim", jdm: "jardim", jard: "jardim", vl: "vila", pq: "parque", res: "residencial",
  cj: "conjunto", conj: "conjunto", st: "setor", chac: "chacara", lot: "loteamento", bal: "balneario",
  nsa: "nossa", sra: "senhora", sto: "santo", sta: "santa", s: "sao", cid: "cidade",
};

/** "n sra", "nsa sra", "n s de fatima" → "nossa senhora" (mas "n s n", o "s/n" de sem número, fica). */
const NOSSA_SENHORA = /\b(?:n|ns|nsa|nsra|nossa) (?:sra|senhora|s(?! n\b))\b/g;

/** Tabela de consulta: `own` para "constructor", "toString"... não virarem título. */
const de = (tabela: Readonly<Record<string, string>>, p: string): string => (Object.hasOwn(tabela, p) ? tabela[p]! : p);

/** `_base` do .py: antes do parêntese, sem acento, minúsculas, só [a-z0-9 ], espaços simples. */
function base(texto: string | null | undefined): string {
  if (!texto) return "";
  let t = String(texto).split(/[([]/, 1)[0]!;
  t = t.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
  t = t.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return t.replace(NOSSA_SENHORA, "nossa senhora");
}

/** 'R. Dr. José Benedetti, nº 18' → 'doutor jose benedetti'. Igual a `normalizar_rua` do .py. */
export function normalizarRua(texto: string | null | undefined): string {
  const palavras = texto ? base(texto).split(" ") : [];
  let nome: string[] = [];
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i]!;
    if (!p) continue;
    if (/^[0-9]/.test(p) || (PARADAS.has(p) && nome.length > 0) || (p === "s" && i + 1 < palavras.length && palavras[i + 1] === "n")) break;
    nome.push(p);
  }
  if (nome.length > 0 && TIPOS_LOGRADOURO.has(nome[0]!)) nome = nome.slice(1);
  return nome.map((p) => de(TITULOS, p)).join(" ");
}

/** 'Jd. Paulista' → 'jardim paulista'. Igual a `normalizar_bairro` do .py. */
export function normalizarBairro(texto: string | null | undefined): string {
  const palavras = texto ? base(texto).split(" ") : [];
  return palavras
    .filter(Boolean)
    .map((p) => de(ABREV_BAIRRO, p))
    .join(" ");
}

/**
 * Rua do endereço publicado pela fonte, como chave: o trecho antes da primeira vírgula, normalizado
 * ("Rua do Purus, N. S/N, Quarteirão 272, Lote 10" → "do purus"). null quando não sobra um nome que identifique a
 * rua (nenhuma palavra com 3 letras ou mais: "Quadra 114, N. Sn" → null; "Rua X" → null).
 */
export function ruaDoEndereco(endereco: string | null | undefined): string | null {
  if (!endereco) return null;
  const chave = normalizarRua(endereco.split(",", 1)[0]);
  return chave.split(" ").some((p) => /^[a-z]{3,}/.test(p)) ? chave : null;
}

/** Chave de bairro para comparar (null sem bairro). */
export function chaveBairro(bairro: string | null | undefined): string | null {
  const chave = normalizarBairro(bairro);
  return chave === "" ? null : chave;
}
