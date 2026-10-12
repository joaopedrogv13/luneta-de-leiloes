/**
 * Motor de riscos: roda as regras registradas (base/riscos/regras/index.ts) sobre cada imóvel
 * e grava as tags com evidência na tabela `risco`.
 *
 * Contrato de uma regra: recebe o imóvel gravado (já limpo e mascarado) e os textos prontos
 * para regex, e devolve zero ou mais `RiscoDetectado`, cada um com tag, valor, confiança,
 * origem e trecho. O motor:
 * - confere que a tag existe e foi declarada pela regra;
 * - preenche `regra` com o id da regra e mascara/corta o trecho (LGPD);
 * - mantém uma linha por (tag, regra): a de maior confiança;
 * - marca para revisão tags "sim" do mesmo grupo exclusivo (ex.: ocupado + desocupado);
 * - nunca sobrescreve linhas revisadas por humano.
 */
import { transacao, type Banco } from "../db.ts";
import { capacidadesDasFontes, carregarImoveis, linhaParaImovel } from "../consultas.ts";
import { prepararImovel } from "../gravar.ts";
import type { CapacidadesFonte, Confianca, ImovelGravado, ImovelNormalizado, RiscoDetectado, ValorRisco } from "../tipos.ts";
import { mascararTrecho } from "../util/lgpd.ts";
import { textosDoImovel, type TextoAnalise } from "./evidencia.ts";
import { REGRAS } from "./regras/index.ts";
import { definicaoTag, ehSlugTag, type SlugTag } from "./tags.ts";

export type { Ocorrencia, TextoAnalise } from "./evidencia.ts";
export { buscar, buscarPrimeira, criarTextoAnalise, textosDoImovel, trechoAoRedor } from "./evidencia.ts";

/** O que cada regra recebe. */
export interface EntradaRegra {
  imovel: ImovelGravado;
  /** Título, descrição e textos extras, prontos para regex (ver evidencia.ts). */
  textos: readonly TextoAnalise[];
  /** Fonte do imóvel; `null` se desconhecida. Use `capacidades.fotos` antes de marcar "sem-fotos". */
  fonte: { id: string; capacidades: CapacidadesFonte } | null;
  /** Momento da análise (para regras de praça e datas). */
  agora: Date;
}

/** Uma detecção como a regra devolve: `regra` é opcional porque o motor preenche. */
export type DeteccaoRegra = Omit<RiscoDetectado, "regra"> & { regra?: string };

export interface RegraRisco {
  /** Id estável e único, ex.: "posse/texto-ocupado". Vai para a coluna `risco.regra`. */
  id: string;
  /** Uma frase sobre o que a regra procura (aparece em revisão e auditoria). */
  descricao: string;
  /** Tags que a regra pode emitir; o motor recusa qualquer outra. */
  tags: readonly SlugTag[];
  avaliar(entrada: EntradaRegra): DeteccaoRegra[];
}

export interface ResultadoAvaliacao {
  riscos: RiscoDetectado[];
  /** Problemas de regras (exceção, tag não declarada, valor inválido). Não interrompem. */
  erros: string[];
}

const VALORES: ReadonlySet<string> = new Set<ValorRisco>(["sim", "nao", "desconhecido"]);
const CONFIANCAS: ReadonlySet<string> = new Set<Confianca>(["alta", "media", "baixa"]);
const PESO_CONFIANCA: Readonly<Record<Confianca, number>> = { alta: 3, media: 2, baixa: 1 };
const PESO_VALOR: Readonly<Record<ValorRisco, number>> = { sim: 3, desconhecido: 2, nao: 1 };
const TAMANHO_TRECHO = 400;

