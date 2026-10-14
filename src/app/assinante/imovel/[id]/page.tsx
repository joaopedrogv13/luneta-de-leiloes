import type { Metadata } from "next";
import { metadadosImovel, renderizarImovel } from "@/components/catalogo/imovel/rota";

/**
 * Página de um exemplo fictício da demonstração (/assinante). Nunca indexada; `?plano=lente` mostra a
 * página como no plano Lente (sem tags nem selo nos dados).
 */
export function generateMetadata(props: PageProps<"/assinante/imovel/[id]">): Promise<Metadata> {
  return metadadosImovel("exemplos", props);
}

export default function AssinanteImovelPage(props: PageProps<"/assinante/imovel/[id]">) {
  return renderizarImovel("exemplos", props);
}
