/**
 * Aplica no banco a geocodificação por endereço de geocodificar.py (base/saida/localizacao/geocode.json, ou o mesmo
 * arquivo publicado pelo workflow base-localizacao.yml no branch coletas-dados).
 *
 *   npm run base:geocode -- --arquivo base/saida/localizacao/geocode.json [--banco base/dados/luneta.db]
 *
 * Para cada imóvel do arquivo que está no banco (id do site: "caixa-<id13>", "lj-<id>"):
 * - precisão numero → `precisao_geo` "exata", rua → "rua", bairro → "bairro", com o ponto do geocode;
 *   cidade → fica a sede do município ("cidade"), como antes;
 * - o ponto passa de novo pela conferência de base/geo (dentro do município, com o raio de raios-cnefe.csv); se não
 *   passar, fica a sede e o imóvel conta como recusado;
 * - nunca piora a coordenada que a fonte trouxe: se a linha tem ponto da fonte (Leilões Judiciais, "exata" conferida),
 *   o geocode só entra se for de precisão melhor;
 * - o resto (precisão do geocode, desvio, setor censitário, motivo do rebaixamento, degrau, data do geocode e a
 *   assinatura do endereço) vai para `extras.geo`. A coleta seguinte mantém o ponto enquanto o endereço for o mesmo
 *   (base/geo/aplicado.ts, usado por gravar.ts).
 * Idempotente: rodar de novo com o mesmo arquivo não muda nada. `atualizado_em` e o hash do conteúdo não mudam (o
 * geocode é derivado, não conteúdo da fonte).
 * Depois: `npm run base:exportar -- --site` leva lat, lon e precisaoGeo ao site.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { abrirBanco, lerNumero, lerTexto, transacao, type Banco } from "../../db.ts";
import { assinaturaEndereco, CHAVE_GEO, lerGeoAplicado, PRECISAO_DO_GEOCODE, type GeoAplicado } from "../../geo/aplicado.ts";
import { geocodificar } from "../../geo/geocodificar.ts";
import { tabelaPadrao, type TabelaMunicipios } from "../../geo/municipios.ts";
import type { PrecisaoGeo } from "../../tipos.ts";

/** Prefixo do id do site → fonte (o mesmo de exportar.ts). */
const FONTE_DO_PREFIXO: Readonly<Record<string, string>> = { caixa: "caixa_csv", lj: "leiloesjudiciais_api" };
/** Quanto menor, melhor. */
const ORDEM_PRECISAO: Readonly<Record<string, number>> = { exata: 0, rua: 1, cep: 2, bairro: 3, cidade: 4 };

export interface RegistroGeocode {
  precisao: "numero" | "rua" | "bairro" | "cidade";
  lat: number | null;
  lon: number | null;
  desvio_m: number | null;
  setor: string | null;
  motivo: string | null;
  degrau: string | null;
  variante?: number;
}

export interface ArquivoGeocode {
  formato: "luneta-geocode";
  versao: number;
  gerado_em: string;
  imoveis: Record<string, RegistroGeocode>;
}

export interface ResumoGeocode {
  /** gravados agora, por precisão no banco */
  aplicados: Record<string, number>;
  /** já estavam assim */
  inalterados: number;
  /** a fonte trouxe ponto igual ou melhor */
  mantidosDaFonte: string[];
  /** o ponto não passou na conferência do município */
  recusados: string[];
  semImovel: string[];
  invalidos: { id: string; motivo: string }[];
}

/** Lê e confere o arquivo de geocodificar.py. Lança com o motivo. */
export function lerArquivoGeocode(texto: string): ArquivoGeocode {
  let a: ArquivoGeocode;
  try {
    a = JSON.parse(texto) as ArquivoGeocode;
  } catch (e) {
    throw new Error(`geocode.json não é JSON: ${(e as Error).message}`);
  }
  if (typeof a !== "object" || a === null || a.formato !== "luneta-geocode") throw new Error("geocode.json sem `formato: luneta-geocode`");
  if (a.versao !== 1) throw new Error(`geocode.json na versão ${String(a.versao)}; este aplicador conhece a 1`);
  if (typeof a.gerado_em !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(a.gerado_em)) throw new Error("geocode.json sem `gerado_em` (AAAA-MM-DD...)");
  if (typeof a.imoveis !== "object" || a.imoveis === null || Array.isArray(a.imoveis)) throw new Error("geocode.json sem o objeto `imoveis`");
  return a;
}