/** Roda as regras sobre um imóvel. Não acessa o banco. */
export function avaliarImovel(entrada: EntradaRegra, regras: readonly RegraRisco[] = REGRAS): ResultadoAvaliacao {
  const erros: string[] = [];
  const porChave = new Map<string, RiscoDetectado>();
  for (const regra of regras) {
    let deteccoes: DeteccaoRegra[];
    try {
      deteccoes = regra.avaliar(entrada);
    } catch (erro) {
      erros.push(`Regra ${regra.id} falhou no imóvel ${entrada.imovel.id}: ${(erro as Error).message}`);
      continue;
    }
    for (const d of deteccoes) {
      if (!ehSlugTag(d.tag)) {
        erros.push(`Regra ${regra.id} emitiu tag inexistente: ${String(d.tag)}`);
        continue;
      }
      if (!regra.tags.includes(d.tag)) {
        erros.push(`Regra ${regra.id} emitiu tag não declarada: ${d.tag}`);
        continue;
      }
      if (!VALORES.has(d.valor) || !CONFIANCAS.has(d.confianca)) {
        erros.push(`Regra ${regra.id} emitiu valor ou confiança inválidos para ${d.tag}`);
        continue;
      }
      const risco: RiscoDetectado = {
        tag: d.tag,
        valor: d.valor,
        confianca: d.confianca,
        precisa_revisao: Boolean(d.precisa_revisao),
        origem: d.origem?.trim() || "desconhecida",
        trecho: d.trecho ? mascararTrecho(d.trecho, TAMANHO_TRECHO) : null,
        regra: regra.id,
      };
      const chave = `${risco.tag}\u0000${risco.regra}`;
      const atual = porChave.get(chave);
      if (!atual || forca(risco) > forca(atual)) porChave.set(chave, risco);
    }
  }
  const riscos = [...porChave.values()];
  marcarConflitos(riscos);
  return { riscos, erros };
}

function forca(r: Pick<RiscoDetectado, "valor" | "confianca">): number {
  return PESO_VALOR[r.valor] * 10 + PESO_CONFIANCA[r.confianca];
}

/** Tags "sim" de um mesmo grupo exclusivo (ocupação, deságio, praça) vão para revisão. */
function marcarConflitos(riscos: RiscoDetectado[]): void {
  const porGrupo = new Map<string, RiscoDetectado[]>();
  for (const r of riscos) {
    const grupo = definicaoTag(r.tag)?.grupo;
    if (!grupo || r.valor !== "sim") continue;
    porGrupo.set(grupo, [...(porGrupo.get(grupo) ?? []), r]);
  }
  for (const lista of porGrupo.values()) {
    if (new Set(lista.map((r) => r.tag)).size < 2) continue;
    for (const r of lista) r.precisa_revisao = true;
  }
}

/**
 * Monta um ImovelGravado a partir de um normalizado, sem banco, com os mesmos campos
 * derivados e a mesma máscara da gravação. Feito para testes de regras.
 */
export function imovelDeTeste(imovel: ImovelNormalizado, opcoes: { fonteId?: string; agora?: Date; id?: number } = {}): ImovelGravado {
  const agora = opcoes.agora ?? new Date();
  const preparado = prepararImovel(imovel, agora);
  const quando = agora.toISOString();
  return linhaParaImovel(
    {
      ...preparado.linha,
      id: opcoes.id ?? 0,
      fonte_id: opcoes.fonteId ?? "teste",
      primeira_vez_em: quando,
      ultima_vez_em: quando,
      atualizado_em: quando,
      gerado_na_fonte_em: null,
      removido_em: null,
      hash_conteudo: preparado.hash,
    },
    { pracas: preparado.pracas, fotos: preparado.fotos, documentos: preparado.documentos },
  );
}

/** Monta a entrada de uma regra para um imóvel. */
export function entradaPara(imovel: ImovelGravado, fonte: EntradaRegra["fonte"], agora: Date = new Date()): EntradaRegra {
  return { imovel, textos: textosDoImovel(imovel), fonte, agora };
}

export interface OpcoesRodarRiscos {
  /** Só imóveis desta fonte. */
  fonteId?: string;
  regras?: readonly RegraRisco[];
  agora?: Date;
  log?: (mensagem: string) => void;
}

export interface ResultadoRodarRiscos {
  imoveis: number;
  riscos: number;
  /** Primeiros erros de regra (no máximo 50). */
  erros: string[];
  totalErros: number;
}

/**
 * Roda as regras sobre os imóveis ativos e encerrados e regrava as tags automáticas,
 * numa transação. Linhas revisadas (revisado_por preenchido) ficam intactas.
 */
