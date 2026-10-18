/**
 * Nota de localização para a página do imóvel e a lista (LocalizacaoImovel e ImovelResumo.notaLocal).
 *
 * Arquivos, gerados por base/fontes/localizacao/nota.py (formato versão 1; ver o README daquela pasta):
 * - base/saida/site/localizacao.json.gz: em colunas, por imóvel: situação, nota, faixa, precisão, ponto, componentes
 *   que não vêm do OSM (serviços, renda, infraestrutura, comércio), indicadores do IBGE, INEP e CNES e o alerta do BATER;
 * - base/saida/site/localizacao-osm.json.gz: só o que é derivado do OpenStreetMap (pontos de ônibus, estação, parque e
 *   os componentes de transporte e lazer), sob a ODbL, com o aviso no arquivo;
 * - base/saida/site/localizacao-cidades.json.gz: por cidade, moradores, células, porte, BATER, o que ficou de fora e o
 *   "comum" de cada indicador (mediana pelos moradores).
 *
 * Só Node (fs e zlib), sem nada do Next, como itbi.ts: o caminho padrão é escrito por extenso (o rastreio do build leva
 * só estes arquivos; também estão em `outputFileTracingIncludes`, next.config.ts) e o de teste fica fora do rastreio.
 * Arquivo ausente ou inválido não derruba a página: a nota fica sem dado (o motivo vai para o log).
 *
 * Textos em português, prontos para a tela (frente C): nunca "risco zero"; a nota não é garantia; "sem mapeamento de
 * risco" nunca vira "sem risco".
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { moeda, numero } from "./rotulos";
import type { AlertaLocal, ChaveComponenteLocal, ComponenteLocal, IndicadorLocal, LocalizacaoImovel, PrecisaoLocal } from "./tipos";

const descompactar = promisify(gunzip);

export const VERSAO_LOCALIZACAO = 1;
export const ARQUIVOS_LOCALIZACAO = {
  principal: "localizacao.json.gz",
  osm: "localizacao-osm.json.gz",
  cidades: "localizacao-cidades.json.gz",
} as const;

type Coluna = (number | string | null)[];

interface FonteArquivo {
  nome: string;
  detalhe: string;
  licenca: string;
  url: string | null;
}

export interface ArquivoLocalizacao {
  formato: "luneta-localizacao";
  versao: number;
  gerado_em: string;
  pesos: Record<ChaveComponenteLocal, number>;
  situacoes: string[];
  motivos: string[];
  precisoes: string[];
  renda: { variavel: string; rotulo: string; valores: string };
  /** os parâmetros do cálculo (nota.py); os que o site usa: o raio da procura por área de risco e o porte da cidade pequena */
  regras?: { risco_perto_m?: number; risco_aprox_max_m?: number; cidade_pequena_moradores?: number; cidade_pequena_celulas?: number };
  fontes: FonteArquivo[];
  colunas: Record<string, Coluna>;
}

export interface ArquivoLocalizacaoOsm {
  formato: "luneta-localizacao-osm";
  versao: number;
  gerado_em: string;
  licenca: string;
  aviso: string;
  dados_osm_de: string | null;
  com_osm: boolean;
  fonte: FonteArquivo;
  colunas: Record<string, Coluna>;
  cidades: Record<string, { comum: Record<string, number | null> }>;
}

export interface CidadeLocalizacao {
  nome: string;
  uf: string;
  moradores: number;
  celulas: number;
  pequena: boolean;
  bater: boolean;
  imoveis: number;
  /** componente fora da nota nesta cidade → motivo ("sem_osm", "sem_parque", "sem_dado") */
  fora: Partial<Record<ChaveComponenteLocal, string>>;
  /** indicadores que entraram em cada componente nesta cidade */
  indicadores: Partial<Record<ChaveComponenteLocal, string[]>>;
  comum: Record<string, number | null>;
}

export interface ArquivoLocalizacaoCidades {
  formato: "luneta-localizacao-cidades";
  versao: number;
  gerado_em: string;
  cidades: Record<string, CidadeLocalizacao>;
}

