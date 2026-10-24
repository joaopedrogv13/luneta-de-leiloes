/**
 * Fotos ilustrativas (rodada 5, decisão 3): onde a landing e a demonstração mostram a foto de um imóvel real num exemplo
 * fictício, o rótulo "foto ilustrativa" vai junto, e nunca o endereço do imóvel real. Os componentes são renderizados
 * no Node (react-dom/server, com o JSX transformado pelo jiti), como o servidor os entrega na primeira pintura.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import type { Listing } from "../content/examples";
import { carregarExemplos, carregarPrevia } from "../lib/catalogo/conjuntos";
import { pastaPadrao } from "../lib/catalogo/instantaneo";
import type { ImovelResumo, TipoImovel } from "../lib/catalogo/tipos";

const RAIZ = process.cwd();
const AGORA = new Date("2026-10-24T15:00:00Z");
const jiti = createJiti(__filename, { jsx: { runtime: "automatic" }, alias: { "@/": `${join(RAIZ, "src")}/` } });
const importar = <T>(...caminho: string[]) => jiti.import<T>(join(RAIZ, "src", ...caminho));
const exemplos = async () => (await importar<{ LISTINGS: Listing[]; FEATURED_EXAMPLES: Listing[] }>("content", "examples.ts"));
const html = <P extends object>(c: ComponentType<P>, p: P) => renderToStaticMarkup(createElement(c, p));

test("cartões da landing: cada exemplo fictício leva a foto ilustrativa num <img> simples, com o rótulo", async () => {
  const { AuctionCard } = await importar<{ AuctionCard: ComponentType<{ listing: Listing; compact?: boolean; locked?: boolean }> }>("components", "AuctionCard.tsx");
  const { LISTINGS, FEATURED_EXAMPLES } = await exemplos();
  assert.equal(FEATURED_EXAMPLES.length, 4);
  for (const l of LISTINGS) {
    for (const props of [{}, { compact: true, locked: true }]) {
      const h = html(AuctionCard, { listing: l, ...props });
      if (!l.photoIlustrativa) {
        // o exemplo com risco grave (sem foto de imóvel real): o desenho, sem <img> e sem o rótulo
        assert.doesNotMatch(h, /<img /, `${l.id}: sem foto`);
        assert.doesNotMatch(h, /foto ilustrativa/, `${l.id}: sem o rótulo`);
        assert.match(h, /photo-placeholder/);
        continue;
      }
      // a foto: <img> simples da fonte (sem next/image), com tamanho fixo, preguiçosa e sem referrer, numa ilha que a
      // tira se falhar (o cartão marca data-foto para o rótulo sumir junto)
      const img = /<img [^>]*>/.exec(h)?.[0] ?? "";
      assert.match(h, /<article [^>]*data-foto="fonte"/, `${l.id}: o cartão marca a foto da fonte`);
      assert.ok(img.includes(`src="${l.photoIlustrativa!.url}"`), `${l.id}: a foto ilustrativa no cartão`);
      assert.match(img, /width="(64|84)" height="(64|84)"/, `${l.id}: dimensões fixas (sem CLS)`);
      assert.match(img, /loading="lazy"/);
      assert.match(img, /referrerPolicy="no-referrer"/i);
      assert.doesNotMatch(h, /_next\/image/, `${l.id}: sem o otimizador do next/image`);
      // o rótulo à vista (inteiro numa linha) e no nome acessível do cartão
      assert.match(
        h,
        /Exemplo fictício<span class="group-data-\[foto=falhou\]\/foto:hidden"> ·<\/span><\/span> <span class="whitespace-nowrap group-data-\[foto=falhou\]\/foto:hidden">foto ilustrativa<\/span>/,
        `${l.id}: rótulo visível (e some se a foto falhar)`,
      );
      assert.match(h, /aria-label="Exemplo fictício · foto ilustrativa:/, `${l.id}: rótulo no nome acessível`);
      // o desenho de fallback continua por baixo (a foto da Caixa pode não abrir)
      assert.match(h, /photo-placeholder/);
    }
  }
});

test("cartão do hero: a foto ilustrativa do Alvo vem com o rótulo e não disputa com o título", async () => {
  const { HeroScene } = await importar<{ HeroScene: ComponentType<object> }>("components", "hero", "HeroScene.tsx");
  const { LISTINGS } = await exemplos();
  const h = html(HeroScene, {});
  assert.ok(h.includes(LISTINGS.find((l) => l.id === "alvo-sp")!.photoIlustrativa!.url), "a foto do exemplo Alvo");
  assert.match(h, /group-data-\[foto=falhou\]\/foto:hidden[^"]*">Foto ilustrativa</, "o rótulo, que some se a foto falhar");
  // no celular baixo (360 × 640) a foto e o rótulo saem juntos (nunca a foto sem o rótulo)
  const baixa = "max-sm:[@media(max-height:700px)]:hidden";
  assert.ok(h.includes(`${baixa}">Foto ilustrativa<`) && /photo-placeholder[^"]*max-sm:\[@media\(max-height:700px\)\]:hidden/.test(h), "foto e rótulo somem juntos");
  assert.match(h, /data-h="card" data-foto="fonte"/);
  assert.match(h, /<img [^>]*loading="lazy"[^>]*fetchPriority="low"/);
});

test("demonstração: o cartão e a galeria de cada exemplo rotulam a foto ilustrativa (o PDF: no navegador, ele importa CSS)", async () => {
  const { LISTINGS } = await exemplos();
  const { FotoImovel, ROTULO_FOTO_ILUSTRATIVA } = await importar<{ FotoImovel: ComponentType<{ imovel: ImovelResumo }>; ROTULO_FOTO_ILUSTRATIVA: string }>(
    "components",
    "catalogo",
    "cartoes",
    "FotoImovel.tsx",
  );
  const { Galeria } = await importar<{ Galeria: ComponentType<{ fotos: string[]; tipo: TipoImovel; titulo: string; semFotoTexto: string; ilustrativa?: boolean }> }>(
    "components",
    "catalogo",
    "imovel",
    "Galeria.tsx",
  );
  const ficticios = carregarExemplos(LISTINGS, AGORA);
  assert.equal(ficticios.itens.length, 6);
  for (const i of ficticios.itens) {
    if (!i.foto) {
      // sem foto ilustrativa (o de risco grave): "Exemplo fictício: sem foto", sem o rótulo
      const cartao = html(FotoImovel, { imovel: i });
      assert.ok(cartao.includes("Exemplo fictício: sem foto"), i.id);
      assert.ok(!cartao.includes(ROTULO_FOTO_ILUSTRATIVA), i.id);
      continue;
    }
    assert.equal(i.fotoIlustrativa, true, i.id);
    const cartao = html(FotoImovel, { imovel: i });
    assert.ok(cartao.includes(`src="${i.foto}"`), `${i.id}: a foto no cartão`);
    assert.ok(cartao.includes(`>${ROTULO_FOTO_ILUSTRATIVA}<`), `${i.id}: rótulo sobre a foto do cartão`);
    const d = (await ficticios.detalhe(i.id))!;
    const galeria = html(Galeria, { fotos: d.fotos, tipo: d.tipo, titulo: d.titulo, semFotoTexto: "", ilustrativa: true });
    assert.match(galeria, /Foto ilustrativa<span[^>]*> · de um imóvel real parecido, de outro endereço/, `${i.id}: rótulo na galeria`);
    assert.match(galeria, /aria-label="Foto ilustrativa, de um imóvel real parecido, de outro endereço"/, `${i.id}: e no nome do carrossel`);
  }
  // um imóvel real (foto dele) não leva o rótulo
  const real = { ...ficticios.itens[0]!, id: "caixa-0000000000001", fotoIlustrativa: undefined };
  assert.ok(!html(FotoImovel, { imovel: real }).includes(ROTULO_FOTO_ILUSTRATIVA));
});

test("o endereço do imóvel real da foto nunca aparece no exemplo", { skip: !existsSync(join(pastaPadrao(), "imoveis.json.gz")) }, async () => {
  const { LISTINGS } = await exemplos();
  const { AuctionCard } = await importar<{ AuctionCard: ComponentType<{ listing: Listing }> }>("components", "AuctionCard.tsx");
  const previa = await carregarPrevia(pastaPadrao());
  const ficticios = carregarExemplos(LISTINGS, AGORA);
  for (const l of LISTINGS) {
    if (!l.photoIlustrativa) continue;
    const real = (await previa.detalhe(l.photoIlustrativa.de))!;
    assert.ok(real, `${l.id}: o imóvel da foto está na base`);
    const d = (await ficticios.detalhe(`ex-${l.id}`))!;
    const texto = [JSON.stringify(d), html(AuctionCard, { listing: l })].join(" ");
    // o endereço do real e a rua dele (o bairro pode coincidir por acaso; a rua e o número, não)
    assert.ok(real.endereco && real.endereco.length > 6, `${l.id}: o real tem endereço (o teste não passa vazio)`);
    for (const parte of [real.endereco, real.endereco.split(",")[0]!.trim()].filter((x) => x.length > 6)) {
      assert.ok(!texto.includes(parte), `${l.id}: "${parte}" (do imóvel real) não aparece`);
    }
    assert.ok(!JSON.stringify(d).includes(l.photoIlustrativa.de), `${l.id}: nem o id do imóvel real`);
    // A URL da foto (que fica na Caixa: o site não a re-hospeda) leva os 13 dígitos do id real (F<id>21.jpg), e por eles
    // se chega ao imóvel real: risco aceito e anotado no PENDENCIAS (R5-TEC-12). O que o teste garante é que, fora da
    // URL da foto, os dígitos não aparecem em nada que a página mostra ou entrega.
    const digitos = l.photoIlustrativa.de.replace("caixa-", "");
    assert.match(l.photoIlustrativa.url, new RegExp(`/F${digitos}21\\.jpg$`));
    assert.ok(!texto.replaceAll(l.photoIlustrativa.url, "").includes(digitos), `${l.id}: os dígitos do id real só na URL da foto`);
  }
});
