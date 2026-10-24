/**
 * A landing bate com o código: a tabela de planos com src/lib/catalogo/planos.ts (o que o Lente vê), os pesos da nota
 * com PESOS_PADRAO e com o arquivo da nota, o lance máximo do exemplo com o simulador de verdade, as cidades do ITBI com
 * os arquivos, e os textos com as regras do projeto (nunca "risco zero"; nada é garantia; o simulador não é
 * recomendação de investimento).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createJiti } from "jiti";
import { FILTROS_AVANCADOS_CURTO, FILTROS_LENTE, pode, RECURSOS, RECURSOS_LUNETA } from "../lib/catalogo/planos";
import { ALERTA_PRACA, FAVORITOS_CHAMADA, PRODUTO, TOAST_FAVORITADO } from "../lib/catalogo/produto";
import { CONVITE, CONVITE_PADRAO } from "../components/catalogo/planos/textos";
import { PESOS_PADRAO, ROTULO_COMPONENTE } from "../lib/catalogo/localizacao";
import { ESTADO_INICIAL } from "../lib/simulador/estado";
import { simulacaoCompleta, VISAO_PADRAO } from "../lib/simulador/completa";
import { converterExemplos } from "../lib/catalogo/exemplos";
import { metaComoObjetivo } from "../lib/simulador/textos";
import { EXEMPLO_LANDING, miniNota, miniSimulador, resumoItbi, totalCurto } from "../components/sections/dados-landing";
import type { Filtros } from "../lib/catalogo/tipos";
import type { Listing } from "./examples";
import { AVISO_CLASSIFICACAO, AVISO_SIMULADOR } from "./avisos";
import { DECIDA, NOTA_LOCAL } from "./ferramentas";
import { POR_DENTRO } from "./por-dentro";
import * as SITE_TS from "./site";
import {
  CANCELAMENTO,
  EXAMPLES,
  FAQ,
  FILTERS,
  FILTROS_PROMETIDOS,
  FOOTER,
  HERO,
  LAWYER,
  LEVELS,
  NAV_LINKS,
  PLANS,
  PRACAS,
  SOCIAL,
  SOLUTION,
  type FiltroSemLugar,
} from "./site";

const RAIZ = process.cwd();
const AGORA = new Date("2026-10-18T15:00:00Z");

/** src/content/examples.ts usa o alias "@/" do Next: aqui ele aponta para src/. */
async function carregarExemplos(): Promise<Listing[]> {
  const jiti = createJiti(__filename, { alias: { "@/": `${join(RAIZ, "src")}/` } });
  const m = await jiti.import<{ LISTINGS: Listing[] }>(join(RAIZ, "src", "content", "examples.ts"));
  return m.LISTINGS;
}

/** Todos os textos de um valor (objetos, listas e strings), para varrer palavras proibidas. */
function textos(v: unknown, saida: string[] = []): string[] {
  if (typeof v === "string") saida.push(v);
  else if (Array.isArray(v)) v.forEach((x) => textos(x, saida));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => textos(x, saida));
  return saida;
}

const NIVEL = { lente: 0, luneta: 1, telescopio: 2 } as const;
const tem = (v: boolean) => v === true;

test("planos: cada linha é crescente (o que a Lente tem, a Luneta tem; o que a Luneta tem, o Telescópio tem)", () => {
  for (const f of PLANS.features) {
    assert.ok(!tem(f.lente) || tem(f.luneta), f.label);
    assert.ok(!tem(f.luneta) || tem(f.telescopio), f.label);
    assert.ok(f.label.trim() && f.grupo, f.label);
  }
  // os grupos vêm em blocos, na ordem Encontrar · Decidir · Acompanhar · Equipe
  const ordem = ["Encontrar", "Decidir", "Acompanhar", "Equipe"];
  const grupos = PLANS.features.map((f) => f.grupo).filter((g, i, a) => a.indexOf(g) === i);
  assert.deepEqual(grupos, ordem);
  for (let i = 1; i < PLANS.features.length; i++) {
    assert.ok(ordem.indexOf(PLANS.features[i]!.grupo) >= ordem.indexOf(PLANS.features[i - 1]!.grupo), "grupo fora de ordem");
  }
  // Encontrar é o Lente; Equipe é só o Telescópio
  for (const f of PLANS.features.filter((x) => x.grupo === "Encontrar")) assert.equal(f.lente, true, f.label);
  for (const f of PLANS.features.filter((x) => x.grupo === "Equipe")) assert.deepEqual([f.lente, f.luneta, f.telescopio], [false, false, true], f.label);
  // rótulos únicos (a tabela usa o rótulo como chave)
  assert.equal(new Set(PLANS.features.map((f) => f.label)).size, PLANS.features.length);
  assert.ok(PLANS.plans.every((p, i) => NIVEL[p.id] === i), "Lente, Luneta e Telescópio, nessa ordem");
});

