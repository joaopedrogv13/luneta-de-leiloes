/**
 * Leitura e validação da "Lista de Imóveis da Caixa" (CSV oficial).
 *
 * Formato (medido no arquivo geral de 08/10/2026 e no do AC de 07/10/2026):
 * - Windows-1252 (CP1252), separador ";", sem aspas, todos os campos com espaços nas bordas;
 * - uma linha em branco, depois " Lista de Imóveis da Caixa;;Data de geração:;08/10/2026;;;;;;;";
 * - o cabeçalho na linha seguinte, uma linha em branco e os dados (12 colunas).
 *
 * Esta etapa só confere a estrutura e devolve as linhas como texto (por nome de coluna).
 * Qualquer sinal de arquivo errado (página de desafio anti-robô, assinatura ausente, data
 * inválida, cabeçalho diferente, última linha cortada) lança erro, para que nada seja gravado.
 */
import { decodificar } from "../../util/arquivo.ts";
import { lerDataBR } from "../../util/data.ts";
import { normalizarTexto } from "../../util/texto.ts";

/** Colunas do CSV, pelo nome canônico usado no conector. */
export const COLUNAS = {
  numero: "N° do imóvel",
  uf: "UF",
  cidade: "Cidade",
  bairro: "Bairro",
  endereco: "Endereço",
  preco: "Preço",
  avaliacao: "Valor de avaliação",
  desconto: "Desconto",
  financiamento: "Financiamento",
  descricao: "Descrição",
  modalidade: "Modalidade de venda",
  link: "Link de acesso",
} as const;
export type ColunaCaixa = keyof typeof COLUNAS;
export type LinhaCaixa = Record<ColunaCaixa, string>;

/** Colunas sem as quais a linha não serve. */
const OBRIGATORIAS: readonly ColunaCaixa[] = ["numero", "uf", "cidade", "endereco", "preco", "avaliacao", "descricao", "modalidade"];

export interface RegistroLista {
  /** Número da linha no arquivo (1 = primeira linha). */
  linhaArquivo: number;
  campos: LinhaCaixa;
  /** Problema estrutural da linha (ex.: colunas a mais); o conector recusa o registro. */
  problema: string | null;
}

export interface ListaCaixa {
  /** "AAAA-MM-DD", da "Data de geração" do arquivo. */
  geradoEm: string;
  registros: RegistroLista[];
  /** Colunas que o arquivo trouxe além das conhecidas (aviso de mudança de formato). */
  colunasExtras: string[];
}

/** Marcas de página de desafio anti-robô (Radware Bot Manager / ShieldSquare / perfdrive). */
const MARCAS_DESAFIO = [/perfdrive/i, /shieldsquare/i, /radware/i, /bot manager/i, /captcha/i, /SSJSInternal/];

/** A marca de desafio anti-robô encontrada no texto, ou null. */
export function marcaDeDesafio(texto: string): string | null {
  return MARCAS_DESAFIO.find((marca) => marca.test(texto))?.source ?? null;
}

/** Devolve o motivo se o texto parece uma página de bloqueio ou HTML em vez do CSV. */
export function pareceBloqueio(texto: string): string | null {
  const inicio = texto.slice(0, 4096);
  const marca = marcaDeDesafio(inicio);
  if (marca) return `página de desafio anti-robô (${marca}) no lugar do conteúdo`;
  if (/^\s*<(!doctype|html|head|body)\b/i.test(inicio)) return "veio HTML no lugar do CSV";
  return null;
}

/** Nome de coluna comparável: sem acento, minúsculo, "n°"/"nº"/"no" iguais. */
function chaveColuna(nome: string): string {
  return normalizarTexto(nome).replace(/^n\s*[°º.o]\s*/, "n ").replace(/\s+/g, " ");
}

const POR_CHAVE: ReadonlyMap<string, ColunaCaixa> = new Map(
  (Object.entries(COLUNAS) as Array<[ColunaCaixa, string]>).map(([coluna, nome]) => [chaveColuna(nome), coluna]),
);

/**
 * Decodifica os bytes do CSV: UTF-8 se for UTF-8 válido (cópias convertidas), senão
 * Windows-1252 (o arquivo oficial). Recusa texto com "mojibake" (UTF-8 lido como CP1252).
 */
export function decodificarLista(bytes: Uint8Array): string {
  let texto = decodificar(bytes, "auto");
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  return texto;
}

