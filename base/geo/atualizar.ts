/**
 * Atualiza base/geo/municipios.csv e base/geo/distritos.csv a partir de conjuntos abertos no
 * GitHub, conferindo tudo antes de gravar. Se algo falhar (rede, formato, volume, sede fora do
 * município), nada é gravado e os arquivos atuais continuam valendo.
 *
 * Fontes (fixadas por commit; troque com --ref-*):
 * - municípios e sedes: kelvins/Municipios-Brasileiros, csv/municipios.csv (licença MIT, Kelvin S.
 *   do Prado; a nota de licença vai em municipios.LICENSE.txt);
 * - distritos: paulofreitas/dtb-ibge (geodata-br), data/pt/brasil-distritos.csv (PDDL 1.0,
 *   compilado da DTB/IBGE);
 * - malha municipal (só para conferir as sedes e calcular raio_km): tbrugz/geodata-br,
 *   geojson/geojs-100-mun.json (CC0 1.0, malha do IBGE). Não é gravada.
 *
 * Uso (pela raiz do repositório):
 *   node --experimental-strip-types base/geo/atualizar.ts [--simular] [--sem-malha] [--forcar]
 *     [--arquivo-municipios municipios.csv] [--arquivo-distritos brasil-distritos.csv]
 *     [--arquivo-malha geojs-100-mun.json] [--ref-municipios <commit|main>] [--ref-distritos ...] [--ref-malha ...]
 *
 * correcoes.csv (codigo_ibge, lat, lon, motivo) corrige sedes erradas na fonte; a correção é
 * reaplicada a cada atualização e o relatório avisa quando a fonte já corrigiu. Código de
 * apelidos.csv ou de correcoes.csv que some da fonte bloqueia a gravação (senão a tabela não
 * carregaria e toda coleta pararia). Os dois arquivos são gravados juntos: primeiro os
 * temporários, depois os dois renames.
 */
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { Uf } from "../tipos.ts";
import { lerArquivoTexto } from "../util/arquivo.ts";
import { criarClienteHttp, type ClienteHttp } from "../util/http.ts";
import { arredondarCoordenada, dentroDoBrasil, distanciaKm } from "./coordenadas.ts";
import {
  ARQUIVO_APELIDOS,
  ARQUIVO_DISTRITOS,
  ARQUIVO_MUNICIPIOS,
  CODIGO_UF,
  lerApelidos,
  lerMunicipios,
  tabelaCsv as tabela,
  type Apelido,
  type Distrito,
  type Municipio,
} from "./municipios.ts";
import { chaveNome } from "./nomes.ts";

export const ARQUIVO_CORRECOES = fileURLToPath(new URL("./correcoes.csv", import.meta.url));

export interface FonteGeo {
  repo: string;
  ref: string;
  caminho: string;
  licenca: string;
}

export const FONTES_GEO: Readonly<Record<"municipios" | "distritos" | "malha", FonteGeo>> = {
  municipios: { repo: "kelvins/Municipios-Brasileiros", ref: "503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861", caminho: "csv/municipios.csv", licenca: "MIT" },
  distritos: { repo: "paulofreitas/dtb-ibge", ref: "3a44b7450e40a5d8da6831caf12b152c744731d2", caminho: "data/pt/brasil-distritos.csv", licenca: "PDDL-1.0" },
  malha: { repo: "tbrugz/geodata-br", ref: "c39dfb040bfd466fe2a476bafed00749c5c42f16", caminho: "geojson/geojs-100-mun.json", licenca: "CC0-1.0" },
};

export function urlDaFonte(fonte: FonteGeo, ref: string = fonte.ref): string {
  return `https://raw.githubusercontent.com/${fonte.repo}/${ref}/${fonte.caminho}`;
}

const UF_DO_CODIGO: Readonly<Record<string, Uf>> = Object.fromEntries(Object.entries(CODIGO_UF).map(([uf, codigo]) => [codigo, uf as Uf]));

/** Volume esperado (a tabela do IBGE tem 5.571 códigos em 2025: os municípios, Brasília e Fernando de Noronha). */
const MIN_MUNICIPIOS = 5550;
const MAX_MUNICIPIOS = 5700;
/** Sede mais longe que isso do próprio município (pela malha) bloqueia a atualização. */
const LIMITE_FORA_KM = 50;
/** Sede que muda mais que isso em relação ao arquivo atual bloqueia (sem --forcar). */
const LIMITE_MUDANCA_KM = 50;

