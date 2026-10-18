/**
 * Municípios do IBGE com a coordenada da sede, para geocodificar por cidade + UF quando a fonte
 * não traz coordenadas (a Caixa não traz) e para dar um código estável (IBGE) às chaves de
 * deduplicação.
 *
 * Arquivos (base/geo/, atualizados por atualizar.ts):
 * - municipios.csv: codigo_ibge, uf, nome, lat, lon, capital, raio_km. Coordenadas da sede do
 *   conjunto kelvins/Municipios-Brasileiros (MIT; ver municipios.LICENSE.txt), com as correções de
 *   correcoes.csv. raio_km é a maior distância da sede até a divisa do município (malha municipal
 *   do IBGE via tbrugz/geodata-br, CC0), usada para conferir coordenadas vindas da fonte.
 * - distritos.csv: distritos do IBGE com nome diferente do município (paulofreitas/geodata-br,
 *   PDDL), para quando a fonte escreve o distrito no lugar da cidade ("ALEXANDRA"/PR → Paranaguá).
 * - apelidos.csv: grafias e nomes antigos curados à mão ("ASSU"/RN → Açu).
 * - raios-cnefe.csv: raio medido no CNEFE 2022 onde a malha simplificada fica curta (Rio de Janeiro: 19 km na
 *   malha, 54 km até as ruas de Santa Cruz). Vale o maior dos dois. Gerado por base/fontes/localizacao/raios.py;
 *   fica separado de municipios.csv para o atualizar.ts (que recalcula raio_km pela malha) não apagar a correção.
 *
 * Ordem de casamento (para em quem casar primeiro; chave ambígua na UF nunca casa):
 *   nome exato → apelido → grafia (chave solta, chave fonética) → distrito → DF (todo o DF é
 *   Brasília).
 *
 * Erro de digitação NÃO casa sozinho: medido com os nomes de todos os municípios consultados nas
 * UFs onde eles não existem, a distância de edição de 1 letra acertava pouco e errava muito
 * ("Gurupá"/RO → Urupá, "Brasília"/AC → Brasiléia, "Taquaral"/RS → Taquara). Ela só serve para
 * `sugerir`, que medir.ts usa para propor apelidos a conferir.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Uf } from "../tipos.ts";
import { lerCsv } from "../util/csv.ts";
import { ehUf } from "../util/uf.ts";
import { chaveCompacta, chaveFonetica, chaveNome, distanciaEdicao, leiturasAbreviadas, limparCidade } from "./nomes.ts";

export const ARQUIVO_MUNICIPIOS = fileURLToPath(new URL("./municipios.csv", import.meta.url));
export const ARQUIVO_DISTRITOS = fileURLToPath(new URL("./distritos.csv", import.meta.url));
export const ARQUIVO_APELIDOS = fileURLToPath(new URL("./apelidos.csv", import.meta.url));
export const ARQUIVO_RAIOS = fileURLToPath(new URL("./raios-cnefe.csv", import.meta.url));

/** Código IBGE de Brasília: o DF tem um município só, e as regiões administrativas caem nele. */
export const CODIGO_BRASILIA = "5300108";

/** Códigos IBGE das UFs (os dois primeiros dígitos do código do município). */
export const CODIGO_UF: Readonly<Record<Uf, string>> = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17", MA: "21", PI: "22", CE: "23",
  RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35",
  PR: "41", SC: "42", RS: "43", MS: "50", MT: "51", GO: "52", DF: "53",
};

export interface Municipio {
  /** Código IBGE de 7 dígitos. */
  codigo_ibge: string;
  uf: Uf;
  nome: string;
  /** Sede do município (graus decimais, WGS 84). */
  lat: number;
  lon: number;
  capital: boolean;
  /** Maior distância da sede até a divisa, em km; `null` se a malha não tinha o município. */
  raio_km: number | null;
}

export interface Distrito {
  codigo_distrito: string;
  codigo_ibge: string;
  nome: string;
}

export interface Apelido {
  uf: Uf;
  nome: string;
  codigo_ibge: string;
  /** grafia | nome_antigo | localidade ... (só documentação). */
  tipo: string;
  observacao: string;
}

/**
 * Como o município foi encontrado:
 * - nome: nome oficial (sem acento/caixa/pontuação);
 * - apelido: lista curada (apelidos.csv);
 * - grafia: variação de escrita (partículas, ç/ss, z/s, y/i, letras dobradas);
 * - distrito: nome de distrito do IBGE (coordenada da sede do município);
 * - df: qualquer cidade do DF (regiões administrativas) vira Brasília.
 */
