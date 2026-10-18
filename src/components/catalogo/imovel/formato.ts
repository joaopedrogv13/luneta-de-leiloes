/**
 * Textos e contas da página do imóvel (funções puras, iguais no servidor e no navegador).
 * Imports relativos, sem "@/": o teste roda em Node puro.
 */
import { fonteReferencia as fonteDaReferencia } from "../../../lib/catalogo/referencia";
import { area, moeda, normalizar, numero, PRACA_ROTULO, UF_NOME } from "../../../lib/catalogo/rotulos";
import type {
  ImovelResumo,
  LinkImovel,
  LocalizacaoImovel,
  Praca,
  PracaDetalhe,
  PrecisaoLocal,
  ReferenciaM2,
  RegistroImovel,
  TipoImovel,
  TipoLink,
} from "../../../lib/catalogo/tipos";

/** "não informado pela fonte" / "não informada pela fonte", pelo gênero do campo. */
export function naoInformado(genero: "m" | "f" = "m") {
  return genero === "f" ? "não informada pela fonte" : "não informado pela fonte";
}

/** Conjunto de exemplos fictícios (a /assinante). */
export const ehExemplo = (i: Pick<ImovelResumo, "fonte">) => i.fonte.id === "exemplo";

/**
 * Identificador do imóvel no site da fonte, a partir do id do catálogo: "caixa-8444402395965" → "8444402395965",
 * "lj-222141" → "222141". Exemplo fictício (ou formato desconhecido): null.
 */
export function idNaFonte(id: string): string | null {
  const m = /^(caixa|lj)-(.+)$/.exec(id);
  return m ? m[2]! : null;
}

/** Número da praça atual no formato de PracaDetalhe (0 = praça única). */
export function numeroDaPraca(p: Praca | null): PracaDetalhe["numero"] | null {
  if (p === "1") return 1;
  if (p === "2") return 2;
  if (p === "unica") return 0;
  return null;
}

/** "1ª praça", "2ª praça", "3ª praça", "Praça única". */
export function rotuloNumeroPraca(n: PracaDetalhe["numero"]) {
  return n === 0 ? PRACA_ROTULO.unica : `${n}ª praça`;
}

/** Deságio em frase: "40% abaixo da avaliação", "lance 12% acima da avaliação", "lance igual à avaliação". */
export function fraseDesagio(d: number | null): string | null {
  if (d === null) return null;
  if (d > 0) return `${numero(d)}% abaixo da avaliação`;
  if (d < 0) return `lance ${numero(Math.abs(d))}% acima da avaliação`;
  return "lance igual à avaliação";
}

