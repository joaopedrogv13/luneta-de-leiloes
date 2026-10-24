/**
 * Textos dos filtros ativos (pílulas, botões rápidos) e as operações que mexem em Filtros sem quebrar a
 * coerência entre eles: remover um filtro, escolher estados/cidades/bairros em cascata, ler o que a
 * pessoa digitou num campo de valor ("300 mil", "1,5 mi", "300.000"). Funções puras (sem "@/": os
 * testes rodam em Node).
 *
 * Exemplos de pílula: "MG", "Uberlândia/MG", "Apartamento, Casa", "Lance até R$ 300 mil",
 * "Deságio ≥ 30%", "2+ quartos", "Praça: 2ª", "Sem: Ocupado".
 */
import { eTagEstacao, MODOS_ESTACAO, ROTULO_FILTRO_METRO, ROTULO_TAG_ESTACAO, SLUG_ESTACAO } from "./estacoes";
import { NAO_INFORMADO, ORDEM_PADRAO, type Facetas, type Filtros, type Modalidade, type Ocupacao, type Ordem, type Plano, type Praca, type Recurso, type Selo, type TipoImovel } from "./tipos";
import { filtroPermitido, ordemDoPlano, recursoDoFiltro } from "./planos";
import { MODALIDADE_ROTULO, OCUPACAO_ROTULO, SELO_ROTULO, TIPO_ROTULO, UF_NOME, area, moedaCurta, numero } from "./rotulos";
import { escreverBusca } from "./url";

// ---------------------------------------------------------------------------
// Chaves de lugar
// ---------------------------------------------------------------------------

/** "MG|Uberlândia" → "MG"; "MG|Uberlândia|Centro" → "MG". */
export function ufDaChave(chave: string) {
  return chave.split("|")[0];
}

/** "MG|Uberlândia|Centro" → "MG|Uberlândia". */
export function cidadeDaChave(chaveBairro: string) {
  return chaveBairro.split("|").slice(0, 2).join("|");
}

/** "MG|Uberlândia" → "Uberlândia/MG". */
export function nomeCidade(chave: string) {
  const [uf, cidade] = chave.split("|");
  return cidade ? `${cidade}/${uf}` : chave;
}

/** "MG|Uberlândia|Centro" → "Centro, Uberlândia/MG". */
export function nomeBairro(chave: string) {
  const [uf, cidade, bairro] = chave.split("|");
  return bairro ? `${bairro}, ${cidade}/${uf}` : nomeCidade(chave);
}

/** Só o último pedaço: "MG|Uberlândia|Centro" → "Centro". */
export function nomeCurto(chave: string) {
  const partes = chave.split("|");
  return partes[partes.length - 1];
}

// ---------------------------------------------------------------------------
// Operações sobre Filtros (sempre devolvem um objeto novo)
// ---------------------------------------------------------------------------

/** Tira as chaves vazias (undefined, "", listas vazias), para a URL e as comparações ficarem limpas. */
export function limparVazios(f: Filtros): Filtros {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    saida[k] = v;
  }
  return saida as Filtros;
}

/** Os mesmos filtros (sem ligar para a ordem das listas)? */
export function filtrosIguais(a: Filtros, b: Filtros) {
  return chaveFiltros(a) === chaveFiltros(b);
}

/** Chave canônica de um conjunto de filtros (listas ordenadas), para cache e comparação. */
export function chaveFiltros(f: Filtros) {
  const ordenado: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(limparVazios(f))) {
    // a área do mapa é um retângulo (a ordem conta e são números), não uma lista
    ordenado[k] = Array.isArray(v) && k !== "bbox" ? [...v].map(String).sort() : v;
  }
  return escreverBusca({ filtros: ordenado as Filtros }).toString();
}

const semDuplicados = <T,>(xs: readonly T[]) => [...new Set(xs)];

/**
 * Escolhe os estados. Cidades e bairros de um estado que saiu também saem (senão a busca continuaria
 * presa a eles sem a pessoa ver por quê).
 */
