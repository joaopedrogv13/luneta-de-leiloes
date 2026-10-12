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
/** Ponto do timeline (s, antes do timeScale) em que a cena essencial já está montada (lente, mapa, mira e
 *  cartão do Alvo). Daí em diante um gesto novo rola a página; brilho e pulso do botão seguem por cima. */
const UNLOCK_AT = 2.05;
/** Depois desse ponto, a inércia que sobrar do gesto que disparou a intro é absorvida no máximo por este tempo. */
const HOLD_MAX_MS = 1600;
/** Pausa entre eventos de roda que indica um gesto novo. A inércia do trackpad chega a cada 8–16 ms (até ~60 ms
 *  num aparelho lento); a roda do mouse girada com calma, a cada 100 ms ou mais. */
const NEW_GESTURE_GAP_MS = 90;
/** Se o GSAP não chegar até este tempo depois do gesto (rede lenta, arquivo indisponível), a cena vai ao fim. */
const WATCHDOG_MS = 700;
const FORWARD_KEYS = new Set(["ArrowDown", "PageDown", " ", "Spacebar", "End"]);
const SCROLL_KEYS = new Set([...FORWARD_KEYS, "ArrowUp", "PageUp", "Home"]);

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
/** Controles que o espaço aciona (em links o espaço rola a página, então não entram aqui). */
const spaceActivates = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest("button,summary,[role=button],input,select,textarea,label");

/**
 * Ilha cliente do hero (a marcação vem do servidor, em HeroScene).
 *
 * Intro de UMA rolada: no topo da página, o primeiro gesto para baixo (dois dedos no trackpad, roda do
 * mouse, deslizar com um dedo no celular, ↓ / PageDown / espaço) dispara a animação inteira, com tempo fixo
 * e suave. Enquanto ela monta a cena, a página fica parada (os eventos de rolagem são absorvidos). Com a
 * cena montada (UNLOCK_AT), um gesto novo (dedo novo, roda depois de uma pausa, tecla) já rola a página, e
 * a inércia do gesto que disparou a intro é absorvida no máximo por HOLD_MAX_MS. A intro roda uma vez por
 * visita: ao voltar de outra página do site, o hero já vem no estado final (html.intro-seen).
 *
 * Saídas garantidas (a página nunca fica presa):
 * - Esc pula para o fim, inclusive enquanto o GSAP ainda está chegando;
 * - se o GSAP não carregar em WATCHDOG_MS (ou falhar), a cena vai direto ao estado final;
 * - se a página rolar por outro caminho (link do menu, barra de rolagem, Tab), idem;
 * - pinça com dois dedos nunca é bloqueada.
 *
 * Ao terminar, #topo ganha data-done e os estilos do GSAP são removidos: o estado final é só CSS
 * (responsivo: girar o celular ou redimensionar não desalinha nada).
 */