/** Dia (AAAA-MM-DD) em Brasília, UTC−3 fixo. */
function diaBrasilia(t: number) {
  return new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Quanto falta para a praça, em dias do calendário de Brasília: "hoje", "amanhã", "em 5 dias"; "já passou" quando a
 * hora (ou o dia, se a fonte não dá a hora) ficou para trás. null sem data.
 */
export function faltaParaPraca(iso: string | null, agora: number): { texto: string; passou: boolean } | null {
  if (!iso) return null;
  const soDia = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const quando = soDia ? Date.parse(`${iso}T23:59:59-03:00`) : Date.parse(iso);
  if (Number.isNaN(quando)) return null;
  if (quando < agora) return { texto: "já passou", passou: true };
  const dias = Math.round((Date.parse(soDia ? iso : diaBrasilia(quando)) - Date.parse(diaBrasilia(agora))) / 86_400_000);
  if (dias <= 0) return { texto: "hoje", passou: false };
  if (dias === 1) return { texto: "amanhã", passou: false };
  return { texto: `em ${numero(dias)} dias`, passou: false };
}

/** A partir de 10 ha a área sai em hectares, e o preço por área acompanha (R$/ha em vez de R$/m²). */
export const AREA_HECTARE = 100_000;

/** "R$ 3.831/m²", ou "R$ 12.300/ha" para áreas de 10 ha ou mais. */
export function precoPorArea(valorM2: number, areaM2: number | null) {
  if (areaM2 !== null && areaM2 >= AREA_HECTARE) return `${moeda(Math.round(valorM2 * 10_000))}/ha`;
  return `${moeda(valorM2, valorM2 < 10)}/m²`;
}

/** "240,8 m²" com até 2 casas (a área da página do imóvel mostra o que a fonte deu). */
export function areaDetalhada(m2: number) {
  if (m2 >= AREA_HECTARE) return area(m2);
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(m2)} m²`;
}

// ---------------------------------------------------------------------------
// Preço do m² na região
// ---------------------------------------------------------------------------

/** "apartamentos", "casas", "imóveis comerciais"... (para frases). */
export const TIPO_NA_FRASE: Record<TipoImovel, string> = {
  apartamento: "apartamentos",
  casa: "casas",
  terreno: "terrenos",
  comercial: "imóveis comerciais",
  rural: "imóveis rurais",
  outro: "imóveis do mesmo tipo",
};

/** Só "casas" é feminino entre os tipos ("das casas", "todas as 7 casas", "nenhuma das casas"). */
const TIPO_FEMININO: ReadonlySet<TipoImovel> = new Set(["casa"]);

/**
 * Artigos e pronomes que concordam com o tipo: `dos`/`das`, `todos`/`todas`, `nenhum`/`nenhuma`, `outros`/`outras`.
 * `concorda("casa").dos` → "das".
 */
export function concorda(tipo: TipoImovel) {
  const f = TIPO_FEMININO.has(tipo);
  return {
    dos: f ? "das" : "dos",
    os: f ? "as" : "os",
    todos: f ? "todas" : "todos",
    nenhum: f ? "nenhuma" : "nenhum",
    outros: f ? "outras" : "outros",
  };
}

/** Estados que pedem "do"/"da" ("no estado do Paraná", "da Bahia"); os outros, "de" ("de São Paulo"). */
const ESTADO_DO = new Set(["AC", "AP", "AM", "CE", "DF", "ES", "MA", "PA", "PR", "PI", "RJ", "RN", "RS", "TO"]);
const ESTADO_DA = new Set(["BA", "PB"]);

/** "do Paraná", "da Bahia", "de São Paulo". */
export function deEstado(uf: string) {
  const nome = UF_NOME[uf] ?? uf;
  return `${ESTADO_DA.has(uf) ? "da" : ESTADO_DO.has(uf) ? "do" : "de"} ${nome}`;
}

/** Cidades com artigo ("do Rio de Janeiro", "do Recife"). */
const CIDADE_COM_ARTIGO = new Set(["Rio de Janeiro", "Recife"]);

/** Tipos de logradouro no masculino ("no Largo do Machado", "no Beco..."); o resto é feminino ("na Rua", "na Avenida"). */
const LOGRADOURO_MASCULINO = new Set(["largo", "beco", "caminho", "parque", "viaduto", "acesso", "anel", "conjunto", "loteamento", "trecho", "ramal", "corredor", "contorno"]);

/** Onde fica o recorte, já com a preposição: "na Rua X, Uberlândia/MG", "no bairro Centro, Uberlândia/MG", "na cidade de Uberlândia/MG", "no estado de Minas Gerais". */
export function ondeRecorte(r: Pick<ReferenciaM2, "escopo" | "nome">): string {
  if (r.escopo === "uf") return `no estado ${deEstado(r.nome)}`;
  if (r.escopo === "cidade") {
    const [cidade = r.nome] = r.nome.split("/");
    return `na cidade ${CIDADE_COM_ARTIGO.has(cidade) ? "do" : "de"} ${r.nome}`;
  }
  if (r.escopo === "rua") {
    const primeira = normalizar(r.nome.split(/\s+/)[0] ?? "");
    return `${LOGRADOURO_MASCULINO.has(primeira) ? "no" : "na"} ${r.nome}`;
  }
  return `no bairro ${r.nome}`;
}

/** Nome curto do recorte para títulos: "Centro, Uberlândia/MG", "Uberlândia/MG", "Minas Gerais". */
export function nomeRecorte(r: Pick<ReferenciaM2, "escopo" | "nome">) {
  return r.escopo === "uf" ? (UF_NOME[r.nome] ?? r.nome) : r.nome;
}

/** "Rua X, N. 338, Lt 28" → "Rua X": o trecho antes da primeira vírgula, quando parece um logradouro (senão null). */
export function logradouro(endereco: string | null): string | null {
  if (!endereco) return null;
  const t = endereco.split(",")[0]!.trim();
  return t.length >= 4 && t.length <= 80 && /\p{L}{3}/u.test(t) && !/^\d/.test(t) ? t : null;
}

/** Só o lugar, sem a cidade que já está no contexto: "Rua X", "Centro", "Uberlândia/MG", "Minas Gerais". */
export function lugarDoRecorte(r: Pick<ReferenciaM2, "escopo" | "nome">) {
  if (r.escopo === "rua" || r.escopo === "bairro") {
    const k = r.nome.lastIndexOf(", ");
    return k > 0 ? r.nome.slice(0, k) : r.nome;
  }
  return nomeRecorte(r);
}

export const ROTULO_ESCOPO: Record<ReferenciaM2["escopo"], string> = { rua: "Rua", bairro: "Bairro", cidade: "Cidade", uf: "Estado" };

/**
 * "Por m², o lance deste imóvel é menor que o de 78% dos apartamentos em leilão no bairro …". Nas pontas (0% e
 * 100%), uma frase que se lê: "menor que o de todos os 7 apartamentos…", "nenhum dos 7 apartamentos… tem lance
 * maior…". O percentil vem arredondado: com 200 ou mais imóveis, 100% pode ser 99,6%, então vira "praticamente".
 */
export function frasePercentil(r: ReferenciaM2): string | null {
  const p = r.percentilLance;
  if (p === null) return null;
  const tipos = TIPO_NA_FRASE[r.tipo];
  const g = concorda(r.tipo);
  const onde = ondeRecorte(r);
  const exato = r.amostra < 200;
  if (p >= 100) {
    return exato
      ? `Por m², o lance deste imóvel é menor que o de ${g.todos} ${g.os} ${numero(r.amostra)} ${tipos} em leilão ${onde}.`
      : `Por m², o lance deste imóvel é menor que o de praticamente ${g.todos} ${g.os} ${tipos} em leilão ${onde}.`;
  }
  if (p <= 0) {
    return exato
      ? `Por m², ${g.nenhum} ${g.dos} ${numero(r.amostra)} ${tipos} em leilão ${onde} tem lance maior que o deste imóvel.`
      : `Por m², praticamente ${g.nenhum} ${g.dos} ${tipos} em leilão ${onde} tem lance maior que o deste imóvel.`;
  }
  return `Por m², o lance deste imóvel é menor que o de ${numero(p)}% ${g.dos} ${tipos} em leilão ${onde}.`;
}

/** Quantas vezes fora da faixa das referências um valor do imóvel pode estar e ainda entrar na escala do gráfico. */
export const FATOR_FORA = 3;

// ---------------------------------------------------------------------------
// Comparação simples com a região: a avaliação deste imóvel contra a média da rua, do bairro, da cidade e do estado
// ---------------------------------------------------------------------------

/** Os 5 níveis do selo da comparação, do mais abaixo ao mais acima. */
export const NIVEIS_COMPARACAO = ["Muito abaixo", "Abaixo", "Na média", "Acima", "Muito acima"] as const;
export type NivelComparacao = 0 | 1 | 2 | 3 | 4;

/**
 * Diferença de um valor para a média, em % inteiro com sinal (−31 = 31% abaixo), e o nível: muito abaixo (−30% ou
 * menos), abaixo (de −29% a −10%), na média (de −9% a +9%), acima (de +10% a +29%), muito acima (+30% ou mais). O
 * nível sai do % já arredondado, para o selo nunca contradizer o número escrito ao lado. null sem os dois valores.
 */
export function compararComMedia(valor: number | null | undefined, media: number | null | undefined): { pct: number; razao: number; nivel: NivelComparacao } | null {
  if (valor == null || media == null || !(valor > 0) || !(media > 0)) return null;
  const razao = valor / media;
  const pct = Math.round((razao - 1) * 100);
  const nivel: NivelComparacao = pct <= -30 ? 0 : pct <= -10 ? 1 : pct < 10 ? 2 : pct < 30 ? 3 : 4;
  return { pct, razao, nivel };
}

/** "2,4" (uma casa, vírgula). */
const vezes = (x: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.round(x * 10) / 10);

/** Diferença curta para a tabela: "31% abaixo", "12% acima", "igual", "2,4 vezes". */
export function diferencaCurta(c: { pct: number; razao: number }): string {
  if (c.razao >= 2) return `${vezes(c.razao)} vezes`;
  if (Math.abs(c.pct) < 2) return "igual";
  return `${numero(Math.abs(c.pct))}% ${c.pct < 0 ? "abaixo" : "acima"}`;
}

/** Com o que se compara: "a média do bairro" (leilões) ou "o preço médio pago no bairro" (ITBI). */
export interface AlvoComparacao {
  artigo: "a" | "o";
  nome: string;
}

const ESCOPO_NA_FRASE: Record<ReferenciaM2["escopo"], string> = { rua: "da rua", bairro: "do bairro", cidade: "da cidade", uf: "do estado" };
const ESCOPO_NO: Record<ReferenciaM2["escopo"], string> = { rua: "na rua", bairro: "no bairro", cidade: "na cidade", uf: "no estado" };

/** "a média do bairro" para os leilões; "o preço médio pago no bairro" para o ITBI. */
export function alvoDaReferencia(r: Pick<ReferenciaM2, "escopo" | "fonte">): AlvoComparacao {
  return r.fonte === "itbi" ? { artigo: "o", nome: `preço médio pago ${ESCOPO_NO[r.escopo]}` } : { artigo: "a", nome: `média ${ESCOPO_NA_FRASE[r.escopo]}` };
}

/**
 * Frase da comparação, sem o sujeito: "está 31% abaixo da média do bairro", "está praticamente igual à média da
 * cidade", "é 2,4 vezes a média do bairro" (a partir do dobro, "vezes" se lê melhor que "140% acima").
 */
export function predicadoComparacao(c: { pct: number; razao: number }, alvo: AlvoComparacao): string {
  const de = alvo.artigo === "a" ? "da" : "do";
  if (c.razao >= 2) return `é ${vezes(c.razao)} vezes ${alvo.artigo} ${alvo.nome}`;
  if (Math.abs(c.pct) < 2) return `está praticamente igual ${alvo.artigo === "a" ? "à" : "ao"} ${alvo.nome}`;
  return `está ${numero(Math.abs(c.pct))}% ${c.pct < 0 ? "abaixo" : "acima"} ${de} ${alvo.nome}`;
}

/**
 * Média de uma referência (R$/m²), fonte e a referência principal da região: as mesmas funções do simulador e do
 * relatório (src/lib/catalogo/referencia.ts), para a frase, a "Região" do simulador e o PDF nunca divergirem.
 */
export { mediaReferencia as mediaDe, fonteReferencia as fonteDaReferencia, referenciaLeiloes, referenciaPrincipal } from "../../../lib/catalogo/referencia";
/**
 * Como a referência é descrita numa frase: "preço médio pago em 10 compras registradas na prefeitura (ITBI) no
 * bairro Sacoma, São Paulo/SP" ou "avaliação média de 22 casas em leilão na cidade de São Paulo/SP".
 */
export function descricaoReferencia(r: Pick<ReferenciaM2, "escopo" | "nome" | "fonte" | "amostra" | "tipo">): string {
  const n = numero(r.amostra);
  return r.fonte === "itbi"
    ? `preço médio pago em ${n} ${r.amostra === 1 ? "compra registrada" : "compras registradas"} na prefeitura (ITBI) ${ondeRecorte(r)}`
    : `avaliação média de ${n} ${TIPO_NA_FRASE[r.tipo]} em leilão ${ondeRecorte(r)}`;
}

export const ESCOPOS: readonly ReferenciaM2["escopo"][] = ["rua", "bairro", "cidade", "uf"];
/** Amostra mínima de cada recorte de leilões (src/lib/catalogo/vizinhanca.ts). */
const MINIMO_LEILOES: Record<ReferenciaM2["escopo"], number> = { rua: 3, bairro: 5, cidade: 5, uf: 3 };
/** O conjunto de cada recorte contém o do recorte (mais local) da chave? A rua pode atravessar bairros: o bairro não contém a rua. */
const CONTEM: Record<ReferenciaM2["escopo"], readonly ReferenciaM2["escopo"][]> = { rua: [], bairro: [], cidade: ["rua", "bairro"], uf: ["rua", "bairro", "cidade"] };

export interface LinhaRegiao {
  escopo: ReferenciaM2["escopo"];
  ref: ReferenciaM2 | null;
  /** sem referência própria porque os imóveis são os mesmos do recorte anterior (ex.: todas as casas da cidade estão no bairro) */
  igualA: ReferenciaM2["escopo"] | null;
}

/**
 * As linhas da tabela de leilões: sempre rua, bairro, cidade e estado. O servidor não repete um recorte com a
 * mesma amostra do anterior; quando dá para ter certeza de que foi isso (a cidade contém o bairro, e o bairro já
 * tinha amostra suficiente para a cidade), a linha diz "os mesmos do bairro" em vez de "sem dados suficientes".
 */
export function linhasLeiloes(refs: readonly ReferenciaM2[]): LinhaRegiao[] {
  const leiloes = refs.filter((r) => fonteDaReferencia(r) === "leiloes");
  let anterior: ReferenciaM2 | null = null;
  return ESCOPOS.map((escopo) => {
    const ref = leiloes.find((r) => r.escopo === escopo) ?? null;
    if (ref) {
      anterior = ref;
      return { escopo, ref, igualA: null };
    }
    const a = anterior as ReferenciaM2 | null;
    const igual = a !== null && CONTEM[escopo].includes(a.escopo) && a.amostra >= MINIMO_LEILOES[escopo];
    return { escopo, ref: null, igualA: igual ? a.escopo : null };
  });
}

/** As referências de ITBI (rua, bairro, cidade), na ordem do mais local ao mais amplo. */
export const referenciasItbi = (refs: readonly ReferenciaM2[]) => ESCOPOS.flatMap((e) => refs.filter((r) => r.fonte === "itbi" && r.escopo === e));

/** "set/2025 a set/2026" a partir de ["2025-09-01", "2026-09-30"]. */
export function periodoCurto(p: readonly [string, string] | null | undefined): string | null {
  if (!p) return null;
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const mes = (iso: string) => {
    const m = Number(iso.slice(5, 7));
    return m >= 1 && m <= 12 ? `${MESES[m - 1]}/${iso.slice(0, 4)}` : iso;
  };
  return `${mes(p[0])} a ${mes(p[1])}`;
}

/**
 * Escala do gráfico de R$/m² da região: as faixas sempre entram; os marcadores deste imóvel só entram se não
 * esmagarem as faixas (até 3 vezes o maior valor das faixas, e pelo menos um terço do menor). O que fica de fora
 * é desenhado na borda, com a indicação "fora da escala" (ver `posicaoNaEscala`).
 */
export function escalaRegiao(faixas: readonly number[], marcadores: readonly number[]) {
  const validos = faixas.filter((x) => Number.isFinite(x) && x > 0);
  if (validos.length === 0) return escalaM2(marcadores);
  const lo = Math.min(...validos);
  const hi = Math.max(...validos);
  const dentro = marcadores.filter((v) => v <= hi * FATOR_FORA && v >= lo / FATOR_FORA);
  return escalaM2([...validos, ...dentro]);
}

/** Posição de um valor na escala (0 a 100) e se ele passou da borda (−1 à esquerda, 1 à direita, 0 dentro). */
export function posicaoNaEscala(v: number, min: number, max: number): { pct: number; fora: -1 | 0 | 1 } {
  const pct = ((v - min) / (max - min || 1)) * 100;
  if (pct < 0) return { pct: 0, fora: -1 };
  if (pct > 100) return { pct: 100, fora: 1 };
  return { pct, fora: 0 };
}

/** Escala comum dos gráficos de R$/m²: domínio com folga e marcas redondas (1, 2, 2,5 ou 5 × 10ⁿ). */
export function escalaM2(valores: readonly number[], marcasAlvo = 4): { min: number; max: number; marcas: number[] } | null {
  const v = valores.filter((x) => Number.isFinite(x) && x >= 0);
  if (v.length === 0) return null;
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (hi === lo) {
    lo = lo * 0.8;
    hi = hi * 1.2 || 1;
  }
  const folga = (hi - lo) * 0.08;
  lo = Math.max(0, lo - folga);
  hi = hi + folga;
  const bruto = (hi - lo) / marcasAlvo;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? 10 * pot;
  const min = Math.floor(lo / passo) * passo;
  const max = Math.ceil(hi / passo) * passo;
  const marcas: number[] = [];
  for (let x = min; x <= max + passo / 2; x += passo) marcas.push(Math.round(x * 100) / 100);
  return { min, max, marcas };
}

// ---------------------------------------------------------------------------
// Links e documentos
// ---------------------------------------------------------------------------

const ORDEM_LINK: readonly TipoLink[] = ["anuncio", "edital", "matricula", "laudo", "avaliacao", "processo", "leiloeiro", "mapa", "outro"];

/** Anúncio primeiro, depois edital, matrícula, laudo, avaliação, processo, leiloeiro, mapa e outros (estável). */
export function ordenarLinks(links: readonly LinkImovel[]): LinkImovel[] {
  const peso = (l: LinkImovel) => {
    const k = ORDEM_LINK.indexOf(l.tipo);
    return k < 0 ? ORDEM_LINK.length : k;
  };
  return links
    .map((l, i) => ({ l, i }))
    .sort((a, b) => peso(a.l) - peso(b.l) || a.i - b.i)
    .map((x) => x.l);
}

/** "giordanoleiloes.com.br" (sem "www."); a própria URL se não der para ler. */
export function dominio(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const TIPO_LINK_ROTULO: Record<TipoLink, string> = {
  anuncio: "Anúncio",
  edital: "Edital",
  matricula: "Matrícula",
  laudo: "Laudo",
  avaliacao: "Avaliação",
  leiloeiro: "Leiloeiro",
  processo: "Processo",
  mapa: "Mapa",
  outro: "Link",
};

// ---------------------------------------------------------------------------
// Registro (matrícula, cartório, comarca, ofício, inscrição, averbação)
// ---------------------------------------------------------------------------

const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e"]);

/**
 * Texto todo em maiúsculas (como a ficha da Caixa escreve) em forma de nome: "SÃO GONÇALO-RJ" → "São Gonçalo-RJ",
 * "AVERBADO" → "Averbado". A sigla de 2 letras no fim (UF) fica em maiúsculas. Texto com minúsculas fica como está.
 */
export function formaDeNome(texto: string): string {
  if (/\p{Ll}/u.test(texto)) return texto;
  return texto
    .toLowerCase()
    .split(/(\s+|[-/])/)
    .map((p, k, partes) => {
      if (/^\s+$|^[-/]$/.test(p) || p === "") return p;
      const ultima = partes.slice(k + 1).every((x) => x === "" || /^\s+$/.test(x));
      if (ultima && p.length === 2 && k > 0 && /[-/]/.test(partes[k - 1] ?? "")) return p.toUpperCase();
      if (k > 0 && CONECTIVOS.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join("");
}

/** "06" → "6º Ofício"; "2º Ofício de Registro de Imóveis" fica como está. */
export function textoOficio(oficio: string): string {
  const o = oficio.trim();
  if (/^\d+$/.test(o)) return `${Number(o)}º Ofício`;
  if (/^\d+\s*[ºo°]?$/i.test(o)) return `${Number.parseInt(o, 10)}º Ofício`;
  return /of[ií]cio/i.test(o) ? formaDeNome(o) : `Ofício ${formaDeNome(o)}`;
}

/** "Matrícula 13.941" → "13.941" (rótulo dos links de matrícula da Leilões Judiciais). */
export const numeroMatricula = (rotulo: string) => /matr[ií]cula\s+(?:n[ºo°.]*\s*)?([\d.\-/]+)/i.exec(rotulo)?.[1] ?? null;

/** "a, b e c" */
export const listaE = (itens: readonly string[]) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`);