/** Os três arquivos lidos (null = ausente ou recusado) e a posição de cada id. */
export interface DadosLocalizacao {
  principal: ArquivoLocalizacao | null;
  osm: ArquivoLocalizacaoOsm | null;
  cidades: ArquivoLocalizacaoCidades | null;
  posicao: ReadonlyMap<string, number>;
  posicaoOsm: ReadonlyMap<string, number>;
  recusados: { arquivo: string; motivo: string }[];
}

export const SEM_LOCALIZACAO: DadosLocalizacao = { principal: null, osm: null, cidades: null, posicao: new Map(), posicaoOsm: new Map(), recusados: [] };

const COLUNAS_PRINCIPAIS = ["id", "situacao", "motivo", "nota", "faixa_min", "faixa_max", "precisao", "desvio_m", "lat", "lon", "cidade",
  "c_servicos", "c_renda", "c_infra", "c_comercio", "incompleto_renda", "risco_m"] as const;

function conferirColunas(colunas: unknown, nomes: readonly string[]): string | null {
  if (typeof colunas !== "object" || colunas === null) return "sem colunas";
  const c = colunas as Record<string, unknown>;
  const id = c.id;
  if (!Array.isArray(id) || !id.every((x) => typeof x === "string")) return "coluna id ausente";
  for (const n of nomes) {
    const v = c[n];
    if (!Array.isArray(v) || v.length !== id.length) return `coluna "${n}" ausente ou com tamanho errado`;
  }
  for (const [n, v] of Object.entries(c)) {
    if (n === "id") continue;
    if (!Array.isArray(v) || v.length !== id.length || !v.every((x) => x === null || typeof x === "number")) return `coluna "${n}" inválida`;
  }
  return null;
}

/** Confere um arquivo pelo formato; devolve o motivo da recusa ou null. */
export function conferirArquivoLocalizacao(a: unknown, formato: "luneta-localizacao" | "luneta-localizacao-osm" | "luneta-localizacao-cidades"): string | null {
  const x = a as { formato?: unknown; versao?: unknown; gerado_em?: unknown; colunas?: unknown; cidades?: unknown };
  if (typeof x !== "object" || x === null || x.formato !== formato) return `não é um arquivo ${formato}`;
  if (x.versao !== VERSAO_LOCALIZACAO) return `formato ${String(x.versao)}; este site lê o ${VERSAO_LOCALIZACAO}`;
  if (typeof x.gerado_em !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.gerado_em)) return "data de geração inválida";
  if (formato === "luneta-localizacao") {
    const p = a as ArquivoLocalizacao;
    if (!Array.isArray(p.situacoes) || !Array.isArray(p.motivos) || !Array.isArray(p.precisoes) || typeof p.pesos !== "object") return "legendas ausentes";
    return conferirColunas(p.colunas, COLUNAS_PRINCIPAIS);
  }
  if (formato === "luneta-localizacao-osm") {
    const o = a as ArquivoLocalizacaoOsm;
    if (typeof o.aviso !== "string" || !o.aviso.includes("OpenStreetMap")) return "sem o aviso da ODbL";
    if (typeof o.cidades !== "object" || o.cidades === null) return "sem as cidades";
    return conferirColunas(o.colunas, []);
  }
  return typeof x.cidades === "object" && x.cidades !== null ? null : "sem as cidades";
}

/**
 * Lê os três arquivos (sem `pasta`, os do instantâneo: base/saida/site). Arquivo que falta ou não confere fica de
 * fora (null), com o motivo no log; sem o principal, nenhum imóvel tem nota.
 */