export function HeroMotion() {
  useEffect(() => {
    const el = document.getElementById("topo");
    if (!el || !document.documentElement.classList.contains("motion")) return;
    const section = el;
    const wide = matchMedia("(min-width: 640px)"); // o mesmo critério do CSS (conta a barra de rolagem)

    let gsapPromise: Promise<Gsap> | undefined;
    let ctx: { revert: () => void } | undefined;
    let tl: Timeline | undefined;
    let builtFor = "";
    let started = false; // o gesto já disparou (ou a cena já foi finalizada)
    let finished = false; // cena no estado final (data-done)
    let locked = false;
    let unlockReady = false; // a cena essencial já está montada
    let unlockAt = 0;
    let lastInput = 0;
    let lastWheelAt = 0;
    let lastWheelAbs = 0;
    let releaseTimer = 0;
    let watchdog = 0;
    let touchY: number | null = null;
    let cancelled = false;

    const counter = section.querySelector<HTMLElement>("[data-h=count]");
    const stars = section.querySelector<HTMLElement>("[data-h=stars]");

    const loadGsap = () =>
      (gsapPromise ??= import("gsap")
        .then((m) => m.gsap)
        .catch((err) => {
          gsapPromise = undefined; // permite tentar de novo depois
          throw err;
        }));

    const sizeKey = () => `${section.clientWidth}x${section.clientHeight}`;

    const build = (gsap: Gsap) => {
      if (tl && builtFor === sizeKey()) return tl;
      ctx?.revert();
      tl = undefined;
      builtFor = sizeKey();
      ctx = gsap.context(() => {
        const q = gsap.utils.selector(section);
        const stage = q("[data-h=stage]")[0] as HTMLElement;
        const map = q("[data-h=map]")[0] as HTMLElement;
        const scope = q("[data-h=scope]");
        const lens = q("[data-h=lens]");
        const reticle = q("[data-h=reticle]");
        const cta = q("[data-h=cta]");
        const narrow = !wide.matches;
        const num = { v: 0 };

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
        // O retículo mora no pin de São Paulo (contêiner externo); o interno começa no centro da lente.
        gsap.set(reticle, { x: (0.5 - SP_X / 400) * map.clientWidth, y: (0.5 - SP_Y / 400) * map.clientHeight, scale: 1.8, opacity: 0 });

        tl = gsap.timeline({
          paused: true,
          defaults: { ease: "power2.inOut" },
          onStart: () => {
            if (counter) counter.textContent = "0";
            // durante a intro as estrelas param de piscar (menos uma camada de tela inteira por quadro)
            stars?.style.setProperty("animation-play-state", "paused");
          },
          onComplete: onAnimDone,
        });
        tl.call(reachUnlock, undefined, UNLOCK_AT);
        // 2 · a luneta se aproxima; a névoa abre; os sites dos leiloeiros surgem desfocados
        tl.to(scope, { x: 0, y: 0, scale: 1, duration: 0.8, ease: "power3.inOut" }, 0)
          .to(q("[data-h=fog]"), { opacity: 0.55, scale: 1.12, duration: 0.8 }, 0)
          .to(q("[data-h=sites-soft] [data-site]"), { opacity: 0.9, duration: 0.5, ease: "power1.out" }, 0.15)
          .fromTo(q("[data-h=sites] [data-site]"), { y: -30 }, { y: 0, duration: 0.9, ease: "power2.out", stagger: (i: number) => (i % 4) * 0.06 }, 0.1)
          // 3 · os tubos deslizam e a objetiva vira a moldura circular
          .to(q("[data-h=tube]"), { x: (i: number) => i * 18, duration: 0.35, stagger: 0.04, ease: "power2.out" }, 0.62)
          .to(scope, { scale: 1.9, opacity: 0, duration: 0.38, ease: "power2.in" }, 0.92)
          .fromTo(lens, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "power3.out" }, 0.95)
          // a névoa se dissipa de vez quando a lente abre: a parte mais pesada já roda sem essa camada
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
                if (counter) counter.textContent = String(Math.round(num.v));
              },
            },
            2.05,
          )
          // 6 · chamada: brilho de luar na lente e o botão "Ver planos" acende
          .to(q("[data-h=glow]"), { opacity: 1, duration: 0.6, ease: "power1.out" }, 2.25)
          .to(cta, { boxShadow: CTA_GLOW, duration: 0.45, ease: "power1.out" }, 2.35)
          .to(cta, { scale: 1.04, duration: 0.16, yoyo: true, repeat: 1, ease: "power1.inOut" }, 2.55);
        tl.timeScale(SPEED);
      }, section);
      return tl!;
    };

    /** Estado final só com CSS: marca data-done e remove os estilos que o GSAP deixou. */
    const finalizeScene = () => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      section.dataset.done = "";
      delete section.dataset.playing;
      document.documentElement.classList.add("intro-seen");
      ctx?.revert();
      ctx = undefined;
      tl = undefined;
      if (counter) counter.textContent = String(ALVO_DESAGIO);
      stars?.style.removeProperty("animation-play-state");
    };

    // ---- trava de rolagem ----------------------------------------------------------------------
    const scheduleRelease = () => {
      clearTimeout(releaseTimer);
      if (!locked) return;
      const now = performance.now();
      const wait = Math.min(QUIET_MS - (now - lastInput), HOLD_MAX_MS - (now - unlockAt));
      if (wait <= 0) release();
      else releaseTimer = window.setTimeout(scheduleRelease, wait + 10);
    };
    const markInput = () => {
      lastInput = performance.now();
      if (unlockReady) scheduleRelease();
    };
    const release = () => {
      clearTimeout(releaseTimer);
      locked = false;
      if (finished) detach(); // intro concluída: não precisamos mais ouvir nada
    };
    function reachUnlock() {
      if (unlockReady) return;
      unlockReady = true;
      unlockAt = performance.now();
      scheduleRelease();
    }
    function onAnimDone() {
      finalizeScene();
      reachUnlock();
      if (!locked) detach();
    }
    /** Pular para o fim agora (Esc, rolagem por outro caminho, GSAP indisponível). */
    const finishNow = () => {
      started = true;
      finalizeScene();
      release();
    };

    const play = async () => {
      if (started) return;
      started = true;
      locked = true;
      lastInput = performance.now();
      section.dataset.playing = "";
      watchdog = window.setTimeout(() => {
        if (!tl || !tl.isActive()) finishNow();
      }, WATCHDOG_MS);
      try {
        const gsap = await loadGsap();
        if (cancelled || finished) return;
        if (window.scrollY > TOP_SLACK) return finishNow(); // a página saiu do topo enquanto o GSAP chegava
        clearTimeout(watchdog);
        build(gsap).play();
      } catch {
        if (!cancelled) finishNow();
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // zoom do navegador
      const now = performance.now();
      const abs = Math.abs(e.deltaX) + Math.abs(e.deltaY);
      const gap = now - lastWheelAt;
      // inércia do trackpad: valores que só caem (repetidos só no fim, já pequenos). A roda do mouse repete
      // passos grandes e iguais (100, 120…), então conta como gesto novo.
      const decaying = abs < lastWheelAbs || (abs === lastWheelAbs && abs <= 12);
      lastWheelAt = now;
      lastWheelAbs = abs;
      if (locked) {
        // cena montada e roda depois de uma pausa, ou acelerando de novo: é um gesto novo, a página rola
        if (unlockReady && (gap > NEW_GESTURE_GAP_MS || !decaying)) return release();
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
      touchY = e.touches.length === 1 ? e.touches[0].clientY : null;
      if (locked && unlockReady) release(); // dedo novo com a cena montada: este deslize já rola a página
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // pinça (zoom): nunca bloquear
      if (locked) {
        if (e.cancelable) e.preventDefault();
        markInput();
        return;
      }
      if (started || touchY === null || window.scrollY > TOP_SLACK) return;
      const dy = touchY - e.touches[0].clientY; // > 0: dedo subindo = rolar para baixo
      if (dy > 6) {
        if (e.cancelable) e.preventDefault();
        play();
      }
    };
    const onTouchEnd = () => {
      touchY = null;
      if (!locked) return;
      if (unlockReady) release(); // no toque não há inércia a absorver (os movimentos foram bloqueados)
      else markInput();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (e.key === " " && spaceActivates(e.target)) return;
      if (locked) {
        if (e.key === "Escape") {
          if (tl?.isActive()) tl.progress(1);
          else finishNow();
          return;
        }
        if (SCROLL_KEYS.has(e.key)) {
          if (unlockReady) return release(); // a tecla já rola a página
          e.preventDefault();
          markInput();
        }
        return;
      }
      const forward = FORWARD_KEYS.has(e.key) && !(e.key === " " && e.shiftKey); // Shift+espaço volta
      if (!started && window.scrollY <= TOP_SLACK && forward) {
        e.preventDefault();
        play();
      }
    };
    const onScroll = () => {
      if (window.scrollY <= TOP_SLACK || finished) return;
      // rolagem que não veio de roda/toque/tecla (âncora do menu, barra de rolagem, Tab): não brigamos com ela
      finishNow();
    };

    // Mouse sobre a lente: o mapa desloca 2–4px com inércia (transição CSS); sair recentra.
    const lensEl = section.querySelector<HTMLElement>("[data-h=lens]");
    const mapEl = section.querySelector<HTMLElement>("[data-h=map]");
    const onLensMove = (e: PointerEvent) => {
      if (!lensEl || !mapEl || e.pointerType !== "mouse") return;
      const r = lensEl.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 8;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 8;
      mapEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    };
    const onLensLeave = () => mapEl?.style.removeProperty("transform");
    lensEl?.addEventListener("pointermove", onLensMove);
    lensEl?.addEventListener("pointerleave", onLensLeave);

    // Antes da primeira rolada: se a tela mudar de tamanho (girar o celular), descarta o timeline
    // pré-montado (medidas antigas) e devolve a etapa 1 ao CSS, que é responsivo.
    const ro = new ResizeObserver(() => {
      if (!started && tl && builtFor !== sizeKey()) {
        ctx?.revert();
        ctx = undefined;
        tl = undefined;
      }
    });
    ro.observe(section);

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
    // Página aberta já rolada (link com #âncora, recarregar no meio) ou intro já vista nesta visita:
    // cena direto no estado final.
    if (window.scrollY > TOP_SLACK || document.documentElement.classList.contains("intro-seen")) finishNow();
    // No ócio: baixa o GSAP e já deixa o timeline montado (pausado), para o primeiro gesto só dar "play".
    const cancelIdle = whenIdle(() => {
      loadGsap()
        .then((gsap) => {
          if (!cancelled && !started) build(gsap);
        })
        .catch(() => {
          /* sem GSAP: o primeiro gesto cai no estado final (play → finishNow) */
        });
    }, 800);

    return () => {
      cancelled = true;
      cancelIdle();
      clearTimeout(releaseTimer);
      clearTimeout(watchdog);
      detach();
      ro.disconnect();
      lensEl?.removeEventListener("pointermove", onLensMove);
      lensEl?.removeEventListener("pointerleave", onLensLeave);
      ctx?.revert();
    };
  }, []);

  return null;
}