export interface RegistroNaTela {
  situacao: "lido" | "pendente" | "na_fonte" | "nao_publica";
  /** números de matrícula (do registro, do campo da fonte e dos rótulos dos PDFs), sem repetir */
  matriculas: string[];
  /** cartório, comarca e ofício juntos: "2º CRI", "Comarca de São Gonçalo-RJ · 6º Ofício" */
  cartorio: string | null;
  inscricao: string | null;
  averbacao: string | null;
  /** PDFs de matrícula entre os links */
  pdfs: LinkImovel[];
  paginaFonte: string | null;
  lidoEm: string | null;
}

/**
 * O que a seção mostra dos dados de registro. A fonte da verdade é `registro` (situação e campos da ficha); o campo
 * `matricula`/`cartorio` do detalhe e os rótulos dos PDFs ("Matrícula 13.941") completam os números.
 */
export function registroNaTela(
  i: { registro: RegistroImovel; matricula: string | null; cartorio: string | null; links: readonly LinkImovel[] },
): RegistroNaTela {
  const r = i.registro;
  const pdfs = i.links.filter((l) => l.tipo === "matricula");
  const numeros = [...r.matriculas, ...(i.matricula ?? "").split(/\s*[;,]\s*/), ...pdfs.map((l) => numeroMatricula(l.rotulo) ?? "")]
    .map((m) => m.trim())
    .filter(Boolean);
  const matriculas = [...new Set(numeros)];
  // "SÃO GONÇALO-RJ" → "São Gonçalo/RJ" (o jeito do site de escrever cidade e UF)
  const comarca = r.comarca ? `Comarca de ${formaDeNome(r.comarca).replace(/\s*-\s*([A-Z]{2})$/, "/$1")}` : null;
  const oficio = r.oficio ? textoOficio(r.oficio) : null;
  const base = r.cartorio ?? i.cartorio;
  // o cartório já diz a cidade ("... de Campinas/SP"): a comarca não se repete
  const comarcaNova = comarca && !(base && r.comarca && normalizar(base).includes(normalizar(r.comarca).replace(/-/g, "/")));
  // o cartório da fonte sem o número do ofício ("CRI de São Gonçalo"): o ofício da ficha entra junto
  const oficioNovo = oficio && !(base && /of[ií]cio|\d\s*[ºo°]/i.test(base));
  const cartorio = base
    ? [base, comarcaNova ? comarca : null, oficioNovo ? oficio : null].filter(Boolean).join(" · ")
    : [comarca, oficio].filter(Boolean).join(" · ") || null;
  return {
    situacao: r.situacao,
    matriculas,
    cartorio,
    inscricao: r.inscricaoImobiliaria ? r.inscricaoImobiliaria.trim() : null,
    averbacao: r.averbacaoLeiloesNegativos ? formaDeNome(r.averbacaoLeiloesNegativos.trim()) : null,
    pdfs,
    paginaFonte: r.paginaFonte,
    lidoEm: r.lidoEm,
  };
}

