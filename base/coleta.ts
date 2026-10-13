/**
 * Orquestração de uma coleta: roda o conector, normaliza, valida tudo em memória e só então
 * grava, numa transação. Se a coleta falhar ou o conteúdo for reprovado, nada é gravado e os
 * dados anteriores continuam valendo. Cada execução fica registrada na tabela `coleta`.
 */
import { lerTexto, transacao, type Banco } from "./db.ts";
import { garantirFonte, gravarEditais, gravarImoveis, type ResultadoEditais, type ResultadoGravacao } from "./gravar.ts";
import type { Conector, EditalNormalizado, ImovelNormalizado, MetaColeta, RegistroNormalizado, Uf } from "./tipos.ts";
import { ehDataDaBase, instanteDe } from "./util/data.ts";
import { criarClienteHttp, type ClienteHttp } from "./util/http.ts";
import { validarEdital, validarImovel } from "./validar.ts";

export type StatusColeta = "executando" | "sucesso" | "parcial" | "invalida" | "erro";

export interface OpcoesExecucao {
  uf?: Uf;
  arquivo?: string;
  limite?: number;
  detalhes?: boolean;
  /** Cliente HTTP a usar (padrão: um novo, com a configuração educada padrão). */
  http?: ClienteHttp;
  log?: (mensagem: string) => void;
  sinal?: AbortSignal;
  agora?: Date;
  /** Fração máxima de registros com erro de normalização ou validação. Padrão 0,05 (5%); até 2 sempre passam. */
  maxFracaoInvalidos?: number;
}

export interface ResumoColeta {
  coletaId: number;
  fonteId: string;
  status: StatusColeta;
  /** A coleta marcou como removido o que sumiu (coleta completa e válida). */
  completa: boolean;
  lidos: number;
  descartados: number;
  invalidos: number;
  novos: number;
  atualizados: number;
  inalterados: number;
  reativados: number;
  removidos: number;
  /** Ignorados porque o gravado veio de uma geração mais nova da fonte. */
  antigos: number;
  editais: number;
  geradoEm: string | null;
  origem: string | null;
  erro: string | null;
  avisos: string[];
}

const MAX_AVISOS = 20;

/** Abre a linha de log da coleta (status "executando") e devolve o id. */
export function iniciarColeta(
  db: Banco,
  fonteId: string,
  dados: { escopoUf?: Uf | null; parametros?: Record<string, unknown>; agora?: Date } = {},
): number {
  const linha = db
    .prepare(`INSERT INTO coleta (fonte_id, iniciada_em, status, escopo_uf, parametros) VALUES (?, ?, 'executando', ?, ?) RETURNING id`)
    .get(fonteId, (dados.agora ?? new Date()).toISOString(), dados.escopoUf ?? null, JSON.stringify(dados.parametros ?? {}));
  return Number(linha?.id);
}

/** Fecha a linha de log da coleta com o resultado. */
export function finalizarColeta(db: Banco, coletaId: number, resumo: Omit<ResumoColeta, "coletaId" | "fonteId">, terminadaEm: Date = new Date()): void {
  db.prepare(
    `UPDATE coleta SET terminada_em = ?, status = ?, completa = ?, origem = ?, gerado_na_fonte_em = ?, lidos = ?, descartados = ?,
       invalidos = ?, novos = ?, atualizados = ?, inalterados = ?, reativados = ?, removidos = ?, antigos = ?, editais = ?, erro = ?,
       avisos = ?
     WHERE id = ?`,
  ).run(
    terminadaEm.toISOString(), resumo.status, resumo.completa ? 1 : 0, resumo.origem, resumo.geradoEm, resumo.lidos,
    resumo.descartados, resumo.invalidos, resumo.novos, resumo.atualizados, resumo.inalterados, resumo.reativados,
    resumo.removidos, resumo.antigos, resumo.editais, resumo.erro, resumo.avisos.length > 0 ? JSON.stringify(resumo.avisos) : null,
    coletaId,
  );
}

/** Data de geração da última coleta gravada (sucesso/parcial) da fonte no mesmo escopo. */
function ultimaGeracao(db: Banco, fonteId: string, escopoUf: Uf | null): string | null {
  const linha = db
    .prepare(
      `SELECT gerado_na_fonte_em AS g FROM coleta
       WHERE fonte_id = ? AND status IN ('sucesso','parcial') AND gerado_na_fonte_em IS NOT NULL AND coalesce(escopo_uf, '') = ?
       ORDER BY gerado_na_fonte_em DESC LIMIT 1`,
    )
    .get(fonteId, escopoUf ?? "");
  return linha ? lerTexto(linha.g) : null;
}

