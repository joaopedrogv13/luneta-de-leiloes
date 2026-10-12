/**
 * Mede a distribuição das tags de risco sobre arquivos locais, sem banco e sem rede:
 * - o CSV da Caixa (lista geral ou de uma UF), lido só pelos campos do CSV;
 * - respostas da busca da Leilões Judiciais (JSON-RPC do `search_leiloes`, como o curl
 *   devolve, ou o JSON de dentro de `content[0].text`).
 *
 * Serve para medir falsos positivos antes de publicar uma regra nova. Os adaptadores daqui são
 * mínimos (só o que as regras leem); a normalização de verdade é a dos conectores.
 *
 *   node --experimental-strip-types base/riscos/medir.ts --caixa lista.csv --lj resposta.json [--exemplos 5] [--json]
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import type { CapacidadesFonte, Documento, Foto, ImovelNormalizado, Praca, TextoFonte } from "../tipos.ts";
import { decodificar } from "../util/arquivo.ts";
import { classificarModalidade, inferirTipoImovel } from "../util/classificar.ts";
import { lerCsv, linhasComoObjetos } from "../util/csv.ts";
import { lerDataHoraBR } from "../util/data.ts";
import { lerNumeroBR } from "../util/numero.ts";
import { capitalizarNome, colapsarEspacos, normalizarTexto, semHtml } from "../util/texto.ts";
import { normalizarUf } from "../util/uf.ts";
import { avaliarImovel, entradaPara, imovelDeTeste, type RegraRisco } from "./motor.ts";
import { REGRAS } from "./regras/index.ts";
import { TAGS, type SlugTag } from "./tags.ts";

export interface Amostra {
  imovel: ImovelNormalizado;
  fonte: { id: string; capacidades: CapacidadesFonte };
}

// ---------------------------------------------------------------------------
// Caixa (só campos do CSV)
// ---------------------------------------------------------------------------

export const FONTE_CAIXA = { id: "caixa_csv", capacidades: { fotos: true, documentos: true, ocupacao: false, listaCompleta: true } };

/** Linhas do CSV da Caixa como objetos (cabeçalho localizado pela coluna "N° do imóvel"). */
export function lerListaCaixa(texto: string): Array<Record<string, string>> {
  const linhas = lerCsv(texto, { separador: ";" });
  const iCabecalho = linhas.findIndex((l) => /^N\s*[°º]\s*do im/i.test((l[0] ?? "").trim()));
  if (iCabecalho < 0) throw new Error("CSV da Caixa sem a linha de cabeçalho (\"N° do imóvel\").");
  const cabecalho = (linhas[iCabecalho] ?? []).map((c) => c.trim());
  return linhasComoObjetos(cabecalho, linhas.slice(iCabecalho + 1)).map((o) => {
    const limpo: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) limpo[k] = v.trim();
    return limpo;
  });
}

/** Imóvel mínimo a partir de uma linha do CSV (como o conector faria, sem ficha nem fotos verificadas). */
export function imovelDaLinhaCaixa(c: Record<string, string>): ImovelNormalizado | null {
  const numero = (c["N° do imóvel"] ?? "").replace(/\D/g, "");
  const uf = normalizarUf(c.UF);
  const preco = lerNumeroBR(c["Preço"], { decimal: "," });
  if (!numero || numero.length > 13 || !uf || !c.Cidade || preco === null || preco <= 0) return null;
  const id13 = numero.padStart(13, "0");
  const avaliacao = lerNumeroBR(c["Valor de avaliação"], { decimal: "," });
  const rotulo = colapsarEspacos(c["Modalidade de venda"] ?? "");
  const { modalidade } = classificarModalidade(rotulo);
  const descricao = c["Descrição"] ?? "";
  const financiamento = normalizarTexto(c.Financiamento ?? "");
  const unica = modalidade !== "leilao";
  return {
    registro: "imovel",
    id_na_fonte: id13,
    url: c["Link de acesso"] || `https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=${numero}`,
    titulo: `${descricao.split(",")[0] ?? "Imóvel"} - ${capitalizarNome(c.Cidade)}`,
    tipo: inferirTipoImovel(descricao),
    uf,
    cidade: capitalizarNome(c.Cidade),
    bairro: c.Bairro || null,
    endereco: c["Endereço"] || null,
    descricao,
    modalidade,
    modalidade_fonte: rotulo,
    judicial: false,
    aceita_financiamento: financiamento === "sim" ? true : financiamento === "nao" ? false : null,
    ocupacao: null,
    comitente: "Caixa Econômica Federal",
    valor_avaliacao: avaliacao !== null && avaliacao > 0 ? avaliacao : null,
    preco,
    praca_atual: unica ? 0 : null,
    pracas: unica ? [{ numero: 0, valor_minimo: preco }] : [],
    fotos: [{ url: `https://venda-imoveis.caixa.gov.br/fotos/F${id13}21.jpg`, origem: "padrao_url", ok: null }],
    documentos: [],
  };
}