export async function lerLocalizacao(pasta?: string): Promise<DadosLocalizacao> {
  const ler = (nome: string) =>
    pasta === undefined ? readFile(join(process.cwd(), "base", "saida", "site", nome)) : readFile(/* turbopackIgnore: true */ join(pasta, nome));
  const recusados: DadosLocalizacao["recusados"] = [];
  async function um<T>(nome: string, formato: Parameters<typeof conferirArquivoLocalizacao>[1]): Promise<T | null> {
    let bruto: Buffer;
    try {
      bruto = await ler(nome);
    } catch {
      return null; // ainda não gerado: sem nota, sem erro
    }
    try {
      const a = JSON.parse((await descompactar(bruto)).toString("utf8")) as unknown;
      const motivo = conferirArquivoLocalizacao(a, formato);
      if (motivo) {
        recusados.push({ arquivo: nome, motivo });
        return null;
      }
      return a as T;
    } catch (e) {
      recusados.push({ arquivo: nome, motivo: (e as Error).message });
      return null;
    }
  }
  const [principal, osm, cidades] = await Promise.all([
    um<ArquivoLocalizacao>(ARQUIVOS_LOCALIZACAO.principal, "luneta-localizacao"),
    um<ArquivoLocalizacaoOsm>(ARQUIVOS_LOCALIZACAO.osm, "luneta-localizacao-osm"),
    um<ArquivoLocalizacaoCidades>(ARQUIVOS_LOCALIZACAO.cidades, "luneta-localizacao-cidades"),
  ]);
  for (const r of recusados) console.error(`Localização (base/saida/site): ${r.arquivo} ficou de fora: ${r.motivo}`);
  const posicao = new Map<string, number>();
  (principal?.colunas.id as string[] | undefined)?.forEach((id, k) => posicao.set(id, k));
  const posicaoOsm = new Map<string, number>();
  (osm?.colunas.id as string[] | undefined)?.forEach((id, k) => posicaoOsm.set(id, k));
  return { principal, osm, cidades, posicao, posicaoOsm, recusados };
}

