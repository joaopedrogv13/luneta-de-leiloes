/**
 * Tudo o que o simulador mostra, numa função pura: a tela (src/components/simulador) e o relatório em PDF
 * (/<previa|assinante>/imovel/<id>/relatorio) chamam `simulacaoCompleta` com o mesmo estado guardado no
 * navegador (formato em estado.ts) e mostram os mesmos números.
 *
 *   const estado = interpretarEstado(localStorage.getItem(chaveEstado(id)));
 *   const r = simulacaoCompleta(entrada, estado, vizinhanca.referencias);
 *   r.teto            → "Dê no máximo R$ X" (null: nenhum lance atinge a meta)
 *   r.tabela          → matriz cenários (r.linhas) × prazos (r.colunas)
 *   r.detalhe.conta   → a conta linha a linha (rótulo, fórmula, valor), r.detalhe.etapas → a cascata
 */
import { cascata, lanceMaximo, matriz, simular, type CelulaMatriz, type Etapa } from "./calculo";
import { adicionaveis, contarAjustes, linhasDaConta, type Adicionavel, type LinhaConta } from "./conta";
import { prazoValido, type EstadoSimulador, type LanceDetalhe, type Visao } from "./estado";
import { cenariosDaMatriz, colunasDaMatriz, montarModelo, type Modelo } from "./premissas";
import { semDisputa } from "./textos";
import type { ReferenciaM2 } from "../catalogo/tipos";
import type { Celula, Cenario, EntradaSimulador, Meta, Simulacao } from "./tipos";

export interface Detalhamento {
  /** com qual lance a conta foi feita */
  base: LanceDetalhe;
  /** o lance é o mínimo atual, o máximo para a meta, ou outro escolhido pela pessoa */
  qualLance: "minimo" | "teto" | "meu";
  sim: Simulacao;
  /** linhas na conta, na ordem da tela */
  conta: LinhaConta[];
  /** linhas tiradas pela pessoa (com o valor que teriam) */
  retiradas: LinhaConta[];
  /** cascata da venda ao lucro */
  etapas: Etapa[];
}

export interface ResultadoCompleto {
  entrada: EntradaSimulador;
  /** o estado já conferido (cenário personalizado só se definido, prazo dentro da faixa) */
  estado: EstadoSimulador;
  /**
   * venda direta: preço fixo, sem disputa. A resposta deixa de ser o lance máximo e passa a ser o lucro pelo preço
   * pedido, com a margem de segurança (`margem`); a matriz abre no lucro.
   */
  semDisputa: boolean;
  /** o que a matriz mostra (a escolha da pessoa, ou o padrão do imóvel: lance máximo; na venda direta, o lucro) */
  visao: Visao;
  modelo: Modelo;
  meta: Meta;
  celula: Celula;
  /** prazos (colunas) e cenários (linhas) da matriz */
  colunas: number[];
  linhas: Cenario[];
  /** o prazo escolhido entrou como coluna extra (não é um dos prazos da pessoa) */
  colunaExtra: number | null;
  /** null: falta o valor de venda */
  tabela: CelulaMatriz[][] | null;
  /** lance máximo para a meta no cenário e prazo escolhidos (null: nenhum lance atinge, ou falta a venda) */
  teto: number | null;
  /** simulação com o lance mínimo atual, no cenário e prazo escolhidos */
  comLanceMinimo: Simulacao | null;
  /**
   * venda direta: a margem de segurança pelo preço pedido no cenário e prazo escolhidos (o custo imprevisto que
   * ainda cabe mantendo a meta; null: nem sem imprevisto a meta é atingida). Fora da venda direta, sempre null.
   */
  margem: number | null;
  /** o lance da pessoa (ou o mínimo) */
  meuLance: number;
  /** a análise aponta dívidas e a pessoa ainda não disse quanto são: os números saem "sem as dívidas" */
  semDividas: boolean;
  detalhe: Detalhamento | null;
  /** quantas mudanças a pessoa fez ("Restaurar tudo (n)") */
  ajustes: number;
  /** o que o "+ Adicionar custo" oferece */
  adicionaveis: Adicionavel[];
}