export function definirUfs(f: Filtros, ufs: readonly string[]): Filtros {
  const novas = semDuplicados(ufs);
  const saiu = new Set((f.uf ?? []).filter((u) => !novas.includes(u)));
  const cidade = (f.cidade ?? []).filter((c) => !saiu.has(ufDaChave(c)));
  const bairro = (f.bairro ?? []).filter((b) => !saiu.has(ufDaChave(b)));
  return limparVazios({ ...f, uf: novas, cidade, bairro });
}

/**
 * Escolhe as cidades. Os bairros de uma cidade que saiu também saem; uma cidade nova de um estado que
 * não está na lista de estados (quando há lista) leva o estado junto, para os filtros não se anularem.
 */
export function definirCidades(f: Filtros, cidades: readonly string[]): Filtros {
  const novas = semDuplicados(cidades);
  const saiu = new Set((f.cidade ?? []).filter((c) => !novas.includes(c)));
  const bairro = (f.bairro ?? []).filter((b) => !saiu.has(cidadeDaChave(b)));
  let uf = f.uf ?? [];
  if (uf.length) uf = semDuplicados([...uf, ...novas.map(ufDaChave)]);
  return limparVazios({ ...f, uf, cidade: novas, bairro });
}

/** Escolhe os bairros; um bairro novo leva a cidade (e o estado) quando já há cidades escolhidas. */
export function definirBairros(f: Filtros, bairros: readonly string[]): Filtros {
  const novos = semDuplicados(bairros);
  let cidade = f.cidade ?? [];
  if (cidade.length) cidade = semDuplicados([...cidade, ...novos.map(cidadeDaChave)]);
  let uf = f.uf ?? [];
  if (uf.length) uf = semDuplicados([...uf, ...novos.map(ufDaChave)]);
  return limparVazios({ ...f, uf, cidade, bairro: novos });
}

/** Grupos de filtro que viram pílula (uma faixa é um grupo só). */
export type GrupoFiltro =
  | "q" | "uf" | "cidade" | "bairro" | "tipo"
  | "lance" | "avaliacao" | "desagio" | "lanceM2" | "area" | "quartos" | "vagas"
  | "modalidade" | "praca" | "data"
  | "financiamento" | "fgts" | "parcelamento" | "ocupacao" | "natureza" | "fonte" | "comFoto"
  | "semTags" | "comTags" | "selo" | "notaLocal" | "metro"
  | "bbox";

/** Chaves de Filtros que cada grupo ocupa. */
export const CHAVES_DO_GRUPO: Record<GrupoFiltro, readonly (keyof Filtros)[]> = {
  q: ["q"],
  uf: ["uf"],
  cidade: ["cidade"],
  bairro: ["bairro"],
  tipo: ["tipo"],
  lance: ["lanceMin", "lanceMax"],
  avaliacao: ["avaliacaoMin", "avaliacaoMax"],
  desagio: ["desagioMin", "desagioMax"],
  lanceM2: ["lanceM2Min", "lanceM2Max"],
  area: ["areaMin", "areaMax"],
  quartos: ["quartosMin"],
  vagas: ["vagasMin"],
  modalidade: ["modalidade"],
  praca: ["praca"],
  data: ["dataDe", "dataAte"],
  financiamento: ["financiamento"],
  fgts: ["fgts"],
  parcelamento: ["parcelamento"],
  ocupacao: ["ocupacao"],
  natureza: ["natureza"],
  fonte: ["fonte"],
  comFoto: ["comFoto"],
  semTags: ["semTags"],
  comTags: ["comTags"],
  selo: ["selo"],
  notaLocal: ["notaLocalMin"],
  metro: ["metroPerto"],
  bbox: ["bbox"],
};

/**
 * Remove um filtro inteiro (`grupo`) ou só um valor dele (`valor`, nas listas). Estados e cidades
 * removem em cascata o que depende deles (ver definirUfs/definirCidades).
 */
