#!/usr/bin/env node
/**
 * Prints do site com a internet aberta (o workflow .github/workflows/site-prints.yml roda este arquivo do branch
 * escolhido, com o `next start` na porta 3000). Grava PNGs e o log em prints-saida/.
 *
 *   node scripts/prints/actions.mjs mapa      # vista de mapa, página do imóvel, /assinante, desempenho
 *   node scripts/prints/actions.mjs tudo      # o mesmo
 *   node scripts/prints/actions.mjs desempenho  # só a medição (quadros por segundo, tarefas longas, camada por camada)
 *   node scripts/prints/actions.mjs revisao   # só as conferências da revisão (celular deitado, 1366×768, casas, tema,
 *                                             # histórico, Lente com "2 quartos", imóvel na rua, CPU 4× na parada)
 *   node scripts/prints/actions.mjs fotos     # baixa as fotos candidatas e monta folhas de contato (fotos.mjs)
 *   node scripts/prints/actions.mjs fotos-site  # a vitrine e os cartões com as fotos de verdade (fotos-site.mjs)
 *
 * O Chromium do runner não tem GPU: o WebGL roda no SwiftShader (na CPU). Os números de quadros por segundo daqui são
 * piores que os de qualquer celular com GPU; o que vale é a comparação com e sem as camadas dos imóveis (o custo que o
 * site acrescenta ao mapa) e as tarefas longas no thread principal.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const roteiro = process.argv[2] ?? process.env.ROTEIRO ?? "tudo";

// Roteiros das fotos (frente da vitrine): moram em fotos.mjs e fotos-site.mjs, com o navegador e a saída deles. Saem
// antes de abrir o navegador daqui. "fotos:<sub>" passa o sub-roteiro adiante (o padrão é "fotos").
if (roteiro === "fotos" || roteiro.startsWith("fotos:") || roteiro === "fotos-site") {
  if (roteiro === "fotos-site") {
    await import("./fotos-site.mjs");
  } else {
    process.argv = [process.argv[0], process.argv[1], roteiro.split(":")[1] ?? "fotos", ...process.argv.slice(3)];
    await import("./fotos.mjs");
  }
  process.exit(process.exitCode ?? 0);
}
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SAIDA = join(process.cwd(), "prints-saida");
mkdirSync(SAIDA, { recursive: true });

/**
 * O Playwright vem do npx no workflow (não é dependência do site): instala sem salvar se faltar. PLAYWRIGHT_MODULE aponta
 * para uma instalação pronta (no ambiente de desenvolvimento: /opt/node22/lib/node_modules/playwright/index.mjs).
 */
async function playwright() {
  if (process.env.PLAYWRIGHT_MODULE) return await import(process.env.PLAYWRIGHT_MODULE);
  try {
    return await import("playwright");
  } catch {
    execSync("npm install --no-save --no-audit --no-fund playwright@1", { stdio: "inherit" });
    return await import("playwright");
  }
}

const { chromium } = await playwright();
// a rasterização da página na CPU: com ela no SwiftShader, o Chromium sem GPU deixava faixas brancas (ladrilhos não
// pintados) na folha da lista do celular; o WebGL do mapa continua no SwiftShader
const navegador = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-gpu-rasterization"],
});
const relatorio = [];
const log = (...x) => {
  const linha = x.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ");
  relatorio.push(linha);
  console.log(linha);
};

async function abrir({ largura, altura, tema, url, medir = false }) {
  const celular = largura < 800;
  const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: celular ? 2 : 1, hasTouch: celular, isMobile: celular, locale: "pt-BR" });
  await ctx.addInitScript(
    ([t, m]) => {
      try {
        localStorage.setItem("luneta-theme", t === "claro" ? "light" : "dark");
      } catch {}
      if (m) window.__lunetaMedir = true;
    },
    [tema, medir],
  );
  const pagina = await ctx.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(String(e).slice(0, 300)));
  pagina.on("requestfailed", (r) => {
    const u = r.url();
    if (/openfreemap/.test(u)) erros.push(`falhou: ${u.slice(0, 120)} (${r.failure()?.errorText})`);
  });
  await pagina.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pagina.evaluate((t) => document.documentElement.setAttribute("data-theme", t === "claro" ? "light" : "dark"), tema);
  return { ctx, pagina, erros };
}

