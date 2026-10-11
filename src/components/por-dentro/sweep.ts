import type { PlanView } from "@/content/por-dentro";

/** O que a varredura precisa saber de cada cartão (vem do servidor, na ordem de `data-card`). */
export type CardInfo = { seal: number; risks: boolean[] };

export type Tally = { risks: number; opps: number };

type Dom = {
  /** palco: recebe data-mode, data-phase, data-axis e data-primed */
  stage: HTMLElement;
  /** camada Luneta: janela (overflow hidden) + conteúdo, deslocados em sentidos opostos */
  reveal: HTMLElement;
  revealInner: HTMLElement;
  /** faixa de luz na borda da varredura */
  band: HTMLElement;
  /** a luneta (anel com retículo) e a cópia nítida da lista vista por dentro dela */
  scope: HTMLElement;
  scopeInner: HTMLElement;
};

type Hooks = {
  /** a troca começou (animated = false: troca instantânea) */
  onStart: (to: PlanView, animated: boolean) => void;
  /** uma tag acabou de aparecer (risk = grave ou atenção) */
  onTag: (risk: boolean) => void;
  /** o selo de um cartão acabou de se formar (opp = selo ≥ 1) */
  onSeal: (opp: boolean) => void;
  /** a troca terminou; totals = riscos e oportunidades dos cartões visíveis */
  onDone: (to: PlanView, totals: Tally) => void;
};

type Axis = "x" | "y";
type Ev = { at: number; card: number; kind: "tag" | "seal"; k: number };
type Geometry = { W: number; H: number; axis: Axis; cardEls: HTMLElement[]; events: Ev[] };

const FORWARD_MS: Record<Axis, number> = { x: 1500, y: 1400 };
const BACK_MS = 650;
const TAG_GAP = 90; // ms entre tags do mesmo cartão
const SETTLE_MS = 380; // espera a última tag terminar de entrar
const MAGNIFY = 1.08; // aumento dentro da luneta
/** Tamanhos da luneta (anel + vidro) e da faixa de luz: em linha (desktop) e em coluna (celular). */
const SIZE: Record<Axis, { scope: number; pad: number; band: number }> = {
  x: { scope: 224, pad: 13, band: 200 },
  y: { scope: 172, pad: 11, band: 180 },
};

/** Soma riscos (grave/atenção) e oportunidades (selo ≥ 1) dos cartões indicados. */
export function tally(cards: CardInfo[], idx: number[]): Tally {
  return idx.reduce<Tally>(
    (t, i) => ({ risks: t.risks + cards[i].risks.filter(Boolean).length, opps: t.opps + (cards[i].seal > 0 ? 1 : 0) }),
    { risks: 0, opps: 0 },
  );
}

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Varredura Lente → Luneta. Tudo o que se move é transform/opacity via Web Animations (roda no
 * compositor): a camada Luneta é revelada por uma "janela deslizante" (o contêiner anda num sentido e
 * o conteúdo no outro), a faixa de luz acompanha a borda e a luneta passa por cima mostrando a cópia
 * nítida ampliada. Um laço leve de requestAnimationFrame só lê o progresso para acender, na hora em
 * que a borda passa, o selo (anéis + deságio) e cada tag do cartão, e avisa o contador.
 * Desfoque nunca é animado: as camadas já chegam prontas do servidor.
 * Para não pesar no clique, as leituras de layout vêm antes de qualquer escrita, e `prime()` (chamado
 * quando a lista entra na tela) já deixa as camadas compostas e medidas.
 */
