"use client";

import { useEffect } from "react";
import { BRAZIL_PINS } from "@/lib/brazil";
import { whenIdle } from "@/lib/idle";
import { ALVO_DESAGIO, CTA_GLOW } from "./constants";

type Gsap = typeof import("gsap").gsap;
type Timeline = ReturnType<Gsap["timeline"]>;

const [SP_X, SP_Y] = BRAZIL_PINS.sp;

/** Velocidade da intro: 1 ≈ 2,7s; 1.1 ≈ 2,5s. */
const SPEED = 1.1;
/** Até quantos px de rolagem ainda contamos como "no topo". */
const TOP_SLACK = 40;
/** Fim do gesto: a página só destrava depois deste tempo sem rolagem (absorve a inércia do trackpad). */
const QUIET_MS = 220;
const FORWARD_KEYS = new Set(["ArrowDown", "PageDown", " ", "Spacebar", "End"]);
const SCROLL_KEYS = new Set([...FORWARD_KEYS, "ArrowUp", "PageUp", "Home"]);

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * Ilha cliente do hero (a marcação vem do servidor, em HeroScene).
 *
 * Intro de UMA rolada: no topo da página, o primeiro gesto para baixo (dois dedos no trackpad, roda do
 * mouse, deslizar no celular, ↓ / PageDown / espaço) dispara a animação inteira, com tempo fixo e suave.
 * Enquanto ela roda, a página fica parada (os eventos de rolagem são absorvidos) e só destrava quando a
 * animação termina E o gesto acabou, para a inércia do trackpad não arremessar a página para a seção
 * seguinte. Esc pula para o fim. Se a página rolar por outro caminho (link do menu, barra de rolagem,
 * Tab), a cena vai direto para o estado final.
 *
 * Desempenho: só transform e opacity animam. O desfoque do mapa e dos "sites" é feito trocando a
 * opacidade de duas camadas (desfocada estática × nítida) e o brilho de luar é uma camada própria.
 */
