"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { moeda } from "@/lib/catalogo/rotulos";
import styles from "./imovel.module.css";
import { CHAVE_RESUMO_LATERAL, gravarPreferencia, lerCookie, lerPreferencia, RECOLHIDO } from "./preferencias";

/** id do <aside> do resumo (aria-controls do botão de recolher e da pílula). */
export const ID_RESUMO_LATERAL = "resumo-lateral";
const ID_PILULA = "resumo-pilula";
const ID_RECOLHER = "resumo-recolher";

const CONSULTA_COMPUTADOR = "(min-width: 64rem)";

// Resumo recolhido: localStorage e um cookie de mesmo nome (gravados juntos) e, sem os dois, a memória desta visita.
// Na leitura, o cookie vem primeiro: é o que o servidor usou na primeira pintura, então a página não muda depois de
// hidratar se os dois divergirem (localStorage apagado à mão, por exemplo). Sem cookie (bloqueado), vale o
// localStorage.
const ouvintes = new Set<() => void>();
let naMemoria: boolean | null = null;
function assinarResumo(aviso: () => void) {
  ouvintes.add(aviso);
  return () => {
    ouvintes.delete(aviso);
  };
}
const resumoSalvo = () => naMemoria ?? (lerCookie(CHAVE_RESUMO_LATERAL) ?? lerPreferencia(CHAVE_RESUMO_LATERAL)) === RECOLHIDO;

/** Recolhe ou abre o resumo, guarda a escolha e leva o foco para o controle que fica à vista. */
export function definirResumoRecolhido(recolher: boolean) {
  naMemoria = recolher;
  gravarPreferencia(CHAVE_RESUMO_LATERAL, recolher ? RECOLHIDO : null, { cookie: true });
  for (const f of ouvintes) f();
  requestAnimationFrame(() => document.getElementById(recolher ? ID_PILULA : ID_RECOLHER)?.focus({ preventScroll: true }));
}

const Recolhido = createContext(false);

/** O resumo da direita está recolhido? */
export const useResumoRecolhido = () => useContext(Recolhido);

function assinarLargura(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_COMPUTADOR);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

/** Computador (lg, 1024 px ou mais): o resumo fica na coluna da direita e pode ser recolhido. */
export function useComputador(): boolean {
  return useSyncExternalStore(assinarLargura, () => window.matchMedia(CONSULTA_COMPUTADOR).matches, () => false);
}

/**
 * A grade da página (conteúdo à esquerda, resumo à direita no computador). Com o resumo recolhido, ganha
 * `data-resumo="recolhido"`: o CSS (imovel.module.css) leva a coluna do resumo a 0 com transição e mostra a
 * pílula. No servidor e na hidratação vale o cookie que a página leu (a primeira pintura já sai certa); depois, o
 * localStorage.
 */
export function GradeImovel({ recolhidoNoServidor, className = "", children }: { recolhidoNoServidor: boolean; className?: string; children: ReactNode }) {
  const recolhido = useSyncExternalStore(assinarResumo, resumoSalvo, () => recolhidoNoServidor);
  return (
    <Recolhido.Provider value={recolhido}>
      <div data-resumo={recolhido ? RECOLHIDO : undefined} className={`${styles.grade} ${className}`}>
        {children}
      </div>
    </Recolhido.Provider>
  );
}

/**
 * A coluna do resumo (computador: fixa à direita e recolhível). Recolhida, fica inerte (fora do Tab e do leitor de
 * tela) enquanto o CSS a esconde e a coluna do conteúdo se alarga. No celular nunca é inerte (lá não recolhe).
 */
export function LateralRecolhivel({ children }: { children: ReactNode }) {
  const recolhido = useResumoRecolhido();
  const computador = useComputador();
  return (
    <aside id={ID_RESUMO_LATERAL} aria-label="Resumo do preço e ações" inert={recolhido && computador} className={`min-w-0 ${styles.lateral}`}>
      <div className={styles.lateralConteudo}>{children}</div>
    </aside>
  );
}

/** Ícone "painel à direita": recolher (seta para a direita) ou abrir (seta para a esquerda). */
export function IconePainel({ abrir = false, tamanho = 18 }: { abrir?: boolean; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <rect x="2.8" y="3.8" width="14.4" height="12.4" rx="2.2" />
      <path d="M12.6 3.8v12.4" />
      <path d={abrir ? "M8.6 8 6.6 10l2 2" : "M6.6 8l2 2-2 2"} />
    </svg>
  );
}

/** Botão discreto no canto do resumo (só no computador): recolhe o resumo. */
export function BotaoRecolher() {
  return (
    <button
      id={ID_RECOLHER}
      type="button"
      aria-expanded={true}
      aria-controls={ID_RESUMO_LATERAL}
      aria-label="Recolher o resumo do preço"
      title="Recolher o resumo"
      onClick={() => definirResumoRecolhido(true)}
      className="absolute top-3 right-3 hidden size-9 cursor-pointer place-items-center rounded-full text-nevoa transition-colors duration-150 hover:bg-nevoa/10 hover:text-luar lg:grid"
    >
      <IconePainel />
    </button>
  );
}

/**
 * Com o resumo recolhido (computador), a pílula fixa na barra das seções: "Lance R$ 25.100 · −90%" e o ícone de
 * abrir. Tocar nela traz o resumo de volta. Escondida pelo CSS enquanto o resumo está aberto e no celular.
 */
export function PilulaResumo({ lance, desagio, precoFixo = false }: { lance: number; desagio: number | null; /** venda direta: "Preço", não "Lance" */ precoFixo?: boolean }) {
  const recolhido = useResumoRecolhido();
  const computador = useComputador();
  const abaixo = desagio !== null && desagio > 0;
  // celular deitado (tela baixa, sem a barra do lance no pé): a pílula leva ao cartão do preço, logo abaixo do título
  const irAoResumo = () => {
    const alvo = document.getElementById(ID_RESUMO_LATERAL);
    alvo?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const primeiro = Array.from(alvo?.querySelectorAll<HTMLElement>("a[href], button") ?? []).find((el) => el.getClientRects().length > 0);
    primeiro?.focus({ preventScroll: true });
  };
  return (
    <button
      id={ID_PILULA}
      type="button"
      aria-expanded={computador ? false : undefined}
      aria-controls={ID_RESUMO_LATERAL}
      tabIndex={recolhido || !computador ? 0 : -1}
      onClick={() => (computador ? definirResumoRecolhido(false) : irAoResumo())}
      className={`${styles.pilula} min-h-9 shrink-0 pointer-coarse:min-h-11 cursor-pointer items-center gap-2 rounded-full border border-latao/45 bg-tinta py-1 pr-2 pl-3.5 text-[13px] leading-none whitespace-nowrap text-luar transition-colors duration-150 hover:border-latao hover:bg-latao/10 [[data-theme=light]_&]:shadow-[0_4px_14px_-6px_rgba(15,24,48,.25)]`}
    >
      <span className="text-nevoa">{precoFixo ? "Preço" : "Lance"}</span>
      <span className="font-display font-bold tracking-[-0.01em] tabular-nums">{moeda(lance)}</span>
      {abaixo && (
        <span className="font-semibold text-latao-texto tabular-nums">
          · −{desagio}%<span className="sr-only"> da avaliação</span>
        </span>
      )}
      <span className="sr-only">. {computador ? "Mostrar o resumo do preço" : "Ir ao preço e às ações"}</span>
      <span aria-hidden="true" className="ml-0.5 grid size-7 place-items-center rounded-full bg-nevoa/10 text-nevoa">
        <IconePainel abrir tamanho={16} />
      </span>
    </button>
  );
}
