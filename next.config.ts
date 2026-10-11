import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