/** Os arquivos, lidos uma vez por instância; um erro não fica guardado. */
let carregada: Promise<DadosLocalizacao> | null = null;
export function dadosLocalizacao(): Promise<DadosLocalizacao> {
  if (!carregada) {
    carregada = lerLocalizacao().catch((e) => {
      console.error(`Localização: leitura falhou: ${(e as Error).message}`);
      carregada = null;
      return SEM_LOCALIZACAO;
    });
  }
  return carregada;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

/** Ordem dos componentes na tela: pelo peso (maior primeiro); no empate, a ordem abaixo. */
const ORDEM_EMPATE: readonly ChaveComponenteLocal[] = ["servicos", "infra", "transporte", "renda", "comercio", "lazer"];
export const PESOS_PADRAO: Record<ChaveComponenteLocal, number> = { servicos: 25, transporte: 20, renda: 20, infra: 25, comercio: 5, lazer: 5 };

export const ROTULO_COMPONENTE: Record<ChaveComponenteLocal, string> = {
  servicos: "Serviços do dia a dia",
  transporte: "Transporte",
  renda: "Renda do entorno",
  infra: "Infraestrutura da rua",
  comercio: "Comércio e movimento",
  lazer: "Lazer",
};

/** Componentes que saem do arquivo do OSM (C9). */
const DO_OSM: ReadonlySet<ChaveComponenteLocal> = new Set(["transporte", "lazer"]);

type Formato = "contagem" | "distancia" | "moeda" | "pct";
interface DefIndicador {
  chave: string;
  rotulo: string;
  formato: Formato;
  /** distância: o teto gravado (quem está no teto aparece como "mais de ...") */
  teto?: number;
  osm?: boolean;
}

/** Indicadores de cada componente, na ordem da tela. */
export const INDICADORES: Record<ChaveComponenteLocal, DefIndicador[]> = {
  servicos: [
    { chave: "mercados_500", rotulo: "Mercados a até 500 m", formato: "contagem" },
    { chave: "farmacias_500", rotulo: "Farmácias a até 500 m", formato: "contagem" },
    { chave: "padarias_500", rotulo: "Padarias a até 500 m", formato: "contagem" },
    { chave: "escolas_1k", rotulo: "Escolas a até 1 km", formato: "contagem" },
    { chave: "saude_1k", rotulo: "Unidades de saúde a até 1 km", formato: "contagem" },
  ],
  transporte: [
    { chave: "estacao_m", rotulo: "Estação de metrô, trem, BRT, barca ou terminal mais perto", formato: "distancia", teto: 5000, osm: true },
    { chave: "onibus_500", rotulo: "Pontos de ônibus a até 500 m", formato: "contagem", osm: true },
    { chave: "onibus_face", rotulo: "Domicílios em quadra com ponto de ônibus", formato: "pct" },
  ],
  renda: [{ chave: "renda", rotulo: "Renda típica de quem sustenta o domicílio", formato: "moeda" }],
  infra: [
    { chave: "pavimentacao", rotulo: "Domicílios em rua pavimentada", formato: "pct" },
    { chave: "calcada", rotulo: "Domicílios em rua com calçada", formato: "pct" },
    { chave: "iluminacao", rotulo: "Domicílios em rua com iluminação pública", formato: "pct" },
    { chave: "esgoto", rotulo: "Domicílios com esgoto pela rede", formato: "pct" },
  ],
  comercio: [{ chave: "comercio_1k", rotulo: "Comércios e serviços a até 1 km", formato: "contagem" }],
  lazer: [{ chave: "parque_m", rotulo: "Parque, praça ou parquinho mais perto", formato: "distancia", teto: 3000, osm: true }],
};

const KM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "650 m", "1,2 km", "mais de 5 km" */
export function distancia(m: number, teto?: number): string {
  if (teto !== undefined && m >= teto) return `mais de ${KM.format(teto / 1000)} km`;
  if (m < 1000) return `${numero(Math.round(m / 10) * 10)} m`;
  return `${KM.format(m / 1000)} km`;
}

function formatar(v: number, def: DefIndicador): string {
  switch (def.formato) {
    case "contagem":
      return numero(v);
    case "distancia":
      return distancia(v, def.teto);
    case "moeda":
      return moeda(v);
    case "pct":
      return `${numero(v)}%`;
  }
}

/** Valor de uma coluna na posição (null se a coluna ou a posição não existe). */
function valor(colunas: Record<string, Coluna> | undefined, nome: string, k: number | undefined): number | null {
  if (!colunas || k === undefined) return null;
  const v = colunas[nome]?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Pesos efetivos (soma 100, maior resto) dos componentes disponíveis. */
export function pesosEfetivos(pesos: Record<ChaveComponenteLocal, number>, disponiveis: readonly ChaveComponenteLocal[]): Record<ChaveComponenteLocal, number> {
  const saida = { servicos: 0, transporte: 0, renda: 0, infra: 0, comercio: 0, lazer: 0 } as Record<ChaveComponenteLocal, number>;
  const total = disponiveis.reduce((s, c) => s + pesos[c], 0);
  if (total <= 0) return saida;
  const brutos = disponiveis.map((c) => ({ c, v: (100 * pesos[c]) / total }));
  let soma = 0;
  for (const b of brutos) soma += saida[b.c] = Math.floor(b.v);
  const restos = [...brutos].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)) || ORDEM_EMPATE.indexOf(a.c) - ORDEM_EMPATE.indexOf(b.c));
  for (let k = 0; k < 100 - soma; k++) saida[restos[k % restos.length]!.c] += 1;
  return saida;
}

export function terco(p: number | null): "baixo" | "medio" | "alto" | null {
  if (p === null || !Number.isFinite(p)) return null;
  return p < 100 / 3 ? "baixo" : p < 200 / 3 ? "medio" : "alto";
}

const TEXTO_RISCO_FIM =
  "O mapeamento é do IBGE e do Cemaden, publicado em 2018 com base no Censo de 2010, e não separa deslizamento de inundação. " +
  "A ausência de área mapeada não quer dizer que não haja risco; confira com a Defesa Civil do município.";
const FONTE_RISCO = "IBGE e Cemaden, População em Áreas de Risco no Brasil (BATER, 2018)";

const KM_INTEIRO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Raios da procura por área de risco (os de nota.py, gravados em `regras`). */
const RISCO_PERTO_M = 100;
const RISCO_APROX_MAX_M = 500;

/**
 * Raio (m) em que a área de risco foi procurada, como em nota.py (raio_risco): a incerteza do ponto, entre 100 e 500 m,
 * em qualquer precisão. Antes, 100 m fixos no número e na rua: a rua com ±230 m dizia "nenhuma área a menos de 100 m do
 * imóvel" (revisão final da rodada 4, M2). null quando não houve procura (cidade sem mapeamento, imóvel sem ponto).
 */
