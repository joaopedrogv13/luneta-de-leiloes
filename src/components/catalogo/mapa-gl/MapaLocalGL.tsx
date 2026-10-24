"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapaML } from "maplibre-gl";
import { useEffect, useId, useRef, useState } from "react";
import { raioDoNivel, raioPixelZ0, type NivelPonto } from "@/lib/catalogo/pontos";
import { FONTES } from "./estilo";
import { featureDoImovel, zoomDoImovel } from "./geojson";
import s from "./mapa-gl.module.css";
import { abrirMapa, seguirTema, temWebGL } from "./nucleo";

/**
 * O mapa da página do imóvel (MapLibre, sob demanda: só quando a seção chega perto da tela). Centrado no ponto, com o
 * zoom de rua, e a precisão desenhada como no catálogo: no número, o ponto com o preço; na rua, o ponto com a área de
 * incerteza em volta (a do lugar aberto no catálogo); no bairro, só o círculo (nunca um alfinete, com pelo menos 300 m);
 * só na cidade, o marcador "sem endereço exato" no centro.
 * No fluxo da página: a roda do mouse rola a página (Ctrl/⌘ + roda aproxima) e, no toque, um dedo rola a página e dois
 * movem o mapa. Sem WebGL, quem chama mostra o mapa do Brasil em SVG.
 */
export default function MapaLocalGL({
  lat,
  lon,
  nivel,
  raio,
  lance,
  desagio,
  legenda,
  onFalhou,
}: {
  lat: number;
  lon: number;
  nivel: NivelPonto;
  /** desvio do ponto (m); null usa o padrão do nível */
  raio: number | null;
  lance: number;
  desagio: number | null;
  /** "Posição aproximada (pela rua)"... (legenda e nome acessível) */
  legenda: string;
  onFalhou: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaML | null>(null);
  const [fundoFalhou, setFundoFalhou] = useState(false);
  const idDica = useId();
  const atual = useRef({ lat, lon, nivel, raio, lance, desagio, onFalhou });
  useEffect(() => {
    atual.current = { lat, lon, nivel, raio, lance, desagio, onFalhou };
  });

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const p = atual.current;
    if (!temWebGL()) {
      p.onFalhou();
      return;
    }
    let mapa: MapaML;
    try {
      mapa = abrirMapa(el, {
        rotulo: `Mapa do imóvel. ${legenda}`,
        center: [p.lon, p.lat],
        zoom: zoomDoImovel(p.nivel, p.raio, p.lat, el.clientHeight || 300),
        cooperativeGestures: true,
      });
    } catch {
      p.onFalhou();
      return;
    }
    mapaRef.current = mapa;
    mapa.getCanvas().setAttribute("aria-describedby", idDica);
    const ponto = () => {
      const a = atual.current;
      (mapa.getSource(FONTES.imoveis) as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: [featureDoImovel({ lat: a.lat, lon: a.lon, nivel: a.nivel, raio: a.raio, lance: a.lance, desagio: a.desagio })],
      });
      // na rua, a área da incerteza em volta do ponto (até ~500 m): o ponto sozinho pareceria o endereço exato
      (mapa.getSource(FONTES.destaque) as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features:
          a.nivel === 1
            ? [{ type: "Feature", properties: { nv: 1, r0: raioPixelZ0(raioDoNivel(1, a.raio), a.lat), anel: 0 }, geometry: { type: "Point", coordinates: [a.lon, a.lat] } }]
            : [],
      });
    };
    mapa.on("style.load", ponto);
    mapa.on("error", (e) => {
      const ev = e as unknown as { sourceId?: string; error?: { message?: string } };
      if (ev.sourceId === "openmaptiles" || /openfreemap|fonts\//.test(ev.error?.message ?? "")) setFundoFalhou(true);
    });
    const canvas = mapa.getCanvas();
    const perdeuContexto = () => atual.current.onFalhou();
    canvas.addEventListener("webglcontextlost", perdeuContexto, { once: true });
    const pararTema = seguirTema(mapa);
    const ro = new ResizeObserver(() => mapa.resize());
    ro.observe(el);
    return () => {
      canvas.removeEventListener("webglcontextlost", perdeuContexto);
      pararTema();
      ro.disconnect();
      mapa.remove();
      mapaRef.current = null;
    };
  }, [idDica, legenda]);

  const semMovimento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const zoom = (d: number) => mapaRef.current?.easeTo({ zoom: mapaRef.current.getZoom() + d, duration: semMovimento() ? 0 : 250 });
  const voltar = () => {
    const m = mapaRef.current;
    const a = atual.current;
    m?.easeTo({ center: [a.lon, a.lat], zoom: zoomDoImovel(a.nivel, a.raio, a.lat, m.getContainer().clientHeight), duration: semMovimento() ? 0 : 400 });
  };

  return (
    <div
      className={`${s.mapa} relative h-[300px] overflow-hidden rounded-3xl border border-nevoa/20 sm:h-[320px]`}
      style={{ "--folga-escala": "20px" } as React.CSSProperties}
    >
      <div className="absolute inset-0">
        <div ref={caixa} className="h-full w-full" />
      </div>
      <p id={idDica} className="sr-only">
        {legenda}. Use as setas para mover e as teclas mais e menos para aproximar.
      </p>
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <div className={`${s.vidro} flex flex-col overflow-hidden rounded-2xl`}>
          <button type="button" onClick={() => zoom(1)} aria-label="Aproximar" title="Aproximar" className={s.botao}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <span aria-hidden="true" className="h-px bg-nevoa/20" />
          <button type="button" onClick={() => zoom(-1)} aria-label="Afastar" title="Afastar" className={s.botao}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
          </button>
        </div>
        <button type="button" onClick={voltar} aria-label="Voltar ao imóvel" title="Voltar ao imóvel" className={`${s.vidro} ${s.botao} rounded-2xl`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
          </svg>
        </button>
      </div>
      <p className={`${s.vidro} absolute top-3 left-3 z-10 max-w-[calc(100%-80px)] rounded-full px-3 py-1.5 text-[12px] font-medium text-luar`}>{legenda}</p>
      {fundoFalhou && (
        <p className={`${s.vidro} absolute inset-x-3 bottom-10 z-10 mx-auto max-w-[360px] rounded-2xl px-3 py-1.5 text-center text-[12px] text-nevoa`}>
          As ruas do mapa não carregaram agora. O ponto continua no lugar certo.
        </p>
      )}
    </div>
  );
}
