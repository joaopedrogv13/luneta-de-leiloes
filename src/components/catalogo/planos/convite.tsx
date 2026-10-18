"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { UpgradeModal } from "@/components/assinante/UpgradeModal";
import type { Recurso } from "@/lib/catalogo/tipos";

/**
 * Abre a janela "Estes recursos são da Luneta" (UpgradeModal) com o texto do recurso; o foco volta para `abridor` quando
 * ela fecha. Sem recurso, o texto padrão (tudo o que a Luneta tem).
 */
export type PedirLuneta = (abridor: HTMLElement | null, recurso?: Recurso | null) => void;

const Contexto = createContext<PedirLuneta | null>(null);

/** Quem tem a janela (a página do imóvel, o catálogo) oferece o pedido aos RecursoLuneta de dentro. */
export const ProvedorPedirLuneta = Contexto.Provider;

/** O pedido da janela, ou null fora de um provedor. */
export function usePedirLuneta(): PedirLuneta | null {
  return useContext(Contexto);
}

/**
 * Para uma página que não tem a janela própria (o relatório travado do Lente): a janela e o pedido. "Assinar Luneta"
 * (na demonstração, sem pagamento) troca a página pela versão da Luneta (`hrefLuneta`).
 */
export function ConviteLuneta({ hrefLuneta, children }: { hrefLuneta: string; children: ReactNode }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [recurso, setRecurso] = useState<Recurso | null>(null);
  const abridor = useRef<HTMLElement | null>(null);
  const pedir = useCallback<PedirLuneta>((el, r) => {
    abridor.current = el;
    setRecurso(r ?? null);
    setAberto(true);
  }, []);
  return (
    <Contexto.Provider value={pedir}>
      {children}
      <UpgradeModal
        open={aberto}
        recurso={recurso}
        openerRef={abridor}
        onClose={() => setAberto(false)}
        onUpgrade={() => {
          setAberto(false);
          router.replace(hrefLuneta);
        }}
      />
    </Contexto.Provider>
  );
}
