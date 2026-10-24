import type { NextConfig } from "next";

/**
 * Instantâneo do catálogo (base/saida/site, .json.gz lidos com fs em src/lib/catalogo/dados.ts): o rastreio
 * automático não acha arquivos lidos por caminho montado em tempo de execução, então cada rota que lê o
 * catálogo recebe a pasta explicitamente. Chaves: rotas (picomatch); valores: globs a partir da raiz.
 */
const CATALOGO = ["./base/saida/site/**/*"];
/** ITBI das prefeituras (src/lib/catalogo/itbi.ts): a página dos exemplos também mostra o preço pago da cidade. */
const ITBI = ["./base/saida/site/itbi/*"];
/**
 * Nota de localização (src/lib/catalogo/localizacao.ts): localizacao.json.gz, localizacao-osm.json.gz (ODbL) e
 * localizacao-cidades.json.gz. Já entram pelo glob do catálogo; a lista explícita deixa claro quem lê o quê e segura o
 * rastreio se o glob do catálogo mudar. Os exemplos (/assinante) usam a nota fictícia de src/content/examples.ts.
 */
const LOCALIZACAO = ["./base/saida/site/localizacao.json.gz", "./base/saida/site/localizacao-osm.json.gz", "./base/saida/site/localizacao-cidades.json.gz"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/catalogo": [...CATALOGO, ...LOCALIZACAO],
    // os pontos do mapa de verdade e o cartão do mapa (src/app/api/catalogo/pontos)
    "/api/catalogo/**": [...CATALOGO, ...LOCALIZACAO],
    "/previa": [...CATALOGO, ...LOCALIZACAO],
    "/previa/**": [...CATALOGO, ...LOCALIZACAO],
    "/assinante/imovel/**": ITBI,
    // a página do método lê os números da nota (estática: lidos no build; a lista segura uma renderização no servidor)
    "/metodologia/localizacao": LOCALIZACAO,
  },
  images: {
    // O site não usa mais o next/image (as fotos ficam na fonte, num <img> simples). Desligado, o otimizador
    // /_next/image responde 404: menos superfície exposta (o 16.4.0 tinha uma falha grave nele, com SVG).
    unoptimized: true,
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
