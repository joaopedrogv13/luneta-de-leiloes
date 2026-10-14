/**
 * Radar: DOU seção 3 pelo INLABS (Imprensa Nacional), avisos de leilão de imóveis.
 *
 * Fonte: serviço oficial de download, com scripts de automação publicados pela própria
 * Imprensa Nacional (github.com/Imprensa-Nacional/inlabs, public/python/inlabs-auto-download-xml.py):
 *   1. POST https://inlabs.in.gov.br/logar.php (form: email, password) → cookie
 *      `inlabs_session_cookie` no Set-Cookie da PRÓPRIA resposta (o script em bash não segue
 *      redirecionamento);
 *   2. GET https://inlabs.in.gov.br/index.php?p=AAAA-MM-DD&dl=AAAA-MM-DD-DO3.zip com o cookie e o
 *      cabeçalho `origem: 736372697074` (o que os scripts oficiais mandam); 404 = sem edição
 *      naquele dia (fim de semana, feriado). Seções: DO1, DO2, DO3 e extras DO1E/DO2E/DO3E; os
 *      avisos de leilão saem na DO3. O INLABS guarda só os últimos 4 meses.
 * O ZIP traz um XML por matéria: <article id name idOficio pubName artType pubDate artClass
 * artCategory artSize artNotes numberPage pdfPage editionNumber ... idMateria><body>
 * <Identifica/><Data/><Ementa/><Titulo/><SubTitulo/><Texto>HTML em CDATA</Texto></body></article>
 * (atributos e campos conforme o esquema dou_inlabs.article_raw do Ro-dou, GPL-3.0, usado só
 * como referência; nenhum código copiado).
 *
 * Credenciais: INLABS_EMAIL e INLABS_SENHA (conta gratuita que o dono do projeto precisa criar
 * em https://inlabs.in.gov.br). Nunca são gravadas nem aparecem em log; o cookie também não.
 *
 * Exceção ao cliente HTTP do núcleo: o LOGIN usa `fetch` direto com redirect "manual", porque o
 * cliente educado segue redirecionamentos e o cookie de sessão viria no 302 (perdido no
 * caminho; conferido com servidor local). O login mantém User-Agent identificado, timeout,
 * 3 tentativas e uma pausa antes do primeiro download. Os downloads passam pelo cliente educado.
 *
 * LGPD: o parágrafo de assinatura (<p class="assina"> e "cargo") é removido antes do filtro e do
 * resumo; o resto passa pela máscara do núcleo. Avisos de resultado (cabeçalho ou corpo com
 * "arrematado por Fulano", "homologo") são descartados: não anunciam leilão e trazem nomes.
 *
 * Dia sem DOU (fim de semana, feriado, edição ainda não publicada) responde 404 e é pulado.
 * Janela inteira sem edição vale como coleta vazia legítima (sucesso) se no máximo 2 dias
 * úteis ficaram sem a seção principal; mais do que isso é suspeito e a coleta fica inválida.
 *
 * Sem teste ao vivo (rede bloqueada e sem conta). As fixtures foram construídas a partir do
 * esquema acima (não há XML real do INLABS no material); o ZIP dos testes é montado em memória.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Conector, EditalNormalizado, OpcoesColeta, Uf } from "../../../tipos.ts";
import { decodificar } from "../../../util/arquivo.ts";
import { lerDataBR } from "../../../util/data.ts";
import { colapsarEspacos, decodificarEntidades, semHtml } from "../../../util/texto.ts";
import { esperarPadrao, exigirObjeto, texto, urlOuNulo, type Esperar } from "../comum.ts";
import { diasDaJanela, janelaDoAmbiente, listaDoAmbiente, robotsLigado, type Ambiente, type Janela } from "../config.ts";
import { analisarLeilaoImovel, ehCabecalhoDeResultado, motivoSemLeilaoFuturo } from "../filtro.ts";
import { extrairDataLeilao, extrairLocal, extrairSiteLeilao, resumoRelevante } from "../texto.ts";
import { lerZip, pareceZip } from "../zip.ts";

export const URL_INLABS = "https://inlabs.in.gov.br";
const URL_LOGIN = `${URL_INLABS}/logar.php`;
/** Valor do cabeçalho `origem` dos scripts oficiais ("script" em hexadecimal). */
const ORIGEM_SCRIPT = "736372697074";
const NOME_COOKIE = "inlabs_session_cookie";
/** Dias úteis sem a seção principal que ainda contam como janela vazia legítima. */
const MAX_DIAS_UTEIS_SEM_EDICAO = 2;