export function removerFiltro(f: Filtros, grupo: GrupoFiltro, valor?: string): Filtros {
  if (grupo === "uf") return definirUfs(f, valor === undefined ? [] : (f.uf ?? []).filter((x) => x !== valor));
  if (grupo === "cidade") return definirCidades(f, valor === undefined ? [] : (f.cidade ?? []).filter((x) => x !== valor));
  if (grupo === "bairro") return limparVazios({ ...f, bairro: valor === undefined ? [] : (f.bairro ?? []).filter((x) => x !== valor) });
  const novo: Record<string, unknown> = { ...f };
  for (const chave of CHAVES_DO_GRUPO[grupo]) {
    const atual = novo[chave];
    if (valor !== undefined && Array.isArray(atual)) novo[chave] = atual.filter((x) => String(x) !== valor);
    else delete novo[chave];
  }
  return limparVazios(novo as Filtros);
}

/** O grupo está ativo nestes filtros? */
export function grupoAtivo(f: Filtros, grupo: GrupoFiltro) {
  return CHAVES_DO_GRUPO[grupo].some((k) => {
    const v = f[k];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "";
  });
}

/** Quantos grupos de uma lista estão ativos (bolinha da navegação por seção). */
export function contarGrupos(f: Filtros, grupos: readonly GrupoFiltro[]) {
  return grupos.reduce((n, g) => n + (grupoAtivo(f, g) ? 1 : 0), 0);
}

// ---------------------------------------------------------------------------
// Valores numéricos: formato, texto curto e o que a pessoa digita
// ---------------------------------------------------------------------------

/**
 * Como mostrar e ler cada faixa: reais, reais por m², porcentagem, área e deságio. O deságio tem formato
 * próprio: o mesmo "−10%" queria dizer desconto num lugar (cartão) e ágio no outro (filtro); aqui ele vira
 * texto ("30% abaixo", "10% acima", "na avaliação").
 */
export type FormatoFaixa = "moeda" | "moedaM2" | "pct" | "m2" | "desagio";

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** "−12%" / "30%" (sinal de menos tipográfico). */
function pct(n: number) {
  return n < 0 ? `−${NUM.format(Math.abs(n))}%` : `${NUM.format(n)}%`;
}

/** Deságio em palavras: 30 → "30% abaixo", −10 → "10% acima", 0 → "na avaliação". */
function desagioCurto(v: number) {
  if (v > 0) return `${NUM.format(v)}% abaixo`;
  if (v < 0) return `${NUM.format(Math.abs(v))}% acima`;
  return "na avaliação";
}

/** Valor curto para rótulos: "R$ 300 mil", "R$ 2,5 mil/m²", "30%", "120 m²", "30% abaixo". */
export function valorCurto(v: number, formato: FormatoFaixa) {
  switch (formato) {
    case "moeda":
      return moedaCurta(v);
    case "moedaM2":
      return `${moedaCurta(v)}/m²`;
    case "pct":
      return pct(v);
    case "m2":
      return area(v);
    case "desagio":
      return desagioCurto(v);
  }
}

/**
 * Faixa de deságio em frase inteira (pílula, botão rápido, título do controle): "Deságio ≥ 30%", "Deságio de
 * 30% a 60%", "Lance até 10% acima da avaliação", "Lance 5% ou mais acima da avaliação". `null` sem faixa.
 */
export function textoDesagio(min: number | undefined, max: number | undefined): string | null {
  const temMin = min !== undefined;
  const temMax = max !== undefined;
  if (!temMin && !temMax) return null;
  const n = (v: number) => NUM.format(Math.abs(v));
  if (temMin && temMax) {
    if (min >= 0) return `Deságio de ${n(min)}% a ${n(max)}%`;
    if (max <= 0) return max === 0 ? `Lance na avaliação ou até ${n(min)}% acima` : `Lance de ${n(max)}% a ${n(min)}% acima da avaliação`;
    return `De ${n(min)}% acima a ${n(max)}% abaixo da avaliação`;
  }
  if (temMin) {
    if (min > 0) return `Deságio ≥ ${n(min)}%`;
    return min === 0 ? "Lance até a avaliação" : `Lance até ${n(min)}% acima da avaliação`;
  }
  if (max! > 0) return `Deságio ≤ ${n(max!)}%`;
  return max === 0 ? "Lance na avaliação ou acima" : `Lance ${n(max!)}% ou mais acima da avaliação`;
}

