/**
 * Normalização de um lote da Leilões Judiciais para `ImovelNormalizado`. Função pura: sem rede,
 * sem banco, sem relógio (o "agora" vem em `coletado_em`).
 *
 * Decisões (catálogo de fontes §3.2, com as correções da crítica §1.4 e §1.5):
 * - Praça, pela combinação de vl_lanceinicial (ini), vl_lanceminimo (min) e
 *   vl_lanceinicialsegundoleilao (seg):
 *     seg preenchido e ini == min → 1ª praça em vigor (2ª praça valerá seg);
 *     seg preenchido e ini == seg → 2ª praça em vigor;
 *     seg nulo                    → praça única ou desconhecida: praça 0, com
 *                                   extras.regra_praca = "seg_nulo" para revisão humana;
 *     outra combinação            → indefinida: sem praças, extras.regra_praca = "indefinida".
 *   A data (dt_fechamento) vai na praça em vigor; a da outra praça a fonte não informa.
 * - Avaliação = vl_lanceminimo, com cautela: a API não documenta o campo. Na sonda ele bateu com
 *   a avaliação escrita no texto em todos os lotes conferíveis (inclusive a soma dos lotes com
 *   vários imóveis). Fica `null` se a fonte esconde a avaliação (bn_exibeavaliacao = false) ou se
 *   o lance inicial passa dele (aí não pode ser avaliação). O valor achado no texto e a
 *   conferência vão em extras (avaliacao_texto, avaliacao_confere).
 * - Status: a fonte deixa lotes "Aberto para Lance" depois do fechamento (sonda de 11/10 com
 *   fechamento em 17/09). Se dt_fechamento já passou quando a resposta chegou, ou o rótulo diz
 *   arrematado/encerrado/suspenso etc., o lote é "encerrado".
 * - Coordenadas: a URL do iframe do Street View traz o ponto da câmera (!1d lat !2d lon), que
 *   fica na rua em frente: precisão "rua".
 * - Fotos: só a URL da fonte (nada é baixado). Montamos o tamanho 640x480 com o prefixo e o
 *   tamanho que a própria API informa (nm_path_incompleto + tamanho.thumb_grande + nm_path),
 *   quando a URL pronta confirma esse padrão; senão fica a URL pronta (196x146).
 * - Documentos: anexos[] (EDITAL, MATRÍCULA, AVALIAÇÃO, LAUDO...), só a URL.
 * - LGPD: nm_usuario/id_usuario nunca são lidos. Título, descrição e textos saem com nomes de
 *   partes e documentos mascarados (o núcleo mascara de novo ao gravar). Número de processo sim
 *   (é público e serve para conferir o leilão); nomes das partes não.
 * - Áreas, endereço, matrícula, quartos e vagas são lidos do texto só quando o lote é de um
 *   imóvel; lotes com vários imóveis ("Lote c/ 03 Imóveis") ficam sem esses campos.
 */
import type { Documento, Foto, ImovelNormalizado, NumeroPraca, Praca, TextoFonte, TipoDocumento, TipoImovel, Uf } from "../../tipos.ts";
import { inferirTipoImovel, classificarModalidade } from "../../util/classificar.ts";
import { instanteDe, lerDataHoraBR } from "../../util/data.ts";
import { mascararDadosPessoais } from "../../util/lgpd.ts";
import { arredondar, lerNumeroBR } from "../../util/numero.ts";
import { dobrarCaixaEAcento, normalizarTexto, semHtml, textoOuNulo } from "../../util/texto.ts";
import { normalizarUf } from "../../util/uf.ts";
import { SITE_LJ } from "./mcp.ts";
import type { AnexoLJ, FotoLJ, LoteColetado, LoteLJ } from "./tipos.ts";

// ---------------------------------------------------------------------------
// Leitura de campos
// ---------------------------------------------------------------------------

/** Id numérico como texto ("218898"); `null` se ausente ou não numérico. */
export function idDoLote(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isInteger(valor) && valor > 0) return String(valor);
  if (typeof valor === "string" && /^\d{1,12}$/.test(valor.trim())) return String(Number(valor.trim()));
  return null;
}

