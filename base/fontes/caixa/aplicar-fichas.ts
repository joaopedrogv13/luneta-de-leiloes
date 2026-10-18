/**
 * Aplica no banco fichas da Caixa lidas em outro lugar: o `fichas.json` que baixar-fichas.ts grava (e que a coleta no
 * PC do dono, `node base/coleta-pc.mjs`, e o workflow base-fichas-caixa.yml publicam no branch coletas-dados), no formato
 * { lidas_em, lida_em_por_id?, fichas: { <id13>: FichaCaixa } }. Aceita o arquivo comprimido (fichas.json.gz).
 * A rede deste ambiente (e a de servidores fora do Brasil) não chega às fichas; quem tem acesso baixa e aplica aqui.
 *
 *   npm run base:fichas -- --arquivo fichas.json[.gz] [--banco base/dados/luneta.db] [--cache base/dados/caixa/detalhes.db | off]
 *
 * Para cada imóvel da Caixa que está no banco:
 * - grava na linha do imóvel a matrícula (a primeira), o CEP (quando a ficha traz), o cartório ("6º Ofício de
 *   Registro de Imóveis de São Gonçalo/RJ"), os extras da ficha (comarca, ofício, inscrição imobiliária, averbação dos
 *   leilões negativos, todas as matrículas quando há mais de uma) e `ficha_lida_em` (dia da leitura), o PDF da
 *   matrícula e, quando a ficha descreve a oferta atual do CSV, o FGTS, os editais e o texto da ficha (`textos`, origem
 *   "ficha", o mesmo que a coleta grava: as regras de risco de `base:riscos` já o leem); a chave de deduplicação é
 *   refeita com a matrícula. O dia da leitura é o da ficha (`lida_em_por_id`, quando o arquivo junta leituras de
 *   vários dias) ou, sem ele, o `lidas_em` do arquivo;
 * - guarda a ficha no cache do conector (o mesmo que `--detalhes` usa), para a próxima coleta do CSV não apagar o que
 *   veio dela. Ficha que perde campos estáveis herda os da leitura anterior (herdarEstaveis).
 * Ficha de imóvel que não está no banco fica de fora (dita no resumo). Os textos passam de novo pela máscara LGPD.
 * Depois, `npm run base:exportar -- --site` leva tudo ao site (registro "lido", com a data).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { abrirBanco, lerNumero, lerTexto, sqlBool, transacao, type Banco } from "../../db.ts";
import { chaveDedup } from "../../dedup/index.ts";
import { geocodificar } from "../../geo/geocodificar.ts";
import { textoLimpo } from "../../gravar.ts";
import type { PrecisaoGeo } from "../../tipos.ts";
import { abrirCacheDisco, CACHE_PADRAO, type BaseCsv, type CacheCaixa } from "./cache.ts";
import { herdarEstaveis, mascararFicha, type FichaCaixa } from "./ficha.ts";
import { cartorioDaFicha, fichaAtual } from "./index.ts";

export interface ArquivoFichas {
  /** quando as fichas foram lidas (ISO); com `lida_em_por_id`, a leitura mais antiga */
  lidas_em: string;
  /** quando cada ficha foi lida (ISO), se o arquivo junta leituras de dias diferentes (coleta com retomada) */
  lida_em_por_id?: Record<string, string>;
  /** quantas fichas o arquivo tem (informativo) */
  total?: number;
  fichas: Record<string, FichaCaixa>;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}/;
const dataValida = (d: unknown): d is string => typeof d === "string" && DATA_ISO.test(d) && !Number.isNaN(Date.parse(d));

/** O momento da leitura desta ficha: o dela, se o arquivo tiver e for válido; senão, o do arquivo. */
export function lidaEmDaFicha(arquivo: ArquivoFichas, id13: string): string {
  const propria = arquivo.lida_em_por_id?.[id13];
  return dataValida(propria) ? propria : arquivo.lidas_em;
}

export interface ResumoFichas {
  aplicadas: string[];
  /** fichas de imóveis que não estão no banco (como ativos ou não) */
  semImovel: string[];
  invalidas: { id: string; motivo: string }[];
  /** quantas também foram para o cache do conector */
  noCache: number;
}

