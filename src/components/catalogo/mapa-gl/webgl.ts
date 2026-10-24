/**
 * O navegador desenha WebGL? Sem ele, a vista de mapa cai para o mapa do Brasil em SVG. Módulo à parte (sem
 * maplibre-gl): o app do catálogo pergunta antes de baixar o mapa.
 */
let webgl: boolean | null = null;

export function temWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    webgl = !!(window.WebGL2RenderingContext && c.getContext("webgl2")) || !!(window.WebGLRenderingContext && c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}