/**
 * Valor em reais da API ("1700000.00" ou número); `null` se ausente, zero ou ilegível. Se um dia
 * vier no formato brasileiro ("1.700.000,00"), a vírgula decide.
 */
export function valorLJ(valor: unknown): number | null {
  const n = typeof valor === "string"
    ? lerNumeroBR(valor, { decimal: valor.includes(",") ? "auto" : "." })
    : typeof valor === "number" ? valor : null;
  return n !== null && Number.isFinite(n) && n > 0 ? arredondar(n, 2) : null;
}

function iguais(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && Math.abs(a - b) < 0.01;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" || typeof valor === "number" ? textoOuNulo(semHtml(String(valor))) : null;
}

function inteiro(valor: unknown): number | null {
  return typeof valor === "number" && Number.isInteger(valor) ? valor : typeof valor === "string" && /^\d+$/.test(valor) ? Number(valor) : null;
}

function urlHttps(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  try {
    const url = new URL(valor.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

/** O lote é de imóvel? Sem segmento/categoria, confia no filtro categoria=imoveis da busca. */
export function ehLoteDeImovel(lote: LoteLJ): boolean {
  const rotulo = normalizarTexto(`${lote.nm_segmento ?? ""} ${lote.nm_categoria ?? ""}`);
  return rotulo === "" || /\bimove(l|is)\b/.test(rotulo);
}

const SUBCATEGORIAS: ReadonlyArray<readonly [RegExp, TipoImovel]> = [
  [/apartament/, "apartamento"],
  [/\bcasas?\b/, "casa"],
  [/terren|\blotes?\b/, "terreno"],
  [/fazend|sitio|chacar|rura/, "rural"],
  [/vaga|garage|\bbox/, "vaga"],
  [/comerc|industr|galp|\bsalas?\b|\blojas?\b|predio/, "comercial"],
];

/** Tipo pela subcategoria da fonte ("Apartamentos", "Comerciais"...); "Outros" cai no título. */
export function tipoDoLote(lote: LoteLJ): TipoImovel {
  const sub = normalizarTexto(lote.nm_subcategoria ?? "");
  for (const [regex, tipo] of SUBCATEGORIAS) if (regex.test(sub)) return tipo;
  return inferirTipoImovel(lote.nm_titulo_lote ?? null);
}

/** Lote com vários imóveis ("Imóveis - Iracemápolis - Itanhaém", "Lote c/ 03 Imóveis"). */
export function ehLoteMultiplo(titulo: string, descricao: string): boolean {
  return /^im[óo]veis\b/i.test(titulo.trim()) || /\blote\s+c\/\s*\d+\s+im[óo]veis\b/i.test(descricao);
}

const STATUS_FECHADO = /(encerrad|arrematad|vendid|cancelad|suspens|sustad|retirad|finalizad|desert|prejudicad|sem licitante|nao vendid|fechad|baixad|adiad|condicional)/;

/** "ativo" ou "encerrado"; nunca "aberto" com fechamento no passado. */
export function statusDoLote(lote: LoteLJ, fechamento: string | null, coletadoEm: string): "ativo" | "encerrado" {
  if (STATUS_FECHADO.test(normalizarTexto(lote.nm_statuslote ?? ""))) return "encerrado";
  const fim = fechamento ? instanteDe(fechamento) : null;
  const agora = instanteDe(coletadoEm);
  if (fim !== null && agora !== null && fim < agora) return "encerrado";
  return "ativo";
}

// ---------------------------------------------------------------------------
// Praças e valores
// ---------------------------------------------------------------------------

export type RegraPraca = "ini=min" | "ini=seg" | "seg_nulo" | "indefinida";

export interface PracasDoLote {
  pracas: Praca[];
  praca_atual: NumeroPraca | null;
  regra: RegraPraca;
}

/** Aplica a regra de praça da crítica (§1.4) aos valores do lote. */
export function pracasDoLote(ini: number | null, min: number | null, seg: number | null, fechamento: string | null): PracasDoLote {
  if (seg === null) {
    return { pracas: [{ numero: 0, data: fechamento, valor_minimo: ini }], praca_atual: 0, regra: "seg_nulo" };
  }
  const igualMin = iguais(ini, min);
  const igualSeg = iguais(ini, seg);
  if (igualMin && !igualSeg) {
    return {
      pracas: [
        { numero: 1, data: fechamento, valor_minimo: ini },
        { numero: 2, data: null, valor_minimo: seg },
      ],
      praca_atual: 1,
      regra: "ini=min",
    };
  }
  if (igualSeg && !igualMin) {
    return {
      pracas: [
        { numero: 1, data: null, valor_minimo: null },
        { numero: 2, data: fechamento, valor_minimo: seg },
      ],
      praca_atual: 2,
      regra: "ini=seg",
    };
  }
  return { pracas: [], praca_atual: null, regra: "indefinida" };
}

/**
 * Avaliação escrita no texto: o total ("VALOR DA AVALIAÇÃO: R$ ...", "Valor Total da Avaliação
 * do Imóvel em R$ ...", "Imóvel AVALIADO em R$ ...") ou, se não houver, a soma dos itens
 * "AVALIAÇÃO: 730.000,00" (lotes com vários imóveis). `null` se o texto não diz.
 */
export function avaliacaoNoTexto(descricao: string): number | null {
  const t = dobrarCaixaEAcento(descricao);
  const total =
    /valor\s+(?:total\s+)?da\s+avaliacao(?:\s+do\s+(?:imovel|bem|lote))?(?:\s+em)?\s*:?\s*r\$\s*(\d[\d.,]*)/.exec(t) ??
    /\bavaliad[oa]s?\s+em\s+r\$\s*(\d[\d.,]*)/.exec(t);
  if (total?.[1]) return valorBR(total[1]);
  let soma = 0;
  let itens = 0;
  for (const achado of t.matchAll(/\bavaliacao\s*:\s*(?:r\$\s*)?(\d[\d.,]*)/g)) {
    const v = valorBR(achado[1] ?? "");
    if (v !== null) {
      soma += v;
      itens++;
    }
  }
  return itens > 0 ? arredondar(soma, 2) : null;
}

function valorBR(bruto: string): number | null {
  const n = lerNumeroBR(bruto.replace(/[.,]+$/, ""));
  return n !== null && n > 0 ? arredondar(n, 2) : null;
}

// ---------------------------------------------------------------------------
// Texto: processo, matrícula, endereço, áreas
// ---------------------------------------------------------------------------

const CNJ = String.raw`(\d{7}-\d{2}\.\d{4}\.(\d)\.(\d{2})\.\d{4})`;
const UF_POR_TR_ESTADUAL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ",
  "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO",
];

/** Tribunal pelo segmento J.TR do número CNJ (Res. CNJ 65/2008): "8.26" → TJSP, "5.02" → TRT2. */
export function tribunalDoProcesso(processo: string): string | null {
  const m = /^\d{7}-\d{2}\.\d{4}\.(\d)\.(\d{2})\.\d{4}$/.exec(processo);
  if (!m) return null;
  const j = Number(m[1]);
  const tr = Number(m[2]);
  if (j === 8 && tr >= 1 && tr <= 27) return `TJ${UF_POR_TR_ESTADUAL[tr - 1]}`;
  if (j === 5 && tr >= 1 && tr <= 24) return `TRT${tr}`;
  if (j === 4 && tr >= 1 && tr <= 6) return `TRF${tr}`;
  return null;
}

export interface ProcessoDoLote {
  numero: string | null;
  /** Vara/juízo escrito ao lado ("90ª VT São Paulo/SP", "EXE3 - Piracicaba"). */
  vara: string | null;
}

/**
 * Número do processo do próprio lote. Só aceita o formato "(Proc. NNNNNNN-DD.AAAA.J.TR.OOOO ...)"
 * ou "Processo nº ...": a descrição cita outros processos (penhoras, indisponibilidades, agravos)
 * que não são o da execução.
 */
export function processoDoLote(descricao: string): ProcessoDoLote {
  const entreParenteses = new RegExp(String.raw`\(\s*proc(?:esso)?\.?\s*(?:n[º°o]?\.?\s*)?${CNJ}\s*(?:[-–]\s*([^()\n]{2,80}?))?\s*\)`, "i").exec(descricao);
  if (entreParenteses?.[1]) {
    return { numero: entreParenteses[1], vara: textoOuNulo(entreParenteses[4]?.replace(/[.;,]+$/, "")) };
  }
  const solto = new RegExp(String.raw`\bprocesso\s*(?:n[º°o]?\.?\s*)?:?\s*${CNJ}`, "i").exec(descricao);
  return { numero: solto?.[1] ?? null, vara: null };
}

export interface MatriculaDoLote {
  matricula: string | null;
  cartorio: string | null;
}

/** Primeira matrícula com cartório ("MATRÍCULA Nº 147.300 DO 6º CARTÓRIO DE REGISTRO DE IMÓVEIS DE ..."). */
export function matriculaDoLote(descricao: string): MatriculaDoLote {
  const direta =
    /matr[íi]cula(?:d[oa])?\s+(?:sob\s+o\s+)?(?:n[º°o]?\.?\s*)?:?\s*(\d[\d.]*\d|\d)\s*,?\s+(?:d[oa]\s+)?(\d{1,2}\s*[º°ªo]?\s*(?:cart[óo]rio|of[íi]cio|serventia|registro|cri\b)[^.;()\n]*)/i.exec(descricao);
  if (direta?.[1]) return { matricula: direta[1], cartorio: textoOuNulo(direta[2]) };
  const cri = /(\d{1,2}\s*[º°ª]\s*CRI)\s+(?:n[º°o]?\.?\s*)?(\d[\d.]*\d)/i.exec(descricao);
  if (cri?.[2]) return { matricula: cri[2], cartorio: textoOuNulo(cri[1]) };
  const local = /\b(CRI\s+local)\s+(?:n[º°o]?\.?\s*)?(\d[\d.]*\d)/i.exec(descricao);
  if (local?.[2]) return { matricula: local[2], cartorio: textoOuNulo(local[1]) };
  return { matricula: null, cartorio: null };
}

const LOGRADOURO = String.raw`(?:rua|r\.|avenida|av\.?|alameda|al\.|travessa|estrada|rodovia|pra[çc]a|largo|via|servid[ãa]o|quadra|loteamento)`;

export interface EnderecoDoLote {
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
}

function limparEndereco(valor: string | undefined): string | null {
  const limpo = textoOuNulo(valor?.replace(/[.;,\s]+$/, ""));
  return limpo && limpo.length <= 200 ? limpo : null;
}

function cepDe(valor: string | undefined): string | null {
  const m = /(\d{2})\.?(\d{3})-?(\d{3})/.exec(valor ?? "");
  return m ? `${m[1]}${m[2]}-${m[3]}` : null;
}

/** Endereço do imóvel quando o texto o declara uma única vez ("Local dos bens:", "Localização:"...). */
export function enderecoDoLote(descricao: string): EnderecoDoLote {
  const locais = [...descricao.matchAll(/local\s+dos\s+bens\s*:\s*([^\n]+)/gi)];
  if (locais.length === 1) return { endereco: limparEndereco(locais[0]?.[1]), bairro: null, cep: null };

  const localizacoes = [...descricao.matchAll(/localiza[çc][ãa]o\s*:\s*([^\n]+?)(?:\s+proprietári|\n|$)/gi)];
  if (localizacoes.length === 1) {
    const bruto = localizacoes[0]?.[1] ?? "";
    const m = /^(.+?)\s+n[úu]mero\s*:\s*([^,]+),\s*bairro\s*:\s*([^,]+?)(?:\s+complemento\s*:\s*([^,]+))?,\s*([^,]+?)\/([A-Z]{2})(?:\s*,\s*CEP\s*:\s*([\d.-]+))?/i.exec(bruto);
    if (m) {
      const partes = [m[1], m[2], m[4]].map((p) => textoOuNulo(p)).filter((p): p is string => p !== null);
      return { endereco: limparEndereco(partes.join(", ")), bairro: textoOuNulo(m[3]), cep: cepDe(m[7]) };
    }
  }

  const situado = new RegExp(String.raw`im[óo]vel\s+(?:est[áa]\s+)?localizado\s+(?:na|no|à|a|em)\s+(${LOGRADOURO}\s[^\n]+?)(?:,\s+e\s|\.\s|\.$|\n|$)`, "i").exec(descricao);
  if (situado?.[1]) return { endereco: limparEndereco(situado[1]), bairro: null, cep: null };
  return { endereco: null, bairro: null, cep: null };
}

function areaPor(regex: RegExp, texto: string): number | null {
  const m = regex.exec(texto);
  const n = m?.[1] ? lerNumeroBR(m[1].replace(/[.,]+$/, "")) : null;
  return n !== null && n > 0 && n < 1e8 ? n : null;
}

export interface AreasDoLote {
  area_total: number | null;
  area_privativa: number | null;
  area_terreno: number | null;
  quartos: number | null;
  vagas: number | null;
}

/** Áreas, quartos e vagas na primeira menção do texto (lote de um imóvel só). */
export function areasDoLote(titulo: string, descricao: string): AreasDoLote {
  const t = dobrarCaixaEAcento(`${titulo}\n${descricao}`);
  const quartos = /(?<![\d.,])(\d{1,2})\s*(?:\(\w+\)\s*)?(?:dormitorios?|quartos?)\b/.exec(t);
  const vagas = /(?<![\d.,])\(?(\d{1,3})\)?\s+vagas?\b/.exec(t);
  return {
    area_privativa: areaPor(/area\s+(?:real\s+)?(?:util|privativa)(?:\s+real)?\s*(?:de\s+)?(?:aproximadamente\s+)?(\d[\d.,]*)\s*m(?:²|2)/, t),
    area_total: areaPor(/area\s+(?:real\s+)?total(?:\s+real)?\s*(?:de\s+)?(?:aproximadamente\s+)?(\d[\d.,]*)\s*m(?:²|2)/, t),
    area_terreno: areaPor(/(?:terreno\s+(?:c\/|com)\s*(?:area\s+de\s+)?|area\s+(?:do\s+terreno|superficial)\s*(?:de\s+)?)(\d[\d.,]*)\s*m(?:²|2)/, t),
    quartos: quartos?.[1] ? Number(quartos[1]) : null,
    vagas: vagas?.[1] ? Number(vagas[1]) : null,
  };
}

/**
 * Coordenadas do iframe do Google Maps: Street View ("!2m2!1d<lat>!2d<lon>") ou mapa
 * ("!2d<lon>!3d<lat>"). Só aceita pontos dentro do retângulo do Brasil.
 */
export function coordenadasDoIframe(iframe: unknown): { lat: number; lon: number } | null {
  if (typeof iframe !== "string" || !iframe) return null;
  const rua = /!2m2!1d(-?\d{1,2}\.\d+)!2d(-?\d{1,3}\.\d+)/.exec(iframe);
  const mapa = /!2d(-?\d{1,3}\.\d+)!3d(-?\d{1,2}\.\d+)/.exec(iframe);
  const lat = Number(rua ? rua[1] : mapa?.[2]);
  const lon = Number(rua ? rua[2] : mapa?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -34.5 || lat > 5.6 || lon < -74.5 || lon > -28.5) return null;
  return { lat: arredondar(lat, 7), lon: arredondar(lon, 7) };
}

// ---------------------------------------------------------------------------
// Fotos e documentos
// ---------------------------------------------------------------------------

function tamanhoDeclarado(foto: FotoLJ, chave: string): string | null {
  const valor = foto.tamanho?.[chave];
  return typeof valor === "string" && /^\d{2,4}x\d{2,4}$/.test(valor) ? valor : null;
}

/** URL grande (640x480) montada com o que a API declara, se a URL pronta confirmar o padrão. */
export function urlGrande(foto: FotoLJ): string | null {
  const prefixo = foto.nm_path_incompleto;
  const nome = foto.nm_path;
  const pequena = tamanhoDeclarado(foto, "thumb_pequena");
  const grande = tamanhoDeclarado(foto, "thumb_grande");
  if (!prefixo || !nome || !pequena || !grande || !foto.nm_path_completo) return null;
  if (foto.nm_path_completo !== `${prefixo}${pequena}/${nome}`) return null;
  return urlHttps(`${prefixo}${grande}/${nome}`);
}

/**
 * Fotos do lote, na ordem da fonte. `usarGrande` = false força a URL pronta da API (ex.: quando
 * o HEAD da capa grande falhou).
 */
export function fotosDoLote(fotos: readonly FotoLJ[] | null | undefined, usarGrande = true): Foto[] {
  const saida: Foto[] = [];
  const lista = Array.isArray(fotos) ? [...fotos] : [];
  lista.sort((a, b) => (inteiro(a.nu_ordem) ?? 0) - (inteiro(b.nu_ordem) ?? 0));
  for (const foto of lista) {
    const grande = usarGrande ? urlGrande(foto) : null;
    const pronta = urlHttps(foto.nm_path_completo);
    const url = grande ?? pronta;
    if (!url) continue;
    const tamanho = grande ? tamanhoDeclarado(foto, "thumb_grande") : (/\/(\d{2,4}x\d{2,4})\//.exec(url)?.[1] ?? null);
    saida.push({ url, ordem: saida.length, tamanho, origem: "api", verificada_em: null, ok: null });
  }
  return saida;
}

/** Tipo do anexo pelo rótulo ("LAUDO DE AVALIAÇÃO" → laudo, "MATRÍCULA 13.942" → matricula). */
export function tipoDoAnexo(rotulo: string | null | undefined): TipoDocumento {
  const t = normalizarTexto(rotulo ?? "");
  if (/edital/.test(t)) return "edital";
  if (/laudo/.test(t)) return "laudo";
  if (/matricula|inteiro teor|certidao de onus/.test(t)) return "matricula";
  if (/avalia|calculo/.test(t)) return "avaliacao";
  return "outro";
}

export function documentosDoLote(anexos: readonly AnexoLJ[] | null | undefined): Documento[] {
  const saida: Documento[] = [];
  for (const anexo of Array.isArray(anexos) ? anexos : []) {
    const url = urlHttps(anexo.nm_path_completo);
    if (!url) continue;
    const titulo = texto(anexo.nm);
    saida.push({ tipo: tipoDoAnexo(titulo), titulo: titulo ? mascararDadosPessoais(titulo) : null, url, publicado_em: null });
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Lote → imóvel
// ---------------------------------------------------------------------------

function siteDoLeiloeiro(valor: unknown): string | null {
  const bruto = texto(valor);
  if (!bruto) return null;
  return urlHttps(/^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`);
}

/** Converte um lote coletado em imóvel. `null` = não é imóvel; erro = lote quebrado. */
export function normalizarLote(coletado: LoteColetado): ImovelNormalizado | null {
  const lote = coletado.lote;
  if (!lote || typeof lote !== "object") throw new Error("lote ausente");
  const id = idDoLote(lote.lote_id);
  if (!id) throw new Error(`lote sem lote_id numérico (${String(lote.lote_id)})`);
  if (!ehLoteDeImovel(lote)) return null;
  const leilaoId = idDoLote(lote.leilao_id);
  if (!leilaoId) throw new Error(`lote ${id} sem leilao_id (não dá para montar o link)`);
  const uf: Uf | null = normalizarUf(lote.nm_estado);
  if (!uf) throw new Error(`lote ${id} com UF inválida: ${String(lote.nm_estado)}`);
  const cidade = texto(lote.nm_cidade);
  if (!cidade) throw new Error(`lote ${id} sem cidade`);
  const tituloBruto = texto(lote.nm_titulo_lote);
  if (!tituloBruto) throw new Error(`lote ${id} sem título`);

  const descricaoBruta = typeof lote.nm_descricao === "string" ? semHtml(lote.nm_descricao) : "";
  const multiplo = ehLoteMultiplo(tituloBruto, descricaoBruta);

  const fechamento = lerDataHoraBR(typeof lote.dt_fechamento === "string" ? lote.dt_fechamento : null);
  const ini = valorLJ(lote.vl_lanceinicial);
  const min = valorLJ(lote.vl_lanceminimo);
  const seg = valorLJ(lote.vl_lanceinicialsegundoleilao);
  const praca = pracasDoLote(ini, min, seg, fechamento);
  const precoAtual = ini ?? praca.pracas.find((p) => p.numero === praca.praca_atual)?.valor_minimo ?? null;

  const avaliacaoTexto = descricaoBruta ? avaliacaoNoTexto(descricaoBruta) : null;
  let avaliacao: number | null = null;
  let origemAvaliacao: string;
  if (lote.bn_exibeavaliacao === false) origemAvaliacao = "oculta_na_fonte";
  else if (min !== null && (ini === null || ini <= min + 0.01)) {
    avaliacao = min;
    origemAvaliacao = "vl_lanceminimo";
  } else if (min === null && avaliacaoTexto !== null) {
    avaliacao = avaliacaoTexto;
    origemAvaliacao = "texto";
  } else origemAvaliacao = min === null ? "ausente" : "inconsistente";
  const confere = avaliacao !== null && avaliacaoTexto !== null && origemAvaliacao === "vl_lanceminimo"
    ? Math.abs(avaliacaoTexto - avaliacao) <= Math.max(1, avaliacao * 0.005)
    : null;

  const processo = descricaoBruta ? processoDoLote(descricaoBruta) : { numero: null, vara: null };
  const tribunal = processo.numero ? tribunalDoProcesso(processo.numero) : null;
  const comitente = [tribunal, processo.vara].filter((p): p is string => Boolean(p)).join(" – ") || null;

  const tituloLeilao = texto(lote.nm_titulo_leilao);
  const rotulosModalidade = `${tituloLeilao ?? ""} ${tituloBruto}`;
  const classificada = classificarModalidade(rotulosModalidade);
  // "Alienação fiduciária" no texto de um leilão judicial costuma ser só um ônus da matrícula
  // (sonda: "Consta na Av. 3 Alienação Fiduciária"); por isso só o título ou "leilão
  // extrajudicial" escrito por extenso marcam o leilão como extrajudicial.
  const extrajudicial = classificada.judicial === false || /\bleil[ãa]o\s+extrajudicial\b/i.test(descricaoBruta.slice(0, 1500));
  const judicial = extrajudicial
    ? false
    : classificada.judicial === true || processo.numero !== null || /\bleil[ãa]o\s+judicial\b|\bhasta\s+p[úu]blica\b/i.test(descricaoBruta)
      ? true
      : null;

  const unico = !multiplo && descricaoBruta !== "";
  const matricula = unico ? matriculaDoLote(descricaoBruta) : { matricula: null, cartorio: null };
  const endereco = unico ? enderecoDoLote(descricaoBruta) : { endereco: null, bairro: null, cep: null };
  const areas = multiplo
    ? { area_total: null, area_privativa: null, area_terreno: null, quartos: null, vagas: null }
    : areasDoLote(tituloBruto, descricaoBruta);
  const coordenadas = coordenadasDoIframe(lote.iframe_streetview);

  // Com --detalhes, o conector confere a capa grande por HEAD: se ela não existe, ficam as URLs
  // prontas da API; se existe, a capa leva a data da verificação.
  const capa = coletado.capa ?? null;
  const capaFalhou = capa !== null && capa.status !== null && capa.status >= 400;
  const fotos = fotosDoLote(lote.fotos, !capaFalhou);
  const primeira = fotos[0];
  if (capa && capa.status !== null && capa.status >= 200 && capa.status < 300 && primeira?.url === capa.url) {
    fotos[0] = { ...primeira, verificada_em: capa.em, ok: true };
  }

  const textos: TextoFonte[] = [];
  if (tituloLeilao) textos.push({ origem: "titulo_leilao", texto: mascararDadosPessoais(tituloLeilao) });
  for (const alerta of Array.isArray(lote.usuariovistorialotexstatusliberacaoextra) ? lote.usuariovistorialotexstatusliberacaoextra : []) {
    const aviso = texto(alerta?.nm_alerta);
    if (aviso) textos.push({ origem: "alerta", texto: mascararDadosPessoais(aviso) });
  }

  const parcelas = inteiro(lote.nu_parcelas);
  const extras: Record<string, string | number | boolean | null> = {
    leilao_id: Number(leilaoId),
    lote_numero: texto(lote.nu),
    imovel_id_fonte: inteiro(lote.imovel_id),
    status_fonte: texto(lote.nm_statuslote),
    subcategoria_fonte: texto(lote.nm_subcategoria),
    regra_praca: praca.regra,
    vl_lanceminimo: min,
    vl_lanceinicial: ini,
    vl_lanceinicialsegundoleilao: seg,
    avaliacao_origem: origemAvaliacao,
    avaliacao_texto: avaliacaoTexto,
    avaliacao_confere: confere,
    vl_incremento: valorLJ(lote.vl_incremento),
    vl_lance_atual: valorLJ(lote.vl_lance),
    nu_qtdelances: inteiro(lote.nu_qtdelances),
    nu_parcelas: parcelas,
    vl_percentualentrada: typeof lote.vl_percentualentrada === "number" ? lote.vl_percentualentrada : null,
    indice_correcao: texto(lote.indice_correcao),
    site_leiloeiro: siteDoLeiloeiro(lote.nm_url_leiloeiro),
    lote_multiplo: multiplo,
    fechamento_fonte: praca.regra === "indefinida" ? fechamento : null,
  };
  for (const [chave, valor] of Object.entries(extras)) if (valor === null) delete extras[chave];

  return {
    registro: "imovel",
    id_na_fonte: id,
    url: `${SITE_LJ}/lote/${leilaoId}/${id}`,
    titulo: mascararDadosPessoais(tituloBruto),
    tipo: tipoDoLote(lote),
    uf,
    cidade,
    bairro: endereco.bairro,
    endereco: endereco.endereco,
    cep: endereco.cep,
    lat: coordenadas?.lat ?? null,
    lon: coordenadas?.lon ?? null,
    precisao_geo: coordenadas ? "rua" : null,
    ...areas,
    descricao: descricaoBruta ? mascararDadosPessoais(descricaoBruta) : null,
    textos,
    modalidade: classificada.modalidade === "outro" ? "leilao" : classificada.modalidade,
    modalidade_fonte: null,
    judicial,
    // Parcelamento judicial (nu_parcelas) não é financiamento bancário: a fonte não informa este.
    aceita_financiamento: null,
    aceita_fgts: null,
    aceita_parcelamento: parcelas === null ? null : parcelas > 1,
    ocupacao: null,
    leiloeiro: texto(lote.nm_leiloeiro),
    comitente,
    numero_processo: processo.numero,
    matricula: matricula.matricula,
    cartorio: matricula.cartorio,
    valor_avaliacao: avaliacao,
    preco: precoAtual,
    praca_atual: praca.praca_atual,
    pracas: praca.pracas,
    fotos,
    documentos: documentosDoLote(lote.anexos),
    status: statusDoLote(lote, fechamento, coletado.coletado_em),
    extras,
  };
}
