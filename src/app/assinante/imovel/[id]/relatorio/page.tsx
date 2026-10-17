import type { Metadata } from "next";
import { metadadosRelatorio, renderizarRelatorio } from "@/components/catalogo/relatorio/rota";

/**
 * Relatório em PDF de um exemplo fictício da demonstração (/assinante). Nunca indexado. A simulação usa os ajustes
 * guardados no navegador; `?plano=lente` tira as tags; `?imprimir=1` abre a impressão.
 */
export function generateMetadata(props: PageProps<"/assinante/imovel/[id]/relatorio">): Promise<Metadata> {
  return metadadosRelatorio("exemplos", props);
}

export default function AssinanteRelatorioPage(props: PageProps<"/assinante/imovel/[id]/relatorio">) {
  return renderizarRelatorio("exemplos", props);
}
