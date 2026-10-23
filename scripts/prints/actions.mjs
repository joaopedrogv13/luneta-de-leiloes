#!/usr/bin/env node
/**
 * Prints do site com a internet aberta (o workflow .github/workflows/site-prints.yml roda este arquivo do branch
 * escolhido, com o `next start` na porta 3000). Grava PNGs e o log em prints-saida/.
 *
 *   node scripts/prints/actions.mjs mapa      # vista de mapa, página do imóvel, /assinante, desempenho
 *   node scripts/prints/actions.mjs tudo      # o mesmo (o único roteiro, por enquanto)
 *
 * O Chromium do runner não tem GPU: o WebGL roda no SwiftShader (na CPU). Os números de quadros por segundo daqui são
 * piores que os de qualquer celular com GPU; o que vale é a comparação com e sem as camadas dos imóveis (o custo que o
 * site acrescenta ao mapa) e as tarefas longas no thread principal.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const roteiro = process.argv[2] ?? process.env.ROTEIRO ?? "tudo";
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
const navegador = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
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
  { nome: "rua-rj-z16", url: "/previa?vista=mapa&centro=-22.794,-43.572&zoom=16" },
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

  // ---- página do imóvel: a seção Localização com o mapa ----
  for (const [largura, altura] of [
    [1440, 900],
    [390, 844],
  ]) {
    for (const tema of TEMAS) {
      await passo(`imóvel ${largura} ${tema}`, async () => {
        const { ctx, pagina, erros } = await abrir({ largura, altura, tema, url: "/previa/imovel/caixa-1444419640129" });
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
        await pagina.screenshot({ path: join(SAIDA, `imovel-mapa-${largura}-${tema}.png`) });
        await pagina.evaluate(() => window.scrollTo(0, 0));
        await pagina.waitForTimeout(800);
        await pagina.screenshot({ path: join(SAIDA, `imovel-topo-${largura}-${tema}.png`) });
        log("     ", erros.length ? `erros: ${erros.slice(0, 4).join(" | ")}` : "sem erros");
        await ctx.close();
      });
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
      const fonte = m.getSource("imoveis");
      const dados = fonte.serialize().data;
      const t1 = performance.now();
      fonte.setData(dados);
      await new Promise((ok) => m.once("idle", ok));
      const setDataAteDesenharMs = Math.round(performance.now() - t1);
      return { comImoveis, semImoveis, setDataAteDesenharMs, lugares: dados.features.length, webgl: m.painter?.context?.gl?.getParameter?.(0x1f01) ?? "?" };
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