export function raioRisco(
  regras: ArquivoLocalizacao["regras"],
  precisao: PrecisaoLocal | null,
  desvioM: number | null,
  temPonto: boolean,
  cidadeMapeada: boolean,
): number | null {
  if (!temPonto || !cidadeMapeada || precisao === null || precisao === "cidade") return null;
  const perto = regras?.risco_perto_m ?? RISCO_PERTO_M;
  return Math.min(regras?.risco_aprox_max_m ?? RISCO_APROX_MAX_M, Math.max(perto, desvioM ?? perto));
}

/** O texto de cada motivo (sem nota ou aproximada). */
function textoMotivo(
  motivo: string | null,
  situacao: LocalizacaoImovel["situacao"],
  cidade: CidadeLocalizacao | null,
  desvioM: number | null,
  nomeCidade: string,
  extra: { espalhada?: boolean; regras?: ArquivoLocalizacao["regras"]; geradoEm?: string } = {},
): string | null {
  if (situacao === "aproximada") {
    const medida = desvioM ? (desvioM >= 1000 ? `${KM_INTEIRO.format(desvioM / 1000)} km` : `${numero(desvioM)} m`) : null;
    // a faixa é a do meio (quartis 25 e 75), não o intervalo inteiro (M4)
    if (extra.espalhada) {
      // a rua foi achada, mas os endereços dela se espalham: o ponto é o meio da rua, não o centro do bairro (M3)
      return (
        `A rua do endereço foi encontrada, mas os endereços dela se espalham${medida ? ` por cerca de ${medida}` : " demais"}: o ponto é o meio da ` +
        "rua e a nota é aproximada, o meio da faixa do meio das notas das áreas habitadas em volta. As partes e os números abaixo foram medidos " +
        "nesse ponto, não no imóvel."
      );
    }
    return (
      `O endereço foi localizado só no bairro${medida ? ` (incerteza de cerca de ${medida})` : ""}: a nota é o meio da faixa do meio das notas das ` +
      "áreas habitadas em volta do centro do bairro. As partes e os números abaixo foram medidos no centro do bairro, não no imóvel."
    );
  }
  if (situacao === "pendente") {
    // o recálculo é manual, de tempos em tempos (M7): a data do último
    const quando = extra.geradoEm ? ` (${extra.geradoEm.slice(8, 10)}/${extra.geradoEm.slice(5, 7)}/${extra.geradoEm.slice(0, 4)})` : "";
    return `A nota deste imóvel ainda não foi calculada: ele entrou na base depois do último cálculo${quando}. A nota é recalculada de tempos em tempos.`;
  }
  switch (motivo) {
    case "cidade":
      return "O endereço foi localizado só na cidade, sem a rua ou o bairro: uma nota aqui diria mais do que sabemos. O ponto no mapa é a sede do município.";
    case "rural":
      return "Imóvel rural: a nota mede serviços a pé, transporte e infraestrutura de rua, que descrevem a cidade, não uma área rural.";
    case "pequena": {
      // o porquê pelo critério que valeu (M6): quase sempre os moradores (todas as cidades pequenas da base têm 50 áreas
      // ou mais, até 1.028); "tão poucas áreas" contradizia o número logo antes
      const minMoradores = extra.regras?.cidade_pequena_moradores ?? 20_000;
      const minCelulas = extra.regras?.cidade_pequena_celulas ?? 50;
      const m = cidade ? numero(cidade.moradores) : "poucos";
      const areas = `${cidade ? numero(cidade.celulas) : "poucas"} áreas habitadas na grade do IBGE (quadrados de 200 m na cidade e de 1 km no campo)`;
      const porque =
        cidade && cidade.moradores >= minMoradores && cidade.celulas < minCelulas
          ? `com menos de ${numero(minCelulas)} áreas habitadas, poucas casas mudariam muito a posição de 0 a 100`
          : `com menos de ${numero(minMoradores)} moradores, poucas casas mudariam muito a posição de 0 a 100`;
      return `${nomeCidade} tem ${m} moradores e ${areas}: ${porque}. Mostramos os números do entorno e a posição em terços na cidade.`;
    }
    case "sem_cidade":
      return "A cidade deste imóvel não foi encontrada nas bases do IBGE usadas para a nota.";
    case "poucas_celulas":
      return "O endereço foi localizado só no bairro e há poucas áreas habitadas por perto para estimar uma faixa.";
    case "sem_ponto":
      return "Não há dados suficientes em volta deste ponto para calcular a nota.";
    default:
      return null;
  }
}

