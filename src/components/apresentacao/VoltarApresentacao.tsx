"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ANCORA_ALERTA, gravarSaida, lerSaida, MARCA_HISTORICO, type SaidaApresentacao } from "@/lib/apresentacao";

/** Distância do botão até a borda da tela e até o que estiver fixo no pé (barra do lance, "Ver no mapa"). */
const MARGEM = 16;
const FOLGA = 10;

/**
 * Sobe o botão acima do que estiver fixo no pé da tela, embaixo dele (a barra do lance da página do imóvel, o botão
 * "Ver no mapa" da lista no celular, o cabeçalho da folha da lista na vista de mapa do celular). Procura nos pontos que
 * o botão ocupa sem ajuste (conta feita, sem mexer no botão): o que estiver ali com position: fixed, ou marcado com
 * `data-pe` (a folha do mapa não é fixed: rola dentro de uma camada fixa), e não for uma camada de tela inteira (como o
 * mapa em tela cheia), empurra o botão para cima.
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
  const folha = cabecalhoDaFolha();
  // o cabeçalho da folha do mapa conta mesmo um pouco acima do botão: o botão fica inteiro acima dele (e dos créditos do
  // mapa, ~24 px, que ficam logo acima da folha), e não por cima da folha logo abaixo do cabeçalho
  if (folha) sobe = Math.max(sobe, vh - folha.top + FOLGA - MARGEM + CREDITOS_MAPA);
  return Math.max(0, Math.round(sobe));
}

/** Os créditos do mapa (OpenFreeMap © OpenMapTiles © OpenStreetMap), logo acima da folha, no canto de baixo à direita. */
const CREDITOS_MAPA = 24;

/**
 * O cabeçalho da folha da lista na vista de mapa do celular (`data-pe`), quando ele está na metade de baixo da tela
 * (espiada ou meio). A folha não é fixed: rola dentro de uma camada fixa.
 */
function cabecalhoDaFolha(): DOMRect | null {
  const vh = window.innerHeight;
  for (const el of document.querySelectorAll<HTMLElement>("[data-pe]")) {
    const r = el.getBoundingClientRect();
    if (r.height >= 8 && r.top >= vh * 0.45 && r.top <= vh - MARGEM) return r;
  }
  return null;
}

/** Gestos de quem já está rolando por conta própria: a chegada para de corrigir a posição. */
const GESTOS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
/** Por quanto tempo a chegada confere a posição (o conteúdo da página ainda pode estar chegando). */
const CHEGADA_MS = 3000;
/** Altura do pop-up do favorito com o aviso (título, chave, explicação, "Pronto"), com folga. */
const ALTURA_POPUP = 360;

/**
 * Chegada da landing com âncora (#simulador, #localizacao, #riscos): a seção certa logo abaixo das barras fixas, já
 * com os dados. Confere a cada quadro por até CHEGADA_MS, até a seção ficar parada no lugar ou a pessoa mexer, porque a
 * página pode chegar aos pedaços: o esqueleto do carregamento encolhe a página, a rolagem cai para perto do topo, e
 * quando o conteúdo chega o navegador devolvia a rolagem antiga da landing (visto no Chrome: a página parava no
 * simulador em vez de nos riscos). Âncora do favorito (#alerta-praca): o coração à vista (o do cartão do preço no
 * computador, o do título no celular) vai para o alto da tela, abaixo das barras fixas, com espaço embaixo para o pop-up
 * do aviso abrir inteiro (no computador, a página parava no topo, com a galeria na tela e o pop-up cortado no pé).
 */
