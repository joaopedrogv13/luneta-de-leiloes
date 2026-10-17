/**
 * Leitura do instantâneo do catálogo em base/saida/site (gerado por `npm run base:exportar -- --site`,
 * formato descrito em base/exportar.ts e base/README.md):
 *
 *   imoveis.json.gz          lista em colunas (ImovelResumo + endereço) e metadados
 *   detalhes/00..1f.json.gz  o resto do ImovelDetalhe, em 32 pedaços pelo hash do id
 *
 * Só Node (fs e zlib), sem nada do Next: o servidor usa por src/lib/catalogo/dados.ts (server-only) e os
 * testes leem os arquivos de verdade. Cada campo é conferido ao ler: arquivo de outra versão, corrompido
 * ou de geração misturada falha com uma mensagem que diz o que fazer, em vez de quebrar a página depois.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { linkGoogleMaps } from "./texto";
import type { Confianca, ImovelDetalhe, ImovelResumo, LinkImovel, PracaDetalhe, SobreConjunto, TagDetalhe, TagResumo, RegistroImovel } from "./tipos";

const descompactar = promisify(gunzip);

/** Versão do formato que este site entende (VERSAO_CATALOGO em base/exportar.ts). */
export const VERSAO_CATALOGO = 1;
export const ARQUIVO_LISTA = "imoveis.json.gz";
export const PASTA_DETALHES = "detalhes";

/** Pasta padrão do instantâneo, a partir da raiz do projeto (na Vercel, a raiz da função). */
export function pastaPadrao(): string {
  return join(process.cwd(), "base", "saida", "site");
}

/**
 * Registro lido da ficha (RegistroCatalogo em base/exportar.ts): só vem nos imóveis da Caixa com ficha lida
 * (pelo conector com --detalhes ou por `npm run base:fichas`).
 */
export type RegistroLido = Pick<RegistroImovel, "matriculas" | "comarca" | "oficio" | "inscricaoImobiliaria" | "averbacaoLeiloesNegativos" | "lidoEm">;

/** O que o detalhe tem além da linha da lista (DetalheCatalogo em base/exportar.ts). */
export interface DetalheParcial extends Omit<ImovelDetalhe, keyof ImovelResumo | "endereco" | "registro"> {
  tags: Array<Pick<TagDetalhe, "slug" | "confianca" | "origem" | "evidencia">>;
  registro?: RegistroLido;
}

export interface ListaLida {
  geradoEm: string;
  criterio: string;
  partes: number;
  sobre: SobreConjunto;
  itens: ImovelResumo[];
  /** Endereço de cada item (mesma posição): só para a busca e para o link do mapa; não vai ao navegador. */
  enderecos: (string | null)[];
}

const COMO_REGERAR = "Gere de novo com `npm run base:exportar -- --site` (ver base/README.md).";

/**
 * Rótulos de tag que mudaram depois que o instantâneo foi gerado (o slug fica; o texto mostrado segue o de
 * base/riscos/tags.ts de hoje). "Preço acima do mercado" só comparava com a avaliação: virou "Lance acima da
 * avaliação". Exportações novas já saem com o rótulo novo.
 */
const ROTULO_ATUAL: Readonly<Record<string, string>> = { "preco-acima-mercado": "Lance acima da avaliação" };

function atualizarRotulos(tags: TagResumo[]): TagResumo[] {
  return tags.some((t) => ROTULO_ATUAL[t.slug] !== undefined && ROTULO_ATUAL[t.slug] !== t.rotulo)
    ? tags.map((t) => (ROTULO_ATUAL[t.slug] ? { ...t, rotulo: ROTULO_ATUAL[t.slug]! } : t))
    : tags;
}

export class ErroInstantaneo extends Error {
  constructor(mensagem: string) {
    super(`Catálogo (base/saida/site): ${mensagem} ${COMO_REGERAR}`);
    this.name = "ErroInstantaneo";
  }
}

/** Mesmo hash da exportação (parteDoId em base/exportar.ts): FNV-1a de 32 bits, módulo `partes`, em hexadecimal. */
export function parteDoId(id: string, partes: number): string {
  let h = 0x811c9dc5;
  for (let k = 0; k < id.length; k++) {
    h ^= id.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % partes).toString(16).padStart(2, "0");
}

