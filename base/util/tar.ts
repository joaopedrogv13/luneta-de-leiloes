/**
 * Arquivo .tar.gz sem dependência (formato ustar), para a cópia de segurança do banco (base/atualizar-site.ts).
 *
 * O Windows 10 em diante tem o `tar`, mas nem todo PC tem, e o do Windows não lê todo .tar.gz do mesmo jeito: aqui o
 * Node grava e lê sozinho, aos pedaços (um banco de 400 MB não vai inteiro para a memória). O arquivo gravado abre com
 * o `tar -xzf` de qualquer sistema (o LEIA.md da cópia ensina a restaurar à mão).
 *
 * Leitura: arquivos e pastas comuns, nome longo do GNU tar (tipo "L") e do POSIX (cabeçalho "x" com path=). Recusa
 * caminho absoluto, com letra de unidade ou com "..": um arquivo baixado nunca grava fora da pasta de destino.
 */
import { closeSync, createReadStream, createWriteStream, mkdirSync, openSync, statSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

const BLOCO = 512;

export interface EntradaTar {
  /** Nome dentro do arquivo, com "/" (ex.: "caixa/detalhes.db"). */
  nome: string;
  /** Arquivo no disco. */
  caminho: string;
}

function campoOctal(valor: number, tamanho: number): string {
  return valor.toString(8).padStart(tamanho - 1, "0") + "\0";
}

/** Cabeçalho ustar de um arquivo comum. Nome acima de 100 bytes vai dividido em prefixo e nome (até 255). */
export function cabecalhoTar(nome: string, tamanho: number, mtime: Date = new Date(0)): Buffer {
  const h = Buffer.alloc(BLOCO, 0);
  let prefixo = "";
  let curto = nome;
  if (Buffer.byteLength(nome) > 100) {
    const corte = nome.lastIndexOf("/", nome.length - 1);
    prefixo = corte > 0 ? nome.slice(0, corte) : "";
    curto = corte > 0 ? nome.slice(corte + 1) : nome;
    if (Buffer.byteLength(curto) > 100 || Buffer.byteLength(prefixo) > 155) throw new Error(`nome longo demais para o tar: ${nome}`);
  }
  if (tamanho > 8 ** 11 - 1) throw new Error(`arquivo grande demais para o tar: ${nome}`);
  h.write(curto, 0, 100, "utf8");
  h.write(campoOctal(0o644, 8), 100, 8, "ascii");
  h.write(campoOctal(0, 8), 108, 8, "ascii");
  h.write(campoOctal(0, 8), 116, 8, "ascii");
  h.write(campoOctal(tamanho, 12), 124, 12, "ascii");
  h.write(campoOctal(Math.max(0, Math.floor(mtime.getTime() / 1000)), 12), 136, 12, "ascii");
  h.write("        ", 148, 8, "ascii");
  h.write("0", 156, 1, "ascii");
  h.write("ustar\0", 257, 6, "ascii");
  h.write("00", 263, 2, "ascii");
  h.write(prefixo, 345, 155, "utf8");
  let soma = 0;
  for (const b of h) soma += b;
  h.write(soma.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return h;
}

/** Grava `destino` (.tar.gz) com as entradas, na ordem dada, lendo cada arquivo aos pedaços. */
export async function gravarTarGz(entradas: readonly EntradaTar[], destino: string): Promise<void> {
  async function* blocos(): AsyncGenerator<Buffer> {
    for (const e of entradas) {
      const info = statSync(e.caminho);
      yield cabecalhoTar(e.nome, info.size, info.mtime);
      let lidos = 0;
      for await (const pedaco of createReadStream(e.caminho)) {
        lidos += (pedaco as Buffer).length;
        yield pedaco as Buffer;
      }
      if (lidos !== info.size) throw new Error(`${e.nome} mudou de tamanho durante a cópia`);
      const resto = info.size % BLOCO;
      if (resto) yield Buffer.alloc(BLOCO - resto, 0);
    }
    yield Buffer.alloc(BLOCO * 2, 0);
  }
  mkdirSync(dirname(destino), { recursive: true });
  await pipeline(Readable.from(blocos()), createGzip({ level: 6 }), createWriteStream(destino));
}

/** O caminho é seguro para extrair? (relativo, sem "..", sem letra de unidade) */
export function nomeSeguro(nome: string): boolean {
  if (!nome || nome.includes("\0")) return false;
  if (/^[\\/]/.test(nome) || /^[a-z]:/i.test(nome)) return false;
  return !nome.split(/[\\/]+/).some((p) => p === "..");
}

function lerTexto(b: Buffer, inicio: number, tamanho: number): string {
  const fatia = b.subarray(inicio, inicio + tamanho);
  const fim = fatia.indexOf(0);
  return fatia.subarray(0, fim === -1 ? fatia.length : fim).toString("utf8");
}

function lerOctal(b: Buffer, inicio: number, tamanho: number): number {
  const t = lerTexto(b, inicio, tamanho).trim();
  return t ? Number.parseInt(t, 8) : 0;
}

export interface ResultadoExtracao {
  arquivos: string[];
}

/**
 * Extrai `arquivo` (.tar.gz) em `pasta`. Só arquivos comuns e pastas; o resto (atalhos, dispositivos) é pulado.
 * Lança em nome inseguro, checksum errado ou arquivo cortado.
 */
export async function extrairTarGz(arquivo: string, pasta: string): Promise<ResultadoExtracao> {
  const arquivos: string[] = [];
  let acumulado: Buffer = Buffer.alloc(0);
  let fd: number | null = null;
  let faltam = 0;
  let preenchimento = 0;
  let nomeLongo: string | null = null;
  let especial: { tipo: string; partes: Buffer[]; faltam: number } | null = null;
  let fim = false;

  const abrir = (nome: string) => {
    if (!nomeSeguro(nome)) throw new Error(`caminho inseguro no arquivo: ${nome}`);
    const destino = join(pasta, ...nome.split("/").filter(Boolean));
    mkdirSync(dirname(destino), { recursive: true });
    arquivos.push(nome);
    return openSync(destino, "w");
  };

  const processar = () => {
    while (!fim) {
      if (fd !== null || especial) {
        if (faltam > 0) {
          if (!acumulado.length) return;
          const n = Math.min(faltam, acumulado.length);
          if (fd !== null) writeSync(fd, acumulado, 0, n);
          else especial!.partes.push(Buffer.from(acumulado.subarray(0, n)));
          acumulado = acumulado.subarray(n);
          faltam -= n;
          if (faltam > 0) return;
        }
        if (fd !== null) {
          closeSync(fd);
          fd = null;
        }
        if (especial) {
          const dados = Buffer.concat(especial.partes).toString("utf8");
          if (especial.tipo === "L") nomeLongo = dados.replace(/\0+$/, "");
          else if (especial.tipo === "x") {
            const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(dados);
            if (m) nomeLongo = m[1]!;
          }
          especial = null;
        }
      }
      if (preenchimento > 0) {
        if (!acumulado.length) return;
        const n = Math.min(preenchimento, acumulado.length);
        acumulado = acumulado.subarray(n);
        preenchimento -= n;
        if (preenchimento > 0) return;
      }
      if (acumulado.length < BLOCO) return;
      const h = acumulado.subarray(0, BLOCO);
      acumulado = acumulado.subarray(BLOCO);
      if (h.every((b) => b === 0)) {
        fim = true;
        return;
      }
      let soma = 0;
      for (let i = 0; i < BLOCO; i++) soma += i >= 148 && i < 156 ? 32 : h[i]!;
      if (soma !== lerOctal(h, 148, 8)) throw new Error("arquivo .tar com cabeçalho corrompido");
      const tipo = String.fromCharCode(h[156] || 48);
      const tamanho = lerOctal(h, 124, 12);
      const prefixo = h.subarray(257, 262).toString("ascii") === "ustar" ? lerTexto(h, 345, 155) : "";
      const nome = nomeLongo ?? (prefixo ? `${prefixo}/${lerTexto(h, 0, 100)}` : lerTexto(h, 0, 100));
      if (tipo !== "L" && tipo !== "x") nomeLongo = null;
      faltam = tamanho;
      preenchimento = tamanho % BLOCO ? BLOCO - (tamanho % BLOCO) : 0;
      if (tipo === "0" || tipo === "\0" || tipo === "7") {
        fd = abrir(nome);
        if (tamanho === 0) {
          closeSync(fd);
          fd = null;
        }
      } else if (tipo === "5") {
        if (!nomeSeguro(nome)) throw new Error(`caminho inseguro no arquivo: ${nome}`);
        mkdirSync(join(pasta, ...nome.split("/").filter(Boolean)), { recursive: true });
      } else if ((tipo === "L" || tipo === "x") && tamanho > 0) {
        especial = { tipo, partes: [], faltam: tamanho };
      } else if (tamanho > 0) {
        // atalho, dispositivo, cabeçalho global: só pula os dados
        especial = { tipo: "pular", partes: [], faltam: tamanho };
      }
    }
  };

  try {
    for await (const pedaco of createReadStream(arquivo).pipe(createGunzip())) {
      if (fim) continue;
      acumulado = acumulado.length ? Buffer.concat([acumulado, pedaco as Buffer]) : (pedaco as Buffer);
      processar();
    }
  } finally {
    if (fd !== null) closeSync(fd);
  }
  if (!fim || faltam > 0) throw new Error("arquivo .tar.gz cortado (terminou antes do fim)");
  return { arquivos };
}
