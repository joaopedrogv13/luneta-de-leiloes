"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "@/components/catalogo/ui/Popover";
import { IconeSetaDireita, IconeSetaEsquerda } from "./icones";
import { linhaDeLeitura } from "./rolagem";

/** Computador (lg): as abas que não cabem vão para "Mais ▾" (com o resumo aberto, em 1024 px, a fila não cabia). */
const CONSULTA_COMPUTADOR = "(min-width: 64rem)";
/** Espaço reservado para o botão "Mais ▾" (px). */
const LARGURA_MAIS = 104;
const GAP = 4;

export interface SecaoNav {
  id: string;
  rotulo: string;
}

/** Botão de rolar a fila de lado (só no mouse: no toque, a fila rola com o dedo; no teclado, o Tab leva até cada aba). */
function SetaFila({ lado, onClick }: { lado: "esq" | "dir"; onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={onClick}
      className={`absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-nevoa/25 bg-noite text-nevoa shadow-[0_2px_10px_rgba(0,0,0,.25)] transition-colors hover:border-latao hover:text-luar pointer-fine:grid [[data-theme=light]_&]:shadow-[0_2px_10px_rgba(15,24,48,.12)] ${
        lado === "esq" ? "left-0" : "right-0"
      }`}
    >
      {lado === "esq" ? <IconeSetaEsquerda tamanho={16} /> : <IconeSetaDireita tamanho={16} />}
    </button>
  );
}

/**
 * Navegação interna fixa (Resumo · Riscos · Localização · Simulador · Região · Documentos · Fonte · Parecidos):
 * âncoras comuns (funcionam sem JS) com a seção atual marcada (aria-current) enquanto a página rola. Quando as abas
 * não cabem no celular e no tablet, a fila rola de lado: as pontas esmaecem para mostrar que há mais abas, o mouse
 * ganha setas, e a seção atual fica sempre à vista. No computador (com o resumo aberto, de 1024 a ~1200 px), as que
 * não cabem vão para um "Mais ▾" no fim da fila (com o nome da seção atual, quando ela está lá dentro).
 */