function fontesDe(d: DadosLocalizacao, usouOsm: boolean): LocalizacaoImovel["fontes"] {
  const fontes = (d.principal?.fontes ?? []).map((f) => ({ nome: f.nome, detalhe: f.detalhe, licenca: f.licenca, url: f.url ?? null }));
  if (usouOsm && d.osm) {
    const data = d.osm.dados_osm_de ? ` (dados de ${d.osm.dados_osm_de.slice(8, 10)}/${d.osm.dados_osm_de.slice(5, 7)}/${d.osm.dados_osm_de.slice(0, 4)})` : "";
    fontes.push({ nome: d.osm.fonte.nome, detalhe: `${d.osm.fonte.detalhe}${data}`, licenca: d.osm.fonte.licenca, url: d.osm.fonte.url ?? null });
  }
  return fontes;
}

/**
 * LocalizacaoImovel do imóvel `id` (cidade e UF para o nome da referência). null quando não há dado nenhum (arquivo
 * principal ausente); "pendente" quando o imóvel não está no arquivo (entrou depois do último cálculo).
 */
export function montarLocalizacao(d: DadosLocalizacao, id: string, lugar: { cidade: string; uf: string }): LocalizacaoImovel | null {
  const p = d.principal;
  if (!p) return null;
  const k = d.posicao.get(id);
  const ko = d.posicaoOsm.get(id);
  const nome = `${lugar.cidade}/${lugar.uf}`;
  if (k === undefined) {
    return {
      situacao: "pendente", nota: null, faixa: null, precisao: null, desvioM: null, lat: null, lon: null, referencia: null,
      componentes: (ORDEM_EMPATE.slice() as ChaveComponenteLocal[]).sort((a, b) => (p.pesos[b] ?? 0) - (p.pesos[a] ?? 0) || ORDEM_EMPATE.indexOf(a) - ORDEM_EMPATE.indexOf(b))
        .map((c) => ({ chave: c, rotulo: ROTULO_COMPONENTE[c], nota: null, peso: p.pesos[c] ?? 0, indicadores: [] })),
      alertas: [], motivo: textoMotivo(null, "pendente", null, null, nome, { geradoEm: p.gerado_em }), coberturaRisco: false, riscoRaioM: null, fontes: fontesDe(d, false),
      versao: p.versao, geradoEm: p.gerado_em,
    };
  }
  const c = p.colunas;
  const situacao = (p.situacoes[valor(c, "situacao", k) ?? 2] ?? "sem_nota") as LocalizacaoImovel["situacao"];
  const motivoCod = valor(c, "motivo", k);
  const motivo = motivoCod === null ? null : (p.motivos[motivoCod] ?? null);
  const precisao = (p.precisoes[valor(c, "precisao", k) ?? 3] ?? "cidade") as PrecisaoLocal;
  const code = valor(c, "cidade", k);
  const cidade = code !== null ? (d.cidades?.cidades[String(code)] ?? null) : null;
  const comumOsm = code !== null ? d.osm?.cidades[String(code)]?.comum : undefined;
  const lat = valor(c, "lat", k);
  const lon = valor(c, "lon", k);
  const temPonto = lat !== null && lon !== null;
  const pequena = !!cidade?.pequena || motivo === "pequena";
  const desvioM = valor(c, "desvio_m", k);

  // componentes: nota (percentil) de cada um; no OSM, do arquivo à parte
  const notaComp = (cc: ChaveComponenteLocal) => (DO_OSM.has(cc) ? valor(d.osm?.colunas, `c_${cc}`, ko) : valor(c, `c_${cc}`, k));
  const brutas = Object.fromEntries(ORDEM_EMPATE.map((cc) => [cc, temPonto ? notaComp(cc) : null])) as Record<ChaveComponenteLocal, number | null>;
  const disponiveis = ORDEM_EMPATE.filter((cc) => brutas[cc] !== null);
  const pesos = disponiveis.length ? pesosEfetivos(p.pesos, disponiveis) : { ...p.pesos };
  const mostraNota = situacao === "calculada" || situacao === "aproximada";
  let usouOsm = false;
  const componentes: ComponenteLocal[] = (ORDEM_EMPATE.slice() as ChaveComponenteLocal[])
    .sort((a, b) => (p.pesos[b] ?? 0) - (p.pesos[a] ?? 0) || ORDEM_EMPATE.indexOf(a) - ORDEM_EMPATE.indexOf(b))
    .map((cc): ComponenteLocal => {
      const usados = cidade?.indicadores?.[cc];
      const indicadores: IndicadorLocal[] = !temPonto
        ? []
        : INDICADORES[cc].flatMap((def): IndicadorLocal[] => {
            // só o que entrou na nota desta cidade (sem a lista, todos os que têm valor)
            if (usados && !usados.includes(def.chave)) return [];
            const v = def.osm ? valor(d.osm?.colunas, def.chave, ko) : valor(c, def.chave, k);
            if (v === null) return [];
            if (def.osm) usouOsm = true;
            const comum = def.osm ? (comumOsm?.[def.chave] ?? null) : (cidade?.comum[def.chave] ?? null);
            // zero no mapa aberto não é "não há": o OSM pode estar incompleto ali (M1)
            const texto = def.osm && def.formato === "contagem" && v === 0 ? "nenhum no mapa aberto (pode estar incompleto)" : formatar(v, def);
            return [{ chave: def.chave, rotulo: def.rotulo, valor: texto, numero: v, comum: comum === null || comum === undefined ? null : formatar(comum, def) }];
          });
      const n = brutas[cc];
      const comp: ComponenteLocal = {
        chave: cc,
        rotulo: ROTULO_COMPONENTE[cc],
        nota: mostraNota && !pequena ? n : null,
        peso: pesos[cc] ?? 0,
        indicadores,
      };
      if (pequena) comp.terco = terco(n);
      if (cc === "renda" && valor(c, "incompleto_renda", k) === 1) comp.incompleto = true;
      return comp;
    });
  // transporte e lazer vêm do arquivo do OSM: com eles na nota, a atribuição do OSM entra nas fontes
  if (temPonto && d.osm?.com_osm && (brutas.transporte !== null || brutas.lazer !== null)) usouOsm = true;

  const alertas: AlertaLocal[] = [];
  const riscoM = valor(c, "risco_m", k);
  // bairro "rebaixado": a rua foi achada, mas espalhada (o ponto é o meio da rua; M3)
  const espalhada = precisao === "bairro" && valor(c, "rua_espalhada", k) === 1;
  if (riscoM !== null && temPonto) {
    // fora do número exato, o alerta fala do ponto do endereço, nunca "o imóvel fica dentro" (M2)
    const ponto = precisao === "numero" ? null : precisao === "rua" ? "o ponto da rua do endereço" : espalhada ? "o meio da rua do endereço" : "o centro do bairro";
    const aprox = " (a posição do imóvel é aproximada)";
    const onde = ponto === null
      ? riscoM <= 0 ? "O imóvel fica dentro de uma área de risco mapeada." : `Há uma área de risco mapeada a cerca de ${distancia(riscoM)} do imóvel.`
      : riscoM <= 0 ? `${ponto.charAt(0).toUpperCase()}${ponto.slice(1)} fica dentro de uma área de risco mapeada${aprox}.`
        : `Há uma área de risco mapeada a cerca de ${distancia(riscoM)} d${ponto}${aprox}.`;
    const titulo = precisao === "bairro" && !espalhada ? "Área de risco mapeada no bairro" : "Área de risco mapeada perto";
    alertas.push({ tipo: "area_risco", titulo, texto: `${onde} ${TEXTO_RISCO_FIM}`, distanciaM: riscoM, fonte: FONTE_RISCO });
  }
  const nota = mostraNota ? valor(c, "nota", k) : null;
  const fmin = valor(c, "faixa_min", k);
  const fmax = valor(c, "faixa_max", k);
  return {
    situacao,
    nota: nota === null ? null : Math.round(nota),
    faixa: situacao === "aproximada" && fmin !== null && fmax !== null ? [fmin, fmax] : null,
    precisao,
    desvioM,
    lat,
    lon,
    referencia: cidade ? { nome: `${cidade.nome}/${cidade.uf}`, moradores: cidade.moradores, celulas: cidade.celulas } : null,
    componentes,
    alertas,
    motivo: situacao === "calculada" ? null : textoMotivo(motivo, situacao, cidade, desvioM, cidade ? cidade.nome : lugar.cidade, { espalhada, regras: p.regras }),
    ...(espalhada ? { pontoRuaEspalhada: true } : {}),
    coberturaRisco: !!cidade?.bater,
    riscoRaioM: raioRisco(p.regras, precisao, desvioM, temPonto, !!cidade?.bater),
    fontes: fontesDe(d, usouOsm),
    versao: p.versao,
    geradoEm: p.gerado_em,
  };
}