/** Espera o mapa de verdade: o canvas, os pontos e os ladrilhos (o MapLibre "ocioso"). */
async function esperarMapa(pagina, seletor = ".maplibregl-canvas") {
  await pagina.waitForSelector(seletor, { timeout: 30000 }).catch(() => {});
  await pagina.waitForFunction(() => !document.body.innerText.includes("Carregando os imóveis no mapa"), null, { timeout: 30000 }).catch(() => {});
  await pagina
    .waitForFunction(() => (window.__mapaLuneta ? window.__mapaLuneta.loaded() && !window.__mapaLuneta.isMoving() : true), null, { timeout: 30000 })
    .catch(() => {});
  await pagina.waitForTimeout(2500);
}

async function passo(nome, fn) {
  const t = Date.now();
  try {
    await fn();
    log(`ok   ${nome} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  } catch (e) {
    log(`ERRO ${nome}: ${String(e).slice(0, 400)}`);
  }
}

const TEMAS = ["escuro", "claro"];
const VISTAS = [
  { nome: "brasil", url: "/previa?vista=mapa" },
  { nome: "capital-sp", url: "/previa?vista=mapa&centro=-23.55,-46.63&zoom=11.3" },
  // Nova Iguaçu: muitos imóveis com o número (os balões de preço e os nomes das ruas)
  { nome: "rua-rj-z16", url: "/previa?vista=mapa&centro=-22.7955,-43.5775&zoom=16" },
  // centro do Rio no zoom 15: os círculos dos bairros já sumindo e os rótulos "N imóveis no bairro"
  { nome: "bairros-rj-z15", url: "/previa?vista=mapa&centro=-22.9068,-43.1729&zoom=15" },
];

if (roteiro === "mapa" || roteiro === "tudo") {
  // ---- vista de mapa do catálogo: 1440 e 390, dois temas, Brasil, capital e rua ----
  for (const v of VISTAS) {
    for (const [largura, altura] of [
      [1440, 900],
      [390, 844],
    ]) {
      for (const tema of TEMAS) {
        await passo(`mapa ${v.nome} ${largura} ${tema}`, async () => {
          const { ctx, pagina, erros } = await abrir({ largura, altura, tema, url: v.url, medir: true });
          await esperarMapa(pagina);
          await pagina.screenshot({ path: join(SAIDA, `mapa-${v.nome}-${largura}-${tema}.png`) });
          const info = await pagina.evaluate(() => ({
            url: location.pathname + location.search,
            zoom: window.__mapaLuneta?.getZoom().toFixed(2),
            lista: document.querySelector("#titulo-resultados")?.textContent,
          }));
          log("     ", info, erros.length ? `erros: ${erros.slice(0, 4).join(" | ")}` : "");
          await ctx.close();
        });
      }
    }
  }

  // ---- cartão do imóvel no mapa (passar o mouse e clicar), na rua ----
  for (const tema of TEMAS) {
    await passo(`cartão no mapa ${tema}`, async () => {
      const { ctx, pagina } = await abrir({ largura: 1440, altura: 900, tema, url: VISTAS[2].url, medir: true });
      await esperarMapa(pagina);
      const alvo = await pagina.evaluate(() => {
        const m = window.__mapaLuneta;
        const fs = m.queryRenderedFeatures({ layers: ["lu-ponto"].filter((c) => m.getLayer(c)) });
        const r = m.getCanvas().getBoundingClientRect();
        for (const f of fs) {
          const pt = m.project(f.geometry.coordinates);
          if (pt.x > 160 && pt.x < r.width - 160 && pt.y > 200 && pt.y < r.height - 120) return { x: pt.x + r.left, y: pt.y + r.top };
        }
        return null;
      });
      if (!alvo) throw new Error("nenhum ponto na tela");
      await pagina.mouse.move(alvo.x, alvo.y);
      await pagina.waitForTimeout(2500);
      await pagina.screenshot({ path: join(SAIDA, `mapa-cartao-hover-1440-${tema}.png`) });
      await pagina.mouse.click(alvo.x, alvo.y);
      await pagina.waitForTimeout(1500);
      await pagina.screenshot({ path: join(SAIDA, `mapa-cartao-preso-1440-${tema}.png`) });
      await ctx.close();
    });
  }

  // ---- celular: folha puxada até a metade e cheia ----
  await passo("folha do celular", async () => {
    const { ctx, pagina } = await abrir({ largura: 390, altura: 844, tema: "claro", url: VISTAS[1].url, medir: true });
    await esperarMapa(pagina);
    await pagina.getByRole("button", { name: /Ver lista/ }).first().click();
    await pagina.waitForTimeout(1500);
    await pagina.screenshot({ path: join(SAIDA, "mapa-folha-cheia-390-claro.png") });
    await ctx.close();
  });

  // ---- página do imóvel: a seção Localização com o mapa (endereço no número e só no bairro) ----
  const IMOVEIS = [
    { nome: "numero", id: "caixa-1444419640129" },
    { nome: "bairro", id: "caixa-0000010207569" },
  ];
  for (const im of IMOVEIS) {
    for (const [largura, altura] of [
      [1440, 900],
      [390, 844],
    ]) {
      for (const tema of TEMAS) {
        // o do bairro: só um tamanho e um tema por tamanho (o círculo é o que importa)
        if (im.nome === "bairro" && tema !== (largura < 800 ? "claro" : "escuro")) continue;
        await passo(`imóvel ${im.nome} ${largura} ${tema}`, async () => {
          const { ctx, pagina, erros } = await abrir({ largura, altura, tema, url: `/previa/imovel/${im.id}` });
          await pagina.waitForSelector("#localizacao", { timeout: 30000 });
          // chega perto do mapa (ele só carrega a 500 px da tela)
          await pagina.evaluate(async () => {
            const alvo = document.querySelector("#localizacao");
            alvo.scrollIntoView({ block: "start" });
            await new Promise((ok) => setTimeout(ok, 400));
            const mapa = alvo.querySelector("[class*='rounded-3xl'][class*='h-[300px]']");
            mapa?.scrollIntoView({ block: "center" });
          });
          await esperarMapa(pagina, "#localizacao .maplibregl-canvas");
          const sufixo = im.nome === "numero" ? "" : `-${im.nome}`;
          await pagina.screenshot({ path: join(SAIDA, `imovel-mapa${sufixo}-${largura}-${tema}.png`) });
          if (im.nome === "numero") {
            await pagina.evaluate(() => window.scrollTo(0, 0));
            await pagina.waitForTimeout(800);
            await pagina.screenshot({ path: join(SAIDA, `imovel-topo-${largura}-${tema}.png`) });
          }
          log("     ", erros.length ? `erros: ${erros.slice(0, 4).join(" | ")}` : "sem erros");
          await ctx.close();
        });
      }
    }
  }

  // ---- /assinante (exemplos fictícios): a lista e a vista de mapa ----
  for (const [largura, altura] of [
    [1440, 900],
    [390, 844],
  ]) {
    await passo(`assinante ${largura}`, async () => {
      const { ctx, pagina } = await abrir({ largura, altura, tema: "escuro", url: "/assinante" });
      await pagina.waitForTimeout(2500);
      await pagina.screenshot({ path: join(SAIDA, `assinante-${largura}.png`) });
      await pagina.goto(`${BASE}/assinante?vista=mapa`, { waitUntil: "domcontentloaded" });
      await esperarMapa(pagina);
      await pagina.screenshot({ path: join(SAIDA, `assinante-mapa-${largura}.png`) });
      await ctx.close();
    });
  }
}

if (roteiro === "mapa" || roteiro === "tudo" || roteiro === "revisao") {
  // ---- revisão: as correções da revisão adversarial, com os ladrilhos de verdade ----
  const estado = (pagina) =>
    pagina.evaluate(() => {
      const m = window.__mapaLuneta;
      const q = new URLSearchParams(location.search);
      return {
        centro: m ? `${m.getCenter().lat.toFixed(3)},${m.getCenter().lng.toFixed(3)}` : null,
        zoom: m?.getZoom().toFixed(2),
        bbox: q.get("bbox"),
        q: q.get("q"),
        lista: document.querySelector("#titulo-resultados")?.textContent,
        contagem: document.body.innerText.match(/[\d.]+ imóve(?:l|is)/)?.[0],
      };
    });

  // celular deitado e notebook de 768 px de altura (o cabeçalho rola junto): botões, legenda e créditos à vista
  for (const [largura, altura, tema, url] of [
    [844, 390, "escuro", VISTAS[1].url],
    [844, 390, "claro", VISTAS[2].url],
    [1366, 768, "escuro", VISTAS[1].url],
    [1366, 768, "claro", VISTAS[0].url],
  ]) {
    await passo(`tela ${largura}x${altura} ${tema}`, async () => {
      const { ctx, pagina } = await abrir({ largura, altura, tema, url, medir: true });
      await esperarMapa(pagina);
      await pagina.screenshot({ path: join(SAIDA, `revisao-${largura}x${altura}-${tema}.png`) });
      const creditos = await pagina.evaluate(() => {
        const a = document.querySelector(".maplibregl-ctrl-attrib");
        if (!a) return "sem créditos";
        const r = a.getBoundingClientRect();
        return { visivel: r.bottom <= innerHeight && r.top >= 0 && r.height > 0, texto: a.textContent?.trim().slice(0, 90) };
      });
      log("     ", await estado(pagina), creditos);
      await ctx.close();
    });
  }

  // número das casas de perto (zoom 17,6), nos dois temas
  for (const tema of TEMAS) {
    await passo(`casas z17.6 ${tema}`, async () => {
      const { ctx, pagina } = await abrir({ largura: 1440, altura: 900, tema, url: "/previa?vista=mapa&centro=-22.7955,-43.5775&zoom=17.6", medir: true });
      await esperarMapa(pagina);
      await pagina.screenshot({ path: join(SAIDA, `revisao-casas-z17-${tema}.png`) });
      await ctx.close();
    });
  }

  // abrir o Brasil inteiro (sem câmera): a lista é a busca inteira (o enquadramento automático não vira área)
  for (const [largura, altura] of [
    [1440, 900],
    [390, 844],
  ]) {
    await passo(`abrir o Brasil ${largura}`, async () => {
      const { ctx, pagina } = await abrir({ largura, altura, tema: "escuro", url: "/previa?vista=mapa", medir: true });
      await esperarMapa(pagina);
      log("     ", await estado(pagina));
      await ctx.close();
    });
  }

  // trocar o tema com o mapa aberto (ladrilhos de verdade): a câmera e os imóveis ficam
  await passo("tema com o mapa aberto", async () => {
    const { ctx, pagina } = await abrir({ largura: 1440, altura: 900, tema: "escuro", url: VISTAS[2].url, medir: true });
    await esperarMapa(pagina);
    const antes = await estado(pagina);
    const nAntes = await pagina.evaluate(() => window.__mapaLuneta.querySourceFeatures("imoveis").length);
    await pagina.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await pagina.waitForTimeout(2500);
    const depois = await estado(pagina);
    const nDepois = await pagina.evaluate(() => window.__mapaLuneta.querySourceFeatures("imoveis").length);
    await pagina.screenshot({ path: join(SAIDA, "revisao-tema-trocado-1440.png") });
    log("      antes", antes.centro, antes.zoom, nAntes, "depois", depois.centro, depois.zoom, nDepois);
    await ctx.close();
  });

  // voltar no histórico: a câmera e a área daquela entrada (não o Brasil inteiro)
  await passo("voltar no histórico", async () => {
    const { ctx, pagina } = await abrir({ largura: 1440, altura: 900, tema: "claro", url: "/previa?vista=mapa&centro=-23.55,-46.63&zoom=11", medir: true });
    await esperarMapa(pagina);
    const c = await pagina.locator(".maplibregl-canvas").boundingBox();
    await pagina.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await pagina.mouse.down();
    for (let k = 1; k <= 10; k++) await pagina.mouse.move(c.x + c.width / 2 - 20 * k, c.y + c.height / 2);
    await pagina.mouse.up();
    await pagina.waitForTimeout(2500);
    const arrastou = await estado(pagina);
    const busca = pagina.getByPlaceholder(/Cidade, bairro/).first();
    await busca.fill("Recife");
    await busca.press("Enter");
    await pagina.waitForTimeout(4000);
    const recife = await estado(pagina);
    await pagina.goBack();
    await pagina.waitForTimeout(4000);
    const voltou = await estado(pagina);
    await pagina.screenshot({ path: join(SAIDA, "revisao-voltou-1440.png") });
    log("      arrastou", arrastou);
    log("      recife  ", recife);
    log("      voltou  ", voltou);
    await ctx.close();
  });

  // Lente com "2 quartos" na busca: o mapa pede com o plano (o filtro de quartos é da Luneta)
  await passo("Lente: 2 quartos na busca", async () => {
    const { ctx, pagina } = await abrir({ largura: 1440, altura: 900, tema: "escuro", url: "/previa?vista=mapa&plano=lente&q=casa+2+quartos", medir: true });
    await esperarMapa(pagina);
    const r = await pagina.evaluate(() => ({
      pedidoDosPontos: performance.getEntriesByType("resource").map((e) => e.name).find((u) => u.includes("/api/catalogo/pontos?")),
      noMapa: window.__mapaLuneta.getSource("imoveis").serialize().data.features.reduce((s, f) => s + f.properties.n, 0),
      contagem: document.body.innerText.match(/[\d.]+ imóve(?:l|is)/)?.[0],
    }));
    log("     ", r);
    await ctx.close();
  });

  // página do imóvel com o endereço pela rua: o ponto com a área de incerteza em volta
  await passo("imóvel na rua", async () => {
    const { ctx, pagina } = await abrir({ largura: 1440, altura: 900, tema: "claro", url: "/previa/imovel/caixa-8555511199930" });
    await pagina.waitForSelector("#localizacao", { timeout: 30000 });
    await pagina.evaluate(async () => {
      const alvo = document.querySelector("#localizacao");
      alvo.scrollIntoView({ block: "start" });
      await new Promise((ok) => setTimeout(ok, 400));
      alvo.querySelector("[class*='rounded-3xl'][class*='h-[300px]']")?.scrollIntoView({ block: "center" });
    });
    await esperarMapa(pagina, "#localizacao .maplibregl-canvas");
    await pagina.screenshot({ path: join(SAIDA, "revisao-imovel-rua-1440-claro.png") });
    await ctx.close();
  });

  // celular com a CPU 4× mais lenta: tarefas longas depois de soltar o dedo (a lista segue a área)
  await passo("parada com a lista (CPU 4x)", async () => {
    const { ctx, pagina } = await abrir({ largura: 390, altura: 844, tema: "escuro", url: VISTAS[1].url, medir: true });
    await esperarMapa(pagina);
    const cdp = await ctx.newCDPSession(pagina);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const r = await pagina.evaluate(async () => {
      const longas = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => longas.push(Math.round(e.duration)))).observe({ type: "longtask" });
      const m = window.__mapaLuneta;
      const saida = [];
      for (const dx of [220, -220, 220]) {
        const n0 = longas.length;
        m.panBy([dx, 0], { duration: 600 }, { daPessoa: true });
        await new Promise((ok) => setTimeout(ok, 3500));
        saida.push(longas.slice(n0));
      }
      return saida;
    });
    log("      tarefas longas (ms) depois de cada parada:", r);
    await ctx.close();
  });
}

if (roteiro === "mapa" || roteiro === "tudo" || roteiro === "desempenho") {
  // ---- desempenho: quadros no zoom e no arrasto (com e sem as camadas dos imóveis), setData, os pontos ----
  await passo("desempenho", async () => {
    const t0 = Date.now();
    const { ctx, pagina } = await abrir({ largura: 1440, altura: 900, tema: "escuro", url: "/previa?vista=mapa", medir: true });
    await pagina.waitForFunction(() => window.__mapaLuneta?.querySourceFeatures("imoveis").length > 0, null, { timeout: 60000 });
    const ateOsPontos = Date.now() - t0;
    await esperarMapa(pagina);
    const medida = await pagina.evaluate(async () => {
      const m = window.__mapaLuneta;
      const longas = [];
      try {
        new PerformanceObserver((l) => l.getEntries().forEach((e) => longas.push(e.duration))).observe({ type: "longtask" });
      } catch {}
      const quadros = (ms) =>
        new Promise((ok) => {
          const t = [];
          const n0 = longas.length;
          const ini = performance.now();
          const passo = (agora) => {
            t.push(agora);
            if (agora - ini < ms) requestAnimationFrame(passo);
            else {
              const dif = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
              ok({ fps: Math.round((t.length - 1) / ((t[t.length - 1] - t[0]) / 1000)), p95ms: Math.round(dif[Math.floor(dif.length * 0.95)] ?? 0), longas: longas.length - n0 });
            }
          };
          requestAnimationFrame(passo);
        });
      const ocioso = () => new Promise((ok) => (m.loaded() ? setTimeout(ok, 300) : m.once("idle", () => setTimeout(ok, 300))));
      const percurso = async () => {
        m.jumpTo({ center: [-52, -15], zoom: 3.6 });
        await ocioso();
        const r = {};
        m.flyTo({ center: [-46.63, -23.55], zoom: 12, duration: 3000 });
        r.zoomBrasilAteSP = await quadros(3100);
        await ocioso();
        m.easeTo({ center: [-43.2, -22.9], duration: 2000 });
        r.arrastoSPateRio = await quadros(2100);
        await ocioso();
        m.easeTo({ zoom: 16, duration: 1500 });
        r.zoomAteRua = await quadros(1600);
        return r;
      };
      const camadas = m.getStyle().layers.filter((l) => l.id.startsWith("lu-")).map((l) => l.id);
      const comImoveis = await percurso();
      camadas.forEach((id) => m.setLayoutProperty(id, "visibility", "none"));
      const semImoveis = await percurso();
      camadas.forEach((id) => m.setLayoutProperty(id, "visibility", "visible"));
      // o zoom até a rua no Rio, de novo (ladrilhos já baixados), e escondendo um grupo de camadas por vez: quem pesa
      const simbolos = camadas.filter((id) => m.getLayer(id).type === "symbol");
      const circulos = camadas.filter((id) => m.getLayer(id).type === "circle");
      const ateRua = async (esconder) => {
        esconder.forEach((id) => m.setLayoutProperty(id, "visibility", "none"));
        m.jumpTo({ center: [-43.2, -22.9], zoom: 12 });
        await ocioso();
        const n0 = longas.length;
        m.easeTo({ zoom: 16, duration: 1500 });
        const r = await quadros(1600);
        r.duracoesLongas = longas.slice(n0).map(Math.round);
        await ocioso();
        esconder.forEach((id) => m.setLayoutProperty(id, "visibility", "visible"));
        return r;
      };
      const porCamada = {
        todasDeNovo: await ateRua([]),
        semPrecos: await ateRua(["lu-preco"]),
        semSimbolos: await ateRua(simbolos),
        semCirculos: await ateRua(circulos),
        nenhuma: await ateRua(camadas),
        todasDeNovo2: await ateRua([]),
      };
      const fonte = m.getSource("imoveis");
      const dados = fonte.serialize().data;
      const t1 = performance.now();
      fonte.setData(dados);
      await new Promise((ok) => m.once("idle", ok));
      const setDataAteDesenharMs = Math.round(performance.now() - t1);
      return { comImoveis, semImoveis, porCamada, setDataAteDesenharMs, lugares: dados.features.length, webgl: m.painter?.context?.gl?.getParameter?.(0x1f01) ?? "?" };
    });
    const r = await pagina.evaluate(async () => {
      const t = performance.now();
      const resp = await fetch("/api/catalogo/pontos?conjunto=previa");
      const corpo = await resp.arrayBuffer();
      return { ms: Math.round(performance.now() - t), bytesDescomprimidos: corpo.byteLength, codificacao: resp.headers.get("content-encoding") };
    });
    log("     desempenho", { ateOsPontosMs: ateOsPontos, ...medida, pedidoDosPontos: r });
    await ctx.close();
  });
}

writeFileSync(join(SAIDA, "relatorio.txt"), relatorio.join("\n") + "\n");
await navegador.close();