async function lerGzipJson(caminho: string): Promise<unknown> {
  let bruto: Buffer;
  try {
    bruto = await readFile(caminho);
  } catch (e) {
    throw new ErroInstantaneo(`não consegui ler ${caminho} (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}).`);
  }
  try {
    return JSON.parse((await descompactar(bruto)).toString("utf8"));
  } catch (e) {
    throw new ErroInstantaneo(`${caminho} não é um JSON gzip válido (${(e as Error).message}).`);
  }
}

// ---------------------------------------------------------------------------
// Conferência dos campos
// ---------------------------------------------------------------------------

type Conferir = (v: unknown) => boolean;
const texto: Conferir = (v) => typeof v === "string";
const textoOuNulo: Conferir = (v) => v === null || typeof v === "string";
const numero: Conferir = (v) => typeof v === "number" && Number.isFinite(v);
const numeroOuNulo: Conferir = (v) => v === null || numero(v);
const simNaoOuNulo: Conferir = (v) => v === null || typeof v === "boolean";
const umDe = (...valores: unknown[]): Conferir => (v) => valores.includes(v);
const SEVERIDADES = umDe("grave", "atencao", "positivo", "info");
const CONFIANCAS = umDe("alta", "media", "baixa");

const conferirTagResumo = (v: unknown): v is TagResumo => {
  const t = v as TagResumo;
  return typeof t === "object" && t !== null && texto(t.slug) && texto(t.rotulo) && SEVERIDADES(t.severidade) && typeof t.emRevisao === "boolean";
};

/** Conferência de cada campo do ImovelResumo (e do endereço, que vem junto na lista). */
const CAMPOS_RESUMO: Record<keyof ImovelResumo | "endereco", Conferir> = {
  id: (v) => typeof v === "string" && /^[a-z0-9-]+$/i.test(v) && v.length <= 80,
  titulo: texto,
  tipo: umDe("apartamento", "casa", "terreno", "comercial", "rural", "outro"),
  uf: (v) => typeof v === "string" && /^[A-Z]{2}$/.test(v),
  cidade: texto,
  bairro: textoOuNulo,
  lat: numeroOuNulo,
  lon: numeroOuNulo,
  precisaoGeo: umDe(null, "exata", "rua", "cep", "bairro", "cidade"),
  area: numeroOuNulo,
  areaTerreno: numeroOuNulo,
  quartos: numeroOuNulo,
  vagas: numeroOuNulo,
  avaliacao: numeroOuNulo,
  lance: (v) => numero(v) && (v as number) > 0,
  desagio: numeroOuNulo,
  lanceM2: numeroOuNulo,
  avaliacaoM2: numeroOuNulo,
  modalidade: umDe("leilao", "venda_direta", "venda_online", "licitacao_aberta", "outro"),
  modalidadeFonte: textoOuNulo,
  praca: umDe(null, "1", "2", "unica"),
  dataPraca: (v) => v === null || (typeof v === "string" && !Number.isNaN(Date.parse(v))),
  financiamento: simNaoOuNulo,
  fgts: simNaoOuNulo,
  parcelamento: simNaoOuNulo,
  ocupacao: umDe(null, "ocupado", "desocupado"),
  judicial: simNaoOuNulo,
  fonte: (v) => typeof v === "object" && v !== null && texto((v as { id: unknown }).id) && texto((v as { nome: unknown }).nome),
  foto: (v) => v === null || (typeof v === "string" && v.startsWith("https://")),
  totalFotos: (v) => Number.isInteger(v) && (v as number) >= 0,
  selo: umDe(0, 1, 2, 3),
  seloPendente: (v) => typeof v === "boolean",
  tags: (v) => Array.isArray(v) && v.every(conferirTagResumo),
  coletadoEm: (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v),
  endereco: textoOuNulo,
};
const NOMES_CAMPOS = Object.keys(CAMPOS_RESUMO) as (keyof typeof CAMPOS_RESUMO)[];

interface ArquivoLista {
  formato: string;
  versao: number;
  gerado_em: string;
  criterio: string;
  fontes: { id: string; nome: string; gerado_na_fonte_em: string | null; total: number }[];
  total: number;
  partes: number;
  colunas: Record<string, unknown[]>;
}