test("planos: o marketing bate com planos.ts (cada recurso do Luneta tem a sua linha, e o Lente não leva nenhum)", () => {
  for (const r of RECURSOS) {
    const linhas = PLANS.features.filter((f) => f.recurso === r);
    assert.ok(linhas.length >= 1, `a tabela de planos não cita o recurso "${r}"`);
    for (const f of linhas) {
      // o Lente vê o recurso exatamente quando o código deixa (hoje nunca: nem desfocado, desde a revisão final da rodada 4)
      assert.equal(tem(f.lente), pode("lente", r), `${r}: a tabela diz ${String(f.lente)} para o Lente`);
      assert.equal(f.luneta, pode("luneta", r), r);
      assert.equal(f.telescopio, true, r);
      if (!pode("lente", r)) assert.equal(f.lente, false, r);
    }
  }
  // nenhuma linha cita um recurso que não existe
  for (const f of PLANS.features) if (f.recurso) assert.ok(RECURSOS.includes(f.recurso), f.recurso);
  // o cartão do Lente não lista nenhum recurso do Luneta como incluído
  assert.ok(PLANS.features.filter((f) => f.recurso && f.lente === true).length === 0);
});

test("planos: a landing não promete ao Lente nada desfocado (o Lente não vê tags nem selos, nem borrados)", () => {
  const tudo = [...textos(SITE_TS), ...textos(POR_DENTRO), ...textos(CONVITE), ...textos(CONVITE_PADRAO)];
  for (const t of tudo) assert.ok(!/desfocad/i.test(t), t);
});

test("planos: os filtros avançados têm uma lista só (landing, chamada do painel e janela da Luneta)", () => {
  // a chamada curta cita os filtros em destaque da mesma lista da landing e termina com "e mais"
  assert.match(FILTROS_AVANCADOS_CURTO, / e mais$/);
  const citados = FILTROS_AVANCADOS_CURTO.replace(/ e mais$/, "").split(", ");
  const daLanding: string[] = FILTROS_PROMETIDOS.luneta.map((f) => f.rotulo);
  for (const c of citados) assert.ok(daLanding.includes(c), c);
  assert.ok(citados.length >= 4 && citados.length <= 6, "4 a 6 filtros na chamada curta");
  assert.ok(RECURSOS_LUNETA.filtrosAvancados.chamada.toLowerCase().includes(FILTROS_AVANCADOS_CURTO));
  assert.ok(CONVITE.filtrosAvancados.texto.includes(FILTROS_AVANCADOS_CURTO));
  // jargão fora: "natureza" (judicial ou extrajudicial) não aparece nos textos
  for (const t of [RECURSOS_LUNETA.filtrosAvancados.chamada, CONVITE.filtrosAvancados.texto, FILTERS.text]) assert.ok(!/natureza/i.test(t), t);
});

test("textos: o relatório em PDF tem várias folhas A4 (nunca \"numa página A4\")", () => {
  const tudo = [...textos(SITE_TS), ...textos(DECIDA), ...textos(CONVITE), ...textos(RECURSOS_LUNETA)];
  for (const t of tudo) assert.ok(!/(numa|uma|em uma) página A4/i.test(t), t);
  const travado = readFileSync(join(RAIZ, "src", "components", "catalogo", "relatorio", "RelatorioTravado.tsx"), "utf8");
  assert.ok(!/numa página A4/.test(travado), "RelatorioTravado.tsx");
});

test("textos: o valor do ITBI não é chamado de \"preço pago\" (só SP e o Rio publicam o preço declarado)", () => {
  const tudo = [...textos(SITE_TS), ...textos(DECIDA), ...textos(NOTA_LOCAL), ...textos(CONVITE), ...textos(RECURSOS_LUNETA)];
  for (const t of tudo) assert.ok(!/preço (médio )?pago/i.test(t), t);
});

