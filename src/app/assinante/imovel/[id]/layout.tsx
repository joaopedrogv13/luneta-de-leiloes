import { garantirImovel } from "@/components/catalogo/imovel/rota";

/** Confere o id antes do esqueleto de carregamento: exemplo inexistente responde 404 de verdade. */
export default async function LayoutImovelAssinante({ children, params }: LayoutProps<"/assinante/imovel/[id]">) {
  await garantirImovel("exemplos", params);
  return children;
}
