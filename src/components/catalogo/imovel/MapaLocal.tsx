"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { nivelDaPrecisao } from "@/lib/catalogo/pontos";
import type { PontoMapa, PrecisaoGeo } from "@/lib/catalogo/tipos";
import { temWebGL } from "@/components/catalogo/mapa-gl/webgl";

function Moldura({ carregando = false }: { carregando?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`h-[300px] rounded-3xl border border-nevoa/20 bg-[radial-gradient(120%_90%_at_55%_40%,rgba(var(--fog-rgb),.10),transparent_72%)] sm:h-[320px] ${carregando ? "animate-pulse motion-reduce:animate-none" : ""}`}
    />
  );
}

/** O mapa de verdade (MapLibre + OpenFreeMap): o código só vem quando a seção chega perto da tela. */
const MapaLocalGL = dynamic(() => import("@/components/catalogo/mapa-gl/MapaLocalGL"), {
  ssr: false,
  loading: () => <Moldura carregando />,
});
/** Sem WebGL: o mapa do Brasil em SVG (o de antes), com a cidade marcada. */
const MapaBrasil = dynamic(() => import("@/components/catalogo/mapa/MapaBrasil").then((m) => m.MapaBrasil), {
  ssr: false,
  loading: () => <Moldura carregando />,
});

/**
 * Mapa da página do imóvel, montado só quando a seção se aproxima da janela (500 px antes): o mapa de verdade, com o
 * ponto e a incerteza conforme a precisão; sem WebGL (ou se o contexto cair), o mapa do Brasil em SVG.
 */
export function MapaLocal({
  ponto,
  notaPosicao,
  precisao,
  raio,
}: {
  ponto: PontoMapa;
  notaPosicao: string;
  precisao: PrecisaoGeo | null;
  /** desvio do ponto (m), quando a base tem; senão o padrão da precisão */
  raio: number | null;
}) {
  const ancora = useRef<HTMLDivElement>(null);
  const [perto, setPerto] = useState(false);
  const [semGL, setSemGL] = useState(false);
  useEffect(() => {
    const el = ancora.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          // decide aqui (no navegador) se dá para usar WebGL: sem ele, nem baixa o MapLibre
          if (!temWebGL()) setSemGL(true);
          setPerto(true);
          obs.disconnect();
        }
      },
      { rootMargin: "500px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ancora}>
      {!perto ? (
        <Moldura />
      ) : semGL ? (
        <MapaBrasil variante="mini" pontos={[ponto]} notaPosicao={notaPosicao} />
      ) : (
        <MapaLocalGL
          lat={ponto.lat}
          lon={ponto.lon}
          nivel={nivelDaPrecisao(precisao)}
          raio={raio}
          lance={ponto.lanceMin}
          desagio={ponto.desagioMax}
          legenda={notaPosicao}
          onFalhou={() => setSemGL(true)}
        />
      )}
    </div>
  );
}
