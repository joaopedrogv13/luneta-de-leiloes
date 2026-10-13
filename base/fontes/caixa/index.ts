/**
 * Conector da CAIXA: "Lista de Imóveis da Caixa" (CSV oficial), com ficha e fotos opcionais.
 *
 * - Lista: https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_geral.csv (ou
 *   Lista_imoveis_{UF}.csv com --uf). Validada antes de qualquer gravação (lista.ts).
 * - Ficha (`--detalhes`): /sistema/detalhe-imovel.asp, uma a cada 2 s no mínimo, só para
 *   imóvel novo, alterado no CSV ou com ficha velha. Guardada no cache local (cache.ts) e
 *   juntada ao CSV em toda coleta. Ficha que perde campos estáveis herda os da anterior.
 * - Fotos: capa pelo padrão F{id13}21.jpg; com LUNETA_CAIXA_VERIFICAR_FOTOS=1, HEAD nos slots.
 *
 * Variáveis de ambiente: LUNETA_CAIXA_CACHE (caminho do cache, ou "off"),
 * LUNETA_CAIXA_VERIFICAR_FOTOS=1, LUNETA_CAIXA_FICHAS=<pasta> (lê as fichas de arquivos
 * <pasta>/<id13>.html em vez da rede, para testar --detalhes sem rede),
 * LUNETA_CAIXA_ULTIMA_UF=<UF> (última UF esperada na lista geral; "off" desliga a checagem).
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { UFS, type Conector, type Documento, type Foto, type ImovelNormalizado, type Modalidade, type NumeroPraca, type OpcoesColeta, type Praca, type TextoFonte } from "../../tipos.ts";
import { classificarModalidade } from "../../util/classificar.ts";
import { hojeBrasilia, instanteDe } from "../../util/data.ts";
import { ErroHttp } from "../../util/http.ts";
import { lerNumeroBR } from "../../util/numero.ts";
import { capitalizarNome, colapsarEspacos, normalizarTexto, textoOuNulo } from "../../util/texto.ts";
import { normalizarUf } from "../../util/uf.ts";
import { abrirCacheDisco, CACHE_PADRAO, cacheEmMemoria, VERSAO_PARSER_FICHA, type BaseCsv, type CacheCaixa, type DetalheGuardado, type ResumoLista } from "./cache.ts";
import { interpretarDescricao, tipoDaCaixa, tituloDoImovel } from "./descricao.ts";
import { BASE_CAIXA, ErroFicha, fichaBloqueada, fichaSemDadosEstaveis, herdarEstaveis, interpretarFicha, type FichaCaixa } from "./ficha.ts";
import { capaPadrao, fotosDaFicha, fotosVerificadas, verificarFotos } from "./fotos.ts";
import { decodificarLista, interpretarLista, pareceBloqueio, resumirUfs, type LinhaCaixa, type ListaCaixa } from "./lista.ts";

export const URL_LISTA_GERAL = `${BASE_CAIXA}/listaweb/Lista_imoveis_geral.csv`;
export const urlListaUf = (uf: string): string => `${BASE_CAIXA}/listaweb/Lista_imoveis_${uf}.csv`;
export const urlFicha = (numero: string): string => `${BASE_CAIXA}/sistema/detalhe-imovel.asp?hdnimovel=${numero}`;

/** Rótulos de modalidade vistos no CSV (08/10/2026). Outro rótulo gera aviso. */
export const MODALIDADES_CONHECIDAS = ["Venda Direta Online", "Leilão SFI - Edital Único", "Venda Online", "Licitação Aberta"];

/** Registro bruto: a linha do CSV mais o que houver da ficha e das fotos no cache. */
export interface BrutoCaixa {
  linha: LinhaCaixa;
  linhaArquivo: number;
  problema: string | null;
  detalhe: DetalheGuardado | null;
}

