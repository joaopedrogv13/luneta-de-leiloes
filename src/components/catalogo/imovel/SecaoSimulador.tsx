"use client";

import { Simulador, type EntradaSimulador } from "@/components/simulador";
import type { ReferenciaM2 } from "@/lib/catalogo/tipos";
import { useImovel } from "./ContextoImovel";

/**
 * Seção 3, simulador de rentabilidade (o componente traz o próprio h2). No Lente fica aberto por enquanto
 * (decisão pendente do dono); o convite à Luneta aparece onde as tags fariam falta (dívidas apontadas).
 */
export function SecaoSimulador({ imovel, referencias }: { imovel: EntradaSimulador; referencias: ReferenciaM2[] }) {
  const { plano, pedirLuneta } = useImovel();
  return (
    <div id="simulador" data-secao-imovel="simulador" className="scroll-mt-3">
      <Simulador
        imovel={imovel}
        referencias={referencias}
        plano={plano}
        aoPedirLuneta={() => pedirLuneta(document.activeElement instanceof HTMLElement ? document.activeElement : null)}
      />
    </div>
  );
}
