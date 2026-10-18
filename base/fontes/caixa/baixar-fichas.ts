/**
 * Baixa as fichas da Caixa (página detalhe-imovel.asp, em HTML) para uma pasta, sem gravar no banco.
 * Serve para ler a ficha (matrícula, comarca, ofício, inscrição imobiliária, regras de despesas...) de
 * onde a rede alcança a Caixa (uma rede no Brasil: o PC do dono, com `node base/coleta-pc.mjs`) e depois aplicar no banco
 * local com `npm run base:fichas -- --arquivo <pasta>/fichas.json`.
 *
 * Sempre pelo cliente educado da base: User-Agent identificado, robots.txt, 2 s entre páginas,
 * retentativas. Página de desafio anti-robô NÃO é contornada: conta como bloqueio, e 5 bloqueios
 * seguidos param tudo.
 *
 *   node --experimental-strip-types base/fontes/caixa/baixar-fichas.ts --ids 1444419640129,8444402395965 --saida fichas
 *   node --experimental-strip-types base/fontes/caixa/baixar-fichas.ts --uf RJ --quantidade 200 --saida fichas
 *   node --experimental-strip-types base/fontes/caixa/baixar-fichas.ts --todas [--uf RJ] [--limite 500] --saida fichas
 *   node --experimental-strip-types base/fontes/caixa/baixar-fichas.ts --so-regravar --saida fichas
 *
 * - `--uf` sozinho: os ids da UF no instantâneo do site (base/saida/site/imoveis.json.gz), na ordem dele, com
 *   `--quantidade` (padrão 50) e `--inicio`.
 * - `--todas`: todos os ids da Caixa do instantâneo (ou só os da `--uf`), em ordem de prioridade (`ordenarPorPrioridade`):
 *   primeiro os com data de praça mais próxima, depois Leilão SFI, Licitação Aberta, Venda Online e Venda Direta.
 * - `--limite N`: no máximo N fichas novas nesta execução (em qualquer modo).
 * - **Retomada** (em qualquer modo): o id cujo `<id13>.html` já está na pasta e é uma ficha válida desse imóvel é pulado.
 *   O id que falhou de forma definitiva (página sem a ficha, HTTP 404/410) fica em `falhas.json` e é pulado por 7 dias
 *   (`--refazer-falhas` tenta de novo). Erro de rede e bloqueio não ficam: são tentados na próxima vez.
 * - `fichas.json` é regravado a cada 100 fichas novas e no fim, a partir de TODOS os HTML válidos da pasta (os de
 *   execuções anteriores também), e ao parar com Ctrl+C. Uma interrupção perde no máximo a ficha em andamento.
 * - Para depois de 5 bloqueios seguidos (desafio anti-robô, robots.txt, HTTP 403/429) e de 25 falhas seguidas (a página
 *   pode ter mudado: essas 25 não vão para `falhas.json`). Sem conexão (o robots.txt não abre por erro de rede, ou as
 *   falhas seguidas são de rede) a parada é "sem_conexao", que não é recusa da Caixa.
 *
 * Saída: <saida>/<id13>.html, <saida>/fichas.json ({ lidas_em, total, lida_em_por_id, fichas }: os campos lidos de cada
 * ficha, já com a máscara LGPD do parser; é o que pode ser publicado, sem o HTML da Caixa), <saida>/resumo.json (esta
 * execução: ok, bloqueio, falha, pulados, restantes, parada) e <saida>/falhas.json.
 * `lidas_em` é a leitura mais antiga do arquivo; `lida_em_por_id`, o momento de cada uma (a data do HTML na pasta).
 * Código de saída: 0 terminou, 3 parou por bloqueio, 4 parou por falhas seguidas, 5 sem conexão, 130 interrompido
 * (Ctrl+C), 2 uso.
 *
 * Não importa o conector (index.ts): ele traz o node:sqlite, que o Node 22.6 a 22.12 só abre com flag. Assim o
 * script roda em qualquer Node a partir do 22.6.
 */
