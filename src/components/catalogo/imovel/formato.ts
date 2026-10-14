/**
 * Textos e contas da página do imóvel (funções puras, iguais no servidor e no navegador).
 * Imports relativos, sem "@/": o teste roda em Node puro.
 */
import { area, moeda, normalizar, numero, PRACA_ROTULO, UF_NOME } from "../../../lib/catalogo/rotulos";
import type { ImovelResumo, LinkImovel, Praca, PracaDetalhe, ReferenciaM2, TipoImovel, TipoLink } from "../../../lib/catalogo/tipos";

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

/** Onde fica o recorte, já com a preposição: "no bairro Centro, Uberlândia/MG", "na cidade de Uberlândia/MG", "no estado de Minas Gerais". */
export function ondeRecorte(r: Pick<ReferenciaM2, "escopo" | "nome">): string {
  if (r.escopo === "uf") return `no estado ${deEstado(r.nome)}`;
  if (r.escopo === "cidade") {
    const [cidade = r.nome] = r.nome.split("/");
    return `na cidade ${CIDADE_COM_ARTIGO.has(cidade) ? "do" : "de"} ${r.nome}`;
  }
  return `no bairro ${r.nome}`;
}

/** Nome curto do recorte para títulos: "Centro, Uberlândia/MG", "Uberlândia/MG", "Minas Gerais". */
export function nomeRecorte(r: Pick<ReferenciaM2, "escopo" | "nome">) {
  return r.escopo === "uf" ? (UF_NOME[r.nome] ?? r.nome) : r.nome;
}

export const ROTULO_ESCOPO: Record<ReferenciaM2["escopo"], string> = { bairro: "Bairro", cidade: "Cidade", uf: "Estado" };

/**
 * Frase direta da comparação, com a referência mais local que tem avaliação:
 * "O lance por m² deste imóvel é 23% menor que a mediana de avaliação dos apartamentos em leilão no bairro
 * Centro, Uberlândia/MG (n = 14)." Sem avaliação no recorte, compara com a mediana dos lances. null quando o
 * imóvel não tem R$/m² (sem área) ou não há referência.
 */
export function fraseComparacao(r: ReferenciaM2): string | null {
  const lance = r.imovel.lanceM2;
  if (lance === null) return null;
  const faixa = r.avaliacaoM2 ?? r.lanceM2;
  if (!faixa || faixa.mediana <= 0) return null;
  const doQue = r.avaliacaoM2 ? "a mediana de avaliação" : "a mediana dos lances";
  const quem = `dos ${TIPO_NA_FRASE[r.tipo]} em leilão ${ondeRecorte(r)} (n = ${numero(r.amostra)})`;
  const dif = lance / faixa.mediana - 1;
  const pct = Math.round(Math.abs(dif) * 100);
  if (pct < 2) return `O lance por m² deste imóvel é praticamente igual ${doQue.replace(/^a /, "à ")} ${quem}.`;
  return `O lance por m² deste imóvel é ${numero(pct)}% ${dif < 0 ? "menor" : "maior"} que ${doQue} ${quem}.`;
}

/**
 * "Por m², o lance deste imóvel é menor que o de 78% dos apartamentos em leilão no bairro …". Nas pontas (0% e
 * 100%), uma frase que se lê: "menor que o de todos os 7 apartamentos…", "nenhum dos 7 apartamentos… tem lance
 * maior…". O percentil vem arredondado: com 200 ou mais imóveis, 100% pode ser 99,6%, então vira "praticamente".
 */
export function frasePercentil(r: ReferenciaM2): string | null {
  const p = r.percentilLance;
  if (p === null) return null;
  const tipos = TIPO_NA_FRASE[r.tipo];
  const onde = ondeRecorte(r);
  const exato = r.amostra < 200;
  if (p >= 100) {
    return exato
      ? `Por m², o lance deste imóvel é menor que o de todos os ${numero(r.amostra)} ${tipos} em leilão ${onde}.`
      : `Por m², o lance deste imóvel é menor que o de praticamente todos os ${tipos} em leilão ${onde}.`;
  }
  if (p <= 0) {
    return exato
      ? `Por m², nenhum dos ${numero(r.amostra)} ${tipos} em leilão ${onde} tem lance maior que o deste imóvel.`
      : `Por m², praticamente nenhum dos ${tipos} em leilão ${onde} tem lance maior que o deste imóvel.`;
  }
  return `Por m², o lance deste imóvel é menor que o de ${numero(p)}% dos ${tipos} em leilão ${onde}.`;
}

/** Quantas vezes fora da faixa do meio (p25–p75) um valor precisa estar para ser "muito fora" da região. */
export const FATOR_FORA = 3;

/**
 * O lance por m² deste imóvel está muito longe da região (mais de 3 vezes o p75, ou menos de um terço do p25)?
 * Quase sempre é erro na fonte (área ou preço digitados errado, lote com vários imóveis): a página pede para
 * conferir no anúncio.
 */
export function lanceForaDaRegiao(r: ReferenciaM2): boolean {
  const v = r.imovel.lanceM2;
  const f = r.avaliacaoM2 ?? r.lanceM2;
  if (v === null || !f || f.p25 <= 0) return false;
  return v > f.p75 * FATOR_FORA || v < f.p25 / FATOR_FORA;
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

/** Legenda curta do mapa mini, conforme a precisão: "Posição aproximada (pela rua)", "(centro da cidade)"... */
export function legendaPosicao(p: ImovelResumo["precisaoGeo"]): string {
  switch (p) {
    case "exata":
      return "Posição informada pela fonte";
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
export function textoPosicao(i: Pick<ImovelResumo, "precisaoGeo" | "cidade" | "uf" | "bairro">): string {
  switch (i.precisaoGeo) {
    case "exata":
      return "Posição informada pela fonte";
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