export type MetodoMunicipio = "nome" | "apelido" | "grafia" | "distrito" | "df";

export interface MunicipioEncontrado {
  municipio: Municipio;
  metodo: MetodoMunicipio;
}

export interface TabelaMunicipios {
  readonly municipios: readonly Municipio[];
  porCodigo(codigo: string): Municipio | undefined;
  /** Município pela cidade escrita na fonte e pela UF; `null` se não reconhecer com segurança. */
  encontrar(uf: string, cidade: string): MunicipioEncontrado | null;
  /**
   * Para cidade que `encontrar` não reconhece: o município da UF com nome a 1 letra de diferença
   * (2 em nomes longos), se for o único. É sugestão para conferir e virar apelido, nunca resposta.
   */
  sugerir(uf: string, cidade: string): Municipio | null;
}

type Indice = Map<string, Set<string>>;

interface IndiceUf {
  nome: Indice;
  apelido: Indice;
  compacta: Indice;
  fonetica: Indice;
  distrito: Indice;
  /** [chave fonética, código] de municípios e apelidos, para `sugerir`. */
  aproximado: Array<readonly [string, string]>;
}

function adicionar(indice: Indice, chave: string, codigo: string): void {
  if (chave === "") return;
  const atual = indice.get(chave);
  if (atual) atual.add(codigo);
  else indice.set(chave, new Set([codigo]));
}

/** O código, se a chave apontar para um município só. */
function unico(indice: Indice, chave: string): string | null {
  const achados = indice.get(chave);
  if (!achados || achados.size !== 1) return null;
  return achados.values().next().value ?? null;
}

/** "Augusto Severo (Campo Grande)" → ["Augusto Severo (Campo Grande)", "Augusto Severo", "Campo Grande"]. */
function variantesDoNome(nome: string): string[] {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(nome);
  return m ? [nome, m[1] ?? "", m[2] ?? ""].filter((v) => v.trim() !== "") : [nome];
}

