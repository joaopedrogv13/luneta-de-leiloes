/**
 * Cache local do que vem da ficha e da verificação de fotos da Caixa.
 *
 * Por que existe: a coleta diária lê só o CSV (rápida), e a ficha é lida à parte, devagar
 * (`--detalhes`, 2 s por ficha). Como o núcleo regrava o imóvel inteiro a cada coleta, um
 * CSV lido sem a ficha apagaria matrícula, CEP, documentos e fotos que vieram dela. O
 * conector guarda aqui a última ficha boa de cada imóvel e junta com o CSV em toda coleta.
 * Uma ficha que falha nunca apaga a anterior, e uma ficha que perde campos estáveis herda
 * os da anterior (ficha.ts, herdarEstaveis).
 *
 * Arquivo SQLite separado do banco principal (padrão base/dados/caixa/detalhes.db, ignorado
 * pelo git). Guarda a ficha já interpretada e MASCARADA (mascararFicha: nomes de partes,
 * CPF/CNPJ, RG, e-mail e IP saem como "[NOME]", "[CPF]"...), porque o cache fica fora da
 * proteção do núcleo, que só mascara o que passa por gravar.ts. Caches de versões antigas
 * são mascarados na primeira abertura (migração 2).
 *
 * Também guarda o resumo da última lista lida por escopo (geral ou UF), para recusar um
 * arquivo com a mesma "Data de geração" e menos linhas (truncado).
 *
 * Robustez: um cache que não abre (corrompido, travado, apagado com a cópia ainda presente)
 * lança ErroCache com o caminho e o jeito de recuperar, e a coleta para sem gravar nada. Rodar
 * sem o cache apagaria do banco tudo o que veio das fichas. Depois de cada coleta que grava
 * fichas ou fotos, uma cópia consistente vai para `<cache>.bak` (VACUUM INTO).
 */
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { mascararDocumentos } from "../../util/lgpd.ts";
import { mascararFicha, type FichaCaixa } from "./ficha.ts";

export const CACHE_PADRAO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dados", "caixa", "detalhes.db");

/**
 * Suba quando o parser da ficha mudar: fichas lidas por versões antigas são relidas na
 * próxima coleta com --detalhes. 2: máscara LGPD, número do imóvel obrigatório, "Valor de
 * venda" e "Valor mínimo de venda à vista".
 */
export const VERSAO_PARSER_FICHA = 2;

/** Versão do esquema do arquivo de cache (PRAGMA user_version). */
const VERSAO_CACHE = 2;

export interface FotoVerificada {
  url: string;
  ordem: number;
  /** HTTP do HEAD (200, 404...). */
  status: number;
  /** `null`: respondeu, mas por outra URL (redirecionamento), então não confirma a foto. */
  ok: boolean | null;
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

/** Resumo de uma lista lida (por escopo: "geral" ou a UF). */
export interface ResumoLista {
  gerado_em: string;
  total: number;
  por_uf: Record<string, number>;
  registrada_em: string;
}

export interface CacheCaixa {
  ler(id13: string): DetalheGuardado | null;
  gravarFicha(id13: string, ficha: FichaCaixa, base: BaseCsv, em: Date): void;
  gravarFalha(id13: string, motivo: string, em: Date): void;
  gravarFotos(id13: string, fotos: FotoVerificada[], em: Date): void;
  lerLista(escopo: string): ResumoLista | null;
  gravarLista(escopo: string, resumo: ResumoLista): void;
  /** Grava a cópia de segurança e devolve o caminho dela (null no cache em memória). */
  copiaDeSeguranca(): string | null;
  fechar(): void;
}

/** O cache não abriu ou não pôde ser lido; a mensagem diz o caminho e como recuperar. */
export class ErroCache extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroCache";
  }
}

export const caminhoCopia = (caminho: string): string => `${caminho}.bak`;

/** Como recuperar um cache que não abre (vai no fim da mensagem de erro). */
export function comoRecuperar(caminho: string): string {
  const copia = caminhoCopia(caminho);
  const temCopia = existsSync(copia);
  return (
    "Nada foi gravado. Para recuperar: " +
    (temCopia
      ? `restaure a cópia da última coleta que gravou fichas ou fotos (mv "${caminho}" "${caminho}.estragado" && cp "${copia}" "${caminho}"); `
      : "") +
    `${temCopia ? "ou " : ""}mova o arquivo e rode a coleta com --detalhes para reconstruir o cache (2 s por ficha). ` +
    "Não use LUNETA_CAIXA_CACHE=off numa base que já tem dados de ficha: a coleta regravaria os imóveis sem matrícula, CEP, cartório, documentos e fotos da ficha."
  );
}

