/**
 * A landing bate com o código: a tabela de planos com src/lib/catalogo/planos.ts (o que o Lente vê), os pesos da nota
 * com PESOS_PADRAO e com o arquivo da nota, o lance máximo do exemplo com o simulador de verdade, as cidades do ITBI com
 * os arquivos, e os textos com as regras do projeto (nunca "risco zero"; nada é garantia; o simulador não é
 * recomendação de investimento).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createJiti } from "jiti";
import { FILTROS_LENTE, pode, RECURSOS } from "../lib/catalogo/planos";
import { PESOS_PADRAO, ROTULO_COMPONENTE } from "../lib/catalogo/localizacao";
import { ESTADO_INICIAL } from "../lib/simulador/estado";
import { metaComoObjetivo } from "../lib/simulador/textos";
import { EXEMPLO_LANDING, miniNota, miniSimulador, resumoItbi, totalCurto } from "../components/sections/dados-landing";
import type { Filtros } from "../lib/catalogo/tipos";
import type { Listing } from "./examples";
import { AVISO_CLASSIFICACAO, AVISO_SIMULADOR } from "./avisos";
import { DECIDA, NOTA_LOCAL } from "./ferramentas";
import { POR_DENTRO } from "./por-dentro";
import * as SITE_TS from "./site";
import { FAQ, FILTERS, FILTROS_PROMETIDOS, FOOTER, HERO, NAV_LINKS, PLANS, SOLUTION, type FiltroSemLugar } from "./site";

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
const tem = (v: boolean | "blur") => v === true;

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
      // o Lente vê o recurso exatamente quando o código deixa (hoje nunca: tags e selos só desfocados)
      assert.equal(tem(f.lente), pode("lente", r), `${r}: a tabela diz ${String(f.lente)} para o Lente`);
      assert.equal(f.luneta, pode("luneta", r), r);
      assert.equal(f.telescopio, true, r);
      if (!pode("lente", r)) assert.ok(f.lente === false || f.lente === "blur", r);
    }
  }
  // nenhuma linha cita um recurso que não existe
  for (const f of PLANS.features) if (f.recurso) assert.ok(RECURSOS.includes(f.recurso), f.recurso);
  // o cartão do Lente não lista nenhum recurso do Luneta como incluído
  assert.ok(PLANS.features.filter((f) => f.recurso && f.lente === true).length === 0);
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
