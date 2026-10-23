"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapaML, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { numero, plural } from "@/lib/catalogo/rotulos";
import { raioPixelZ0, type LugarMapa, type PontosLidos } from "@/lib/catalogo/pontos";
import type { CaixaGeo, Conjunto, Plano } from "@/lib/catalogo/tipos";
import type { CameraMapa } from "@/lib/catalogo/url";
import { CartaoLugar } from "./CartaoLugar";
import { esquecerPontos } from "./dados";
import { CAMADAS, CORES_DESAGIO, FONTES, ROTULOS_DESAGIO, ZOOM_MAX_AGRUPAMENTO, type TemaMapa } from "./estilo";
import { CAIXA_BRASIL, caixaDaTela, caixaDosLugares, geojsonDosLugares, textoPrecisao } from "./geojson";
import s from "./mapa-gl.module.css";
import { abrirMapa, seguirTema, temaDoSite, temWebGL } from "./nucleo";

/** Partes da tela cobertas por cima do mapa (a folha da lista no celular, a barra): fora da área "visível". */
export interface Folga {
  cima: number;
  baixo: number;
  esq: number;
  dir: number;
}

export interface PropsMapaGL {
  conjunto: Conjunto;
  plano: Plano;
  /** pontos dos filtros atuais (os anteriores enquanto os novos chegam); null na primeira carga */
  pontos: PontosLidos | null;
  /** os pontos na tela ainda não são os dos filtros atuais */
  carregando: boolean;
  erroPontos: boolean;
  onTentarPontos: () => void;
  /** câmera da URL (só na abertura); null = enquadra os resultados */
  camera: CameraMapa | null;
  /** muda quando os filtros de lugar ou o texto mudam: a câmera enquadra os pontos novos */
  chaveEnquadrar: string;
  folga: Folga;
  /** a câmera parou: centro e zoom (URL) e a área visível (o filtro "Buscar nesta área") */
  onMover: (camera: CameraMapa, area: CaixaGeo) => void;
  /** o imóvel sob o mouse na lista (o mapa marca o ponto dele) */
  destaque: { lat: number; lon: number } | null;
  /** ids do lugar sob o mouse no mapa (a lista acende os cartões deles); null ao sair */
  onDestaqueIds?: (ids: string[] | null) => void;
  hrefImovel: (id: string) => string;
  /** "Ver os N na lista" de um marcador de cidade (chave "UF|Cidade") */
  onFiltrarCidade: (chave: string) => void;
  /** sem WebGL (ou o contexto caiu): quem chama mostra o mapa em SVG */
  onFalhou: () => void;
  /** celular e tablet: cartão preso embaixo (sobre a folha), legenda recolhida */
  compacto: boolean;
  className?: string;
}

/** O que está aberto sobre o mapa: o cartão de um lugar (de `p`, os pontos em que o índice vale) ou a dica de um agrupamento. */
type Ativo =
  | { tipo: "lugar"; p: PontosLidos; i: number; fixo: boolean }
  | { tipo: "agrupamento"; n: number; x: number; y: number };

const ZOOM_PONTO = 16;
const semMovimento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * O mapa de verdade do catálogo (MapLibre GL JS, ladrilhos vetoriais do OpenFreeMap): todos os imóveis filtrados,
 * agrupados até o zoom 14 (o número no círculo; a cor, o deságio médio), depois cada lugar com o preço num balão; o
 * endereço aproximado nunca vira alfinete (círculo de incerteza no bairro, marcador "sem endereço exato" na cidade).
 *
 * Desempenho: os pontos entram por `setData` só quando os filtros mudam; arrastar e aproximar não passam pelo React (o
 * MapLibre desenha na GPU e agrupa no worker); o cartão preso acompanha o mapa mexendo só no `transform` dele; a área
 * visível sai uma vez por movimento (moveend), não a cada quadro.
 */