/** Monta a tabela a partir dos dados já lidos (sem arquivo; útil em teste). */
export function montarTabela(dados: {
  municipios: readonly Municipio[];
  distritos?: readonly Distrito[];
  apelidos?: readonly Apelido[];
}): TabelaMunicipios {
  const porCodigo = new Map<string, Municipio>();
  const porUf = new Map<string, IndiceUf>();
  const indiceDa = (uf: string): IndiceUf => {
    let indice = porUf.get(uf);
    if (!indice) {
      indice = { nome: new Map(), apelido: new Map(), compacta: new Map(), fonetica: new Map(), distrito: new Map(), aproximado: [] };
      porUf.set(uf, indice);
    }
    return indice;
  };

  for (const m of dados.municipios) {
    porCodigo.set(m.codigo_ibge, m);
    const indice = indiceDa(m.uf);
    for (const variante of variantesDoNome(m.nome)) {
      adicionar(indice.nome, chaveNome(variante), m.codigo_ibge);
      adicionar(indice.compacta, chaveCompacta(variante), m.codigo_ibge);
      adicionar(indice.fonetica, chaveFonetica(variante), m.codigo_ibge);
      indice.aproximado.push([chaveFonetica(variante), m.codigo_ibge]);
    }
  }
  for (const a of dados.apelidos ?? []) {
    if (!porCodigo.has(a.codigo_ibge)) throw new Error(`apelido "${a.nome}"/${a.uf} aponta para código inexistente ${a.codigo_ibge}`);
    const indice = indiceDa(a.uf);
    adicionar(indice.apelido, chaveNome(a.nome), a.codigo_ibge);
    adicionar(indice.compacta, chaveCompacta(a.nome), a.codigo_ibge);
    adicionar(indice.fonetica, chaveFonetica(a.nome), a.codigo_ibge);
    indice.aproximado.push([chaveFonetica(a.nome), a.codigo_ibge]);
  }
  for (const d of dados.distritos ?? []) {
    const municipio = porCodigo.get(d.codigo_ibge);
    if (!municipio) continue;
    const indice = indiceDa(municipio.uf);
    // Um distrito nunca disputa com nome de município da UF (o município sempre vence).
    for (const chave of new Set([chaveNome(d.nome), chaveCompacta(d.nome), chaveFonetica(d.nome)])) {
      if (!indice.nome.has(chave) && !indice.compacta.has(chave) && !indice.fonetica.has(chave)) adicionar(indice.distrito, chave, d.codigo_ibge);
    }
  }

  function preparar(ufBruta: string, cidade: string): { uf: Uf; nome: string; indice: IndiceUf } | null {
    const { nome, ufNoTexto } = limparCidade(cidade ?? "", ufBruta);
    const uf = (ufBruta ?? "").trim().toUpperCase() || ufNoTexto || "";
    if (!ehUf(uf) || nome === "") return null;
    const indice = porUf.get(uf);
    return indice ? { uf, nome, indice } : null;
  }

  function encontrar(ufBruta: string, cidade: string): MunicipioEncontrado | null {
    const consulta = preparar(ufBruta, cidade);
    if (!consulta) return null;
    const { uf: ufTexto, nome, indice } = consulta;
    const achou = (codigo: string | null, metodo: MetodoMunicipio): MunicipioEncontrado | null => {
      const municipio = codigo ? porCodigo.get(codigo) : undefined;
      return municipio ? { municipio, metodo } : null;
    };
    const estrita = chaveNome(nome);
    const compacta = chaveCompacta(nome);
    const fonetica = chaveFonetica(nome);
    const resultado =
      achou(unico(indice.nome, estrita), "nome") ??
      achou(unico(indice.apelido, estrita), "apelido") ??
      achou(unico(indice.compacta, compacta), "grafia") ??
      achou(unico(indice.fonetica, fonetica), "grafia") ??
      achou(unico(indice.distrito, estrita) ?? unico(indice.distrito, compacta) ?? unico(indice.distrito, fonetica), "distrito");
    if (resultado) return resultado;
    // Abreviação ambígua ("S J DOS CAMPOS"): vale se uma única leitura casar com um município.
    const porLeitura = new Set(
      leiturasAbreviadas(estrita)
        .map((leitura) => unico(indice.nome, leitura) ?? unico(indice.apelido, leitura) ?? unico(indice.compacta, chaveCompacta(leitura)) ?? unico(indice.fonetica, chaveFonetica(leitura)))
        .filter((codigo): codigo is string => codigo !== null),
    );
    if (porLeitura.size === 1) return achou([...porLeitura][0] ?? null, "grafia");
    return ufTexto === "DF" ? achou(CODIGO_BRASILIA, "df") : null;
  }

  function sugerir(ufBruta: string, cidade: string): Municipio | null {
    const consulta = preparar(ufBruta, cidade);
    if (!consulta) return null;
    const codigo = aproximado(consulta.indice, chaveFonetica(consulta.nome));
    return codigo ? (porCodigo.get(codigo) ?? null) : null;
  }

  return {
    municipios: [...dados.municipios],
    porCodigo: (codigo) => porCodigo.get(codigo),
    encontrar,
    sugerir,
  };
}

/**
 * Candidato por erro de digitação (só para `sugerir`): até 1 letra de diferença na chave fonética
 * (2 em nomes com 12 letras ou mais), nomes com pelo menos 6 letras, e só se o melhor candidato
 * for único e o segundo estiver pelo menos 1 letra mais longe.
 */
function aproximado(indice: IndiceUf, chave: string): string | null {
  if (chave.length < 6) return null;
  const limite = chave.length >= 12 ? 2 : 1;
  // Menor distância por município (um município pode ter várias chaves: variantes e apelidos).
  const porCodigo = new Map<string, number>();
  for (const [candidata, codigo] of indice.aproximado) {
    const d = distanciaEdicao(chave, candidata, limite + 1);
    porCodigo.set(codigo, Math.min(porCodigo.get(codigo) ?? Infinity, d));
  }
  const ordenados = [...porCodigo].sort((a, b) => a[1] - b[1]);
  const [melhor, segundo] = ordenados;
  if (!melhor || melhor[1] > limite || (segundo && segundo[1] <= melhor[1])) return null;
  return melhor[0];
}

// ---------------------------------------------------------------------------
// Leitura dos arquivos
// ---------------------------------------------------------------------------

/** CSV com cabeçalho na primeira linha → objetos (campos e nomes sem espaços nas bordas e sem BOM). */
export function tabelaCsv(texto: string, separador = ","): Array<Record<string, string>> {
  const [cabecalho, ...resto] = lerCsv(texto, { separador });
  if (!cabecalho) return [];
  const nomes = cabecalho.map((c) => c.trim().replace(/^\uFEFF/, ""));
  return resto
    .filter((l) => l.some((c) => c.trim() !== ""))
    .map((l) => Object.fromEntries(nomes.map((n, i) => [n, (l[i] ?? "").trim()])));
}

