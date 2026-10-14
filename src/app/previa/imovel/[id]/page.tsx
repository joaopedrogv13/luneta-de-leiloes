import type { Metadata } from "next";
import { metadadosImovel, renderizarImovel } from "@/components/catalogo/imovel/rota";

/**
 * Página de um imóvel real da prévia (INTERNA: noindex/nofollow, fora do sitemap). Dados do instantâneo em
 * base/saida/site; `?plano=lente` mostra a página como no plano Lente (sem tags nem selo nos dados).
 */
export function generateMetadata(props: PageProps<"/previa/imovel/[id]">): Promise<Metadata> {
  return metadadosImovel("previa", props);
}

export default function PreviaImovelPage(props: PageProps<"/previa/imovel/[id]">) {
  return renderizarImovel("previa", props);
}
