import { garantirImovel } from "@/components/catalogo/imovel/carregar";

/** Confere o id antes do esqueleto de carregamento: imóvel inexistente responde 404 de verdade. */
export default async function LayoutImovelPrevia({ children, params }: LayoutProps<"/previa/imovel/[id]">) {
  await garantirImovel("previa", params);
  return children;
}