/**
 * Texto de uma faixa: "até R$ 300 mil", "a partir de R$ 100 mil", "de R$ 100 mil a R$ 300 mil";
 * para porcentagem, "≥ 30%", "≤ 60%", "de 30% a 60%". `null` sem mínimo nem máximo.
 */
export function textoFaixa(min: number | undefined, max: number | undefined, formato: FormatoFaixa): string | null {
  const temMin = min !== undefined;
  const temMax = max !== undefined;
  if (!temMin && !temMax) return null;
  if (formato === "desagio") return textoDesagio(min, max);
  if (formato === "pct") {
    if (temMin && temMax) return `de ${pct(min)} a ${pct(max)}`;
    return temMin ? `≥ ${pct(min)}` : `≤ ${pct(max!)}`;
  }
  if (formato === "m2" && temMin && temMax) return `de ${NUM.format(min)} a ${area(max)}`;
  if (temMin && temMax) return `de ${valorCurto(min, formato)} a ${valorCurto(max, formato)}`;
  return temMin ? `a partir de ${valorCurto(min, formato)}` : `até ${valorCurto(max!, formato)}`;
}

const MULT: Record<string, number> = { k: 1e3, mil: 1e3, m: 1e6, mi: 1e6, mm: 1e6, milhao: 1e6, milhoes: 1e6 };

/**
 * Lê o que a pessoa digitou: "300.000", "300 mil", "300k", "1,5 mi", "R$ 2.500,50", "-10%", "1.200 m²".
 * Ponto é separador de milhar e vírgula é decimal (pt-BR); com sufixo, "1.5 mi" (um ponto com 1–2
 * casas) vale 1,5 milhão; sem sufixo, "1.500" é mil e quinhentos.
 * Devolve `undefined` se não houver número.
 */
export function lerNumeroDigitado(texto: string): number | undefined {
  const t = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/r\$|\/m2|\/m²|m²|m2|%/g, " ")
    .replace(/[−–]/g, "-")
    .trim();
  const m = t.match(/^(-)?\s*([\d.,\s]*\d[\d.,]*)\s*([a-z]*)\s*$/);
  if (!m) return undefined;
  const [, menos, corpo, sufixo] = m;
  if (sufixo && !(sufixo in MULT)) return undefined;
  let s = corpo.replace(/\s/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(s) && sufixo) {
    // "1.5 mi": com sufixo, o ponto é decimal
  } else {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  const valor = n * (sufixo ? MULT[sufixo] : 1);
  return menos ? -valor : valor;
}

/** Número no campo de texto, com milhar pt-BR: 300000 → "300.000"; −12 → "-12". */
export function formatarDigitado(n: number | undefined) {
  if (n === undefined || !Number.isFinite(n)) return "";
  return n < 0 ? `-${NUM.format(Math.abs(n))}` : NUM.format(n);
}

/**
 * Máscara enquanto digita: se o texto tem só dígitos e pontos, refaz os pontos de milhar
 * ("3000" → "3.000"); se a pessoa usou letras ou vírgula ("300 mil", "1,5"), deixa como está
 * até sair do campo.
 */
export function mascararDigitando(texto: string, aceitaNegativo = false) {
  const t = texto.replace(/[−–]/g, "-");
  const neg = aceitaNegativo && t.trimStart().startsWith("-");
  const resto = neg ? t.trimStart().slice(1) : t;
  if (!/^[\d.\s]*$/.test(resto)) return texto;
  const digitos = resto.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digitos) return neg ? "-" : "";
  // espaço no fim: a pessoa vai escrever "mil"/"mi" ("300 mil"); o espaço fica
  const espaco = /\s$/.test(resto) ? " " : "";
  return `${neg ? "-" : ""}${NUM.format(Number(digitos))}${espaco}`;
}

/** Arredonda para um número "redondo" do tamanho certo (cursores e histograma). */
export function arredondarBonito(v: number, formato: FormatoFaixa) {
  const a = Math.abs(v);
  let passo: number;
  if (formato === "pct" || formato === "desagio") passo = 1;
  else if (formato === "m2") passo = a < 100 ? 1 : a < 1000 ? 5 : a < 10_000 ? 50 : 500;
  else if (formato === "moedaM2") passo = a < 1000 ? 10 : a < 10_000 ? 50 : 500;
  else passo = a < 10_000 ? 500 : a < 100_000 ? 1000 : a < 1_000_000 ? 5000 : a < 10_000_000 ? 50_000 : 500_000;
  return Math.round(v / passo) * passo;
}

