import { VoltarApresentacao } from "@/components/apresentacao/VoltarApresentacao";

/** A página do método da nota: o mesmo "Voltar à apresentação" da demonstração, para quem veio da landing (rodada 5). */
export default function LayoutMetodologia({ children }: LayoutProps<"/metodologia">) {
  return (
    <>
      <VoltarApresentacao />
      {children}
    </>
  );
}