// ---------------------------------------------------------------------------
// Leilões Judiciais (resposta do search_leiloes)
// ---------------------------------------------------------------------------

export const FONTE_LJ = { id: "leiloesjudiciais_api", capacidades: { fotos: true, documentos: true, ocupacao: false, listaCompleta: false } };

type Lote = Record<string, unknown>;

/** Lotes de uma resposta da busca: JSON-RPC (com linhas de status depois), lista delas ou o JSON interno. */
export function lotesDaRespostaLJ(texto: string): Lote[] {
  const fim = texto.lastIndexOf("}");
  const fimLista = texto.lastIndexOf("]");
  const corte = Math.max(fim, fimLista);
  const json = JSON.parse(texto.slice(0, corte + 1)) as unknown;
  const respostas = Array.isArray(json) ? json : [json];
  const lotes: Lote[] = [];
  for (const r of respostas) {
    const obj = r as Record<string, unknown>;
    const conteudo = (obj.result as { content?: Array<{ text?: string }> } | undefined)?.content?.[0]?.text;
    const interno = (conteudo ? JSON.parse(conteudo) : obj) as { results?: Lote[] };
    for (const l of interno.results ?? []) lotes.push(l);
  }
  return lotes;
}

function valor(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Imóvel mínimo a partir de um lote (regra de praça da crítica §1.4; avaliação = vl_lanceminimo com cautela). */
export function imovelDoLoteLJ(lote: Lote): ImovelNormalizado | null {
  const id = valor(lote.lote_id);
  const uf = normalizarUf(lote.nm_estado);
  const titulo = texto(lote.nm_titulo_lote);
  if (!id || !uf || !titulo) return null;
  const descricao = semHtml(texto(lote.nm_descricao));
  const tituloLeilao = texto(lote.nm_titulo_leilao);
  const ini = valor(lote.vl_lanceinicial);
  const min = valor(lote.vl_lanceminimo);
  const seg = valor(lote.vl_lanceinicialsegundoleilao);
  const fechamento = lerDataHoraBR(texto(lote.dt_fechamento));
  let pracas: Praca[] = [];
  let pracaAtual: 0 | 1 | 2 | null = null;
  let regra = "indefinida";
  if (seg === null) [pracas, pracaAtual, regra] = [[{ numero: 0, data: fechamento, valor_minimo: ini }], 0, "seg_nulo"];
  else if (ini !== null && min !== null && Math.abs(ini - min) < 0.01) {
    [pracas, pracaAtual, regra] = [[{ numero: 1, data: fechamento, valor_minimo: ini }, { numero: 2, valor_minimo: seg }], 1, "ini=min"];
  } else if (ini !== null && Math.abs(ini - seg) < 0.01) {
    [pracas, pracaAtual, regra] = [[{ numero: 1 }, { numero: 2, data: fechamento, valor_minimo: seg }], 2, "ini=seg"];
  }
  const textos: TextoFonte[] = [];
  if (tituloLeilao) textos.push({ origem: "titulo_leilao", texto: tituloLeilao });
  const fotos: Foto[] = (Array.isArray(lote.fotos) ? (lote.fotos as Lote[]) : [])
    .map((f, i) => ({ url: texto(f.nm_path_completo), ordem: i, origem: "api" }))
    .filter((f) => /^https?:\/\//.test(f.url));
  const documentos: Documento[] = (Array.isArray(lote.anexos) ? (lote.anexos as Lote[]) : [])
    .map((a) => ({ tipo: /edital/i.test(texto(a.nm)) ? ("edital" as const) : /matr/i.test(texto(a.nm)) ? ("matricula" as const) : ("avaliacao" as const), titulo: texto(a.nm), url: texto(a.nm_path_completo) }))
    .filter((d) => /^https?:\/\//.test(d.url));
  const classe = classificarModalidade(`${tituloLeilao} ${titulo}`);
  const judicial = classe.judicial === false ? false : classe.judicial === true || /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(descricao) ? true : null;
  const parcelas = typeof lote.nu_parcelas === "number" ? lote.nu_parcelas : null;
  return {
    registro: "imovel",
    id_na_fonte: String(id),
    url: `https://www.leiloesjudiciais.com.br/lote/${String(lote.leilao_id)}/${id}`,
    titulo,
    tipo: inferirTipoImovel(titulo),
    uf,
    cidade: texto(lote.nm_cidade) || "Desconhecida",
    descricao,
    textos,
    modalidade: "leilao",
    modalidade_fonte: null,
    judicial,
    aceita_financiamento: null,
    aceita_parcelamento: parcelas === null ? null : parcelas > 1,
    ocupacao: null,
    valor_avaliacao: lote.bn_exibeavaliacao === false || min === null || (ini !== null && ini > min + 0.01) ? null : min,
    preco: ini,
    praca_atual: pracaAtual,
    pracas,
    fotos,
    documentos,
    extras: { regra_praca: regra },
  };
}

// ---------------------------------------------------------------------------
// Medição
// ---------------------------------------------------------------------------

export interface ContagemTag {
  sim: number;
  nao: number;
  desconhecido: number;
  /** Tags "sim" marcadas para revisão humana. */
  revisao: number;
}

export interface Distribuicao {
  imoveis: number;
  erros: string[];
  porTag: Record<SlugTag, ContagemTag>;
  /** Até N exemplos de "sim" por tag: id na fonte, origem e trecho. */
  exemplos: Partial<Record<SlugTag, string[]>>;
}

export function medir(amostras: readonly Amostra[], opcoes: { agora?: Date; exemplos?: number; regras?: readonly RegraRisco[] } = {}): Distribuicao {
  const agora = opcoes.agora ?? new Date();
  const maxExemplos = opcoes.exemplos ?? 3;
  const porTag = Object.fromEntries(TAGS.map((t) => [t.slug, { sim: 0, nao: 0, desconhecido: 0, revisao: 0 }])) as Record<SlugTag, ContagemTag>;
  const exemplos: Partial<Record<SlugTag, string[]>> = {};
  const erros: string[] = [];
  for (const { imovel, fonte } of amostras) {
    const gravado = imovelDeTeste(imovel, { fonteId: fonte.id, agora });
    const r = avaliarImovel(entradaPara(gravado, fonte, agora), opcoes.regras ?? REGRAS);
    for (const e of r.erros) if (erros.length < 20) erros.push(e);
    for (const risco of r.riscos) {
      const c = porTag[risco.tag];
      c[risco.valor]++;
      if (risco.valor === "sim") {
        if (risco.precisa_revisao) c.revisao++;
        const lista = (exemplos[risco.tag] ??= []);
        if (lista.length < maxExemplos) lista.push(`${imovel.id_na_fonte} [${risco.origem}, ${risco.confianca}${risco.precisa_revisao ? ", revisão" : ""}] ${risco.trecho ?? ""}`);
      }
    }
  }
  return { imoveis: amostras.length, erros, porTag, exemplos };
}

function pct(n: number, total: number): string {
  return total === 0 ? "0%" : `${((100 * n) / total).toFixed(1).replace(".", ",")}%`;
}

export function formatarDistribuicao(titulo: string, d: Distribuicao, comExemplos = true): string {
  const linhas = [`== ${titulo}: ${d.imoveis} imóveis`, "tag                         sim (%)            não     descon.   sim c/ revisão"];
  for (const t of TAGS) {
    const c = d.porTag[t.slug];
    linhas.push(
      `${t.slug.padEnd(27)} ${String(c.sim).padStart(6)} (${pct(c.sim, d.imoveis).padStart(6)})  ${String(c.nao).padStart(7)} ${String(c.desconhecido).padStart(9)} ${String(c.revisao).padStart(8)}`,
    );
  }
  if (comExemplos) {
    for (const t of TAGS) {
      const lista = d.exemplos[t.slug];
      if (!lista || lista.length === 0) continue;
      linhas.push(`-- ${t.slug}`);
      for (const e of lista) linhas.push(`   ${e}`);
    }
  }
  if (d.erros.length > 0) linhas.push(`erros: ${d.erros.join(" | ")}`);
  return linhas.join("\n");
}

async function principal(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { caixa: { type: "string" }, lj: { type: "string", multiple: true }, exemplos: { type: "string" }, json: { type: "boolean" } },
  });
  const exemplos = values.exemplos ? Number(values.exemplos) : 3;
  const saida: Record<string, Distribuicao> = {};
  if (values.caixa) {
    const linhas = lerListaCaixa(decodificar(await readFile(values.caixa)));
    const amostras = linhas.map(imovelDaLinhaCaixa).filter((i): i is ImovelNormalizado => i !== null).map((imovel) => ({ imovel, fonte: FONTE_CAIXA }));
    saida.caixa = medir(amostras, { exemplos });
  }
  for (const arquivo of values.lj ?? []) {
    const lotes = lotesDaRespostaLJ(decodificar(await readFile(arquivo)));
    const amostras = lotes.map(imovelDoLoteLJ).filter((i): i is ImovelNormalizado => i !== null).map((imovel) => ({ imovel, fonte: FONTE_LJ }));
    saida[`lj:${arquivo}`] = medir(amostras, { exemplos });
  }
  if (Object.keys(saida).length === 0) {
    process.stderr.write("Uso: medir.ts --caixa <csv> [--lj <resposta.json> ...] [--exemplos N] [--json]\n");
    return 2;
  }
  if (values.json) process.stdout.write(JSON.stringify(saida, null, 2) + "\n");
  else for (const [nome, d] of Object.entries(saida)) process.stdout.write(formatarDistribuicao(nome, d) + "\n\n");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal(process.argv.slice(2)).then((codigo) => process.exit(codigo), (erro: unknown) => {
    process.stderr.write(`${(erro as Error).message}\n`);
    process.exit(1);
  });
}