export function rodarRiscos(db: Banco, opcoes: OpcoesRodarRiscos = {}): ResultadoRodarRiscos {
  const agora = opcoes.agora ?? new Date();
  const quando = agora.toISOString();
  const regras = opcoes.regras ?? REGRAS;
  const ids = new Set<string>();
  for (const regra of regras) {
    if (ids.has(regra.id)) throw new Error(`Regra com id repetido: ${regra.id}`);
    ids.add(regra.id);
  }
  const imoveis = carregarImoveis(db, { fonteId: opcoes.fonteId, status: ["ativo", "encerrado"] });
  const capacidades = capacidadesDasFontes(db);
  const apagarAutomaticos = db.prepare(`DELETE FROM risco WHERE imovel_id = ? AND revisado_por IS NULL`);
  const inserir = db.prepare(
    `INSERT INTO risco (imovel_id, tag, valor, confianca, precisa_revisao, origem, trecho, regra, detectado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (imovel_id, tag, regra) DO NOTHING`,
  );
  const resultado: ResultadoRodarRiscos = { imoveis: imoveis.length, riscos: 0, erros: [], totalErros: 0 };
  transacao(db, () => {
    for (const imovel of imoveis) {
      const cap = capacidades.get(imovel.fonte_id);
      const fonte = cap ? { id: imovel.fonte_id, capacidades: cap } : null;
      const { riscos, erros } = avaliarImovel(entradaPara(imovel, fonte, agora), regras);
      resultado.totalErros += erros.length;
      for (const erro of erros) if (resultado.erros.length < 50) resultado.erros.push(erro);
      apagarAutomaticos.run(imovel.id);
      for (const r of riscos) {
        const feito = inserir.run(imovel.id, r.tag, r.valor, r.confianca, r.precisa_revisao ? 1 : 0, r.origem, r.trecho, r.regra, quando);
        resultado.riscos += Number(feito.changes);
      }
    }
  });
  opcoes.log?.(`Riscos: ${resultado.riscos} tag(s) em ${resultado.imoveis} imóvel(is), ${regras.length} regra(s).`);
  return resultado;
}

// ---------------------------------------------------------------------------
// Consolidação (uma decisão por tag, para exportar)
// ---------------------------------------------------------------------------

export interface LinhaRisco {
  tag: string;
  valor: ValorRisco;
  confianca: Confianca;
  precisa_revisao: boolean;
  origem: string;
  trecho: string | null;
  regra: string;
  revisado_por: string | null;
  revisado_em: string | null;
}

export interface TagConsolidada {
  tag: SlugTag;
  valor: ValorRisco;
  confianca: Confianca;
  /** Ainda falta leitura humana (detecção automática marcada para revisão). */
  revisao_pendente: boolean;
  /** Decidida por revisão humana. */
  revisada: boolean;
  origem: string;
  trecho: string | null;
  regra: string;
}

/**
 * Uma decisão por tag: revisão humana (a mais recente) vence; senão, a detecção automática
 * mais forte ("sim" antes de "desconhecido" antes de "não"; depois a maior confiança).
 */
export function consolidarTags(linhas: readonly LinhaRisco[]): TagConsolidada[] {
  const porTag = new Map<string, LinhaRisco[]>();
  for (const l of linhas) {
    if (!ehSlugTag(l.tag)) continue;
    porTag.set(l.tag, [...(porTag.get(l.tag) ?? []), l]);
  }
  const saida: TagConsolidada[] = [];
  for (const [tag, lista] of porTag) {
    const revisadas = lista.filter((l) => l.revisado_por).sort((a, b) => (b.revisado_em ?? "").localeCompare(a.revisado_em ?? ""));
    const escolhida = revisadas[0] ?? [...lista].sort((a, b) => forca(b) - forca(a))[0];
    if (!escolhida) continue;
    const revisada = Boolean(escolhida.revisado_por);
    saida.push({
      tag: tag as SlugTag,
      valor: escolhida.valor,
      confianca: escolhida.confianca,
      revisao_pendente: !revisada && escolhida.precisa_revisao,
      revisada,
      origem: escolhida.origem,
      trecho: escolhida.trecho,
      regra: escolhida.regra,
    });
  }
  return saida;
}
