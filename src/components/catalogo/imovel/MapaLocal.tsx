"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { PontoMapa } from "@/lib/catalogo/tipos";

/** O mapa (e a geometria dos estados) só vem quando a seção chega perto da tela. */
const MapaBrasil = dynamic(() => import("@/components/catalogo/mapa/MapaBrasil").then((m) => m.MapaBrasil), {
  ssr: false,
  loading: () => <Moldura carregando />,
});

function Moldura({ carregando = false }: { carregando?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`h-[260px] rounded-3xl border border-nevoa/20 bg-[radial-gradient(120%_90%_at_55%_40%,rgba(var(--fog-rgb),.10),transparent_72%)] ${carregando ? "animate-pulse motion-reduce:animate-none" : ""}`}
    />
  );
}

/** Mapa "mini" da página do imóvel, montado só quando a seção se aproxima da janela (500 px antes). */
export function MapaLocal({ ponto, notaPosicao }: { ponto: PontoMapa; notaPosicao: string }) {
  const ancora = useRef<HTMLDivElement>(null);
  const [perto, setPerto] = useState(false);
  useEffect(() => {
    const el = ancora.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setPerto(true);
          obs.disconnect();
        }
      },
      { rootMargin: "500px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ancora}>{perto ? <MapaBrasil variante="mini" pontos={[ponto]} notaPosicao={notaPosicao} /> : <Moldura />}</div>;
}