test("produto: as promessas sem produto ficam desligadas (leitura do edital, alerta de praça, busca por leiloeiro)", () => {
  const tudo = [...textos(SITE_TS), ...textos(POR_DENTRO), ...textos(CONVITE), ...textos(CONVITE_PADRAO), ...textos(RECURSOS_LUNETA)];
  if (!PRODUTO.alertaPraca) {
    for (const t of tudo) assert.ok(!/alerta de (2ª )?praça|alerta por e-mail|avisa por e-mail|aviso quando a praça|recebe um e-mail/i.test(t), t);
    assert.ok(!FAQ.items.some((f) => /alertas de mudança de praça/.test(f.q)));
  }
  // a busca do catálogo não acha leiloeiro (o campo não vem da fonte)
  assert.ok(!/leiloeiro/i.test(POR_DENTRO.window.search));
  if (!PRODUTO.leituraDoEdital) {
    for (const t of tudo) assert.ok(!/trecho de onde veio cada alerta|lê cada caso|Cada leilão lido para você/i.test(t), t);
    return;
  }
  // ligada: a base precisa ter de fato as tags lidas em texto (edital, ficha, processo, descrição), não só as dos
  // campos da lista da Caixa e as de ausência ("ocupação não informada" em 100% dos imóveis em 18/10/2026)
  const dir = join(RAIZ, "base", "saida", "site", "detalhes");
  if (!existsSync(dir)) return;
  let tags = 0;
  let deTexto = 0;
  let imoveis = 0;
  let semOcupacao = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json.gz"))) {
    const d = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString("utf8")) as { detalhes: Record<string, { tags?: { slug: string; origem: string }[] }> };
    for (const i of Object.values(d.detalhes)) {
      imoveis++;
      if (i.tags?.some((t) => t.slug === "ocupacao-nao-informada")) semOcupacao++;
      for (const t of i.tags ?? []) {
        tags++;
        if (!t.origem.startsWith("campo") && t.origem !== "ausencia") deTexto++;
      }
    }
  }
  assert.ok(deTexto / tags >= 0.1, `só ${deTexto} de ${tags} tags vêm de texto: deixe PRODUTO.leituraDoEdital em false`);
  assert.ok(semOcupacao / imoveis < 0.5, `${semOcupacao} de ${imoveis} imóveis sem a ocupação: deixe PRODUTO.leituraDoEdital em false`);
});

test("planos: os filtros prometidos ao Lente são FILTROS_LENTE; os avançados ficam fora dele", () => {
  const doLente: (keyof Filtros)[] = FILTROS_PROMETIDOS.lente.flatMap((f) => [...f.chaves]);
  const avancados: (keyof Filtros)[] = FILTROS_PROMETIDOS.luneta.flatMap((f) => [...f.chaves]);
  for (const k of doLente) assert.ok(FILTROS_LENTE.includes(k), `"${k}" está na tabela do Lente mas não em FILTROS_LENTE`);
  for (const k of FILTROS_LENTE) if (k !== "q") assert.ok(doLente.includes(k), `FILTROS_LENTE tem "${k}" e a landing não promete`);
  for (const k of avancados) assert.ok(!FILTROS_LENTE.includes(k), `"${k}" é filtro avançado na landing mas está no Lente`);
  assert.equal(FILTROS_PROMETIDOS.lente.length, 6, "os 6 filtros de sempre");
  // todo filtro do catálogo tem lugar na landing (erro de tipo se FiltroSemLugar não for never)
  const todosCitados: [FiltroSemLugar] extends [never] ? true : FiltroSemLugar = true;
  assert.equal(todosCitados, true);
  // nenhum filtro prometido aos dois planos ao mesmo tempo
  for (const k of doLente) assert.ok(!avancados.includes(k), k);
  const linhaLente = PLANS.features.find((f) => f.grupo === "Encontrar" && f.label.startsWith("Filtros por"))!;
  for (const f of FILTROS_PROMETIDOS.lente) assert.ok(linhaLente.label.includes(f.rotulo), f.rotulo);
  const linhaLuneta = PLANS.features.find((f) => f.recurso === "filtrosAvancados")!;
  for (const f of FILTROS_PROMETIDOS.luneta) assert.ok(linhaLuneta.label.includes(f.rotulo), f.rotulo);
  assert.ok(FILTERS.text.includes(linhaLente.label.replace("Filtros por ", "")), "o texto de Filtros e a tabela dizem o mesmo");
});

