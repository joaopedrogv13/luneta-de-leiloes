"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  CAIXA_BRASIL,
  ZOOM_MAX,
  ZOOM_MIN,
  clamp,
  escala,
  interpolar,
  limitar,
  mesmaCamera,
  moverPx,
  paraMundo,
  zoomNoPonto,
  type Camera,
  type Folga,
  type Tela,
} from "./geometria";

export type Aviso = "ctrl" | "dois-dedos";

export interface OpcoesCamera {
  /** folgas (controles, legenda) pelo tamanho da tela; função estável (definida fora do componente) */
  folga: (largura: number, altura: number) => Folga;
  rolagem: "direta" | "ctrl";
  /**
   * Escreve um quadro no DOM sem passar pelo React: o transform do mapa e o da camada das bolhas
   * (relativo à câmera comprometida, a que o React desenhou por último).
   */
  aplicar: (vivo: Camera, comprometida: Camera, tela: Tela) => void;
  /** a pessoa mexeu no mapa (arrastar, roda, pinça, duplo clique, teclado, botões) */
  aoInteragir: () => void;
  /** a câmera vai se mover: o cartão aberto fecha */
  aoMover: () => void;
  aoAvisar: (aviso: Aviso) => void;
}

export interface OpcoesIr {
  animar?: boolean;
  /** ms (padrão 300) */
  duracao?: number;
  /** movimento pedido pela pessoa (desliga o enquadramento automático) */
  usuario?: boolean;
}

const INICIAL: Camera = { z: 1, cx: (CAIXA_BRASIL[0] + CAIXA_BRASIL[2]) / 2, cy: (CAIXA_BRASIL[1] + CAIXA_BRASIL[3]) / 2 };
const DURACAO = 300;
/** px que o ponteiro anda antes de virar arrasto (abaixo disso é clique) */
const LIMIAR_ARRASTO = 4;
const LIMIAR_TOQUE = 8;

const reduzMovimento = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const suave = (p: number) => 1 - Math.pow(1 - p, 3);

/**
 * Câmera do mapa: tamanho da tela, zoom/arrasto/pinça/roda/duplo clique e animações.
 *
 * Durante um gesto ou animação, cada quadro só escreve transforms no DOM (`aplicar`); o React desenha
 * de novo (e o agrupamento é recalculado) só no fim, quando a câmera é "comprometida" no estado.
 */
