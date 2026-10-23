"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { gravarSaida, lerSaida, MARCA_HISTORICO, type SaidaApresentacao } from "@/lib/apresentacao";

/** Distância do botão até a borda da tela e até o que estiver fixo no pé (barra do lance, "Ver no mapa"). */
const MARGEM = 16;
const FOLGA = 10;

/**
 * Sobe o botão acima do que estiver fixo no pé da tela, embaixo dele (a barra do lance da página do imóvel, o botão
 * "Ver no mapa" da lista no celular). Procura nos pontos que o botão ocupa sem ajuste (conta feita, sem mexer no botão):
 * o que estiver ali com position: fixed (e não for uma camada de tela inteira, como o mapa em tela cheia) empurra o
 * botão para cima.
 */
function folgaNoPe(botao: HTMLElement): number {
  const h = botao.offsetHeight;
  const w = botao.offsetWidth;
  const vh = window.innerHeight;
  const ys = [vh - MARGEM - h + 4, vh - MARGEM - 4];
  const xs = [MARGEM + 6, MARGEM + w / 2, MARGEM + w - 6];
  let sobe = 0;
  for (const y of ys) {
    for (const x of xs) {
      for (const el of document.elementsFromPoint(x, y)) {
        if (el === botao || botao.contains(el) || !(el instanceof HTMLElement)) continue;
        if (getComputedStyle(el).position !== "fixed") continue;
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.45 || r.height < 8) continue; // camada de tela inteira, ou nada visível
        sobe = Math.max(sobe, vh - r.top + FOLGA - MARGEM);
      }
    }
  }
  return Math.max(0, Math.round(sobe));
}

/** Gestos de quem já está rolando por conta própria: a chegada para de corrigir a posição. */
const GESTOS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
/** Por quanto tempo a chegada confere a posição (o conteúdo da página ainda pode estar chegando). */
const CHEGADA_MS = 3000;

/**
 * Chegada da landing com âncora (#simulador, #localizacao, #riscos): a seção certa logo abaixo das barras fixas, já
 * com os dados. Confere a cada quadro por até CHEGADA_MS, até a seção ficar parada no lugar ou a pessoa mexer, porque a
 * página pode chegar aos pedaços: o esqueleto do carregamento encolhe a página, a rolagem cai para perto do topo, e
 * quando o conteúdo chega o navegador devolvia a rolagem antiga da landing (visto no Chrome: a página parava no
 * simulador em vez de nos riscos). Âncora que não é seção (#alerta-praca): o topo da página, onde está o favorito.
 */
function alinharChegada(): () => void {
  const id = decodeURIComponent(window.location.hash.slice(1));
  let mexeu = false;
  let raf = 0;
  let parado = 0;
  const t0 = performance.now();
  const aoMexer = () => {
    mexeu = true;
  };
  const parar = () => {
    cancelAnimationFrame(raf);
    for (const g of GESTOS) window.removeEventListener(g, aoMexer);
  };
  const passo = () => {
    if (mexeu || performance.now() - t0 > CHEGADA_MS) return parar();
    const el = id ? document.getElementById(id) : null;
    let longe: boolean;
    if (el) {
      const pad = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const margem = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      longe = Math.abs(el.getBoundingClientRect().top - (pad + margem)) > 24;
      if (longe) el.scrollIntoView({ block: "start", behavior: "instant" });
    } else {
      longe = window.scrollY > 4;
      if (longe && document.querySelector("[data-secao-imovel]")) window.scrollTo({ top: 0, behavior: "instant" });
    }
    parado = longe ? 0 : parado + 1;
    // ~0,5 s no lugar com a página inteira: chegou
    if (parado > 30 && document.querySelector("[data-secao-imovel], main")) return parar();
    raf = requestAnimationFrame(passo);
  };
  for (const g of GESTOS) window.addEventListener(g, aoMexer, { passive: true, once: true });
  raf = requestAnimationFrame(passo);
  return parar;
}

