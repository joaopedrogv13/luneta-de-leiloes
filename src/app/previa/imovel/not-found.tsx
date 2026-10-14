import { NaoEncontrado } from "@/components/catalogo/imovel/NaoEncontrado";

/** 404 vindo do layout de /previa/imovel/[id] (id inexistente). */
export default function ImovelNaoEncontrado() {
  return <NaoEncontrado conjunto="previa" />;
}
