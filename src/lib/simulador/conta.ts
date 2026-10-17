/**
 * A conta linha a linha do Detalhe (e do relatório em PDF): cada linha com rótulo, fórmula, valor, o pop-up de
 * edição que a abre, se foi ajustada e se pode ser tirada da conta. Pura (sem React, sem "@/").
 */
import { baseItbi, ligada, simular } from "./calculo";
import { area as areaTexto, meses, moeda, moedaMes, moedaSinal, pct } from "./formato";
import { multiplicador, ROTULO_NIVEL, type Modelo } from "./premissas";
import { baseDaVenda } from "./textos";
import type { Ajustes, LinhaDesligavel, Premissas, Simulacao } from "./tipos";

/** O pop-up que edita a linha: um por tipo de despesa. */
export type EditorLinha =
  | "venda"
  | "corretagem"
  | "ir"
  | "lance"
  | "comissao"
  | "itbi"
  | "registro"
  | "reserva"
  | "reforma"
  | "condominio"
  | "iptu"
  | "contas"
  | "desocupacao"
  | "dividas"
  | "aplicacao"
  | "extra";

/** As premissas que cada pop-up muda (para "ajustada" e "voltar ao padrão"). */
export const CHAVES_EDITOR: Record<Exclude<EditorLinha, "extra">, (keyof Ajustes)[]> = {
  venda: ["valorVenda", "baseVenda", "cenarioConservador", "cenarioBase", "cenarioOtimista", "vendaPersonalizada"],
  corretagem: ["corretagemPct"],
  ir: ["irPct", "irIsento"],
  lance: ["financiar", "parcelar", "entradaPct", "jurosAA", "prazoFinanciamento", "segurosMensal", "parcelasEntradaPct", "parcelasN", "parcelasCorrecaoAA"],
  comissao: ["comissaoPct"],
  itbi: ["itbiPct", "itbiBase"],
  registro: ["registroPct", "registroMin"],
  reserva: ["reservaPct"],
  reforma: ["reformaNivel", "reformaModo", "reformaUnitario"],
  condominio: ["emCondominio", "condominio", "mesesCondominio"],
  iptu: ["iptuPct", "iptuAnual", "mesesIptu"],
  contas: ["contas", "mesesContas"],
  desocupacao: ["desocupacao"],
  dividas: ["dividas"],
  aplicacao: ["aplicacaoAA"],
};

/** A linha que cada pop-up pode tirar da conta. */
export const DESLIGAVEL: Partial<Record<EditorLinha, LinhaDesligavel>> = {
  corretagem: "corretagem",
  ir: "ir",
  comissao: "comissao",
  itbi: "itbi",
  registro: "registro",
  reserva: "reserva",
  reforma: "reforma",
  condominio: "condominio",
  iptu: "iptu",
  contas: "contas",
  desocupacao: "desocupacao",
  dividas: "dividas",
};

export type GrupoConta = "venda" | "compra" | "depois" | "mensal";
export const GRUPO_ROTULO: Record<GrupoConta, string> = {
  venda: "Venda",
  compra: "Compra",
  depois: "Regularização e reforma",
  mensal: "Enquanto não vende",
};

export interface LinhaConta {
  /** único na conta ("venda", "juros", "extra:a1b2") */
  id: string;
  editor: EditorLinha;
  grupo: GrupoConta;
  rotulo: string;
  /** como o valor foi calculado ("6% da venda", "R$ 540 × 12 meses") */
  formula: string;
  /** com sinal: a venda positiva, os custos negativos (nas retiradas, o valor que teria) */
  valor: number;
  /** a pessoa mudou alguma premissa desta linha (ou criou o custo) */
  ajustada: boolean;
  /** pode sair da conta (e por qual chave) */
  desligavel: LinhaDesligavel | null;
  desligada: boolean;
  /** id do custo criado (editor "extra") */
  extraId?: string;
}

const igual = (a: unknown, b: unknown): boolean =>
  typeof a === "number" && typeof b === "number"
    ? Math.abs(a - b) < 1e-9
    : Array.isArray(a) && Array.isArray(b)
      ? JSON.stringify(a) === JSON.stringify(b)
      : a && b && typeof a === "object" && typeof b === "object"
        ? JSON.stringify(a) === JSON.stringify(b)
        : a === b;

