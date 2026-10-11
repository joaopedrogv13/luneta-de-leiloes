"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SUBSCRIBER_AREA } from "@/content/site";

type Mode = "lente" | "mao" | "luneta";
const MODES: { id: Mode; label: string }[] = [
  { id: "lente", label: "Lente" },
  { id: "mao", label: "Luneta na mão" },
  { id: "luneta", label: "Luneta" },
];
const R = 170;


/**
 * "Por dentro, depois de assinar": a mesma lista em duas camadas. Fora do círculo, a visão do plano
 * Lente (tags e selos desfocados); dentro, a Luneta. O círculo segue o mouse com inércia (lerp .12)
 * e abre de 0 a 170px; no toque, tocar move a luneta. Botões Lente / Luneta mostram cada visão inteira.
 * As duas listas chegam prontas do servidor (props `lente` e `luneta`); aqui só vive a interação.
 */
export function LensPreviewClient({ lente, luneta }: { lente: ReactNode; luneta: ReactNode }) {
  const [mode, setMode] = useState<Mode>("mao");
  const frame = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const state = useRef({ x: 0, y: 0, tx: 0, ty: 0, r: 0, tr: 0, inside: false, init: false });

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const s = state.current;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = matchMedia("(hover: none)").matches;
    let raf = 0;
    let visible = false;
    let w = el.clientWidth;
    let h = el.clientHeight;

    const target = () => {
      // Posição de descanso: sobre o cartão do Alvo (centro no desktop, 2º cartão no celular).
      const restX = w * 0.5;
      const restY = w < 640 ? h * 0.72 : h * 0.42;
      if (!s.init) {
        s.x = restX;
        s.y = restY;
        s.init = true;
      }
      if (!s.inside) {
        s.tx = restX;
        s.ty = restY;
      }
      s.tr = mode === "luneta" ? Math.hypot(w, h) : mode === "lente" ? 0 : coarse || w < 640 ? 130 : R;
    };

    const paint = () => {
      if (top.current) top.current.style.clipPath = `circle(${s.r.toFixed(1)}px at ${s.x.toFixed(1)}px ${s.y.toFixed(1)}px)`;
      if (ring.current) {
        const show = mode === "mao" && s.r > 8;
        ring.current.style.opacity = show ? "1" : "0";
        ring.current.style.transform = `translate(${s.x - s.r}px, ${s.y - s.r}px)`;
        ring.current.style.width = ring.current.style.height = `${Math.max(0, s.r * 2)}px`;
      }
    };

    // O laço só roda enquanto a luneta se move; quando assenta, para (nada é redesenhado à toa).
    const tick = () => {
      raf = 0;
      target();
      const k = reduce ? 1 : 0.12;
      s.x += (s.tx - s.x) * k;
      s.y += (s.ty - s.y) * k;
      s.r += (s.tr - s.r) * (reduce ? 1 : 0.16);
      const settled = Math.abs(s.tx - s.x) < 0.3 && Math.abs(s.ty - s.y) < 0.3 && Math.abs(s.tr - s.r) < 0.3;
      if (settled) {
        s.x = s.tx;
        s.y = s.ty;
        s.r = s.tr;
      }
      paint();
      if (!settled && visible) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (visible && !raf) raf = requestAnimationFrame(tick);
    };

    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.type === "pointermove") return;
      const r = el.getBoundingClientRect();
      s.tx = e.clientX - r.left;
      s.ty = e.clientY - r.top;
      s.inside = true;
      kick();
    };
    // Ao sair com o mouse, a luneta volta devagar para o Alvo.
    const leave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") s.inside = false;
      kick();
    };

    // Só anima enquanto a prévia está na tela.
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (visible) kick();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    const ro = new ResizeObserver(() => {
      w = el.clientWidth;
      h = el.clientHeight;
      kick();
    });
    io.observe(el);
    ro.observe(el);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [mode]);

  const caption =
    mode === "lente"
      ? "Visão do plano Lente · tags e selos desfocados"
      : mode === "luneta"
        ? "Visão do plano Luneta · tudo nítido"
        : "Mova o mouse (ou toque) sobre a lista: dentro do círculo, o plano Luneta";

  return (
    <div id="por-dentro" data-reveal className="mt-20 sm:mt-28">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow mb-5">Por dentro, depois de assinar</p>
          <h3 className="h2 max-w-[760px]">
            Passe a luneta sobre a lista e veja o que a Lente não <em className="accent text-latao-texto">mostra</em>.
          </h3>
        </div>
        <div role="group" aria-label="Escolha a visão" className="inline-flex rounded-full border border-nevoa/25 bg-tinta p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`min-h-10 rounded-full px-4 text-[13px] font-semibold transition-colors duration-200 ${
                mode === m.id ? "bg-latao text-noite-fixa" : "text-nevoa hover:text-luar"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={frame}
        className="relative mt-8 overflow-hidden rounded-3xl border border-latao/45 bg-noite shadow-[0_40px_120px_rgba(0,0,0,.45),0_0_0_1px_rgba(201,162,77,.12)] [touch-action:pan-y] sm:mt-12 [@media(hover:hover)]:cursor-none"
      >
        <div className="flex items-center gap-3 border-b border-nevoa/15 px-4 py-3 text-xs text-nevoa sm:px-5">
          <span className="font-display text-sm font-bold text-luar">Luneta</span>
          <span className="hidden flex-1 truncate rounded-full border border-nevoa/20 bg-tinta px-3 py-1.5 sm:block">Buscar cidade, bairro ou leiloeiro</span>
          <span className="ml-auto rounded-full border border-nevoa/30 px-2.5 py-1 font-semibold tracking-[0.1em] uppercase">
            Plano {mode === "lente" ? "Lente" : "Luneta"}
          </span>
        </div>
        <div className="relative">
          {lente}
          <div ref={top} aria-hidden="true" inert className="absolute inset-0 bg-noite" style={{ clipPath: "circle(0px at 0 0)" }}>
            {luneta}
          </div>
          <div
            ref={ring}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 rounded-full border-[5px] border-latao opacity-0 shadow-[0_0_0_2px_#5A4414,0_0_60px_rgba(201,162,77,.35),inset_0_0_40px_rgba(234,240,255,.12)] transition-opacity duration-300"
          >
            <span className="absolute -top-3.5 left-1/2 h-[22px] w-[1.5px] -translate-x-1/2 bg-[#EAF0FF]" />
            <span className="absolute -bottom-3.5 left-1/2 h-[22px] w-[1.5px] -translate-x-1/2 bg-[#EAF0FF]" />
            <span className="absolute top-1/2 -left-3.5 h-[1.5px] w-[22px] -translate-y-1/2 bg-[#EAF0FF]" />
            <span className="absolute top-1/2 -right-3.5 h-[1.5px] w-[22px] -translate-y-1/2 bg-[#EAF0FF]" />
          </div>
        </div>
        <p aria-live="polite" className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-latao/40 bg-noite-fixa/85 px-3 py-2 text-xs text-[#EAF0FF] backdrop-blur-sm">
          <span aria-hidden="true" className="size-2 rounded-full bg-latao" />
          {caption}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-[640px] text-sm leading-relaxed text-nevoa">
          Fora do círculo, a visão do plano Lente: todos os leilões, fotos, mapa e filtros, com tags e selos desfocados. Dentro, a Luneta:
          cada risco com ícone e texto, e os selos Promissor, Na Mira e Alvo.
        </p>
        <Link href={SUBSCRIBER_AREA.href} className="btn-outline">
          Abrir a demonstração completa →
        </Link>
      </div>
    </div>
  );
}
