"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { numero, plural } from "@/lib/catalogo/rotulos";
import type { CaixaGeo, Conjunto, Filtros, Plano } from "@/lib/catalogo/tipos";
import type { CameraMapa } from "@/lib/catalogo/url";
import type { LojaDestaque } from "../app/hooks";
import { usePontos } from "./dados";
import { mesmaArea } from "./geojson";
import type { Folga } from "./MapaGL";
import s from "./mapa-gl.module.css";
import { temWebGL } from "./webgl";

/** O MapLibre (~280 KB comprimidos) só é baixado quando a vista de mapa abre: nunca na lista nem na landing. */
const carregarMapaGL = () => import("./MapaGL");
const MapaGL = dynamic(carregarMapaGL, { ssr: false, loading: () => <Espera /> });

function Espera() {
  return (
    <div className={`${s.mapa} grid h-full w-full place-items-center`}>
      <p role="status" className="inline-flex items-center gap-2 text-[13px] text-nevoa">
        <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-nevoa/30 border-t-latao motion-reduce:animate-none" />
        Abrindo o mapa…
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Buscar ao mover o mapa": preferência de cada pessoa neste navegador (ligada por padrão)
// ---------------------------------------------------------------------------

const CHAVE_AO_MOVER = "luneta-mapa-ao-mover";
const ouvintes = new Set<() => void>();
let emMemoria: boolean | null = null;
function lerAoMover(): boolean {
  if (emMemoria !== null) return emMemoria;
  try {
    return window.localStorage.getItem(CHAVE_AO_MOVER) !== "0";
  } catch {
    return true;
  }
}
function guardarAoMover(v: boolean) {
  emMemoria = v;
  try {
    window.localStorage.setItem(CHAVE_AO_MOVER, v ? "1" : "0");
  } catch {
    // sem armazenamento: vale nesta visita
  }
  ouvintes.forEach((f) => f());
}
function useAoMover(): boolean {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    lerAoMover,
    () => true,
  );
}

/** Espera depois que a câmera para, antes de buscar a área: aproximar com a roda dá vários "parou" seguidos. */
const ESPERA_AREA = 280;

/** O WebGL do navegador não muda durante a visita: nada a assinar (useSyncExternalStore só lê, no navegador). */
const semAvisos = () => () => {};

/**
 * A vista de mapa do catálogo, sem o MapLibre (este módulo entra no app; o mapa vem sob demanda): pede os pontos de
 * todos os imóveis filtrados (em paralelo com o código do mapa), liga a lista ao mapa ("Buscar ao mover o mapa", com
 * a chave para desligar e o botão "Buscar nesta área") e cai para o mapa do Brasil em SVG quando não há WebGL.
 */
export function Explorar({
  conjunto,
  plano,
  filtros,
  camera,
  cameraRestaurada,
  folga,
  compacto,
  loja,
  hrefImovel,
  onCamera,
  onArea,
  onFiltrarCidade,
  onFalhou,
  totalLista,
}: {
  conjunto: Conjunto;
  plano: Plano;
  /** os filtros da busca (com a área do mapa, se houver) */
  filtros: Filtros;
  /** câmera da URL (só na abertura) */
  camera: CameraMapa | null;
  /** voltar/avançar no navegador: a câmera daquela entrada (o mapa aberto pula para ela) */
  cameraRestaurada?: CameraMapa | null;
  folga: Folga;
  compacto: boolean;
  loja: LojaDestaque;
  hrefImovel: (id: string) => string;
  /** a câmera parou (vai para a URL) */
  onCamera: (c: CameraMapa) => void;
  /** a lista passa a mostrar só esta área (null: a busca inteira) */
  onArea: (area: CaixaGeo | null) => void;
  onFiltrarCidade: (chave: string) => void;
  onFalhou: () => void;
  /** imóveis na lista agora (com a área) */
  totalLista: number | null;
}) {
  const { pontos, carregando, erro, tentarDeNovo } = usePontos(conjunto, filtros, plano, true);
  const aoMover = useAoMover();
  const destaque = useSyncExternalStore(
    loja.assinar,
    () => loja.imovel,
    () => null,
  );

  /**
   * O navegador desenha WebGL? (null: ainda não perguntado; só no navegador). O mapa só é desenhado (e o código dele,
   * ~290 KB comprimidos, só é baixado) depois do sim; sem WebGL, quem chama mostra o mapa do Brasil em SVG.
   */
  const comGL = useSyncExternalStore(semAvisos, temWebGL, () => null);
  const falhou = useRef(onFalhou);
  useEffect(() => {
    falhou.current = onFalhou;
  });
  useEffect(() => {
    if (comGL === false) falhou.current();
    // baixa o código do mapa já (junto com os pontos, não depois deles)
    else if (comGL) void carregarMapaGL();
  }, [comGL]);

  const ultimaArea = useRef<CaixaGeo | null>(null);
  const espera = useRef(0);
  const [movido, setMovido] = useState(false);
  const atual = useRef({ aoMover, area: filtros.bbox, onArea, onCamera });
  useEffect(() => {
    atual.current = { aoMover, area: filtros.bbox, onArea, onCamera };
  });
  useEffect(() => () => window.clearTimeout(espera.current), []);

  const onMover = useCallback((c: CameraMapa, area: CaixaGeo, daPessoa: boolean) => {
    atual.current.onCamera(c);
    ultimaArea.current = area;
    // o enquadramento automático (abrir, lugar novo, voltar no histórico, tela que muda) não muda a lista: ele corta as
    // pontas dos resultados (e, no celular, parte do Brasil). Só o movimento da pessoa vira a área (movimentoDaPessoa).
    if (!daPessoa) return;
    window.clearTimeout(espera.current);
    if (atual.current.aoMover) {
      espera.current = window.setTimeout(() => {
        if (!mesmaArea(area, atual.current.area)) atual.current.onArea(area);
      }, ESPERA_AREA);
    } else {
      setMovido(!mesmaArea(area, atual.current.area));
    }
  }, []);

  const alternarAoMover = () => {
    const novo = !aoMover;
    guardarAoMover(novo);
    // ligou: a lista passa a seguir o mapa já
    if (novo && ultimaArea.current) onArea(ultimaArea.current);
    setMovido(false);
  };
  const buscarAqui = () => {
    if (ultimaArea.current) onArea(ultimaArea.current);
    setMovido(false);
  };

  const chaveEnquadrar = JSON.stringify([filtros.uf, filtros.cidade, filtros.bairro, filtros.q]);
  const onDestaqueIds = useCallback((ids: string[] | null) => loja.definirIdsDoMapa(ids), [loja]);

  return (
    <div id="mapa-explorar" className="relative h-full w-full">
      {!comGL ? (
        <Espera />
      ) : (
        <MapaGL
          conjunto={conjunto}
          plano={plano}
          pontos={pontos}
          carregando={carregando}
          erroPontos={erro}
          onTentarPontos={tentarDeNovo}
          camera={camera}
          areaInicial={filtros.bbox ?? null}
          cameraRestaurada={cameraRestaurada ?? null}
          chaveEnquadrar={chaveEnquadrar}
          folga={folga}
          onMover={onMover}
          destaque={destaque}
          onDestaqueIds={onDestaqueIds}
          hrefImovel={hrefImovel}
          onFiltrarCidade={onFiltrarCidade}
          onFalhou={onFalhou}
          compacto={compacto}
        />
      )}

      {/* "Buscar ao mover o mapa" (ligado por padrão) e, desligado, "Buscar nesta área" depois de mexer */}
      <div className="pointer-events-none absolute left-3 z-10 flex max-w-[calc(100%-80px)] flex-wrap items-center gap-2" style={{ top: folga.cima + 12 }}>
        <button
          type="button"
          role="switch"
          aria-checked={aoMover}
          onClick={alternarAoMover}
          className={`${s.vidro} pointer-events-auto inline-flex min-h-11 items-center gap-2.5 rounded-full pr-3.5 pl-2.5 text-[13px] font-semibold text-luar pointer-fine:min-h-10`}
        >
          <span aria-hidden="true" className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors duration-150 ${aoMover ? "bg-latao" : "bg-nevoa/35"}`}>
            <span className={`size-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-luneta motion-reduce:transition-none ${aoMover ? "translate-x-4" : ""}`} />
          </span>
          Buscar ao mover o mapa
        </button>
        {!aoMover && movido && (
          <button
            type="button"
            onClick={buscarAqui}
            className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-latao px-4 text-[13px] font-semibold text-noite-fixa shadow-lg pointer-fine:min-h-10"
          >
            Buscar nesta área
          </button>
        )}
        {!aoMover && filtros.bbox && (
          <button
            type="button"
            onClick={() => onArea(null)}
            className={`${s.vidro} pointer-events-auto inline-flex min-h-11 items-center rounded-full px-3.5 text-[13px] font-medium text-nevoa hover:text-luar pointer-fine:min-h-10`}
          >
            Ver a busca inteira{pontos ? ` (${numero(pontos.total + pontos.semPonto)})` : ""}
          </button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {totalLista !== null && filtros.bbox ? `${plural(totalLista, "imóvel", "imóveis")} na área do mapa` : ""}
      </p>
    </div>
  );
}
