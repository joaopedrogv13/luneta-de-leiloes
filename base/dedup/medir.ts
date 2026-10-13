/**
 * Mede a deduplicação por endereço num CSV da Caixa (o arquivo não é gravado nem commitado):
 *
 * 1. Cobertura: quantos imóveis ganham chave e por que os outros não ganham.
 * 2. Grupos dentro da própria Caixa (mesma chave em N° de imóvel diferentes) e uma estimativa de
 *    precisão: o grupo é "consistente" quando todos têm o mesmo tipo e a mesma área (privativa,
 *    ou do terreno quando não há privativa, com 2% de tolerância). É um limite superior: dois
 *    apartamentos iguais no mesmo prédio, sem número de apartamento, parecem consistentes.
 * 3. Robustez a formato: cada endereço é reescrito como outra fonte escreveria e conta-se quantas
 *    reescritas caem na mesma chave (recall), quantas ficam sem chave, quantas caem na chave de
 *    OUTRO imóvel da Caixa (junção errada) e quantos grupos as reescritas formam entre si com
 *    imóveis de tipo ou área diferente. Estilos (ESTILOS, abaixo):
 *    - leiloeiro: "RUA" → "R.", "N. S/N" → "s/nº", "LT 10 QD 272" → "Quadra 272, Lote 10", "Apto" →
 *      "apartamento", bairro "JARDIM X" → "Jd. X";
 *    - unidade_com_numero: "Apto 91" → "apartamento nº 91", "CASA 2" → "casa nº 2", "LT 5" →
 *      "lote nº 5", "QD 3" → "quadra nº 3", "VG 10" → "vaga nº 10";
 *    - sem_marcador: "Rua X, 62, Apto 1, <bairro>, <cidade>/<UF>" (como a Leilões Judiciais
 *      extrai do texto), com o bairro só no texto e, à parte, também informado em campo próprio;
 *    - sem_marcador_tracos: "Rua X, 62 - Apto 1 - <bairro> - <cidade>/<UF>", bairro só no texto.
 *
 *   node --experimental-strip-types base/dedup/medir.ts --arquivo Lista_imoveis_geral.csv [--exemplos 20]
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { lerArquivoTexto } from "../util/arquivo.ts";
import { lerCsv } from "../util/csv.ts";
import { chaveEndereco, motivoSemChave, type DadosChave, type ModoBairro } from "./index.ts";

export interface LinhaCaixa {
  id: string;
  uf: string;
  cidade: string;
  bairro: string;
  endereco: string;
  descricao: string;
  modalidade: string;
}

/** Linhas do CSV da Caixa (cabeçalho "N° do imóvel;UF;Cidade;Bairro;Endereço;...;Descrição;Modalidade de venda"). */
export function linhasCaixa(texto: string): LinhaCaixa[] {
  const linhas = lerCsv(texto);
  const inicio = linhas.findIndex((l) => l.some((c) => c.trim().toLowerCase() === "uf") && l.some((c) => c.trim().toLowerCase().startsWith("endere")));
  if (inicio < 0) throw new Error("não parece o CSV da Caixa (sem cabeçalho UF/Endereço)");
  const cab = (linhas[inicio] ?? []).map((c) => c.trim().toLowerCase());
  const col = (prefixo: string): number => cab.findIndex((c) => c.startsWith(prefixo));
  const [iId, iUf, iCidade, iBairro, iEnd, iDesc, iMod] = [col("n"), col("uf"), col("cidade"), col("bairro"), col("endere"), col("descri"), col("modalidade")];
  return linhas
    .slice(inicio + 1)
    .filter((l) => (l[iUf] ?? "").trim() !== "")
    .map((l) => ({
      id: (l[iId] ?? "").trim(),
      uf: (l[iUf] ?? "").trim(),
      cidade: (l[iCidade] ?? "").trim(),
      bairro: (l[iBairro] ?? "").trim(),
      endereco: (l[iEnd] ?? "").trim(),
      descricao: (l[iDesc] ?? "").trim(),
      modalidade: (l[iMod] ?? "").trim(),
    }));
}