export default function MapaGL(props: PropsMapaGL) {
  const { pontos, carregando, folga, destaque, compacto } = props;
  const caixa = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaML | null>(null);
  /**
   * Quantas vezes um estilo terminou de carregar (0 = ainda não): cada mapa novo (ou estilo recarregado do zero) volta a
   * receber os pontos e o destaque, mesmo com as mesmas props.
   */
  const [pronto, setPronto] = useState(0);
  // só no navegador (o mapa nunca é desenhado no servidor: next/dynamic com ssr: false)
  const [tema, setTema] = useState<TemaMapa>(temaDoSite);
  const [fundoFalhou, setFundoFalhou] = useState(false);
  const [ativo, setAtivo] = useState<Ativo | null>(null);
  /** null = o padrão (aberta no computador, recolhida no celular) */
  const [legendaAberta, setLegendaAberta] = useState<boolean | null>(null);
  const cartaoRef = useRef<HTMLDivElement>(null);
  const idDica = useId();

  // as últimas props, para os ouvintes do mapa (criados uma vez) lerem sem recriar o mapa
  const atual = useRef(props);
  useEffect(() => {
    atual.current = props;
  });
  const pontosRef = useRef(pontos);
  const ativoRef = useRef(ativo);

  /** Põe o cartão sobre o ponto (acima, ou abaixo se não couber), sem sair do mapa. Só mexe no DOM. */
  const posicionarCartao = useCallback(() => {
    const el = cartaoRef.current;
    const mapa = mapaRef.current;
    const a = ativoRef.current;
    if (!el || !mapa || a?.tipo !== "lugar" || atual.current.compacto) return;
    const l = a.p.lugares[a.i];
    if (!l) return;
    const pt = mapa.project([l.lon, l.lat]);
    const { clientWidth: W, clientHeight: H } = mapa.getContainer();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margem = 12;
    const espaco = 24;
    const prender = (v: number, lo: number, hi: number) => Math.min(Math.max(lo, hi), Math.max(lo, v));
    const cabeAcima = pt.y - h - espaco >= margem;
    const cabeAbaixo = pt.y + espaco + h <= H - margem;
    let x: number;
    let y: number;
    if (cabeAcima || cabeAbaixo) {
      // acima do ponto (ou abaixo, perto do topo), centrado nele
      x = prender(pt.x - w / 2, margem, W - w - margem);
      y = cabeAcima ? pt.y - h - espaco : pt.y + espaco;
    } else {
      // mapa baixo: ao lado do ponto, do lado que tiver espaço
      x = pt.x + espaco + w <= W - margem ? pt.x + espaco : pt.x - espaco - w;
      x = prender(x, margem, W - w - margem);
      y = prender(pt.y - h / 2, margem, H - h - margem);
    }
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    el.style.visibility = "visible";
  }, []);
  useLayoutEffect(() => {
    ativoRef.current = ativo;
    posicionarCartao();
    // o cartão muda de altura quando os dados chegam (esqueleto → foto): reposiciona
    const el = cartaoRef.current;
    if (!el || ativo?.tipo !== "lugar") return;
    const ro = new ResizeObserver(posicionarCartao);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ativo, posicionarCartao]);

  // ---- abrir o mapa (uma vez) ----
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    if (!temWebGL()) {
      atual.current.onFalhou();
      return;
    }
    const p = atual.current;
    const inicial = pontosRef.current;
    const enquadrar = p.camera ? null : inicial ? caixaDosLugares(inicial.lugares) : CAIXA_BRASIL;
    let mapa: MapaML;
    try {
      mapa = abrirMapa(el, {
        rotulo: "Mapa dos imóveis",
        ...(p.camera ? { center: [p.camera.lon, p.camera.lat] as [number, number], zoom: p.camera.zoom } : {}),
        ...(enquadrar ? { bounds: enquadrar, fitBoundsOptions: { padding: paddingDe(p.folga, 28), maxZoom: ZOOM_PONTO } } : {}),
      });
    } catch {
      atual.current.onFalhou();
      return;
    }
    mapaRef.current = mapa;
    // medição de desempenho (scripts/prints): o roteiro liga `window.__lunetaMedir` antes de abrir a página
    if ((window as unknown as { __lunetaMedir?: boolean }).__lunetaMedir) (window as unknown as { __mapaLuneta?: MapaML }).__mapaLuneta = mapa;
    const canvas = mapa.getCanvas();
    canvas.setAttribute("aria-describedby", idDica);

    mapa.on("style.load", () => setPronto((n) => n + 1));
    mapa.on("error", (e) => {
      // ladrilhos ou fontes do OpenFreeMap fora do ar (ou bloqueados): os imóveis continuam; avisa uma vez
      const ev = e as unknown as { sourceId?: string; error?: { message?: string } };
      if (ev.sourceId === "openmaptiles" || /openfreemap|fonts\//.test(ev.error?.message ?? "")) setFundoFalhou(true);
    });
    // o contexto WebGL caiu de verdade (GPU reiniciada, memória): o mapa do Brasil em SVG no lugar. O `remove()` da
    // saída também derruba o contexto (de propósito): esse não conta
    const perdeuContexto = () => atual.current.onFalhou();
    canvas.addEventListener("webglcontextlost", perdeuContexto, { once: true });

    // a câmera parou: a URL e a área visível (uma vez por movimento)
    mapa.on("moveend", () => {
      const c = mapa.getCenter();
      const f = atual.current.folga;
      const { width, height } = mapa.getCanvas().getBoundingClientRect();
      const no = mapa.unproject([f.esq, f.cima]);
      const se = mapa.unproject([Math.max(f.esq + 1, width - f.dir), Math.max(f.cima + 1, height - f.baixo)]);
      atual.current.onMover({ lat: c.lat, lon: c.lng, zoom: mapa.getZoom() }, caixaDaTela(no.lng, se.lat, se.lng, no.lat));
    });

    // o cartão preso acompanha o mapa (só a posição dele; sem desenhar o React a cada quadro)
    mapa.on("move", () => {
      const a = ativoRef.current;
      if (a?.tipo === "lugar" && a.fixo) posicionarCartao();
    });
    // arrastar fecha o cartão de passagem (o preso fica)
    mapa.on("movestart", (e) => {
      if (!(e as { originalEvent?: Event }).originalEvent) return;
      const a = ativoRef.current;
      if (a && (a.tipo === "agrupamento" || !a.fixo)) {
        setAtivo(null);
        atual.current.onDestaqueIds?.(null);
      }
    });

    const interativas = [CAMADAS.preco, CAMADAS.ponto, CAMADAS.cidade, CAMADAS.agrupamento, CAMADAS.bairro, CAMADAS.incerteza];
    const acharFeature = (e: MapMouseEvent): MapGeoJSONFeature | null => {
      const camadas = interativas.filter((id) => mapa.getLayer(id));
      const achadas = mapa.queryRenderedFeatures(e.point, { layers: camadas });
      // o ponto de cima vence; a área de incerteza (grande) só se não houver outro
      return achadas.find((f) => f.layer.id !== CAMADAS.incerteza) ?? achadas[0] ?? null;
    };

    // ---- mouse: cartão de passagem ----
    let quadro = 0;
    let ultimo: MapMouseEvent | null = null;
    mapa.on("mousemove", (e) => {
      ultimo = e;
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        const ev = ultimo;
        if (!ev) return;
        const f = acharFeature(ev);
        mapa.getCanvas().style.cursor = f ? "pointer" : "";
        const a = ativoRef.current;
        if (a?.tipo === "lugar" && a.fixo) return;
        if (!f) {
          if (a) {
            setAtivo(null);
            atual.current.onDestaqueIds?.(null);
          }
          return;
        }
        const props = f.properties as { i?: number; n?: number; cluster?: boolean };
        if (props.cluster) {
          const n = Number(props.n);
          if (a?.tipo !== "agrupamento" || a.n !== n) setAtivo({ tipo: "agrupamento", n, x: ev.point.x, y: ev.point.y });
          return;
        }
        const i = Number(props.i);
        const p = pontosRef.current;
        if (!p?.lugares[i] || (a?.tipo === "lugar" && a.i === i && a.p === p)) return;
        setAtivo({ tipo: "lugar", p, i, fixo: false });
      });
    });
    mapa.getCanvas().addEventListener("mouseleave", () => {
      const a = ativoRef.current;
      if (a && (a.tipo === "agrupamento" || !a.fixo)) {
        setAtivo(null);
        atual.current.onDestaqueIds?.(null);
      }
    });

    // ---- clique e toque ----
    mapa.on("click", (e) => {
      const f = acharFeature(e);
      if (!f) {
        setAtivo(null);
        atual.current.onDestaqueIds?.(null);
        return;
      }
      const props = f.properties as { i?: number; cluster_id?: number; cluster?: boolean };
      const geo = f.geometry as GeoJSON.Point;
      if (props.cluster) {
        const fonte = mapa.getSource(FONTES.imoveis) as GeoJSONSource | undefined;
        fonte?.getClusterExpansionZoom(Number(props.cluster_id)).then(
          (z) => mapa.easeTo({ center: geo.coordinates as [number, number], zoom: Math.min(z + 0.25, ZOOM_MAX_AGRUPAMENTO + 1.5), duration: semMovimento() ? 0 : 450 }),
          () => undefined,
        );
        setAtivo(null);
        return;
      }
      const i = Number(props.i);
      const p = pontosRef.current;
      if (!p?.lugares[i]) return;
      setAtivo({ tipo: "lugar", p, i, fixo: true });
    });

    const pararTema = seguirTema(mapa, setTema);
    const ro = new ResizeObserver(() => mapa.resize());
    ro.observe(el);
    return () => {
      canvas.removeEventListener("webglcontextlost", perdeuContexto);
      pararTema();
      ro.disconnect();
      cancelAnimationFrame(quadro);
      mapa.remove();
      mapaRef.current = null;
      if ((window as unknown as { __mapaLuneta?: MapaML }).__mapaLuneta === mapa) delete (window as unknown as { __mapaLuneta?: MapaML }).__mapaLuneta;
    };
  }, [idDica, posicionarCartao]);

  // ---- os pontos: setData só quando mudam; enquadra quando os filtros de lugar mudam ----
  const enquadrado = useRef<string | null>(props.camera ? props.chaveEnquadrar : null);
  const { chaveEnquadrar } = props;
  useEffect(() => {
    pontosRef.current = pontos;
    const mapa = mapaRef.current;
    if (!mapa || pronto === 0 || !pontos) return;
    const fonte = mapa.getSource(FONTES.imoveis) as GeoJSONSource | undefined;
    if (!fonte) return;
    fonte.setData(dadosDe(pontos));
    if (!carregando && enquadrado.current !== chaveEnquadrar) {
      enquadrado.current = chaveEnquadrar;
      mapa.fitBounds(caixaDosLugares(pontos.lugares), {
        padding: paddingDe(atual.current.folga, 28),
        maxZoom: ZOOM_PONTO,
        duration: semMovimento() ? 0 : 700,
      });
    }
  }, [pontos, pronto, carregando, chaveEnquadrar]);

  // ---- destaques: o imóvel sob o mouse na lista (anel) e o lugar aberto no mapa (anel e a área de incerteza dele) ----
  const lugarDestaque = ativo?.tipo === "lugar" && ativo.p === pontos ? (pontos?.lugares[ativo.i] ?? null) : null;
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || pronto === 0) return;
    const fonte = mapa.getSource(FONTES.destaque) as GeoJSONSource | undefined;
    const features: GeoJSON.Feature[] = [];
    if (destaque) features.push({ type: "Feature", properties: { nv: 0, r0: 0 }, geometry: { type: "Point", coordinates: [destaque.lon, destaque.lat] } });
    if (lugarDestaque && lugarDestaque.nivel < 3) {
      const l = lugarDestaque;
      features.push({
        type: "Feature",
        properties: { nv: l.nivel, r0: l.nivel >= 1 && l.raio > 0 ? raioPixelZ0(l.raio, l.lat) : 0 },
        geometry: { type: "Point", coordinates: [l.lon, l.lat] },
      });
    }
    fonte?.setData({ type: "FeatureCollection", features });
  }, [destaque, lugarDestaque, pronto]);

  // ---- botões ----
  const zoom = (d: number) => mapaRef.current?.easeTo({ zoom: mapaRef.current.getZoom() + d, duration: semMovimento() ? 0 : 250 });
  const verBrasil = () =>
    mapaRef.current?.fitBounds(CAIXA_BRASIL, { padding: paddingDe(folga, 24), duration: semMovimento() ? 0 : 700 });
  const [localizando, setLocalizando] = useState(false);
  const minhaRegiao = () => {
    if (!navigator.geolocation) return;
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocalizando(false);
        mapaRef.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12.5, duration: semMovimento() ? 0 : 900 });
      },
      () => setLocalizando(false),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 },
    );
  };

  const fechar = useCallback(() => {
    setAtivo(null);
    atual.current.onDestaqueIds?.(null);
    mapaRef.current?.getCanvas().focus({ preventScroll: true });
  }, []);
  const verNaLista = useCallback((l: LugarMapa, cidade: string | null) => {
    const mapa = mapaRef.current;
    if (cidade) atual.current.onFiltrarCidade(cidade);
    else mapa?.easeTo({ center: [l.lon, l.lat], zoom: Math.max(mapa.getZoom(), ZOOM_PONTO + 1), duration: semMovimento() ? 0 : 500 });
    setAtivo(null);
  }, []);

  // o cartão vale para os pontos em que foi aberto (filtros novos trocam os índices: ele some)
  const lugarAtivo = ativo?.tipo === "lugar" && ativo.p === pontos ? (pontos.lugares[ativo.i] ?? null) : null;


  const cores = CORES_DESAGIO[tema];

  return (
    <div
      className={`${s.mapa} relative h-full w-full overflow-hidden ${props.className ?? ""}`}
      // créditos e escala do MapLibre acima da folha da lista (celular), sempre à vista
      style={{ "--folga-baixo": `${folga.baixo}px` } as React.CSSProperties}
      onKeyDown={(e) => {
        if (e.key === "Escape" && ativo) {
          e.stopPropagation();
          fechar();
        }
      }}
    >
      {/* o MapLibre põe `position: relative` no contêiner dele: o tamanho vem do pai absoluto */}
      <div className="absolute inset-0">
        <div ref={caixa} className="h-full w-full" />
      </div>
      <p id={idDica} className="sr-only">
        Mapa interativo dos imóveis. Use as setas para mover e as teclas mais e menos para aproximar ou afastar. A lista ao
        lado mostra os mesmos imóveis da área visível, com todos os dados.
      </p>

      {/* controles: aproximar, afastar, o Brasil inteiro, minha região */}
      <div className={`${s.controles} absolute right-3 z-10 flex flex-col gap-2`} style={{ top: folga.cima + 12 }}>
        <div className={`${s.vidro} flex flex-col overflow-hidden rounded-2xl`}>
          <button type="button" onClick={() => zoom(1)} aria-label="Aproximar" title="Aproximar" className={s.botao}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <span aria-hidden="true" className="h-px bg-nevoa/20" />
          <button type="button" onClick={() => zoom(-1)} aria-label="Afastar" title="Afastar" className={s.botao}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
          </button>
        </div>
        <button type="button" onClick={verBrasil} aria-label="Ver o Brasil inteiro" title="Ver o Brasil inteiro" className={`${s.vidro} ${s.botao} rounded-2xl`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7.5 9 5l6 2.5L20 5v11.5L15 19l-6-2.5L4 19z" />
            <path d="M9 5v11.5M15 7.5V19" />
          </svg>
        </button>
        <button type="button" onClick={minhaRegiao} aria-label="Ir para a minha região" title="Minha região" disabled={localizando} className={`${s.vidro} ${s.botao} rounded-2xl`}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className={localizando ? "animate-pulse motion-reduce:animate-none" : ""}>
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
          </svg>
        </button>
      </div>

      {/* legenda: a cor é o deságio médio; os marcadores aproximados explicados. Compacta (uma faixa) no computador; no
          celular, recolhida num botão */}
      <div className="absolute left-3 z-10 max-w-[calc(100%-24px)]" style={{ bottom: folga.baixo + 36 }}>
        {(compacto && !legendaAberta) || (!compacto && legendaAberta === false) ? (
          <button
            type="button"
            onClick={() => setLegendaAberta(true)}
            aria-expanded={false}
            className={`${s.vidro} inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-semibold text-luar pointer-fine:min-h-9`}
          >
            <span aria-hidden="true" className="flex -space-x-1">
              {cores.fundo.slice(1).map((c) => (
                <span key={c} className="size-3 rounded-full ring-1 ring-black/15" style={{ background: c }} />
              ))}
            </span>
            Legenda
          </button>
        ) : (
          <div className={`${s.vidro} rounded-2xl px-3 py-2 text-[11.5px] leading-snug text-nevoa`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-luar">Deságio médio</span>
              {ROTULOS_DESAGIO.map((r, k) => (
                <span key={r} className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full ring-1 ring-black/15" style={{ background: cores.fundo[k] }} />
                  {r}
                </span>
              ))}
              <button
                type="button"
                onClick={() => setLegendaAberta(false)}
                aria-expanded
                className="ml-auto inline-flex min-h-8 items-center px-1 text-[11.5px] font-semibold text-latao-texto hover:underline"
              >
                Esconder
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 shrink-0 rounded-full border-2" style={{ borderColor: cores.fundo[3], background: cores.cidadeFundo }} />
                Sem endereço exato: no centro da cidade
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-3 shrink-0 rounded-full border" style={{ borderColor: cores.fundo[3], background: `${cores.fundo[3]}40` }} />
                Só o bairro: em algum ponto do círculo
              </span>
            </div>
          </div>
        )}
      </div>

      {/* avisos: as ruas não carregaram, os pontos carregando ou com erro */}
      <div className="pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-2 px-4" style={{ bottom: folga.baixo + (compacto ? 84 : 104) }}>
        {fundoFalhou && (
          <p className={`${s.vidro} max-w-[440px] rounded-2xl px-3.5 py-1.5 text-center text-[12.5px] text-nevoa`}>
            As ruas do mapa não carregaram agora. Os imóveis continuam no lugar certo.
          </p>
        )}
        {props.erroPontos ? (
          <button type="button" onClick={props.onTentarPontos} className={`${s.vidro} pointer-events-auto min-h-11 rounded-full px-4 text-[13px] font-medium text-luar`}>
            Os imóveis do mapa não carregaram · Tentar de novo
          </button>
        ) : carregando || !pontos ? (
          <p role="status" className={`${s.vidro} inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium text-nevoa`}>
            <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-nevoa/30 border-t-latao motion-reduce:animate-none" />
            {pontos ? "Atualizando o mapa…" : "Carregando os imóveis no mapa…"}
          </p>
        ) : null}
      </div>
      <p className="sr-only" role="status">
        {pontos && !carregando ? `${plural(pontos.total, "imóvel", "imóveis")} no mapa${pontos.semPonto ? `; ${numero(pontos.semPonto)} sem posição ficam só na lista` : ""}.` : ""}
      </p>

      {/* cartão: de passagem (mouse) ou preso (clique, toque) */}
      {ativo?.tipo === "agrupamento" && !compacto && (
        <div className="pointer-events-none absolute z-20" style={{ left: ativo.x, top: ativo.y - 26, transform: "translate(-50%, -100%)" }}>
          <p className={`${s.vidro} rounded-xl px-3 py-1.5 text-[12.5px] whitespace-nowrap text-luar`}>
            <strong className="font-semibold tabular-nums">{plural(ativo.n, "imóvel", "imóveis")}</strong>
            <span className="text-nevoa"> · clique para aproximar</span>
          </p>
        </div>
      )}
      {lugarAtivo && ativo?.tipo === "lugar" && pontos && (
        <div
          ref={cartaoRef}
          // no computador, a posição sai de posicionarCartao (escondido até lá, para não piscar no canto)
          className={compacto ? "absolute inset-x-3 z-20 mx-auto max-w-[420px]" : "invisible absolute top-0 left-0 z-20 w-[300px] will-change-transform"}
          style={compacto ? { bottom: folga.baixo + 12 } : undefined}
          role="group"
          aria-label={`${plural(lugarAtivo.n, "imóvel", "imóveis")}: ${textoPrecisao(lugarAtivo)}`}
        >
          <CartaoLugar
            key={`${pontos.conjunto}-${lugarAtivo.i}`}
            lugar={lugarAtivo}
            pontos={pontos}
            conjunto={props.conjunto}
            plano={props.plano}
            hrefImovel={props.hrefImovel}
            fixo={ativo.fixo}
            onFechar={fechar}
            onVerNaLista={(cidade) => verNaLista(lugarAtivo, cidade)}
            onIdsCarregados={props.onDestaqueIds}
            onVersaoAntiga={() => {
              esquecerPontos();
              props.onTentarPontos();
            }}
          />
        </div>
      )}
    </div>
  );
}

/** O GeoJSON de cada conjunto de pontos é montado uma vez (voltar a um filtro já visto não remonta). */
const dadosGuardados = new WeakMap<PontosLidos, GeoJSON.FeatureCollection>();
function dadosDe(p: PontosLidos): GeoJSON.FeatureCollection {
  let d = dadosGuardados.get(p);
  if (!d) {
    d = geojsonDosLugares(p);
    dadosGuardados.set(p, d);
  }
  return d;
}

/** Folga do enquadramento: a linha de "Buscar ao mover" em cima, a legenda embaixo e os botões à direita. */
function paddingDe(f: Folga, extra: number) {
  return { top: f.cima + extra + 52, bottom: f.baixo + extra + (f.baixo > 0 ? 40 : 84), left: f.esq + extra, right: f.dir + extra + 52 };
}