test("nota: os pesos vêm de PESOS_PADRAO (soma 100), iguais aos do arquivo da nota; nenhum peso digitado nos textos", () => {
  const chaves = Object.keys(PESOS_PADRAO) as (keyof typeof PESOS_PADRAO)[];
  assert.equal(chaves.reduce((s, k) => s + PESOS_PADRAO[k], 0), 100);
  // os pesos finais, depois da validação com o ITBI (base/saida/localizacao/medicao-nota.md)
  assert.deepEqual(PESOS_PADRAO, { servicos: 25, transporte: 20, renda: 20, infra: 25, comercio: 5, lazer: 5 });
  // a landing descreve as mesmas seis partes, e o rótulo vem do código
  assert.deepEqual(Object.keys(NOTA_LOCAL.partes).sort(), [...chaves].sort());
  assert.deepEqual(Object.keys(ROTULO_COMPONENTE).sort(), [...chaves].sort());
  // nenhum texto da seção traz "25%", "peso 20"...: o peso só existe em PESOS_PADRAO
  for (const t of textos(NOTA_LOCAL)) assert.ok(!/\d+\s*%\s*(da nota|de peso)|peso\s+\d/i.test(t), t);
  for (const p of Object.values(NOTA_LOCAL.partes)) assert.ok(!/%/.test(p.text), p.text);
  // o arquivo que o site usa tem os mesmos pesos (se existir: o instantâneo pode faltar numa cópia sem a base)
  const arquivo = join(RAIZ, "base", "saida", "site", "localizacao.json.gz");
  if (existsSync(arquivo)) {
    const a = JSON.parse(gunzipSync(readFileSync(arquivo)).toString("utf8")) as { pesos: Record<string, number>; renda: { variavel: string } };
    assert.deepEqual(a.pesos, PESOS_PADRAO, "os pesos do arquivo da nota mudaram: atualize PESOS_PADRAO (e a landing segue)");
    assert.equal(a.renda.variavel, "V06006", "a renda da landing é a renda típica (mediana) de 2022");
  }
  assert.ok(NOTA_LOCAL.partes.renda.text.includes("Renda típica") && NOTA_LOCAL.partes.renda.text.includes("valores de 2022"));
});

test("nota: a miniatura é a nota fictícia do exemplo, com os pesos efetivos de PESOS_PADRAO", async () => {
  const listings = await carregarExemplos();
  const n = miniNota(listings, AGORA);
  assert.equal(n.loc.componentes.length, 6);
  for (const c of n.loc.componentes) assert.equal(c.peso, PESOS_PADRAO[c.chave], c.chave);
  // em ordem de peso (maior primeiro), como na página do imóvel
  const pesos = n.loc.componentes.map((c) => c.peso);
  assert.deepEqual(pesos, [...pesos].sort((a, b) => b - a));
  assert.ok(n.loc.nota >= 0 && n.loc.nota <= 100);
  assert.equal(n.cidade, "São Paulo/SP");
  assert.equal(NOTA_LOCAL.card.frase(n.loc.nota, n.cidade), `Melhor localizado que ${n.loc.nota}% dos moradores de São Paulo/SP`);
  assert.equal(n.loc.riscoRaioM, 100);
  assert.ok(!/sem risco/i.test(NOTA_LOCAL.card.risco(100) + NOTA_LOCAL.card.riscoNota));
});