/**
 * A linha "bairro · cidade/UF" repetiria o endereço? (Sem bairro, e o endereço já termina com a cidade:
 * "..., São Caetano do Sul/SP".)
 */
export function localRepetido(i: Pick<ImovelResumo, "bairro" | "cidade" | "uf"> & { endereco: string | null }) {
  if (!i.endereco || i.bairro) return false;
  const e = normalizar(i.endereco).replace(/\s+/g, " ");
  const c = normalizar(i.cidade);
  return e.includes(`${c}/${i.uf.toLowerCase()}`) || e.includes(`${c} - ${i.uf.toLowerCase()}`) || e.includes(`${c} ${i.uf.toLowerCase()}`);
}

const RANK_PRECISAO: Record<NonNullable<ImovelResumo["precisaoGeo"]>, number> = { exata: 4, rua: 3, cep: 2.5, bairro: 2, cidade: 1 };
const PRECISAO_DO_GEOCODE: Record<PrecisaoLocal, NonNullable<ImovelResumo["precisaoGeo"]>> = { numero: "exata", rua: "rua", bairro: "bairro", cidade: "cidade" };

/**
 * O ponto da seção Localização: o mais preciso entre o do resumo e o da nota de localização (o geocode do CNEFE).
 * `cnefe`: o ponto "exata" veio do endereço localizado no número pelo cadastro do IBGE, e não da fonte (a Caixa não
 * publica coordenada; a Leilões Judiciais publica). null sem ponto nenhum.
 */
