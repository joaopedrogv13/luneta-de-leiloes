/**
 * O que o mapa do catálogo e o da página do imóvel têm em comum: abrir o MapLibre com o estilo do site, o worker
 * servido pelo próprio site, os textos em português, a atribuição sempre à vista, a troca de tema sem perder a câmera
 * nem os dados, e os balões de preço desenhados na hora (sem sprite a baixar).
 *
 * Só entra nos pedaços de código do mapa (carregados sob demanda): importa maplibre-gl.
 */
import { AttributionControl, getVersion, Map as MapaML, ScaleControl, setWorkerUrl, type MapOptions, type StyleSpecification } from "maplibre-gl";
import { CORES_DESAGIO, estiloMapa, FONTES, PREFIXO_PILULA, type TemaMapa } from "./estilo";

let workerPronto = false;

/** O worker do MapLibre vem do próprio site (src/app/mapa/maplibre-gl-worker.mjs), na mesma versão do pacote. */
function prepararWorker() {
  if (workerPronto) return;
  setWorkerUrl(`/mapa/maplibre-gl-worker.mjs?v=${getVersion()}`);
  workerPronto = true;
}

/** Textos dos controles e do nome do mapa (leitor de tela) em português. */
export const LOCALE_PT: Record<string, string> = {
  "AttributionControl.ToggleAttribution": "Mostrar ou esconder os créditos do mapa",
  "AttributionControl.MapFeedback": "Corrigir o mapa no OpenStreetMap",
  "FullscreenControl.Enter": "Tela cheia",
  "FullscreenControl.Exit": "Sair da tela cheia",
  "GeolocateControl.FindMyLocation": "Minha região",
  "GeolocateControl.LocationNotAvailable": "Localização indisponível",
  "LogoControl.Title": "MapLibre",
  "Map.Title": "Mapa",
  "Marker.Title": "Marcador",
  "NavigationControl.ResetBearing": "Apontar para o norte",
  "NavigationControl.ZoomIn": "Aproximar",
  "NavigationControl.ZoomOut": "Afastar",
  "Popup.Close": "Fechar",
  "ScaleControl.Feet": "pés",
  "ScaleControl.Meters": "m",
  "ScaleControl.Kilometers": "km",
  "ScaleControl.Miles": "mi",
  "ScaleControl.NauticalMiles": "mn",
  "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + rolagem para aproximar o mapa",
  "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + rolagem para aproximar o mapa",
  "CooperativeGesturesHandler.MobileHelpText": "Use dois dedos para mover o mapa",
};

/** O tema do site agora (html[data-theme]; sem atributo, o escuro, que é o padrão). */
export function temaDoSite(): TemaMapa {
  return document.documentElement.dataset.theme === "light" ? "claro" : "escuro";
}

export { temWebGL } from "./webgl";

/**
 * Abre o mapa com o estilo do site: 2D (sem girar nem inclinar: o norte fica em cima e o círculo de incerteza não
 * deforma), atribuição sempre aberta (nunca recolhida num "i"), escala em metros no canto e os textos em português.
 */
export function abrirMapa(container: HTMLElement, opcoes: Partial<MapOptions> & { rotulo: string }): MapaML {
  prepararWorker();
  const { rotulo, ...resto } = opcoes;
  const tema = temaDoSite();
  const mapa = new MapaML({
    container,
    style: estiloMapa(tema),
    attributionControl: false,
    locale: { ...LOCALE_PT, "Map.Title": rotulo },
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    renderWorldCopies: false,
    minZoom: 2.5,
    maxZoom: 19,
    fadeDuration: 180,
    // o mapa fica na tela inteira só na vista de mapa; a roda do mouse aproxima direto (como em todo mapa)
    cooperativeGestures: false,
    ...resto,
  });
  mapa.touchZoomRotate.disableRotation();
  mapa.keyboard.disableRotation();
  mapa.addControl(new AttributionControl({ compact: false }), "bottom-right");
  mapa.addControl(new ScaleControl({ unit: "metric", maxWidth: 96 }), "bottom-left");
  // os balões de preço são desenhados aqui (sem sprite): o mapa pede quando um aparece pela primeira vez
  mapa.setMissingStyleImageResolver((id) => {
    const faixa = id.startsWith(PREFIXO_PILULA) ? Number(id.slice(PREFIXO_PILULA.length)) : NaN;
    if (Number.isInteger(faixa) && !mapa.hasImage(id)) {
      const img = imagemPilula(temaAtual.get(mapa) ?? tema, faixa);
      if (img) mapa.addImage(id, img.dados, img.opcoes);
    }
  });
  temaAtual.set(mapa, tema);
  return mapa;
}

const temaAtual = new WeakMap<MapaML, TemaMapa>();

/**
 * Balão de preço da faixa de deságio (0 a 4): retângulo arredondado na cor da faixa, com a borda na cor do fundo do
 * mapa, esticável (o texto define a largura: `icon-text-fit`). Desenhado em 2× para ficar nítido.
 */
function imagemPilula(tema: TemaMapa, faixa: number) {
  const cores = CORES_DESAGIO[tema];
  const cor = cores.fundo[faixa];
  if (!cor) return null;
  const r = 2;
  const w = 40 * r;
  const h = 24 * r;
  const raio = 9 * r;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const borda = 1.5 * r;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(borda / 2, borda / 2, w - borda, h - borda, raio);
  else ctx.rect(borda / 2, borda / 2, w - borda, h - borda);
  ctx.fillStyle = cor;
  ctx.fill();
  ctx.lineWidth = borda;
  ctx.strokeStyle = cores.borda;
  ctx.stroke();
  return {
    dados: ctx.getImageData(0, 0, w, h),
    opcoes: {
      pixelRatio: r,
      stretchX: [[raio, w - raio]] as [number, number][],
      stretchY: [[raio, h - raio]] as [number, number][],
      content: [raio * 0.75, 4 * r, w - raio * 0.75, h - 4 * r] as [number, number, number, number],
    },
  };
}

/**
 * Segue o tema do site (o botão de tema muda html[data-theme]): troca as cores do estilo pela diferença (setStyle com
 * diff), sem recarregar os ladrilhos, sem mexer na câmera e sem perder os imóveis (os dados das fontes passam do estilo
 * velho para o novo). Os balões de preço são redesenhados. Devolve o "parar de seguir".
 */
export function seguirTema(mapa: MapaML, aoTrocar?: (tema: TemaMapa) => void): () => void {
  const trocar = () => {
    const tema = temaDoSite();
    if (temaAtual.get(mapa) === tema) return;
    temaAtual.set(mapa, tema);
    mapa.setStyle(estiloMapa(tema), {
      diff: true,
      transformStyle: (anterior, novo): StyleSpecification => ({
        ...novo,
        sources: {
          ...novo.sources,
          ...(anterior?.sources[FONTES.imoveis] ? { [FONTES.imoveis]: anterior.sources[FONTES.imoveis] } : {}),
          ...(anterior?.sources[FONTES.destaque] ? { [FONTES.destaque]: anterior.sources[FONTES.destaque] } : {}),
        },
      }),
    });
    for (let faixa = 0; faixa < CORES_DESAGIO[tema].fundo.length; faixa++) {
      const id = `${PREFIXO_PILULA}${faixa}`;
      const img = imagemPilula(tema, faixa);
      if (!img) continue;
      if (mapa.hasImage(id)) mapa.updateImage(id, img.dados);
    }
    aoTrocar?.(tema);
  };
  const observador = new MutationObserver(trocar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observador.disconnect();
}