function motivoInvalido(r: RegistroGeocode): string | null {
  if (typeof r !== "object" || r === null) return "registro não é objeto";
  if (!(r.precisao in PRECISAO_DO_GEOCODE)) return `precisão desconhecida: ${String(r.precisao)}`;
  if (r.precisao !== "cidade") {
    if (typeof r.lat !== "number" || typeof r.lon !== "number" || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) return "sem lat/lon";
  }
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
  precisao_geo: string | null;
  extras: string | null;
}

/** Aplica o geocode no banco (uma transação). */
export function aplicarGeocode(db: Banco, arquivo: ArquivoGeocode, opcoes: { tabela?: TabelaMunicipios } = {}): ResumoGeocode {
  const tabela = opcoes.tabela ?? tabelaPadrao();
  const dia = arquivo.gerado_em.slice(0, 10);
  const resumo: ResumoGeocode = { aplicados: {}, inalterados: 0, mantidosDaFonte: [], recusados: [], semImovel: [], invalidos: [] };
  const buscar = db.prepare(
    `SELECT id, uf, cidade, bairro, endereco, lat, lon, precisao_geo, extras FROM imovel WHERE fonte_id = ? AND id_na_fonte = ?`,
  );
  const atualizar = db.prepare(`UPDATE imovel SET lat = ?, lon = ?, precisao_geo = ?, extras = ? WHERE id = ?`);

  transacao(db, () => {
    for (const [idSite, reg] of Object.entries(arquivo.imoveis)) {
      const m = /^([a-z]+)-(.+)$/.exec(idSite);
      const fonte = m ? FONTE_DO_PREFIXO[m[1]!] : undefined;
      if (!m || !fonte) {
        resumo.invalidos.push({ id: idSite, motivo: "id do site sem prefixo conhecido (caixa-, lj-)" });
        continue;
      }
      const motivo = motivoInvalido(reg);
      if (motivo) {
        resumo.invalidos.push({ id: idSite, motivo });
        continue;
      }
      const bruto = buscar.get(fonte, m[2]!);
      if (!bruto) {
        resumo.semImovel.push(idSite);
        continue;
      }
      const l: LinhaBanco = {
        id: Number(bruto.id), uf: String(bruto.uf), cidade: String(bruto.cidade), bairro: lerTexto(bruto.bairro), endereco: lerTexto(bruto.endereco),
        lat: lerNumero(bruto.lat), lon: lerNumero(bruto.lon), precisao_geo: lerTexto(bruto.precisao_geo), extras: lerTexto(bruto.extras),
      };
      let extras: Record<string, unknown> = {};
      try {
        extras = l.extras ? (JSON.parse(l.extras) as Record<string, unknown>) : {};
      } catch {
        extras = {};
      }
      const anterior = lerGeoAplicado(extras);
      // o ponto atual veio da fonte? (não é a sede e não fomos nós que gravamos)
      const daFonte = !anterior && l.precisao_geo !== null && l.precisao_geo !== "cidade" && l.lat !== null && l.lon !== null;
      const alvo: PrecisaoGeo = PRECISAO_DO_GEOCODE[reg.precisao]!;
      if (daFonte && (ORDEM_PRECISAO[alvo] ?? 9) >= (ORDEM_PRECISAO[l.precisao_geo!] ?? 9)) {
        resumo.mantidosDaFonte.push(idSite);
        continue;
      }
      let lat: number | null;
      let lon: number | null;
      let precisao: PrecisaoGeo | null;
      if (alvo === "cidade") {
        const sede = geocodificar({ uf: l.uf, cidade: l.cidade }, tabela);
        [lat, lon, precisao] = [sede.lat, sede.lon, sede.precisao_geo];
      } else {
        const conferido = geocodificar({ uf: l.uf, cidade: l.cidade, lat: reg.lat, lon: reg.lon, precisao_geo: alvo }, tabela);
        if (conferido.origem !== "fonte") resumo.recusados.push(idSite);
        [lat, lon, precisao] = [conferido.lat, conferido.lon, conferido.precisao_geo];
      }
      const geo: GeoAplicado = {
        precisao: precisao === "cidade" && alvo !== "cidade" ? "cidade" : reg.precisao,
        desvio_m: reg.desvio_m ?? null,
        setor: reg.setor ?? null,
        motivo: precisao === "cidade" && alvo !== "cidade" ? "fora_do_municipio" : (reg.motivo ?? null),
        degrau: reg.degrau ?? null,
        gerado_em: dia,
        assinatura: assinaturaEndereco(l),
      };
      extras[CHAVE_GEO] = geo;
      const novoExtras = JSON.stringify(extras);
      if (lat === l.lat && lon === l.lon && precisao === l.precisao_geo && novoExtras === l.extras) {
        resumo.inalterados++;
        continue;
      }
      atualizar.run(lat, lon, precisao, novoExtras, l.id);
      const k = precisao ?? "sem";
      resumo.aplicados[k] = (resumo.aplicados[k] ?? 0) + 1;
    }
  });
  return resumo;
}

