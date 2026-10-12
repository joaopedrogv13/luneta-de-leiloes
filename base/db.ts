/**
 * Abertura, migração e transações do banco SQLite (node:sqlite, sem dependências).
 *
 * Versionamento: PRAGMA user_version guarda a versão aplicada. A versão 1 é base/esquema.sql;
 * as seguintes são arquivos base/migracoes/NNN-descricao.sql (NNN = 002, 003...), aplicados em
 * ordem, cada um na sua transação. `migrar` é idempotente: rodar de novo não faz nada.
 */
import { DatabaseSync, type SupportedValueType } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Caminho padrão do banco (pasta ignorada pelo git). Sobreponha com LUNETA_DB ou --banco. */
export const CAMINHO_PADRAO = join(AQUI, "dados", "luneta.db");
export const ARQUIVO_ESQUEMA = join(AQUI, "esquema.sql");
export const DIR_MIGRACOES = join(AQUI, "migracoes");

export type Banco = DatabaseSync;
export type ValorSql = SupportedValueType;

export interface Migracao {
  versao: number;
  nome: string;
  sql: string;
}

/** Migrações conhecidas pelo código, em ordem: esquema.sql (v1) e base/migracoes/*.sql. */
export function listarMigracoes(dirMigracoes: string = DIR_MIGRACOES): Migracao[] {
  const lista: Migracao[] = [{ versao: 1, nome: "esquema.sql", sql: readFileSync(ARQUIVO_ESQUEMA, "utf8") }];
  if (existsSync(dirMigracoes)) {
    const arquivos = readdirSync(dirMigracoes)
      .filter((nome) => /^\d{3,}-[\w.-]+\.sql$/.test(nome))
      .sort();
    for (const nome of arquivos) {
      lista.push({ versao: Number.parseInt(nome, 10), nome, sql: readFileSync(join(dirMigracoes, nome), "utf8") });
    }
  }
  lista.forEach((m, i) => {
    if (m.versao !== i + 1) {
      throw new Error(`Migrações fora de sequência: esperava a versão ${i + 1} e achei ${m.nome}.`);
    }
  });
  return lista;
}

export function versaoDoBanco(db: Banco): number {
  return Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
}

const profundidade = new WeakMap<Banco, number>();

/**
 * Executa `fn` numa transação (BEGIN IMMEDIATE ... COMMIT). Se `fn` lançar, desfaz tudo.
 * Chamadas aninhadas viram SAVEPOINT. `fn` precisa ser síncrona (node:sqlite é síncrono).
 */
export function transacao<T>(db: Banco, fn: () => T): T {
  const nivel = profundidade.get(db) ?? 0;
  const ponto = `luneta_${nivel}`;
  db.exec(nivel === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${ponto}`);
  profundidade.set(db, nivel + 1);
  try {
    const resultado = fn();
    if (resultado instanceof Promise) throw new Error("transacao(): a função precisa ser síncrona.");
    db.exec(nivel === 0 ? "COMMIT" : `RELEASE ${ponto}`);
    return resultado;
  } catch (erro) {
    try {
      db.exec(nivel === 0 ? "ROLLBACK" : `ROLLBACK TO ${ponto}; RELEASE ${ponto}`);
    } catch {
      // A transação já pode ter sido desfeita pelo próprio SQLite; o erro original importa mais.
    }
    throw erro;
  } finally {
    profundidade.set(db, nivel);
  }
}

export interface ResultadoMigracao {
  de: number;
  para: number;
  aplicadas: string[];
}

/** Aplica as migrações pendentes. Recusa banco mais novo que o código. */
export function migrar(db: Banco, opcoes: { dirMigracoes?: string } = {}): ResultadoMigracao {
  const migracoes = listarMigracoes(opcoes.dirMigracoes);
  const de = versaoDoBanco(db);
  const ultima = migracoes[migracoes.length - 1]?.versao ?? 0;
  if (de > ultima) {
    throw new Error(`O banco está na versão ${de}, mas este código só conhece até a ${ultima}. Atualize o código.`);
  }
  const aplicadas: string[] = [];
  for (const migracao of migracoes) {
    if (migracao.versao <= de) continue;
    transacao(db, () => {
      db.exec(migracao.sql);
      db.exec(`PRAGMA user_version = ${migracao.versao}`);
    });
    aplicadas.push(migracao.nome);
  }
  return { de, para: versaoDoBanco(db), aplicadas };
}

export interface OpcoesAbrir {
  /** Aplica migrações ao abrir (padrão true). */
  migrar?: boolean;
  dirMigracoes?: string;
}

/**
 * Abre (e cria, se preciso) o banco. Caminho: argumento, senão LUNETA_DB, senão
 * base/dados/luneta.db. Use ":memory:" nos testes.
 */
export function abrirBanco(caminho?: string, opcoes: OpcoesAbrir = {}): Banco {
  const alvo = caminho ?? (process.env.LUNETA_DB || CAMINHO_PADRAO);
  const emMemoria = alvo === ":memory:";
  if (!emMemoria) mkdirSync(dirname(alvo), { recursive: true });
  const db = new DatabaseSync(alvo);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  if (!emMemoria) db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  if (opcoes.migrar !== false) migrar(db, { dirMigracoes: opcoes.dirMigracoes });
  return db;
}

// ---------------------------------------------------------------------------
// Conversão de valores entre TypeScript e SQLite
// ---------------------------------------------------------------------------

/** boolean → 0/1; null/undefined → NULL. */
export function sqlBool(valor: boolean | null | undefined): number | null {
  return valor === null || valor === undefined ? null : valor ? 1 : 0;
}

/** 0/1 → boolean; NULL → null. */
export function lerBool(valor: ValorSql | undefined): boolean | null {
  if (valor === null || valor === undefined) return null;
  return Number(valor) !== 0;
}

export function lerNumero(valor: ValorSql | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

export function lerTexto(valor: ValorSql | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  return typeof valor === "string" ? valor : String(valor);
}

/** undefined → NULL, para parâmetros opcionais. */
export function sql(valor: ValorSql | undefined): ValorSql {
  return valor === undefined ? null : valor;
}