/**
 * Executa a coleta de um conector e grava o resultado. Nunca lança por falha da fonte:
 * devolve o resumo com status "erro" ou "invalida" (e o log fica na tabela `coleta`).
 */
export async function executarColeta(db: Banco, conector: Conector, opcoes: OpcoesExecucao = {}): Promise<ResumoColeta> {
  const agora = opcoes.agora ?? new Date();
  const log = opcoes.log ?? (() => undefined);
  const escopoUf = opcoes.uf ?? null;
  garantirFonte(db, conector, agora);
  const coletaId = iniciarColeta(db, conector.id, {
    escopoUf,
    parametros: { arquivo: opcoes.arquivo ?? null, limite: opcoes.limite ?? null, detalhes: Boolean(opcoes.detalhes) },
    agora,
  });

  const meta: MetaColeta = {};
  const avisos: string[] = [];
  const avisar = (mensagem: string): void => {
    if (avisos.length < MAX_AVISOS) avisos.push(mensagem);
    else if (avisos.length === MAX_AVISOS) avisos.push("(mais avisos omitidos)");
  };
  const resumo: ResumoColeta = {
    coletaId, fonteId: conector.id, status: "executando", completa: false, lidos: 0, descartados: 0, invalidos: 0,
    novos: 0, atualizados: 0, inalterados: 0, reativados: 0, removidos: 0, antigos: 0, editais: 0, geradoEm: null,
    origem: null, erro: null, avisos,
  };
  const fechar = (status: StatusColeta, erro: string | null = null): ResumoColeta => {
    resumo.status = status;
    resumo.erro = erro;
    resumo.geradoEm = meta.geradoEm ?? null;
    resumo.origem = meta.origem ?? opcoes.arquivo ?? null;
    finalizarColeta(db, coletaId, resumo);
    return resumo;
  };

  const imoveis: ImovelNormalizado[] = [];
  const editais: EditalNormalizado[] = [];
  const idsProtegidos: string[] = [];
  let falhasNormalizacao = 0;
  let foraDaUf = 0;

  try {
    const http = opcoes.http ?? criarClienteHttp({ log });
    const fluxo = conector.coletar({
      uf: opcoes.uf,
      arquivo: opcoes.arquivo,
      limite: opcoes.limite,
      detalhes: opcoes.detalhes,
      http,
      log,
      sinal: opcoes.sinal,
      informar: (m) => {
        if (m.aviso) avisar(m.aviso);
        if (m.geradoEm !== undefined) {
          if (ehDataDaBase(m.geradoEm)) meta.geradoEm = m.geradoEm;
          else avisar(`geradoEm fora do padrão (use AAAA-MM-DD ou ISO): ${m.geradoEm}; ignorado.`);
        }
        if (m.origem !== undefined) meta.origem = m.origem;
        if (m.totalNaFonte !== undefined) meta.totalNaFonte = m.totalNaFonte;
        if (m.vazioLegitimo !== undefined) meta.vazioLegitimo = m.vazioLegitimo;
      },
    });
    for await (const bruto of fluxo) {
      if (opcoes.sinal?.aborted) throw new Error("Coleta cancelada; nada foi gravado.");
      resumo.lidos++;
      let registro: RegistroNormalizado | null | undefined;
      try {
        registro = conector.normalizar(bruto);
      } catch (erro) {
        falhasNormalizacao++;
        resumo.invalidos++;
        avisar(`Registro ${resumo.lidos}: normalizar falhou (${(erro as Error).message}).`);
        registro = undefined;
      }
      if (registro === null) resumo.descartados++;
      else if (registro?.registro === "imovel") {
        if (escopoUf && registro.uf !== escopoUf) {
          foraDaUf++;
          resumo.descartados++;
        } else {
          const problemas = validarImovel(registro);
          if (problemas.length > 0) {
            resumo.invalidos++;
            if (typeof registro.id_na_fonte === "string" && registro.id_na_fonte.trim()) idsProtegidos.push(registro.id_na_fonte.trim());
            avisar(`Imóvel ${String(registro.id_na_fonte)}: ${problemas.join("; ")}.`);
          } else imoveis.push(registro);
        }
      } else if (registro?.registro === "edital") {
        const problemas = validarEdital(registro);
        if (problemas.length > 0) {
          resumo.invalidos++;
          avisar(`Edital ${String(registro.id_na_fonte)}: ${problemas.join("; ")}.`);
        } else editais.push(registro);
      } else if (registro !== undefined) {
        resumo.invalidos++;
        avisar(`Registro ${resumo.lidos}: tipo de registro desconhecido.`);
      }
      if (opcoes.limite && resumo.lidos >= opcoes.limite) break;
    }
  } catch (erro) {
    const mensagem = (erro as Error).message || String(erro);
    log(`Coleta ${conector.id} falhou: ${mensagem}`);
    return fechar("erro", mensagem);
  }
  if (foraDaUf > 0) avisar(`${foraDaUf} imóvel(is) fora da UF ${escopoUf} ignorado(s).`);

  // Validação do lote, antes de qualquer gravação.
  const uteis = resumo.lidos - resumo.descartados;
  const maxInvalidos = opcoes.maxFracaoInvalidos ?? 0.05;
  if (resumo.lidos === 0) {
    // Janela sem nada publicado (domingo sem DOU, PNCP 204): o conector declara e a coleta vale.
    if (meta.vazioLegitimo === true && !conector.capacidades.listaCompleta) {
      avisar("Nenhum registro no período consultado (a fonte respondeu normalmente).");
      return fechar("sucesso");
    }
    return fechar("invalida", "A fonte não devolveu nenhum registro.");
  }
  if (uteis > 0 && imoveis.length + editais.length === 0) return fechar("invalida", "Nenhum registro válido na coleta.");
  // Até 2 inválidos são tolerados em qualquer lote (lotes pequenos, como uma UF com 20 imóveis).
  if (uteis > 0 && resumo.invalidos > Math.max(2, uteis * maxInvalidos)) {
    return fechar("invalida", `${resumo.invalidos} de ${uteis} registros com erro (limite ${Math.round(maxInvalidos * 100)}%). Formato da fonte mudou?`);
  }
  if (conector.volumeMinimo && !escopoUf && !opcoes.limite && imoveis.length < conector.volumeMinimo) {
    return fechar("invalida", `Só ${imoveis.length} imóveis válidos; o mínimo esperado para ${conector.id} é ${conector.volumeMinimo}. Arquivo truncado?`);
  }
  if (meta.geradoEm) {
    const anterior = ultimaGeracao(db, conector.id, escopoUf);
    const tAnterior = anterior ? instanteDe(anterior) : null;
    const tAtual = instanteDe(meta.geradoEm);
    if (tAnterior !== null && tAtual !== null && tAtual < tAnterior) {
      return fechar("invalida", `Arquivo gerado em ${meta.geradoEm}, mais antigo que o já gravado (${anterior}). Nada foi sobrescrito.`);
    }
  }

  let completa = conector.capacidades.listaCompleta && !opcoes.limite && imoveis.length > 0;
  if (completa && falhasNormalizacao > 0) {
    completa = false;
    avisar(`Remoção desligada nesta coleta: ${falhasNormalizacao} registro(s) não puderam ser normalizados.`);
  }

  let gravacao: ResultadoGravacao | null = null;
  let gravacaoEditais: ResultadoEditais | null = null;
  try {
    transacao(db, () => {
      gravacao = gravarImoveis(db, conector.id, imoveis, {
        completa,
        escopoUf,
        maxFracaoRemocao: conector.maxFracaoRemocao,
        idsProtegidos,
        geradoEm: meta.geradoEm ?? null,
        coletaId,
        agora,
      });
      gravacaoEditais = editais.length > 0 ? gravarEditais(db, conector.id, editais, { agora }) : null;
    });
  } catch (erro) {
    return fechar("erro", `Falha ao gravar (nada foi gravado): ${(erro as Error).message}`);
  }
  const g = gravacao as ResultadoGravacao | null;
  const ge = gravacaoEditais as ResultadoEditais | null;
  if (g) {
    resumo.novos = g.novos;
    resumo.atualizados = g.atualizados;
    resumo.inalterados = g.inalterados;
    resumo.reativados = g.reativados;
    resumo.removidos = g.removidos;
    resumo.antigos = g.antigos;
    g.avisos.forEach(avisar);
  }
  if (ge) {
    resumo.editais = ge.novos + ge.atualizados + ge.inalterados;
    ge.avisos.forEach(avisar);
  }
  resumo.completa = completa && g?.remocao === "feita";
  const ressalvas = resumo.invalidos > 0 || g?.remocao === "bloqueada";
  return fechar(ressalvas ? "parcial" : "sucesso");
}