export interface ConfigConectorCaixa {
  /** Caminho do cache de fichas e fotos; `null` desliga o disco. Padrão: LUNETA_CAIXA_CACHE ou base/dados/caixa/detalhes.db. */
  cache?: string | null;
  /** Faz HEAD nos slots de foto. Padrão: LUNETA_CAIXA_VERIFICAR_FOTOS=1. */
  verificarFotos?: boolean;
  /** Pasta com fichas salvas (<id13>.html): --detalhes lê dela, sem rede. Padrão: LUNETA_CAIXA_FICHAS. */
  fichasLocais?: string | null;
  /** Intervalo mínimo entre duas fichas. Padrão e mínimo recomendado: 2000 ms. */
  intervaloFichaMs?: number;
  /** Relê a ficha depois de tantos dias, mesmo sem mudança no CSV. Padrão 7. */
  maxDiasFicha?: number;
  /** Reverifica as fotos depois de tantos dias. Padrão 30. */
  maxDiasFotos?: number;
  /** Slots de foto testados por imóvel. Padrão 8 (21 a 28). */
  maxSlotsFotos?: number;
  /** Para de buscar fichas depois de tantas falhas seguidas. Padrão 10. */
  maxFalhasSeguidas?: number;
  /**
   * Para de buscar fichas depois de tantas fichas degradadas seguidas (perderam campos
   * estáveis da leitura anterior, ou vieram sem matrícula, comarca e CEP). Padrão 5.
   */
  maxFichasDegradadas?: number;
  /** Volume mínimo de imóveis na lista geral. Padrão 5000 (a lista oscilou de 7.113 a 28.219 em 2026). */
  volumeMinimo?: number;
  /**
   * Última UF esperada na lista geral, que vem em ordem de UF: um arquivo que termina antes
   * dela foi cortado numa quebra de linha. Padrão: LUNETA_CAIXA_ULTIMA_UF, senão a última UF
   * da lista anterior (cache), senão "TO". `null` (ou "off") desliga.
   */
  ultimaUf?: string | null;
  /** Tempo máximo do download do CSV (por tentativa, com o corpo). Padrão 300 s no geral, 120 s por UF. */
  timeoutListaMs?: number;
  agora?: () => Date;
  esperar?: (ms: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Normalização (pura)
// ---------------------------------------------------------------------------

/** "10005120" → "0000010005120". Lança se não for um número de imóvel. */
export function idTreze(numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  if (!/^\d{1,13}$/.test(numero.trim()) || digitos === "" || /^0+$/.test(digitos)) {
    throw new Error(`número do imóvel inválido: ${JSON.stringify(numero)}`);
  }
  return digitos.padStart(13, "0");
}

function mesmoValor(a: number | null | undefined, b: number | null | undefined): boolean {
  return a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(a - b) < 0.01;
}

function lerDinheiro(valor: string): number | null {
  return lerNumeroBR(valor, { decimal: "," });
}

/** Preço, avaliação e modalidade de uma linha (para comparar com a ficha guardada). */
export function baseDaLinha(linha: LinhaCaixa): BaseCsv {
  return { preco: lerDinheiro(linha.preco), avaliacao: lerDinheiro(linha.avaliacao), modalidade: colapsarEspacos(linha.modalidade) };
}

/**
 * A ficha guardada ainda descreve a oferta atual do CSV? Sim se o CSV não mudou desde que ela
 * foi lida, ou se os valores da própria ficha batem com o CSV. Se não, só os dados estáveis
 * dela (matrícula, cartório, CEP, áreas) são usados; praças, pagamento e editais não.
 */
export function fichaAtual(detalhe: DetalheGuardado | null, base: BaseCsv): boolean {
  const ficha = detalhe?.ficha;
  if (!ficha) return false;
  const b = detalhe.base;
  if (b && b.modalidade === base.modalidade && mesmoValor(b.preco, base.preco) && (b.avaliacao === base.avaliacao || mesmoValor(b.avaliacao, base.avaliacao))) {
    return true;
  }
  const avaliacaoOk = base.avaliacao === null || ficha.valor_avaliacao === null || mesmoValor(ficha.valor_avaliacao, base.avaliacao);
  const precoOk = mesmoValor(ficha.valor_minimo, base.preco) || mesmoValor(ficha.valor_venda, base.preco) ||
    ficha.pracas.some((p) => mesmoValor(p.valor_minimo, base.preco));
  const modalidadeOk = !b || b.modalidade === base.modalidade;
  return avaliacaoOk && precoOk && modalidadeOk;
}

/** Link da ficha: o do CSV, se for da Caixa e do mesmo imóvel; senão montado. */
function linkDaFicha(linha: LinhaCaixa, id13: string): string {
  const numero = String(Number(id13));
  try {
    const url = new URL(linha.link);
    const hdn = url.searchParams.get("hdnimovel")?.replace(/^0+/, "");
    if (url.protocol === "https:" && url.hostname === "venda-imoveis.caixa.gov.br" && hdn === numero) return url.toString();
  } catch {
    // link ausente ou quebrado: monta abaixo
  }
  return urlFicha(numero);
}

/**
 * Endereço em caixa alta → capitalizado, sem mexer em palavras com algarismo ("LT 04C",
 * "PE-07", "BL B2" ficam como estão: "Lt 04C", "PE-07", "Bl B2").
 */
export function capitalizarEndereco(endereco: string): string {
  const original = colapsarEspacos(endereco).split(" ");
  const capitalizado = capitalizarLugar(endereco).split(" ");
  if (capitalizado.length !== original.length) return capitalizarLugar(endereco);
  return capitalizado.map((palavra, i) => (/\d/.test(original[i] ?? "") ? (original[i] ?? palavra) : palavra)).join(" ");
}

/** capitalizarNome, mas uma letra solta no fim continua maiúscula ("CHACARAS BRASIL A" → "Chacaras Brasil A"). */
export function capitalizarLugar(texto: string): string {
  return capitalizarNome(texto).replace(/ (\p{Ll})$/u, (_, letra: string) => ` ${letra.toLocaleUpperCase("pt-BR")}`);
}

function simNao(valor: string): boolean | null {
  const t = normalizarTexto(valor);
  if (t === "sim" || t === "s") return true;
  if (t === "nao" || t === "n") return false;
  return null;
}

/** "CRUZEIRO DO SUL-AC" → { cidade: "Cruzeiro do Sul", uf: "AC" }. */
function lerComarca(comarca: string | null): { cidade: string; uf: string | null } | null {
  if (!comarca) return null;
  const m = /^(.*?)\s*[-/]\s*([A-Za-z]{2})$/.exec(comarca.trim());
  const cidade = capitalizarNome(m ? (m[1] ?? "") : comarca);
  return cidade ? { cidade, uf: m ? (m[2] ?? "").toUpperCase() : null } : null;
}

/** "1º Ofício de Registro de Imóveis de Cruzeiro do Sul/AC" a partir de ofício e comarca da ficha. */
export function cartorioDaFicha(ficha: Pick<FichaCaixa, "oficio" | "comarca">): string | null {
  const comarca = lerComarca(ficha.comarca);
  const onde = comarca ? ` de ${comarca.cidade}${comarca.uf ? `/${comarca.uf}` : ""}` : "";
  const numero = ficha.oficio && /\d/.test(ficha.oficio) ? Number(ficha.oficio.replace(/\D/g, "")) : null;
  if (numero) return `${numero}º Ofício de Registro de Imóveis${onde}`;
  return comarca ? `Registro de Imóveis${onde}` : null;
}

/**
 * Praças pela modalidade: oferta única (número 0) para venda direta, venda online e licitação;
 * no Leilão SFI, as praças da ficha quando ela está atual (o CSV não diz qual está valendo).
 */
function pracasDe(modalidade: Modalidade, preco: number, ficha: FichaCaixa | null): { pracas: Praca[]; praca_atual: NumeroPraca | null } {
  if (modalidade !== "leilao") {
    return { pracas: [{ numero: 0, data: ficha?.data_licitacao ?? null, valor_minimo: preco }], praca_atual: 0 };
  }
  if (!ficha || ficha.pracas.length === 0) return { pracas: [], praca_atual: null };
  const pracas: Praca[] = ficha.pracas.map((p) => ({ numero: p.numero, data: p.data, valor_minimo: p.valor_minimo }));
  const batem = ficha.pracas.filter((p) => mesmoValor(p.valor_minimo, preco));
  // O preço do CSV é o mínimo vigente: se ele bate com uma praça só, é ela; senão o núcleo deduz pelas datas.
  const unica = batem.length === 1 ? batem[0] : undefined;
  return { pracas, praca_atual: unica ? unica.numero : null };
}

function fotosDe(id13: string, detalhe: DetalheGuardado | null): Foto[] {
  const verificadas = detalhe?.fotos && detalhe.fotos.length > 0 ? detalhe.fotos : null;
  const ficha = detalhe?.ficha?.tem_galeria ? detalhe.ficha : null;
  if (verificadas && (!ficha || (detalhe?.fotos_em ?? "") >= (detalhe?.ficha_em ?? ""))) return fotosVerificadas(verificadas);
  if (ficha) return fotosDaFicha(ficha.fotos);
  return [capaPadrao(id13)];
}

function documentosDe(ficha: FichaCaixa | null, atual: boolean): Documento[] {
  if (!ficha) return [];
  return ficha.documentos.filter((d) => atual || d.tipo === "matricula");
}

/** Converte um registro bruto em imóvel normalizado. Lança só para linha quebrada. */
export function normalizarCaixa(bruto: BrutoCaixa): ImovelNormalizado {
  if (bruto.problema) throw new Error(`linha ${bruto.linhaArquivo}: ${bruto.problema}`);
  const c = bruto.linha;
  const id13 = idTreze(c.numero);
  const uf = normalizarUf(c.uf);
  if (!uf) throw new Error(`linha ${bruto.linhaArquivo}: UF inválida ${JSON.stringify(c.uf)}`);
  const cidade = textoOuNulo(c.cidade);
  if (!cidade) throw new Error(`linha ${bruto.linhaArquivo}: cidade vazia`);
  const preco = lerDinheiro(c.preco);
  if (preco === null || preco <= 0) throw new Error(`linha ${bruto.linhaArquivo}: preço inválido ${JSON.stringify(c.preco)}`);
  const avaliacaoLida = lerDinheiro(c.avaliacao);
  const avaliacao = avaliacaoLida !== null && avaliacaoLida > 0 ? avaliacaoLida : null;
  const rotuloModalidade = colapsarEspacos(c.modalidade);
  const classificada = classificarModalidade(rotuloModalidade);

  const base = baseDaLinha(c);
  const detalhe = bruto.detalhe;
  const ficha = detalhe?.ficha ?? null;
  const atual = fichaAtual(detalhe, base);
  const fichaVigente = atual ? ficha : null;

  const desc = interpretarDescricao(c.descricao);
  const descFicha = ficha?.descricao ? interpretarDescricao(ficha.descricao) : null;
  const tipo = desc.tipo !== "outro" || !ficha?.tipo_imovel ? desc.tipo : tipoDaCaixa(ficha.tipo_imovel);
  const areaTotal = desc.area_total ?? ficha?.area_total ?? null;
  const areaPrivativa = desc.area_privativa ?? ficha?.area_privativa ?? null;
  const areaTerreno = desc.area_terreno ?? ficha?.area_terreno ?? null;
  const quartos = desc.quartos ?? ficha?.quartos ?? descFicha?.quartos ?? null;
  const vagas = desc.vagas ?? ficha?.vagas ?? descFicha?.vagas ?? null;
  const { pracas, praca_atual } = pracasDe(classificada.modalidade, preco, fichaVigente);

  const extras: Record<string, string | number | boolean | null> = {};
  const desconto = lerNumeroBR(c.desconto, { decimal: "." });
  if (desconto !== null) extras.desconto_fonte = desconto;
  if (desc.tipo_fonte) extras.tipo_fonte = desc.tipo_fonte;
  if (desc.salas !== null) extras.salas = desc.salas;
  if (desc.lavabos !== null) extras.lavabos = desc.lavabos;
  if (desc.itens.length > 0) extras.itens = desc.itens.join(", ");
  if (ficha) {
    if (ficha.comarca) extras.comarca = ficha.comarca;
    if (ficha.oficio) extras.oficio = ficha.oficio;
    if (ficha.inscricao_imobiliaria) extras.inscricao_imobiliaria = ficha.inscricao_imobiliaria;
    if (ficha.averbacao_leiloes_negativos) extras.averbacao_leiloes_negativos = ficha.averbacao_leiloes_negativos;
    if (ficha.matriculas.length > 1) extras.matriculas = ficha.matriculas.join(", ");
    // A data da leitura e o "ficha atual?" ficam só no cache: no imóvel, entrariam no hash
    // e toda releitura da mesma ficha viraria "atualizado".
  }
  if (fichaVigente) {
    if (fichaVigente.aceita_consorcio !== null) extras.aceita_consorcio = fichaVigente.aceita_consorcio;
    if (fichaVigente.edital) extras.edital = fichaVigente.edital;
    if (fichaVigente.numero_item) extras.numero_item = fichaVigente.numero_item;
  }

  const textos: TextoFonte[] = fichaVigente?.texto ? [{ origem: "ficha", texto: fichaVigente.texto }] : [];
  const bairro = textoOuNulo(c.bairro);
  const endereco = textoOuNulo(c.endereco) ?? ficha?.endereco ?? null;

  return {
    registro: "imovel",
    id_na_fonte: id13,
    url: linkDaFicha(c, id13),
    titulo: tituloDoImovel({ tipo_fonte: desc.tipo_fonte ?? ficha?.tipo_imovel ?? null, tipo, quartos, area_privativa: areaPrivativa, area_total: areaTotal, area_terreno: areaTerreno }),
    tipo,
    uf,
    cidade: capitalizarLugar(cidade),
    bairro: bairro ? capitalizarLugar(bairro) : null,
    endereco: endereco ? capitalizarEndereco(endereco) : null,
    cep: ficha?.cep ?? null,
    area_total: areaTotal,
    area_privativa: areaPrivativa,
    area_terreno: areaTerreno,
    quartos,
    vagas,
    descricao: textoOuNulo(c.descricao),
    textos,
    modalidade: classificada.modalidade,
    modalidade_fonte: rotuloModalidade,
    judicial: classificada.judicial ?? false,
    aceita_financiamento: simNao(c.financiamento) ?? fichaVigente?.aceita_financiamento ?? null,
    aceita_fgts: fichaVigente?.aceita_fgts ?? null,
    aceita_parcelamento: fichaVigente?.aceita_parcelamento ?? null,
    ocupacao: null,
    leiloeiro: fichaVigente?.leiloeiro ?? null,
    comitente: "Caixa Econômica Federal",
    matricula: ficha?.matriculas[0] ?? null,
    cartorio: ficha ? cartorioDaFicha(ficha) : null,
    valor_avaliacao: avaliacao,
    preco,
    praca_atual,
    pracas,
    fotos: fotosDe(id13, detalhe),
    documentos: documentosDe(ficha, atual),
    status: "ativo",
    extras,
  };
}

// ---------------------------------------------------------------------------
// Coleta
// ---------------------------------------------------------------------------

const DIA_MS = 24 * 3600_000;
/** Na verificação de fotos, pelo menos 2 HEAD por imóvel: a capa (21) e o 1º slot ausente (22). */
const HEAD_POR_IMOVEL = 2;
/** Intervalo mínimo do cliente HTTP entre requisições ao mesmo host (fichas e fotos são o mesmo host). */
const INTERVALO_HOST_MS = 2000;

function idadeDias(iso: string | null, agora: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = instanteDe(iso);
  return t === null ? Number.POSITIVE_INFINITY : (agora.getTime() - t) / DIA_MS;
}

/** Lê a lista: arquivo local (UTF-8 ou CP1252, detectado) ou a rede (sempre pelo cliente educado). */
async function lerLista(op: OpcoesColeta, timeoutMs: number): Promise<{ texto: string; origem: string }> {
  if (op.arquivo) {
    const bytes = await readFile(op.arquivo);
    return { texto: decodificarLista(bytes), origem: op.arquivo };
  }
  const url = op.uf ? urlListaUf(op.uf) : URL_LISTA_GERAL;
  const resposta = await op.http.requisitar(url, {
    cabecalhos: { accept: "text/csv,text/plain;q=0.9,*/*;q=0.5" },
    // O geral tem ~7,7 MB: o timeout padrão do cliente (30 s com o corpo) exigiria ~260 KB/s.
    timeoutMs,
    sinal: op.sinal,
    validar: (r) => {
      const texto = decodificarLista(r.bytes);
      return pareceBloqueio(texto) ?? (/Lista de Im/.test(texto.slice(0, 300)) ? null : "assinatura \"Lista de Im\" ausente");
    },
  });
  return { texto: decodificarLista(resposta.bytes), origem: resposta.url || url };
}

/** Última UF que a lista geral deve trazer: configuração, variável de ambiente, lista anterior ou "TO". */
function ultimaUfEsperada(config: ConfigConectorCaixa, anterior: ResumoLista | null): string | null {
  if (config.ultimaUf !== undefined) return config.ultimaUf;
  const env = process.env.LUNETA_CAIXA_ULTIMA_UF?.trim();
  if (env) {
    if (env.toLowerCase() === "off") return null;
    const uf = normalizarUf(env);
    if (!uf) throw new Error(`LUNETA_CAIXA_ULTIMA_UF inválida: ${JSON.stringify(env)} (use a sigla da UF ou "off").`);
    return uf;
  }
  const ufsAnteriores = Object.keys(anterior?.por_uf ?? {}).filter((uf) => (UFS as readonly string[]).includes(uf)).sort();
  return ufsAnteriores[ufsAnteriores.length - 1] ?? "TO";
}

/**
 * Checagens da lista que dependem do escopo e da lista anterior (guardada no cache). Lança
 * para recusar (nada é gravado); devolve avisos e o resumo a guardar.
 * - Lista geral: vem em ordem de UF; se termina antes da última UF esperada, foi cortada numa
 *   quebra de linha (a checagem da última linha não pega esse corte).
 * - Mesma "Data de geração" da última lista lida no mesmo escopo, mas com menos imóveis:
 *   arquivo truncado (o conteúdo de uma geração não muda).
 */
export function conferirLista(
  lista: ListaCaixa,
  opcoes: { uf: string | null; ultimaUf: string | null; anterior: ResumoLista | null; agora: Date },
): { avisos: string[]; resumo: ResumoLista } {
  const avisos: string[] = [];
  const ufs = resumirUfs(lista.registros);
  if (!opcoes.uf && opcoes.ultimaUf) {
    const esperada = opcoes.ultimaUf;
    if (!ufs.ordenada) {
      avisos.push("A lista geral não veio em ordem de UF: a checagem de corte pela última UF ficou desligada nesta coleta.");
    } else if (ufs.ultima === null || ufs.ultima < esperada) {
      const faltam = UFS.filter((uf) => uf > (ufs.ultima ?? "") && uf <= esperada);
      throw new Error(
        `Lista da Caixa recusada: a lista geral vem em ordem de UF e devia ir até ${esperada}, mas termina em ${ufs.ultima ?? "(nenhuma UF)"} ` +
          `(faltam ${faltam.join(", ")}). Arquivo cortado numa quebra de linha? Nada foi gravado. ` +
          `Se essas UFs saíram mesmo da lista, rode com LUNETA_CAIXA_ULTIMA_UF=${ufs.ultima ?? "off"}.`,
      );
    }
  }
  const total = opcoes.uf ? (ufs.porUf[opcoes.uf] ?? 0) : lista.registros.length;
  const anterior = opcoes.anterior;
  if (anterior && anterior.gerado_em === lista.geradoEm && total < anterior.total) {
    throw new Error(
      `Lista da Caixa recusada: mesma "Data de geração" (${lista.geradoEm}) da lista lida em ${anterior.registrada_em.slice(0, 10) || "coleta anterior"}, ` +
        `mas com ${total} imóveis em vez de ${anterior.total}. Arquivo truncado? Nada foi gravado; a próxima lista, com data nova, passa normalmente.`,
    );
  }
  const porUf = opcoes.uf ? { [opcoes.uf]: total } : ufs.porUf;
  return { avisos, resumo: { gerado_em: lista.geradoEm, total, por_uf: porUf, registrada_em: opcoes.agora.toISOString() } };
}

type ResultadoFicha = { tipo: "ok"; ficha: FichaCaixa } | { tipo: "bloqueio" | "falha"; motivo: string };

export function criarConectorCaixa(config: ConfigConectorCaixa = {}): Conector<BrutoCaixa> {
  const agora = config.agora ?? (() => new Date());
  const esperar = config.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const intervaloFicha = config.intervaloFichaMs ?? 2000;
  const maxDiasFicha = config.maxDiasFicha ?? 7;
  const maxDiasFotos = config.maxDiasFotos ?? 30;
  const maxFalhasSeguidas = config.maxFalhasSeguidas ?? 10;
  const maxFichasDegradadas = config.maxFichasDegradadas ?? 5;

  function caminhoCache(): string | null {
    if (config.cache !== undefined) return config.cache;
    const env = process.env.LUNETA_CAIXA_CACHE;
    if (env === "off" || env === "0") return null;
    return env || CACHE_PADRAO;
  }

  async function buscarFicha(op: OpcoesColeta, numero: string, id13: string, pasta: string | null): Promise<ResultadoFicha> {
    let html: string;
    if (pasta) {
      const arquivo = [join(pasta, `${id13}.html`), join(pasta, `${numero}.html`)].find((a) => existsSync(a));
      if (!arquivo) return { tipo: "falha", motivo: `ficha local ${id13}.html não encontrada em ${pasta}` };
      html = decodificarLista(await readFile(arquivo));
    } else {
      try {
        const resposta = await op.http.requisitar(urlFicha(numero), {
          cabecalhos: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
          sinal: op.sinal,
          validar: (r) => fichaBloqueada(decodificarLista(r.bytes)),
        });
        html = decodificarLista(resposta.bytes);
      } catch (erro) {
        if (erro instanceof ErroHttp) {
          if (erro.motivo === "cancelado") throw erro;
          if (erro.motivo === "robots" || erro.motivo === "conteudo" || erro.status === 403 || erro.status === 429) {
            return { tipo: "bloqueio", motivo: erro.message };
          }
        }
        return { tipo: "falha", motivo: (erro as Error).message };
      }
    }
    try {
      // interpretarFicha exige o "Número do imóvel": sem ele não dá para conferir de quem é a ficha.
      const ficha = interpretarFicha(html);
      if (ficha.numero_imovel !== id13) {
        return { tipo: "falha", motivo: `a ficha devolvida é de outro imóvel (${ficha.numero_imovel})` };
      }
      return { tipo: "ok", ficha };
    } catch (erro) {
      if (erro instanceof ErroFicha && /anti-rob/.test(erro.message)) return { tipo: "bloqueio", motivo: erro.message };
      return { tipo: "falha", motivo: (erro as Error).message };
    }
  }

  return {
    id: "caixa_csv",
    nome: "Caixa: Lista de Imóveis (CSV oficial)",
    tipo: "banco_publico",
    acesso: "arquivo_oficial",
    finalidade: "vitrine",
    url: "https://venda-imoveis.caixa.gov.br/",
    // Fotos: capa pelo padrão de URL (ou a galeria da ficha). Documentos: o PDF da matrícula da
    // ficha (a lista de editais e anexos não é coletada; ver ficha.ts).
    // Ocupação: a Caixa não publica em campo (o "Situação" da ficha está comentado no HTML).
    capacidades: { fotos: true, documentos: true, ocupacao: false, listaCompleta: true },
    volumeMinimo: config.volumeMinimo ?? 5000,

    async *coletar(op) {
      const escopo = op.uf ?? "geral";
      const { texto, origem } = await lerLista(op, config.timeoutListaMs ?? (op.uf ? 120_000 : 300_000));
      const lista = interpretarLista(texto);
      const hoje = agora();
      op.informar({ geradoEm: lista.geradoEm, origem, totalNaFonte: lista.registros.length });
      const tGerado = instanteDe(lista.geradoEm);
      if (tGerado !== null && tGerado - hoje.getTime() > 2 * DIA_MS) {
        throw new Error(`Lista da Caixa recusada: "Data de geração" ${lista.geradoEm} está no futuro (hoje é ${hojeBrasilia(hoje)}).`);
      }
      const idade = idadeDias(lista.geradoEm, hoje);
      if (idade > 15) op.informar({ aviso: `Lista gerada em ${lista.geradoEm}, há ${Math.floor(idade)} dias.` });
      if (lista.colunasExtras.length > 0) op.informar({ aviso: `Colunas novas no CSV (ignoradas): ${lista.colunasExtras.join(", ")}.` });
      if (!op.arquivo && op.uf) {
        const outras = lista.registros.filter((r) => normalizarUf(r.campos.uf) !== op.uf).length;
        if (outras > 0) throw new Error(`Lista da UF ${op.uf} recusada: ${outras} linha(s) de outra UF (arquivo errado?).`);
      }

      const pastaFichas = config.fichasLocais !== undefined ? config.fichasLocais : (process.env.LUNETA_CAIXA_FICHAS || null);
      const verificar = config.verificarFotos ?? process.env.LUNETA_CAIXA_VERIFICAR_FOTOS === "1";
      const caminho = caminhoCache();
      // O cache abre antes de sair qualquer registro: se ele não abrir (corrompido, travado,
      // apagado com a cópia ainda lá), a coleta para aqui com ErroCache e nada é gravado.
      let cache: CacheCaixa | null = caminho ? abrirCacheDisco(caminho) : null;
      const contagem = { fichas: 0, fichasFalhas: 0, fichasDegradadas: 0, fotos: 0, fotosFalhas: 0, fotosAvisos: 0 };
      let falhou = false;
      try {
        const anterior = cache ? cache.lerLista(escopo) : null;
        const conferida = conferirLista(lista, {
          uf: op.uf ?? null,
          ultimaUf: op.uf ? null : ultimaUfEsperada(config, anterior),
          anterior,
          agora: hoje,
        });
        for (const aviso of conferida.avisos) op.informar({ aviso });

        if (!caminho) {
          op.informar({ aviso: "Cache da Caixa desligado: esta coleta não usa as fichas e fotos guardadas. Numa base que já tinha dados de ficha, matrícula, CEP, cartório, documentos e fotos da ficha são regravados vazios." });
        }
        if (!cache && (op.detalhes || verificar)) cache = cacheEmMemoria();

        const desconhecidas = new Map<string, number>();
        for (const r of lista.registros) {
          if (r.problema) continue; // linha com colunas deslocadas: a "modalidade" dela não é a modalidade
          const m = colapsarEspacos(r.campos.modalidade);
          if (!MODALIDADES_CONHECIDAS.includes(m)) desconhecidas.set(m, (desconhecidas.get(m) ?? 0) + 1);
        }
        for (const [m, n] of desconhecidas) op.informar({ aviso: `Modalidade nova no CSV: ${JSON.stringify(m)} (${n} linha(s)); classificada como ${classificarModalidade(m).modalidade}.` });
        const recuperadas = lista.registros.filter((r) => r.recuperada);
        if (recuperadas.length > 0) {
          const onde = [...new Set(recuperadas.map((r) => r.recuperada))].join("; ");
          const linhas = recuperadas.slice(0, 5).map((r) => r.linhaArquivo).join(", ");
          op.informar({ aviso: `${recuperadas.length} linha(s) com ";" a mais recuperada(s), excedente juntado a ${onde} (linha ${linhas}${recuperadas.length > 5 ? "..." : ""}).` });
        }
        const quebradas = lista.registros.filter((r) => r.problema);
        if (quebradas.length > 0) {
          const linhas = quebradas.slice(0, 5).map((r) => r.linhaArquivo).join(", ");
          op.informar({ aviso: `${quebradas.length} linha(s) com número de colunas diferente do cabeçalho e não recuperáveis (linha ${linhas}${quebradas.length > 5 ? "..." : ""}): viram registro inválido e desligam a marcação de removidos nesta coleta.` });
        }

        let fichasAtivas = Boolean(op.detalhes);
        let fotosAtivas = verificar;
        let ultimaFicha = Number.NEGATIVE_INFINITY;
        let falhasSeguidas = 0;
        let degradadasSeguidas = 0;
        const naUf = (r: (typeof lista.registros)[number]): boolean => !op.uf || normalizarUf(r.campos.uf) === op.uf;
        if (fichasAtivas || fotosAtivas) {
          const alcance = Math.min(op.limite ?? Number.POSITIVE_INFINITY, lista.registros.filter(naUf).length);
          const segundos = Math.max(intervaloFicha, INTERVALO_HOST_MS) / 1000;
          // Fichas e fotos são do mesmo host: o cliente espaça TODAS as requisições.
          const porImovel = (fichasAtivas && !pastaFichas ? 1 : 0) + (fotosAtivas ? HEAD_POR_IMOVEL : 0);
          const horas = (alcance * porImovel * segundos) / 3600;
          op.log(
            `Caixa: ${[fichasAtivas ? "fichas" : "", fotosAtivas ? "fotos" : ""].filter(Boolean).join(" e ")} ligadas para até ${alcance} imóvel(is)` +
              `${pastaFichas ? ` (fichas da pasta ${pastaFichas})` : ""}` +
              `${porImovel > 0 ? `; sem nada no cache, ~${horas.toFixed(1)} h (${porImovel} requisição(ões) por imóvel, ${segundos} s entre elas)` : ""}. ` +
              `Só busca imóvel novo, alterado ou com ficha de mais de ${maxDiasFicha} dias.`,
          );
          if (fotosAtivas && !op.uf && !op.limite) {
            const horasFotos = (alcance * HEAD_POR_IMOVEL * segundos) / 3600;
            op.informar({ aviso: `Verificação de fotos ligada na lista inteira, sem --uf nem --limite: pelo menos ${HEAD_POR_IMOVEL} HEAD por imóvel a ${segundos} s, ~${horasFotos.toFixed(1)} h só de fotos na primeira vez. Prefira --uf ou --limite.` });
          }
        }

        for (const r of lista.registros) {
          if (op.sinal?.aborted) throw new Error("Coleta cancelada; nada foi gravado.");
          let id13: string | null = null;
          try {
            id13 = idTreze(r.campos.numero);
          } catch {
            id13 = null;
          }
          // Fora da UF pedida o núcleo descarta: não gaste requisição com ele.
          if (!naUf(r)) id13 = null;
          let detalhe = id13 && cache ? cache.ler(id13) : null;

          if (id13 && cache && fichasAtivas && !r.problema) {
            const base = baseDaLinha(r.campos);
            const momento = agora();
            const velha = !detalhe?.ficha || idadeDias(detalhe.ficha_em, momento) > maxDiasFicha ||
              (detalhe.versao_parser ?? 0) < VERSAO_PARSER_FICHA || !fichaAtual(detalhe, base);
            const falhouHoje = idadeDias(detalhe?.falha_em ?? null, momento) < 1;
            if (velha && !falhouHoje) {
              if (!pastaFichas) {
                const espera = ultimaFicha + intervaloFicha - Date.now();
                if (espera > 0) await esperar(espera);
                ultimaFicha = Date.now();
              }
              const numero = String(Number(id13));
              const resultado = await buscarFicha(op, numero, id13, pastaFichas);
              contagem.fichas++;
              if (resultado.tipo === "ok") {
                falhasSeguidas = 0;
                // Ficha parcial ou de layout novo nunca apaga dado estável de uma leitura anterior.
                const { ficha, herdados } = herdarEstaveis(detalhe?.ficha, resultado.ficha);
                if (herdados.length > 0 || fichaSemDadosEstaveis(ficha)) {
                  contagem.fichasDegradadas++;
                  degradadasSeguidas++;
                  if (contagem.fichasDegradadas <= 5) {
                    const oQue = herdados.length > 0 ? `veio sem ${herdados.join(", ")}; mantido o da leitura anterior` : "veio sem matrícula, comarca e CEP";
                    op.informar({ aviso: `Ficha ${numero}: ${oQue} (layout mudou?).` });
                  }
                  if (degradadasSeguidas >= maxFichasDegradadas) {
                    fichasAtivas = false;
                    op.informar({ aviso: `Fichas desligadas nesta coleta (${degradadasSeguidas} fichas degradadas seguidas: layout mudou?). Os dados anteriores foram mantidos; confira o parser (ficha.ts).` });
                  }
                } else {
                  degradadasSeguidas = 0;
                }
                cache.gravarFicha(id13, ficha, base, agora());
                detalhe = cache.ler(id13);
              } else {
                contagem.fichasFalhas++;
                falhasSeguidas++;
                cache.gravarFalha(id13, resultado.motivo, agora());
                if (resultado.tipo === "bloqueio" || falhasSeguidas >= maxFalhasSeguidas) {
                  fichasAtivas = false;
                  op.informar({ aviso: `Fichas desligadas nesta coleta (${resultado.tipo === "bloqueio" ? "bloqueio" : `${falhasSeguidas} falhas seguidas`}): ${resultado.motivo}. O CSV e as fichas já guardadas continuam valendo.` });
                } else if (contagem.fichasFalhas <= 5) {
                  op.informar({ aviso: `Ficha ${numero}: ${resultado.motivo}` });
                }
              }
              if (contagem.fichas % 100 === 0) op.log(`Caixa: ${contagem.fichas} ficha(s) lida(s), ${contagem.fichasFalhas} falha(s).`);
            }
          }

          if (id13 && cache && fotosAtivas && !r.problema && idadeDias(detalhe?.fotos_em ?? null, agora()) > maxDiasFotos) {
            const resultado = await verificarFotos(op.http, id13, { maxSlots: config.maxSlotsFotos, agora, sinal: op.sinal });
            contagem.fotos++;
            if (resultado.tipo === "ok") {
              cache.gravarFotos(id13, resultado.fotos, agora());
              detalhe = cache.ler(id13);
              if (resultado.aviso && ++contagem.fotosAvisos <= 5) op.informar({ aviso: `Fotos ${id13}: ${resultado.aviso}.` });
            } else {
              contagem.fotosFalhas++;
              if (resultado.tipo === "bloqueio") {
                fotosAtivas = false;
                op.informar({ aviso: `Verificação de fotos desligada nesta coleta: ${resultado.motivo}.` });
              }
            }
          }

          yield { linha: r.campos, linhaArquivo: r.linhaArquivo, problema: r.problema, detalhe };
        }
        // Lista inteira entregue: guarda o resumo para a checagem da próxima (não vale com --limite,
        // que interrompe o laço antes daqui). Uma lista mais antiga não substitui a mais nova.
        if (cache && (!anterior || lista.geradoEm >= anterior.gerado_em)) cache.gravarLista(escopo, conferida.resumo);
      } catch (erro) {
        falhou = true;
        throw erro;
      } finally {
        if (cache && !falhou && contagem.fichas + contagem.fotos > 0) {
          try {
            const copia = cache.copiaDeSeguranca();
            if (copia) op.log(`Caixa: cópia de segurança do cache em ${copia}.`);
          } catch (erro) {
            op.informar({ aviso: `Cópia de segurança do cache da Caixa falhou: ${(erro as Error).message}.` });
          }
        }
        cache?.fechar();
        if (contagem.fichas > 0) {
          const degradadas = contagem.fichasDegradadas > 0 ? `, ${contagem.fichasDegradadas} degradada(s)` : "";
          op.informar({ aviso: `Fichas: ${contagem.fichas} buscada(s), ${contagem.fichasFalhas} falha(s)${degradadas}.` });
        }
        if (contagem.fotos > 0) op.informar({ aviso: `Fotos: ${contagem.fotos} imóvel(is) verificado(s), ${contagem.fotosFalhas} falha(s).` });
        if (contagem.fotosAvisos > 5) op.informar({ aviso: `Fotos: ${contagem.fotosAvisos} slot(s) redirecionado(s) para outra URL, não confirmado(s).` });
      }
    },

    normalizar: normalizarCaixa,
  };
}

/** Conector registrado (configuração por variáveis de ambiente). */
export const caixaCsv = criarConectorCaixa();
