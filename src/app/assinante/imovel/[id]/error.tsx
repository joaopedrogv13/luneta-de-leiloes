"use client";

import { ErroImovel } from "@/components/catalogo/imovel/ErroImovel";

/** Falha ao montar a página do imóvel: aviso com "Tentar de novo". */
export default function ErroPaginaImovel({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErroImovel conjunto="exemplos" erro={error} tentarDeNovo={retry} />;
}