// ---------------------------------------------------------------------------
// Leitura das fontes (puras)
// ---------------------------------------------------------------------------

/** municipios.csv do kelvins → municípios (sem raio). Lança se o formato não for o esperado. */
export function lerMunicipiosKelvins(texto: string): Municipio[] {
  if (!/^\uFEFF?codigo_ibge,nome,latitude,longitude,capital,codigo_uf/.test(texto)) {
    throw new Error("municipios: cabeçalho inesperado (esperado codigo_ibge,nome,latitude,longitude,capital,codigo_uf,...)");
  }
  return tabela(texto).map((l, i) => {
    const uf = UF_DO_CODIGO[l.codigo_uf ?? ""];
    const lat = Number(l.latitude);
    const lon = Number(l.longitude);
    if (!/^\d{7}$/.test(l.codigo_ibge ?? "") || !uf || !l.nome || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(`municipios: linha ${i + 2} inválida (${JSON.stringify(l)})`);
    }
    if (!(l.codigo_ibge ?? "").startsWith(CODIGO_UF[uf])) throw new Error(`municipios: código ${l.codigo_ibge} não é da UF ${uf}`);
    return { codigo_ibge: l.codigo_ibge as string, uf, nome: l.nome, lat, lon, capital: l.capital === "1", raio_km: null };
  });
}

/** brasil-distritos.csv do geodata-br → distritos. */
export function lerDistritosDtb(texto: string): Distrito[] {
  if (!/^\uFEFF?id,id_municipio,/.test(texto)) throw new Error("distritos: cabeçalho inesperado (esperado id,id_municipio,...,nome)");
  return tabela(texto).map((l, i) => {
    if (!/^\d{9}$/.test(l.id ?? "") || !/^\d{7}$/.test(l.id_municipio ?? "") || !l.nome) throw new Error(`distritos: linha ${i + 2} inválida`);
    return { codigo_distrito: l.id as string, codigo_ibge: l.id_municipio as string, nome: l.nome };
  });
}

type Anel = ReadonlyArray<readonly [number, number]>;
/** Polígonos de cada município (anel externo primeiro, depois buracos), por código IBGE. */
export type Malha = Map<string, Anel[][]>;

/** GeoJSON da malha municipal (FeatureCollection com properties.id = código IBGE). */
export function lerMalha(texto: string): Malha {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error("malha: JSON inválido");
  }
  const colecao = dados as { type?: string; features?: Array<{ properties?: { id?: unknown }; geometry?: { type?: string; coordinates?: unknown } }> };
  if (colecao.type !== "FeatureCollection" || !Array.isArray(colecao.features)) throw new Error("malha: não é uma FeatureCollection");
  const malha: Malha = new Map();
  for (const f of colecao.features) {
    const id = String(f.properties?.id ?? "");
    const g = f.geometry;
    if (!/^\d{7}$/.test(id) || !g) continue;
    if (g.type === "Polygon") malha.set(id, [g.coordinates as Anel[]]);
    else if (g.type === "MultiPolygon") malha.set(id, g.coordinates as Anel[][]);
  }
  if (malha.size < MIN_MUNICIPIOS - 50) throw new Error(`malha: só ${malha.size} municípios`);
  return malha;
}

export interface Correcao {
  codigo_ibge: string;
  lat: number;
  lon: number;
  motivo: string;
}

export function lerCorrecoes(texto: string): Correcao[] {
  return tabela(texto).map((l, i) => {
    const lat = Number(l.lat);
    const lon = Number(l.lon);
    if (!/^\d{7}$/.test(l.codigo_ibge ?? "") || !Number.isFinite(lat) || !Number.isFinite(lon) || !dentroDoBrasil(lat, lon) || !l.motivo) {
      throw new Error(`correcoes.csv: linha ${i + 2} inválida`);
    }
    return { codigo_ibge: l.codigo_ibge as string, lat, lon, motivo: l.motivo };
  });
}

// ---------------------------------------------------------------------------
// Geometria (só para conferir as sedes)
// ---------------------------------------------------------------------------