test("simulador: o exemplo da landing confere com o motor real (Dê no máximo R$ 362.178)", async () => {
  const listings = await carregarExemplos();
  const s = miniSimulador(listings, AGORA);
  // o número do relatório de marketing (r4-planos-marketing.md): se o motor mudar, confira a landing e a demonstração
  assert.equal(s.teto, 362_178);
  assert.equal(s.lanceMinimo, 322_400);
  assert.equal(s.folga, 39_778);
  assert.equal(s.objetivo, `render ${"20%"} ao ano`);
  assert.equal(s.objetivo, metaComoObjetivo(ESTADO_INICIAL.meta));
  assert.equal(s.meses, ESTADO_INICIAL.celula.meses);
  assert.equal(s.cenario, ESTADO_INICIAL.celula.cenario);
  assert.equal(DECIDA.card.pergunta(s.objetivo, s.meses, s.cenario), "Para render 20% ao ano, vendendo em 12 meses no cenário base:");
  // a matriz: três cenários × quatro prazos, como o texto promete; a célula do cartão é o teto
  assert.deepEqual(s.colunas, [6, 12, 18, 24]);
  assert.deepEqual(s.linhas.map((l) => l.cenario), ["conservador", "base", "otimista"]);
  assert.ok(DECIDA.tools[0].text.includes("três cenários e quatro prazos"));
  const escolhidas = s.linhas.flatMap((l) => l.celulas.filter((c) => c.escolhida).map((c) => c.teto));
  assert.deepEqual(escolhidas, [s.teto]);
  for (const l of s.linhas) for (const c of l.celulas) assert.equal(c.atinge, c.teto !== null && c.teto >= s.lanceMinimo);
  // o que o relatório mediu: base a 6 e 12 meses atinge, a 18 não; otimista a 18 atinge; conservador a 12 não
  const base = s.linhas.find((l) => l.cenario === "base")!.celulas.map((c) => c.atinge);
  assert.deepEqual(base, [true, true, false, false]);
  // a tabela da miniatura está na visão que a página abre (rodada 5, decisão 6): o lucro com o lance mínimo. Com o lance
  // mínimo abaixo do lance máximo, o retorno passa da meta, e vice-versa (as duas visões contam a mesma história)
  assert.equal(VISAO_PADRAO, "lucro");
  for (const l of s.linhas) for (const c of l.celulas) if (c.teto !== null && Math.abs(c.teto - s.lanceMinimo) > 500) assert.equal(c.atingeMeta, c.atinge, `${l.cenario} ${c.meses}`);
  // os mesmos números da página do exemplo (o simulador com o estado inicial e o lance mínimo)
  const d = converterExemplos(listings, AGORA).find((x) => x.id === `ex-${EXEMPLO_LANDING}`)!;
  const r = simulacaoCompleta(d, ESTADO_INICIAL);
  assert.equal(r.visao, "lucro");
  const conservador6 = s.linhas[0]!.celulas[0]!;
  assert.equal(conservador6.lucro, Math.round(r.tabela![0]![0]!.comMeuLance.lucro));
  assert.ok(DECIDA.card.matrizUnidade.startsWith("lucro com o lance mínimo"));
  assert.equal(EXEMPLO_LANDING, "alvo-sp");
  assert.ok(DECIDA.demoHref.includes(`ex-${EXEMPLO_LANDING}`));
});

test("ITBI: as cidades e o número de capitais dos textos batem com os arquivos", async () => {
  const r = await resumoItbi();
  if (r.cidades.length === 0) return; // cópia sem o instantâneo
  const n = r.cidades.length;
  const capitais = `${n} capitais`;
  assert.ok(DECIDA.tools[1].text.includes(capitais), `"Decida": ${capitais}`);
  assert.ok(NOTA_LOCAL.fora.includes(capitais), `"Nota": ${capitais}`);
  assert.ok(PLANS.features.find((f) => f.recurso === "regiao")!.label.includes(capitais), `tabela: ${capitais}`);
  const faq = FAQ.items.find((f) => f.q.startsWith("De onde vem o preço do m²"))!;
  for (const c of r.cidades) assert.ok(faq.a.includes(c.cidade), `o FAQ não cita ${c.cidade}`);
  assert.ok(r.transacoes > 0 && totalCurto(r.transacoes).endsWith(" mil"));
  assert.equal(totalCurto(203_240), "203 mil");
  // o total só aparece quando o dono decidir (licenças de SP, Rio e POA)
  assert.equal(DECIDA.mostrarTotalItbi, false);
});

test("textos: nada de risco zero, garantia, sugestão interna ou análise profissional revisada", () => {
  const tudo = [...textos(SITE_TS), ...textos(POR_DENTRO), ...textos(DECIDA), ...textos(NOTA_LOCAL)];
  const proibidos = [/risco\s+zero/i, /garantid[oa]s?/i, /sugerid[oa]s?/i, /a\s+validar/i, /revisad[oa]s?\s+para\s+voc/i, /an[aá]lise\s+profissional/i, /sem\s+risco/i, /bairro\s+(bom|seguro)/i];
  for (const t of tudo) for (const re of proibidos) assert.ok(!re.test(t), `"${t.slice(0, 80)}…" tem ${re}`);
  // "Por dentro" não promete revisão humana enquanto as tags forem automáticas
  assert.ok(!textos(POR_DENTRO.luneta).some((t) => /profissional|revisad/i.test(t)));
});

