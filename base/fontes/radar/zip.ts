/**
 * Leitor mínimo de ZIP (sem dependências), para o pacote diário do DOU que o INLABS entrega.
 *
 * Suporta o que o pacote usa: entradas "stored" (método 0) e "deflate" (método 8), com ou sem
 * data descriptor (os tamanhos vêm do diretório central). Recusa ZIP64, criptografia e outros
 * métodos com erro claro. Confere o CRC-32 de cada arquivo e limita tamanho por entrada, total
 * e razão de compressão (proteção contra "zip bomb"). Não grava nada em disco.
 */
import { crc32, inflateRawSync } from "node:zlib";

export interface EntradaZip {
  /** Caminho dentro do ZIP ("2026-10-09-DO3/515_20261009_123.xml"). */
  nome: string;
  dados: Uint8Array;
}

export interface LimitesZip {
  /** Número máximo de entradas no diretório central. */
  maxEntradas?: number;
  /** Tamanho máximo descompactado de uma entrada. */
  maxBytesEntrada?: number;
  /** Tamanho máximo descompactado somado das entradas lidas. */
  maxBytesTotal?: number;
  /** Razão máxima descompactado/compactado de uma entrada. */
  maxRazao?: number;
}

const LIMITES_PADRAO: Required<LimitesZip> = {
  maxEntradas: 50_000,
  maxBytesEntrada: 50 * 1024 * 1024,
  maxBytesTotal: 1024 * 1024 * 1024,
  maxRazao: 1000,
};

const ASSINATURA_LOCAL = 0x04034b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_FIM = 0x06054b50;

export class ErroZip extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroZip";
  }
}

/** `true` se os bytes começam como ZIP ("PK\x03\x04" ou ZIP vazio "PK\x05\x06"). */
export function pareceZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6));
}

function acharFimDoDiretorio(visao: DataView): number {
  const minimo = Math.max(0, visao.byteLength - 22 - 0xffff);
  for (let i = visao.byteLength - 22; i >= minimo; i--) {
    if (visao.getUint32(i, true) === ASSINATURA_FIM) return i;
  }
  throw new ErroZip("Fim do diretório central não encontrado (ZIP truncado ou corrompido).");
}

function decodificarNome(bytes: Uint8Array, utf8: boolean): string {
  if (utf8) return new TextDecoder("utf-8").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
}

/**
 * Lê as entradas do ZIP (pastas são ignoradas). `filtro` escolhe pelo nome quais descompactar
 * (as outras nem são lidas). Lança ErroZip se o arquivo não for ZIP válido ou passar dos limites.
 */
export function lerZip(bytes: Uint8Array, filtro: (nome: string) => boolean = () => true, limites: LimitesZip = {}): EntradaZip[] {
  const lim = { ...LIMITES_PADRAO, ...limites };
  if (!pareceZip(bytes)) {
    const inicio = new TextDecoder("latin1").decode(bytes.subarray(0, 40)).replace(/[^\x20-\x7e]/g, ".");
    throw new ErroZip(`Não é um arquivo ZIP (começa com "${inicio}").`);
  }
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fim = acharFimDoDiretorio(visao);
  const total = visao.getUint16(fim + 10, true);
  const tamanhoDiretorio = visao.getUint32(fim + 12, true);
  const inicioDiretorio = visao.getUint32(fim + 16, true);
  if (total === 0xffff || inicioDiretorio === 0xffffffff || tamanhoDiretorio === 0xffffffff) {
    throw new ErroZip("ZIP64 não é suportado.");
  }
  if (total > lim.maxEntradas) throw new ErroZip(`ZIP com ${total} entradas passa do limite de ${lim.maxEntradas}.`);
  if (inicioDiretorio + tamanhoDiretorio > fim) throw new ErroZip("Diretório central fora dos limites do arquivo.");

  const saida: EntradaZip[] = [];
  let somaBytes = 0;
  let cursor = inicioDiretorio;
  for (let i = 0; i < total; i++) {
    if (cursor + 46 > bytes.byteLength || visao.getUint32(cursor, true) !== ASSINATURA_CENTRAL) {
      throw new ErroZip(`Entrada ${i + 1} do diretório central corrompida.`);
    }
    const flags = visao.getUint16(cursor + 8, true);
    const metodo = visao.getUint16(cursor + 10, true);
    const crcEsperado = visao.getUint32(cursor + 16, true);
    const compactado = visao.getUint32(cursor + 20, true);
    const descompactado = visao.getUint32(cursor + 24, true);
    const tamanhoNome = visao.getUint16(cursor + 28, true);
    const tamanhoExtra = visao.getUint16(cursor + 30, true);
    const tamanhoComentario = visao.getUint16(cursor + 32, true);
    const deslocamentoLocal = visao.getUint32(cursor + 42, true);
    const nome = decodificarNome(bytes.subarray(cursor + 46, cursor + 46 + tamanhoNome), (flags & 0x800) !== 0);
    cursor += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;

    if (nome.endsWith("/") || !filtro(nome)) continue;
    if ((flags & 0x1) !== 0) throw new ErroZip(`${nome}: entrada criptografada não é suportada.`);
    if (compactado === 0xffffffff || descompactado === 0xffffffff || deslocamentoLocal === 0xffffffff) {
      throw new ErroZip(`${nome}: ZIP64 não é suportado.`);
    }
    if (descompactado > lim.maxBytesEntrada) throw new ErroZip(`${nome}: ${descompactado} bytes passa do limite por arquivo.`);
    if (compactado > 0 && descompactado / compactado > lim.maxRazao) throw new ErroZip(`${nome}: razão de compressão suspeita.`);
    somaBytes += descompactado;
    if (somaBytes > lim.maxBytesTotal) throw new ErroZip(`ZIP descompactado passa do limite de ${lim.maxBytesTotal} bytes.`);

    if (deslocamentoLocal + 30 > bytes.byteLength || visao.getUint32(deslocamentoLocal, true) !== ASSINATURA_LOCAL) {
      throw new ErroZip(`${nome}: cabeçalho local corrompido.`);
    }
    const inicioDados = deslocamentoLocal + 30 + visao.getUint16(deslocamentoLocal + 26, true) + visao.getUint16(deslocamentoLocal + 28, true);
    if (inicioDados + compactado > bytes.byteLength) throw new ErroZip(`${nome}: dados além do fim do arquivo (ZIP truncado).`);
    const bruto = bytes.subarray(inicioDados, inicioDados + compactado);

    let dados: Uint8Array;
    if (metodo === 0) dados = bruto;
    else if (metodo === 8) {
      try {
        dados = inflateRawSync(bruto, { maxOutputLength: Math.max(1, descompactado) });
      } catch (erro) {
        throw new ErroZip(`${nome}: falha ao descompactar (${(erro as Error).message}).`);
      }
    } else throw new ErroZip(`${nome}: método de compressão ${metodo} não suportado.`);

    if (dados.byteLength !== descompactado) throw new ErroZip(`${nome}: tamanho descompactado não confere.`);
    if (crc32(dados) >>> 0 !== crcEsperado) throw new ErroZip(`${nome}: CRC-32 não confere (arquivo corrompido).`);
    saida.push({ nome, dados });
  }
  return saida;
}