function noAnel(lat: number, lon: number, anel: Anel): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i] ?? [0, 0];
    const [xj, yj] = anel[j] ?? [0, 0];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

export function dentroDoMunicipio(lat: number, lon: number, poligonos: readonly Anel[][]): boolean {
  return poligonos.some((p) => p[0] !== undefined && noAnel(lat, lon, p[0]) && !p.slice(1).some((buraco) => noAnel(lat, lon, buraco)));
}

/** Distância (km, aproximação plana local) do ponto até a divisa mais próxima. */
export function distanciaDaDivisaKm(lat: number, lon: number, poligonos: readonly Anel[][]): number {
  const k = Math.cos((lat * Math.PI) / 180);
  let menor = Infinity;
  for (const p of poligonos) {
    for (const anel of p) {
      for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
        const [x2, y2] = anel[i] ?? [0, 0];
        const [x1, y1] = anel[j] ?? [0, 0];
        const ax = x1 * k, bx = x2 * k, px = lon * k;
        const dx = bx - ax, dy = y2 - y1;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (lat - y1) * dy) / (dx * dx + dy * dy || 1)));
        menor = Math.min(menor, Math.hypot(ax + t * dx - px, y1 + t * dy - lat) * 111.2);
      }
    }
  }
  return menor;
}

/** Maior distância (km) da sede até um vértice da divisa, arredondada para cima. */
export function raioKm(lat: number, lon: number, poligonos: readonly Anel[][]): number {
  let maior = 0;
  for (const p of poligonos) {
    for (const [x, y] of p[0] ?? []) maior = Math.max(maior, distanciaKm(lat, lon, y, x));
  }
  return Math.ceil(maior);
}