test("textos: a nota, a classificação e o simulador não são garantia nem recomendação", () => {
  const faq = (inicio: string) => FAQ.items.find((f) => f.q.startsWith(inicio))?.a ?? "";
  const garantia = faq("A classificação, a nota e o simulador são garantia?");
  assert.match(garantia, /^Não\./);
  assert.match(garantia, /Nada disso é garantia/);
  assert.match(garantia, /recomendação de investimento/);
  assert.match(faq("O simulador diz quanto vou lucrar?"), /não é promessa de lucro nem recomendação de investimento/);
  assert.match(faq("Como funciona a nota de localização?"), /não é garantia/);
  assert.match(faq("De onde vem o preço do m²?"), /não como avaliação do imóvel/);
  assert.ok(faq("O que o plano Lente inclui?").length > 0);
  assert.match(FOOTER.legal, /não é recomendação de investimento/);
  assert.match(FOOTER.legal, /nem garantia/);
  assert.match(NOTA_LOCAL.disclaimer, /nem garantia/);
  assert.match(AVISO_SIMULADOR, /não é recomendação de investimento/);
  assert.match(AVISO_CLASSIFICACAO, /não é garantia/);
  // as perguntas novas não têm placeholder: entram no JSON-LD
  for (const q of ["O que o plano Lente inclui?", "O simulador diz quanto vou lucrar?", "De onde vem o preço do m²?", "Como funciona a nota de localização?"]) {
    assert.ok(!/\[[^\]]+\]/.test(faq(q)), q);
  }
});

test("textos: o aviso do simulador da landing é o mesmo da tela do simulador", () => {
  const tela = readFileSync(join(RAIZ, "src", "components", "simulador", "Simulador.tsx"), "utf8");
  const m = /AVISO_SIMULADOR\s*=\s*"([^"]+)"/.exec(tela);
  if (m) assert.equal(AVISO_SIMULADOR, m[1]);
  else assert.match(tela, /AVISO_SIMULADOR/, "a tela do simulador deixou de ter o aviso");
});

test("landing: as âncoras do menu existem e as seções novas ficam entre Filtros e Dados", () => {
  const pagina = readFileSync(join(RAIZ, "src", "app", "page.tsx"), "utf8");
  const ordem = ["<Filters />", "<Decida />", "<Localizacao />", "<Stats />", "<Plans>"].map((x) => pagina.indexOf(x));
  assert.ok(ordem.every((i) => i > 0), "seção faltando em page.tsx");
  assert.deepEqual(ordem, [...ordem].sort((a, b) => a - b), "ordem das seções");
  const fontes = ["Decida.tsx", "Localizacao.tsx", "Stats.tsx", "Levels.tsx", "Plans.tsx", "Lawyer.tsx", "Problem.tsx"]
    .map((f) => readFileSync(join(RAIZ, "src", "components", "sections", f), "utf8"))
    .join("\n");
  for (const l of NAV_LINKS) assert.ok(fontes.includes(`id="${l.href.slice(1)}"`), `âncora ${l.href} sem seção`);
  // fundo alternado: Decida em tinta, Nota em noite (sem bg), Dados em tinta
  assert.match(readFileSync(join(RAIZ, "src", "components", "sections", "Decida.tsx"), "utf8"), /id="decida"[^>]*className="section bg-tinta"/);
  assert.match(readFileSync(join(RAIZ, "src", "components", "sections", "Localizacao.tsx"), "utf8"), /id="localizacao"[^>]*className="section"/);
});

test("landing: hero, solução e Por dentro com os textos da rodada 4", () => {
  assert.ok(HERO.subtitle.length <= 135, "o subtítulo não pode empurrar a lente no celular");
  assert.match(HERO.subtitle, /faz a conta do lance/);
  assert.ok(SOLUTION.cards.some((c) => c.title === "A página inteira do imóvel"));
  assert.ok(!SOLUTION.cards.some((c) => /sem você precisar ler/.test(c.text)), "o edital continua precisando ser lido");
  assert.ok(POR_DENTRO.luneta.points.some((p) => p.icon === "calc"));
});