/** Lê e confere o arquivo (formato de baixar-fichas.ts). Lança com o motivo. */
export function lerArquivoFichas(texto: string): ArquivoFichas {
  let a: ArquivoFichas;
  try {
    a = JSON.parse(texto) as ArquivoFichas;
  } catch (e) {
    throw new Error(`fichas.json não é JSON: ${(e as Error).message}`);
  }
  // o dia da leitura vai ao site como AAAA-MM-DD: "Fri Oct 17 2026" seria aceito por Date.parse e quebraria o pedaço
  if (typeof a !== "object" || a === null || !dataValida(a.lidas_em)) {
    throw new Error("fichas.json sem `lidas_em` (data ISO da leitura, AAAA-MM-DD...)");
  }
  if (typeof a.fichas !== "object" || a.fichas === null || Array.isArray(a.fichas)) throw new Error("fichas.json sem o objeto `fichas`");
  if (a.lida_em_por_id !== undefined && (typeof a.lida_em_por_id !== "object" || a.lida_em_por_id === null || Array.isArray(a.lida_em_por_id))) {
    throw new Error("fichas.json com `lida_em_por_id` que não é um objeto { id13: data ISO }");
  }
  return a;
}

function motivoInvalida(id: string, f: FichaCaixa): string | null {
  if (!/^\d{13}$/.test(id)) return "id não tem 13 dígitos";
  if (typeof f !== "object" || f === null || !Array.isArray(f.matriculas) || !Array.isArray(f.documentos)) return "ficha sem matrículas ou documentos";
  if (f.numero_imovel && f.numero_imovel !== id) return `a ficha é do imóvel ${f.numero_imovel}`;
  return null;
}

interface LinhaBanco {
  id: number;
  uf: string;
  cidade: string;
  bairro: string | null;
  endereco: string | null;
  lat: number | null;
  lon: number | null;
  precisao_geo: PrecisaoGeo | null;
  preco: number | null;
  valor_avaliacao: number | null;
  modalidade_fonte: string | null;
  matricula: string | null;
  cartorio: string | null;
  extras: string | null;
}

/** Aplica as fichas no banco (uma transação) e, se houver, no cache do conector. */
export function aplicarFichas(db: Banco, arquivo: ArquivoFichas, opcoes: { cache?: CacheCaixa | null; agora?: Date } = {}): ResumoFichas {
  const agora = opcoes.agora ?? new Date();
  const resumo: ResumoFichas = { aplicadas: [], semImovel: [], invalidas: [], noCache: 0 };
  const buscar = db.prepare(
    `SELECT id, uf, cidade, bairro, endereco, lat, lon, precisao_geo, preco, valor_avaliacao, modalidade_fonte, matricula, cartorio, extras
     FROM imovel WHERE fonte_id = 'caixa_csv' AND id_na_fonte = ?`,
  );
  const atualizar = db.prepare(
    `UPDATE imovel SET matricula = ?, cartorio = ?, cep = COALESCE(?, cep), extras = ?, aceita_fgts = COALESCE(?, aceita_fgts), textos = COALESCE(?, textos),
       chave_dedup = ?, atualizado_em = ? WHERE id = ?`,
  );
  const documento = db.prepare(
    `INSERT INTO documento (imovel_id, tipo, titulo, url, publicado_em) VALUES (?, ?, ?, ?, ?) ON CONFLICT (imovel_id, url) DO NOTHING`,
  );
  const paraCache: { id13: string; ficha: FichaCaixa; base: BaseCsv; lidaEm: Date }[] = [];

  transacao(db, () => {
    for (const [id13, bruta] of Object.entries(arquivo.fichas)) {
      const motivo = motivoInvalida(id13, bruta);
      if (motivo) {
        resumo.invalidas.push({ id: id13, motivo });
        continue;
      }
      const l = buscar.get(id13) as unknown as LinhaBanco | undefined;
      if (!l) {
        resumo.semImovel.push(id13);
        continue;
      }
      const lidaEm = lidaEmDaFicha(arquivo, id13);
      const anterior = opcoes.cache?.ler(id13)?.ficha ?? null;
      const ficha = herdarEstaveis(anterior, mascararFicha(bruta)).ficha;
      const base: BaseCsv = { preco: lerNumero(l.preco), avaliacao: lerNumero(l.valor_avaliacao), modalidade: lerTexto(l.modalidade_fonte) ?? "" };
      // a ficha descreve a oferta que está no banco? (preço e avaliação batem): então FGTS e editais valem
      const atual = fichaAtual({ ficha, ficha_em: null, versao_parser: null, base: null, falha_em: null, falha: null, fotos: null, fotos_em: null }, base);

      const extras: Record<string, unknown> = l.extras ? (JSON.parse(l.extras) as Record<string, unknown>) : {};
      for (const [campo, valor] of [
        ["comarca", ficha.comarca],
        ["oficio", ficha.oficio],
        ["inscricao_imobiliaria", ficha.inscricao_imobiliaria],
        ["averbacao_leiloes_negativos", ficha.averbacao_leiloes_negativos],
      ] as const) {
        if (valor) extras[campo] = valor;
      }
      if (ficha.matriculas.length > 1) extras.matriculas = ficha.matriculas.join(", ");
      extras.ficha_lida_em = lidaEm.slice(0, 10);

      const matricula = ficha.matriculas[0] ?? l.matricula;
      const cartorio = cartorioDaFicha(ficha) ?? l.cartorio;
      const geo = geocodificar({ uf: l.uf, cidade: l.cidade, lat: l.lat, lon: l.lon, precisao_geo: l.precisao_geo });
      const chave = chaveDedup({ uf: l.uf, cidade: l.cidade, codigo_ibge: geo.codigo_ibge, bairro: l.bairro, endereco: l.endereco, matricula, cartorio });
      // o esquema exige 8 dígitos: um CEP fora do formato fica de fora (não derruba a transação inteira)
      const cep = typeof ficha.cep === "string" && /^\d{8}$/.test(ficha.cep) ? ficha.cep : null;
      // o texto da ficha (despesas, pagamento) só descreve a oferta atual: igual ao conector (fichaVigente)
      const texto = atual ? textoLimpo(ficha.texto) : null;
      const textos = texto ? JSON.stringify([{ origem: "ficha", texto }]) : null;
      atualizar.run(matricula, cartorio, cep, JSON.stringify(extras), atual ? sqlBool(ficha.aceita_fgts) : null, textos, chave, agora.toISOString(), l.id);
      for (const d of ficha.documentos) {
        if (d.tipo !== "matricula" && !atual) continue;
        documento.run(l.id, d.tipo, d.titulo ?? null, d.url, d.publicado_em ?? null);
      }
      resumo.aplicadas.push(id13);
      paraCache.push({ id13, ficha, base, lidaEm: new Date(lidaEm) });
    }
  });
  // o cache vem depois do banco: se o banco falhar, nada muda em nenhum dos dois
  if (opcoes.cache) {
    for (const c of paraCache) opcoes.cache.gravarFicha(c.id13, c.ficha, c.base, c.lidaEm);
    resumo.noCache = paraCache.length;
    if (paraCache.length) opcoes.cache.copiaDeSeguranca();
  }
  return resumo;
}

