"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UpgradeModal } from "@/components/assinante/UpgradeModal";
import { ProvedorPedirLuneta, type PedirLuneta } from "@/components/catalogo/planos/convite";
import { useFavoritos } from "@/components/catalogo/useFavoritos";
import { rotaImovel } from "@/lib/catalogo/rotas";
import { TOAST_FAVORITADO } from "@/lib/catalogo/produto";
import type { Conjunto, Plano, Recurso } from "@/lib/catalogo/tipos";
import { IconeCheck } from "./icones";
import { guardarAncora, restaurarAncora } from "./rolagem";

interface ValorContexto {
  conjunto: Conjunto;
  plano: Plano;
  /** id do imóvel da página */
  id: string;
  /** abre o convite à Luneta (plano Lente), com o texto do recurso; o foco volta para quem abriu */
  pedirLuneta: PedirLuneta;
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
  const [recurso, setRecurso] = useState<Recurso | null>(null);
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

  const pedirLuneta = useCallback<PedirLuneta>((el, r) => {
    abridor.current = el;
    setRecurso(r ?? null);
    setConvite(true);
  }, []);

  const alternarFavorito = useCallback(
    (idImovel: string) => {
      const virou = alternar(idImovel);
      avisar(virou ? TOAST_FAVORITADO : "Removido dos favoritos.");
    },
    [alternar, avisar],
  );

  const assinar = () => {
    // a seção de onde veio o convite (riscos, simulador...): o foco volta para o título dela, já na Luneta
    focarDepois.current = abridor.current?.closest<HTMLElement>("[data-secao-imovel]")?.dataset.secaoImovel ?? null;
    guardarAncora();
    setConvite(false);
    router.replace(rotaImovel(conjunto, id, "luneta"), { scroll: false });
  };

  // trocou de plano ("Ver como" ou "Assinar Luneta"): a seção que estava à vista volta ao mesmo lugar da tela
  useLayoutEffect(() => {
    restaurarAncora();
  }, [plano]);

  useEffect(() => {
    // ainda no Lente (um plano acima da Luneta também vê tudo: não compara com "luneta")
    if (plano === "lente" || !focarDepois.current) return;
    const secao = focarDepois.current;
    focarDepois.current = null;
    // o simulador chega num pedaço de JavaScript à parte (next/dynamic): o título dele pode aparecer uns quadros depois
    let tentativas = 0;
    let espera = 0;
    const focar = () => {
      const alvo =
        document.getElementById(`${secao}-titulo`) ?? document.querySelector<HTMLElement>(`[data-secao-imovel="${CSS.escape(secao)}"] :is(h2, h3)`);
      if (!alvo) {
        if (++tentativas < 40) espera = window.setTimeout(focar, 100);
        return;
      }
      if (!alvo.hasAttribute("tabindex")) alvo.setAttribute("tabindex", "-1");
      alvo.focus({ preventScroll: true });
    };
    const quadro = requestAnimationFrame(focar);
    return () => {
      cancelAnimationFrame(quadro);
      window.clearTimeout(espera);
    };
  }, [plano]);

  const valor = useMemo<ValorContexto>(
    () => ({ conjunto, plano, id, pedirLuneta, avisar, ehFavorito, alternarFavorito }),
    [conjunto, plano, id, pedirLuneta, avisar, ehFavorito, alternarFavorito],
  );

  return (
    <Contexto.Provider value={valor}>
      {/* os RecursoLuneta da página (chamadas no lugar do simulador, da região, da nota) abrem a mesma janela */}
      <ProvedorPedirLuneta value={pedirLuneta}>{children}</ProvedorPedirLuneta>
      <UpgradeModal open={convite} recurso={recurso} openerRef={abridor} onClose={() => setConvite(false)} onUpgrade={assinar} />
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