/** Tipo e áreas da descrição da Caixa ("Casa, 0.00 de área total, 88.69 de área privativa, 176.00 de área do terreno, ..."). */
export function perfil(descricao: string): { tipo: string; area: number } {
  const tipo = (/^([^,]+)/.exec(descricao)?.[1] ?? "").trim().toLowerCase();
  const privativa = Number(/([\d.]+) de área privativa/.exec(descricao)?.[1] ?? 0);
  const terreno = Number(/([\d.]+) de área do terreno/.exec(descricao)?.[1] ?? 0);
  return { tipo, area: privativa > 0 ? privativa : terreno };
}

/** Todos com o mesmo tipo e a mesma área (2% de tolerância). */
export function consistente(grupo: readonly LinhaCaixa[]): boolean {
  const perfis = grupo.map((l) => perfil(l.descricao));
  const [p0] = perfis;
  if (!p0) return true;
  return perfis.every((p) => p.tipo === p0.tipo && Math.abs(p.area - p0.area) <= 0.02 * Math.max(p.area, p0.area, 1));
}

function titulo(texto: string): string {
  return texto.toLowerCase().replace(/(^|[\s,(/-])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toUpperCase());
}

/** O endereço como um leiloeiro escreveria (estilo "leiloeiro"; ver o topo do arquivo). */
export function reescrever(endereco: string): string {
  let t = ` ${endereco.trim()} `;
  t = t
    // Só o primeiro "N." (o do número da casa; "LOTE N.17" fica).
    .replace(/,?\s*\bN\.\s*(?:S\/N[º°]?|SN)\s*(?=,|$|\s)/i, ", s/nº")
    .replace(/,\s*\bN\.\s*(\d+)/i, ", nº $1")
    .replace(/^\s*RUA\b/i, "R.")
    .replace(/^\s*AVENIDA\b/i, "Av.")
    .replace(/^\s*TRAVESSA\b/i, "Tv.")
    .replace(/^\s*RODOVIA\b/i, "Rod.")
    .replace(/\bAPTO\b/gi, "apartamento")
    .replace(/\bBL\b/gi, "Bloco")
    .replace(/\bCS\b/gi, "Casa");
  // "..., LT 10 QD 272" no fim → "..., Quadra 272, Lote 10" (a ordem muda entre fontes). Só com
  // valores simples; nos outros casos ("LTS 1 A 12", "LT 39-B") só o rótulo vai por extenso.
  const valor = "([0-9]{1,4}[A-Z]?|[A-Z])";
  const quadra = "(?:QD|QUADRA|QUARTEIR[AÃ]O)";
  const loteQuadra = new RegExp(`,?\\s*(?:LT|LOTE)\\s+${valor}\\s*,?\\s*${quadra}\\s+${valor}\\s*,?\\s*$`, "i").exec(t);
  const quadraLote = new RegExp(`,?\\s*${quadra}\\s+${valor}\\s*,?\\s*(?:LT|LOTE)\\s+${valor}\\s*,?\\s*$`, "i").exec(t);
  if (loteQuadra && loteQuadra.index > 0) t = `${t.slice(0, loteQuadra.index)}, Quadra ${loteQuadra[2]}, Lote ${loteQuadra[1]}`;
  else if (quadraLote && quadraLote.index > 0) t = `${t.slice(0, quadraLote.index)}, Lote ${quadraLote[2]}, Quadra ${quadraLote[1]}`;
  else t = t.replace(/\bLT\b/gi, "Lote").replace(/\bQD\b/gi, "Quadra");
  return titulo(t.replace(/\s+/g, " ").trim());
}

/** Unidades com "nº" entre o rótulo e o valor (estilo "unidade_com_numero"): "Apto 91" → "apartamento nº 91". */
export function reescreverUnidadeComNumero(endereco: string): string {
  return endereco
    .replace(/\b(?:APTO|APT|APARTAMENTO)\.?\s+(?=\d)/gi, "apartamento nº ")
    .replace(/\b(?:CASA|CS)\.?\s+(?=\d)/gi, "casa nº ")
    .replace(/\b(?:LOTE|LT)\.?\s+(?=\d)/gi, "lote nº ")
    .replace(/\b(?:QUADRA|QD)\.?\s+(?=\d)/gi, "quadra nº ")
    .replace(/\b(?:VAGA|VG)\.?\s+(?=\d)/gi, "vaga nº ");
}

/**
 * Sem marcador de número, com bairro e cidade no fim (estilo "sem_marcador"): "RUA X, N. 62, Apto 1"
 * → "Rua X, 62, Apto 1, Jardim Y, Cidade/UF"; com `tracos`, "Rua X, 62 - Apto 1 - Jardim Y - Cidade/UF".
 */
export function reescreverSemMarcador(l: Pick<LinhaCaixa, "endereco" | "bairro" | "cidade" | "uf">, tracos = false): string {
  const m = /^(.*?),\s*\bN\.\s*(S\/N[º°]?|SN|[^,]*?)\s*(?:,(.*))?$/i.exec(l.endereco.trim());
  const logradouro = (m?.[1] ?? l.endereco).trim();
  const numero = m ? (/^(?:S\/N[º°]?|SN)$/i.test(m[2] ?? "") ? "s/nº" : (m[2] ?? "").trim()) : "";
  const resto = (m?.[3] ?? "").split(",").map((c) => c.trim()).filter((c) => c !== "");
  const lugar = [l.bairro.trim(), `${titulo(l.cidade.trim())}/${l.uf.trim()}`].filter((c) => c !== "" && c !== "/");
  const texto = tracos
    ? [`${logradouro}${numero ? `, ${numero}` : ""}`, ...resto, ...lugar].join(" - ")
    : [logradouro, numero, ...resto, ...lugar].filter((c) => c !== "").join(", ");
  return titulo(texto.replace(/\s+/g, " "));
}

function reescreverBairro(bairro: string): string {
  return titulo(bairro.replace(/\bJARDIM\b/i, "Jd.").replace(/\bPARQUE\b/i, "Pq.").replace(/\bVILA\b/i, "Vl."));
}

export interface EstiloReescrita {
  nome: string;
  /** Os dados de chave como a outra fonte mandaria (endereço reescrito; bairro em campo ou não). */
  reescrever: (l: LinhaCaixa) => DadosChave;
}

export const ESTILOS: readonly EstiloReescrita[] = [
  { nome: "leiloeiro", reescrever: (l) => ({ uf: l.uf, cidade: titulo(l.cidade), bairro: reescreverBairro(l.bairro), endereco: reescrever(l.endereco) }) },
  { nome: "unidade_com_numero", reescrever: (l) => ({ uf: l.uf, cidade: l.cidade, bairro: l.bairro, endereco: reescreverUnidadeComNumero(l.endereco) }) },
  { nome: "sem_marcador (bairro só no texto)", reescrever: (l) => ({ uf: l.uf, cidade: titulo(l.cidade), bairro: null, endereco: reescreverSemMarcador(l) }) },
  { nome: "sem_marcador (bairro também em campo)", reescrever: (l) => ({ uf: l.uf, cidade: titulo(l.cidade), bairro: titulo(l.bairro), endereco: reescreverSemMarcador(l) }) },
  { nome: "sem_marcador_tracos (bairro só no texto)", reescrever: (l) => ({ uf: l.uf, cidade: titulo(l.cidade), bairro: null, endereco: reescreverSemMarcador(l, true) }) },
];

export interface MedicaoReescrita {
  estilo: string;
  /** Imóveis com chave no original (os que entram na conta). */
  reescritas: number;
  mesmaChave: number;
  semChave: number;
  /** A reescrita caiu na chave original de OUTRO imóvel da Caixa. */
  outroImovel: number;
  /** Grupos que as reescritas formam entre si, e quantos juntam tipo ou área diferente. */
  grupos: number;
  gruposInconsistentes: number;
  exemplosPerdidos: string[];
  exemplosOutroImovel: string[];
}

export interface MedicaoDedup {
  imoveis: number;
  comChave: number;
  semChave: Record<string, number>;
  grupos: number;
  imoveisEmGrupos: number;
  gruposConsistentes: number;
  gruposComModalidadesDiferentes: number;
  gruposComBairrosDiferentes: number;
  exemplosDivergentes: string[];
  reescritas: MedicaoReescrita[];
}

/** Função de chave a medir (a padrão é a da base; medir.ts aceita outra para comparar versões). */
export type FuncaoChave = (dados: DadosChave, modo: ModoBairro) => string | null;

const chavePadrao: FuncaoChave = (dados, modo) => chaveEndereco(dados, undefined, modo);

export function medirDedup(
  linhas: readonly LinhaCaixa[],
  modo: ModoBairro = "quando_fraco",
  maxExemplos = 15,
  opcoes: { chave?: FuncaoChave; estilos?: readonly EstiloReescrita[] } = {},
): MedicaoDedup {
  const chave = opcoes.chave ?? chavePadrao;
  const m: MedicaoDedup = {
    imoveis: linhas.length, comChave: 0, semChave: {}, grupos: 0, imoveisEmGrupos: 0, gruposConsistentes: 0,
    gruposComModalidadesDiferentes: 0, gruposComBairrosDiferentes: 0, exemplosDivergentes: [], reescritas: [],
  };
  const porChave = new Map<string, LinhaCaixa[]>();
  const chaveDe = new Map<LinhaCaixa, string>();
  for (const l of linhas) {
    const c = chave({ uf: l.uf, cidade: l.cidade, bairro: l.bairro, endereco: l.endereco }, modo);
    if (!c) {
      const motivo = motivoSemChave(l.endereco, { uf: l.uf, cidade: l.cidade, bairro: l.bairro }) ?? "outro";
      m.semChave[motivo] = (m.semChave[motivo] ?? 0) + 1;
      continue;
    }
    m.comChave++;
    chaveDe.set(l, c);
    porChave.set(c, [...(porChave.get(c) ?? []), l]);
  }
  for (const [c, grupo] of porChave) {
    if (grupo.length < 2) continue;
    m.grupos++;
    m.imoveisEmGrupos += grupo.length;
    if (consistente(grupo)) m.gruposConsistentes++;
    else if (m.exemplosDivergentes.length < maxExemplos) {
      m.exemplosDivergentes.push(`${c}\n${grupo.map((l) => `    ${l.id} | ${l.bairro} | ${l.endereco} | ${l.descricao.slice(0, 70)}`).join("\n")}`);
    }
    if (new Set(grupo.map((l) => l.modalidade)).size > 1) m.gruposComModalidadesDiferentes++;
    if (new Set(grupo.map((l) => l.bairro)).size > 1) m.gruposComBairrosDiferentes++;
  }
  for (const estilo of opcoes.estilos ?? ESTILOS) {
    const r: MedicaoReescrita = {
      estilo: estilo.nome, reescritas: 0, mesmaChave: 0, semChave: 0, outroImovel: 0, grupos: 0, gruposInconsistentes: 0,
      exemplosPerdidos: [], exemplosOutroImovel: [],
    };
    const porVariante = new Map<string, LinhaCaixa[]>();
    for (const [l, original] of chaveDe) {
      const dados = estilo.reescrever(l);
      const variante = chave(dados, modo);
      r.reescritas++;
      if (variante) porVariante.set(variante, [...(porVariante.get(variante) ?? []), l]);
      if (variante === original) {
        r.mesmaChave++;
        continue;
      }
      if (!variante) r.semChave++;
      else if (porChave.has(variante)) {
        r.outroImovel++;
        if (r.exemplosOutroImovel.length < maxExemplos) {
          const outro = porChave.get(variante)?.[0];
          r.exemplosOutroImovel.push(`${dados.endereco}  =  ${outro?.endereco ?? "?"}\n    ${variante}`);
        }
      }
      if (r.exemplosPerdidos.length < maxExemplos) r.exemplosPerdidos.push(`${l.endereco}  →  ${dados.endereco}\n    ${original}\n    ${variante ?? "(sem chave)"}`);
    }
    for (const grupo of porVariante.values()) {
      if (grupo.length < 2) continue;
      r.grupos++;
      if (!consistente(grupo)) r.gruposInconsistentes++;
    }
    m.reescritas.push(r);
  }
  return m;
}

export function formatarMedicaoDedup(m: MedicaoDedup, modo: string): string {
  const pct = (a: number, b: number): string => (b === 0 ? "0" : ((100 * a) / b).toFixed(2));
  const linhas = [
    `Modo do bairro: ${modo}`,
    `Imóveis: ${m.imoveis}; com chave de endereço ${m.comChave} (${pct(m.comChave, m.imoveis)}%)`,
    `Sem chave: ${Object.entries(m.semChave).map(([k, v]) => `${k} ${v}`).join(" · ") || "nenhum"}`,
    `Grupos (mesma chave, N° diferentes): ${m.grupos} com ${m.imoveisEmGrupos} imóveis; consistentes ${m.gruposConsistentes} (${pct(m.gruposConsistentes, m.grupos)}%), modalidades diferentes ${m.gruposComModalidadesDiferentes}, bairros diferentes ${m.gruposComBairrosDiferentes}`,
    ...(m.exemplosDivergentes.length > 0 ? ["Grupos divergentes (exemplos):", ...m.exemplosDivergentes.map((e) => `  ${e}`)] : []),
  ];
  for (const r of m.reescritas) {
    linhas.push(
      `Reescrita ${r.estilo}: mesma chave ${r.mesmaChave}/${r.reescritas} (${pct(r.mesmaChave, r.reescritas)}%); sem chave ${r.semChave}; `
        + `caiu na chave de outro imóvel ${r.outroImovel}; grupos entre reescritas ${r.grupos}, com tipo/área diferente ${r.gruposInconsistentes}`,
    );
    if (r.exemplosOutroImovel.length > 0) linhas.push("  Caiu na chave de outro imóvel (exemplos):", ...r.exemplosOutroImovel.map((e) => `    ${e}`));
    if (r.exemplosPerdidos.length > 0) linhas.push("  Mudou de chave (exemplos):", ...r.exemplosPerdidos.map((e) => `    ${e}`));
  }
  return linhas.join("\n");
}

async function principal(argv: readonly string[]): Promise<number> {
  const { values: v } = parseArgs({ args: [...argv], strict: true, options: { arquivo: { type: "string" }, exemplos: { type: "string" } } });
  if (!v.arquivo) {
    process.stderr.write("Uso: medir.ts --arquivo <CSV da Caixa> [--exemplos N]\n");
    return 2;
  }
  const linhas = linhasCaixa(await lerArquivoTexto(resolve(v.arquivo)));
  const exemplos = v.exemplos ? Number(v.exemplos) : 10;
  for (const modo of ["quando_fraco", "nunca", "sempre"] as const) {
    const medicao = medirDedup(linhas, modo, modo === "quando_fraco" ? exemplos : 0, { estilos: modo === "quando_fraco" ? ESTILOS : [] });
    process.stdout.write(formatarMedicaoDedup(medicao, modo) + "\n\n");
  }
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
