/**
 * GET /mapa/maplibre-gl-worker.mjs: o worker do MapLibre GL JS (o pacote npm `maplibre-gl` 6), servido pelo próprio site.
 *
 * O MapLibre 6 roda a leitura dos ladrilhos e o agrupamento dos pontos num Web Worker de módulo, e por padrão procura o
 * arquivo ao lado do próprio script (`new URL("./maplibre-gl-worker.mjs", import.meta.url)`), que o empacotador do Next
 * não copia. Esta rota estática (gerada no build, sem função no servidor) publica o arquivo do mesmo pacote instalado, e
 * o mapa chama `setWorkerUrl("/mapa/maplibre-gl-worker.mjs?v=<versão>")` antes de abrir (src/components/catalogo/mapa-gl).
 * A versão na URL vem do package.json do pacote: trocar de versão troca o endereço, e o navegador não mistura o worker
 * velho com o mapa novo.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-static";

export async function GET() {
  const codigo = await readFile(join(process.cwd(), "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs"), "utf8");
  return new Response(codigo, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Robots-Tag": "noindex",
    },
  });
}