/** Lê e confere a lista (todas as colunas, todas as linhas). */
export async function lerLista(pasta: string = pastaPadrao()): Promise<ListaLida> {
  const caminho = join(pasta, ARQUIVO_LISTA);
  const a = (await lerGzipJson(caminho)) as ArquivoLista;
  if (typeof a !== "object" || a === null || a.formato !== "luneta-catalogo") throw new ErroInstantaneo(`${caminho} não é a lista do catálogo.`);
  if (a.versao !== VERSAO_CATALOGO) throw new ErroInstantaneo(`a lista está no formato ${String(a.versao)} e este site lê o formato ${VERSAO_CATALOGO}.`);
  if (!Number.isInteger(a.total) || a.total < 0 || !Number.isInteger(a.partes) || a.partes < 1 || a.partes > 256) {
    throw new ErroInstantaneo("total ou número de pedaços inválido na lista.");
  }
  if (typeof a.gerado_em !== "string" || !Array.isArray(a.fontes)) throw new ErroInstantaneo("metadados ausentes na lista.");
  const colunas = a.colunas ?? {};
  for (const campo of NOMES_CAMPOS) {
    const coluna = colunas[campo];
    if (!Array.isArray(coluna) || coluna.length !== a.total) throw new ErroInstantaneo(`a coluna "${campo}" está ausente ou com tamanho errado.`);
  }
  // Confere coluna por coluna; a mensagem diz o campo e o imóvel.
  for (const campo of NOMES_CAMPOS) {
    const coluna = colunas[campo]!;
    const conferir = CAMPOS_RESUMO[campo];
    for (let k = 0; k < a.total; k++) {
      if (!conferir(coluna[k])) {
        throw new ErroInstantaneo(`valor inválido em "${campo}" no imóvel ${String(colunas.id![k])} (posição ${k}): ${JSON.stringify(coluna[k])?.slice(0, 120)}.`);
      }
    }
  }
  // Objetos montados com a mesma forma literal (sem `delete`): o V8 guarda todos com a mesma "classe"
  // escondida, e o índice e a serialização ficam rápidos.
  const c = colunas as { [K in keyof ImovelResumo | "endereco"]: (ImovelResumo & { endereco: string | null })[K][] };
  const itens: ImovelResumo[] = new Array(a.total);
  const ids = new Set<string>();
  for (let k = 0; k < a.total; k++) {
    const i: ImovelResumo = {
      id: c.id[k]!, titulo: c.titulo[k]!, tipo: c.tipo[k]!, uf: c.uf[k]!, cidade: c.cidade[k]!, bairro: c.bairro[k]!,
      lat: c.lat[k]!, lon: c.lon[k]!, precisaoGeo: c.precisaoGeo[k]!, area: c.area[k]!, areaTerreno: c.areaTerreno[k]!,
      quartos: c.quartos[k]!, vagas: c.vagas[k]!, avaliacao: c.avaliacao[k]!, lance: c.lance[k]!, desagio: c.desagio[k]!,
      lanceM2: c.lanceM2[k]!, avaliacaoM2: c.avaliacaoM2[k]!, modalidade: c.modalidade[k]!, modalidadeFonte: c.modalidadeFonte[k]!,
      praca: c.praca[k]!, dataPraca: c.dataPraca[k]!, financiamento: c.financiamento[k]!, fgts: c.fgts[k]!,
      parcelamento: c.parcelamento[k]!, ocupacao: c.ocupacao[k]!, judicial: c.judicial[k]!, fonte: c.fonte[k]!, foto: c.foto[k]!,
      totalFotos: c.totalFotos[k]!, selo: c.selo[k]!, seloPendente: c.seloPendente[k]!, tags: atualizarRotulos(c.tags[k]!), coletadoEm: c.coletadoEm[k]!,
    };
    if (ids.has(i.id)) throw new ErroInstantaneo(`id repetido: ${i.id}.`);
    ids.add(i.id);
    itens[k] = i;
  }
  const enderecos = c.endereco.slice(0, a.total);
  return {
    geradoEm: a.gerado_em,
    criterio: typeof a.criterio === "string" ? a.criterio : "",
    partes: a.partes,
    sobre: {
      geradoEm: a.gerado_em,
      fontes: a.fontes.map((f) => ({ id: String(f.id), nome: String(f.nome), geradoNaFonteEm: f.gerado_na_fonte_em ?? null, total: Number(f.total) || 0 })),
    },
    itens,
    enderecos,
  };
}

