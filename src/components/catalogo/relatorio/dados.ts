/**
 * Relatório em PDF do imóvel: textos e contas puras (iguais no servidor e no navegador). Os números da simulação
 * vêm de `simulacaoCompleta` (src/lib/simulador/completa.ts), a mesma conta da tela; aqui só se escolhe o que
 * mostrar e como escrever. Imports relativos, sem "@/": o teste roda em Node puro.
 */
import { MODALIDADE_ROTULO, normalizar, numero, OCUPACAO_ROTULO, PRACA_ROTULO, TIPO_ROTULO, UF_NOME } from "../../../lib/catalogo/rotulos";
import type { ImovelDetalhe, ReferenciaM2 } from "../../../lib/catalogo/tipos";
import type { ResultadoCompleto } from "../../../lib/simulador/completa";
import { chaveAjustada } from "../../../lib/simulador/conta";
import { area, juntar, meses, moeda, moedaMes, pct, porArea } from "../../../lib/simulador/formato";
import { multiplicador, PADRAO, reformaPadrao, ROTULO_NIVEL, type Modelo } from "../../../lib/simulador/premissas";
import { CENARIO_ROTULO, vendaDoCenario } from "../../../lib/simulador/textos";
import type { Ajustes, EntradaSimulador, LinhaDesligavel, Premissas } from "../../../lib/simulador/tipos";
import { areaDetalhada, precoPorArea } from "../imovel/formato";

// ---------------------------------------------------------------------------
// Imóvel
// ---------------------------------------------------------------------------

/** O recorte do imóvel que o simulador usa (o mesmo que a página do imóvel entrega ao Simulador). */
export function entradaDoImovel(i: ImovelDetalhe): EntradaSimulador {
  return {
    id: i.id,
    tipo: i.tipo,
    titulo: i.titulo,
    area: i.area,
    areaTerreno: i.areaTerreno,
    areaPrivativa: i.areaPrivativa,
    avaliacao: i.avaliacao,
    lance: i.lance,
    modalidade: i.modalidade,
    modalidadeFonte: i.modalidadeFonte,
    fonte: i.fonte,
    ocupacao: i.ocupacao,
    uf: i.uf,
    cidade: i.cidade,
    financiamento: i.financiamento,
    parcelamento: i.parcelamento,
    judicial: i.judicial,
    condicoesPagamento: i.condicoesPagamento,
    tags: i.tags.map((t) => ({ slug: t.slug, emRevisao: t.emRevisao })),
  };
}

/**
 * O aviso do simulador (o mesmo texto de AVISO_SIMULADOR em src/components/simulador/Simulador.tsx; aquele módulo é
 * do navegador e o relatório o usa no servidor, por isso a cópia: o teste confere que os dois são iguais).
 */
export const AVISO_SIMULADOR_REL =
  "Simulação com premissas genéricas, não é recomendação de investimento; confira edital, custos locais e impostos com um profissional.";

export const ehExemploRel = (i: Pick<ImovelDetalhe, "fonte">) => i.fonte.id === "exemplo";

/** Um fato do quadro-resumo: rótulo, valor e uma nota curta opcional. `vazio` = a fonte não informa. */
export interface FatoRel {
  rotulo: string;
  valor: string;
  nota?: string;
  vazio?: boolean;
}

/** "Matrícula 13.941" → "13.941" (rótulo dos PDFs de matrícula da Leilões Judiciais). */
const numeroMatricula = (rotulo: string) => /matr[ií]cula\s+(?:n[ºo°.]*\s*)?([\d.\-/]+)/i.exec(rotulo)?.[1] ?? null;