/** Os arquivos .ts e .tsx de src/ (sem os testes), para varrer textos que vão à tela. */
function fontesDoSite(dir = join(RAIZ, "src"), saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) fontesDoSite(caminho, saida);
    else if (/\.tsx?$/.test(nome) && !/\.test\.ts$/.test(nome)) saida.push(caminho);
  }
  return saida;
}
/** O código sem os comentários (os comentários internos podem falar do advogado parceiro; a tela, não). */
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("rodada 5 (2): nenhuma frase da tela fala em advogado; o contato é com um especialista", () => {
  // as duas exceções: a linha da OAB (pedida pelo dono) e o custo da ação de despejo no simulador (honorários de
  // advogado são um custo real da ação, não um contato)
  const permitidas = [/Quando o especialista for advogado/, /\(advogado e custas\)/];
  for (const arquivo of fontesDoSite()) {
    let codigo = semComentarios(readFileSync(arquivo, "utf8"));
    for (const p of permitidas) codigo = codigo.replace(p, "");
    assert.ok(!/advogad/i.test(codigo), `${arquivo.replace(RAIZ, "")} ainda fala em advogado`);
  }
  assert.equal(LAWYER.oab, "Quando o especialista for advogado, a publicidade segue as regras da OAB.");
  assert.equal(LAWYER.cta, "Quero falar com um especialista");
  assert.ok(NAV_LINKS.some((l) => l.href === "#especialista" && l.label === "Falar com especialista"));
  assert.ok(PLANS.features.some((f) => f.label === "Prioridade para falar com um especialista"));
  assert.match(AVISO_CLASSIFICACAO, /avaliação de um especialista/);
  assert.match(FOOTER.legal, /avaliação de um especialista/);
  assert.ok(FAQ.items.some((f) => f.q === "Como falo com um especialista?"));
});

test("rodada 5 (12): sem \"Suporte dedicado\" nos planos nem nos textos", () => {
  const tudo = [...textos(SITE_TS), ...textos(POR_DENTRO), ...textos(CONVITE), ...textos(CONVITE_PADRAO), ...textos(RECURSOS_LUNETA)];
  for (const t of tudo) assert.ok(!/suporte dedicado/i.test(t), t);
  assert.ok(!PLANS.features.some((f) => /suporte/i.test(f.label)));
});

test("rodada 5 (13): \"Cancele grátis em até 7 dias\", sem colchete no 7 e sem prometer mais", () => {
  assert.equal(CANCELAMENTO.selo, "Cancele grátis em até 7 dias");
  assert.equal(HERO.garantia, CANCELAMENTO.selo);
  // o [7] perdeu os colchetes em todo lugar (o dono confirmou os 7 dias)
  for (const t of [...textos(SITE_TS), ...textos(POR_DENTRO)]) assert.ok(!/\[7\]/.test(t), t);
  assert.equal(SOCIAL.guarantee, "7 dias");
  const faq = FAQ.items.find((f) => f.q === "Posso cancelar quando quiser?");
  assert.ok(faq, "a pergunta do cancelamento");
  assert.match(faq.a, /7 dias/);
  assert.match(faq.a, /art\. 49/);
  assert.ok(!/\[[^\]]+\]/.test(faq.a), "sem placeholder: entra no JSON-LD");
  // a pergunta sobe para o começo do FAQ (mais destaque)
  assert.ok(FAQ.items.indexOf(faq) <= 3, "o cancelamento entre as primeiras perguntas");
  assert.match(PLANS.note, /Cancele grátis em até 7 dias/);
  assert.match(POR_DENTRO.luneta.ctaNote, /Cancele grátis em até 7 dias/);
  // nada de prometer reembolso de outra forma, prazo maior ou "dinheiro de volta"
  for (const t of [...textos(SITE_TS), ...textos(POR_DENTRO)]) {
    assert.ok(!/reembols|dinheiro de volta|\b(8|9|[1-9][0-9]) dias para cancelar/i.test(t), t);
  }
  // o selo fica perto de cada botão de assinar
  const fonte = (f: string) => readFileSync(join(RAIZ, "src", "components", f), "utf8");
  for (const f of ["hero/HeroScene.tsx", "PlansTable.tsx", "sections/FinalCta.tsx", "MobileCtaBar.tsx"]) assert.match(fonte(f), /<SeloCancelamento/, f);
});