export function createSweep(dom: Dom, cards: CardInfo[], hooks: Hooks) {
  const { stage, reveal, revealInner, band, scope, scopeInner } = dom;
  const layers = [revealInner, scopeInner];

  let p = 0; // 0 = tudo Lente, 1 = tudo Luneta
  let target: PlanView = "lente";
  let running = false;
  let run = 0;
  let raf = 0;
  let anims: Animation[] = [];
  let timers: number[] = [];
  let laidOut = ""; // eixo + largura já aplicados (evita escrever estilo à toa)

  // O MotionLayer esconde [data-tags] até ganharem .is-in; aqui quem decide quando as tags aparecem é a varredura.
  stage.querySelectorAll("[data-tags]").forEach((el) => el.classList.add("is-in"));

  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    timers.push(id);
  };
  /** Fase no palco; na varredura, as camadas Luneta escondem selo e tags até a borda passar. */
  const setPhase = (phase: "rest" | "sweep" | "back") => {
    stage.dataset.phase = phase;
    layers.forEach((l) => l.toggleAttribute("data-hide", phase === "sweep"));
  };
  const clearMarks = () =>
    stage.querySelectorAll("[data-on],[data-seal-on]").forEach((el) => {
      el.removeAttribute("data-on");
      el.removeAttribute("data-seal-on");
    });
  const cardTwins = (c: number) =>
    layers.map((l) => l.querySelector<HTMLElement>(`[data-card="${c}"]`)).filter((el): el is HTMLElement => !!el);
  const tagTwins = (c: number, k: number) =>
    cardTwins(c)
      .map((el) => el.querySelectorAll<HTMLElement>("[data-tag]")[k])
      .filter((el): el is HTMLElement => !!el);

  /** Só leituras: tamanho do palco, eixo (em coluna ou em linha) e onde cada selo e tag acendem. */
  function measure(withEvents: boolean): Geometry {
    const cardEls = Array.from(revealInner.querySelectorAll<HTMLElement>("[data-card]")).filter((el) => el.offsetParent !== null);
    const sr = stage.getBoundingClientRect();
    const W = sr.width;
    const H = sr.height;
    const rects = cardEls.map((el) => el.getBoundingClientRect());
    const axis: Axis = rects.length > 1 && rects[1].top >= rects[0].bottom - 1 ? "y" : "x";
    const events: Ev[] = [];
    if (withEvents) {
      const pos = (r: DOMRect, f: number) => (axis === "y" ? (r.top - sr.top + r.height * f) / H : (r.left - sr.left + r.width * f) / W);
      cardEls.forEach((cardEl, i) => {
        const c = Number(cardEl.dataset.card);
        const des = cardEl.querySelector("article > p:nth-of-type(2)");
        const sealAt = axis === "y" && des ? pos(des.getBoundingClientRect(), 0.5) : pos(rects[i], 0.14);
        events.push({ at: sealAt, card: c, kind: "seal", k: 0 });
        cardEl.querySelectorAll<HTMLElement>("[data-tag]").forEach((tag, k) => {
          events.push({ at: pos(tag.getBoundingClientRect(), 0.3), card: c, kind: "tag", k });
        });
      });
      events.sort((a, b) => a.at - b.at);
    }
    return { W, H, axis, cardEls, events };
  }

  /** Escritas que dependem do tamanho: eixo, tamanho da luneta e da faixa, largura da cópia ampliada. */
  function layout(g: Geometry) {
    const key = `${g.axis}:${Math.round(g.W)}`;
    if (key === laidOut) return;
    laidOut = key;
    const s = SIZE[g.axis];
    stage.dataset.axis = g.axis;
    scope.style.width = scope.style.height = `${s.scope}px`;
    scope.style.setProperty("--pad", `${s.pad}px`);
    band.style.width = g.axis === "x" ? `${s.band}px` : "100%";
    band.style.height = g.axis === "x" ? "100%" : `${s.band}px`;
    scopeInner.style.width = `${g.W}px`;
  }

  // converte o progresso (0–1) da animação atual na posição da borda (definido a cada troca)
  let readP = (t: number) => t;

  /** Interrompe a troca em andamento, guardando onde a borda parou. */
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    const t = anims[0]?.effect?.getComputedTiming().progress;
    if (t != null) p = readP(t);
    anims.forEach((a) => a.cancel());
    anims = [];
    timers.forEach((id) => clearTimeout(id));
    timers = [];
    running = false;
  }

  /** Com a lista na tela: camadas da varredura já compostas (e medidas), para o clique não travar. */
  function prime(on: boolean) {
    if (reduceMotion()) return;
    if (on) {
      layout(measure(false));
      stage.dataset.primed = "";
    } else if (!running) {
      delete stage.dataset.primed;
    }
  }

  function play(to: PlanView, opts: { instant?: boolean } = {}) {
    if (running && to === target && !opts.instant) return; // já está indo para lá
    stop();
    run++;
    const token = run;
    target = to;
    const goal = to === "luneta" ? 1 : 0;
    const from = p;
    const forward = goal > from;
    const instant = opts.instant || reduceMotion() || typeof reveal.animate !== "function" || Math.abs(goal - from) < 0.001;

    // 1) leituras
    const g = measure(forward && !instant);
    const totals = tally(
      cards,
      g.cardEls.map((el) => Number(el.dataset.card)),
    );

    // 2) escritas
    stage.dataset.mode = to;
    if (instant) {
      p = goal;
      clearMarks();
      setPhase("rest");
      hooks.onStart(to, false);
      hooks.onDone(to, totals);
      return;
    }
    layout(g);
    if (forward) clearMarks();
    setPhase(forward ? "sweep" : "back");
    running = true;
    readP = (t) => from + (goal - from) * t;
    hooks.onStart(to, true);

    // 3) animações (compositor)
    const { W, H, axis, events } = g;
    const vertical = axis === "y";
    const size = SIZE[axis];
    const len = vertical ? H : W;
    const T = vertical ? "translateY" : "translateX";
    const dist = Math.abs(goal - from);
    const timing: KeyframeAnimationOptions = {
      duration: forward ? FORWARD_MS[axis] * Math.max(0.4, dist) : Math.max(280, BACK_MS * dist),
      easing: forward ? "cubic-bezier(.45,.05,.3,1)" : "cubic-bezier(.4,0,.2,1)",
    };
    const at = (e: number) => from + (goal - from) * e;
    // envelope de opacidade: entra em `a`, sai em `b` (frações do progresso)
    const env = (e: number, a: number, b: number) => Math.max(0, Math.min(1, e / a, (1 - e) / b));

    anims.push(
      reveal.animate([{ transform: `${T}(${(from - 1) * 100}%)` }, { transform: `${T}(${(goal - 1) * 100}%)` }], timing),
      revealInner.animate([{ transform: `${T}(${(1 - from) * 100}%)` }, { transform: `${T}(${(1 - goal) * 100}%)` }], timing),
    );

    const N = 24;
    const bandKf: Keyframe[] = [];
    for (let i = 0; i <= N; i++) {
      const e = i / N;
      bandKf.push({
        offset: e,
        transform: `${T}(${(at(e) * len - size.band / 2).toFixed(1)}px)`,
        opacity: forward ? env(e, 0.08, 0.14) : 0.75 * env(e, 0.12, 0.25),
      });
    }
    anims.push(band.animate(bandKf, timing));

    if (forward) {
      // A luneta anda sobre a borda, num arco suave; por dentro, a cópia nítida um pouco ampliada.
      const S = size.scope;
      const R = S / 2 - size.pad;
      const scopeKf: Keyframe[] = [];
      const innerKf: Keyframe[] = [];
      for (let i = 0; i <= N; i++) {
        const e = i / N;
        const q = at(e);
        const cx = vertical ? W * (0.5 + 0.1 * Math.sin(Math.PI * q)) : q * W;
        const cy = vertical ? q * H : H * (0.6 - 0.07 * Math.sin(Math.PI * q));
        const grow = e < 0.12 ? 0.82 + 0.18 * (e / 0.12) : e > 0.88 ? 1 + 0.06 * ((e - 0.88) / 0.12) : 1;
        scopeKf.push({
          offset: e,
          transform: `translate(${(cx - S / 2).toFixed(1)}px, ${(cy - S / 2).toFixed(1)}px) scale(${grow.toFixed(3)})`,
          opacity: env(e, 0.1, 0.12),
        });
        innerKf.push({
          offset: e,
          transform: `translate(${(R - MAGNIFY * cx).toFixed(1)}px, ${(R - MAGNIFY * cy).toFixed(1)}px) scale(${MAGNIFY})`,
        });
      }
      anims.push(scope.animate(scopeKf, timing), scopeInner.animate(innerKf, timing));
    }

    // 4) eventos: a borda acende o selo e cada tag dos cartões visíveis
    let next = 0;
    let lastAt = 0;
    const lastTag = new Map<number, number>();
    const fire = (ev: Ev, immediate: boolean) => {
      const now = performance.now();
      let when = now;
      if (ev.kind === "tag" && !immediate) {
        when = Math.max(now, (lastTag.get(ev.card) ?? 0) + TAG_GAP);
        lastTag.set(ev.card, when);
      }
      lastAt = Math.max(lastAt, when);
      const apply = () => {
        if (ev.kind === "tag") {
          tagTwins(ev.card, ev.k).forEach((el) => el.setAttribute("data-on", ""));
          hooks.onTag(cards[ev.card].risks[ev.k] ?? false);
        } else {
          cardTwins(ev.card).forEach((el) => el.setAttribute("data-seal-on", ""));
          const opp = cards[ev.card].seal > 0;
          if (immediate) hooks.onSeal(opp);
          else later(280, () => hooks.onSeal(opp));
        }
      };
      if (when - now > 4) later(when - now, apply);
      else apply();
    };
    // retomada no meio do caminho: o que já está à vista acende de uma vez
    while (next < events.length && events[next].at <= from + 1e-6) fire(events[next++], true);

    const master = anims[0];
    const tick = () => {
      raf = 0;
      if (token !== run) return;
      const t = master.effect?.getComputedTiming().progress;
      if (t == null) return;
      p = readP(t);
      while (next < events.length && events[next].at <= p) fire(events[next++], false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    master.finished
      .then(() => {
        if (token !== run) return;
        cancelAnimationFrame(raf);
        raf = 0;
        p = goal;
        while (next < events.length) fire(events[next++], false);
        anims.forEach((a) => a.cancel());
        anims = [];
        running = false;
        const done = () => {
          if (token !== run) return;
          setPhase("rest");
          if (!forward) clearMarks();
          hooks.onDone(to, totals);
        };
        if (forward) later(Math.max(0, lastAt - performance.now()) + SETTLE_MS, done);
        else done();
      })
      .catch(() => {
        /* cancelada por uma nova troca */
      });
  }

  return {
    play,
    prime,
    destroy() {
      run++;
      stop();
    },
  };
}

export type Sweep = ReturnType<typeof createSweep>;