/** Nota do resumo (lista, ordem, filtro): a calculada, ou o meio da faixa na aproximada; null sem nota. */
export function notaLocalDe(d: DadosLocalizacao, id: string): number | null {
  const p = d.principal;
  const k = d.posicao.get(id);
  if (!p || k === undefined) return null;
  const s = p.situacoes[valor(p.colunas, "situacao", k) ?? 2];
  if (s !== "calculada" && s !== "aproximada") return null;
  const n = valor(p.colunas, "nota", k);
  return n === null ? null : Math.round(n);
}

// ---------------------------------------------------------------------------
// Exemplos fictícios (conjunto "exemplos", src/content/examples.ts)
// ---------------------------------------------------------------------------

/** Nota fictícia de um exemplo: a nota final, a de cada componente e alguns indicadores. */
export interface LocalizacaoFicticia {
  nota: number;
  componentes: Record<ChaveComponenteLocal, number>;
  /** valores crus, como no arquivo (contagens, metros, R$, %) */
  indicadores: Partial<Record<string, number>>;
  moradores: number;
  celulas: number;
  /** a cidade tem mapeamento de risco (BATER) */
  coberturaRisco: boolean;
}

/** LocalizacaoImovel de um exemplo fictício: tudo marcado como exemplo; nada vem dos arquivos. */
export function localizacaoExemplo(x: LocalizacaoFicticia, lugar: { cidade: string; uf: string; lat: number; lon: number }, hoje: string): LocalizacaoImovel {
  const pesos = pesosEfetivos(PESOS_PADRAO, ORDEM_EMPATE);
  const componentes = (ORDEM_EMPATE.slice() as ChaveComponenteLocal[])
    .sort((a, b) => PESOS_PADRAO[b] - PESOS_PADRAO[a] || ORDEM_EMPATE.indexOf(a) - ORDEM_EMPATE.indexOf(b))
    .map((cc): ComponenteLocal => ({
      chave: cc,
      rotulo: ROTULO_COMPONENTE[cc],
      nota: x.componentes[cc],
      peso: pesos[cc],
      indicadores: INDICADORES[cc].flatMap((def) => {
        const v = x.indicadores[def.chave];
        return v === undefined ? [] : [{ chave: def.chave, rotulo: def.rotulo, valor: formatar(v, def), numero: v, comum: null }];
      }),
    }));
  return {
    situacao: "calculada",
    nota: x.nota,
    faixa: null,
    precisao: "numero",
    desvioM: null,
    lat: lugar.lat,
    lon: lugar.lon,
    referencia: { nome: `${lugar.cidade}/${lugar.uf}`, moradores: x.moradores, celulas: x.celulas },
    componentes,
    alertas: [],
    motivo: "Exemplo fictício: a nota, as partes e os números foram inventados para mostrar como a seção aparece. O imóvel não existe.",
    coberturaRisco: x.coberturaRisco,
    riscoRaioM: x.coberturaRisco ? RISCO_PERTO_M : null,
    fontes: [{ nome: "Exemplo fictício", detalhe: "valores inventados, coerentes com o bairro do exemplo", licenca: "—", url: null }],
    versao: VERSAO_LOCALIZACAO,
    geradoEm: hoje,
  };
}
