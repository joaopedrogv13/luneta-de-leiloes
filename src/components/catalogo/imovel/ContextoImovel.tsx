"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UpgradeModal } from "@/components/assinante/UpgradeModal";
import { useFavoritos } from "@/components/catalogo/useFavoritos";
import { rotaImovel } from "@/lib/catalogo/rotas";
import type { Conjunto, Plano } from "@/lib/catalogo/tipos";
import { IconeCheck } from "./icones";

interface ValorContexto {
  conjunto: Conjunto;
  plano: Plano;
  /** id do imóvel da página */
  id: string;
  /** abre o convite à Luneta (plano Lente); o foco volta para quem abriu */
  pedirLuneta: (abridor: HTMLElement | null) => void;
  /** aviso curto no rodapé da tela ("Link copiado") */
  avisar: (texto: string) => void;
  ehFavorito: (id: string) => boolean;
  /** liga/desliga o favorito e avisa o que aconteceu */
  alternarFavorito: (id: string) => void;
}

const Contexto = createContext<ValorContexto | null>(null);

export function useImovel(): ValorContexto {
  const v = useContext(Contexto);
  if (!v) throw new Error("useImovel: fora do ProvedorImovel");
  return v;
}

const DURACAO_AVISO = 4200;

/**
 * Estado compartilhado da página do imóvel: plano, favoritos (no navegador, por conjunto), o convite à
 * Luneta (UpgradeModal) e o aviso curto (toast, anunciado ao leitor de tela). "Assinar Luneta" troca a
 * demonstração para a Luneta: a página volta do servidor com as tags e o selo, e o foco vai para o título
 * da seção de onde o convite foi aberto.
 */
export function ProvedorImovel({ conjunto, plano, id, children }: { conjunto: Conjunto; plano: Plano; id: string; children: ReactNode }) {
  const router = useRouter();
  const { ehFavorito, alternar } = useFavoritos(conjunto);
  const [convite, setConvite] = useState(false);
  const abridor = useRef<HTMLElement | null>(null);
  const focarDepois = useRef<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const avisar = useCallback((texto: string) => {
    window.clearTimeout(timer.current);
    setAviso((a) => ({ texto, n: (a?.n ?? 0) + 1 }));
    timer.current = window.setTimeout(() => setAviso(null), DURACAO_AVISO);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const pedirLuneta = useCallback((el: HTMLElement | null) => {
    abridor.current = el;
    setConvite(true);
  }, []);

  const alternarFavorito = useCallback(
    (idImovel: string) => {
      const virou = alternar(idImovel);
      avisar(virou ? "Favoritado. Você será avisado por e-mail quando a praça mudar (demonstração)." : "Removido dos favoritos.");
    },
    [alternar, avisar],
  );

  const assinar = () => {
    // a seção de onde veio o convite (riscos, simulador...): o foco volta para o título dela, já na Luneta
    focarDepois.current = abridor.current?.closest<HTMLElement>("[data-secao-imovel]")?.dataset.secaoImovel ?? null;
    setConvite(false);
    router.replace(rotaImovel(conjunto, id, "luneta"), { scroll: false });
  };

  useEffect(() => {
    if (plano !== "luneta" || !focarDepois.current) return;
    const secao = focarDepois.current;
    focarDepois.current = null;
    requestAnimationFrame(() => {
      const alvo =
        document.getElementById(`${secao}-titulo`) ?? document.querySelector<HTMLElement>(`[data-secao-imovel="${CSS.escape(secao)}"] :is(h2, h3)`);
      if (!alvo) return;
      if (!alvo.hasAttribute("tabindex")) alvo.setAttribute("tabindex", "-1");
      alvo.focus({ preventScroll: true });
    });
  }, [plano]);

  const valor = useMemo<ValorContexto>(
    () => ({ conjunto, plano, id, pedirLuneta, avisar, ehFavorito, alternarFavorito }),
    [conjunto, plano, id, pedirLuneta, avisar, ehFavorito, alternarFavorito],
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      <UpgradeModal open={convite} openerRef={abridor} onClose={() => setConvite(false)} onUpgrade={assinar} />
      {/* sempre no DOM (vazio sem aviso): a região viva precisa existir antes da mensagem para ser anunciada */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 lg:bottom-8"
      >
        {aviso && (
          <p
            key={aviso.n}
            className="pointer-events-auto flex max-w-[min(30rem,100%)] items-start gap-2.5 rounded-2xl border border-latao/45 bg-tinta px-4 py-3 text-sm leading-snug text-luar shadow-[0_18px_50px_rgba(7,11,22,.45)] transition-[opacity,translate] duration-200 ease-luneta starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none [[data-theme=light]_&]:shadow-[0_14px_40px_rgba(15,24,48,.18)]"
          >
            <IconeCheck tamanho={18} className="mt-px text-latao-texto" />
            {aviso.texto}
          </p>
        )}
      </div>
    </Contexto.Provider>
  );
}