/** "SÃO GONÇALO-RJ" → "São Gonçalo-RJ" (a ficha da Caixa escreve tudo em maiúsculas). */
export function formaDeNomeRel(texto: string): string {
  if (/\p{Ll}/u.test(texto)) return texto;
  const conectivos = new Set(["de", "da", "do", "das", "dos", "e"]);
  return texto
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((p, k, partes) => {
      if (p === "" || /^\s+$|^[-/]$/.test(p)) return p;
      const ultima = partes.slice(k + 1).every((x) => x === "" || /^\s+$/.test(x));
      if (ultima && p.length === 2 && k > 0 && /[-/]/.test(partes[k - 1] ?? "")) return p.toUpperCase();
      if (k > 0 && conectivos.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join("");
}

/**
 * Matrícula e cartório numa linha, com a inscrição imobiliária e a averbação dos leilões negativos na nota. Com a
 * ficha ainda não lida (Caixa "pendente"), o dado está na página do imóvel na fonte: nunca "não informada pela
 * fonte" nesse caso. Sem número: "não consta na ficha" (lida), "a fonte não publica" ou "não informada pela fonte"
 * (as mesmas palavras da página do imóvel).
 */
export function registroRel(i: Pick<ImovelDetalhe, "registro" | "matricula" | "cartorio" | "links" | "fonte">): FatoRel {
  const r = i.registro;
  const numeros = [
    ...r.matriculas,
    ...(i.matricula ?? "").split(/\s*[;,]\s*/),
    ...i.links.filter((l) => l.tipo === "matricula").map((l) => numeroMatricula(l.rotulo) ?? ""),
  ]
    .map((m) => m.trim())
    .filter(Boolean);
  const unicos = [...new Set(numeros)];
  const comarca = r.comarca ? `Comarca de ${formaDeNomeRel(r.comarca).replace(/\s*-\s*([A-Z]{2})$/, "/$1")}` : null;
  const oficio = r.oficio ? (/^\d+$/.test(r.oficio.trim()) ? `${Number(r.oficio)}º Ofício` : formaDeNomeRel(r.oficio.trim())) : null;
  const cartorio = r.cartorio ?? i.cartorio ?? ([comarca, oficio].filter(Boolean).join(" · ") || null);
  const averbacao = r.averbacaoLeiloesNegativos?.trim() ? `leilões negativos: ${formaDeNomeRel(r.averbacaoLeiloesNegativos.trim()).toLowerCase()}` : null;
  const nota = [cartorio, r.inscricaoImobiliaria ? `inscrição ${r.inscricaoImobiliaria.trim()}` : null, averbacao].filter(Boolean).join(" · ") || undefined;
  if (unicos.length > 0) return { rotulo: unicos.length > 1 ? "Matrículas" : "Matrícula", valor: juntar(unicos), nota };
  if (r.situacao === "pendente") {
    return { rotulo: "Matrícula", valor: `na página do imóvel no site da ${i.fonte.nome}`, nota: "a Luneta ainda não leu esses dados" };
  }
  if (ehExemploRel(i)) return { rotulo: "Matrícula", valor: "não se aplica (exemplo fictício)", vazio: true };
  const valor = r.situacao === "lido" ? "não consta na ficha" : r.situacao === "nao_publica" ? "a fonte não publica" : "não informada pela fonte";
  return { rotulo: "Matrícula", valor, nota, vazio: true };
}

const comQuartos = (i: ImovelDetalhe) => i.tipo === "apartamento" || i.tipo === "casa" || i.quartos !== null;
const semUnidade = (i: ImovelDetalhe) => i.tipo === "terreno" || i.tipo === "rural";

export interface CapaImovel {
  /** "Casa · 93,6 m² de área privativa · 235 m² de terreno · 3 quartos · 1 vaga" (em partes) */
  caracteristicas: string[];
  /** avaliação, lance mínimo, deságio e praça (números grandes) */
  precos: FatoRel[];
  /** modalidade, natureza, pagamento, ocupação e matrícula */
  detalhes: FatoRel[];
}

/**
 * O que a capa mostra do imóvel: as características numa linha, os preços em destaque e os detalhes da venda.
 * O que a fonte não informa aparece como "não informado pela fonte" (no exemplo fictício, "não se aplica").
 */
export function capaImovel(i: ImovelDetalhe): CapaImovel {
  const exemplo = ehExemploRel(i);
  const semDado = (genero: "m" | "f" = "m") =>
    exemplo ? "não se aplica (exemplo fictício)" : genero === "f" ? "não informada pela fonte" : "não informado pela fonte";
  const contar = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;

  const caracteristicas: string[] = [i.tipo === "outro" ? "Outro tipo" : TIPO_ROTULO[i.tipo]];
  const areas: string[] = [];
  if (i.areaPrivativa) areas.push(`${areaDetalhada(i.areaPrivativa)} de área privativa`);
  if (i.areaTotal && i.areaTotal !== i.areaPrivativa) areas.push(`${areaDetalhada(i.areaTotal)} de área total`);
  if (i.areaTerreno) areas.push(`${areaDetalhada(i.areaTerreno)} de terreno`);
  if (!areas.length && i.area) areas.push(areaDetalhada(i.area));
  caracteristicas.push(...(areas.length ? areas : [`área ${semDado("f")}`]));
  const plural = (t: string) => (exemplo ? `${t}: não se aplica (exemplo fictício)` : `${t} não informad${t === "quartos" ? "os" : "as"} pela fonte`);
  if (comQuartos(i)) caracteristicas.push(i.quartos !== null ? contar(i.quartos, "quarto", "quartos") : plural("quartos"));
  if (!semUnidade(i) || i.vagas !== null)
    caracteristicas.push(i.vagas === null ? plural("vagas") : i.vagas === 0 ? "sem vaga" : contar(i.vagas, "vaga", "vagas"));

  const d = i.desagio;
  const precos: FatoRel[] = [
    { rotulo: "Avaliação", valor: i.avaliacao !== null ? moeda(i.avaliacao) : semDado("f"), vazio: i.avaliacao === null },
    { rotulo: "Lance mínimo", valor: moeda(i.lance), nota: i.lanceM2 !== null ? precoPorArea(i.lanceM2, i.area) : undefined },
    d === null
      ? { rotulo: "Deságio", valor: "—", nota: "sem avaliação para comparar", vazio: true }
      : {
          rotulo: "Deságio",
          valor: d > 0 ? `${numero(d)}%` : d < 0 ? `+${numero(-d)}%` : "0%",
          nota: d > 0 ? "abaixo da avaliação" : d < 0 ? "lance acima da avaliação" : "lance igual à avaliação",
        },
    {
      rotulo: "Praça",
      valor: i.praca ? PRACA_ROTULO[i.praca] : semDado("f"),
      vazio: !i.praca,
      nota: i.dataPraca ? dataHoraCurta(i.dataPraca) : i.praca ? "data não informada pela fonte" : undefined,
    },
  ];

  // "Aceita financiamento · não aceita FGTS": só o que a fonte diz
  const pagamento = (
    [
      ["financiamento", i.financiamento],
      ["FGTS", i.fgts],
      ["parcelamento", i.parcelamento],
    ] as const
  )
    .filter(([, v]) => v !== null)
    .map(([k, v], n) => `${v ? (n === 0 ? "Aceita" : "aceita") : n === 0 ? "Não aceita" : "não aceita"} ${k}`);
  const modalidadeFonte =
    !exemplo && i.modalidadeFonte && normalizar(i.modalidadeFonte) !== normalizar(MODALIDADE_ROTULO[i.modalidade])
      ? `“${i.modalidadeFonte}”, como a ${i.fonte.nome} chama`
      : undefined;
  const detalhes: FatoRel[] = [
    { rotulo: "Modalidade", valor: MODALIDADE_ROTULO[i.modalidade], nota: modalidadeFonte },
    { rotulo: "Natureza", valor: i.judicial === null ? semDado("f") : i.judicial ? "Judicial" : "Extrajudicial", vazio: i.judicial === null },
    {
      rotulo: "Pagamento",
      valor: pagamento.length ? pagamento.join(" · ") : semDado(),
      vazio: pagamento.length === 0,
      nota: i.parcelamento && i.condicoesPagamento ? i.condicoesPagamento : undefined,
    },
    { rotulo: "Ocupação", valor: i.ocupacao ? OCUPACAO_ROTULO[i.ocupacao] : semDado("f"), vazio: !i.ocupacao },
    registroRel(i),
  ];
  return { caracteristicas, precos, detalhes };
}

/**
 * O endereço e o lugar ("Tribobo · São Gonçalo/RJ"), sem repetir: o bairro igual à cidade sai, e sem bairro, se o
 * endereço já termina com a cidade ("..., São Caetano do Sul/SP"), o lugar fica null.
 */
export function linhaLocal(i: Pick<ImovelDetalhe, "endereco" | "bairro" | "cidade" | "uf">): { endereco: string | null; lugar: string | null } {
  const endereco = i.endereco?.trim() || null;
  const bairro = i.bairro && normalizar(i.bairro).trim() !== normalizar(i.cidade).trim() ? i.bairro : null;
  if (!bairro && endereco) {
    const e = normalizar(endereco).replace(/\s+/g, " ");
    const c = normalizar(i.cidade).trim();
    const uf = i.uf.toLowerCase();
    if (e.includes(`${c}/${uf}`) || e.includes(`${c} - ${uf}`) || e.includes(`${c}-${uf}`)) return { endereco, lugar: null };
  }
  return { endereco, lugar: [bairro, `${i.cidade}/${i.uf}`].filter(Boolean).join(" · ") };
}

// ---------------------------------------------------------------------------
// Datas (horário de Brasília, UTC−3 fixo, como o resto do site)
// ---------------------------------------------------------------------------

const MESES_EXTENSO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dois = (n: number) => String(n).padStart(2, "0");
const emBrasilia = (ms: number) => new Date(ms - 3 * 3600 * 1000);

/** "17 de outubro de 2026, 15:32" */
export function dataHoraExtensa(ms: number): string {
  const d = emBrasilia(ms);
  return `${d.getUTCDate()} de ${MESES_EXTENSO[d.getUTCMonth()]} de ${d.getUTCFullYear()}, ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}`;
}

/** "17/10/2026 15:32" */
export function dataHoraNumerica(ms: number): string {
  const d = emBrasilia(ms);
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}`;
}

/** "16/10/2026" de "2026-10-16" ou de um ISO com hora; null se não der para ler. */
export function dataCurtaRel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = emBrasilia(t);
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** "16/10/2026, 14:00" (só a data quando a fonte não dá a hora) */
export function dataHoraCurta(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return dataCurtaRel(iso) ?? iso;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = emBrasilia(t);
  return `${dataCurtaRel(iso)}, ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}`;
}

// ---------------------------------------------------------------------------
// Premissas usadas (com o padrão ao lado do que a pessoa mudou)
// ---------------------------------------------------------------------------

export interface LinhaPremissa {
  rotulo: string;
  valor: string;
  /** o padrão, quando a pessoa mudou esta premissa (null: está no padrão) */
  padrao: string | null;
  /** a pessoa tirou esta linha da conta */
  retirada?: boolean;
  /** custo criado pela pessoa */
  criada?: boolean;
}

export interface GrupoPremissas {
  titulo: string;
  linhas: LinhaPremissa[];
}

const mesesCusto = (m: number | null) => (m === null ? "até vender" : `por ${meses(m)} (no máximo até vender)`);

/** Como a área entra nas contas ("62,4 m²", "60 m² (tamanho típico: a fonte não informa)"). */
function textoArea(p: Pick<Premissas, "area" | "areaEstimada">, rotuloArea: string) {
  return p.areaEstimada ? `${area(p.area)} (tamanho típico; a fonte não informa a ${rotuloArea})` : area(p.area);
}

function textoVenda(m: Modelo, p: Premissas): string {
  if (p.valorVenda === null) return "falta informar (sem avaliação e sem referência da região)";
  const o = m.origemVenda;
  const origem =
    o.tipo === "avaliacao"
      ? "avaliação da fonte"
      : o.tipo === "referencia"
        ? `referência da região: ${porArea(o.m2, m.entrada.tipo)} × ${area(o.area)}`
        : "valor informado por você";
  return `${moeda(p.valorVenda)} (${origem})`;
}

function textoPadraoVenda(d: Premissas): string {
  if (d.valorVenda === null) return "sem valor";
  return `${moeda(d.valorVenda)} (${d.baseVenda === "avaliacao" ? "avaliação da fonte" : "referência da região"})`;
}

const BASE_ITBI: Record<Premissas["itbiBase"], string> = { lance: "do lance", avaliacao: "da avaliação", maior: "do maior entre o lance e a avaliação" };

function textoPagamento(p: Premissas): string {
  if (p.parcelar)
    return `parcelamento da fonte: entrada de ${pct(p.parcelasEntradaPct, 0)} e ${p.parcelasN} parcelas mensais corrigidas a ${pct(p.parcelasCorrecaoAA)} ao ano`;
  if (p.financiar)
    return `financiamento (SAC): entrada de ${pct(p.entradaPct, 0)}, juros de ${pct(p.jurosAA)} ao ano em ${p.prazoFinanciamento} meses, seguros e tarifa de ${moedaMes(p.segurosMensal)} por mês`;
  return "à vista";
}

const NOME_DESLIGAVEL: Record<string, string> = {
  corretagem: "Corretagem",
  ir: "Imposto de renda",
  comissao: "Comissão do leiloeiro",
  itbi: "ITBI",
  registro: "Escritura e registro",
  reserva: "Reserva para imprevistos",
  reforma: "Reforma",
  condominio: "Condomínio",
  iptu: "IPTU",
  contas: "Contas e manutenção",
  desocupacao: "Desocupação",
  dividas: "Dívidas que passam ao comprador",
};

/**
 * Todas as premissas da simulação, em grupos, com o valor usado e, quando a pessoa mudou alguma coisa, o padrão
 * ao lado. Os custos criados pela pessoa entram num grupo próprio.
 */
export function premissasUsadas(r: Pick<ResultadoCompleto, "modelo">): GrupoPremissas[] {
  const m = r.modelo;
  const { premissas: p, padrao: d, perfil, entrada: e } = m;
  const tirada = (l: LinhaDesligavel) => p.desligados.includes(l);
  const linha = (rotulo: string, chaves: (keyof Ajustes)[], valor: string, padrao: string, desligavel?: LinhaDesligavel): LinhaPremissa => {
    const mudou = chaves.some((k) => chaveAjustada(m, k));
    return {
      rotulo,
      valor,
      padrao: mudou ? (padrao === valor ? "o mesmo, confirmado por você" : padrao) : null,
      ...(desligavel && tirada(desligavel) ? { retirada: true } : {}),
    };
  };
  const rotuloArea = perfil.rotuloArea;
  const vendaCenario = (c: "conservador" | "base" | "otimista") => {
    const k = c === "conservador" ? "cenarioConservador" : c === "base" ? "cenarioBase" : "cenarioOtimista";
    const venda = p.valorVenda !== null ? ` = ${moeda(p.valorVenda * multiplicador(p, c))}` : "";
    return linha(`Cenário ${CENARIO_ROTULO[c].toLowerCase()}`, [k], `${pct(p[k], 0)} do valor de referência${venda}`, `${pct(d[k], 0)} do valor de referência`);
  };
  const reformaTexto = (nivel: Premissas["reformaNivel"], modo: Premissas["reformaModo"], unitario: number) =>
    modo === "m2"
      ? `${ROTULO_NIVEL[nivel]} (${perfil.descricaoNivel[nivel]}): ${moeda(unitario)}/m² × ${area(p.area)} = ${moeda(unitario * p.area)}`
      : `${ROTULO_NIVEL[nivel]} (${perfil.descricaoNivel[nivel]}): ${moeda(unitario)} no total`;
  const reformaPadraoTexto = reformaTexto(PADRAO.reformaNivel, perfil.modoReforma, reformaPadrao(perfil, PADRAO.reformaNivel, perfil.modoReforma, p.area));

  const iptuTexto = (x: Pick<Premissas, "iptuAnual" | "iptuPct" | "mesesIptu">) =>
    `${x.iptuAnual !== null ? `${moeda(x.iptuAnual)} por ano` : `${pct(x.iptuPct, 2)} ao ano ${e.avaliacao ? "da avaliação" : "do lance"}`}, ${mesesCusto(x.mesesIptu)}`;
  const condTexto = (x: Pick<Premissas, "condominio" | "mesesCondominio">) =>
    x.condominio > 0 ? `${moedaMes(x.condominio)} por mês, ${mesesCusto(x.mesesCondominio)}` : "não se aplica";
  const desocTexto = (v: number) =>
    v > 0
      ? `${moeda(v)}${m.ocupado ? " (imóvel ocupado)" : ""}`
      : e.ocupacao === "desocupado"
        ? "sem reserva (imóvel desocupado)"
        : "sem reserva (a fonte não confirma ocupação)";
  const dividasTexto =
    m.ajustes.dividas !== undefined
      ? `${moeda(p.dividas)} (valor informado por você)`
      : m.dividasApontadas.length
        ? `falta informar: a análise aponta ${juntar(m.dividasApontadas)}`
        : "nenhuma apontada pela análise";

  const grupos: GrupoPremissas[] = [
    {
      titulo: "Imóvel e venda",
      linhas: [
        linha("Área usada nas contas", ["area"], textoArea(p, rotuloArea), textoArea(d, rotuloArea)),
        linha("Valor de referência para a venda (100%)", ["valorVenda", "baseVenda"], textoVenda(m, p), textoPadraoVenda(d)),
        vendaCenario("conservador"),
        vendaCenario("base"),
        vendaCenario("otimista"),
        ...(p.vendaPersonalizada ? [linha("Cenário personalizado", ["vendaPersonalizada"], vendaDoCenario(m, "personalizado"), "não definido")] : []),
        linha("Prazos de venda da tabela", ["prazos"], `${juntar(p.prazos.map(String))} meses`, `${juntar(d.prazos.map(String))} meses`),
        linha("Corretagem na venda", ["corretagemPct"], `${pct(p.corretagemPct)} da venda`, `${pct(d.corretagemPct)} da venda`, "corretagem"),
        linha(
          "Imposto de renda",
          ["irPct", "irIsento"],
          p.irIsento ? "isento (você indicou direito à isenção)" : `${pct(p.irPct)} do ganho de capital`,
          `${pct(d.irPct)} do ganho de capital`,
          "ir",
        ),
      ],
    },
    {
      titulo: "Compra",
      linhas: [
        linha(
          "Comissão do leiloeiro",
          ["comissaoPct"],
          p.comissaoPct === 0 ? "sem leiloeiro nesta modalidade" : `${pct(p.comissaoPct)} do lance`,
          d.comissaoPct === 0 ? "sem leiloeiro nesta modalidade" : `${pct(d.comissaoPct)} do lance`,
          "comissao",
        ),
        linha("ITBI", ["itbiPct", "itbiBase"], `${pct(p.itbiPct)} ${BASE_ITBI[p.itbiBase]}`, `${pct(d.itbiPct)} ${BASE_ITBI[d.itbiBase]}`, "itbi"),
        linha(
          "Escritura e registro",
          ["registroPct", "registroMin"],
          `maior entre ${pct(p.registroPct)} do lance e ${moeda(p.registroMin)}`,
          `maior entre ${pct(d.registroPct)} do lance e ${moeda(d.registroMin)}`,
          "registro",
        ),
        linha("Reserva para imprevistos", ["reservaPct"], `${pct(p.reservaPct)} do lance`, `${pct(d.reservaPct)} do lance`, "reserva"),
      ],
    },
    {
      titulo: "Regularização e reforma",
      linhas: [
        linha("Desocupação", ["desocupacao"], desocTexto(p.desocupacao), desocTexto(d.desocupacao), "desocupacao"),
        linha("Dívidas que passam ao comprador", ["dividas"], dividasTexto, m.dividasApontadas.length ? "falta informar" : "nenhuma", "dividas"),
        linha(
          perfil.rotuloReforma,
          ["reformaNivel", "reformaModo", "reformaUnitario"],
          reformaTexto(p.reformaNivel, p.reformaModo, p.reformaUnitario),
          reformaPadraoTexto,
          "reforma",
        ),
      ],
    },
    {
      titulo: "Enquanto não vende",
      linhas: [
        linha("Condomínio", ["emCondominio", "condominio", "mesesCondominio"], condTexto(p), condTexto(d), "condominio"),
        linha(perfil.rotuloImposto, ["iptuPct", "iptuAnual", "mesesIptu"], iptuTexto(p), iptuTexto(d), "iptu"),
        linha(
          "Contas e manutenção",
          ["contas", "mesesContas"],
          `${moedaMes(p.contas)} por mês, ${mesesCusto(p.mesesContas)}`,
          `${moedaMes(d.contas)} por mês, até vender`,
          "contas",
        ),
      ],
    },
    {
      titulo: "Pagamento e comparação",
      linhas: [
        linha(
          "Forma de pagamento",
          ["financiar", "parcelar", "entradaPct", "jurosAA", "prazoFinanciamento", "segurosMensal", "parcelasEntradaPct", "parcelasN", "parcelasCorrecaoAA"],
          textoPagamento(p),
          textoPagamento(d),
        ),
        linha(
          "Aplicação para comparar",
          ["aplicacaoAA"],
          p.aplicacaoAA > 0 ? `${pct(p.aplicacaoAA)} ao ano` : "sem comparação",
          d.aplicacaoAA > 0 ? `${pct(d.aplicacaoAA)} ao ano` : "sem comparação",
        ),
      ],
    },
  ];

  if (p.custosExtras.length) {
    grupos.push({
      titulo: "Custos criados por você",
      linhas: p.custosExtras.map((x) => ({
        rotulo: x.nome,
        valor:
          x.modo === "fixo"
            ? `${moeda(x.valor)} (valor fixo)`
            : x.modo === "pct_lance"
              ? `${pct(x.valor)} do lance`
              : `${moedaMes(x.valor)} por mês, até vender`,
        padrao: null,
        criada: true,
        ...(tirada(`extra:${x.id}`) ? { retirada: true } : {}),
      })),
    });
  }
  return grupos;
}

/** Linhas tiradas da conta, por nome ("ITBI", "Reserva para imprevistos", "Laudo"). */
export function nomesRetirados(p: Pick<Premissas, "desligados" | "custosExtras">): string[] {
  return p.desligados.map((l) =>
    l.startsWith("extra:") ? (p.custosExtras.find((x) => `extra:${x.id}` === l)?.nome ?? "custo criado") : (NOME_DESLIGAVEL[l] ?? l),
  );
}

// ---------------------------------------------------------------------------
// Preço da região: rua, bairro, cidade e estado (leilões) e ITBI
// ---------------------------------------------------------------------------

export const ESCOPOS_REL: readonly ReferenciaM2["escopo"][] = ["rua", "bairro", "cidade", "uf"];
export const ESCOPO_ROTULO: Record<ReferenciaM2["escopo"], string> = { rua: "Rua", bairro: "Bairro", cidade: "Cidade", uf: "Estado" };
const ESCOPO_DA: Record<ReferenciaM2["escopo"], string> = { rua: "da rua", bairro: "do bairro", cidade: "da cidade", uf: "do estado" };
const ESCOPO_NO: Record<ReferenciaM2["escopo"], string> = { rua: "na rua", bairro: "no bairro", cidade: "na cidade", uf: "no estado" };

/** Os 5 níveis da comparação (os mesmos da página do imóvel). */
export const NIVEIS_REL = ["Muito abaixo", "Abaixo", "Na média", "Acima", "Muito acima"] as const;

export interface ComparacaoRel {
  /** % inteiro com sinal (−31 = 31% abaixo) */
  pct: number;
  razao: number;
  nivel: 0 | 1 | 2 | 3 | 4;
}

/**
 * Diferença para a média e o nível: muito abaixo (−30% ou menos), abaixo (−29% a −10%), na média (−9% a +9%),
 * acima (+10% a +29%), muito acima (+30% ou mais). null sem os dois valores.
 */
export function compararRel(valor: number | null | undefined, media: number | null | undefined): ComparacaoRel | null {
  if (valor == null || media == null || !(valor > 0) || !(media > 0)) return null;
  const razao = valor / media;
  const p = Math.round((razao - 1) * 100);
  const nivel = p <= -30 ? 0 : p <= -10 ? 1 : p < 10 ? 2 : p < 30 ? 3 : 4;
  return { pct: p, razao, nivel };
}

const vezes = (x: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.round(x * 10) / 10);

/** "31% abaixo", "12% acima", "igual", "2,4 vezes". */
export function diferencaRel(c: ComparacaoRel): string {
  if (c.razao >= 2) return `${vezes(c.razao)} vezes`;
  if (Math.abs(c.pct) < 2) return "igual";
  return `${numero(Math.abs(c.pct))}% ${c.pct < 0 ? "abaixo" : "acima"}`;
}

/** Média (R$/m²) de uma referência: `media` quando vier; dados antigos, a mediana da avaliação. */
export const mediaRef = (r: Pick<ReferenciaM2, "media" | "avaliacaoM2">): number | null => (r.media === undefined ? (r.avaliacaoM2?.mediana ?? null) : r.media);
const fonteRef = (r: Pick<ReferenciaM2, "fonte">) => r.fonte ?? "leiloes";

/** "Rua X", "Centro", "São Gonçalo/RJ", "Rio de Janeiro" (o lugar do recorte, sem repetir a cidade). */
export function lugarRef(r: Pick<ReferenciaM2, "escopo" | "nome">): string {
  if (r.escopo === "rua" || r.escopo === "bairro") {
    const k = r.nome.lastIndexOf(", ");
    return k > 0 ? r.nome.slice(0, k) : r.nome;
  }
  return r.escopo === "uf" ? (UF_NOME[r.nome] ?? r.nome) : r.nome;
}

/** "set/2025 a set/2026" */
export function periodoRel(p: readonly [string, string] | null | undefined): string | null {
  if (!p) return null;
  const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const mes = (iso: string) => {
    const k = Number(iso.slice(5, 7));
    return k >= 1 && k <= 12 ? `${NOMES[k - 1]}/${iso.slice(0, 4)}` : iso;
  };
  return `${mes(p[0])} a ${mes(p[1])}`;
}

export interface LinhaRegiaoRel {
  escopo: ReferenciaM2["escopo"];
  fonte: "leiloes" | "itbi";
  lugar: string;
  media: number;
  amostra: number;
  periodo: string | null;
  /** avaliação/m² deste imóvel contra a média */
  avaliacao: ComparacaoRel | null;
  /** lance/m² deste imóvel contra a média */
  lance: ComparacaoRel | null;
}

/**
 * Uma linha da tabela dos leilões, sempre nos quatro recortes (rua, bairro, cidade e estado): o método do dono. Sem
 * média, `falta` diz por quê (poucos imóveis, a fonte não informa a rua, os mesmos imóveis do recorte anterior).
 */
export interface RecorteRel {
  escopo: ReferenciaM2["escopo"];
  /** "Rua Expedicionário...", "Tribobo", "São Gonçalo/RJ", "Rio de Janeiro" (null: a fonte não informa) */
  lugar: string | null;
  linha: LinhaRegiaoRel | null;
  falta: string | null;
}

export interface RegiaoRel {
  /** a frase principal ("A avaliação deste imóvel (R$ 2.680/m²) está 12% abaixo da média do bairro (R$ 3.050/m²).") */
  frase: string | null;
  nivel: ComparacaoRel["nivel"] | null;
  /** só os recortes com média */
  leiloes: LinhaRegiaoRel[];
  /** os quatro recortes dos leilões, com ou sem média */
  recortes: RecorteRel[];
  itbi: LinhaRegiaoRel[];
}

/** Mínimo de imóveis do mesmo tipo para cada recorte ter média (o mesmo de src/lib/catalogo/vizinhanca.ts). */
export const MINIMO_RECORTE: Record<ReferenciaM2["escopo"], number> = { rua: 3, bairro: 5, cidade: 5, uf: 3 };
/** O conjunto de cada recorte contém o do recorte da lista? A rua pode atravessar bairros: o bairro não contém a rua. */
const CONTEM: Record<ReferenciaM2["escopo"], readonly ReferenciaM2["escopo"][]> = {
  rua: [],
  bairro: [],
  cidade: ["rua", "bairro"],
  uf: ["rua", "bairro", "cidade"],
};

/** "Rua Expedicionario Benoni Falcao Gouveia, N. 338, Lt 28" → "Rua Expedicionario Benoni Falcao Gouveia". */
export function logradouroRel(endereco: string | null | undefined): string | null {
  const primeiro = endereco?.split(",")[0]?.trim() ?? "";
  return /\p{L}{2}/u.test(primeiro) ? primeiro : null;
}

/**
 * Comparação com a região para o relatório: as médias de R$/m² da rua, do bairro, da cidade e do estado (outros
 * imóveis em leilão na base) e, quando houver, o preço pago nas transações registradas na prefeitura (ITBI).
 * A frase principal usa a avaliação deste imóvel (o lance, se não houver avaliação) contra a média de leilões
 * mais local com pelo menos 5 imóveis (senão a mais local com média; sem leilões, o ITBI).
 */
export function regiaoRel(
  i: Pick<ImovelDetalhe, "avaliacaoM2" | "lanceM2" | "area" | "tipo" | "endereco" | "bairro" | "cidade" | "uf">,
  refs: readonly ReferenciaM2[],
): RegiaoRel {
  const linha = (r: ReferenciaM2): LinhaRegiaoRel | null => {
    const media = mediaRef(r);
    if (media === null || !(media > 0)) return null;
    return {
      escopo: r.escopo,
      fonte: fonteRef(r),
      lugar: lugarRef(r),
      media,
      amostra: r.amostra,
      periodo: periodoRel(r.periodo),
      avaliacao: compararRel(i.avaliacaoM2, media),
      lance: compararRel(i.lanceM2, media),
    };
  };
  const porEscopo = (fonte: "leiloes" | "itbi") =>
    ESCOPOS_REL.flatMap((e) => refs.filter((r) => fonteRef(r) === fonte && r.escopo === e))
      .map(linha)
      .filter((l): l is LinhaRegiaoRel => l !== null);
  const leiloes = porEscopo("leiloes");
  const itbi = porEscopo("itbi");

  // os quatro recortes dos leilões; o que falta diz por quê
  const rua = logradouroRel(i.endereco);
  const bairro = i.bairro && normalizar(i.bairro).trim() !== normalizar(i.cidade).trim() ? i.bairro : null;
  const lugarPadrao: Record<ReferenciaM2["escopo"], string | null> = { rua, bairro, cidade: `${i.cidade}/${i.uf}`, uf: UF_NOME[i.uf] ?? i.uf };
  let anterior: LinhaRegiaoRel | null = null;
  const recortes: RecorteRel[] = ESCOPOS_REL.map((escopo) => {
    const l = leiloes.find((x) => x.escopo === escopo) ?? null;
    if (l) {
      anterior = l;
      return { escopo, lugar: l.lugar, linha: l, falta: null };
    }
    const a = anterior as LinhaRegiaoRel | null;
    const falta =
      a && CONTEM[escopo].includes(a.escopo) && a.amostra >= MINIMO_RECORTE[escopo]
        ? `os mesmos imóveis ${ESCOPO_DA[a.escopo]}`
        : escopo === "rua" && !rua
          ? "a fonte não informa a rua"
          : escopo === "bairro" && !bairro
            ? "a fonte não informa o bairro"
            : `menos de ${MINIMO_RECORTE[escopo]} imóveis do mesmo tipo em leilão`;
    return { escopo, lugar: lugarPadrao[escopo], linha: null, falta };
  });
  const escolher = (lista: LinhaRegiaoRel[]) => lista.find((l) => l.amostra >= 5) ?? lista[0] ?? null;
  const principal = escolher(leiloes) ?? escolher(itbi);

  let frase: string | null = null;
  let nivel: RegiaoRel["nivel"] = null;
  if (principal) {
    const alvo = principal.fonte === "itbi" ? `o preço médio pago ${ESCOPO_NO[principal.escopo]}` : `a média ${ESCOPO_DA[principal.escopo]}`;
    const de = principal.fonte === "itbi" ? "do" : "da";
    const ao = principal.fonte === "itbi" ? "ao" : "à";
    const media = precoPorArea(principal.media, i.area);
    const sujeito = principal.avaliacao ? "A avaliação deste imóvel" : principal.lance ? "O lance mínimo deste imóvel" : null;
    const c = principal.avaliacao ?? principal.lance;
    const valor = principal.avaliacao ? i.avaliacaoM2 : i.lanceM2;
    if (sujeito && c && valor !== null) {
      const v = precoPorArea(valor, i.area);
      nivel = c.nivel;
      frase =
        c.razao >= 2
          ? `${sujeito} (${v}) é ${vezes(c.razao)} vezes ${alvo} (${media}).`
          : Math.abs(c.pct) < 2
            ? `${sujeito} (${v}) está praticamente igual ${ao} ${alvo.replace(/^(a|o) /, "")} (${media}).`
            : `${sujeito} (${v}) está ${numero(Math.abs(c.pct))}% ${c.pct < 0 ? "abaixo" : "acima"} ${de} ${alvo.replace(/^(a|o) /, "")} (${media}).`;
    } else {
      frase = `A fonte não informa a área deste imóvel: sem ela, não dá para comparar o preço por m². A média ${ESCOPO_DA[principal.escopo]} é ${media}.`;
    }
  }
  return { frase, nivel, leiloes, recortes, itbi };
}

// ---------------------------------------------------------------------------
// Página impressa
// ---------------------------------------------------------------------------

/** Texto para uma string CSS (entre aspas duplas), sem quebrar a regra. */
export function stringCss(texto: string): string {
  return `"${texto
    .replace(/[\\"]/g, (c) => `\\${c}`)
    .replace(/[\n\r\f]+/g, " ")
    .replace(/</g, "\\3c ")}"`;
}

/**
 * Regras de página do relatório: A4, margens, cabeçalho (menos na capa) e rodapé com "Página X de Y" nas caixas de
 * margem (Chrome 131+ e Edge; nos outros navegadores, o PDF sai sem eles). As cores são fixas: a página impressa é
 * sempre clara, mesmo com o site no tema escuro.
 */
export function cssPaginas({ cabecalho, rodape }: { cabecalho: string; rodape: string }): string {
  const caixa = `font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif; font-size: 7.5pt; color: #5b6478; letter-spacing: .01em;`;
  return `@page {
  size: A4;
  margin: 17mm 15mm 17mm 15mm;
  @top-left { content: "LUNETA DE LEILÕES · RELATÓRIO DE SIMULAÇÃO"; ${caixa} font-size: 6.8pt; font-weight: 600; letter-spacing: .12em; vertical-align: bottom; padding-bottom: 3mm; }
  @top-right { content: ${stringCss(cabecalho)}; ${caixa} vertical-align: bottom; padding-bottom: 3mm; }
  @bottom-left { content: ${stringCss(rodape)}; ${caixa} vertical-align: top; padding-top: 3mm; }
  @bottom-right { content: "Página " counter(page) " de " counter(pages); ${caixa} vertical-align: top; padding-top: 3mm; }
}
@page :first {
  @top-left { content: none; }
  @top-right { content: none; }
}
@media print {
  html, body { background: #fff !important; color-scheme: light; }
}`;
}

/** Título do documento (vira o nome do arquivo ao salvar em PDF): "Relatório Luneta - Casa em São Gonçalo-RJ - 1444419640129". */
export function tituloDocumento(i: Pick<ImovelDetalhe, "tipo" | "cidade" | "uf" | "id">): string {
  const tipo = i.tipo === "outro" ? "Imóvel" : TIPO_ROTULO[i.tipo];
  const id = i.id.replace(/^(caixa|lj)-/, "");
  return `Relatório Luneta - ${tipo} em ${i.cidade}-${i.uf} - ${id}`;
}

/** A meta e a escolha por extenso, para o cabeçalho do resultado. */
export function escolhaPorExtenso(r: Pick<ResultadoCompleto, "celula" | "modelo">): string {
  const c = r.celula;
  return `cenário ${CENARIO_ROTULO[c.cenario].toLowerCase()} (${vendaDoCenario(r.modelo, c.cenario)}), venda em ${meses(c.meses)}`;
}