test("rodada 5 (8): o alerta de mudança de praça no marketing, e a demonstração sem prometer o envio que ainda não existe", () => {
  // o dono decidiu promover o alerta (PRODUTO.alertaPraca); o envio de verdade depende do back-end
  assert.equal(PRODUTO.alertaPraca, true);
  assert.ok(PRACAS.mostrarAlerta);
  assert.equal(PRACAS.passos.length, 3);
  assert.match(PRACAS.passos[0].texto, /coração/);
  assert.match(PRACAS.passos[2].texto, /novo lance mínimo e a data/);
  assert.ok(FAQ.items.some((f) => f.q === "Como recebo o aviso quando a praça muda?" && /novo lance mínimo e a data/.test(f.a)));
  assert.ok(PLANS.features.some((f) => f.grupo === "Acompanhar" && /Alerta por e-mail/.test(f.label) && f.luneta && !f.lente));
  assert.match(FAVORITOS_CHAMADA, /e-mail quando a praça mudar/);
  if (!PRODUTO.envioDeEmail) {
    // a demonstração diz que é demonstração e que o envio começa no lançamento; nenhum e-mail é prometido para já
    assert.match(ALERTA_PRACA.demonstracao ?? "", /o envio de e-mails começa no lançamento/);
    assert.match(ALERTA_PRACA.ligado, /começa no lançamento/);
    assert.ok(!/você será avisado/i.test(TOAST_FAVORITADO), TOAST_FAVORITADO);
    // o back-end está anotado como obrigatório antes do lançamento
    const pendencias = readFileSync(join(RAIZ, "PENDENCIAS.md"), "utf8");
    assert.match(pendencias, /Back-end: favoritos e alerta de mudança de praça \(obrigatório antes do lançamento\)/);
  }
});

test("rodada 5 (10): os links da landing para a demonstração vão direto à seção certa de um exemplo que existe", async () => {
  const exemplos = await carregarExemplos();
  const ids = new Set(exemplos.map((l) => `ex-${l.id}`));
  const pagina = readFileSync(join(RAIZ, "src", "components", "catalogo", "imovel", "PaginaImovel.tsx"), "utf8");
  const secoes = new Set(Array.from(pagina.matchAll(/\{ id: "([a-z-]+)", rotulo:/g), (m) => m[1]));
  assert.ok(secoes.has("simulador") && secoes.has("riscos") && secoes.has("localizacao"), "as seções da página do imóvel");
  const links = [DECIDA.demoHref, NOTA_LOCAL.demoHref, LEVELS.demoHref, PRACAS.demoHref, ...["alvo-sp", "namira-pr", "promissor-ba", "semselo-rj"].map(EXAMPLES.demoHref)];
  for (const href of links) {
    const m = /^\/assinante\/imovel\/([a-z0-9-]+)(?:#([a-z-]+))?$/.exec(href);
    assert.ok(m, href);
    assert.ok(ids.has(m[1]!), `${href}: o exemplo não existe`);
    if (m[2]) assert.ok(secoes.has(m[2]) || m[2] === "alerta-praca", `${href}: a seção não existe`);
  }
  assert.match(DECIDA.demoHref, /#simulador$/);
  assert.match(NOTA_LOCAL.demoHref, /#localizacao$/);
  assert.match(LEVELS.demoHref, /#riscos$/);
  // o caso dos riscos tem deságio alto e riscos graves (como a cena "Cuidado")
  const riscos = exemplos.find((l) => LEVELS.demoHref.includes(`ex-${l.id}#`))!;
  // a animação de "Cuidado" é o mesmo caso do link (CONT-07): tipo, lugar, deságio, lance e as tags graves
  const ilustra = LEVELS.caution.demo;
  assert.equal(ilustra.title, riscos.title);
  assert.equal(ilustra.place, riscos.place);
  assert.equal(ilustra.desagio, riscos.desagio);
  assert.equal(ilustra.lance, `R$ ${riscos.lance.toLocaleString("pt-BR")}`);
  assert.deepEqual(
    ilustra.tags.map((t) => t.label).sort(),
    riscos.tags.filter((t) => t.severity === "grave").map((t) => t.label).sort(),
  );
  assert.ok(riscos.tags.filter((t) => t.severity === "grave").length >= 2);
  // o caso do alerta está em 2ª praça
  const praca = exemplos.find((l) => PRACAS.demoHref.includes(`ex-${l.id}#`))!;
  assert.equal(praca.praca, "2ª praça");
});
