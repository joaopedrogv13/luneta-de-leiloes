import type { Metadata } from "next";
import { metadadosRelatorio, renderizarRelatorio } from "@/components/catalogo/relatorio/rota";

/**
 * Relatório em PDF de um imóvel real da prévia (INTERNA: noindex/nofollow). A simulação usa os ajustes guardados
 * no navegador pelo simulador da página do imóvel; `?plano=lente` tira as tags; `?imprimir=1` abre a impressão.
 */
export function generateMetadata(props: PageProps<"/previa/imovel/[id]/relatorio">): Promise<Metadata> {
  return metadadosRelatorio("previa", props);
}

export default function PreviaRelatorioPage(props: PageProps<"/previa/imovel/[id]/relatorio">) {
  return renderizarRelatorio("previa", props);
}