function alinharChegada(): () => void {
  const id = decodeURIComponent(window.location.hash.slice(1));
  let mexeu = false;
  let raf = 0;
  let parado = 0;
  /** #alerta-praca: a rolagem certa, medida a partir do topo da página (null até o coração aparecer) */
  let alvoY: number | null = null;
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
    } else if (id === ANCORA_ALERTA) {
      // A conta parte do topo da página: a navegação da landing chega com a rolagem dela, e o cartão do preço (sticky)
      // colado no alto não diz quanto rolar. Do topo, a menor rolagem que deixa o coração e o pop-up inteiros na tela.
      const coracao = Array.from(document.querySelectorAll<HTMLElement>("[data-alerta-praca] button")).find((b) => b.getClientRects().length > 0);
      if (!coracao || alvoY === null) {
        longe = window.scrollY > 4;
        if (longe) window.scrollTo({ top: 0, behavior: "instant" });
        else if (coracao) {
          const r = coracao.getBoundingClientRect();
          // embaixo, a folga do próprio botão de voltar (16 + 44 + 16 px): o pop-up não fica por baixo dele
          alvoY = Math.max(0, Math.round(r.bottom + ALTURA_POPUP - (window.innerHeight - 76)));
          longe = alvoY > 4;
          if (longe) window.scrollTo({ top: alvoY, behavior: "instant" });
        }
      } else {
        longe = Math.abs(window.scrollY - alvoY) > 4;
        if (longe) window.scrollTo({ top: alvoY, behavior: "instant" });
      }
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

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Teclado na chegada com âncora (revisão final da rodada 5, R5P-04): o Tab seguinte parte da seção de destino, e o botão
 * (no começo da página) só vinha depois de toda ela: 49 a 64 Tabs. Agora o primeiro Tab da chegada (com o foco ainda
 * no corpo da página) vai ao "Voltar à apresentação", e o Tab seguinte, do botão, entra na seção, onde a pessoa estava.
 * Shift+Tab e qualquer outra tecla seguem o caminho normal. Só vale até a pessoa clicar ou usar o primeiro Tab.
 */
function atalhoDoTeclado(botao: { current: HTMLElement | null }, secao: () => HTMLElement | null): () => void {
  let noBotao = false;
  /** de onde o primeiro Tab saiu: o corpo da página (âncora de seção) ou o coração do favorito (#alerta-praca) */
  let origem: HTMLElement | null = null;
  const visiveis = (raiz: ParentNode) => Array.from(raiz.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((el) => el.getClientRects().length > 0);
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
    const b = botao.current;
    if (!b) return;
    const ativo = document.activeElement;
    if (!noBotao) {
      parar();
      const doCoracao = ativo instanceof HTMLElement && ativo.matches("[data-alerta-praca] button");
      if (e.shiftKey || (ativo && ativo !== document.body && !doCoracao)) return;
      e.preventDefault();
      noBotao = true;
      origem = doCoracao ? ativo : null;
      b.focus();
      document.addEventListener("keydown", aoTeclar, true);
      return;
    }
    // segundo Tab, ainda no botão: de volta para onde a pessoa estava (o primeiro da seção, ou o que vinha depois do coração)
    parar();
    if (e.shiftKey || ativo !== b) return;
    let alvo: HTMLElement | undefined;
    if (origem) {
      const todos = visiveis(document);
      alvo = todos[todos.indexOf(origem) + 1];
    } else {
      const s = secao();
      alvo = s ? visiveis(s)[0] : undefined;
    }
    if (!alvo) return;
    e.preventDefault();
    alvo.focus();
  };
  const aoClicar = () => parar();
  function parar() {
    document.removeEventListener("keydown", aoTeclar, true);
    document.removeEventListener("pointerdown", aoClicar, true);
  }
  document.addEventListener("keydown", aoTeclar, true);
  document.addEventListener("pointerdown", aoClicar, true);
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
  /**
   * Vista de mapa do celular (a folha da lista embaixo): o botão vai para o canto de baixo à DIREITA, só com a seta, acima
   * da folha e dos créditos. À esquerda ele cobria o botão "Legenda" e a escala do mapa, e com o nome inteiro, o aviso do
   * centro (revisão final da rodada 5, R5-TEC-03).
   */
  const [naFolha, setNaFolha] = useState(false);
  /** depois que a pessoa rola a página por conta própria, o botão encolhe à seta (o nome volta no mouse e no foco) */
  const [compacto, setCompacto] = useState(false);
  const botao = useRef<HTMLAnchorElement>(null);
  const relatorio = pathname.endsWith("/relatorio");

  // lê o registro só no navegador (sessionStorage); marca a primeira entrada do histórico depois da landing
  useEffect(() => {
    const s = lerSaida();
    const t = window.setTimeout(() => setSaida(s), 0);
    let pararChegada = () => {};
    let pararAtalho = () => {};
    // acabou de chegar da landing pelo link com âncora: a seção certa na tela, e o primeiro Tab no botão de voltar
    const aqui = window.location.pathname + window.location.hash;
    if (s && !s.voltando && window.location.hash.length > 1 && aqui === s.destino && Date.now() - s.em < 15_000) {
      pararChegada = alinharChegada();
      const id = decodeURIComponent(window.location.hash.slice(1));
      pararAtalho = atalhoDoTeclado(botao, () =>
        id === ANCORA_ALERTA ? (document.querySelector<HTMLElement>("[data-alerta-praca] button")?.closest("aside, section, div") ?? null) : document.getElementById(id),
      );
    }
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
      pararAtalho();
    };
  }, []);

  // O botão não cobre o conteúdo (revisão final da rodada 5, R5P-05): o fim da página ganha o espaço dele (o último
  // parágrafo, o rodapé e o foco do Tab param acima do botão), e ele encolhe à seta quando a pessoa rola por conta
  // própria (roda, toque, teclado; a rolagem da chegada não conta).
  useEffect(() => {
    if (!saida || relatorio) return;
    const html = document.documentElement;
    const antes = { pad: document.body.style.paddingBottom, scroll: html.style.scrollPaddingBottom };
    document.body.style.paddingBottom = "76px";
    html.style.scrollPaddingBottom = "76px";
    const encolher = () => setCompacto(true);
    const gestos = ["wheel", "touchmove"] as const;
    const teclas = (e: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "End", "Home", " "].includes(e.key)) encolher();
    };
    for (const g of gestos) window.addEventListener(g, encolher, { passive: true, once: true });
    window.addEventListener("keydown", teclas);
    return () => {
      document.body.style.paddingBottom = antes.pad;
      html.style.scrollPaddingBottom = antes.scroll;
      for (const g of gestos) window.removeEventListener(g, encolher);
      window.removeEventListener("keydown", teclas);
    };
  }, [saida, relatorio]);

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
        setNaFolha(cabecalhoDaFolha() !== null);
      });
    };
    medir();
    const intervalo = window.setInterval(medir, 900);
    // na captura: também a rolagem de dentro (a folha da lista na vista de mapa)
    document.addEventListener("scroll", medir, { passive: true, capture: true });
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(intervalo);
      document.removeEventListener("scroll", medir, { capture: true });
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
      data-compacto={compacto || naFolha ? "" : undefined}
      data-direita={naFolha ? "" : undefined}
      style={{ transform: sobe ? `translateY(-${sobe}px)` : undefined }}
      className="group fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-4 z-[45] data-direita:right-4 data-direita:left-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-latao/45 bg-tinta/95 py-2 pr-4 pl-3 text-[13px] leading-none font-semibold text-luar no-underline shadow-[0_10px_30px_rgba(7,11,22,.4)] backdrop-blur-md transition-[transform,border-color,background-color,padding] duration-200 ease-luneta hover:border-latao hover:bg-tinta data-compacto:px-3.5 data-compacto:hover:pr-4 data-compacto:hover:pl-3 data-compacto:focus-visible:pr-4 data-compacto:focus-visible:pl-3 motion-reduce:transition-none print:hidden [[data-theme=light]_&]:shadow-[0_8px_24px_rgba(15,24,48,.16)]"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-latao-texto">
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      {/* encolhido, o nome fica para o leitor de tela (largura 0, ainda no texto do link) e volta no mouse e no foco */}
      <span className="ml-2 inline-block max-w-[13rem] overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ease-luneta group-data-compacto:ml-0 group-data-compacto:max-w-0 group-data-compacto:opacity-0 group-data-compacto:group-hover:ml-2 group-data-compacto:group-hover:max-w-[13rem] group-data-compacto:group-hover:opacity-100 group-data-compacto:group-focus-visible:ml-2 group-data-compacto:group-focus-visible:max-w-[13rem] group-data-compacto:group-focus-visible:opacity-100 motion-reduce:transition-none">
        Voltar à apresentação
      </span>
    </Link>
  );
}