/** Segunda a sexta ("AAAA-MM-DD"). Feriados não são conhecidos aqui. */
function ehDiaUtil(dia: string): boolean {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return semana >= 1 && semana <= 5;
}

// ---------------------------------------------------------------------------
// XML das matérias
// ---------------------------------------------------------------------------

export interface ArtigoDou {
  /** Atributos de <article> (id, pubName, artType, pubDate, artCategory, pdfPage, idMateria...). */
  atributos: Record<string, string>;
  identifica: string | null;
  data: string | null;
  ementa: string | null;
  titulo: string | null;
  subTitulo: string | null;
  /** HTML do corpo da matéria. */
  texto: string | null;
  /** Arquivo de origem (nome dentro do ZIP ou caminho local). */
  arquivo: string;
}

function conteudoDe(corpo: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${tag}\\s*>)`, "i").exec(corpo);
  const bruto = m?.[1];
  if (bruto === undefined) return null;
  const cdatas = [...bruto.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((c) => c[1] ?? "");
  const valor = cdatas.length > 0 ? cdatas.join("") : decodificarEntidades(bruto);
  return valor.trim() === "" ? null : valor;
}

/** Lê as matérias (<article>) de um XML do INLABS. */
export function lerArtigosDou(xml: string, arquivo: string): ArtigoDou[] {
  const artigos: ArtigoDou[] = [];
  // Comentários fora de CDATA podem citar "<article>"; o CDATA do texto fica intacto.
  const semComentarios = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g, (trecho) => (trecho.startsWith("<!--") ? "" : trecho));
  for (const m of semComentarios.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article\s*>/gi)) {
    const atributos: Record<string, string> = {};
    for (const a of (m[1] ?? "").matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      atributos[a[1] ?? ""] = decodificarEntidades(a[2] ?? a[3] ?? "");
    }
    const corpo = m[2] ?? "";
    artigos.push({
      atributos,
      identifica: conteudoDe(corpo, "Identifica"),
      data: conteudoDe(corpo, "Data"),
      ementa: conteudoDe(corpo, "Ementa"),
      titulo: conteudoDe(corpo, "Titulo"),
      subTitulo: conteudoDe(corpo, "SubTitulo"),
      texto: conteudoDe(corpo, "Texto"),
      arquivo,
    });
  }
  return artigos;
}

/** Tira assinatura e cargo do signatário (<p class="assina">, <p class="cargo">). */
export function semAssinatura(html: string): string {
  return html.replace(/<p\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:assina|cargo)\b[^"']*["'][^>]*>[\s\S]*?<\/p\s*>/gi, " ");
}

/** UF do órgão ("...Superintendência ... no Estado de São Paulo") ou do texto. */
export function ufDoArtigo(artigo: ArtigoDou): Uf | null {
  const categoria = artigo.atributos.artCategory ?? "";
  return extrairLocal(categoria).uf ?? extrairLocal(semHtml(semAssinatura(artigo.texto ?? ""))).uf;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

function artigosDoZip(bytes: Uint8Array, origem: string, avisar: (m: string) => void): ArtigoDou[] {
  const entradas = lerZip(bytes, (nome) => nome.toLowerCase().endsWith(".xml"));
  if (entradas.length === 0) throw new Error(`${origem}: ZIP sem arquivos XML (formato do INLABS mudou?).`);
  const artigos: ArtigoDou[] = [];
  let semArtigo = 0;
  for (const entrada of entradas) {
    const lidos = lerArtigosDou(decodificar(entrada.dados), entrada.nome);
    if (lidos.length === 0) semArtigo++;
    artigos.push(...lidos);
  }
  if (artigos.length === 0) throw new Error(`${origem}: nenhum <article> nos ${entradas.length} XML (formato do INLABS mudou?).`);
  if (semArtigo > 0) avisar(`${origem}: ${semArtigo} XML sem <article> ignorado(s).`);
  return artigos;
}

/** Lê .zip, .xml ou uma pasta com esses arquivos (entrada local, sem rede). */
async function artigosLocais(caminho: string, avisar: (m: string) => void): Promise<ArtigoDou[]> {
  const info = await stat(caminho);
  const arquivos = info.isDirectory()
    ? (await readdir(caminho)).filter((n) => /\.(xml|zip)$/i.test(n)).sort().map((n) => join(caminho, n))
    : [caminho];
  if (arquivos.length === 0) throw new Error(`Nenhum .xml ou .zip em ${caminho}.`);
  const artigos: ArtigoDou[] = [];
  for (const arquivo of arquivos) {
    const bytes = new Uint8Array(await readFile(arquivo));
    if (/\.zip$/i.test(arquivo)) artigos.push(...artigosDoZip(bytes, basename(arquivo), avisar));
    else {
      const lidos = lerArtigosDou(decodificar(bytes), basename(arquivo));
      if (lidos.length === 0) throw new Error(`${arquivo}: XML sem <article> (não é matéria do INLABS?).`);
      artigos.push(...lidos);
    }
  }
  return artigos;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/** Valor do cookie de sessão nos Set-Cookie da resposta, ou null. */
export function cookieDeSessao(cabecalhos: Headers): string | null {
  const lista = typeof cabecalhos.getSetCookie === "function" ? cabecalhos.getSetCookie() : [cabecalhos.get("set-cookie") ?? ""];
  for (const linha of lista) {
    const m = new RegExp(`(?:^|[;,]\\s*)${NOME_COOKIE}=([^;,\\s]+)`).exec(linha);
    if (m?.[1] && m[1] !== "deleted") return m[1];
  }
  return null;
}

export interface ConfigDouInlabs {
  janela?: Janela;
  /** Seções baixadas (padrão DO3 e DO3E, ou LUNETA_INLABS_SECOES). */
  secoes?: readonly string[];
  email?: string;
  senha?: string;
  /** `fetch` usado só no login (testes injetam um falso). */
  fetchLogin?: typeof fetch;
  /** Pausa entre o login e o primeiro download. Padrão 2 s. */
  pausaAposLoginMs?: number;
  timeoutLoginMs?: number;
  agora?: () => Date;
  ambiente?: Ambiente;
  esperar?: Esperar;
}

export function criarConectorDouInlabs(config: ConfigDouInlabs = {}): Conector<ArtigoDou> {
  const agora = config.agora ?? (() => new Date());
  const esperar = config.esperar ?? esperarPadrao;

  async function entrar(op: OpcoesColeta, email: string, senha: string): Promise<string> {
    const fazer = config.fetchLogin ?? fetch;
    const corpo = new URLSearchParams({ email, password: senha }).toString();
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const limite = new AbortController();
      const temporizador = setTimeout(() => limite.abort(), config.timeoutLoginMs ?? 30_000);
      const sinal = op.sinal ? AbortSignal.any([limite.signal, op.sinal]) : limite.signal;
      let status: number | null = null;
      try {
        const resposta = await fazer(URL_LOGIN, {
          method: "POST",
          redirect: "manual",
          credentials: "omit",
          signal: sinal,
          headers: {
            "user-agent": op.http.userAgent,
            "content-type": "application/x-www-form-urlencoded",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "pt-BR,pt;q=0.9",
            origem: ORIGEM_SCRIPT,
          },
          body: corpo,
        });
        status = resposta.status;
        await resposta.body?.cancel().catch(() => undefined);
        const cookie = cookieDeSessao(resposta.headers);
        op.log(`POST ${URL_LOGIN} → HTTP ${status}${cookie ? " (sessão aberta)" : " (sem cookie de sessão)"}`);
        if (cookie) return cookie;
      } catch (erro) {
        if (op.sinal?.aborted) throw new Error("Coleta cancelada.");
        op.log(`POST ${URL_LOGIN} → ${limite.signal.aborted ? "tempo esgotado" : `falha de rede: ${(erro as Error).message}`}`);
      } finally {
        clearTimeout(temporizador);
      }
      const passageiro = status === null || status === 429 || status >= 500;
      if (!passageiro || tentativa === 3) {
        throw new Error(
          status === null
            ? "Não foi possível falar com o INLABS para o login (rede)."
            : `Login no INLABS recusado (HTTP ${status}, sem cookie de sessão). Confira INLABS_EMAIL e INLABS_SENHA.`,
        );
      }
      await esperar(2_000 * 2 ** (tentativa - 1));
    }
    throw new Error("Login no INLABS falhou.");
  }

  async function* daRede(op: OpcoesColeta): AsyncGenerator<ArtigoDou> {
    const ambiente = config.ambiente ?? process.env;
    const email = config.email ?? ambiente.INLABS_EMAIL?.trim();
    const senha = config.senha ?? ambiente.INLABS_SENHA;
    if (!email || !senha) {
      throw new Error("Defina INLABS_EMAIL e INLABS_SENHA (conta gratuita em https://inlabs.in.gov.br) ou use --arquivo com um ZIP/XML local.");
    }
    const janela = config.janela ?? janelaDoAmbiente(agora(), ambiente, 125);
    const secoesAmbiente = listaDoAmbiente(ambiente.LUNETA_INLABS_SECOES).map((s) => s.toUpperCase());
    const secoes = config.secoes ?? (secoesAmbiente.length > 0 ? secoesAmbiente : ["DO3", "DO3E"]);
    op.informar({ origem: `${URL_INLABS} (${secoes.join(", ")}; ${janela.desde} a ${janela.ate})` });
    const robots = robotsLigado(ambiente);
    if (robots && !(await op.http.permitido(URL_LOGIN))) {
      throw new Error("robots.txt do INLABS não permite o login automatizado (LUNETA_RADAR_ROBOTS=1). Nada foi coletado.");
    }

    const cookie = await entrar(op, email, senha);
    await esperar(config.pausaAposLoginMs ?? 2_000);
    const avisar = (aviso: string): void => op.informar({ aviso });
    let baixados = 0;
    let entregues = 0;
    /** Dias úteis em que a seção principal (não extra) respondeu 404. */
    const diasUteisSemEdicao = new Set<string>();
    const principais = secoes.filter((s) => !/E$/i.test(s));
    for (const dia of diasDaJanela(janela)) {
      for (const secao of secoes) {
        const url = `${URL_INLABS}/index.php?p=${dia}&dl=${dia}-${secao}.zip`;
        const resposta = await op.http.requisitar(url, {
          cabecalhos: { cookie: `${NOME_COOKIE}=${cookie}`, origem: ORIGEM_SCRIPT, accept: "application/zip,application/octet-stream;q=0.9,*/*;q=0.5" },
          respeitarRobots: robots,
          sinal: op.sinal,
          codificacao: "windows-1252",
          aceitarStatus: (s) => (s >= 200 && s < 300) || s === 404,
        });
        if (resposta.status === 404) {
          op.log(`DOU ${dia} ${secao}: sem edição (404).`);
          if (principais.includes(secao) && ehDiaUtil(dia)) diasUteisSemEdicao.add(dia);
          continue;
        }
        if (!pareceZip(resposta.bytes)) {
          const html = /<html|<!doctype/i.test(resposta.texto.slice(0, 500));
          throw new Error(
            `INLABS devolveu ${html ? "uma página HTML" : "um arquivo que não é ZIP"} em ${dia}-${secao}.zip` +
              `${html ? " (sessão expirada ou login recusado?)" : ""}. Nada foi gravado.`,
          );
        }
        baixados++;
        for (const artigo of artigosDoZip(resposta.bytes, `${dia}-${secao}.zip`, avisar)) {
          if (op.uf && ufDoArtigo(artigo) !== op.uf) continue;
          entregues++;
          yield artigo;
        }
      }
    }
    if (diasUteisSemEdicao.size > 0) {
      op.informar({ aviso: `Dia(s) útil(eis) sem ${principais.join("/")}: ${[...diasUteisSemEdicao].join(", ")} (feriado ou edição ainda não publicada?).` });
    }
    if (baixados === 0) op.informar({ aviso: `Nenhuma edição de ${secoes.join("/")} entre ${janela.desde} e ${janela.ate} (dias sem DOU?).` });
    // Janela vazia legítima: edições baixadas sem nada da UF pedida, ou só fim de semana/feriado
    // sem edição. Muitos dias úteis sem DOU apontam outro problema (URL mudou?): fica inválida.
    if (entregues === 0 && (baixados > 0 || diasUteisSemEdicao.size <= MAX_DIAS_UTEIS_SEM_EDICAO)) op.informar({ vazioLegitimo: true });
  }

  async function* daArquivo(op: OpcoesColeta, arquivo: string): AsyncGenerator<ArtigoDou> {
    op.informar({ origem: arquivo });
    let entregues = 0;
    for (const artigo of await artigosLocais(arquivo, (aviso) => op.informar({ aviso }))) {
      if (op.uf && ufDoArtigo(artigo) !== op.uf) continue;
      entregues++;
      yield artigo;
    }
    // Arquivo válido (com matérias), mas nada da UF pedida.
    if (entregues === 0) op.informar({ vazioLegitimo: true });
  }

  return {
    id: "dou_inlabs",
    nome: "DOU seção 3 via INLABS (Imprensa Nacional) – avisos de leilão",
    tipo: "governo",
    acesso: "arquivo_oficial",
    finalidade: "radar",
    url: URL_INLABS,
    capacidades: { fotos: false, documentos: true, ocupacao: false, listaCompleta: false },

    coletar(op) {
      return op.arquivo ? daArquivo(op, op.arquivo) : daRede(op);
    },

    normalizar(artigo): EditalNormalizado | null {
      exigirObjeto(artigo, "matéria não é objeto");
      exigirObjeto(artigo.atributos, "matéria sem atributos");
      const a = artigo.atributos;
      const secao = texto(a.pubName);
      if (secao && !/^DO3/i.test(secao)) return null;
      const cabeca = colapsarEspacos(semHtml(artigo.identifica ?? artigo.titulo ?? a.name ?? ""));
      // Resultado, homologação, ata, arrematação: descartado já pelo cabeçalho.
      if (ehCabecalhoDeResultado(cabeca)) return null;

      // O corpo repete o cabeçalho em <p class="identifica">; fica só o do campo Identifica.
      const corpo = semAssinatura(artigo.texto ?? "");
      const corpoSemCabecalho = artigo.identifica ? corpo.replace(/<p\b[^>]*\bclass\s*=\s*["'][^"']*\bidentifica\b[^"']*["'][^>]*>[\s\S]*?<\/p\s*>/gi, " ") : corpo;
      const partes = [artigo.identifica, artigo.titulo, artigo.subTitulo, artigo.ementa, corpoSemCabecalho];
      const analise = analisarLeilaoImovel(partes.filter((p): p is string => Boolean(p)).join("\n"));
      if (!analise.aceito) return null;

      const id = texto(a.id) ?? texto(a.idMateria);
      if (!id) throw new Error(`matéria sem id (${artigo.arquivo})`);
      const publicado = lerDataBR(texto(a.pubDate));
      const dataLeilao = extrairDataLeilao(analise.texto, publicado, agora());
      // Retificação, errata, adiamento ou leilão deserto só ficam com data nova de leilão; corpo
      // com marca de resultado ("arrematado por Fulano", "fica homologado") sai.
      if (motivoSemLeilaoFuturo(cabeca, { texto: analise.texto, dataLeilao })) return null;
      const leitura = publicado ? `https://www.in.gov.br/leiturajornal?data=${publicado.split("-").reverse().join("-")}&secao=do3` : null;
      const url = urlOuNulo(a.pdfPage) ?? leitura;
      if (!url) throw new Error(`matéria ${id} sem pdfPage nem pubDate`);
      const categoria = texto(a.artCategory);
      const orgao = categoria ? categoria.split("/").map((s) => s.trim()).filter(Boolean).join(" / ") : null;
      const unidade = categoria ? (categoria.split("/").map((s) => s.trim()).filter(Boolean).pop() ?? null) : null;
      const local = extrairLocal(analise.texto);
      const uf = (categoria ? extrairLocal(categoria).uf : null) ?? local.uf;

      return {
        registro: "edital",
        id_na_fonte: id,
        titulo: `${cabeca || "Aviso de leilão"}${unidade ? ` – ${unidade}` : ""}`,
        orgao,
        uf,
        cidade: local.cidade,
        publicado_em: publicado,
        data_leilao: dataLeilao,
        url,
        // o texto, e depois os href do HTML ("clique aqui" com o link do leiloeiro)
        site_leilao: extrairSiteLeilao(analise.texto) ?? extrairSiteLeilao(corpoSemCabecalho),
        resumo: resumoRelevante(analise),
      };
    },
  };
}

export const douInlabs = criarConectorDouInlabs();
