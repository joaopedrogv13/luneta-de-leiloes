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
 *
 * Como o arquivo não usa aspas, um ";" dentro do endereço ou da descrição desloca as colunas.
 * Com o cabeçalho na ordem conhecida, a linha é recuperada: ancorada pelo número e UF no
 * começo, pelo link e modalidade no fim e pelo bloco Preço;Avaliação;Desconto;Financiamento
 * no meio, o excedente volta para o Endereço ou a Descrição (recuperarLinha).
 *
 * O arquivo geral vem em ordem de UF (AC...TO; conferido no de 08/10/2026). Um corte exato numa
 * quebra de linha passa pela checagem da última linha, mas tira as últimas UFs: resumirUfs
 * dá o que o conector precisa para recusar (index.ts).
 */
import { decodificar } from "../../util/arquivo.ts";
import { lerDataBR } from "../../util/data.ts";
import { normalizarTexto } from "../../util/texto.ts";
import { normalizarUf } from "../../util/uf.ts";

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
  /** A linha tinha ";" a mais e foi recuperada (diz onde o excedente foi parar). */
  recuperada?: string;
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

const ORDEM_CANONICA: readonly ColunaCaixa[] = Object.keys(COLUNAS) as ColunaCaixa[];
const DINHEIRO = /^\s*\d{1,3}(?:\.\d{3})*,\d{2}\s*$/;
const PERCENTUAL = /^\s*-?\d+(?:\.\d+)?\s*$/;
const SIM_NAO = /^\s*(?:sim|n[ãa]o)\s*$/i;

/**
 * Linha com ";" a mais (o arquivo não usa aspas): recupera pelo começo (número, UF, cidade,
 * bairro), pelo fim (modalidade e link do mesmo imóvel) e pelo bloco numérico
 * Preço;Avaliação;Desconto;Financiamento, que precisa aparecer uma vez só. O que sobrar antes
 * do bloco volta para o Endereço; o que sobrar depois, para a Descrição. Só vale com o
 * cabeçalho na ordem conhecida; senão devolve null (a linha fica com problema).
 */
export function recuperarLinha(campos: readonly string[], posicoes: ReadonlyMap<ColunaCaixa, number>): { linha: LinhaCaixa; onde: string } | null {
  const largura = ORDEM_CANONICA.length;
  if (campos.length <= largura || !ORDEM_CANONICA.every((c, i) => posicoes.get(c) === i)) return null;
  const n = campos.length;
  const numero = (campos[0] ?? "").trim().replace(/^0+/, "");
  const link = (campos[n - 1] ?? "").trim();
  if (!/^\d+$/.test(numero) || !new RegExp(`hdnimovel=0*${numero}$`).test(link)) return null;
  const ancoras: number[] = [];
  // O preço vem depois de número, UF, cidade, bairro e ao menos um campo de endereço; a
  // descrição tem ao menos um campo antes de modalidade e link.
  for (let k = 5; k + 4 <= n - 3; k++) {
    if (DINHEIRO.test(campos[k] ?? "") && DINHEIRO.test(campos[k + 1] ?? "") && PERCENTUAL.test(campos[k + 2] ?? "") && SIM_NAO.test(campos[k + 3] ?? "")) ancoras.push(k);
  }
  const k = ancoras.length === 1 ? ancoras[0] : undefined;
  if (k === undefined) return null;
  const pega = (i: number): string => (campos[i] ?? "").trim();
  const linha: LinhaCaixa = {
    numero: pega(0),
    uf: pega(1),
    cidade: pega(2),
    bairro: pega(3),
    endereco: campos.slice(4, k).join(";").trim(),
    preco: pega(k),
    avaliacao: pega(k + 1),
    desconto: pega(k + 2),
    financiamento: pega(k + 3),
    descricao: campos.slice(k + 4, n - 2).join(";").trim(),
    modalidade: pega(n - 2),
    link,
  };
  const onde = [k > 5 ? "Endereço" : "", n - 2 - (k + 4) > 1 ? "Descrição" : ""].filter(Boolean).join(" e ");
  return { linha, onde: onde || "?" };
}

/** Contagem por UF, na ordem em que aparecem, e se o arquivo está em ordem de UF. */
export interface ResumoUfs {
  porUf: Record<string, number>;
  /** UFs em ordem não decrescente (AC...TO), como no arquivo geral. */
  ordenada: boolean;
  /** UF da última linha com UF válida. */
  ultima: string | null;
}

export function resumirUfs(registros: readonly RegistroLista[]): ResumoUfs {
  const porUf: Record<string, number> = {};
  let ordenada = true;
  let ultima: string | null = null;
  for (const r of registros) {
    const uf = normalizarUf(r.campos.uf);
    if (!uf) continue;
    if (ultima !== null && uf < ultima) ordenada = false;
    porUf[uf] = (porUf[uf] ?? 0) + 1;
    ultima = uf;
  }
  return { porUf, ordenada, ultima };
}

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
    if (campos.length > larguraCabecalho) {
      const recuperada = recuperarLinha(campos, posicoes);
      if (recuperada) {
        registros.push({ linhaArquivo: i + 1, campos: recuperada.linha, problema: null, recuperada: recuperada.onde });
        continue;
      }
      problema = `${campos.length} colunas, o cabeçalho tem ${larguraCabecalho} (";" dentro de um campo?)`;
    } else if (campos.length < larguraCabecalho) problema = `${campos.length} colunas, o cabeçalho tem ${larguraCabecalho}`;
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
