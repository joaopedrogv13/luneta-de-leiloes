import type { NextConfig } from "next";

/**
 * Instantâneo do catálogo (base/saida/site, .json.gz lidos com fs em src/lib/catalogo/dados.ts): o rastreio
 * automático não acha arquivos lidos por caminho montado em tempo de execução, então cada rota que lê o
 * catálogo recebe a pasta explicitamente. Chaves: rotas (picomatch); valores: globs a partir da raiz.
 */
const CATALOGO = ["./base/saida/site/**/*"];
/** ITBI das prefeituras (src/lib/catalogo/itbi.ts): a página dos exemplos também mostra o preço pago da cidade. */
const ITBI = ["./base/saida/site/itbi/*"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/catalogo": CATALOGO,
    "/previa": CATALOGO,
    "/previa/**": CATALOGO,
    "/assinante/imovel/**": ITBI,
  },
  images: {
    // Fotos reais dos imóveis (quando houver) saem em AVIF/WebP, nos tamanhos da moldura de lente.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [390, 640, 828, 1080, 1280, 1920],
    imageSizes: [64, 96, 128, 168, 256],
  },
  turbopack: {
    rules: {
      // Tailwind só no CSS global. Sem o "condition", a regra também pegava os *.module.css e o
      // `as: "*.css"` os transformava em CSS comum (as classes do módulo viravam `undefined`).
      "*.css": {
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
