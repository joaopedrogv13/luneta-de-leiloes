#!/usr/bin/env node
/**
 * Roteiro "fotos-site" do workflow de prints (scripts/prints/actions.mjs): com o site no ar (next start na porta 3000) e
 * a internet aberta, confere no navegador se as fotos da Caixa abrem de verdade (o <img> com referrerPolicy
 * "no-referrer", como o site usa) e tira os prints da vitrine da demonstração, de um imóvel real da vitrine, de um
 * exemplo fictício com a foto ilustrativa e dos cartões da landing, em 360, 390, 768, 1024 e 1440 px, nos dois temas.
 * Grava em prints-saida/ os PNGs e fotos-site.json (cada página: quantas fotos, quantas abriram, quais falharam).
 *
 *   node scripts/prints/actions.mjs fotos-site
 *   LARGURAS=390,1440 node scripts/prints/fotos-site.mjs
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SAIDA = join(process.cwd(), "prints-saida");
mkdirSync(SAIDA, { recursive: true });
const LARGURAS = (process.env.LARGURAS ?? "360,390,768,1024,1440").split(",").map(Number);
const TEMAS = ["dark", "light"];

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
const nav = await chromium.launch();
const resultado = [];

async function abrir(url, largura, tema) {
  const cel = largura < 800;
  const ctx = await nav.newContext({ viewport: { width: largura, height: cel ? 860 : 960 }, deviceScaleFactor: cel ? 2 : 1, isMobile: cel, hasTouch: cel, locale: "pt-BR" });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("luneta-theme", t);
    } catch {}
  }, tema);
  const pg = await ctx.newPage();
  const erros = [];
  pg.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
  await pg.goto(BASE + url, { waitUntil: "networkidle", timeout: 60000 });
  return { ctx, pg, erros };
}

/** Rola até o fim devagar (as fotos são preguiçosas), volta ao topo e devolve cada <img> da Caixa: abriu ou não. */
async function fotosDaPagina(pg) {
  await pg.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    // filas que rolam de lado (exemplos no celular): até o fim também
    for (const ul of document.querySelectorAll("ul")) if (ul.scrollWidth > ul.clientWidth + 8) ul.scrollLeft = ul.scrollWidth;
    await new Promise((r) => setTimeout(r, 600));
    for (const ul of document.querySelectorAll("ul")) ul.scrollLeft = 0;
    window.scrollTo(0, 0);
  });
  await pg.waitForTimeout(2000);
  return pg.evaluate(() => [
    ...[...document.querySelectorAll('img[src*="venda-imoveis.caixa.gov.br"]')].map((i) => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0 })),
    // os cartões do catálogo tiram o <img> que falhou e marcam a moldura
    ...[...document.querySelectorAll('[data-foto="falhou"]')].map(() => ({ src: "(cartão do catálogo: a foto não abriu)", ok: false })),
  ]);
}

async function print(pg, nome, alvo = null, recuo = 90) {
  if (alvo) {
    const l = pg.locator(alvo).first();
    if ((await l.count()) === 0) return;
    await l.scrollIntoViewIfNeeded();
    await pg.evaluate((r) => window.scrollBy(0, -r), recuo);
    await pg.waitForTimeout(900);
  }
  await pg.screenshot({ path: join(SAIDA, `${nome}.png`) });
}

// o primeiro imóvel real da vitrine (a lista muda a cada atualização da base)
const api = await (await fetch(`${BASE}/api/catalogo?conjunto=exemplos&mapa=0&facetas=0`)).json();
const real = api.itens?.[0]?.id ?? null;
console.log("vitrine:", (api.itens ?? []).map((i) => i.id).join(", "));

const PAGINAS = [
  ["/assinante", "assinante", ["#vitrine-fim", "#exemplos-ficticios"]],
  ...(real ? [[`/assinante/imovel/${real}`, "imovel-real", ["#parecidos"]]] : []),
  ["/assinante/imovel/ex-alvo-sp", "ex-alvo-sp", []],
  ["/", "landing", ["#exemplos-titulo"]],
];

for (const [url, nome, secoes] of PAGINAS) {
  for (const largura of LARGURAS) {
    for (const tema of TEMAS) {
      const { ctx, pg, erros } = await abrir(url, largura, tema);
      const fotos = await fotosDaPagina(pg);
      const lateral = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const linha = { url, largura, tema, fotos: fotos.length, ok: fotos.filter((f) => f.ok).length, falharam: [...new Set(fotos.filter((f) => !f.ok).map((f) => f.src))], lateral, erros };
      resultado.push(linha);
      console.log(url, largura, tema, `${linha.ok}/${linha.fotos} fotos`, lateral ? `ROLAGEM LATERAL ${lateral}px` : "", erros.length ? `ERROS ${erros.join(" | ")}` : "");
      if (nome === "landing") await pg.waitForTimeout(2500); // a abertura do hero
      await print(pg, `site-${nome}-${largura}-${tema}`);
      for (const s of secoes) await print(pg, `site-${nome}-${s.replace("#", "")}-${largura}-${tema}`, s);
      await ctx.close();
    }
  }
}

writeFileSync(join(SAIDA, "fotos-site.json"), JSON.stringify({ vitrine: (api.itens ?? []).map((i) => i.id), paginas: resultado }, null, 1));
await nav.close();