// ---------------------------------------------------------------------------
// Pílulas dos filtros ativos
// ---------------------------------------------------------------------------

export interface Pilula {
  /** chave estável (React e foco) */
  id: string;
  grupo: GrupoFiltro;
  /** o valor que esta pílula remove (listas por item); sem valor, remove o grupo inteiro */
  valor?: string;
  rotulo: string;
}

/** Nomes que só as facetas sabem (fonte, tags). Sem eles, usa o padrão abaixo ou o próprio valor. */
export type NomesDasFacetas = Partial<Pick<Facetas, "fonte" | "tags">>;

/** Rótulos das 26 tags (slugs estáveis de base/riscos/tags.ts), para quando as facetas não trazem o nome. */
export const TAG_ROTULO_PADRAO: Record<string, string> = {
  ocupado: "Ocupado",
  desocupado: "Desocupado",
  "ocupacao-nao-informada": "Ocupação não informada",
  "desagio-alto": "Deságio alto",
  "desagio-baixo": "Deságio baixo",
  "preco-acima-mercado": "Lance acima da avaliação",
  "custos-extras-altos": "Custos extras altos",
  "condominio-em-atraso": "Condomínio em atraso",
  "iptu-em-atraso": "IPTU em atraso",
  "divida-passa-arrematante": "Dívida passa ao arrematante",
  "acao-judicial": "Ação judicial em curso",
  "penhora-outros-credores": "Penhora de outros credores",
  "leilao-com-recurso": "Leilão com recurso",
  "direito-preferencia": "Devedor com direito de preferência",
  "matricula-pendencia": "Matrícula com pendência",
  "construcao-irregular": "Construção irregular",
  "area-divergente": "Área divergente",
  "imovel-inteiro": "Imóvel inteiro",
  "cota-parte": "Cota-parte",
  "so-direitos": "Só direitos sobre o imóvel",
  "sem-fotos": "Sem fotos",
  "sem-vistoria": "Sem vistoria",
  "aceita-financiamento": "Aceita financiamento",
  "primeira-praca": "1ª praça",
  "segunda-praca": "2ª praça",
  "praca-unica": "Praça única",
  // estação perto (rodada 5): o rótulo fixo do filtro; a tag de cada imóvel diz a distância
  ...Object.fromEntries(MODOS_ESTACAO.map((m) => [SLUG_ESTACAO[m], ROTULO_TAG_ESTACAO[m]])),
};

const FONTE_ROTULO_PADRAO: Record<string, string> = {
  caixa_csv: "Caixa",
  leiloesjudiciais_api: "Leilões Judiciais",
  exemplo: "Exemplo fictício",
};

export const PRACA_CURTA: Record<Praca | typeof NAO_INFORMADO, string> = { "1": "1ª", "2": "2ª", unica: "única", nd: "não informada" };

export const OCUPACAO_FILTRO_ROTULO: Record<Ocupacao | typeof NAO_INFORMADO, string> = {
  ...OCUPACAO_ROTULO,
  nd: "Não informada",
};

export const NATUREZA_ROTULO: Record<"judicial" | "extrajudicial" | typeof NAO_INFORMADO, string> = {
  judicial: "Judicial",
  extrajudicial: "Extrajudicial",
  nd: "Não informada",
};

export function nomeTag(slug: string, nomes?: NomesDasFacetas) {
  return nomes?.tags?.find((t) => t.valor === slug)?.rotulo ?? TAG_ROTULO_PADRAO[slug] ?? slug;
}

export function nomeFonte(id: string, nomes?: NomesDasFacetas) {
  return nomes?.fonte?.find((t) => t.valor === id)?.rotulo ?? FONTE_ROTULO_PADRAO[id] ?? id;
}

/** "A, B" / "A, B e mais 2" */
export function juntar(nomes: readonly string[], ate = 2) {
  if (nomes.length <= ate) return nomes.join(", ");
  return `${nomes.slice(0, ate).join(", ")} e mais ${nomes.length - ate}`;
}