export function NavSecoes({ secoes }: { secoes: SecaoNav[] }) {
  const [atual, setAtual] = useState<string>(secoes[0]?.id ?? "");
  const lista = useRef<HTMLUListElement>(null);
  const caixa = useRef<HTMLElement>(null);
  /** quantas abas aparecem na fila (as outras, em "Mais"); no celular e no tablet, todas */
  const [cabem, setCabem] = useState(secoes.length);
  const larguras = useRef<number[]>([]);

  useEffect(() => {
    const nav = caixa.current;
    const ul = lista.current;
    if (!nav || !ul) return;
    const mq = window.matchMedia(CONSULTA_COMPUTADOR);
    const medir = () => {
      if (!mq.matches) {
        setCabem(secoes.length);
        return;
      }
      // a largura natural de cada aba, medida enquanto todas estão na fila (uma vez; a fonte não muda)
      const itens = Array.from(ul.querySelectorAll<HTMLElement>("[data-secao]"));
      if (larguras.current.length !== secoes.length || larguras.current.some((w) => !w)) {
        if (itens.length !== secoes.length || itens.some((li) => li.offsetWidth === 0)) {
          setCabem(secoes.length);
          return;
        }
        larguras.current = itens.map((li) => li.offsetWidth);
      }
      const disponivel = nav.clientWidth;
      const total = larguras.current.reduce((s, w, k) => s + w + (k ? GAP : 0), 0);
      if (total <= disponivel) {
        setCabem(secoes.length);
        return;
      }
      let soma = 0;
      let k = 0;
      for (; k < larguras.current.length; k++) {
        const proxima = soma + larguras.current[k]! + (k ? GAP : 0);
        if (proxima > disponivel - LARGURA_MAIS) break;
        soma = proxima;
      }
      setCabem(Math.max(1, k));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(nav);
    mq.addEventListener("change", medir);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", medir);
    };
  }, [secoes.length]);
  const fora = secoes.slice(cabem);
  const atualFora = fora.find((s) => s.id === atual);
  // há abas escondidas à esquerda / à direita da fila?
  const [pontas, setPontas] = useState({ esq: false, dir: false });

  useEffect(() => {
    const ul = lista.current;
    if (!ul) return;
    const medir = () => {
      const esq = ul.scrollLeft > 2;
      const dir = ul.scrollLeft + ul.clientWidth < ul.scrollWidth - 2;
      setPontas((p) => (p.esq === esq && p.dir === dir ? p : { esq, dir }));
    };
    medir();
    ul.addEventListener("scroll", medir, { passive: true });
    // a largura muda com a janela e quando o resumo da direita recolhe ou abre
    const ro = new ResizeObserver(medir);
    ro.observe(ul);
    return () => {
      ul.removeEventListener("scroll", medir);
      ro.disconnect();
    };
  }, []);

  const rolarFila = (sentido: 1 | -1) => {
    const ul = lista.current;
    if (!ul) return;
    ul.scrollBy({ left: sentido * ul.clientWidth * 0.7, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const mascara = `linear-gradient(to right, transparent 0, #000 ${pontas.esq ? "44px" : "0px"}, #000 calc(100% - ${pontas.dir ? "52px" : "0px"}), transparent 100%)`;

  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      let achada = secoes[0]?.id ?? "";
      // linha de leitura: logo abaixo do cabeçalho e desta barra (a seção que passou dela é a atual)
      const linha = linhaDeLeitura();
      for (const s of secoes) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= linha) achada = s.id;
      }
      // no fim da página, a última seção (curta) também conta
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) achada = secoes[secoes.length - 1]?.id ?? achada;
      setAtual(achada);
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
    };
  }, [secoes]);

  // a seção atual sempre à vista na fila (celular), sem mexer na rolagem da página
  useEffect(() => {
    const ul = lista.current;
    const item = ul?.querySelector<HTMLElement>(`[data-secao="${atual}"]`);
    if (!ul || !item || ul.scrollWidth <= ul.clientWidth) return;
    const alvo = item.offsetLeft - (ul.clientWidth - item.offsetWidth) / 2;
    ul.scrollTo({ left: Math.max(0, alvo), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [atual]);

  return (
    <nav ref={caixa} aria-label="Seções da página" className="relative flex items-center gap-1">
      <ul
        ref={lista}
        style={pontas.esq || pontas.dir ? { maskImage: mascara, WebkitMaskImage: mascara } : undefined}
        // com "Mais", a fila não estica: o botão fica logo depois da última aba
        className={`-mx-4 flex min-w-0 gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden ${fora.length ? "" : "flex-1"}`}
      >
        {secoes.map((s, k) => {
          const ativa = s.id === atual;
          return (
            <li key={s.id} data-secao={s.id} className={`shrink-0 ${k >= cabem ? "hidden" : ""}`}>
              <a
                href={`#${s.id}`}
                aria-current={ativa ? "location" : undefined}
                className={`relative inline-flex min-h-11 items-center rounded-full px-3.5 text-[13.5px] font-medium whitespace-nowrap no-underline transition-colors duration-150 pointer-fine:min-h-9 ${
                  ativa ? "bg-latao/15 text-luar ring-1 ring-latao/55" : "text-nevoa hover:bg-nevoa/[0.08] hover:text-luar"
                }`}
              >
                {s.rotulo}
              </a>
            </li>
          );
        })}
      </ul>
      {fora.length > 0 && (
        <Popover
          rotulo="Mais seções"
          posicao="bottom-end"
          largura={220}
          gatilho={{
            ariaLabel: atualFora ? `Mais seções (você está em ${atualFora.rotulo})` : "Mais seções",
            className: (aberto) =>
              `inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3.5 text-[13.5px] font-medium whitespace-nowrap transition-colors duration-150 pointer-fine:min-h-9 ${
                atualFora ? "bg-latao/15 text-luar ring-1 ring-latao/55" : aberto ? "bg-nevoa/[0.08] text-luar" : "text-nevoa hover:bg-nevoa/[0.08] hover:text-luar"
              }`,
            conteudo: (aberto) => (
              <>
                {atualFora ? atualFora.rotulo : "Mais"}
                <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" className={`transition-transform duration-150 motion-reduce:transition-none ${aberto ? "rotate-180" : ""}`}>
                  <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            ),
          }}
        >
          {({ fechar }) => (
            <ul className="flex flex-col p-1.5">
              {fora.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={fechar}
                    aria-current={s.id === atual ? "location" : undefined}
                    className={`flex min-h-11 items-center rounded-xl px-3 text-[14px] no-underline pointer-fine:min-h-10 transition-colors hover:bg-nevoa/[0.08] ${s.id === atual ? "font-semibold text-luar" : "text-luar/90"}`}
                  >
                    {s.rotulo}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      )}
      {pontas.esq && <SetaFila lado="esq" onClick={() => rolarFila(-1)} />}
      {pontas.dir && <SetaFila lado="dir" onClick={() => rolarFila(1)} />}
    </nav>
  );
}