export function HeroMotion() {
  useEffect(() => {
    const el = document.getElementById("topo");
    if (!el || !document.documentElement.classList.contains("motion")) return;

    let gsapPromise: Promise<Gsap> | undefined;
    let ctx: { revert: () => void } | undefined;
    let tl: Timeline | undefined;
    let builtFor = ""; // tamanho da cena quando o timeline foi montado
    let started = false; // o gesto já disparou (ou a cena foi finalizada)
    let animDone = false;
    let locked = false;
    let lastInput = 0;
    let releaseTimer = 0;
    let touchY: number | null = null;
    let cancelled = false;

    const loadGsap = () => (gsapPromise ??= import("gsap").then((m) => m.gsap));

    const sizeKey = () => `${el.clientWidth}x${el.clientHeight}`;
    const build = (gsap: Gsap) => {
      if (tl && builtFor === sizeKey()) return tl;
      // montado antes com outro tamanho de tela (ex.: janela redimensionada): remonta com as medidas atuais
      ctx?.revert();
      tl = undefined;
      builtFor = sizeKey();
      ctx = gsap.context(() => {
        const q = gsap.utils.selector(el);
        const stage = q("[data-h=stage]")[0] as HTMLElement;
        const map = q("[data-h=map]")[0] as HTMLElement;
        const counter = q("[data-h=count]")[0] as HTMLElement;
        const scope = q("[data-h=scope]");
        const lens = q("[data-h=lens]");
        const reticle = q("[data-h=reticle]");
        const cta = q("[data-h=cta]");
        const narrow = stage.clientWidth < 640;
        const num = { v: 0 };
        counter.textContent = "0";

        // Mesma posição "ao longe" que o CSS da etapa 1 (html.motion) já mostra.
        gsap.set(scope, {
          xPercent: -50,
          yPercent: -50,
          x: stage.clientWidth * (narrow ? 0.24 : 0.26),
          y: stage.clientHeight * (narrow ? -0.02 : -0.22),
          rotation: -32,
          scale: 0.38,
          opacity: 1,
        });
        // O retículo mora no pin de São Paulo; começa deslocado para o centro da lente.
        gsap.set(reticle, { x: (0.5 - SP_X / 400) * map.clientWidth, y: (0.5 - SP_Y / 400) * map.clientHeight, scale: 1.8, opacity: 0 });

        // Durante a intro as estrelas param de piscar (menos uma camada de tela inteira a recompor por quadro).
        const sky = q("[data-h=stars]")[0] as HTMLElement | undefined;
        tl = gsap.timeline({
          paused: true,
          defaults: { ease: "power2.inOut" },
          onStart: () => sky?.style.setProperty("animation-play-state", "paused"),
          onComplete: () => {
            sky?.style.removeProperty("animation-play-state");
            onAnimDone();
          },
        });
        tl.to(q("[data-h=hint]"), { opacity: 0, y: 8, duration: 0.3, ease: "power1.out" }, 0)
          // 2 · a luneta se aproxima; a névoa abre; os sites dos leiloeiros surgem desfocados
          .to(scope, { x: 0, y: 0, scale: 1, duration: 0.8, ease: "power3.inOut" }, 0)
          .to(q("[data-h=fog]"), { opacity: 0.55, scale: 1.12, duration: 0.8 }, 0)
          .to(q("[data-h=sites-soft] [data-site]"), { opacity: 0.9, duration: 0.5, ease: "power1.out" }, 0.15)
          .fromTo(q("[data-h=sites] [data-site]"), { y: -30 }, { y: 0, duration: 0.9, ease: "power2.out", stagger: (i: number) => (i % 4) * 0.06 }, 0.1)
          // 3 · os tubos deslizam e a objetiva vira a moldura circular
          .to(q("[data-h=tube]"), { x: (i: number) => i * 18, duration: 0.35, stagger: 0.04, ease: "power2.out" }, 0.62)
          .to(scope, { scale: 1.9, opacity: 0, duration: 0.38, ease: "power2.in" }, 0.92)
          .fromTo(lens, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.95)
          // a névoa se dissipa de vez quando a lente abre (autoAlpha → visibility: hidden): a parte mais pesada
          // da intro (foco do mapa e pins) já roda sem essa camada translúcida do tamanho da tela
          .to(q("[data-h=fog]"), { autoAlpha: 0, scale: 1.3, duration: 0.5, ease: "power1.in" }, 0.75)
          .to(map, { opacity: 1, duration: 0.35, ease: "power1.out" }, 1)
          // 4 · foco: o mapa sai do desfoque, os pins acendem, os sites ficam nítidos
          .to(q("[data-h=map-sharp]"), { opacity: 1, duration: 0.5 }, 1.25)
          .to(q("[data-h=map-soft]"), { opacity: 0, duration: 0.5 }, 1.25)
          .to(q("[data-h=map-sharp] [data-pin]"), { opacity: 1, duration: 0.2, stagger: 0.04, ease: "power1.out" }, 1.35)
          .to(q("[data-h=sites-soft] [data-site]"), { opacity: 0, duration: 0.5 }, 1.25)
          .to(q("[data-h=sites-sharp] [data-site]"), { opacity: 0.7, duration: 0.5 }, 1.25)
          // 5 · mira travada: o retículo vai até São Paulo e trava; o cartão do Alvo abre e o deságio conta
          .to(reticle, { opacity: 1, duration: 0.2, ease: "power1.out" }, 1.65)
          .to(reticle, { scale: 1, duration: 0.35, ease: "power2.out" }, 1.65)
          .to(reticle, { x: 0, y: 0, duration: 0.55, ease: "back.out(1.4)" }, 1.75)
          .fromTo(reticle, { scale: 1.1 }, { scale: 1, duration: 0.14, ease: "power1.out", immediateRender: false }, 2.3)
          .to(q("[data-h=card]"), { opacity: 1, y: 0, duration: 0.55, ease: "power3.out" }, 2)
          .to(
            num,
            {
              v: ALVO_DESAGIO,
              duration: 0.9,
              ease: "expo.out",
              onUpdate: () => {
                counter.textContent = String(Math.round(num.v));
              },
            },
            2.05,
          )
          // 6 · chamada: brilho de luar na lente e o botão "Ver planos" acende
          .to(q("[data-h=glow]"), { opacity: 1, duration: 0.6, ease: "power1.out" }, 2.25)
          .to(cta, { boxShadow: CTA_GLOW, duration: 0.45, ease: "power1.out" }, 2.35)
          .to(cta, { scale: 1.04, duration: 0.16, yoyo: true, repeat: 1, ease: "power1.inOut" }, 2.55);
        tl.timeScale(SPEED);

        // Mouse sobre a lente: o mapa desloca 2–4px com inércia; sair recentra.
        if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
          const lensEl = lens[0] as HTMLElement;
          const mx = gsap.quickTo(map, "x", { duration: 0.6, ease: "power3" });
          const my = gsap.quickTo(map, "y", { duration: 0.6, ease: "power3" });
          const onMove = (e: PointerEvent) => {
            const r = lensEl.getBoundingClientRect();
            mx(((e.clientX - r.left) / r.width - 0.5) * 8);
            my(((e.clientY - r.top) / r.height - 0.5) * 8);
          };
          const onLeave = () => {
            mx(0);
            my(0);
          };
          lensEl.addEventListener("pointermove", onMove);
          lensEl.addEventListener("pointerleave", onLeave);
          return () => {
            lensEl.removeEventListener("pointermove", onMove);
            lensEl.removeEventListener("pointerleave", onLeave);
          };
        }
      }, el);
      return tl!;
    };

    // ---- trava de rolagem ----------------------------------------------------------------------
    const markInput = () => {
      lastInput = performance.now();
      if (animDone) scheduleRelease();
    };
    const scheduleRelease = () => {
      clearTimeout(releaseTimer);
      const wait = QUIET_MS - (performance.now() - lastInput);
      if (wait <= 0) release();
      else releaseTimer = window.setTimeout(scheduleRelease, wait + 10);
    };
    const release = () => {
      locked = false;
      detach(); // intro concluída: não precisamos mais ouvir nada
    };
    function onAnimDone() {
      animDone = true;
      scheduleRelease();
    }

    const play = async () => {
      if (started) return;
      started = true;
      locked = true;
      lastInput = performance.now();
      const gsap = await loadGsap();
      if (cancelled) return;
      build(gsap).play();
    };

    /** A página saiu do topo sem a intro (menu, barra de rolagem, Tab): vai direto ao estado final. */
    const finishNow = async () => {
      started = true;
      locked = false;
      const gsap = await loadGsap();
      if (cancelled) return;
      const t = build(gsap);
      t.progress(1);
      animDone = true;
      release();
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // zoom do navegador
      if (locked) {
        e.preventDefault();
        markInput();
        return;
      }
      if (started || window.scrollY > TOP_SLACK) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.deltaY <= 0) return;
      e.preventDefault();
      play();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (locked) {
        if (e.cancelable) e.preventDefault();
        markInput();
        return;
      }
      if (started || touchY === null || window.scrollY > TOP_SLACK) return;
      const dy = touchY - (e.touches[0]?.clientY ?? touchY); // > 0: dedo subindo = rolar para baixo
      if (dy > 6) {
        if (e.cancelable) e.preventDefault();
        play();
      }
    };
    const onTouchEnd = () => {
      touchY = null;
      if (locked) markInput();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      // espaço em botão/link aciona o controle, não rola a página
      if (e.key === " " && e.target instanceof HTMLElement && e.target.closest("button,a,summary,[role=button]")) return;
      if (locked) {
        if (e.key === "Escape") {
          tl?.progress(1);
          return;
        }
        if (SCROLL_KEYS.has(e.key)) {
          e.preventDefault();
          markInput();
        }
        return;
      }
      if (!started && window.scrollY <= TOP_SLACK && FORWARD_KEYS.has(e.key)) {
        e.preventDefault();
        play();
      }
    };
    const onScroll = () => {
      if (window.scrollY <= TOP_SLACK) return;
      if (locked) {
        // rolagem que não veio de roda/toque/tecla (ex.: âncora do menu): não brigamos com ela
        tl?.progress(1);
        return;
      }
      if (!started) finishNow();
    };

    const opts = { passive: false } as const;
    const attach = () => {
      window.addEventListener("wheel", onWheel, opts);
      window.addEventListener("touchstart", onTouchStart, { passive: true });
      window.addEventListener("touchmove", onTouchMove, opts);
      window.addEventListener("touchend", onTouchEnd, { passive: true });
      window.addEventListener("keydown", onKey);
      window.addEventListener("scroll", onScroll, { passive: true });
    };
    function detach() {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    }

    attach();
    // Página aberta já rolada (link com #âncora, recarregar no meio): cena direto no estado final.
    if (window.scrollY > TOP_SLACK) finishNow();
    // No ócio: baixa o GSAP e já deixa o timeline montado (pausado), para o primeiro gesto só dar "play".
    const cancelIdle = whenIdle(() => {
      loadGsap().then((gsap) => {
        if (!cancelled && !started) build(gsap);
      });
    }, 1500);

    return () => {
      cancelled = true;
      cancelIdle();
      clearTimeout(releaseTimer);
      detach();
      ctx?.revert();
    };
  }, []);

  return null;
}