const minusc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const maiusc = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** dd/mm, ou dd/mm/aaaa quando `ano` */
function diaMes(iso: string, ano: boolean) {
  const [a, m, d] = iso.split("-");
  return ano ? `${d}/${m}/${a}` : `${d}/${m}`;
}

/** "Praça de 14/10 a 21/10/2026", "Praça a partir de 14/10/2026", "Praça até 21/10/2026". */
export function textoData(de?: string, ate?: string): string | null {
  if (de && ate) {
    const mesmoAno = de.slice(0, 4) === ate.slice(0, 4);
    return `Praça de ${diaMes(de, !mesmoAno)} a ${diaMes(ate, true)}`;
  }
  if (de) return `Praça a partir de ${diaMes(de, true)}`;
  if (ate) return `Praça até ${diaMes(ate, true)}`;
  return null;
}

/** Até 3 lugares viram uma pílula cada; mais que isso, uma pílula só para o grupo. */
const LUGARES_SOLTOS = 3;

function pilulasDeLugar(grupo: "uf" | "cidade" | "bairro", valores: readonly string[] | undefined, nome: (v: string) => string): Pilula[] {
  if (!valores?.length) return [];
  if (valores.length <= LUGARES_SOLTOS) return valores.map((v) => ({ id: `${grupo}:${v}`, grupo, valor: v, rotulo: nome(v) }));
  return [{ id: grupo, grupo, rotulo: juntar(valores.map(nome)) }];
}

const SIM_NAO: Record<"financiamento" | "fgts" | "parcelamento" | "comFoto", [string, string]> = {
  financiamento: ["Aceita financiamento", "Sem financiamento"],
  fgts: ["Aceita FGTS", "Sem FGTS"],
  parcelamento: ["Aceita parcelamento", "Sem parcelamento"],
  comFoto: ["Com foto", "Sem foto"],
};

/** Rótulo de quartos/vagas: "2+ quartos", "1+ vaga". */
export function textoMinimo(n: number, um: string, varios: string) {
  return `${numero(n)}+ ${n === 1 ? um : varios}`;
}

