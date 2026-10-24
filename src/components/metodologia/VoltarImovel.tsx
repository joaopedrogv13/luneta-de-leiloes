"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { conjuntoDoMetodo, idDeImovelValido } from "@/lib/catalogo/nota-texto";
import { lerPlano } from "@/lib/catalogo/planos";
import { rotaImovel } from "@/lib/catalogo/rotas";

/**
 * "Voltar ao imóvel" da página do método, quando ela foi aberta a partir de um imóvel (?de=<id>, e ?plano=lente no
 * Lente): volta à seção Localização dele. A página é estática; o link nasce no navegador (fica dentro de um Suspense).
 * Id fora do formato do catálogo não vira link.
 */
export function VoltarImovel({ className = "", rotulo = "Voltar ao imóvel" }: { className?: string; rotulo?: string }) {
  const sp = useSearchParams();
  const id = sp.get("de");
  if (!idDeImovelValido(id)) return null;
  const conjunto = conjuntoDoMetodo(id, sp.get("c"));
  const href = `${rotaImovel(conjunto, id, lerPlano(sp.get("plano")))}#localizacao`;
  return (
    <Link href={href} prefetch={false} className={className}>
      <span aria-hidden="true">←&nbsp;</span>
      {rotulo}
    </Link>
  );
}
