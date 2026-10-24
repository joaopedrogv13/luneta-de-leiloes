"use client";

import { useEffect } from "react";
import { BRAZIL_PINS } from "@/lib/brazil";
import { ALVO_DESAGIO, CTA_GLOW } from "./constants";

type Gsap = typeof import("gsap").gsap;
type Timeline = ReturnType<Gsap["timeline"]>;

const [SP_X, SP_Y] = BRAZIL_PINS.sp;

/** Velocidade da intro: 1 ≈ 2,7s; 1.1 ≈ 2,5s. */
const SPEED = 1.1;
/** Até quantos px de rolagem ainda contamos como "no topo" (abaixo disso, a cena roda). */
const TOP_SLACK = 40;
/** A etapa 1 (noite e névoa, a luneta ao longe) fica na tela pelo menos este tempo antes de a luneta se mover:
 *  o olho registra a cena antes do movimento. Conta desde o início da navegação (o HTML já mostra a etapa 1). */
const HOLD_STAGE1_MS = 450;
/** Se o GSAP não chegar até este tempo depois de montar (rede lenta, arquivo indisponível), a cena vai direto ao
 *  estado final: a lente e o cartão do Alvo não podem ficar escondidos esperando a rede. */
const WATCHDOG_MS = 2200;

/**
 * Ilha cliente do hero (a marcação vem do servidor, em HeroScene).
 *
 * Intro automática (rodada 5, pedido do dono: "a animação inicial sempre sozinha ao atualizar o site"): ao carregar
 * ou recarregar a página no topo, a cena roda sozinha, com tempo fixo (~2,5 s), sem esperar rolagem e sem travar a
 * página. O GSAP é pedido assim que a ilha monta (não no ócio), e a luneta só começa a se mover depois de
 * HOLD_STAGE1_MS desde o início da navegação. A rolagem fica sempre livre.
 *
 * Quando a cena NÃO roda (vai direto ao estado final):
 * - prefers-reduced-motion ou sem JS (sem html.motion): o CSS já desenha o estado final;
 * - a página abriu já rolada (link com #âncora, recarregar no meio, voltar de outra página com a rolagem guardada);
 * - a intro já rodou nesta visita (html.intro-seen: voltou da demonstração pelo roteador do Next);
 * - o GSAP não chegou em WATCHDOG_MS (ou falhou).
 *
 * Saídas durante a intro: Esc pula para o fim; se a pessoa rolar até o hero quase sair da tela, a cena vai ao fim
 * (ninguém a vê mais; poupa quadros). Aba aberta em segundo plano: a cena espera a aba ficar visível.
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

    let ctx: { revert: () => void } | undefined;
    let tl: Timeline | undefined;
    let builtFor = "";
    let started = false; // a cena começou (ou já foi finalizada)
    let finished = false; // cena no estado final (data-done)
    let watchdog = 0;
    let holdTimer = 0;
    let cancelled = false;

    const counter = section.querySelector<HTMLElement>("[data-h=count]");
    const stars = section.querySelector<HTMLElement>("[data-h=stars]");

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
      started = true;
      clearTimeout(watchdog);
      clearTimeout(holdTimer);
      section.dataset.done = "";
      delete section.dataset.playing;
      document.documentElement.classList.add("intro-seen");
      ctx?.revert();
      ctx = undefined;
      tl = undefined;
      if (counter) counter.textContent = String(ALVO_DESAGIO);
      stars?.style.removeProperty("animation-play-state");
      detach();
    };
    function onAnimDone() {
      finalizeScene();
    }

    const play = (gsap: Gsap) => {
      if (started || cancelled) return;
      if (window.scrollY > TOP_SLACK) return finalizeScene(); // a página saiu do topo enquanto o GSAP chegava
      if (document.hidden) return; // aba em segundo plano: espera ficar visível (visibilitychange)
      started = true;
      clearTimeout(watchdog);
      section.dataset.playing = "";
      build(gsap).play();
    };

    let gsapReady: Gsap | undefined;
    /** Toca quando o GSAP chegou e a etapa 1 já ficou HOLD_STAGE1_MS na tela. */
    const playWhenReady = () => {
      if (!gsapReady || started || cancelled) return;
      const wait = HOLD_STAGE1_MS - performance.now();
      clearTimeout(holdTimer);
      if (wait > 16) holdTimer = window.setTimeout(() => gsapReady && play(gsapReady), wait);
      else play(gsapReady);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || finished) return;
      if (tl?.isActive()) tl.progress(1);
      else finalizeScene();
    };
    // a pessoa rolou até o hero quase sair da tela: ninguém vê mais a cena; vai ao fim (a rolagem nunca é bloqueada)
    const onScroll = () => {
      if (finished) return;
      if (!started ? window.scrollY > TOP_SLACK : window.scrollY > section.offsetHeight * 0.75) finalizeScene();
    };
    const onVisible = () => {
      if (!document.hidden) playWhenReady();
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

    // Antes de a cena começar: se a tela mudar de tamanho (girar o celular), descarta o timeline pré-montado
    // (medidas antigas); o próximo play monta de novo com as medidas atuais.
    const ro = new ResizeObserver(() => {
      if (!started && tl && builtFor !== sizeKey()) {
        ctx?.revert();
        ctx = undefined;
        tl = undefined;
      }
    });
    ro.observe(section);

    function detach() {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisible);
    }

    // Página aberta já rolada (link com #âncora, recarregar no meio) ou intro já vista nesta visita:
    // cena direto no estado final.
    if (window.scrollY > TOP_SLACK || document.documentElement.classList.contains("intro-seen")) {
      finalizeScene();
    } else {
      window.addEventListener("keydown", onKey);
      window.addEventListener("scroll", onScroll, { passive: true });
      document.addEventListener("visibilitychange", onVisible);
      watchdog = window.setTimeout(() => {
        if (!started) finalizeScene();
      }, WATCHDOG_MS);
      import("gsap")
        .then((m) => {
          if (cancelled || finished) return;
          gsapReady = m.gsap;
          build(m.gsap); // monta pausado já agora; o play só dá a partida
          playWhenReady();
        })
        .catch(() => {
          if (!cancelled) finalizeScene();
        });
    }

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      clearTimeout(holdTimer);
      detach();
      ro.disconnect();
      lensEl?.removeEventListener("pointermove", onLensMove);
      lensEl?.removeEventListener("pointerleave", onLensLeave);
      ctx?.revert();
    };
  }, []);

  return null;
}
