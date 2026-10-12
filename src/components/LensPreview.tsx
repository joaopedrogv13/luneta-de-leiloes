import { PorDentro } from "@/components/por-dentro/PorDentro";
import { PREVIEW_CARDS, PreviewGrid } from "@/components/por-dentro/PreviewGrid";

/**
 * "Por dentro, depois de assinar": a mesma lista nas visões Lente (desfocada) e Luneta.
 * A Lente vem pronta do servidor (é a que aparece primeiro e a que os buscadores leem); as duas cópias
 * nítidas que a varredura usa são montadas no cliente, só quando a seção se aproxima da tela.
 */
export function LensPreview() {
  return <PorDentro cards={PREVIEW_CARDS} lente={<PreviewGrid locked />} />;
}
