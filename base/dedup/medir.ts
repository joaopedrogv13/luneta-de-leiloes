/**
 * Mede a deduplicação por endereço num CSV da Caixa (o arquivo não é gravado nem commitado):
 *
 * 1. Cobertura: quantos imóveis ganham chave e por que os outros não ganham.
 * 2. Grupos dentro da própria Caixa (mesma chave em N° de imóvel diferentes) e uma estimativa de
 *    precisão: o grupo é "consistente" quando todos têm o mesmo tipo e a mesma área (privativa,
 *    ou do terreno quando não há privativa, com 2% de tolerância). É um limite superior: dois
 *    apartamentos iguais no mesmo prédio, sem número de apartamento, parecem consistentes.
 * 3. Robustez a formato: cada endereço é reescrito como um leiloeiro escreveria ("RUA" → "R.",
 *    "N. S/N" → "s/nº", "LT 10 QD 272" → "Quadra 272, Lote 10", bairro "JARDIM X" → "Jd. X") e
 *    conta-se quantas reescritas caem na mesma chave (recall) e quantas caem na chave de OUTRO
 *    imóvel (junção errada).
 *
 *   node --experimental-strip-types base/dedup/medir.ts --arquivo Lista_imoveis_geral.csv [--exemplos 20]
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { lerArquivoTexto } from "../util/arquivo.ts";
import { lerCsv } from "../util/csv.ts";
import { chaveEndereco, motivoSemChave, type ModoBairro } from "./index.ts";

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

function consistente(grupo: readonly LinhaCaixa[]): boolean {
  const perfis = grupo.map((l) => perfil(l.descricao));
  const [p0] = perfis;
  if (!p0) return true;
  return perfis.every((p) => p.tipo === p0.tipo && Math.abs(p.area - p0.area) <= 0.02 * Math.max(p.area, p0.area, 1));
}

function titulo(texto: string): string {
  return texto.toLowerCase().replace(/(^|[\s,(/-])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toUpperCase());
}

/** O endereço como um leiloeiro escreveria (ver o topo do arquivo). */
export function reescrever(endereco: string): string {
  let t = ` ${endereco.trim()} `;
  t = t
    .replace(/,?\s*N\.\s*(?:S\/N[º°]?|SN)\s*(?=,|$|\s)/gi, ", s/nº")
    .replace(/,?\s*N\.\s*(\d+)/gi, ", nº $1")
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

function reescreverBairro(bairro: string): string {
  return titulo(bairro.replace(/\bJARDIM\b/i, "Jd.").replace(/\bPARQUE\b/i, "Pq.").replace(/\bVILA\b/i, "Vl."));
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
  reescritas: number;
  reescritasMesmaChave: number;
  reescritasOutroImovel: number;
  exemplosDivergentes: string[];
  exemplosRecallPerdido: string[];
}

export function medirDedup(linhas: readonly LinhaCaixa[], modo: ModoBairro = "quando_fraco", maxExemplos = 15): MedicaoDedup {
  const m: MedicaoDedup = {
    imoveis: linhas.length, comChave: 0, semChave: {}, grupos: 0, imoveisEmGrupos: 0, gruposConsistentes: 0,
    gruposComModalidadesDiferentes: 0, gruposComBairrosDiferentes: 0, reescritas: 0, reescritasMesmaChave: 0,
    reescritasOutroImovel: 0, exemplosDivergentes: [], exemplosRecallPerdido: [],
  };
  const porChave = new Map<string, LinhaCaixa[]>();
  const chaveDe = new Map<LinhaCaixa, string>();
  for (const l of linhas) {
    const chave = chaveEndereco({ uf: l.uf, cidade: l.cidade, bairro: l.bairro, endereco: l.endereco }, undefined, modo);
    if (!chave) {
      const motivo = motivoSemChave(l.endereco) ?? "outro";
      m.semChave[motivo] = (m.semChave[motivo] ?? 0) + 1;
      continue;
    }
    m.comChave++;
    chaveDe.set(l, chave);
    porChave.set(chave, [...(porChave.get(chave) ?? []), l]);
  }
  for (const [chave, grupo] of porChave) {
    if (grupo.length < 2) continue;
    m.grupos++;
    m.imoveisEmGrupos += grupo.length;
    if (consistente(grupo)) m.gruposConsistentes++;
    else if (m.exemplosDivergentes.length < maxExemplos) {
      m.exemplosDivergentes.push(`${chave}\n${grupo.map((l) => `    ${l.id} | ${l.bairro} | ${l.endereco} | ${l.descricao.slice(0, 70)}`).join("\n")}`);
    }
    if (new Set(grupo.map((l) => l.modalidade)).size > 1) m.gruposComModalidadesDiferentes++;
    if (new Set(grupo.map((l) => l.bairro)).size > 1) m.gruposComBairrosDiferentes++;
  }
  for (const [l, chave] of chaveDe) {
    const variante = chaveEndereco({ uf: l.uf, cidade: titulo(l.cidade), bairro: reescreverBairro(l.bairro), endereco: reescrever(l.endereco) }, undefined, modo);
    m.reescritas++;
    if (variante === chave) m.reescritasMesmaChave++;
    else {
      if (variante && porChave.has(variante)) m.reescritasOutroImovel++;
      if (m.exemplosRecallPerdido.length < maxExemplos) m.exemplosRecallPerdido.push(`${l.endereco}  →  ${reescrever(l.endereco)}\n    ${chave}\n    ${variante ?? "(sem chave)"}`);
    }
  }
  return m;
}

export function formatarMedicaoDedup(m: MedicaoDedup, modo: string): string {
  const pct = (a: number, b: number): string => (b === 0 ? "0" : ((100 * a) / b).toFixed(2));
  return [
    `Modo do bairro: ${modo}`,
    `Imóveis: ${m.imoveis}; com chave de endereço ${m.comChave} (${pct(m.comChave, m.imoveis)}%)`,
    `Sem chave: ${Object.entries(m.semChave).map(([k, v]) => `${k} ${v}`).join(" · ") || "nenhum"}`,
    `Grupos (mesma chave, N° diferentes): ${m.grupos} com ${m.imoveisEmGrupos} imóveis; consistentes ${m.gruposConsistentes} (${pct(m.gruposConsistentes, m.grupos)}%), modalidades diferentes ${m.gruposComModalidadesDiferentes}, bairros diferentes ${m.gruposComBairrosDiferentes}`,
    `Reescrita estilo leiloeiro: mesma chave ${m.reescritasMesmaChave}/${m.reescritas} (${pct(m.reescritasMesmaChave, m.reescritas)}%); caiu na chave de outro imóvel ${m.reescritasOutroImovel}`,
    ...(m.exemplosDivergentes.length > 0 ? ["Grupos divergentes (exemplos):", ...m.exemplosDivergentes.map((e) => `  ${e}`)] : []),
    ...(m.exemplosRecallPerdido.length > 0 ? ["Reescritas que mudaram a chave (exemplos):", ...m.exemplosRecallPerdido.map((e) => `  ${e}`)] : []),
  ].join("\n");
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
    process.stdout.write(formatarMedicaoDedup(medirDedup(linhas, modo, modo === "quando_fraco" ? exemplos : 0), modo) + "\n\n");
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