/** Linha de comando (npm run base:fichas). Devolve o código de saída. */
export function principal(argv: readonly string[], saida: (t: string) => void = console.log, erro: (t: string) => void = console.error): number {
  let v: { arquivo?: string; banco?: string; cache?: string };
  try {
    v = parseArgs({ args: [...argv], options: { arquivo: { type: "string" }, banco: { type: "string" }, cache: { type: "string" } } }).values;
  } catch (e) {
    erro((e as Error).message);
    return 2;
  }
  if (!v.arquivo) {
    erro("Uso: npm run base:fichas -- --arquivo fichas.json[.gz] [--banco caminho] [--cache caminho|off]");
    return 2;
  }
  let arquivo: ArquivoFichas;
  try {
    const bytes = readFileSync(resolve(v.arquivo));
    // comprimido (fichas.json.gz, como a coleta no PC publica quando o arquivo passa de 40 MB): pelos bytes, não pelo nome
    const texto = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString("utf8") : bytes.toString("utf8");
    arquivo = lerArquivoFichas(texto);
  } catch (e) {
    erro((e as Error).message);
    return 1;
  }
  const caminhoCache = v.cache ?? process.env.LUNETA_CAIXA_CACHE ?? CACHE_PADRAO;
  const cache = caminhoCache === "off" ? null : abrirCacheDisco(resolve(caminhoCache));
  const db = abrirBanco(v.banco ? resolve(v.banco) : undefined);
  try {
    const r = aplicarFichas(db, arquivo, { cache });
    saida(`Fichas lidas ${arquivo.lida_em_por_id ? `desde ${arquivo.lidas_em}` : `em ${arquivo.lidas_em}`}: ${r.aplicadas.length} aplicada(s) no banco${cache ? ` e no cache (${caminhoCache})` : " (cache desligado)"}.`);
    if (r.semImovel.length) saida(`Sem imóvel da Caixa no banco: ${r.semImovel.join(", ")}`);
    for (const i of r.invalidas) erro(`Ficha ${i.id} recusada: ${i.motivo}`);
    if (r.aplicadas.length) saida("Agora: npm run base:exportar -- --site (leva matrícula, comarca, ofício e a data da leitura ao site).");
    return r.invalidas.length && !r.aplicadas.length ? 1 : 0;
  } finally {
    db.close();
    cache?.fechar();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = principal(process.argv.slice(2));
}
