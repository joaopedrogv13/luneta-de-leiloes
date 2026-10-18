"use client";

import dynamic from "next/dynamic";
import type { EntradaSimulador } from "@/components/simulador";
import type { ReferenciaM2 } from "@/lib/catalogo/tipos";
import { useImovel } from "./ContextoImovel";

/**
 * O simulador num pedaço de JavaScript à parte (next/dynamic, com a primeira pintura no servidor): só é baixado quando
 * a seção é desenhada, e a página só a desenha no plano Luneta (no Lente vai SecaoSimuladorTravada, sem o código do
 * simulador). Enquanto o pedaço chega (navegação no navegador), um bloco da mesma altura segura o lugar.
 */
const Simulador = dynamic(() => import("@/components/simulador/Simulador").then((m) => m.Simulador), {
  loading: () => <div aria-hidden="true" className="h-[640px] animate-pulse rounded-3xl border border-nevoa/15 bg-tinta motion-reduce:animate-none" />,
});

/** Seção 3, simulador de rentabilidade (o componente traz o próprio h2). Só no plano Luneta (planos.ts). */
export function SecaoSimulador({ imovel, referencias }: { imovel: EntradaSimulador; referencias: ReferenciaM2[] }) {
  const { plano, pedirLuneta } = useImovel();
  return (
    <div id="simulador" data-secao-imovel="simulador" className="scroll-mt-3">
      <Simulador
        imovel={imovel}
        referencias={referencias}
        plano={plano}
        aoPedirLuneta={(abridor) => pedirLuneta(abridor ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null), "tags")}
      />
    </div>
  );
}
