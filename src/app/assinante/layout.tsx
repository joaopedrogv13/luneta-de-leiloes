import { VoltarApresentacao } from "@/components/apresentacao/VoltarApresentacao";

/**
 * Toda a demonstração (/assinante, a página de cada exemplo e o relatório): o botão "Voltar à apresentação" para quem
 * veio da landing por um link (rodada 5, ponto 10; some no relatório e para quem entrou direto). No começo da ordem do
 * Tab (a posição na tela é fixa, no canto de baixo): no fim, depois de toda a página, eram 49 a 64 Tabs até ele
 * (revisão final da rodada 5, R5P-04).
 */
export default function LayoutAssinante({ children }: LayoutProps<"/assinante">) {
  return (
    <>
      <VoltarApresentacao />
      {children}
    </>
  );
}
