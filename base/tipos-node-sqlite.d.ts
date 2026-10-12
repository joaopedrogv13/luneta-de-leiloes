/**
 * Tipos mínimos de `node:sqlite` (Node 22.5+), só com o que a base usa.
 *
 * O projeto usa @types/node 20, que ainda não declara esse módulo, e a base não pode
 * acrescentar dependências. Quando o @types/node subir para 22.13 ou mais, apague este
 * arquivo: as declarações oficiais passam a valer e as duas entrariam em conflito.
 */
declare module "node:sqlite" {
  /** Valores que o SQLite aceita como parâmetro e devolve nas colunas. */
  export type SupportedValueType = null | number | bigint | string | Uint8Array;

  export type LinhaSqlite = Record<string, SupportedValueType>;

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
    allowExtension?: boolean;
  }

  export class StatementSync {
    all(named: Record<string, SupportedValueType>, ...anonimos: SupportedValueType[]): LinhaSqlite[];
    all(...anonimos: SupportedValueType[]): LinhaSqlite[];
    get(named: Record<string, SupportedValueType>, ...anonimos: SupportedValueType[]): LinhaSqlite | undefined;
    get(...anonimos: SupportedValueType[]): LinhaSqlite | undefined;
    run(named: Record<string, SupportedValueType>, ...anonimos: SupportedValueType[]): StatementResultingChanges;
    run(...anonimos: SupportedValueType[]): StatementResultingChanges;
    iterate(named: Record<string, SupportedValueType>, ...anonimos: SupportedValueType[]): IterableIterator<LinhaSqlite>;
    iterate(...anonimos: SupportedValueType[]): IterableIterator<LinhaSqlite>;
    setReadBigInts(ativo: boolean): void;
    setAllowBareNamedParameters(ativo: boolean): void;
    readonly sourceSQL: string;
    readonly expandedSQL: string;
  }

  export class DatabaseSync {
    constructor(caminho: string, opcoes?: DatabaseSyncOptions);
    open(): void;
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    function(nome: string, fn: (...args: SupportedValueType[]) => SupportedValueType): void;
  }
}