/**
 * "← Voltar à apresentação" (rodada 5, ponto 10): botão fixo e discreto, no canto de baixo à esquerda da demonstração
 * (/assinante e a página do método), só para quem veio da landing por um link (o registro de src/lib/apresentacao.ts,
 * nesta aba). Quem entrou direto não vê nada. Volta à landing exatamente no ponto de onde a pessoa saiu:
 * - se esta ainda é a primeira entrada do histórico depois da landing (marcada em history.state), usa history.back();
 * - senão (a pessoa abriu outro imóvel, trocou de página), navega para "/" sem rolar, e a landing restaura a posição.
 * É um link de verdade para "/" (Tab, Enter, clique do meio abre a landing do começo). Não sai na impressão nem no
 * relatório em PDF.
 */
export function VoltarApresentacao() {
  const pathname = usePathname();
  const [saida, setSaida] = useState<SaidaApresentacao | null>(null);
  const [sobe, setSobe] = useState(0);
  const botao = useRef<HTMLAnchorElement>(null);
  const relatorio = pathname.endsWith("/relatorio");

  // lê o registro só no navegador (sessionStorage); marca a primeira entrada do histórico depois da landing
  useEffect(() => {
    const s = lerSaida();
    const t = window.setTimeout(() => setSaida(s), 0);
    let pararChegada = () => {};
    // acabou de chegar da landing pelo link com âncora: a seção certa na tela
    const aqui = window.location.pathname + window.location.hash;
    if (s && !s.voltando && window.location.hash.length > 1 && aqui === s.destino && Date.now() - s.em < 15_000) pararChegada = alinharChegada();
    if (s && !s.voltando) {
      const estado = (window.history.state ?? {}) as Record<string, unknown>;
      const destino = s.destino.split("#")[0]!.split("?")[0];
      // só a entrada que o link abriu (a mesma página do destino) e ainda sem marca de outra saída
      if (destino === window.location.pathname && !estado[MARCA_HISTORICO] && !sessionStorage.getItem(`${MARCA_HISTORICO}:${s.token}`)) {
        try {
          window.history.replaceState({ ...estado, [MARCA_HISTORICO]: s.token }, "");
          sessionStorage.setItem(`${MARCA_HISTORICO}:${s.token}`, "1");
        } catch {
          // sem histórico ou armazenamento: a volta usa a navegação para "/"
        }
      }
    }
    return () => {
      window.clearTimeout(t);
      pararChegada();
    };
  }, []);

  // acima do que estiver fixo no pé (mede ao rolar, ao mudar de tamanho e de tempos em tempos)
  useEffect(() => {
    if (!saida || relatorio) return;
    let raf = 0;
    const medir = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = botao.current;
        if (!el) return;
        const s = folgaNoPe(el);
        setSobe((v) => (Math.abs(v - s) > 1 ? s : v));
      });
    };
    medir();
    const intervalo = window.setInterval(medir, 900);
    window.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(intervalo);
      window.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
    };
  }, [saida, relatorio, pathname]);

  if (!saida || relatorio) return null;

  // o <Link> navega para "/" sem rolar (scroll={false}): a landing é que devolve a posição; na primeira entrada do
  // histórico depois da landing, history.back() (a mesma entrada, sem empilhar outra)
  const voltar = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    gravarSaida({ ...saida, voltando: true });
    const estado = window.history.state as Record<string, unknown> | null;
    if (estado?.[MARCA_HISTORICO] === saida.token) {
      e.preventDefault();
      window.history.back();
    }
  };

  return (
    <Link
      ref={botao}
      href="/"
      scroll={false}
      prefetch={false}
      onClick={voltar}
      data-voltar-apresentacao=""
      style={{ transform: sobe ? `translateY(-${sobe}px)` : undefined }}
      className="fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-4 z-[45] inline-flex min-h-11 items-center gap-2 rounded-full border border-latao/45 bg-tinta/95 py-2 pr-4 pl-3 text-[13px] leading-none font-semibold text-luar no-underline shadow-[0_10px_30px_rgba(7,11,22,.4)] backdrop-blur-md transition-[transform,border-color,background-color] duration-200 ease-luneta hover:border-latao hover:bg-tinta motion-reduce:transition-none print:hidden [[data-theme=light]_&]:shadow-[0_8px_24px_rgba(15,24,48,.16)]"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-latao-texto">
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      Voltar à apresentação
    </Link>
  );
}