function lerTabelaCsv(caminho: string): Array<Record<string, string>> {
  return tabelaCsv(readFileSync(caminho, "utf8"));
}

/** Converte linhas de municipios.csv, conferindo cada campo (lança na primeira linha ruim). */
export function lerMunicipios(linhas: ReadonlyArray<Record<string, string>>): Municipio[] {
  return linhas.map((l, i) => {
    const uf = l.uf ?? "";
    const lat = Number(l.lat);
    const lon = Number(l.lon);
    const raio = l.raio_km ? Number(l.raio_km) : null;
    if (!/^\d{7}$/.test(l.codigo_ibge ?? "") || !ehUf(uf) || !l.nome || !Number.isFinite(lat) || !Number.isFinite(lon) || (raio !== null && !Number.isFinite(raio))) {
      throw new Error(`municipios.csv, linha ${i + 2}: registro inválido (${JSON.stringify(l)})`);
    }
    return { codigo_ibge: l.codigo_ibge as string, uf, nome: l.nome, lat, lon, capital: l.capital === "1", raio_km: raio };
  });
}

/** raios-cnefe.csv → raio (km) por código IBGE (lança na primeira linha ruim). */
export function lerRaios(linhas: ReadonlyArray<Record<string, string>>): Map<string, number> {
  const raios = new Map<string, number>();
  linhas.forEach((l, i) => {
    const raio = Number(l.raio_km);
    if (!/^\d{7}$/.test(l.codigo_ibge ?? "") || !Number.isFinite(raio) || raio <= 0) throw new Error(`raios-cnefe.csv, linha ${i + 2}: registro inválido`);
    raios.set(l.codigo_ibge as string, raio);
  });
  return raios;
}

/** O maior raio entre o da malha (municipios.csv) e o medido no CNEFE (raios-cnefe.csv). */
export function aplicarRaios(municipios: Municipio[], raios: ReadonlyMap<string, number>): Municipio[] {
  return municipios.map((m) => {
    const r = raios.get(m.codigo_ibge);
    return r !== undefined && r > (m.raio_km ?? 0) ? { ...m, raio_km: r } : m;
  });
}

/** Converte linhas de apelidos.csv, conferindo cada campo (lança na primeira linha ruim). */
export function lerApelidos(linhas: ReadonlyArray<Record<string, string>>): Apelido[] {
  return linhas.map((l, i) => {
    const uf = l.uf ?? "";
    if (!ehUf(uf) || !l.nome || !/^\d{7}$/.test(l.codigo_ibge ?? "")) throw new Error(`apelidos.csv, linha ${i + 2}: registro inválido`);
    return { uf, nome: l.nome, codigo_ibge: l.codigo_ibge as string, tipo: l.tipo ?? "", observacao: l.observacao ?? "" };
  });
}

export function carregarTabela(caminhos: { municipios?: string; distritos?: string; apelidos?: string; raios?: string | null } = {}): TabelaMunicipios {
  const raios = caminhos.raios === null ? new Map<string, number>() : lerRaios(lerTabelaCsv(caminhos.raios ?? ARQUIVO_RAIOS));
  const municipios = aplicarRaios(lerMunicipios(lerTabelaCsv(caminhos.municipios ?? ARQUIVO_MUNICIPIOS)), raios);
  const distritos = lerTabelaCsv(caminhos.distritos ?? ARQUIVO_DISTRITOS).map((l) => ({
    codigo_distrito: l.codigo_distrito ?? "",
    codigo_ibge: l.codigo_ibge ?? "",
    nome: l.nome ?? "",
  }));
  const apelidos = lerApelidos(lerTabelaCsv(caminhos.apelidos ?? ARQUIVO_APELIDOS));
  return montarTabela({ municipios, distritos, apelidos });
}

let padrao: TabelaMunicipios | null = null;

/** Tabela dos arquivos de base/geo/, lida uma vez por processo. */
export function tabelaPadrao(): TabelaMunicipios {
  padrao ??= carregarTabela();
  return padrao;
}

/** Atalho: município pela cidade e UF na tabela padrão. */
export function encontrarMunicipio(uf: string, cidade: string): MunicipioEncontrado | null {
  return tabelaPadrao().encontrar(uf, cidade);
}