/** As pílulas dos filtros ativos, na ordem da tela (lugar, tipo, valores, características, leilão, condições, riscos). */
export function pilulas(f: Filtros, nomes?: NomesDasFacetas): Pilula[] {
  const p: Pilula[] = [];
  const add = (grupo: GrupoFiltro, rotulo: string | null) => {
    if (rotulo) p.push({ id: grupo, grupo, rotulo });
  };

  if (f.q) add("q", `Busca: “${f.q}”`);
  // a área do mapa ("Buscar nesta área") vista na lista ou nos cards: dá para tirar aqui
  if (f.bbox) add("bbox", "Na área do mapa");
  p.push(...pilulasDeLugar("uf", f.uf, (v) => v));
  p.push(...pilulasDeLugar("cidade", f.cidade, nomeCidade));
  p.push(...pilulasDeLugar("bairro", f.bairro, nomeBairro));
  if (f.tipo?.length) add("tipo", juntar(f.tipo.map((t: TipoImovel) => TIPO_ROTULO[t] ?? t)));

  const faixa = (grupo: GrupoFiltro, nome: string, min: number | undefined, max: number | undefined, formato: FormatoFaixa) => {
    const t = textoFaixa(min, max, formato);
    if (t) add(grupo, `${nome} ${t}`);
  };
  faixa("lance", "Lance", f.lanceMin, f.lanceMax, "moeda");
  faixa("avaliacao", "Avaliação", f.avaliacaoMin, f.avaliacaoMax, "moeda");
  add("desagio", textoDesagio(f.desagioMin, f.desagioMax));
  faixa("lanceM2", "Lance por m²", f.lanceM2Min, f.lanceM2Max, "moeda");
  faixa("area", "Área", f.areaMin, f.areaMax, "m2");
  if (f.quartosMin !== undefined) add("quartos", textoMinimo(f.quartosMin, "quarto", "quartos"));
  if (f.vagasMin !== undefined) add("vagas", textoMinimo(f.vagasMin, "vaga", "vagas"));
  if (f.notaLocalMin !== undefined) add("notaLocal", `Localização: nota ${numero(f.notaLocalMin)}+`);
  if (f.metroPerto) add("metro", ROTULO_FILTRO_METRO);

  if (f.modalidade?.length) add("modalidade", juntar(f.modalidade.map((m: Modalidade) => MODALIDADE_ROTULO[m] ?? m)));
  if (f.praca?.length) add("praca", `Praça: ${f.praca.map((x) => PRACA_CURTA[x] ?? x).join(", ")}`);
  add("data", textoData(f.dataDe, f.dataAte));

  for (const c of ["financiamento", "fgts", "parcelamento"] as const) {
    if (f[c] !== undefined) add(c, SIM_NAO[c][f[c] ? 0 : 1]);
  }
  if (f.ocupacao?.length) {
    add("ocupacao", `Ocupação: ${f.ocupacao.map((o) => minusc(OCUPACAO_FILTRO_ROTULO[o] ?? o)).join(", ")}`);
  }
  if (f.natureza?.length) {
    const nat = f.natureza;
    add("natureza", nat.length === 1 && nat[0] !== NAO_INFORMADO ? NATUREZA_ROTULO[nat[0]] : `Natureza: ${nat.map((n) => minusc(NATUREZA_ROTULO[n] ?? n)).join(", ")}`);
  }
  if (f.fonte?.length) add("fonte", `Fonte: ${juntar(f.fonte.map((x) => nomeFonte(x, nomes)))}`);
  if (f.comFoto !== undefined) add("comFoto", SIM_NAO.comFoto[f.comFoto ? 0 : 1]);

  for (const slug of f.semTags ?? []) p.push({ id: `semTags:${slug}`, grupo: "semTags", valor: slug, rotulo: `Sem: ${nomeTag(slug, nomes)}` });
  // trem e VLT perto (escolhidos em "Entorno") dizem o próprio nome, como o metrô ("Trem a até 1 km", sem o "Com:")
  for (const slug of f.comTags ?? []) {
    p.push({ id: `comTags:${slug}`, grupo: "comTags", valor: slug, rotulo: eTagEstacao(slug) ? nomeTag(slug, nomes) : `Com: ${nomeTag(slug, nomes)}` });
  }
  if (f.selo?.length) add("selo", `Selo: ${[...f.selo].sort((a, b) => b - a).map((s: Exclude<Selo, 0>) => SELO_ROTULO[s]).join(", ")}`);
  return p;
}

// ---------------------------------------------------------------------------
// Texto dos botões rápidos ("Estado", "Preço"...): o nome quando vazio, o resumo quando ativo
// ---------------------------------------------------------------------------

export type BotaoRapido = "uf" | "cidade" | "tipo" | "preco" | "desagio" | "quartos";

export const BOTAO_ROTULO: Record<BotaoRapido, string> = {
  uf: "Estado",
  cidade: "Cidade",
  tipo: "Tipo",
  preco: "Preço",
  desagio: "Deságio",
  quartos: "Quartos",
};

/** Resumo do botão rápido, ou `null` quando o filtro está vazio (o botão mostra só o nome). */
export function resumoBotao(f: Filtros, botao: BotaoRapido): string | null {
  switch (botao) {
    case "uf": {
      const u = f.uf ?? [];
      if (!u.length) return null;
      return u.length <= 3 ? u.join(", ") : `${u.length} estados`;
    }
    case "cidade": {
      const c = f.cidade ?? [];
      const b = f.bairro ?? [];
      if (!c.length && !b.length) return null;
      if (!c.length) return b.length === 1 ? nomeCurto(b[0]) : `${b.length} bairros`;
      const base = c.length === 1 ? nomeCurto(c[0]) : `${c.length} cidades`;
      return b.length ? `${base} · ${b.length === 1 ? "1 bairro" : `${b.length} bairros`}` : base;
    }
    case "tipo": {
      const t = f.tipo ?? [];
      if (!t.length) return null;
      return t.length === 1 ? TIPO_ROTULO[t[0]] : `${TIPO_ROTULO[t[0]]} +${t.length - 1}`;
    }
    case "preco": {
      // curto no botão: "R$ 100 mil a 350 mil"
      if (f.lanceMin !== undefined && f.lanceMax !== undefined) return `${moedaCurta(f.lanceMin)} a ${moedaCurta(f.lanceMax).replace(/^R\$\s/, "")}`;
      const t = textoFaixa(f.lanceMin, f.lanceMax, "moeda");
      return t ? maiusc(t) : null;
    }
    case "desagio":
      return textoDesagio(f.desagioMin, f.desagioMax);
    case "quartos": {
      const partes: string[] = [];
      if (f.quartosMin !== undefined) partes.push(textoMinimo(f.quartosMin, "quarto", "quartos"));
      if (f.vagasMin !== undefined) partes.push(textoMinimo(f.vagasMin, "vaga", "vagas"));
      return partes.length ? partes.join(" · ") : null;
    }
  }
}