export function pontoDaSecao(
  i: Pick<ImovelResumo, "lat" | "lon" | "precisaoGeo" | "fonte">,
  loc: Pick<LocalizacaoImovel, "lat" | "lon" | "precisao"> | null,
): { lat: number; lon: number; precisao: ImovelResumo["precisaoGeo"]; cnefe: boolean } | null {
  const doLoc =
    loc && loc.lat !== null && loc.lon !== null && loc.precisao !== null ? { lat: loc.lat, lon: loc.lon, precisao: PRECISAO_DO_GEOCODE[loc.precisao] } : null;
  const doResumo = i.lat !== null && i.lon !== null ? { lat: i.lat, lon: i.lon, precisao: i.precisaoGeo } : null;
  const rank = (p: ImovelResumo["precisaoGeo"]) => (p ? RANK_PRECISAO[p] : 0);
  const usarLoc = doLoc && (!doResumo || rank(doLoc.precisao) > rank(doResumo.precisao));
  const p = usarLoc ? doLoc : doResumo;
  if (!p) return null;
  const mesmoPonto = !!doLoc && Math.abs(doLoc.lat - p.lat) < 1e-4 && Math.abs(doLoc.lon - p.lon) < 1e-4;
  const cnefe = p.precisao === "exata" && (i.fonte.id === "caixa_csv" || (loc?.precisao === "numero" && mesmoPonto));
  return { ...p, cnefe };
}