/** Linha de comando (npm run base:geocode). Devolve o código de saída. */
export function principal(argv: readonly string[], saida: (t: string) => void = console.log, erro: (t: string) => void = console.error): number {
  let v: { arquivo?: string; banco?: string };
  try {
    v = parseArgs({ args: [...argv], options: { arquivo: { type: "string" }, banco: { type: "string" } } }).values;
  } catch (e) {
    erro((e as Error).message);
    return 2;
  }
  if (!v.arquivo) {
    erro("Uso: npm run base:geocode -- --arquivo base/saida/localizacao/geocode.json [--banco caminho]");
    return 2;
  }
  let arquivo: ArquivoGeocode;
  try {
    arquivo = lerArquivoGeocode(readFileSync(resolve(v.arquivo), "utf8"));
  } catch (e) {
    erro((e as Error).message);
    return 1;
  }
  const db = abrirBanco(v.banco ? resolve(v.banco) : undefined);
  try {
    const r = aplicarGeocode(db, arquivo);
    const total = Object.values(r.aplicados).reduce((a, b) => a + b, 0);
    const porPrecisao = Object.entries(r.aplicados).map(([k, n]) => `${k} ${n}`).join(", ");
    saida(`Geocode de ${arquivo.gerado_em.slice(0, 10)}: ${total} imóvel(is) gravado(s)${porPrecisao ? ` (${porPrecisao})` : ""}; ${r.inalterados} já estavam assim.`);
    if (r.mantidosDaFonte.length) saida(`Ponto da fonte mantido (igual ou melhor que o geocode): ${r.mantidosDaFonte.length} (${r.mantidosDaFonte.slice(0, 5).join(", ")})`);
    if (r.recusados.length) saida(`Fora do município na conferência de base/geo, ficou a sede: ${r.recusados.length} (${r.recusados.slice(0, 5).join(", ")})`);
    if (r.semImovel.length) saida(`Sem imóvel no banco: ${r.semImovel.length} (${r.semImovel.slice(0, 5).join(", ")})`);
    for (const i of r.invalidos.slice(0, 20)) erro(`Registro ${i.id} recusado: ${i.motivo}`);
    if (total) saida("Agora: npm run base:exportar -- --site (leva lat, lon e precisaoGeo ao site).");
    // falha só se nenhum registro do arquivo prestou
    return r.invalidos.length > 0 && r.invalidos.length === Object.keys(arquivo.imoveis).length ? 1 : 0;
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = principal(process.argv.slice(2));
}