/** Confere o estado contra o imóvel: cenário personalizado sem definição vira base; prazo fora da faixa, 12. */
export function normalizarEstado(estado: EstadoSimulador, modelo: Modelo): EstadoSimulador {
  const celula: Celula = {
    cenario: estado.celula.cenario === "personalizado" && !modelo.premissas.vendaPersonalizada ? "base" : estado.celula.cenario,
    meses: prazoValido(estado.celula.meses) ? estado.celula.meses : 12,
  };
  return celula.cenario === estado.celula.cenario && celula.meses === estado.celula.meses ? estado : { ...estado, celula };
}

export function simulacaoCompleta(entrada: EntradaSimulador, estadoBruto: EstadoSimulador, referencias?: readonly ReferenciaM2[]): ResultadoCompleto {
  const modelo = montarModelo(entrada, estadoBruto.ajustes, referencias);
  return completarModelo(modelo, estadoBruto);
}

/** O mesmo, a partir de um modelo já montado (a tela reaproveita o modelo memorizado). */
export function completarModelo(modelo: Modelo, estadoBruto: EstadoSimulador): ResultadoCompleto {
  const entrada = modelo.entrada;
  const estado = normalizarEstado(estadoBruto, modelo);
  const p = modelo.premissas;
  const { meta, celula } = estado;
  const meuLance = estado.meuLance ?? entrada.lance;
  const colunas = colunasDaMatriz(p.prazos, celula.meses);
  const linhas = cenariosDaMatriz(p);
  const fixo = semDisputa(entrada);
  const tabela = matriz(modelo, meta, meuLance, colunas, linhas, fixo ? entrada.lance : null);
  const cel = tabela?.[linhas.indexOf(celula.cenario)]?.[colunas.indexOf(celula.meses)] ?? null;
  const teto = cel ? cel.teto : null;
  const comLanceMinimo = simular(modelo, entrada.lance, celula.cenario, celula.meses);
  const semDividas = modelo.dividasApontadas.length > 0 && modelo.ajustes.dividas === undefined;

  let detalhe: Detalhamento | null = null;
  if (cel) {
    // na venda direta não há "lance máximo" para usar na conta: vale o preço (o pedido, ou o que a pessoa digitou)
    const base: LanceDetalhe = !fixo && estado.lanceDetalhe === "teto" && teto !== null ? "teto" : "meu";
    const lance = base === "teto" ? teto! : meuLance;
    const sim = base === "teto" ? simular(modelo, lance, celula.cenario, celula.meses)! : cel.comMeuLance;
    const { conta, retiradas } = linhasDaConta(modelo, sim);
    const qualLance =
      Math.round(sim.lance) === Math.round(entrada.lance) ? "minimo" : !fixo && teto !== null && Math.round(sim.lance) === Math.round(teto) ? "teto" : "meu";
    detalhe = { base, qualLance, sim, conta, retiradas, etapas: cascata(sim, modelo.perfil.rotuloReforma, fixo ? "Preço" : "Lance") };
  }

  return {
    entrada,
    estado,
    semDisputa: fixo,
    visao: estado.visao ?? (fixo ? "lucro" : "teto"),
    modelo,
    meta,
    celula,
    colunas,
    linhas,
    colunaExtra: p.prazos.includes(celula.meses) ? null : celula.meses,
    tabela,
    teto,
    comLanceMinimo,
    margem: cel?.margem ?? null,
    meuLance,
    semDividas,
    detalhe,
    ajustes: contarAjustes(modelo),
    adicionaveis: adicionaveis(modelo),
  };
}

/** Lance máximo para uma meta num cenário e prazo, com o modelo do resultado (atalho para a tela e o PDF). */
export function tetoPara(r: Pick<ResultadoCompleto, "modelo">, cenario: Cenario, meses: number, meta: Meta): number | null {
  return lanceMaximo(r.modelo, cenario, meses, meta);
}