/** Grupos que cada botão rápido controla (para "Limpar" dentro do pop-up). */
export const GRUPOS_DO_BOTAO: Record<BotaoRapido, readonly GrupoFiltro[]> = {
  uf: ["uf"],
  cidade: ["cidade", "bairro"],
  tipo: ["tipo"],
  preco: ["lance"],
  desagio: ["desagio"],
  quartos: ["quartos", "vagas"],
};

/** Remove vários grupos de uma vez. */
export function removerGrupos(f: Filtros, grupos: readonly GrupoFiltro[]) {
  return grupos.reduce((acc, g) => removerFiltro(acc, g), f);
}

/** Todos os grupos, na ordem do painel. */
const GRUPOS = Object.keys(CHAVES_DO_GRUPO) as GrupoFiltro[];

/** O grupo é do plano? (planos.ts: no Lente, só os 6 filtros prometidos e a busca por texto) */
export function grupoPermitido(grupo: GrupoFiltro, plano: Plano): boolean {
  return CHAVES_DO_GRUPO[grupo].every((k) => filtroPermitido(k, plano));
}

/**
 * Grupos que o servidor ignora: no Lente, os filtros avançados e os de tags, selo e nota (planos.ts); com os selos
 * desligados (prévia), o selo.
 */
export function gruposIgnorados(plano: Plano, selosDesligados: boolean): GrupoFiltro[] {
  const fora = GRUPOS.filter((g) => !grupoPermitido(g, plano));
  if (selosDesligados && !fora.includes("selo")) fora.push("selo");
  return fora;
}

/** De que recurso é o grupo (null = do Lente): a janela da Luneta abre com o texto dele. */
export function recursoDoGrupo(grupo: GrupoFiltro): Recurso | null {
  return recursoDoFiltro(CHAVES_DO_GRUPO[grupo][0]!);
}

/** Os grupos ativos nos filtros que o plano não usa (a tela avisa "este filtro é do plano Luneta"). */
export function gruposForaDoPlano(f: Filtros, plano: Plano): GrupoFiltro[] {
  return GRUPOS.filter((g) => !grupoPermitido(g, plano) && grupoAtivo(f, g));
}

/**
 * Os filtros que valem de fato neste plano (um link da Luneta aberto no Lente pode trazer tags na URL:
 * o servidor as ignora, e a tela não deve mostrar pílula nem contar filtro que não está valendo).
 */
export function filtrosEfetivos(f: Filtros, plano: Plano, selosDesligados: boolean): Filtros {
  const ignorados = gruposIgnorados(plano, selosDesligados);
  return ignorados.some((g) => grupoAtivo(f, g)) ? removerGrupos(f, ignorados) : f;
}

/** A ordem que vale de fato: as da Luneta caem para a padrão no Lente (planos.ts); "Melhor selo", com os selos desligados. */
export function ordemEfetiva(o: Ordem, plano: Plano, selosDesligados: boolean): Ordem {
  const doPlano = ordemDoPlano(o, plano);
  if (selosDesligados && doPlano === "selo") return ORDEM_PADRAO;
  return doPlano;
}

/** Nome completo de uma UF para listas: "MG" → "Minas Gerais". */
export function nomeUf(uf: string) {
  return UF_NOME[uf] ?? uf;
}