/**
 * Ajustes que valem mesmo iguais ao padrão, porque confirmam um dado: a área quando a fonte não informa (o
 * padrão é só um tamanho típico) e as dívidas quando a análise aponta alguma (informar R$ 0 é "conferi no
 * edital e não há").
 */
export function confirmaDado(modelo: Modelo, k: keyof Ajustes): boolean {
  return (k === "area" && modelo.padrao.areaEstimada) || (k === "dividas" && modelo.dividasApontadas.length > 0);
}

/** A chave foi ajustada (diferente do padrão, ou confirma um dado)? */
export function chaveAjustada(modelo: Modelo, k: keyof Ajustes): boolean {
  const v = modelo.ajustes[k];
  if (v === undefined) return false;
  if (k === "custosExtras" || k === "desligados") return Array.isArray(v) && v.length > 0;
  return !igual(v, modelo.padrao[k as keyof Premissas]) || confirmaDado(modelo, k);
}

export function editorAjustado(modelo: Modelo, editor: Exclude<EditorLinha, "extra">): boolean {
  return CHAVES_EDITOR[editor].some((k) => chaveAjustada(modelo, k));
}

/** Quantas mudanças a pessoa fez (premissas diferentes do padrão, linhas tiradas e custos criados). */
export function contarAjustes(modelo: Modelo): number {
  const a = modelo.ajustes;
  const chaves = (Object.keys(a) as (keyof Ajustes)[]).filter((k) => k !== "custosExtras" && k !== "desligados" && chaveAjustada(modelo, k));
  return chaves.length + (a.desligados?.length ?? 0) + (a.custosExtras?.length ?? 0);
}

/** O que dá para acrescentar pelo "+ Adicionar custo" (linhas que hoje não estão na conta). */
export interface Adicionavel {
  editor: "desocupacao" | "dividas" | "condominio";
  rotulo: string;
  descricao: string;
}

function mostraDesocupacao(m: Modelo) {
  return m.premissas.desocupacao > 0 || m.ocupado || m.ajustes.desocupacao !== undefined;
}
function mostraDividas(m: Modelo) {
  return m.premissas.dividas > 0 || m.dividasApontadas.length > 0 || m.ajustes.dividas !== undefined;
}
function mostraCondominio(m: Modelo) {
  return m.premissas.condominio > 0 || m.perfil.condominioPadrao || m.premissas.emCondominio;
}

export function adicionaveis(modelo: Modelo): Adicionavel[] {
  const saida: Adicionavel[] = [];
  if (!mostraDesocupacao(modelo))
    saida.push({ editor: "desocupacao", rotulo: "Desocupação", descricao: "Se o imóvel estiver ocupado: acordo com quem mora ou ação na Justiça." });
  if (!mostraDividas(modelo))
    saida.push({ editor: "dividas", rotulo: "Dívidas que passam ao comprador", descricao: "Condomínio, IPTU ou outras dívidas que o edital manda o comprador pagar." });
  if (!mostraCondominio(modelo) && modelo.perfil.opcaoCondominio)
    saida.push({ editor: "condominio", rotulo: `Condomínio (${modelo.perfil.opcaoCondominio.toLowerCase()})`, descricao: "Taxa mensal enquanto o imóvel não vende." });
  return saida;
}

/**
 * Monta as linhas da conta para uma simulação, na ordem da tela. As linhas tiradas pela pessoa saem da conta e
 * vêm em `retiradas`, com o valor que teriam (para ela decidir religar).
 */