/**
 * Interpreta o texto do CSV e valida a estrutura. Lança erro com o motivo quando o arquivo
 * não é a lista da Caixa ou está incompleto.
 */
export function interpretarLista(texto: string): ListaCaixa {
  const bloqueio = pareceBloqueio(texto);
  if (bloqueio) throw new Error(`Lista da Caixa recusada: ${bloqueio}.`);
  if (/Ã[\u0080-¿]/.test(texto.slice(0, 2000))) {
    throw new Error("Lista da Caixa recusada: acentos corrompidos (UTF-8 lido como Windows-1252?).");
  }
  // O arquivo não usa aspas: separar à mão evita que um '"' solto num endereço junte linhas.
  const linhas = texto.split(/\r?\n/).map((l) => l.split(";"));
  const indiceAssinatura = linhas.findIndex((l) => l.some((c) => c.trim() !== ""));
  const assinatura = linhas[indiceAssinatura] ?? [];
  if (!(assinatura[0] ?? "").trim().startsWith("Lista de Im")) {
    throw new Error(`Lista da Caixa recusada: assinatura "Lista de Im..." ausente (começa com ${JSON.stringify((assinatura[0] ?? "").trim().slice(0, 40))}).`);
  }
  const posRotulo = assinatura.findIndex((c) => /data de gera/i.test(normalizarTexto(c)));
  const dataTexto = posRotulo >= 0 ? assinatura.slice(posRotulo + 1).find((c) => c.trim() !== "") ?? "" : "";
  const geradoEm = lerDataBR(dataTexto.trim());
  if (!geradoEm) throw new Error(`Lista da Caixa recusada: "Data de geração" ausente ou inválida (${JSON.stringify(dataTexto.trim())}).`);

  const indiceCabecalho = linhas.findIndex((l, i) => i > indiceAssinatura && l.some((c) => c.trim() !== ""));
  const cabecalho = (linhas[indiceCabecalho] ?? []).map((c) => c.trim());
  const posicoes = new Map<ColunaCaixa, number>();
  const colunasExtras: string[] = [];
  cabecalho.forEach((nome, i) => {
    if (nome === "") return;
    const coluna = POR_CHAVE.get(chaveColuna(nome));
    if (coluna && !posicoes.has(coluna)) posicoes.set(coluna, i);
    else colunasExtras.push(nome);
  });
  const faltando = OBRIGATORIAS.filter((c) => !posicoes.has(c)).map((c) => COLUNAS[c]);
  if (faltando.length > 0) {
    throw new Error(`Lista da Caixa recusada: cabeçalho sem ${faltando.join(", ")} (formato mudou?).`);
  }
  const larguraCabecalho = cabecalho.length;

  const registros: RegistroLista[] = [];
  for (let i = indiceCabecalho + 1; i < linhas.length; i++) {
    const campos = linhas[i] ?? [];
    if (campos.every((c) => c.trim() === "")) continue;
    const linha = {} as LinhaCaixa;
    for (const coluna of Object.keys(COLUNAS) as ColunaCaixa[]) {
      const pos = posicoes.get(coluna);
      linha[coluna] = pos === undefined ? "" : (campos[pos] ?? "").trim();
    }
    let problema: string | null = null;
    if (campos.length > larguraCabecalho) problema = `${campos.length} colunas, o cabeçalho tem ${larguraCabecalho} (";" dentro de um campo?)`;
    else if (campos.length < larguraCabecalho) problema = `${campos.length} colunas, o cabeçalho tem ${larguraCabecalho}`;
    registros.push({ linhaArquivo: i + 1, campos: linha, problema });
  }
  // Arquivo cortado no meio: a última linha vem com menos colunas, ou o link final fica pela metade.
  const ultima = registros[registros.length - 1];
  if (ultima) {
    const curta = (linhas[ultima.linhaArquivo - 1]?.length ?? 0) < larguraCabecalho;
    const semQuebraFinal = !/\n\s*$/.test(texto);
    const linkInteiro = !posicoes.has("link") || ultima.campos.link === "" ||
      new RegExp(`hdnimovel=0*${ultima.campos.numero.replace(/\D/g, "").replace(/^0+/, "")}$`).test(ultima.campos.link);
    if (curta || (semQuebraFinal && !linkInteiro)) {
      throw new Error(`Lista da Caixa recusada: a última linha (${ultima.linhaArquivo}) está incompleta; arquivo truncado.`);
    }
  }
  return { geradoEm, registros, colunasExtras };
}