/** O ponto no OpenStreetMap, com o marcador ("Ver o ponto no mapa"): zoom de rua (17), ou de bairro (15) no aproximado. */
export function linkPontoOsm(lat: number, lon: number, aproximado = false): string {
  const la = lat.toFixed(5);
  const lo = lon.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=${aproximado ? 15 : 17}/${la}/${lo}`;
}

/**
 * Legenda curta do mapa mini, conforme a precisão: "Posição aproximada (pela rua)", "(centro da cidade)"... Com `cnefe`,
 * o ponto exato veio do endereço localizado no cadastro do IBGE (e não da fonte).
 */
export function legendaPosicao(p: ImovelResumo["precisaoGeo"], cnefe = false): string {
  switch (p) {
    case "exata":
      return cnefe ? "Endereço localizado no número" : "Posição informada pela fonte";
    case "rua":
      return "Posição aproximada (pela rua)";
    case "cep":
      return "Posição aproximada (pelo CEP)";
    case "bairro":
      return "Posição aproximada (centro do bairro)";
    default:
      return "Posição aproximada (centro da cidade)";
  }
}

/** Texto da posição no mapa conforme a precisão: "Posição aproximada: centro de Uberlândia/MG". */
export function textoPosicao(i: Pick<ImovelResumo, "precisaoGeo" | "cidade" | "uf" | "bairro">, cnefe = false): string {
  switch (i.precisaoGeo) {
    case "exata":
      return cnefe ? "Endereço localizado no número, no cadastro de endereços do IBGE (CNEFE 2022)" : "Posição informada pela fonte";
    case "rua":
      return "Posição aproximada: pela rua do endereço publicado";
    case "cep":
      return "Posição aproximada: pelo CEP do endereço";
    case "bairro":
      return i.bairro ? `Posição aproximada: centro do bairro ${i.bairro}, ${i.cidade}/${i.uf}` : `Posição aproximada: um bairro de ${i.cidade}/${i.uf}`;
    default:
      return `Posição aproximada: centro de ${i.cidade}/${i.uf}`;
  }
}