const conferirLink = (v: unknown): v is LinkImovel => {
  const l = v as LinkImovel;
  return typeof l === "object" && l !== null && texto(l.tipo) && texto(l.rotulo) && typeof l.url === "string" && l.url.startsWith("https://");
};
const conferirPraca = (v: unknown): v is PracaDetalhe => {
  const p = v as PracaDetalhe;
  return typeof p === "object" && p !== null && umDe(0, 1, 2, 3)(p.numero) && textoOuNulo(p.data) && numeroOuNulo(p.valorMinimo);
};

const CAMPOS_DETALHE: Record<keyof DetalheParcial, Conferir> = {
  areaTotal: numeroOuNulo,
  areaPrivativa: numeroOuNulo,
  descricao: textoOuNulo,
  fotos: (v) => Array.isArray(v) && v.every((u) => typeof u === "string" && u.startsWith("https://")),
  pracas: (v) => Array.isArray(v) && v.every(conferirPraca),
  matricula: textoOuNulo,
  cartorio: textoOuNulo,
  numeroProcesso: textoOuNulo,
  leiloeiro: textoOuNulo,
  comitente: textoOuNulo,
  links: (v) => Array.isArray(v) && v.every(conferirLink),
  condicoesPagamento: textoOuNulo,
  geradoNaFonteEm: textoOuNulo,
  porQueSelo: texto,
  registro: (v) => {
    if (v === undefined) return true;
    const r = v as RegistroLido;
    return (
      typeof r === "object" && r !== null && Array.isArray(r.matriculas) && r.matriculas.every((m) => typeof m === "string") &&
      textoOuNulo(r.comarca) && textoOuNulo(r.oficio) && textoOuNulo(r.inscricaoImobiliaria) && textoOuNulo(r.averbacaoLeiloesNegativos) &&
      (r.lidoEm === null || (typeof r.lidoEm === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.lidoEm)))
    );
  },
  tags: (v) =>
    Array.isArray(v) &&
    v.every((t) => typeof t === "object" && t !== null && texto(t.slug) && CONFIANCAS(t.confianca) && texto(t.origem) && textoOuNulo(t.evidencia)),
};

interface ArquivoParte {
  formato: string;
  versao: number;
  gerado_em: string;
  parte: string;
  detalhes: Record<string, unknown>;
}

/** Lê e confere um pedaço dos detalhes; `geradoEm` é o da lista (pedaço de outra geração é recusado). */
export async function lerParte(pasta: string, parte: string, geradoEm: string): Promise<Map<string, DetalheParcial>> {
  if (!/^[0-9a-f]{2}$/.test(parte)) throw new ErroInstantaneo(`pedaço inválido: ${parte}.`);
  const caminho = join(pasta, PASTA_DETALHES, `${parte}.json.gz`);
  const a = (await lerGzipJson(caminho)) as ArquivoParte;
  if (typeof a !== "object" || a === null || a.formato !== "luneta-catalogo-detalhes" || a.parte !== parte) {
    throw new ErroInstantaneo(`${caminho} não é o pedaço ${parte} dos detalhes.`);
  }
  if (a.versao !== VERSAO_CATALOGO) throw new ErroInstantaneo(`o pedaço ${parte} está no formato ${String(a.versao)} e este site lê o formato ${VERSAO_CATALOGO}.`);
  if (a.gerado_em !== geradoEm) throw new ErroInstantaneo(`o pedaço ${parte} é de outra geração (${a.gerado_em}) que a lista (${geradoEm}).`);
  const saida = new Map<string, DetalheParcial>();
  for (const [id, bruto] of Object.entries(a.detalhes ?? {})) {
    const d = bruto as Record<string, unknown>;
    for (const campo of Object.keys(CAMPOS_DETALHE) as (keyof DetalheParcial)[]) {
      if (!CAMPOS_DETALHE[campo](d?.[campo])) throw new ErroInstantaneo(`valor inválido em "${campo}" no detalhe de ${id}.`);
    }
    saida.set(id, d as unknown as DetalheParcial);
  }
  return saida;
}

