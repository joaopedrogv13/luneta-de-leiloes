/**
 * Cache local do que vem da ficha e da verificação de fotos da Caixa.
 *
 * Por que existe: a coleta diária lê só o CSV (rápida), e a ficha é lida à parte, devagar
 * (`--detalhes`, 2 s por ficha). Como o núcleo regrava o imóvel inteiro a cada coleta, um
 * CSV lido sem a ficha apagaria matrícula, CEP, documentos e fotos que vieram dela. O
 * conector guarda aqui a última ficha boa de cada imóvel e junta com o CSV em toda coleta.
 * Uma ficha que falha nunca apaga a anterior.
 *
 * Arquivo SQLite separado do banco principal (padrão base/dados/caixa/detalhes.db, ignorado
 * pelo git). Guarda só dados já interpretados da ficha pública: nada de dado pessoal.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { FichaCaixa } from "./ficha.ts";

export const CACHE_PADRAO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dados", "caixa", "detalhes.db");

/** Suba quando o parser da ficha mudar: fichas lidas por versões antigas são relidas. */
export const VERSAO_PARSER_FICHA = 1;

export interface FotoVerificada {
  url: string;
  ordem: number;
  /** HTTP do HEAD (200, 404...). */
  status: number;
  ok: boolean;
  verificada_em: string;
}

/** Preço, avaliação e modalidade do CSV no momento em que a ficha foi lida. */
export interface BaseCsv {
  preco: number | null;
  avaliacao: number | null;
  modalidade: string;
}

export interface DetalheGuardado {
  ficha: FichaCaixa | null;
  ficha_em: string | null;
  versao_parser: number | null;
  base: BaseCsv | null;
  /** Última falha ao ler a ficha (para não insistir no mesmo dia). */
  falha_em: string | null;
  falha: string | null;
  fotos: FotoVerificada[] | null;
  fotos_em: string | null;
}

export interface CacheCaixa {
  ler(id13: string): DetalheGuardado | null;
  gravarFicha(id13: string, ficha: FichaCaixa, base: BaseCsv, em: Date): void;
  gravarFalha(id13: string, motivo: string, em: Date): void;
  gravarFotos(id13: string, fotos: FotoVerificada[], em: Date): void;
  fechar(): void;
}

const VAZIO: DetalheGuardado = {
  ficha: null, ficha_em: null, versao_parser: null, base: null, falha_em: null, falha: null, fotos: null, fotos_em: null,
};

/** Cache em memória (testes, ou quando o cache em disco está desligado mas há --detalhes). */
export function cacheEmMemoria(): CacheCaixa {
  const dados = new Map<string, DetalheGuardado>();
  const atual = (id: string): DetalheGuardado => dados.get(id) ?? { ...VAZIO };
  return {
    ler: (id) => {
      const d = dados.get(id);
      return d ? structuredClone(d) : null;
    },
    gravarFicha: (id, ficha, base, em) => {
      dados.set(id, { ...atual(id), ficha: structuredClone(ficha), ficha_em: em.toISOString(), versao_parser: VERSAO_PARSER_FICHA, base, falha_em: null, falha: null });
    },
    gravarFalha: (id, motivo, em) => {
      dados.set(id, { ...atual(id), falha_em: em.toISOString(), falha: motivo });
    },
    gravarFotos: (id, fotos, em) => {
      dados.set(id, { ...atual(id), fotos: structuredClone(fotos), fotos_em: em.toISOString() });
    },
    fechar: () => undefined,
  };
}

function jsonOuNulo<T>(valor: unknown): T | null {
  if (typeof valor !== "string" || valor === "") return null;
  try {
    return JSON.parse(valor) as T;
  } catch {
    return null;
  }
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

/**
 * Abre o cache em disco. Com `criar` falso e o arquivo inexistente, devolve null (coleta só
 * de CSV não cria arquivo nenhum).
 */
export function abrirCacheDisco(caminho: string, opcoes: { criar: boolean }): CacheCaixa | null {
  if (!existsSync(caminho)) {
    if (!opcoes.criar) return null;
    mkdirSync(dirname(caminho), { recursive: true });
  }
  const db = new DatabaseSync(caminho);
  db.exec(`PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS detalhe (
      id13 TEXT PRIMARY KEY,
      ficha TEXT, ficha_em TEXT, versao_parser INTEGER, base TEXT,
      falha_em TEXT, falha TEXT,
      fotos TEXT, fotos_em TEXT
    );`);
  const ler = db.prepare(`SELECT * FROM detalhe WHERE id13 = ?`);
  const garantir = db.prepare(`INSERT INTO detalhe (id13) VALUES (?) ON CONFLICT (id13) DO NOTHING`);
  const ficha = db.prepare(`UPDATE detalhe SET ficha = ?, ficha_em = ?, versao_parser = ?, base = ?, falha_em = NULL, falha = NULL WHERE id13 = ?`);
  const falha = db.prepare(`UPDATE detalhe SET falha_em = ?, falha = ? WHERE id13 = ?`);
  const fotos = db.prepare(`UPDATE detalhe SET fotos = ?, fotos_em = ? WHERE id13 = ?`);
  return {
    ler(id13) {
      const linha = ler.get(id13);
      if (!linha) return null;
      return {
        ficha: jsonOuNulo<FichaCaixa>(linha.ficha),
        ficha_em: texto(linha.ficha_em),
        versao_parser: typeof linha.versao_parser === "number" ? linha.versao_parser : null,
        base: jsonOuNulo<BaseCsv>(linha.base),
        falha_em: texto(linha.falha_em),
        falha: texto(linha.falha),
        fotos: jsonOuNulo<FotoVerificada[]>(linha.fotos),
        fotos_em: texto(linha.fotos_em),
      };
    },
    gravarFicha(id13, dados, base, em) {
      garantir.run(id13);
      ficha.run(JSON.stringify(dados), em.toISOString(), VERSAO_PARSER_FICHA, JSON.stringify(base), id13);
    },
    gravarFalha(id13, motivo, em) {
      garantir.run(id13);
      falha.run(em.toISOString(), motivo.slice(0, 500), id13);
    },
    gravarFotos(id13, lista, em) {
      garantir.run(id13);
      fotos.run(JSON.stringify(lista), em.toISOString(), id13);
    },
    fechar() {
      db.close();
    },
  };
}