import { readdirSync, readFileSync } from "node:fs";
import { copyFile, mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import { criarClienteHttp, ErroHttp, type ClienteHttp } from "../../util/http.ts";
import { BASE_CAIXA, ErroFicha, fichaBloqueada, interpretarFicha, type FichaCaixa } from "./ficha.ts";
import { decodificarLista } from "./lista.ts";

export const INSTANTANEO_PADRAO = "base/saida/site/imoveis.json.gz";
/** Mínimo entre duas páginas da Caixa (o cliente HTTP espaça os inícios de requisição). */
export const INTERVALO_MS = 2000;
export const BLOQUEIOS_PARA_PARAR = 5;
export const FALHAS_PARA_PARAR = 25;
export const REGRAVAR_A_CADA = 100;
/** Quanto tempo uma falha definitiva (página sem ficha, 404) fica sem nova tentativa. */
export const PAUSA_DA_FALHA_MS = 7 * 24 * 3600 * 1000;
/**
 * Depois de uma parada por recusa da Caixa (anti-robô, 403/429, robots.txt), a próxima execução espera isto antes de
 * pedir fichas de novo: rodar em seguida, várias vezes, seria insistir com quem já disse não.
 */
export const PAUSA_DEPOIS_DO_BLOQUEIO_MS = 2 * 3600 * 1000;
/** De quantos em quantos arquivos a conferência da pasta (na retomada) diz em que ponto está. */
export const AVISO_DA_CONFERENCIA = 2000;
/** Estimativa por ficha antes de medir: 2 s de intervalo mais a resposta. */
export const SEGUNDOS_POR_FICHA = 2.5;

export const urlFichaCaixa = (id13: string): string => `${BASE_CAIXA}/sistema/detalhe-imovel.asp?hdnimovel=${id13}`;

const ARQUIVO_HTML = /^(\d{13})\.html$/;

// ---------------------------------------------------------------------------------------------------------------------
// Instantâneo e prioridade

/** Um imóvel da Caixa no instantâneo do site, com o que a prioridade usa. */
export interface ItemFicha {
  id13: string;
  uf: string;
  /** Data da praça (ISO), quando o instantâneo tem. */
  dataPraca: string | null;
  /** venda_direta | venda_online | licitacao_aberta | leilao */
  modalidade: string | null;
}

interface InstantaneoBruto {
  colunas: { id: string[]; uf: string[]; dataPraca?: (string | null)[]; modalidade?: (string | null)[] };
}

/** Os imóveis da Caixa do instantâneo (`imoveis.json.gz`, em colunas), na ordem do arquivo. */
export function lerInstantaneo(bytesGz: Uint8Array): ItemFicha[] {
  const bruto = JSON.parse(gunzipSync(bytesGz).toString("utf8")) as InstantaneoBruto;
  const c = bruto.colunas;
  if (!c || !Array.isArray(c.id) || !Array.isArray(c.uf)) throw new Error("instantâneo sem as colunas id e uf");
  const itens: ItemFicha[] = [];
  c.id.forEach((id, i) => {
    const m = /^caixa-(\d{13})$/.exec(id);
    if (!m?.[1]) return;
    itens.push({ id13: m[1], uf: c.uf[i] ?? "", dataPraca: c.dataPraca?.[i] ?? null, modalidade: c.modalidade?.[i] ?? null });
  });
  return itens;
}

/** Leilão SFI e Licitação Aberta têm data marcada (que a ficha traz); as vendas, não. */
const PESO_MODALIDADE: Record<string, number> = { leilao: 0, licitacao_aberta: 1, venda_online: 2, venda_direta: 3 };

/**
 * Ordem de prioridade: primeiro os com data de praça mais próxima (de ontem em diante, da mais cedo para a mais tarde);
 * depois os demais (sem data ou com data já passada), por modalidade: Leilão SFI, Licitação Aberta, Venda Online, Venda
 * Direta, outras. No empate, a ordem do instantâneo.
 */
export function ordenarPorPrioridade(itens: readonly ItemFicha[], agora: Date): ItemFicha[] {
  const desde = agora.getTime() - 24 * 3600 * 1000;
  return itens
    .map((item, i) => {
      const t = item.dataPraca ? Date.parse(item.dataPraca) : Number.NaN;
      return { item, i, data: Number.isFinite(t) && t >= desde ? t : null, peso: PESO_MODALIDADE[item.modalidade ?? ""] ?? 4 };
    })
    .sort((a, b) => {
      if (a.data !== null && b.data !== null) return a.data - b.data || a.i - b.i;
      if (a.data !== null) return -1;
      if (b.data !== null) return 1;
      return a.peso - b.peso || a.i - b.i;
    })
    .map((x) => x.item);
}

export interface PedidoIds {
  ids?: string;
  uf?: string;
  todas?: boolean;
  quantidade?: number;
  inicio?: number;
}

/** Normaliza "1444419640129, 8444402395965" (ou sem os zeros à esquerda) em ids de 13 dígitos. */
export function idsDaLista(texto: string): string[] {
  return texto
    .split(",")
    .map((s) => s.trim().replace(/\D/g, ""))
    .filter((s) => s.length > 0 && s.length <= 13)
    .map((s) => s.padStart(13, "0"));
}

/** Os ids que o pedido escolhe (sem tirar os já baixados: isso é a retomada). */
export function idsDoPedido(pedido: PedidoIds, itens: () => ItemFicha[], agora: Date): string[] {
  if (pedido.ids) return [...new Set(idsDaLista(pedido.ids))];
  const uf = pedido.uf?.trim().toUpperCase();
  if (pedido.todas) {
    const todos = itens().filter((x) => !uf || x.uf === uf);
    return [...new Set(ordenarPorPrioridade(todos, agora).map((x) => x.id13))];
  }
  if (!uf) return [];
  const inicio = pedido.inicio ?? 0;
  const daUf = itens().filter((x) => x.uf === uf).map((x) => x.id13);
  return daUf.slice(inicio, inicio + (pedido.quantidade ?? 50));
}

// ---------------------------------------------------------------------------------------------------------------------
// Pasta: fichas já baixadas, fichas.json e falhas

/** Uma ficha lida, guardada já serializada (21 mil objetos inteiros pesariam ~3× mais na memória). */
export interface FichaGuardada {
  json: string;
  /** Quando foi lida (ISO). */
  lidaEm: string;
}

/** A ficha do HTML é válida e é deste imóvel? Devolve a ficha, ou o motivo da recusa. */
export function conferirFicha(id13: string, bytes: Uint8Array): { ficha: FichaCaixa } | { motivo: string } {
  try {
    const ficha = interpretarFicha(decodificarLista(bytes));
    const numero = (ficha.numero_imovel ?? "").padStart(13, "0");
    if (numero !== id13) return { motivo: `a página é do imóvel ${ficha.numero_imovel ?? "?"}` };
    return { ficha };
  } catch (erro) {
    return { motivo: (erro as Error).message };
  }
}

/**
 * Lê todos os `<id13>.html` da pasta: os válidos entram no acervo (com a data do arquivo); os outros são listados.
 * Com 21 mil fichas a leitura leva de meio minuto a alguns minutos: `aoProgresso` é chamado a cada
 * AVISO_DA_CONFERENCIA arquivos (feitos, total), para a tela não parecer parada.
 */
export async function carregarPasta(
  pasta: string,
  aoProgresso?: (feitos: number, total: number) => void,
): Promise<{ acervo: Map<string, FichaGuardada>; invalidos: { id: string; motivo: string }[] }> {
  const acervo = new Map<string, FichaGuardada>();
  const invalidos: { id: string; motivo: string }[] = [];
  let nomes: string[];
  try {
    nomes = await readdir(pasta);
  } catch {
    return { acervo, invalidos };
  }
  const htmls = nomes.filter((nome) => ARQUIVO_HTML.test(nome)).sort();
  let feitos = 0;
  for (const nome of htmls) {
    const id = ARQUIVO_HTML.exec(nome)![1]!;
    const caminho = join(pasta, nome);
    let bytes: Buffer;
    let lidaEm: string;
    try {
      const [b, info] = await Promise.all([readFile(caminho), stat(caminho)]);
      bytes = b;
      lidaEm = info.mtime.toISOString();
    } catch (erro) {
      // arquivo preso por outro programa (antivírus) ou apagado no meio: fica para baixar de novo
      invalidos.push({ id, motivo: `não li o arquivo (${(erro as NodeJS.ErrnoException).code ?? (erro as Error).message})` });
      continue;
    } finally {
      feitos++;
      if (aoProgresso && feitos % AVISO_DA_CONFERENCIA === 0 && feitos < htmls.length) aoProgresso(feitos, htmls.length);
    }
    const r = conferirFicha(id, bytes);
    if ("motivo" in r) invalidos.push({ id, motivo: r.motivo });
    else acervo.set(id, { json: JSON.stringify(r.ficha), lidaEm });
  }
  return { acervo, invalidos };
}

/**
 * Troca o arquivo de uma vez: grava ao lado, força o disco (fsync) e renomeia. Sem o fsync, uma queda de energia logo
 * depois do rename pode deixar o arquivo novo vazio. No Windows, um antivírus pode segurar o arquivo: tenta de novo.
 */
export async function substituir(caminho: string, conteudo: string | Uint8Array): Promise<void> {
  const temporario = `${caminho}.tmp`;
  const arquivo = await open(temporario, "w");
  try {
    await arquivo.writeFile(conteudo);
    await arquivo.sync();
  } finally {
    await arquivo.close();
  }
  for (let tentativa = 1; ; tentativa++) {
    try {
      await rename(temporario, caminho);
      return;
    } catch (erro) {
      const codigo = (erro as NodeJS.ErrnoException).code;
      if (tentativa >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(codigo ?? "")) {
        if (tentativa >= 5) {
          await copyFile(temporario, caminho);
          await unlink(temporario).catch(() => undefined);
          return;
        }
        throw erro;
      }
      await new Promise((r) => setTimeout(r, 200 * tentativa));
    }
  }
}

/** Grava `fichas.json` com todas as fichas do acervo, em ordem de id (mesmo conteúdo, mesmos bytes). */
export async function gravarFichasJson(pasta: string, acervo: ReadonlyMap<string, FichaGuardada>, agora: Date = new Date()): Promise<number> {
  const ids = [...acervo.keys()].sort();
  const datas = ids.map((id) => acervo.get(id)!.lidaEm);
  const maisAntiga = datas.length ? datas.reduce((a, b) => (a < b ? a : b)) : agora.toISOString();
  const porId = JSON.stringify(Object.fromEntries(ids.map((id, i) => [id, datas[i]])));
  const fichas = ids.map((id) => `${JSON.stringify(id)}:${acervo.get(id)!.json}`).join(",");
  await substituir(join(pasta, "fichas.json"), `{"lidas_em":${JSON.stringify(maisAntiga)},"total":${ids.length},"lida_em_por_id":${porId},"fichas":{${fichas}}}`);
  return ids.length;
}

/** Refaz o `fichas.json` a partir de todos os HTML válidos da pasta. */
export async function regravarFichasJson(
  pasta: string,
  aoProgresso?: (feitos: number, total: number) => void,
): Promise<{ total: number; invalidos: { id: string; motivo: string }[] }> {
  const { acervo, invalidos } = await carregarPasta(pasta, aoProgresso);
  return { total: await gravarFichasJson(pasta, acervo), invalidos };
}

export type Falhas = Record<string, { motivo: string; em: string }>;

export async function lerFalhas(pasta: string): Promise<Falhas> {
  try {
    const f = JSON.parse(await readFile(join(pasta, "falhas.json"), "utf8")) as unknown;
    return typeof f === "object" && f !== null && !Array.isArray(f) ? (f as Falhas) : {};
  } catch {
    return {};
  }
}

/** Ids com falha definitiva há menos de 7 dias. */
export function falhasRecentes(falhas: Falhas, agora: Date): Set<string> {
  const desde = agora.getTime() - PAUSA_DA_FALHA_MS;
  return new Set(Object.entries(falhas).filter(([, f]) => Date.parse(f.em) >= desde).map(([id]) => id));
}

/** O resumo.json da execução anterior (ou null). */
export async function lerResumoAnterior(pasta: string): Promise<Partial<ResumoFichas> | null> {
  try {
    const r = JSON.parse(await readFile(join(pasta, "resumo.json"), "utf8")) as unknown;
    return typeof r === "object" && r !== null && !Array.isArray(r) ? (r as Partial<ResumoFichas>) : null;
  } catch {
    return null;
  }
}

/**
 * Se a execução anterior parou porque a Caixa recusou o acesso (não por falta de internet) há menos de
 * PAUSA_DEPOIS_DO_BLOQUEIO_MS, devolve quando a próxima tentativa fica liberada; senão, null.
 */
export function pausaDoBloqueio(anterior: Partial<ResumoFichas> | null, agora: Date): { desde: Date; ate: Date } | null {
  if (!anterior || anterior.parada !== "bloqueio" || typeof anterior.fim !== "string") return null;
  const fim = Date.parse(anterior.fim);
  if (!Number.isFinite(fim)) return null;
  const ate = fim + PAUSA_DEPOIS_DO_BLOQUEIO_MS;
  // relógio do PC voltou (fim no futuro) ou a pausa já passou: liberado
  if (fim > agora.getTime() + 60_000 || ate <= agora.getTime()) return null;
  return { desde: new Date(fim), ate: new Date(ate) };
}

/** Tira da fila o que já está na pasta e o que falhou há pouco; aplica o limite. */
export function planejar(ids: readonly string[], naPasta: ReadonlySet<string>, pular: ReadonlySet<string>, limite?: number | null) {
  let puladosNaPasta = 0;
  let puladosPorFalha = 0;
  const fila: string[] = [];
  for (const id of ids) {
    if (naPasta.has(id)) puladosNaPasta++;
    else if (pular.has(id)) puladosPorFalha++;
    else fila.push(id);
  }
  const corte = limite && limite > 0 ? fila.slice(0, limite) : fila;
  return { fila: corte, puladosNaPasta, puladosPorFalha, foraDoLimite: fila.length - corte.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// Texto do progresso

const numero = (n: number) => n.toLocaleString("pt-BR");

/** 45 → "menos de 1 min"; 4.000 → "1 h 07 min"; 100.000 → "1 dia 3 h". */
export function formatarDuracao(segundos: number): string {
  const min = Math.round(segundos / 60);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, "0")} min`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"} ${h % 24} h`;
}

/** "~1 h 07 min", ou "menos de 1 min" (sem o "~"). */
export function cerca(segundos: number): string {
  const t = formatarDuracao(segundos);
  return t.startsWith("menos") ? t : `~${t}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Coleta

/** Pedido de parada (Ctrl+C): a ficha em andamento é cancelada e o fichas.json é gravado antes de sair. */
export interface Parada {
  readonly pedida: boolean;
  readonly sinal: AbortSignal;
  pedir(): void;
}

export function criarParada(): Parada {
  const controle = new AbortController();
  return {
    get pedida() {
      return controle.signal.aborted;
    },
    sinal: controle.signal,
    pedir: () => controle.abort(),
  };
}

/** Espera que termina antes se a parada for pedida (para o Ctrl+C não esperar o intervalo nem as retentativas). */
export function esperaInterrompivel(parada: Parada): (ms: number) => Promise<void> {
  return (ms) =>
    new Promise((resolver) => {
      if (parada.pedida) return resolver();
      const t = setTimeout(fim, ms);
      function fim() {
        clearTimeout(t);
        parada.sinal.removeEventListener("abort", fim);
        resolver();
      }
      parada.sinal.addEventListener("abort", fim, { once: true });
    });
}

/** "sem_conexao": o site não abriu (rede, DNS, certificado); não é recusa da Caixa e não pede pausa. */
export type MotivoParada = "fim" | "bloqueio" | "sem_conexao" | "falhas" | "interrompido";

export interface ResumoFichas {
  inicio: string;
  fim: string;
  /** Ids pedidos (antes de tirar os já baixados). */
  pedidos: number;
  /** Fichas a baixar nesta execução. */
  fila: number;
  puladosNaPasta: number;
  puladosPorFalha: number;
  foraDoLimite: number;
  /** Fichas válidas na pasta no fim (as desta execução e as anteriores): é o que o fichas.json tem. */
  naPasta: number;
  /** Dos pedidos, quantos a próxima execução ainda vai tentar (nem na pasta, nem com falha dos últimos 7 dias). */
  restantes: number;
  /** Dos pedidos, quantos estão fora por falha definitiva recente (página sem a ficha, 404): voltam em 7 dias. */
  comFalhaGuardada: number;
  ok: string[];
  bloqueio: { id: string; motivo: string }[];
  falha: { id: string; motivo: string }[];
  parada: MotivoParada;
  /** Com parada por bloqueio, sem conexão ou falhas: o motivo da última tentativa (o que fez parar). */
  motivoDaParada?: string;
}

export interface OpcoesBaixar {
  ids: readonly string[];
  saida: string;
  http: ClienteHttp;
  log?: (linha: string) => void;
  parada?: Parada;
  limite?: number | null;
  refazerFalhas?: boolean;
  regravarACada?: number;
  agora?: () => Date;
  /** Relógio para a estimativa de tempo (ms). */
  relogio?: () => number;
}

function ehBloqueio(erro: unknown): boolean {
  return erro instanceof ErroHttp && (erro.motivo === "robots" || erro.motivo === "conteudo" || erro.status === 403 || erro.status === 429);
}

/** O robots.txt não abriu por erro de rede ou tempo esgotado (não por recusa do site): é falta de conexão. */
export function ehSemConexao(erro: unknown): boolean {
  if (!(erro instanceof ErroHttp)) return false;
  if (erro.motivo === "rede" || erro.motivo === "timeout") return true;
  return erro.motivo === "robots" && /inacess[ií]vel \((falha de rede|tempo esgotado)/i.test(erro.message);
}

/** Falha que não adianta repetir já: a página não é a ficha (imóvel saiu da venda?) ou não existe. */
function ehDefinitiva(erro: unknown): boolean {
  return erro instanceof ErroFicha || (erro instanceof ErroHttp && (erro.status === 404 || erro.status === 410));
}

/** Baixa as fichas pedidas que ainda não estão na pasta, com retomada, regravação periódica e parada educada. */
export async function baixarFichas(op: OpcoesBaixar): Promise<ResumoFichas> {
  const log = op.log ?? console.log;
  const agora = op.agora ?? (() => new Date());
  const relogio = op.relogio ?? Date.now;
  const parada = op.parada ?? criarParada();
  const regravarACada = op.regravarACada ?? REGRAVAR_A_CADA;
  const saida = op.saida;
  const inicio = agora();
  await mkdir(saida, { recursive: true });
  for (const nome of readdirSync(saida)) if (nome.endsWith(".tmp")) await unlink(join(saida, nome)).catch(() => undefined);

  log(`Conferindo as fichas que já estão em ${saida}...`);
  const { acervo, invalidos } = await carregarPasta(saida, (feitos, de) => log(`  conferidas ${numero(feitos)} de ${numero(de)}...`));
  if (invalidos.length) log(`${numero(invalidos.length)} arquivo(s) da pasta não são uma ficha válida e serão baixados de novo, se pedidos.`);
  const falhas = await lerFalhas(saida);
  const pular = op.refazerFalhas ? new Set<string>() : falhasRecentes(falhas, inicio);
  const plano = planejar(op.ids, new Set(acervo.keys()), pular, op.limite);
  const total = plano.fila.length;
  log(
    `Fichas: ${numero(op.ids.length)} pedidas; ${numero(plano.puladosNaPasta)} já na pasta (puladas)` +
      (plano.puladosPorFalha ? `; ${numero(plano.puladosPorFalha)} com falha nos últimos 7 dias (puladas; --refazer-falhas tenta de novo)` : "") +
      (plano.foraDoLimite ? `; ${numero(plano.foraDoLimite)} ficam para depois (limite de ${numero(op.limite ?? 0)})` : "") +
      `. A baixar agora: ${numero(total)}` +
      (total ? ` (previsão: ${cerca(total * SEGUNDOS_POR_FICHA)}; 2 s entre páginas). Pode parar com Ctrl+C e retomar depois.` : "."),
  );

  const resumo: ResumoFichas = {
    inicio: inicio.toISOString(),
    fim: "",
    pedidos: op.ids.length,
    fila: total,
    puladosNaPasta: plano.puladosNaPasta,
    puladosPorFalha: plano.puladosPorFalha,
    foraDoLimite: plano.foraDoLimite,
    naPasta: acervo.size,
    restantes: 0,
    comFalhaGuardada: 0,
    ok: [],
    bloqueio: [],
    falha: [],
    parada: "fim",
  };
  let bloqueiosSeguidos = 0;
  /** A última recusa foi falta de conexão (robots.txt sem rede), não a Caixa dizendo não. */
  let ultimoBloqueioSemConexao = false;
  let falhasSeguidas: string[] = [];
  let ultimaFalhaSemConexao = false;
  let ultimoMotivo = "";
  let novasDesdeGravacao = 0;
  let feitas = 0;
  const comeco = relogio();

  const gravar = async () => {
    resumo.naPasta = await gravarFichasJson(saida, acervo, agora());
    novasDesdeGravacao = 0;
  };

  for (const id of plano.fila) {
    if (parada.pedida) {
      resumo.parada = "interrompido";
      break;
    }
    let linha: string;
    try {
      const resposta = await op.http.requisitar(urlFichaCaixa(id), {
        cabecalhos: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
        validar: (r) => fichaBloqueada(decodificarLista(r.bytes)),
        sinal: parada.sinal,
      });
      // confere que é mesmo a ficha deste imóvel (exige "Número do imóvel"); só então grava
      const r = conferirFicha(id, resposta.bytes);
      if ("motivo" in r) throw new ErroFicha(r.motivo);
      await substituir(join(saida, `${id}.html`), resposta.bytes);
      acervo.set(id, { json: JSON.stringify(r.ficha), lidaEm: agora().toISOString() });
      delete falhas[id];
      resumo.ok.push(id);
      bloqueiosSeguidos = 0;
      falhasSeguidas = [];
      novasDesdeGravacao++;
      linha = `ok · matrícula ${r.ficha.matriculas.join(", ") || "—"} · ${r.ficha.comarca ?? "sem comarca"}`;
    } catch (erro) {
      if ((erro instanceof ErroHttp && erro.motivo === "cancelado") || parada.pedida) {
        resumo.parada = "interrompido";
        break;
      }
      const motivo = (erro as Error).message;
      ultimoMotivo = motivo;
      const semConexao = ehSemConexao(erro);
      if (ehBloqueio(erro)) {
        resumo.bloqueio.push({ id, motivo });
        bloqueiosSeguidos++;
        ultimoBloqueioSemConexao = semConexao;
        falhasSeguidas = [];
        linha = `${semConexao ? "SEM CONEXÃO" : "BLOQUEIO"} · ${motivo}`;
      } else {
        resumo.falha.push({ id, motivo });
        bloqueiosSeguidos = 0;
        falhasSeguidas.push(id);
        ultimaFalhaSemConexao = semConexao;
        if (ehDefinitiva(erro)) falhas[id] = { motivo, em: agora().toISOString() };
        linha = `${semConexao ? "sem conexão" : "falha"} · ${motivo}`;
      }
    }
    feitas++;
    const porFicha = feitas >= 5 ? (relogio() - comeco) / 1000 / feitas : SEGUNDOS_POR_FICHA;
    const faltam = total - feitas;
    const pct = ((feitas / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    log(`[${numero(feitas)}/${numero(total)} · ${pct}%${faltam ? ` · faltam ${cerca(faltam * porFicha)}` : ""}] ${id}: ${linha}`);

    if (bloqueiosSeguidos >= BLOQUEIOS_PARA_PARAR) {
      resumo.motivoDaParada = ultimoMotivo;
      if (ultimoBloqueioSemConexao) {
        resumo.parada = "sem_conexao";
        log(`PARADA: o site da Caixa não abriu (${BLOQUEIOS_PARA_PARAR} tentativas seguidas sem conexão). Não é recusa da Caixa: confira a internet.`);
      } else {
        resumo.parada = "bloqueio";
        log(`PARADA: ${BLOQUEIOS_PARA_PARAR} bloqueios seguidos. A Caixa está recusando este acesso agora; o coletor não contorna anti-robô.`);
      }
      break;
    }
    if (falhasSeguidas.length >= FALHAS_PARA_PARAR) {
      // tantas seguidas sugerem mudança na página, instabilidade ou internet caída, não imóveis fora da venda:
      // não ficam marcadas
      for (const f of falhasSeguidas) delete falhas[f];
      resumo.motivoDaParada = ultimoMotivo;
      if (ultimaFalhaSemConexao) {
        resumo.parada = "sem_conexao";
        log(`PARADA: ${FALHAS_PARA_PARAR} fichas seguidas sem conexão (a internet caiu ou o site da Caixa saiu do ar). Essas não ficam marcadas como falha.`);
      } else {
        resumo.parada = "falhas";
        log(`PARADA: ${FALHAS_PARA_PARAR} falhas seguidas (a página da Caixa pode ter mudado ou estar fora do ar). Essas não ficam marcadas como falha.`);
      }
      break;
    }
    if (novasDesdeGravacao >= regravarACada) {
      await gravar();
      log(`fichas.json regravado: ${numero(resumo.naPasta)} fichas na pasta.`);
    }
  }

  await gravar();
  await substituir(join(saida, "falhas.json"), JSON.stringify(falhas, null, 1));
  resumo.fim = agora().toISOString();
  // o que a próxima execução ainda vai tentar: sem as da pasta e sem as falhas dos últimos 7 dias (que ela pula)
  const comFalha = falhasRecentes(falhas, agora());
  for (const id of new Set(op.ids)) {
    if (acervo.has(id)) continue;
    if (comFalha.has(id)) resumo.comFalhaGuardada++;
    else resumo.restantes++;
  }
  await substituir(join(saida, "resumo.json"), JSON.stringify(resumo, null, 1));
  const duracao = formatarDuracao((relogio() - comeco) / 1000);
  const comoParou: Record<MotivoParada, string> = { fim: "terminou", interrompido: "interrompido", bloqueio: "parou: bloqueio", sem_conexao: "parou: sem conexão", falhas: "parou: falhas" };
  log(
    `Fim das fichas (${comoParou[resumo.parada]}, ${duracao}): ` +
      `${numero(resumo.ok.length)} nova(s), ${numero(resumo.bloqueio.length)} bloqueio(s), ${numero(resumo.falha.length)} falha(s). ` +
      `fichas.json com ${numero(resumo.naPasta)} fichas.`,
  );
  return resumo;
}

// ---------------------------------------------------------------------------------------------------------------------
// Linha de comando

const CODIGO: Record<MotivoParada, number> = { fim: 0, bloqueio: 3, falhas: 4, sem_conexao: 5, interrompido: 130 };

export async function principal(argv: readonly string[]): Promise<number> {
  let v;
  try {
    v = parseArgs({
      args: [...argv],
      options: {
        ids: { type: "string" },
        uf: { type: "string" },
        todas: { type: "boolean" },
        quantidade: { type: "string" },
        inicio: { type: "string" },
        limite: { type: "string" },
        saida: { type: "string", default: "fichas" },
        instantaneo: { type: "string", default: INSTANTANEO_PADRAO },
        "refazer-falhas": { type: "boolean" },
        "so-regravar": { type: "boolean" },
      },
    }).values;
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const saida = v.saida ?? "fichas";
  if (v["so-regravar"]) {
    const r = await regravarFichasJson(saida);
    console.log(`fichas.json regravado com ${numero(r.total)} fichas${r.invalidos.length ? ` (${r.invalidos.length} HTML inválidos de fora)` : ""}.`);
    return 0;
  }
  const inteiro = (s: string | undefined) => (s === undefined ? undefined : Number.parseInt(s, 10));
  const ids = idsDoPedido(
    { ids: v.ids, uf: v.uf, todas: v.todas, quantidade: inteiro(v.quantidade), inicio: inteiro(v.inicio) },
    () => lerInstantaneo(readFileSync(resolve(v.instantaneo ?? INSTANTANEO_PADRAO))),
    new Date(),
  );
  if (ids.length === 0) {
    console.error("Informe --ids <id13,...>, --uf <UF> [--quantidade N] [--inicio N] ou --todas [--uf UF], e opcionalmente --limite N.");
    return 2;
  }
  const parada = criarParada();
  let ultimo = 0;
  process.on("SIGINT", () => {
    // o npm repassa o mesmo Ctrl+C: dois sinais em menos de 2 s contam como um
    if (parada.pedida && Date.now() - ultimo > 2000) process.exit(130);
    if (!parada.pedida) console.log("Ctrl+C: parando e gravando o fichas.json (aperte de novo para sair já).");
    ultimo = Date.now();
    parada.pedir();
  });
  const http = criarClienteHttp({ intervaloMinimoMs: INTERVALO_MS, esperar: esperaInterrompivel(parada), log: (m) => console.log(m) });
  const limite = inteiro(v.limite);
  const r = await baixarFichas({ ids, saida, http, parada, limite: limite && limite > 0 ? limite : null, refazerFalhas: v["refazer-falhas"] });
  return CODIGO[r.parada];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await principal(process.argv.slice(2));
}
