#!/usr/bin/env node
/**
 * Roteiro "fotos-site" do workflow de prints (scripts/prints/actions.mjs): com o site no ar (next start na porta 3000) e
 * a internet aberta, confere no navegador se as fotos da Caixa abrem de verdade (o <img> com referrerPolicy
 * "no-referrer", como o site usa) e tira os prints da vitrine da demonstração, dos exemplos fictícios com a foto
 * ilustrativa e dos cartões da landing. Grava em prints-saida/ os PNGs e fotos-site.json (cada foto: carregou ou não).
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SAIDA = join(process.cwd(), "prints-saida");
mkdirSync(SAIDA, { recursive: true });

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
  const ctx = await nav.newContext({ viewport: { width: largura, height: cel ? 900 : 1000 }, deviceScaleFactor: cel ? 2 : 1, isMobile: cel, hasTouch: cel, locale: "pt-BR" });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("luneta-theme", t);
    } catch {}
  }, tema);
  const pg = await ctx.newPage();
  await pg.goto(BASE + url, { waitUntil: "networkidle", timeout: 60000 });
  return { ctx, pg };
}

/** Rola até o fim devagar (as fotos são preguiçosas) e devolve cada <img> da Caixa: carregou ou não. */
async function fotosDaPagina(pg) {
  await pg.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  });
  await pg.waitForTimeout(2500);
  return pg.evaluate(() =>
    [...document.querySelectorAll('img[src*="venda-imoveis.caixa.gov.br"]')].map((i) => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth })),
  );
}

for (const [url, nome] of [
  ["/assinante", "assinante"],
  ["/assinante?vista=cards", "assinante-cards"],
  ["/assinante/imovel/ex-alvo-sp", "ex-alvo-sp"],
  ["/assinante/imovel/ex-semselo-go", "ex-semselo-go"],
  ["/", "landing"],
]) {
  for (const [largura, tema] of [[1440, "dark"], [390, "light"]]) {
    const { ctx, pg } = await abrir(url, largura, tema);
    const fotos = await fotosDaPagina(pg);
    resultado.push({ url, largura, tema, fotos: fotos.length, ok: fotos.filter((f) => f.ok).length, falharam: fotos.filter((f) => !f.ok).map((f) => f.src) });
    console.log(url, largura, tema, `${fotos.filter((f) => f.ok).length}/${fotos.length} fotos`);
    if (nome === "landing") {
      await pg.locator("#exemplos-titulo").scrollIntoViewIfNeeded();
      await pg.waitForTimeout(1500);
    }
    if (nome === "assinante" || nome === "assinante-cards") {
      const sec = pg.locator('section[aria-labelledby="exemplos-ficticios"]');
      await sec.scrollIntoViewIfNeeded();
      await pg.waitForTimeout(800);
      await sec.screenshot({ path: join(SAIDA, `site-${nome}-exemplos-${largura}-${tema}.png`) });
      await pg.evaluate(() => window.scrollTo(0, 0));
      await pg.waitForTimeout(500);
    }
    await pg.screenshot({ path: join(SAIDA, `site-${nome}-${largura}-${tema}.png`), fullPage: nome === "assinante" && largura === 1440 });
    await ctx.close();
  }
}

writeFileSync(join(SAIDA, "fotos-site.json"), JSON.stringify(resultado, null, 1));
await nav.close();
