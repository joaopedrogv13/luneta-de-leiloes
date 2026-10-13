/**
 * Mede quantas cidades de uma lista casam com a tabela de municípios e lista as que não casaram
 * (candidatas a apelido em apelidos.csv). Lê qualquer CSV com colunas "UF" e "Cidade" (o da
 * Caixa serve como está, em CP1252 ou UTF-8).
 *
 *   node --experimental-strip-types base/geo/medir.ts --arquivo Lista_imoveis_geral.csv [--separador ";"]
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { lerArquivoTexto } from "../util/arquivo.ts";
import { lerCsv } from "../util/csv.ts";
import { tabelaPadrao, type MetodoMunicipio, type TabelaMunicipios } from "./municipios.ts";

export interface MedicaoGeo {
  linhas: number;
  cidades: number;
  linhasCasadas: number;
  cidadesCasadas: number;
  /** Linhas por método de casamento. */
  porMetodo: Record<MetodoMunicipio, number>;
  /** Cidades casadas por método diferente de "nome", para conferência: "UF|Cidade → Município (método)". */
  conferir: string[];
  /** Não casaram: [UF|Cidade, linhas, sugestão por erro de digitação (a conferir) ou null], mais frequentes primeiro. */
  naoCasaram: Array<[string, number, string | null]>;
}

/** Mede o casamento de pares (UF, cidade) com contagem de linhas. */
export function medirCasamento(pares: Iterable<readonly [string, string]>, tabela: TabelaMunicipios = tabelaPadrao()): MedicaoGeo {
  const contagem = new Map<string, number>();
  let linhas = 0;
  for (const [uf, cidade] of pares) {
    linhas++;
    const chave = `${uf.trim().toUpperCase()}|${cidade.trim()}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  const porMetodo: Record<MetodoMunicipio, number> = { nome: 0, apelido: 0, grafia: 0, distrito: 0, df: 0 };
  const medicao: MedicaoGeo = { linhas, cidades: contagem.size, linhasCasadas: 0, cidadesCasadas: 0, porMetodo, conferir: [], naoCasaram: [] };
  for (const [chave, n] of contagem) {
    const [uf = "", cidade = ""] = chave.split("|");
    const achado = tabela.encontrar(uf, cidade);
    if (!achado) {
      const sugestao = tabela.sugerir(uf, cidade);
      medicao.naoCasaram.push([chave, n, sugestao ? `${sugestao.nome} (${sugestao.codigo_ibge})` : null]);
      continue;
    }
    medicao.linhasCasadas += n;
    medicao.cidadesCasadas++;
    porMetodo[achado.metodo] += n;
    if (achado.metodo !== "nome") medicao.conferir.push(`${chave} → ${achado.municipio.nome} (${achado.metodo}, ${n} linha(s))`);
  }
  medicao.naoCasaram.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  medicao.conferir.sort();
  return medicao;
}

/** Pares (UF, Cidade) de um CSV com cabeçalho em qualquer linha (a Caixa tem uma linha de título antes). */
export function paresDoCsv(texto: string, separador = ";"): Array<[string, string]> {
  const linhas = lerCsv(texto, { separador });
  const inicio = linhas.findIndex((l) => {
    const nomes = l.map((c) => c.trim().toLowerCase());
    return nomes.includes("uf") && nomes.includes("cidade");
  });
  if (inicio < 0) throw new Error("CSV sem colunas UF e Cidade");
  const cabecalho = (linhas[inicio] ?? []).map((c) => c.trim().toLowerCase());
  const iUf = cabecalho.indexOf("uf");
  const iCidade = cabecalho.indexOf("cidade");
  return linhas
    .slice(inicio + 1)
    .map((l) => [l[iUf]?.trim() ?? "", l[iCidade]?.trim() ?? ""] as [string, string])
    .filter(([uf, cidade]) => uf !== "" && cidade !== "");
}

export function formatarMedicao(m: MedicaoGeo): string {
  const pct = (a: number, b: number): string => (b === 0 ? "0" : ((100 * a) / b).toFixed(2));
  const linhas = [
    `Linhas: ${m.linhas}; casadas ${m.linhasCasadas} (${pct(m.linhasCasadas, m.linhas)}%)`,
    `Cidades distintas: ${m.cidades}; casadas ${m.cidadesCasadas} (${pct(m.cidadesCasadas, m.cidades)}%)`,
    `Linhas por método: ${Object.entries(m.porMetodo).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
  ];
  if (m.conferir.length > 0) linhas.push("Casadas fora do nome oficial:", ...m.conferir.map((c) => `  ${c}`));
  if (m.naoCasaram.length > 0) {
    linhas.push(
      "Não casaram (sugestão por 1-2 letras de diferença, só para conferir e talvez virar apelido):",
      ...m.naoCasaram.map(([c, n, s]) => `  ${c} (${n} linha(s))${s ? ` · parece ${s}?` : ""}`),
    );
  }
  return linhas.join("\n");
}

async function principal(argv: readonly string[]): Promise<number> {
  const { values: v } = parseArgs({ args: [...argv], strict: true, options: { arquivo: { type: "string" }, separador: { type: "string" } } });
  if (!v.arquivo) {
    process.stderr.write("Uso: medir.ts --arquivo <csv com colunas UF e Cidade> [--separador ;]\n");
    return 2;
  }
  const texto = await lerArquivoTexto(resolve(v.arquivo));
  process.stdout.write(formatarMedicao(medirCasamento(paresDoCsv(texto, v.separador ?? ";"))) + "\n");
  return 0;
}

const executadoDireto = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executadoDireto) {
  principal(process.argv.slice(2)).then(
    (codigo) => {
      process.exitCode = codigo;
    },
    (e: unknown) => {
      process.stderr.write(`Erro: ${(e as Error)?.message ?? String(e)}\n`);
      process.exitCode = 1;
    },
  );
}