export function useCameraMapa(viewport: RefObject<HTMLDivElement | null>, opcoes: OpcoesCamera) {
  const [tela, setTela] = useState<Tela | null>(null);
  const [camera, setCamera] = useState<Camera>(INICIAL);

  const op = useRef(opcoes);
  useLayoutEffect(() => {
    op.current = opcoes;
  });

  const telaRef = useRef<Tela | null>(null);
  const vivo = useRef<Camera>(INICIAL);
  const comprometida = useRef<Camera>(INICIAL);
  const anim = useRef<{ raf: number; destino: Camera } | null>(null);

  const aplicarAgora = useCallback(() => {
    const t = telaRef.current;
    if (t) op.current.aplicar(vivo.current, comprometida.current, t);
  }, []);

  const cancelar = useCallback(() => {
    if (anim.current) cancelAnimationFrame(anim.current.raf);
    anim.current = null;
  }, []);

  const comprometer = useCallback(() => {
    const c = { ...vivo.current };
    setCamera((atual) => (mesmaCamera(atual, c) ? atual : c));
  }, []);

  // Depois de cada desenho do React: as posições na tela já são as da câmera nova, então a camada
  // das bolhas volta ao transform neutro (ou ao delta de um gesto que continua).
  useLayoutEffect(() => {
    comprometida.current = camera;
    aplicarAgora();
  }, [camera, tela, aplicarAgora]);

  // Tamanho da tela: medido antes da primeira pintura e a cada mudança.
  const calcularFolga = opcoes.folga;
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const medir = (w: number, h: number) => {
      if (w < 8 || h < 8) return;
      const antes = telaRef.current;
      if (antes && Math.abs(antes.w - w) < 0.5 && Math.abs(antes.h - h) < 0.5) return;
      const nova: Tela = { w, h, folga: calcularFolga(w, h) };
      telaRef.current = nova;
      cancelar();
      vivo.current = limitar(vivo.current, nova);
      setTela(nova);
      setCamera({ ...vivo.current });
    };
    const r = el.getBoundingClientRect();
    medir(r.width, r.height);
    const ro = new ResizeObserver(([entrada]) => medir(entrada.contentRect.width, entrada.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewport, calcularFolga, cancelar]);

  /** Leva a câmera até `alvo` (limitado), animando ~300 ms; sem animação com "reduzir movimento". */
  const irPara = useCallback(
    (alvo: Camera, o: OpcoesIr = {}) => {
      const t = telaRef.current;
      if (o.usuario) op.current.aoInteragir();
      if (!t) {
        vivo.current = alvo;
        setCamera(alvo);
        return;
      }
      cancelar();
      const destino = limitar(alvo, t);
      const de = { ...vivo.current };
      if (mesmaCamera(de, destino)) {
        comprometer();
        return;
      }
      op.current.aoMover();
      if (o.animar === false || reduzMovimento()) {
        vivo.current = destino;
        aplicarAgora();
        comprometer();
        return;
      }
      const duracao = o.duracao ?? DURACAO;
      const t0 = performance.now();
      const passo = (agora: number) => {
        const p = Math.min(1, (agora - t0) / duracao);
        vivo.current = p >= 1 ? destino : limitar(interpolar(de, destino, suave(p)), t);
        aplicarAgora();
        if (p < 1) {
          anim.current = { raf: requestAnimationFrame(passo), destino };
        } else {
          anim.current = null;
          comprometer();
        }
      };
      anim.current = { raf: requestAnimationFrame(passo), destino };
    },
    [aplicarAgora, cancelar, comprometer],
  );

  /** Para onde a câmera está indo (o destino da animação em curso, ou onde está). */
  const base = useCallback(() => anim.current?.destino ?? vivo.current, []);

  const centroUtil = useCallback((t: Tela): [number, number] => {
    const { esq: e, dir: d, cima: c, baixo: b } = t.folga;
    return [e + (t.w - e - d) / 2, c + (t.h - c - b) / 2];
  }, []);

  /** Zoom pedido pela pessoa (botões, teclado, duplo clique), animado, mantendo `ancora` parada. */
  const zoomPor = useCallback(
    (fator: number, ancora?: [number, number]) => {
      const t = telaRef.current;
      if (!t) return;
      const [ax, ay] = ancora ?? centroUtil(t);
      // o zoom parte do destino da animação em curso (cliques rápidos acumulam); a âncora, de onde está
      const z = clamp(base().z * fator, ZOOM_MIN, ZOOM_MAX);
      irPara(zoomNoPonto(vivo.current, t, z / vivo.current.z, ax, ay), { usuario: true, duracao: 260 });
    },
    [base, centroUtil, irPara],
  );

  /** Move pelo teclado (px de tela), animado. */
  const moverPor = useCallback(
    (dx: number, dy: number) => {
      const t = telaRef.current;
      if (!t) return;
      irPara(moverPx(base(), t, dx, dy), { usuario: true, duracao: 200 });
    },
    [base, irPara],
  );

  // Gestos: roda, arrasto (mouse/caneta), toque (um dedo arrasta; dois dedos fazem pinça), duplo clique.
  const { rolagem } = opcoes;
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    // Clique que o navegador gera ao soltar um arrasto (mouse): não é clique de verdade. Janela curta em vez
    // de "o próximo clique": depois de arrastar ou pinçar no toque o navegador não gera clique nenhum, e o
    // primeiro toque seguinte numa bolha era engolido.
    let suprimirAte = 0;
    const suprimirClique = () => {
      suprimirAte = performance.now() + 250;
    };
    let ultimoToqueEm = 0;

    const local = (cx: number, cy: number): [number, number] => {
      const r = el.getBoundingClientRect();
      return [cx - r.left, cy - r.top];
    };
    const naBolha = (alvo: EventTarget | null) => alvo instanceof Element && !!alvo.closest("[data-no]");

    // ---- roda ----
    const onWheel = (e: WheelEvent) => {
      const t = telaRef.current;
      if (!t) return;
      if (rolagem === "ctrl" && !e.ctrlKey && !e.metaKey) {
        op.current.aoAvisar("ctrl");
        return;
      }
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= t.h;
      // A pinça do trackpad chega como roda com ctrl e passos pequenos (precisa de um ganho maior). Ctrl +
      // roda do mouse (o gesto pedido no modo "ctrl") vem em passos de ~100: ganho normal, ~1,4× por clique.
      const pinca = e.ctrlKey && Math.abs(dy) < 50;
      const fator = Math.exp(-clamp(dy, -150, 150) * (pinca ? 0.012 : 0.0035));
      const [ax, ay] = local(e.clientX, e.clientY);
      const de = base();
      const z = clamp(de.z * fator, ZOOM_MIN, ZOOM_MAX);
      if (Math.abs(z - de.z) < 1e-4) return;
      irPara(zoomNoPonto(vivo.current, t, z / vivo.current.z, ax, ay), { usuario: true, duracao: 180 });
    };

    // ---- arrasto com mouse/caneta ----
    let arrasto: { id: number; x0: number; y0: number; cam0: Camera; ativo: boolean } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      suprimirAte = 0;
      arrasto = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cam0: vivo.current, ativo: false };
    };
    const onPointerMove = (e: PointerEvent) => {
      const t = telaRef.current;
      if (!arrasto || e.pointerId !== arrasto.id || !t) return;
      const dx = e.clientX - arrasto.x0;
      const dy = e.clientY - arrasto.y0;
      if (!arrasto.ativo) {
        if (Math.hypot(dx, dy) < LIMIAR_ARRASTO) return;
        arrasto.ativo = true;
        el.setPointerCapture(e.pointerId);
        cancelar();
        arrasto.cam0 = { ...vivo.current };
        el.dataset.arrastando = "";
        op.current.aoInteragir();
        op.current.aoMover();
      }
      vivo.current = moverPx(arrasto.cam0, t, dx, dy);
      aplicarAgora();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!arrasto || e.pointerId !== arrasto.id) return;
      if (arrasto.ativo) {
        suprimirClique();
        delete el.dataset.arrastando;
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
        comprometer();
      }
      arrasto = null;
    };
    const onClickCaptura = (e: MouseEvent) => {
      if (performance.now() > suprimirAte) return;
      suprimirAte = 0;
      e.stopPropagation();
      e.preventDefault();
    };

    // ---- toque ----
    const toques = new Map<number, [number, number]>();
    let pinca: { d0: number; w0: [number, number]; cam0: Camera } | null = null;
    let umDedo: { x0: number; y0: number; cam0: Camera; moveu: boolean; avisou: boolean } | null = null;
    let houveGesto = false;
    let ultimoTap: { t: number; x: number; y: number } | null = null;

    const dois = () => {
      const [a, b] = [...toques.values()];
      return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number] };
    };
    const comecarPinca = () => {
      const t = telaRef.current;
      if (!t) return;
      const { d, m } = dois();
      cancelar();
      pinca = { d0: Math.max(1, d), w0: paraMundo(m[0], m[1], vivo.current, t), cam0: { ...vivo.current } };
      umDedo = null;
      if (!houveGesto) {
        houveGesto = true;
        op.current.aoInteragir();
        op.current.aoMover();
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      ultimoToqueEm = performance.now();
      for (const tc of Array.from(e.changedTouches)) toques.set(tc.identifier, local(tc.clientX, tc.clientY));
      if (toques.size >= 2) comecarPinca();
      else if (toques.size === 1) {
        const [x, y] = [...toques.values()][0];
        umDedo = { x0: x, y0: y, cam0: vivo.current, moveu: false, avisou: false };
        houveGesto = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = telaRef.current;
      if (!t) return;
      for (const tc of Array.from(e.changedTouches)) if (toques.has(tc.identifier)) toques.set(tc.identifier, local(tc.clientX, tc.clientY));
      if (pinca && toques.size >= 2) {
        if (!e.cancelable) return; // o navegador já começou a rolar a página
        e.preventDefault();
        const { d, m } = dois();
        const z = clamp((pinca.cam0.z * d) / pinca.d0, ZOOM_MIN, ZOOM_MAX);
        const s = escala({ ...pinca.cam0, z }, t);
        vivo.current = limitar({ z, cx: pinca.w0[0] - (m[0] - t.w / 2) / s, cy: pinca.w0[1] - (m[1] - t.h / 2) / s }, t);
        aplicarAgora();
        return;
      }
      if (!umDedo || toques.size !== 1) return;
      const [x, y] = [...toques.values()][0];
      const dx = x - umDedo.x0;
      const dy = y - umDedo.y0;
      if (rolagem === "ctrl") {
        // mapa no meio da página: um dedo rola a página; dois dedos mexem no mapa
        if (!umDedo.avisou && Math.hypot(dx, dy) > 14) {
          umDedo.avisou = true;
          op.current.aoAvisar("dois-dedos");
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      if (!umDedo.moveu) {
        if (Math.hypot(dx, dy) < LIMIAR_TOQUE) return;
        umDedo.moveu = true;
        cancelar();
        umDedo.cam0 = { ...vivo.current };
        umDedo.x0 = x;
        umDedo.y0 = y;
        if (!houveGesto) {
          houveGesto = true;
          op.current.aoInteragir();
          op.current.aoMover();
        }
        return;
      }
      vivo.current = moverPx(umDedo.cam0, t, dx, dy);
      aplicarAgora();
    };
    const onTouchEnd = (e: TouchEvent) => {
      ultimoToqueEm = performance.now();
      const fim = Array.from(e.changedTouches);
      const ultimo = fim.length ? toques.get(fim[0].identifier) : undefined;
      for (const tc of fim) toques.delete(tc.identifier);
      if (pinca) {
        if (toques.size >= 2) {
          comecarPinca();
          return;
        }
        pinca = null;
        if (toques.size === 1 && rolagem === "direta") {
          // sobrou um dedo: continua arrastando a partir dele
          const [x, y] = [...toques.values()][0];
          umDedo = { x0: x, y0: y, cam0: { ...vivo.current }, moveu: true, avisou: true };
          return;
        }
      }
      if (toques.size > 0) return;
      const tap = umDedo && !umDedo.moveu && !houveGesto;
      umDedo = null;
      if (houveGesto) {
        houveGesto = false;
        suprimirClique();
        comprometer();
        return;
      }
      // dois toques rápidos fora das bolhas: aproxima ali
      if (tap && ultimo && !naBolha(e.target)) {
        const agora = performance.now();
        if (ultimoTap && agora - ultimoTap.t < 320 && Math.hypot(ultimo[0] - ultimoTap.x, ultimo[1] - ultimoTap.y) < 32) {
          ultimoTap = null;
          if (e.cancelable) e.preventDefault();
          zoomPor(2, ultimo);
        } else {
          ultimoTap = { t: agora, x: ultimo[0], y: ultimo[1] };
        }
      }
    };

    // ---- duplo clique (mouse) ----
    const onDblClick = (e: MouseEvent) => {
      if (performance.now() - ultimoToqueEm < 800 || naBolha(e.target)) return;
      e.preventDefault();
      zoomPor(e.shiftKey ? 0.5 : 2, local(e.clientX, e.clientY));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("click", onClickCaptura, true);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    el.addEventListener("touchcancel", onTouchEnd, { passive: false });
    el.addEventListener("dblclick", onDblClick);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("click", onClickCaptura, true);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("dblclick", onDblClick);
    };
  }, [viewport, rolagem, aplicarAgora, base, cancelar, comprometer, irPara, zoomPor]);

  useEffect(() => cancelar, [cancelar]);

  return { tela, camera, irPara, zoomPor, moverPor };
}