export function linhasDaConta(modelo: Modelo, sim: Simulacao): { conta: LinhaConta[]; retiradas: LinhaConta[] } {
  const p = modelo.premissas;
  const e = modelo.entrada;
  const fin = sim.financiamento;
  // valores das linhas tiradas: a mesma simulação com tudo ligado
  const tudo = p.desligados.length ? simular(modelo, sim.lance, sim.cenario, sim.meses, { ...p, desligados: [] })! : sim;
  const linhas: LinhaConta[] = [];
  const ajustado = (ed: Exclude<EditorLinha, "extra">) => editorAjustado(modelo, ed);
  const add = (l: Omit<LinhaConta, "desligada" | "ajustada" | "desligavel"> & { ajustada?: boolean; desligavel?: LinhaDesligavel | null }) => {
    const desligavel = l.desligavel !== undefined ? l.desligavel : (DESLIGAVEL[l.editor] ?? null);
    linhas.push({
      ...l,
      ajustada: l.ajustada ?? (l.editor === "extra" ? true : ajustado(l.editor)),
      desligavel,
      desligada: desligavel !== null && !ligada(p, desligavel),
    });
  };
  const m = sim.meses;

  // --- Venda
  const personalizadoValor = sim.cenario === "personalizado" && p.vendaPersonalizada?.modo === "valor";
  add({
    id: "venda",
    editor: "venda",
    grupo: "venda",
    rotulo: "Venda",
    formula: personalizadoValor ? "valor que você definiu (cenário personalizado)" : `${pct(multiplicador(p, sim.cenario), 0)} ${baseDaVenda(modelo)} (${moeda(p.valorVenda ?? 0)})`,
    valor: sim.venda,
    desligavel: null,
  });
  add({ id: "corretagem", editor: "corretagem", grupo: "venda", rotulo: "Corretagem", formula: `${pct(p.corretagemPct)} da venda`, valor: -tudo.corretagem });
  // o IR depende das outras linhas (o ITBI tirado aumenta o ganho): ligado, vale a simulação de verdade
  const sIr = ligada(p, "ir") ? sim : tudo;
  add({
    id: "ir",
    editor: "ir",
    grupo: "venda",
    rotulo: "Imposto de renda",
    formula: p.irIsento
      ? "isento (você indicou direito à isenção)"
      : sIr.ganhoCapital > 0
        ? `${pct(p.irPct)} do ganho de capital (${moeda(sIr.ganhoCapital)})`
        : `sem ganho de capital (${moedaSinal(sIr.ganhoCapital)})`,
    valor: -(p.irIsento ? 0 : Math.max(0, p.irPct * sIr.ganhoCapital)),
  });

  // --- Compra
  add({
    id: "lance",
    editor: "lance",
    grupo: "compra",
    rotulo: "Lance",
    formula: fin ? `entrada ${moeda(fin.entrada)} + ${fin.tipo === "fonte" ? "parcelado" : "financiado"} ${moeda(fin.financiado)}` : "pago à vista",
    valor: -sim.lance,
    desligavel: null,
  });
  if (fin) {
    add({
      id: "juros",
      editor: "lance",
      grupo: "compra",
      rotulo: fin.tipo === "fonte" ? "Correção das parcelas" : "Juros do financiamento",
      formula:
        fin.tipo === "fonte"
          ? `${fin.parcelasPagas} de ${fin.prazo} parcelas e o saldo, corrigidos a ${pct(p.parcelasCorrecaoAA)} ao ano`
          : `${fin.parcelasPagas} parcelas (SAC) a ${pct(p.jurosAA)} ao ano`,
      valor: -fin.jurosPagos,
      desligavel: null,
    });
  }
  add({
    id: "comissao",
    editor: "comissao",
    grupo: "compra",
    rotulo: "Comissão do leiloeiro",
    formula: p.comissaoPct === 0 ? "sem leiloeiro nesta modalidade" : `${pct(p.comissaoPct)} do lance`,
    valor: -tudo.comissao,
  });
  const baseI = baseItbi(modelo, p, sim.lance);
  add({
    id: "itbi",
    editor: "itbi",
    grupo: "compra",
    rotulo: "ITBI",
    formula:
      p.itbiBase === "lance" || baseI === sim.lance
        ? `${pct(p.itbiPct)} do lance`
        : `${pct(p.itbiPct)} ${p.itbiBase === "avaliacao" ? "da avaliação" : "da avaliação (maior que o lance)"} (${moeda(baseI)})`,
    valor: -tudo.itbi,
  });
  add({
    id: "registro",
    editor: "registro",
    grupo: "compra",
    rotulo: "Escritura e registro",
    formula: `maior entre ${pct(p.registroPct)} do lance e ${moeda(p.registroMin)}`,
    valor: -tudo.registro,
  });
  add({ id: "reserva", editor: "reserva", grupo: "compra", rotulo: "Reserva para imprevistos", formula: `${pct(p.reservaPct)} do lance`, valor: -tudo.reserva });

  // --- Regularização e reforma
  if (mostraDesocupacao(modelo) || !ligada(p, "desocupacao")) {
    add({
      id: "desocupacao",
      editor: "desocupacao",
      grupo: "depois",
      rotulo: "Desocupação",
      formula: modelo.ocupado ? "imóvel ocupado: acordo ou ação na Justiça" : "valor que você incluiu",
      valor: -tudo.desocupacao,
    });
  }
  if (mostraDividas(modelo) || !ligada(p, "dividas")) {
    add({
      id: "dividas",
      editor: "dividas",
      grupo: "depois",
      rotulo: "Dívidas que passam ao comprador",
      formula: modelo.ajustes.dividas !== undefined ? "valor que você informou" : "falta informar o valor (está no edital)",
      valor: -tudo.dividas,
    });
  }
  add({
    id: "reforma",
    editor: "reforma",
    grupo: "depois",
    rotulo: modelo.perfil.rotuloReforma,
    formula:
      p.reformaModo === "m2"
        ? `${ROTULO_NIVEL[p.reformaNivel]}: ${moeda(p.reformaUnitario)}/m² × ${areaTexto(p.area)}${p.areaEstimada ? " (área típica)" : ""}`
        : modelo.ajustes.reformaUnitario !== undefined
          ? "valor total que você informou"
          : `${ROTULO_NIVEL[p.reformaNivel]} (${modelo.perfil.descricaoNivel[p.reformaNivel]}): valor total`,
    valor: -tudo.reforma,
  });
  for (const x of p.custosExtras) {
    if (x.modo === "mensal") continue;
    const s = tudo.extras.find((y) => y.id === x.id);
    add({
      id: `extra:${x.id}`,
      editor: "extra",
      extraId: x.id,
      grupo: "depois",
      rotulo: x.nome,
      formula: x.modo === "fixo" ? "valor fixo (custo criado por você)" : `${pct(x.valor)} do lance (custo criado por você)`,
      valor: -(s?.valor ?? 0),
      desligavel: `extra:${x.id}`,
    });
  }

  // --- Enquanto não vende
  if (mostraCondominio(modelo) || !ligada(p, "condominio")) {
    add({
      id: "condominio",
      editor: "condominio",
      grupo: "mensal",
      rotulo: "Condomínio",
      formula: `${moedaMes(p.condominio)} × ${meses(tudo.mesesCusto.condominio)}`,
      valor: -tudo.mensal.condominio * tudo.mesesCusto.condominio,
    });
  }
  const iptuMes = tudo.mensal.iptu;
  add({
    id: "iptu",
    editor: "iptu",
    grupo: "mensal",
    rotulo: modelo.perfil.rotuloImposto,
    formula:
      p.iptuAnual !== null
        ? `${moeda(p.iptuAnual)} por ano: ${moedaMes(iptuMes)} × ${meses(tudo.mesesCusto.iptu)}`
        : `${moedaMes(iptuMes)} × ${meses(tudo.mesesCusto.iptu)} (${pct(p.iptuPct, 2)} ao ano ${e.avaliacao ? "da avaliação" : "do lance"})`,
    valor: -iptuMes * tudo.mesesCusto.iptu,
  });
  add({
    id: "contas",
    editor: "contas",
    grupo: "mensal",
    rotulo: "Contas e manutenção",
    formula: `${moedaMes(p.contas)} × ${meses(tudo.mesesCusto.contas)}`,
    valor: -tudo.mensal.contas * tudo.mesesCusto.contas,
  });
  if (fin && sim.mensal.seguros > 0) {
    add({
      id: "seguros",
      editor: "lance",
      grupo: "mensal",
      rotulo: "Seguros e tarifa do banco",
      formula: `${moedaMes(sim.mensal.seguros)} × ${meses(fin.parcelasPagas)}`,
      valor: -sim.mensal.seguros * fin.parcelasPagas,
      desligavel: null,
    });
  }
  for (const x of p.custosExtras) {
    if (x.modo !== "mensal") continue;
    const s = tudo.extras.find((y) => y.id === x.id);
    add({
      id: `extra:${x.id}`,
      editor: "extra",
      extraId: x.id,
      grupo: "mensal",
      rotulo: x.nome,
      formula: `${moedaMes(x.valor)} × ${meses(m)} (custo criado por você)`,
      valor: -(s?.valor ?? 0),
      desligavel: `extra:${x.id}`,
    });
  }

  return { conta: linhas.filter((l) => !l.desligada), retiradas: linhas.filter((l) => l.desligada) };
}