const VAZIO: DetalheGuardado = {
  ficha: null, ficha_em: null, versao_parser: null, base: null, falha_em: null, falha: null, fotos: null, fotos_em: null,
};

/** Motivo de falha sem documento pessoal e com tamanho limitado. */
function motivoLimpo(motivo: string): string {
  return mascararDocumentos(motivo).slice(0, 500);
}

/** Cache em memória (testes, ou quando o cache em disco está desligado mas há --detalhes). */
export function cacheEmMemoria(): CacheCaixa {
  const dados = new Map<string, DetalheGuardado>();
  const listas = new Map<string, ResumoLista>();
  const atual = (id: string): DetalheGuardado => dados.get(id) ?? { ...VAZIO };
  return {
    ler: (id) => {
      const d = dados.get(id);
      return d ? structuredClone(d) : null;
    },
    gravarFicha: (id, ficha, base, em) => {
      dados.set(id, { ...atual(id), ficha: mascararFicha(structuredClone(ficha)), ficha_em: em.toISOString(), versao_parser: VERSAO_PARSER_FICHA, base, falha_em: null, falha: null });
    },
    gravarFalha: (id, motivo, em) => {
      dados.set(id, { ...atual(id), falha_em: em.toISOString(), falha: motivoLimpo(motivo) });
    },
    gravarFotos: (id, fotos, em) => {
      dados.set(id, { ...atual(id), fotos: structuredClone(fotos), fotos_em: em.toISOString() });
    },
    lerLista: (escopo) => {
      const l = listas.get(escopo);
      return l ? structuredClone(l) : null;
    },
    gravarLista: (escopo, resumo) => {
      listas.set(escopo, structuredClone(resumo));
    },
    copiaDeSeguranca: () => null,
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

function descreverFalha(erro: unknown): string {
  const mensagem = (erro as Error)?.message ?? String(erro);
  if (/locked|busy/i.test(mensagem)) return `${mensagem} (outra coleta usando o cache?)`;
  return mensagem;
}

/**
 * Migração 2: mascara as fichas gravadas por versões que guardavam o texto em claro. Com
 * secure_delete e um VACUUM no fim, o texto antigo também não fica em páginas livres do
 * arquivo; uma cópia de segurança antiga é refeita a partir do cache já mascarado.
 */
function migrar(db: DatabaseSync, caminho: string): void {
  const versao = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
  if (versao >= VERSAO_CACHE) return;
  let regravadas = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    const regravar = db.prepare("UPDATE detalhe SET ficha = ?, falha = ? WHERE id13 = ?");
    for (const linha of db.prepare("SELECT id13, ficha, falha FROM detalhe WHERE ficha IS NOT NULL OR falha IS NOT NULL").all()) {
      const ficha = jsonOuNulo<FichaCaixa>(linha.ficha);
      const falha = texto(linha.falha);
      regravar.run(ficha ? JSON.stringify(mascararFicha(ficha)) : null, falha ? motivoLimpo(falha) : null, String(linha.id13));
      regravadas++;
    }
    db.exec(`PRAGMA user_version = ${VERSAO_CACHE}`);
    db.exec("COMMIT");
  } catch (erro) {
    db.exec("ROLLBACK");
    throw erro;
  }
  if (regravadas === 0) return;
  db.exec("VACUUM");
  const copia = caminhoCopia(caminho);
  if (existsSync(copia)) {
    rmSync(`${copia}.tmp`, { force: true });
    db.prepare("VACUUM INTO ?").run(`${copia}.tmp`);
    renameSync(`${copia}.tmp`, copia);
  }
}

/**
 * Abre (ou cria) o cache em disco e confere a integridade. Lança ErroCache, com o caminho e
 * o jeito de recuperar, se o arquivo estiver corrompido ou travado, ou se ele sumiu mas a
 * cópia de segurança continua lá (sinal de que alguém apagou o cache de uma base com fichas).
 */
export function abrirCacheDisco(caminho: string): CacheCaixa {
  if (!existsSync(caminho)) {
    if (existsSync(caminhoCopia(caminho))) {
      throw new ErroCache(
        `Cache da Caixa ausente em ${caminho}, mas a cópia ${caminhoCopia(caminho)} existe: o cache foi apagado? ` +
          `Sem ele a coleta apagaria do banco o que veio das fichas. Restaure com cp "${caminhoCopia(caminho)}" "${caminho}", ` +
          `ou apague também a cópia se quiser mesmo recomeçar sem fichas.`,
      );
    }
    try {
      mkdirSync(dirname(caminho), { recursive: true });
    } catch (erro) {
      throw new ErroCache(`Cache da Caixa: não deu para criar a pasta de ${caminho} (${descreverFalha(erro)}).`);
    }
  }
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(caminho);
  } catch (erro) {
    throw new ErroCache(`Cache da Caixa ilegível em ${caminho} (${descreverFalha(erro)}). ${comoRecuperar(caminho)}`);
  }
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const checagem = db.prepare("PRAGMA quick_check").all().map((l) => String(Object.values(l)[0]));
    if (checagem.length !== 1 || checagem[0] !== "ok") throw new Error(`quick_check: ${checagem.slice(0, 3).join("; ")}`);
    // secure_delete: o que é apagado ou regravado é zerado no arquivo (o cache tem texto de fichas).
    db.exec(`PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS detalhe (
        id13 TEXT PRIMARY KEY,
        ficha TEXT, ficha_em TEXT, versao_parser INTEGER, base TEXT,
        falha_em TEXT, falha TEXT,
        fotos TEXT, fotos_em TEXT
      );
      CREATE TABLE IF NOT EXISTS lista (
        escopo TEXT PRIMARY KEY,
        gerado_em TEXT NOT NULL, total INTEGER NOT NULL, por_uf TEXT, registrada_em TEXT
      );`);
    migrar(db, caminho);
  } catch (erro) {
    try {
      db.close();
    } catch {
      // já fechado ou nunca aberto de fato
    }
    throw new ErroCache(`Cache da Caixa ilegível em ${caminho} (${descreverFalha(erro)}). ${comoRecuperar(caminho)}`);
  }
  /** Erro de leitura ou escrita no meio da coleta: mensagem com o caminho. */
  const protegido = <T>(acao: string, fazer: () => T): T => {
    try {
      return fazer();
    } catch (erro) {
      throw new ErroCache(`Cache da Caixa (${caminho}): falha ao ${acao} (${descreverFalha(erro)}). ${comoRecuperar(caminho)}`);
    }
  };
  const ler = db.prepare(`SELECT * FROM detalhe WHERE id13 = ?`);
  const garantir = db.prepare(`INSERT INTO detalhe (id13) VALUES (?) ON CONFLICT (id13) DO NOTHING`);
  const ficha = db.prepare(`UPDATE detalhe SET ficha = ?, ficha_em = ?, versao_parser = ?, base = ?, falha_em = NULL, falha = NULL WHERE id13 = ?`);
  const falha = db.prepare(`UPDATE detalhe SET falha_em = ?, falha = ? WHERE id13 = ?`);
  const fotos = db.prepare(`UPDATE detalhe SET fotos = ?, fotos_em = ? WHERE id13 = ?`);
  const lerListaSql = db.prepare(`SELECT * FROM lista WHERE escopo = ?`);
  const gravarListaSql = db.prepare(
    `INSERT INTO lista (escopo, gerado_em, total, por_uf, registrada_em) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (escopo) DO UPDATE SET gerado_em = excluded.gerado_em, total = excluded.total, por_uf = excluded.por_uf, registrada_em = excluded.registrada_em`,
  );
  return {
    ler(id13) {
      const linha = protegido("ler a ficha guardada", () => ler.get(id13));
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
      protegido("gravar a ficha", () => {
        garantir.run(id13);
        ficha.run(JSON.stringify(mascararFicha(dados)), em.toISOString(), VERSAO_PARSER_FICHA, JSON.stringify(base), id13);
      });
    },
    gravarFalha(id13, motivo, em) {
      protegido("gravar a falha da ficha", () => {
        garantir.run(id13);
        falha.run(em.toISOString(), motivoLimpo(motivo), id13);
      });
    },
    gravarFotos(id13, lista, em) {
      protegido("gravar as fotos", () => {
        garantir.run(id13);
        fotos.run(JSON.stringify(lista), em.toISOString(), id13);
      });
    },
    lerLista(escopo) {
      const linha = protegido("ler o resumo da lista", () => lerListaSql.get(escopo));
      if (!linha) return null;
      return {
        gerado_em: String(linha.gerado_em),
        total: Number(linha.total),
        por_uf: jsonOuNulo<Record<string, number>>(linha.por_uf) ?? {},
        registrada_em: texto(linha.registrada_em) ?? "",
      };
    },
    gravarLista(escopo, resumo) {
      protegido("gravar o resumo da lista", () =>
        gravarListaSql.run(escopo, resumo.gerado_em, resumo.total, JSON.stringify(resumo.por_uf), resumo.registrada_em),
      );
    },
    copiaDeSeguranca() {
      const destino = caminhoCopia(caminho);
      const temporario = `${destino}.tmp`;
      rmSync(temporario, { force: true });
      db.prepare("VACUUM INTO ?").run(temporario);
      renameSync(temporario, destino);
      return destino;
    },
    fechar() {
      db.close();
    },
  };
}