/** Centroide de área do maior anel externo (sugestão de correção para sede fora do município). */
export function centroide(poligonos: readonly Anel[][]): { lat: number; lon: number } | null {
  let maior: Anel = [];
  for (const p of poligonos) if ((p[0]?.length ?? 0) > maior.length) maior = p[0] ?? [];
  let area = 0, cx = 0, cy = 0;
  for (let i = 0, j = maior.length - 1; i < maior.length; j = i++) {
    const [x0, y0] = maior[j] ?? [0, 0];
    const [x1, y1] = maior[i] ?? [0, 0];
    const c = x0 * y1 - x1 * y0;
    area += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  if (area === 0) return null;
  return { lat: arredondarCoordenada(cy / (3 * area), 4), lon: arredondarCoordenada(cx / (3 * area), 4) };
}

// ---------------------------------------------------------------------------
// Preparação e conferência
// ---------------------------------------------------------------------------

export interface EntradaAtualizacao {
  municipios: Municipio[];
  distritos: Distrito[];
  malha: Malha | null;
  correcoes: Correcao[];
  /** O que está gravado hoje (para comparar e manter raio_km quando não há malha). */
  atuais: Municipio[];
  /** apelidos.csv: cada código precisa continuar existindo, na mesma UF. */
  apelidos?: Apelido[];
  forcar?: boolean;
}

export interface ResultadoAtualizacao {
  municipios: Municipio[];
  distritos: Distrito[];
  /** Linhas de relatório (informação e avisos). */
  relatorio: string[];
  /** Problemas que impedem gravar (com --forcar, os marcados como contornáveis viram aviso). */
  erros: string[];
}

export function prepararAtualizacao(entrada: EntradaAtualizacao): ResultadoAtualizacao {
  const relatorio: string[] = [];
  const erros: string[] = [];
  const bloquear = (mensagem: string, contornavel: boolean): void => {
    if (contornavel && entrada.forcar) relatorio.push(`aviso (--forcar): ${mensagem}`);
    else erros.push(mensagem);
  };

  // Volume e unicidade.
  const municipios = entrada.municipios.map((m) => ({ ...m }));
  if (municipios.length < MIN_MUNICIPIOS || municipios.length > MAX_MUNICIPIOS) {
    erros.push(`${municipios.length} municípios; o esperado é entre ${MIN_MUNICIPIOS} e ${MAX_MUNICIPIOS}.`);
  }
  const porCodigo = new Map<string, Municipio>();
  for (const m of municipios) {
    if (porCodigo.has(m.codigo_ibge)) erros.push(`código repetido: ${m.codigo_ibge}`);
    porCodigo.set(m.codigo_ibge, m);
  }
  const capitais = municipios.filter((m) => m.capital);
  const ufsComCapital = new Set(capitais.map((m) => m.uf));
  if (capitais.length !== 27 || ufsComCapital.size !== 27) erros.push(`esperadas 27 capitais (uma por UF); vieram ${capitais.length} em ${ufsComCapital.size} UFs.`);

  // Correções.
  const corrigidos = new Set<string>();
  for (const c of entrada.correcoes) {
    const m = porCodigo.get(c.codigo_ibge);
    if (!m) {
      erros.push(`correcoes.csv: ${c.codigo_ibge} sumiu da fonte; tire ou troque a linha antes de atualizar.`);
      continue;
    }
    const diferenca = distanciaKm(m.lat, m.lon, c.lat, c.lon);
    if (diferenca < 5) relatorio.push(`a fonte já corrigiu ${m.nome}/${m.uf} (${diferenca.toFixed(1)} km da correção): dá para tirar de correcoes.csv.`);
    m.lat = c.lat;
    m.lon = c.lon;
    corrigidos.add(m.codigo_ibge);
  }

  for (const m of municipios) {
    if (!dentroDoBrasil(m.lat, m.lon)) erros.push(`sede de ${m.nome}/${m.uf} fora do Brasil: ${m.lat}, ${m.lon}`);
  }

  // Apelidos: com código inexistente, tabelaPadrao() lançaria e toda coleta e exportação parariam.
  for (const a of entrada.apelidos ?? []) {
    const m = porCodigo.get(a.codigo_ibge);
    if (!m) erros.push(`apelidos.csv: "${a.nome}"/${a.uf} aponta para ${a.codigo_ibge}, que sumiu da fonte; corrija o apelido antes de atualizar.`);
    else if (m.uf !== a.uf) erros.push(`apelidos.csv: "${a.nome}"/${a.uf} aponta para ${m.nome}/${m.uf}, de outra UF.`);
  }

  // Malha: sede dentro do município e raio.
  const raioAtual = new Map(entrada.atuais.map((m) => [m.codigo_ibge, m.raio_km]));
  if (entrada.malha) {
    let semMalha = 0;
    let foraPouco = 0;
    for (const m of municipios) {
      const poligonos = entrada.malha.get(m.codigo_ibge);
      if (!poligonos) {
        semMalha++;
        m.raio_km = raioAtual.get(m.codigo_ibge) ?? null;
        continue;
      }
      if (!dentroDoMunicipio(m.lat, m.lon, poligonos)) {
        const fora = distanciaDaDivisaKm(m.lat, m.lon, poligonos);
        if (fora > LIMITE_FORA_KM) {
          const sugestao = centroide(poligonos);
          bloquear(
            `sede de ${m.nome}/${m.uf} (${m.codigo_ibge}) a ${Math.round(fora)} km do município. Corrija em correcoes.csv, por exemplo: ${m.codigo_ibge},${sugestao?.lat},${sugestao?.lon},centroide da malha municipal`,
            false,
          );
        } else if (fora > 0.5) foraPouco++;
      }
      m.raio_km = raioKm(m.lat, m.lon, poligonos);
    }
    relatorio.push(`malha: ${municipios.length - semMalha} municípios conferidos; ${semMalha} sem polígono (criados depois da malha; raio mantido do arquivo atual); ${foraPouco} sedes até ${LIMITE_FORA_KM} km fora da divisa (litoral e malha simplificada).`);
  } else {
    for (const m of municipios) m.raio_km = raioAtual.get(m.codigo_ibge) ?? null;
    relatorio.push("malha não conferida (--sem-malha): raio_km mantido do arquivo atual.");
  }

  // Comparação com o arquivo atual.
  if (entrada.atuais.length > 0) {
    const novos = municipios.filter((m) => !entrada.atuais.some((a) => a.codigo_ibge === m.codigo_ibge));
    const removidos = entrada.atuais.filter((a) => !porCodigo.has(a.codigo_ibge));
    const renomeados: string[] = [];
    const mudaram: string[] = [];
    for (const a of entrada.atuais) {
      const m = porCodigo.get(a.codigo_ibge);
      if (!m) continue;
      if (m.nome !== a.nome) renomeados.push(`${a.nome} → ${m.nome}/${m.uf}`);
      const d = distanciaKm(a.lat, a.lon, m.lat, m.lon);
      if (d > 1) mudaram.push(`${m.nome}/${m.uf} ${d.toFixed(1)} km`);
      if (d > LIMITE_MUDANCA_KM && !corrigidos.has(m.codigo_ibge)) bloquear(`sede de ${m.nome}/${m.uf} mudou ${Math.round(d)} km.`, true);
    }
    if (novos.length > 0) relatorio.push(`novos: ${novos.map((m) => `${m.nome}/${m.uf}`).join(", ")}`);
    if (removidos.length > 0) relatorio.push(`sumiram: ${removidos.map((m) => `${m.nome}/${m.uf}`).join(", ")}`);
    if (removidos.length > 10) bloquear(`${removidos.length} municípios sumiram da fonte.`, true);
    if (renomeados.length > 0) relatorio.push(`renomeados: ${renomeados.join("; ")} (o nome antigo pode virar apelido em apelidos.csv)`);
    if (mudaram.length > 0) relatorio.push(`sedes que mudaram mais de 1 km: ${mudaram.slice(0, 30).join("; ")}${mudaram.length > 30 ? "..." : ""}`);
  }

  // Distritos: só os que têm nome diferente do município (os outros não acrescentam nada).
  if (entrada.distritos.length < 9000) erros.push(`só ${entrada.distritos.length} distritos; o esperado é mais de 10 mil.`);
  let semMunicipio = 0;
  const distritos = entrada.distritos
    .filter((d) => {
      const m = porCodigo.get(d.codigo_ibge);
      if (!m) {
        semMunicipio++;
        return false;
      }
      return chaveNome(d.nome) !== chaveNome(m.nome);
    })
    .sort((a, b) => a.codigo_distrito.localeCompare(b.codigo_distrito));
  relatorio.push(`distritos: ${entrada.distritos.length} lidos, ${distritos.length} com nome próprio gravados${semMunicipio ? `, ${semMunicipio} sem município` : ""}.`);

  municipios.sort((a, b) => a.codigo_ibge.localeCompare(b.codigo_ibge));
  relatorio.unshift(`municípios: ${municipios.length} (${corrigidos.size} sedes corrigidas por correcoes.csv).`);
  return { municipios, distritos, relatorio, erros };
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

function campoCsv(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

export function formatarMunicipiosCsv(municipios: readonly Municipio[]): string {
  const linhas = municipios.map((m) =>
    [m.codigo_ibge, m.uf, campoCsv(m.nome), String(m.lat), String(m.lon), m.capital ? "1" : "0", m.raio_km === null ? "" : String(m.raio_km)].join(","),
  );
  return ["codigo_ibge,uf,nome,lat,lon,capital,raio_km", ...linhas].join("\n") + "\n";
}

export function formatarDistritosCsv(distritos: readonly Distrito[]): string {
  return ["codigo_distrito,codigo_ibge,nome", ...distritos.map((d) => [d.codigo_distrito, d.codigo_ibge, campoCsv(d.nome)].join(","))].join("\n") + "\n";
}

/**
 * Grava vários arquivos juntos: escreve todos os temporários e só então renomeia. Se uma escrita
 * falhar, nenhum arquivo é trocado; os temporários são apagados.
 */
export function gravarJuntos(arquivos: ReadonlyArray<readonly [caminho: string, conteudo: string]>): void {
  const pares = arquivos.map(([caminho, conteudo]) => ({ caminho, conteudo, temporario: `${caminho}.${process.pid}.tmp` }));
  try {
    for (const p of pares) writeFileSync(p.temporario, p.conteudo, "utf8");
    for (const p of pares) renameSync(p.temporario, p.caminho);
  } finally {
    for (const p of pares) rmSync(p.temporario, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Linha de comando
// ---------------------------------------------------------------------------

export interface DependenciasAtualizar {
  http?: ClienteHttp;
  saida?: (texto: string) => void;
  /** Para teste: onde gravar (padrão: base/geo/). */
  destinoMunicipios?: string;
  destinoDistritos?: string;
  arquivoCorrecoes?: string;
  arquivoApelidos?: string;
}

export async function principal(argv: readonly string[], deps: DependenciasAtualizar = {}): Promise<number> {
  const saida = deps.saida ?? ((t: string) => process.stdout.write(t + "\n"));
  const { values: v } = parseArgs({
    args: [...argv],
    strict: true,
    options: {
      simular: { type: "boolean" },
      "sem-malha": { type: "boolean" },
      forcar: { type: "boolean" },
      "arquivo-municipios": { type: "string" },
      "arquivo-distritos": { type: "string" },
      "arquivo-malha": { type: "string" },
      "ref-municipios": { type: "string" },
      "ref-distritos": { type: "string" },
      "ref-malha": { type: "string" },
    },
  });
  const destinoMunicipios = deps.destinoMunicipios ?? ARQUIVO_MUNICIPIOS;
  const destinoDistritos = deps.destinoDistritos ?? ARQUIVO_DISTRITOS;
  const http = deps.http ?? criarClienteHttp({ log: (m) => saida(`  ${m}`) });

  const obter = async (local: string | undefined, fonte: FonteGeo, ref: string | undefined, assinatura: RegExp): Promise<string> => {
    if (local) return lerArquivoTexto(resolve(local), "utf-8");
    const url = urlDaFonte(fonte, ref);
    saida(`Baixando ${url}`);
    return http.texto(url, {
      codificacao: "utf-8",
      validar: (r) => (assinatura.test(r.texto.slice(0, 200)) ? null : `conteúdo inesperado (começa com ${JSON.stringify(r.texto.slice(0, 40))})`),
    });
  };

  try {
    const [textoMunicipios, textoDistritos] = await Promise.all([
      obter(v["arquivo-municipios"], FONTES_GEO.municipios, v["ref-municipios"], /^\uFEFF?codigo_ibge,nome,/),
      obter(v["arquivo-distritos"], FONTES_GEO.distritos, v["ref-distritos"], /^\uFEFF?id,id_municipio,/),
    ]);
    const malha = v["sem-malha"]
      ? null
      : lerMalha(await obter(v["arquivo-malha"], FONTES_GEO.malha, v["ref-malha"], /^\s*\{\s*"type"\s*:\s*"FeatureCollection"/));
    let atuais: Municipio[] = [];
    try {
      atuais = lerMunicipios(tabela(readFileSync(destinoMunicipios, "utf8")));
    } catch {
      saida("Sem municipios.csv atual (ou ilegível): comparação pulada.");
    }
    let correcoes: Correcao[] = [];
    try {
      correcoes = lerCorrecoes(readFileSync(deps.arquivoCorrecoes ?? ARQUIVO_CORRECOES, "utf8"));
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw erro;
    }
    let apelidos: Apelido[] = [];
    try {
      apelidos = lerApelidos(tabela(readFileSync(deps.arquivoApelidos ?? ARQUIVO_APELIDOS, "utf8")));
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw erro;
    }
    const r = prepararAtualizacao({
      municipios: lerMunicipiosKelvins(textoMunicipios),
      distritos: lerDistritosDtb(textoDistritos),
      malha,
      correcoes,
      atuais,
      apelidos,
      forcar: Boolean(v.forcar),
    });
    for (const linha of r.relatorio) saida(linha);
    if (r.erros.length > 0) {
      for (const e of r.erros) saida(`ERRO: ${e}`);
      saida("Nada foi gravado.");
      return 1;
    }
    if (v.simular) {
      saida("Simulação: nada foi gravado.");
      return 0;
    }
    gravarJuntos([
      [destinoMunicipios, formatarMunicipiosCsv(r.municipios)],
      [destinoDistritos, formatarDistritosCsv(r.distritos)],
    ]);
    saida(`Gravados ${destinoMunicipios} e ${destinoDistritos}. Rode os testes (npm run base:testar) e confira o diff.`);
    return 0;
  } catch (erro) {
    saida(`ERRO: ${(erro as Error).message}`);
    saida("Nada foi gravado.");
    return 1;
  }
}

const executadoDireto = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executadoDireto) {
  principal(process.argv.slice(2)).then(
    (codigo) => {
      process.exitCode = codigo;
    },
    (e: unknown) => {
      process.stderr.write(`Erro: ${(e as Error)?.stack ?? String(e)}\n`);
      process.exitCode = 1;
    },
  );
}
