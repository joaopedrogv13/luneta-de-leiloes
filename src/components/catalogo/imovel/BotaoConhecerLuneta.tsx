"use client";

import { useImovel } from "./ContextoImovel";

/** "Conhecer a Luneta": abre o convite (UpgradeModal) a partir de um recurso travado do plano Lente. */
export function BotaoConhecerLuneta({ rotulo = "Conhecer a Luneta", className = "" }: { rotulo?: string; className?: string }) {
  const { pedirLuneta } = useImovel();
  return (
    <button type="button" aria-haspopup="dialog" onClick={(e) => pedirLuneta(e.currentTarget)} className={`btn-primary mt-1 ${className}`}>
      {rotulo}
    </button>
  );
}