/**
 * Matrícula da Caixa no endereço padrão do site dela (/editais/matricula/{UF}/{id13}.pdf, ver base/FONTES.md):
 * a ficha quase nunca é lida, então o link raramente vem da coleta. Só o link, como nas fotos: nada é baixado.
 * null quando não é da Caixa ou o id não tem os 13 dígitos.
 */
export function linkMatriculaCaixa(resumo: Pick<ImovelResumo, "id" | "uf" | "fonte">): LinkImovel | null {
  const m = /^caixa-(\d{13})$/.exec(resumo.id);
  if (resumo.fonte.id !== "caixa_csv" || !m || !/^[A-Z]{2}$/.test(resumo.uf)) return null;
  return {
    tipo: "matricula",
    rotulo: "Matrícula do imóvel",
    url: `https://venda-imoveis.caixa.gov.br/editais/matricula/${resumo.uf}/${m[1]}.pdf`,
    descricao: "PDF no site da Caixa, no endereço padrão (se não abrir, a Caixa ainda não publicou)",
  };
}

/**
 * Junta a linha da lista e o pedaço do detalhe num ImovelDetalhe completo (sem plano aplicado), com a
 * matrícula da Caixa no endereço padrão (quando a coleta não trouxe uma) e o link "Ver endereço no Google
 * Maps" no fim.
 */
export function montarDetalhe(resumo: ImovelResumo, endereco: string | null, parcial: DetalheParcial): ImovelDetalhe {
  const extras = new Map(parcial.tags.map((t) => [t.slug, t]));
  const tags: TagDetalhe[] = resumo.tags.map((t) => {
    const e = extras.get(t.slug);
    return { ...t, confianca: (e?.confianca ?? "baixa") as Confianca, origem: e?.origem ?? "", evidencia: e?.evidencia ?? null };
  });
  const mapa: LinkImovel = {
    tipo: "mapa",
    rotulo: endereco ? "Ver endereço no Google Maps" : "Ver a região no Google Maps",
    url: linkGoogleMaps({ endereco, bairro: resumo.bairro, cidade: resumo.cidade, uf: resumo.uf }),
    descricao: endereco ? "Busca o endereço publicado pela fonte" : "A fonte não publica o endereço: busca bairro e cidade",
  };
  const matricula = parcial.links.some((l) => l.tipo === "matricula") ? null : linkMatriculaCaixa(resumo);
  return { ...resumo, ...parcial, tags, endereco, links: [...parcial.links, ...(matricula ? [matricula] : []), mapa], registro: registroDe(resumo, parcial) };
}

/**
 * Dados de registro do imóvel. Na Caixa, matrícula, comarca, ofício e inscrição imobiliária estão na ficha
 * (página do imóvel no site dela), que o CSV não traz: sem a ficha lida, a situação é "pendente" (a fonte
 * publica, a Luneta ainda não leu) e a tela aponta para a página, em vez de dizer "não informado". Com a ficha
 * lida (`parcial.registro`, ou a matrícula que só a ficha dá), é "lido", com comarca, ofício, inscrição,
 * averbação e o dia da leitura quando a exportação os trouxe.
 */
export function registroDe(resumo: Pick<ImovelResumo, "fonte">, parcial: Pick<DetalheParcial, "matricula" | "cartorio" | "links" | "registro">): RegistroImovel {
  const lido = parcial.registro;
  const matriculas = lido?.matriculas.length ? lido.matriculas : (parcial.matricula ?? "").split(/\s*[;,]\s*/).filter(Boolean);
  const paginaFonte = parcial.links.find((l) => l.tipo === "anuncio")?.url ?? null;
  const caixa = resumo.fonte.id === "caixa_csv";
  const situacao: RegistroImovel["situacao"] = caixa
    ? lido || matriculas.length
      ? "lido"
      : "pendente"
    : matriculas.length || parcial.cartorio
      ? "na_fonte"
      : "nao_publica";
  return {
    situacao,
    matriculas,
    cartorio: parcial.cartorio,
    comarca: lido?.comarca ?? null,
    oficio: lido?.oficio ?? null,
    inscricaoImobiliaria: lido?.inscricaoImobiliaria ?? null,
    averbacaoLeiloesNegativos: lido?.averbacaoLeiloesNegativos ?? null,
    paginaFonte,
    lidoEm: lido?.lidoEm ?? null,
  };
}
