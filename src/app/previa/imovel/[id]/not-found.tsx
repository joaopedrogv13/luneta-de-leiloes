import { NaoEncontrado } from "@/components/catalogo/imovel/NaoEncontrado";

/** Id que não existe (ou saiu do catálogo): 404 com o caminho de volta à lista. */
export default function ImovelNaoEncontrado() {
  return <NaoEncontrado conjunto="previa" />;
}
